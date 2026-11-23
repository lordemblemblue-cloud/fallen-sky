// A walk around what the town's layout names (shops, houses, fountain, trees).
// Pure: a small visibility graph over the corners of the obstacles near the walk,
// searched once when a walk is asked for, never per frame.
import { CAST_FOOT_RADIUS } from './castPlacement.mjs';

const CLEARANCE = 0.45; // beyond the foot radius, so corners are not grazed
const SAMPLE = 0.3;

/** True when the straight walk a -> b touches nothing; the first `skip` metres are not checked. */
export function segmentClear(ax, az, bx, bz, isBlocked, skip = 0) {
  const length = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(length / SAMPLE));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (t * length < skip) continue;
    if (isBlocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

/** Points just outside an obstacle a walker can turn at (world metres). */
export function obstacleCorners(o, radius = CAST_FOOT_RADIUS) {
  const out = [];
  if (o.kind === 'circle') {
    const r = o.radius + radius + CLEARANCE;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      out.push({ x: o.x + Math.sin(a) * r, z: o.z + Math.cos(a) * r });
    }
    return out;
  }
  const scale = o.scale || 1;
  const m = (radius + CLEARANCE) / scale;
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  for (const [lx, lz] of [[o.minX - m, o.minZ - m], [o.maxX + m, o.minZ - m], [o.maxX + m, o.maxZ + m], [o.minX - m, o.maxZ + m]]) {
    const x = lx * scale, z = lz * scale;
    out.push({ x: o.x + x * c + z * s, z: o.z - x * s + z * c });
  }
  return out;
}

/**
 * The shortest walk from `from` to `to` that keeps clear of the obstacles, as a
 * list of points ending at `to` (the start is not included). A straight walk when
 * nothing is in the way; `null` when no way round was found (the caller then walks
 * straight and lets local avoidance deal with it).
 */
export function planWalk(from, to, obstacles, isBlocked, { radius = CAST_FOOT_RADIUS, margin = 15 } = {}) {
  const skip = isBlocked(from.x, from.z) ? 1.2 : 0;
  if (segmentClear(from.x, from.z, to.x, to.z, isBlocked, skip)) return [{ x: to.x, z: to.z }];
  const minX = Math.min(from.x, to.x) - margin, maxX = Math.max(from.x, to.x) + margin;
  const minZ = Math.min(from.z, to.z) - margin, maxZ = Math.max(from.z, to.z) + margin;
  const nodes = [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
  for (const o of obstacles) {
    if (o.x < minX - 20 || o.x > maxX + 20 || o.z < minZ - 20 || o.z > maxZ + 20) continue;
    for (const p of obstacleCorners(o, radius)) {
      if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) continue;
      if (!isBlocked(p.x, p.z)) nodes.push(p);
    }
  }
  // Dijkstra over the visibility graph (tens of nodes).
  const n = nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  const edge = new Map();
  const clear = (i, j) => {
    const key = i < j ? i * n + j : j * n + i;
    if (!edge.has(key)) {
      const a = nodes[i], b = nodes[j];
      edge.set(key, segmentClear(a.x, a.z, b.x, b.z, isBlocked, i === 0 || j === 0 ? skip : 0));
    }
    return edge.get(key);
  };
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const w = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z);
      if (dist[u] + w >= dist[v] || !clear(u, v)) continue;
      dist[v] = dist[u] + w;
      prev[v] = u;
    }
  }
  if (!Number.isFinite(dist[1])) return null;
  const path = [];
  for (let i = 1; i > 0; i = prev[i]) path.unshift({ x: nodes[i].x, z: nodes[i].z });
  return path;
}
