// Tileable value noise for cave textures, plus a 3D field for sculpted geometry.
// 2D noise is periodic on integer periods so a texture can repeat without a seam.

export function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function hash2(x, y, seed) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + (seed | 0);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function hash3(x, y, z, seed) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440671231) + (seed | 0);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function wrapPeriod(value, period) {
  const m = value % period;
  return m < 0 ? m + period : m;
}

export function valueNoise(x, y, seed, period) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const x1 = wrapPeriod(x0 + 1, period);
  const y1 = wrapPeriod(y0 + 1, period);
  const wx0 = wrapPeriod(x0, period);
  const wy0 = wrapPeriod(y0, period);
  const a = hash2(wx0, wy0, seed);
  const b = hash2(x1, wy0, seed);
  const c = hash2(wx0, y1, seed);
  const d = hash2(x1, y1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

/** u and v are 0..1 across one tile. The field matches at the opposite edges. */
export function fbm(u, v, seed, octaves = 5, basePeriod = 4) {
  let amplitude = 0.5;
  let sum = 0;
  let value = 0;
  let period = basePeriod;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += amplitude * valueNoise(u * period, v * period, seed + octave * 1013, period);
    sum += amplitude;
    amplitude *= 0.5;
    period *= 2;
  }
  return value / sum;
}

export function ridged(u, v, seed, octaves = 5, basePeriod = 3) {
  return 1 - Math.abs(fbm(u, v, seed, octaves, basePeriod) * 2 - 1);
}

export function valueNoise3(x, y, z, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const tz = fade(z - z0);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  const v000 = hash3(x0, y0, z0, seed);
  const v100 = hash3(x1, y0, z0, seed);
  const v010 = hash3(x0, y1, z0, seed);
  const v110 = hash3(x1, y1, z0, seed);
  const v001 = hash3(x0, y0, z1, seed);
  const v101 = hash3(x1, y0, z1, seed);
  const v011 = hash3(x0, y1, z1, seed);
  const v111 = hash3(x1, y1, z1, seed);
  const x00 = lerp(v000, v100, tx);
  const x10 = lerp(v010, v110, tx);
  const x01 = lerp(v001, v101, tx);
  const x11 = lerp(v011, v111, tx);
  return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
}

export function fbm3(x, y, z, seed, octaves = 4) {
  let amplitude = 0.5;
  let sum = 0;
  let value = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += amplitude * valueNoise3(x * frequency, y * frequency, z * frequency, seed + octave * 131);
    sum += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / sum;
}

/** Worley / cellular field. `f1` is the distance to the nearest site, `edge` is the cell border. */
export function worley(u, v, cells, seed) {
  const gx = u * cells;
  const gy = v * cells;
  const cx = Math.floor(gx);
  const cy = Math.floor(gy);
  let d1 = 8;
  let d2 = 8;
  let id = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const ix = cx + ox;
      const iy = cy + oy;
      const wx = ((ix % cells) + cells) % cells;
      const wy = ((iy % cells) + cells) % cells;
      const px = ix + hash2(wx, wy, seed);
      const py = iy + hash2(wx, wy, seed + 97);
      const dx = gx - px;
      const dy = gy - py;
      const d = dx * dx + dy * dy;
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash2(wx, wy, seed + 13);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return { f1: Math.sqrt(d1), edge: Math.sqrt(d2) - Math.sqrt(d1), id };
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
