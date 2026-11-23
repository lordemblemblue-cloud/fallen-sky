// Places: the pure part. No Three.js, so all of it runs in node tests.
//
// A layout (layouts/*.mjs) describes each place with its centre in LOCAL
// Wolfveil metres and its pieces relative to that centre. This module turns
// that into instances (where each piece stands), 4x4 matrices in the column
// order Three.js uses, the level of detail to draw each one at, and the
// circles and boxes that push the player out of solid pieces.
import { valleyKitPiece } from '../kits/valleyKitPieces.mjs';
import { empireKitPiece } from '../kits/empireKitPieces.mjs';

// A piece of any kit: the valley's (the default) or an empire's.
export const kitPieceOf = (kit, id) => (!kit || kit === 'valley' ? valleyKitPiece(id) : empireKitPiece(kit, id));

// Level of detail by distance from the player, in metres.
//   nearer than `near`  : LOD0
//   up to `far`         : LOD1 (the low-poly version)
//   beyond `far`        : not drawn, unless the piece is a landmark (LOD1)
// `hysteresis` keeps a piece on its level until it is this far past the line,
// so a player standing on the line does not make it blink.
export const PLACE_LOD = Object.freeze({ near: 60, far: 150, hysteresis: 4 });

export function lodForDistance(distance, landmark = false, previous = null, lod = PLACE_LOD) {
  if (!Number.isFinite(distance)) return landmark ? 1 : -1;
  const pad = Number.isInteger(previous) ? lod.hysteresis : 0;
  // Leaving a level needs `pad` metres past its line; entering needs none.
  const nearLine = previous === 0 ? lod.near + pad : lod.near - (previous === 1 || previous === -1 ? pad : 0);
  if (distance < nearLine) return 0;
  if (landmark) return 1;
  const farLine = previous === -1 ? lod.far - pad : lod.far + (previous === 1 ? pad : 0);
  return distance < farLine ? 1 : -1;
}

// One piece entry of a layout, made absolute: local x/z of the place's
// centre plus the entry's offset. `y` is the height of the piece's origin
// above the ground under it.
export function placeInstances(place) {
  const out = [];
  for (const entry of place.pieces || []) {
    const kitName = entry.kit || 'valley';
    const kit = kitPieceOf(kitName, entry.piece);
    out.push(Object.freeze({
      placeId: place.id,
      area: place.area,
      kit: kitName,
      piece: entry.piece,
      x: place.x + (entry.x || 0),
      z: place.z + (entry.z || 0),
      y: entry.y || 0,
      yaw: entry.yaw || 0,
      pitch: entry.pitch || 0,
      roll: entry.roll || 0,
      scale: entry.scale || 1,
      tint: entry.tint ?? null,
      landmark: Boolean(entry.landmark),
      spin: entry.spin || 0,
      // On the river: y is above the water, not the ground.
      afloat: Boolean(entry.afloat),
      // How far the piece carries on below its base (posts, a plinth, a bank's
      // foot): it may stand that much above the lowest ground under it.
      skirt: kit?.skirt || 0,
      // 'high': stands on the highest ground under it (a stage on a lip,
      // reaching out over a drop).
      groundMode: entry.ground || null,
      // Big pieces stand on the lowest ground under their footprint, so no
      // corner floats on a slope; small ones on the ground under their pivot,
      // and so does anything marked `ground: 'pivot'` (a mound sinks well).
      footprint: kit && entry.ground !== 'pivot' && Math.max(kit.size[0], kit.size[1]) * (entry.scale || 1) > 2.5
        ? [kit.size[0] * (entry.scale || 1) / 2, kit.size[1] * (entry.scale || 1) / 2] : null,
    }));
  }
  return out;
}

// The ground points sampled for one instance: its pivot and, for a big
// piece, the four corners of its footprint (turned with it).
export function groundSamplePoints(instance) {
  const points = [[instance.x, instance.z]];
  if (!instance.footprint) return points;
  const [hx, hz] = instance.footprint;
  const c = Math.cos(instance.yaw), s = Math.sin(instance.yaw);
  for (const [ax, az] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]])
    points.push([instance.x + c * ax + s * az, instance.z - s * ax + c * az]);
  return points;
}

// The height a piece stands at; null when the ground is not there yet.
// With no skirt: the lowest of the sampled heights, so no corner floats.
// With a skirt: as high as the highest corner, but never more than the skirt
// above the lowest one, so the skirt always reaches the ground downhill and the
// uphill side is buried only where the slope is steeper than the skirt allows.
// A piece on a lip ('high') stands on the highest ground under it.
export function groundUnder(instance, heightAt) {
  let low = Infinity, high = -Infinity;
  for (const [x, z] of groundSamplePoints(instance)) {
    const y = heightAt(x, z);
    if (!Number.isFinite(y)) return null;
    if (y < low) low = y;
    if (y > high) high = y;
  }
  if (instance.groundMode === 'high') return high;
  return Math.min(high, low + (instance.skirt || 0));
}

// How much of a piece's footprint the ground buries on its uphill side (0 when
// its skirt covers the slope): the survey reports pieces where this is large.
export function groundBuried(instance, heightAt) {
  let low = Infinity, high = -Infinity;
  for (const [x, z] of groundSamplePoints(instance)) {
    const y = heightAt(x, z);
    if (!Number.isFinite(y)) return null;
    low = Math.min(low, y); high = Math.max(high, y);
  }
  return instance.groundMode === 'high' ? 0 : Math.max(0, high - low - (instance.skirt || 0));
}

