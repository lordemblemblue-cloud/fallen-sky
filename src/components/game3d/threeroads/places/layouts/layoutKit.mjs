// Small helpers the layout files use to write pieces down. Every position is
// relative to the place's centre, in metres; `yaw` is in radians with 0
// meaning the piece's front looks north (+z), as in cast.mjs.
import { THREE_ROADS_EMPIRES } from '../../script/cast.mjs';

// Tints. The three empires' and the valley's colours come from the script;
// the rest are plain materials for pieces drawn with a tint.
export const TINT = Object.freeze({
  akitsu: THREE_ROADS_EMPIRES.akitsu.colour,
  tameri: THREE_ROADS_EMPIRES.tameri.colour,
  remoria: THREE_ROADS_EMPIRES.remoria.colour,
  valley: THREE_ROADS_EMPIRES.valley.colour,
  akitsuTrim: THREE_ROADS_EMPIRES.akitsu.trim,
  tameriTrim: THREE_ROADS_EMPIRES.tameri.trim,
  remoriaTrim: THREE_ROADS_EMPIRES.remoria.trim,
  valleyTrim: THREE_ROADS_EMPIRES.valley.trim,
  canvas: 0xd8ccb0,
  ribbonRed: THREE_ROADS_EMPIRES.remoria.colour,
});
export const EMPIRE_ORDER = Object.freeze(['akitsu', 'tameri', 'remoria']);

// Yaw that makes a piece at (x, z) look toward (tx, tz).
export const facing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

export const p = (piece, x, z, extra = {}) => ({ piece, x, z, ...extra });

// A wagon and its cover, the cover tinted.
export function wagon(x, z, yaw, tint, extra = {}) {
  return [p('wagon', x, z, { yaw, ...extra }), p('wagon_cover', x, z, { yaw, tint, ...extra })];
}

// A banner pole with its cloth hanging from the top, on the pole's +x side
// (turned with `yaw`).
export function banner(x, z, yaw, tint, extra = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw), off = 0.7;
  return [
    p('banner_pole', x, z, { yaw, ...extra }),
    p('banner_cloth', x + c * off, z - s * off, { yaw, y: 5.8, tint, ...extra }),
  ];
}

// A lantern post with one paper lantern hanging from its arm.
export function lanternPost(x, z, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw), off = 0.35;
  return [p('lantern_post', x, z, { yaw }), p('paper_lantern', x + c * off, z - s * off, { yaw, y: 2.5 })];
}

// `n` pieces evenly from (x0, z0) to (x1, z1), each turned along the line
// (plus `turn`).
export function row(piece, x0, z0, x1, z1, n, extra = {}) {
  const out = [];
  const yaw = Math.atan2(x1 - x0, z1 - z0) + (extra.turn || 0);
  const rest = { ...extra };
  delete rest.turn;
  delete rest.jitter;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const j = extra.jitter ? extra.jitter(i) : null;
    out.push(p(piece, x0 + (x1 - x0) * t + (j?.x || 0), z0 + (z1 - z0) * t + (j?.z || 0),
      { yaw: yaw + (j?.yaw || 0), ...rest }));
  }
  return out;
}

// A piece of length `segment` chained along a polyline, each turned along its
// stretch (fences and hedgerows: the piece's length is along its x axis).
export function chain(piece, points, segment, extra = {}) {
  const out = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const [x0, z0] = points[k], [x1, z1] = points[k + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / segment));
    // The piece's length runs along its local x, so turn x onto the line.
    const yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const more = { yaw, ...(extra.scale ? { scale: extra.scale } : {}), ...(extra.at?.(k, i) || {}) };
      out.push(p(piece, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, more));
    }
  }
  return out;
}

// A fence round a rectangle centred at (x, z), `w` by `d`, turned by `yaw`,
// with a gap of `gap` metres in the middle of the side named in `open`
// ('north' | 'south' | 'east' | 'west' | null).
export function fencedRect(x, z, w, d, { yaw = 0, open = null, gap = 3 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (a, b) => [x + c * a + s * b, z - s * a + c * b];
  const hw = w / 2, hd = d / 2, hg = gap / 2;
  const sides = {
    north: [[-hw, hd], [hw, hd]], east: [[hw, hd], [hw, -hd]],
    south: [[hw, -hd], [-hw, -hd]], west: [[-hw, -hd], [-hw, hd]],
  };
  const out = [];
  for (const [name, [[a0, b0], [a1, b1]]] of Object.entries(sides)) {
    if (name === open) {
      const ma = (a0 + a1) / 2, mb = (b0 + b1) / 2;
      const len = Math.hypot(a1 - a0, b1 - b0), ua = (a1 - a0) / len, ub = (b1 - b0) / len;
      out.push(...chain('fence_3m', [at(a0, b0), at(ma - ua * hg, mb - ub * hg)], 3));
      out.push(...chain('fence_3m', [at(ma + ua * hg, mb + ub * hg), at(a1, b1)], 3));
    } else {
      out.push(...chain('fence_3m', [at(a0, b0), at(a1, b1)], 3));
    }
  }
  return out;
}

// A small deterministic jitter, so rows of sheaves or stones are not ruled.
export function wobble(seed, amount = 0.3) {
  const r = n => { const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v) - 0.5; };
  return { x: r(1) * amount, z: r(2) * amount, yaw: r(3) * amount };
}
