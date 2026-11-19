// Rooms for missions: walls, doors and cover as axis-aligned boxes in metres (x east, z north), plus a small
// graph of waypoints for finding a way between rooms. Bodies are circles that slide along walls; shots,
// strikes and Telekinesis need a clear line; a closed door is a wall. Pure and deterministic.

/**
 * walls: [{ x0, z0, x1, z1 }]; doors: [{ id, x0, z0, x1, z1, open }]; cover: low boxes that also block
 * (crates, consoles); nav: { nodes: { id: { x, z } }, edges: [[a, b, doorId?]] } (an edge through a closed
 * door cannot be walked).
 */
export function createLevel({ walls = [], doors = [], cover = [], nav = { nodes: {}, edges: [] }, bounds = null } = {}) {
  const norm = (b) => ({ ...b, x0: Math.min(b.x0, b.x1), x1: Math.max(b.x0, b.x1), z0: Math.min(b.z0, b.z1), z1: Math.max(b.z0, b.z1) });
  const level = {
    walls: walls.map(norm),
    cover: cover.map(norm),
    doors: new Map(doors.map((d) => [d.id, { ...norm(d), open: !!d.open }])),
    nav: { nodes: nav.nodes, edges: nav.edges },
    bounds,
    solidCache: null,
  };
  return level;
}

/** Everything that blocks right now: walls, cover and closed doors. */
export function solids(level) {
  if (!level.solidCache) level.solidCache = [...level.walls, ...level.cover, ...[...level.doors.values()].filter((d) => !d.open)];
  return level.solidCache;
}

export function setDoor(level, id, open) {
  const door = level.doors.get(id);
  if (!door || door.open === !!open) return false;
  door.open = !!open;
  level.solidCache = null;
  return true;
}

/** Push a circle (a body) out of whatever it overlaps. Returns true if it touched something. */
export function resolveCircle(level, body, radius) {
  let touched = false;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of solids(level)) {
      const nx = Math.max(b.x0, Math.min(body.x, b.x1));
      const nz = Math.max(b.z0, Math.min(body.z, b.z1));
      let dx = body.x - nx;
      let dz = body.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      touched = true;
      moved = true;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        body.x = nx + (dx / d) * radius;
        body.z = nz + (dz / d) * radius;
      } else {
        // the centre is inside the box: leave by the nearest face
        const left = body.x - b.x0, right = b.x1 - body.x, down = body.z - b.z0, up = b.z1 - body.z;
        const m = Math.min(left, right, down, up);
        if (m === left) body.x = b.x0 - radius;
        else if (m === right) body.x = b.x1 + radius;
        else if (m === down) body.z = b.z0 - radius;
        else body.z = b.z1 + radius;
        dx = 0; dz = 0;
      }
    }
    if (!moved) break;
  }
  return touched;
}

/** How far along a ray (from, unit dir) the first solid is, up to max (Infinity: nothing in the way). */
export function rayDistance(level, from, dir, max = Infinity) {
  let best = Infinity;
  for (const b of solids(level)) {
    let t0 = 0;
    let t1 = max;
    let hit = true;
    for (const [o, d, lo, hi] of [[from.x, dir.x, b.x0, b.x1], [from.z, dir.z, b.z0, b.z1]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { hit = false; break; } continue; }
      let a = (lo - o) / d;
      let c = (hi - o) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) { hit = false; break; }
    }
    if (hit && t0 < best) best = t0;
  }
  return best;
}

/** Is the straight line between two points clear of walls, cover and closed doors? */
export function clearLine(level, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  return rayDistance(level, a, { x: dx / d, z: dz / d }, d) >= d - 1e-6;
}

/**
 * The next point to walk to on the way from `from` to `to`: `to` itself when the line is clear, else the
 * first waypoint of the shortest walkable route through the graph (null when there is none).
 */
export function nextStep(level, from, to) {
  if (clearLine(level, from, to)) return to;
  const { nodes, edges } = level.nav;
  const ids = Object.keys(nodes);
  if (!ids.length) return null;
  const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const reach = (p) => ids.filter((id) => clearLine(level, p, nodes[id]));
  const starts = reach(from);
  const goals = new Set(reach(to));
  if (!starts.length || !goals.size) return null;
  const open = (e) => !e[2] || level.doors.get(e[2])?.open;
  // Dijkstra over a handful of nodes
  const cost = new Map(starts.map((id) => [id, dist(from, nodes[id])]));
  const prev = new Map();
  const done = new Set();
  for (;;) {
    let cur = null;
    for (const [id, c] of cost) if (!done.has(id) && (cur === null || c < cost.get(cur))) cur = id;
    if (cur === null) return null;
    if (goals.has(cur)) {
      // the route's waypoints in order; skip any the walker already stands on
      const path = [];
      for (let id = cur; id !== undefined; id = prev.get(id)) path.unshift(id);
      for (const id of path) if (dist(from, nodes[id]) > 0.9) return nodes[id];
      return to;
    }
    done.add(cur);
    for (const e of edges) {
      if (!open(e)) continue;
      const other = e[0] === cur ? e[1] : e[1] === cur ? e[0] : null;
      if (!other || done.has(other)) continue;
      const c = cost.get(cur) + dist(nodes[cur], nodes[other]);
      if (!cost.has(other) || c < cost.get(other)) { cost.set(other, c); prev.set(other, cur); }
    }
  }
}