// Column-major 4x4 (Three.js Matrix4.elements order) for
// translate(x, groundY + y, z) * rotateY(yaw) * rotateX(pitch) * rotateZ(roll) * scale.
export function instanceMatrix(instance, groundY, out = new Array(16), offset = 0) {
  const cy = Math.cos(instance.yaw), sy = Math.sin(instance.yaw);
  const cx = Math.cos(instance.pitch), sx = Math.sin(instance.pitch);
  const cz = Math.cos(instance.roll), sz = Math.sin(instance.roll);
  const k = instance.scale;
  // R = Ry * Rx * Rz, written out.
  const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
  const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
  const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
  out[offset + 0] = r00 * k; out[offset + 1] = r10 * k; out[offset + 2] = r20 * k; out[offset + 3] = 0;
  out[offset + 4] = r01 * k; out[offset + 5] = r11 * k; out[offset + 6] = r21 * k; out[offset + 7] = 0;
  out[offset + 8] = r02 * k; out[offset + 9] = r12 * k; out[offset + 10] = r22 * k; out[offset + 11] = 0;
  out[offset + 12] = instance.x; out[offset + 13] = groundY + instance.y; out[offset + 14] = instance.z; out[offset + 15] = 1;
  return out;
}

// ---- Collision ---------------------------------------------------------
// Solid pieces push the player out. Shapes are in LOCAL metres, turned and
// scaled like their instance; `top` is the height of the piece's top, so a
// player standing above it (on a roof, say) is left alone.
export function solidFor(instance, groundY = 0) {
  const kit = kitPieceOf(instance.kit, instance.piece);
  if (!kit?.solid) return null;
  const k = instance.scale;
  const top = groundY + instance.y + kit.size[2] * k;
  if (kit.solid.circle) return { kind: 'circle', x: instance.x, z: instance.z, r: kit.solid.circle * k, top, piece: instance.piece };
  const [hx, hz] = kit.solid.box;
  return {
    kind: 'box', x: instance.x, z: instance.z, hx: hx * k, hz: hz * k,
    cos: Math.cos(instance.yaw), sin: Math.sin(instance.yaw), top, piece: instance.piece,
  };
}

// Moves `p` ({x, z}, local) out of one solid shape, keeping `radius` from it.
// Returns true when it moved the point.
export function pushOutOfSolid(solid, p, radius) {
  if (solid.kind === 'circle') {
    const dx = p.x - solid.x, dz = p.z - solid.z, reach = solid.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= reach * reach) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-6) { p.x = solid.x + reach; return true; }
    p.x = solid.x + dx / d * reach; p.z = solid.z + dz / d * reach;
    return true;
  }
  // Into the box's own frame: rotateY(yaw) maps local (a, b) to
  // world (c*a + s*b, -s*a + c*b), so the inverse is (c*dx - s*dz, s*dx + c*dz).
  const dx = p.x - solid.x, dz = p.z - solid.z;
  const c = solid.cos, s = solid.sin;
  let a = c * dx - s * dz, b = s * dx + c * dz;
  const qa = Math.max(-solid.hx, Math.min(solid.hx, a)), qb = Math.max(-solid.hz, Math.min(solid.hz, b));
  const ea = a - qa, eb = b - qb;
  const out2 = ea * ea + eb * eb;
  if (out2 > 0) {
    if (out2 >= radius * radius) return false;
    const d = Math.sqrt(out2);
    a = qa + ea / d * radius; b = qb + eb / d * radius;
  } else {
    // Inside: leave by the nearest face.
    const toA = solid.hx - Math.abs(a), toB = solid.hz - Math.abs(b);
    if (toA < toB) a = (a < 0 ? -1 : 1) * (solid.hx + radius);
    else b = (b < 0 ? -1 : 1) * (solid.hz + radius);
  }
  p.x = solid.x + c * a + s * b;
  p.z = solid.z - s * a + c * b;
  return true;
}

// Solids sorted into square cells so a step only tests what is near it.
export function createSolidGrid(solids, cell = 16) {
  const cells = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const solid of solids) {
    const reach = solid.kind === 'circle' ? solid.r : Math.hypot(solid.hx, solid.hz);
    const i0 = Math.floor((solid.x - reach) / cell), i1 = Math.floor((solid.x + reach) / cell);
    const j0 = Math.floor((solid.z - reach) / cell), j1 = Math.floor((solid.z + reach) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(solid);
    }
  }
  return {
    cell, count: solids.length,
    near(x, z) { return cells.get(key(Math.floor(x / cell), Math.floor(z / cell))) || EMPTY; },
  };
}
const EMPTY = Object.freeze([]);

// Pushes `p` (local {x, z}, feet at `y`) out of every solid near it. Two
// passes settle a point caught between two pieces. True when it moved.
export function resolveAgainstGrid(grid, p, radius, y = -Infinity) {
  let moved = false;
  for (let pass = 0; pass < 2; pass++) {
    let any = false;
    for (const solid of grid.near(p.x, p.z)) {
      if (y > solid.top - 0.2) continue;
      if (pushOutOfSolid(solid, p, radius)) any = true;
    }
    if (!any) break;
    moved = true;
  }
  return moved;
}

// ---- Checks the tests and the build share --------------------------------
export function pieceReach(entry) {
  const kit = kitPieceOf(entry.kit, entry.piece);
  if (!kit) return 0;
  return Math.hypot(kit.size[0], kit.size[1]) / 2 * (entry.scale || 1);
}
