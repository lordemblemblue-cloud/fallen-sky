// Building blocks for a mission's rooms (sim/level.mjs boxes, metres; x east, z north).
export const T = 0.3; // half a wall's thickness

// the stretches of [from, to] left between gaps ([[g0, g1], ...])
export const spans = (from, to, gaps) => {
  const out = [];
  let at = from;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) { if (g0 > at) out.push([at, g0]); at = g1; }
  if (at < to) out.push([at, to]);
  return out;
};
/** A wall along x at z (from x0 to x1), with gaps for doorways. */
export const hWall = (z, x0, x1, gaps = []) => spans(x0, x1, gaps).map(([a, b]) => ({ x0: a, x1: b, z0: z - T, z1: z + T }));
/** A wall along z at x (from z0 to z1), with gaps for doorways. */
export const vWall = (x, z0, z1, gaps = []) => spans(z0, z1, gaps).map(([a, b]) => ({ x0: x - T, x1: x + T, z0: a, z1: b }));
/** A doorway's door in a wall along x (hDoor) or along z (vDoor), from a to b. */
export const hDoor = (id, z, a, b, open = false) => ({ id, x0: a, x1: b, z0: z - T, z1: z + T, open });
export const vDoor = (id, x, a, b, open = false) => ({ id, x0: x - T, x1: x + T, z0: a, z1: b, open });
// cover is a box; its style is only how the client draws it (a crate, a workbench, a desk, a data stack...)
export const cover = (style, half = 0.7) => (x, z) => ({ x0: x - half, x1: x + half, z0: z - half, z1: z + half, style });
