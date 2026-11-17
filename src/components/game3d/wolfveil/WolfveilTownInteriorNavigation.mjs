/**
 * Door-aware navigation for the Wolfveil artisan town. Coordinates are in
 * metres, with Y-up rotations; town geometry stays a visual concern.
 *
 * Importantly we never collide against full building footprints: a wall is
 * solid only at its actual perimeter, leaving all 12 ground-floor entrances
 * accessible. This module has no DOM, rendering or asset dependencies.
 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const S = (x1, z1, x2, z2) => [x1, z1, x2, z2];
export const WOLFVEIL_TOWN_ROOMS = Object.freeze({
  shops: ['blacksmith', 'tailor', 'potion', 'models'],
  residences: 8,
});

const SHOP_WALLS = Object.freeze([
  // Rear wall / left wing
  S(-9.4, -5.4, 8.4, -5.4),
  S(-9.4, -5.4, -9.4, 4.12),
  // Side genkan opens from z=-3.05 through z=-0.25
  S(8.4, -5.4, 8.4, -3.05),
  S(8.4, -0.25, 8.4, 2.05),
  // Front service counter opens around x=3 and left-wing front x=-6
  S(-2.1, 2.05, 1.15, 2.05),
  S(5.25, 2.05, 8.4, 2.05),
  S(-9.4, 4.12, -7.45, 4.12),
  S(-4.15, 4.12, -2.1, 4.12),
]);
const HOME_WALLS = Object.freeze([
  S(-4.46, -2.92, 4.46, -2.92),
  S(-4.46, -2.92, -4.46, 2.92),
  S(4.46, -2.92, 4.46, 2.92),
  // 2.7 m genkan gap in the front at x=-1.35..1.35
  S(-4.46, 2.92, -1.35, 2.92),
  S(1.35, 2.92, 4.46, 2.92),
]);
const SHOP_DOORS = Object.freeze([
  [3.1, 2.05],
  [-5.85, 4.12],
  [8.4, -1.65],
]);

const localPoint = (room, x, z) => {
  const dx = x - room.x, dz = z - room.z;
  const cosine = Math.cos(room.yaw), sine = Math.sin(room.yaw);
  return {
    x: (cosine * dx - sine * dz) / room.scale,
    z: (sine * dx + cosine * dz) / room.scale,
  };
};
const distSqToWall = (x, z, [ax, az, bx, bz]) => {
  const dx = bx - ax, dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / lengthSq, 0, 1) : 0;
  const ox = x - ax - t * dx, oz = z - az - t * dz;
  return ox * ox + oz * oz;
};

export function makeWolfveilTownNavigation({ shops = [], homes = [], fountain = { x: 0, z: 0, radius: 6.55 } } = {}) {
  const regions = [
    ...shops.map(room => ({ ...room, kind: 'shop', walls: SHOP_WALLS })),
    ...homes.map(room => ({ ...room, kind: 'home', walls: HOME_WALLS })),
  ].map(room => ({
    ...room,
    scale: Number.isFinite(room.scale) && room.scale > 0 ? room.scale : 1,
    yaw: Number(room.yaw) || 0,
  }));
  function hitWall(x, z, radius = 0.45) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (Math.hypot(x - fountain.x, z - fountain.z) < fountain.radius + radius) return true;
    for (const room of regions) {
      // Broad phase avoids repeated 2D geometry against distant houses.
      if (Math.hypot(x - room.x, z - room.z) > (room.kind === 'shop' ? 15 : 9) * room.scale + radius) continue;
      const p = localPoint(room, x, z);
      const reach = (radius + 0.12) / room.scale;
      for (const wall of room.walls) {
        if (distSqToWall(p.x, p.z, wall) <= reach * reach) return true;
      }
    }
    return false;
  }
  function crossedWall(fromX, fromZ, toX, toZ, radius = 0.45) {
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    if (!Number.isFinite(length)) return true;
    // Swept character movement: a quick sprint cannot skip straight through
    // a narrow wall even if both movement endpoints look unblocked.
    for (let step = 1, steps = Math.max(1, Math.ceil(length / 0.22)); step <= steps; step++) {
      const t = step / steps;
      if (hitWall(fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t, radius)) return true;
    }
    return false;
  }
  function resolve(position, previous, radius = 0.45) {
    if (!position || !previous || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return false;
    if (!crossedWall(previous.x, previous.z, position.x, position.z, radius)) return false;
    const targetX = position.x, targetZ = position.z;
    if (!crossedWall(previous.x, previous.z, targetX, previous.z, radius)) position.z = previous.z;
    else if (!crossedWall(previous.x, previous.z, previous.x, targetZ, radius)) position.x = previous.x;
    else { position.x = previous.x; position.z = previous.z; }
    return true;
  }
  function nearestShop(position, range = 3) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
    let closest = null, bestDistance = Infinity;
    for (const room of regions) {
      if (room.kind !== 'shop') continue;
      const p = localPoint(room, position.x, position.z);
      const inside = p.x > -9.1 && p.x < 8.1 && p.z > -5.15 && p.z < 3.95;
      const nearestDoor = Math.min(...SHOP_DOORS.map(([x, z]) => Math.hypot(p.x - x, p.z - z))) * room.scale;
      if (!inside && nearestDoor > range) continue;
      if (nearestDoor < bestDistance) {
        bestDistance = nearestDoor;
        closest = { id: room.id, label: room.label, inside, distance: nearestDoor };
      }
    }
    return closest;
  }
  function roomAt(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
    for (const room of regions) {
      const p = localPoint(room, position.x, position.z);
      if (room.kind === 'shop' && p.x > -9.0 && p.x < 8 && p.z > -5.0 && p.z < 1.9) return {id:room.id,kind:room.kind};
      if (room.kind === 'home' && Math.abs(p.x) < 4.0 && Math.abs(p.z) < 2.5) return {id:room.id,kind:room.kind};
    }
    return null;
  }
  return {
    rooms: regions.map(({id,label,kind,x,z}) => ({id,label,kind,x,z})),
    roomAt,
    isSolid: hitWall,
    resolveCollision: resolve,
    nearestShop,
    report: { shopCount: shops.length, walkableHomes: homes.length, doorwayCollision: true, coarseWholeHouseBarriers: false },
  };
}
