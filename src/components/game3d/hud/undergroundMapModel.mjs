// Pure geometry for the Wolfveil UNDERGROUND map layer.
// Every room, tunnel and surface exit comes from the same layout the walkable
// floors and collision use, so the chart can never show a route that does not
// physically exist. Wolfveil-local coordinates (world = local Z + 70).
import {
  WOLFVEIL_CAVE_CORRIDORS,
  WOLFVEIL_CAVE_HUB,
  WOLFVEIL_EXPLORABLE_CAVES,
} from '../wolfveil/WolfveilCaveLayout.mjs';

export const UNDERGROUND_EXITS = Object.freeze(
  WOLFVEIL_EXPLORABLE_CAVES.map(cave => Object.freeze({
    id: 'exit:' + cave.id,
    caveId: cave.id,
    name: cave.name,
    x: cave.threshold[0],
    y: cave.threshold[1],
    z: cave.threshold[2],
  })),
);

const exitByCave = Object.fromEntries(UNDERGROUND_EXITS.map(exit => [exit.caveId, exit]));

export const UNDERGROUND_ROOMS = Object.freeze([
  ...WOLFVEIL_EXPLORABLE_CAVES.map(cave => {
    const exit = exitByCave[cave.id];
    return Object.freeze({
      id: cave.chamber.id,
      name: cave.name,
      theme: cave.theme,
      kind: 'cave',
      caveId: cave.id,
      exitId: exit.id,
      x: cave.chamber.x,
      y: cave.chamber.y,
      z: cave.chamber.z,
      radius: cave.chamber.radius,
      depth: exit.y - cave.chamber.y,
    });
  }),
  Object.freeze({
    id: WOLFVEIL_CAVE_HUB.id,
    name: WOLFVEIL_CAVE_HUB.name,
    theme: WOLFVEIL_CAVE_HUB.theme,
    kind: 'hub',
    caveId: null,
    exitId: null,
    x: WOLFVEIL_CAVE_HUB.x,
    y: WOLFVEIL_CAVE_HUB.y,
    z: WOLFVEIL_CAVE_HUB.z,
    radius: WOLFVEIL_CAVE_HUB.radius,
    depth: WOLFVEIL_EXPLORABLE_CAVES.reduce(
      (sum, cave) => sum + (cave.threshold[1] - WOLFVEIL_CAVE_HUB.y), 0,
    ) / WOLFVEIL_EXPLORABLE_CAVES.length,
  }),
]);

const nearestRoom = (x, z) => UNDERGROUND_ROOMS.reduce((best, room) => {
  const distance = Math.hypot(room.x - x, room.z - z);
  return !best || distance < best.distance ? { id: room.id, distance } : best;
}, null);

export const UNDERGROUND_LINKS = Object.freeze(
  WOLFVEIL_CAVE_CORRIDORS.map(corridor => {
    const first = corridor.waypoints[0];
    const last = corridor.waypoints[corridor.waypoints.length - 1];
    const from = corridor.kind === 'entry'
      ? 'exit:' + corridor.id.replace(/^entry_/, '')
      : nearestRoom(first[0], first[2])?.id ?? null;
    const to = nearestRoom(last[0], last[2])?.id ?? null;
    return Object.freeze({
      id: corridor.id,
      kind: corridor.kind,
      from,
      to,
      points: Object.freeze(corridor.waypoints.map(point => Object.freeze([point[0], point[2]]))),
    });
  }),
);

const xs = [], zs = [];
for (const room of UNDERGROUND_ROOMS) {
  xs.push(room.x - room.radius, room.x + room.radius);
  zs.push(room.z - room.radius, room.z + room.radius);
}
for (const link of UNDERGROUND_LINKS) {
  for (const point of link.points) { xs.push(point[0]); zs.push(point[1]); }
}

export const UNDERGROUND_BOUNDS = Object.freeze({
  minX: Math.min(...xs) - 18,
  maxX: Math.max(...xs) + 18,
  minZ: Math.min(...zs) - 18,
  maxZ: Math.max(...zs) + 18,
});

const spanX = UNDERGROUND_BOUNDS.maxX - UNDERGROUND_BOUNDS.minX;
const spanZ = UNDERGROUND_BOUNDS.maxZ - UNDERGROUND_BOUNDS.minZ;

export function projectUnderground(x, z) {
  return {
    x: (Number(x) - UNDERGROUND_BOUNDS.minX) / spanX * 1000,
    y: (UNDERGROUND_BOUNDS.maxZ - Number(z)) / spanZ * 1000,
  };
}

export const undergroundMetresToMap = metres => metres / spanX * 1000;

/**
 * Walkable route from a position to the nearest usable surface exit, following
 * the real corridors. Returns null when the position is not in the network.
 */
export function planUndergroundExitRoute(x, z) {
  if (![x, z].every(Number.isFinite)) return null;
  const start = nearestRoom(x, z);
  if (!start) return null;
  let nearest = null;
  for (const exit of UNDERGROUND_EXITS) {
    const distance = Math.hypot(exit.x - x, exit.z - z);
    if (!nearest || distance < nearest.distance) nearest = { exit, distance };
  }
  if (!nearest) return null;

  const adjacency = new Map();
  const link = (from, to, corridor) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push({ next: to, corridor });
  };
  for (const corridor of UNDERGROUND_LINKS) {
    if (!corridor.from || !corridor.to) continue;
    link(corridor.from, corridor.to, corridor);
    link(corridor.to, corridor.from, corridor);
  }

  const target = nearest.exit.id;
  const queue = [start.id];
  const cameFrom = new Map([[start.id, null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current === target) break;
    for (const step of adjacency.get(current) || []) {
      if (cameFrom.has(step.next)) continue;
      cameFrom.set(step.next, { from: current, corridor: step.corridor });
      queue.push(step.next);
    }
  }
  if (!cameFrom.has(target)) {
    return { exit: nearest.exit, points: [], distance: nearest.distance };
  }

  const legs = [];
  for (let node = target; node && cameFrom.get(node); node = cameFrom.get(node).from) {
    legs.unshift({ ...cameFrom.get(node), to: node });
  }
  const points = [];
  for (const leg of legs) {
    const forward = leg.corridor.from === leg.from;
    const line = forward ? leg.corridor.points : [...leg.corridor.points].reverse();
    for (const point of line) {
      const last = points[points.length - 1];
      if (last && Math.hypot(last[0] - point[0], last[1] - point[1]) < 0.05) continue;
      points.push(point);
    }
  }
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    distance += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return { exit: nearest.exit, points, distance };
}