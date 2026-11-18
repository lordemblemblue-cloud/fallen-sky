// Where enchantment light may live on a piece, computed from what the piece already has.
// The fitted armor GLBs ship one base-colour texture and no emissive/normal/metal maps, so the
// masks are derived once per piece (handoff "MaterialMask"):
//   1. ornament mask: the painted engraving, filigree, gold and silver trim of the base colour
//      texture (luminance edges + metal tones), rank-normalised so the shader can light an exact
//      share of the texels per rarity. Never the whole material.
//   2. trim mask (the geometry fallback): open borders (hems, cuffs, collars, plate edges) and
//      sharp creases of the mesh itself.
//   3. flow: where the light starts on the piece and which way it travels (chest: from the
//      sternum outwards; gloves: wrist to fingertips; legs, boots, cape: top down; weapons: grip
//      to tip). Computed in the bind pose, so the light never slides on a skinned or cloth mesh.
// Pure typed-array code: no three.js, no DOM. Importable from node tests.

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Atlas padding: glTF / Tripo atlases fill the space between UV islands with pure black. Those
// texels belong to no surface; they never rank, never light and never make an island border look
// like an engraving.
export const ATLAS_PADDING_LEVEL = 3;

// Mid-rank CDF over the texels that belong to the piece (used[i] = 1): out[i] = share of used texels
// weaker than value[i] plus half of its own tie group. Ties share one middle rank, so a flat or
// featureless texture sits at 0.5 and lights nothing; padding stays 0.
function rankNormalize(values, used, bins = 1024) {
  const n = values.length;
  let max = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (!used[i]) continue;
    count++;
    if (values[i] > max) max = values[i];
  }
  const out = new Uint8Array(n);
  if (!(max > 0) || !count) return out;
  const hist = new Uint32Array(bins);
  const scale = (bins - 1) / max;
  for (let i = 0; i < n; i++) if (used[i]) hist[Math.min(bins - 1, Math.floor(values[i] * scale))]++;
  const cdf = new Float32Array(bins);
  let run = 0;
  for (let b = 0; b < bins; b++) { cdf[b] = (run + hist[b] / 2) / count; run += hist[b]; }
  for (let i = 0; i < n; i++) if (used[i]) out[i] = Math.round(cdf[Math.min(bins - 1, Math.floor(values[i] * scale))] * 255);
  return out;
}

// Mean of src over the used texels in a (2r+1)^2 window (separable running sums, O(n)).
function localMeanUsed(src, used, width, height, r) {
  const sumH = new Float32Array(src.length);
  const cntH = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    let sum = 0; let cnt = 0;
    const row = y * width;
    for (let x = 0; x <= Math.min(r, width - 1); x++) if (used[row + x]) { sum += src[row + x]; cnt++; }
    for (let x = 0; x < width; x++) {
      sumH[row + x] = sum; cntH[row + x] = cnt;
      const add = x + r + 1; const drop = x - r;
      if (add < width && used[row + add]) { sum += src[row + add]; cnt++; }
      if (drop >= 0 && used[row + drop]) { sum -= src[row + drop]; cnt--; }
    }
  }
  const out = new Float32Array(src.length);
  for (let x = 0; x < width; x++) {
    let sum = 0; let cnt = 0;
    for (let y = 0; y <= Math.min(r, height - 1); y++) { sum += sumH[y * width + x]; cnt += cntH[y * width + x]; }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = cnt > 0 ? sum / cnt : 0;
      const add = y + r + 1; const drop = y - r;
      if (add < height) { sum += sumH[add * width + x]; cnt += cntH[add * width + x]; }
      if (drop >= 0) { sum -= sumH[drop * width + x]; cnt -= cntH[drop * width + x]; }
    }
  }
  return out;
}

/**
 * Ornament mask from an RGBA image (Uint8ClampedArray / Uint8Array, row-major, top row first).
 * Returns Uint8Array(width * height): 255 * (share of the piece's texels with a weaker ornament
 * score), so "value > 255 * (1 - coverage)" selects the strongest `coverage` share of the piece's
 * own surface. Padding texels are 0.
 */
export function computeOrnamentMask(rgba, width, height) {
  const n = width * height;
  if (!rgba || !n || rgba.length < n * 4) return new Uint8Array(Math.max(0, n));
  const lum = new Float32Array(n);
  const tone = new Float32Array(n);
  const used = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r8 = rgba[i * 4]; const g8 = rgba[i * 4 + 1]; const b8 = rgba[i * 4 + 2];
    used[i] = Math.max(r8, g8, b8) > ATLAS_PADDING_LEVEL ? 1 : 0;
    const r = r8 / 255; const g = g8 / 255; const b = b8 / 255;
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const sat = max > 1e-4 ? chroma / max : 0;
    let hue = 0;
    if (chroma > 1e-4) {
      if (max === r) hue = 60 * (((g - b) / chroma) % 6);
      else if (max === g) hue = 60 * ((b - r) / chroma + 2);
      else hue = 60 * ((r - g) / chroma + 4);
      if (hue < 0) hue += 360;
    }
    // gold / brass inlay and bright silver or white trim
    const gold = hue >= 26 && hue <= 64 ? smooth(0.22, 0.55, sat) * smooth(0.32, 0.72, max) : 0;
    const bright = smooth(0.6, 0.95, max) * (1 - 0.6 * sat);
    tone[i] = Math.max(gold, bright * 0.75);
  }
  // Sobel edge strength of the luminance inside the piece's own texels: a neighbour in the padding
  // repeats the centre texel, so UV island borders never read as engraving.
  const edge = new Float32Array(n);
  let edgeMax = 0;
  let usedCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!used[i]) continue;
      usedCount++;
      const c = lum[i];
      const at = (xx, yy) => {
        const j = Math.min(height - 1, Math.max(0, yy)) * width + Math.min(width - 1, Math.max(0, xx));
        return used[j] ? lum[j] : c;
      };
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const m = Math.sqrt(gx * gx + gy * gy);
      edge[i] = m;
      if (m > edgeMax) edgeMax = m;
    }
  }
  if (!usedCount) return new Uint8Array(n);
  // Normalise edges by their 97th percentile so one hard seam cannot flatten the rest.
  let edgeRef = edgeMax;
  if (edgeMax > 0) {
    const bins = 512;
    const hist = new Uint32Array(bins);
    for (let i = 0; i < n; i++) if (used[i]) hist[Math.min(bins - 1, Math.floor((edge[i] / edgeMax) * (bins - 1)))]++;
    let run = 0;
    for (let b = 0; b < bins; b++) {
      run += hist[b];
      if (run >= usedCount * 0.97) { edgeRef = Math.max(1e-6, ((b + 1) / bins) * edgeMax); break; }
    }
  }
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) e[i] = used[i] && edgeRef > 0 ? Math.min(1, edge[i] / edgeRef) : 0;
  // Salience: an engraved line stands out from its surroundings; an all-over busy pattern does not.
  const local = localMeanUsed(e, used, width, height, 6);
  const score = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!used[i]) continue;
    const salience = Math.min(1, (e[i] * e[i]) / (local[i] + 0.12));
    score[i] = 0.5 * salience + 0.35 * tone[i] + 0.15 * e[i] * tone[i];
  }
  // A 3x3 blur over the piece's texels so lit texels form continuous channels, not speckle.
  const blurred = new Float32Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!used[i]) continue;
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (!used[j]) continue;
          sum += score[j];
          count++;
        }
      }
      // keep the centre texel's own strength dominant: lines stay crisp
      blurred[i] = 0.55 * score[i] + 0.45 * (sum / count);
    }
  }
  return rankNormalize(blurred, used);
}

/**
 * An artist-authored mask (a piece's own emissive texture): the painted brightness is used as is.
 * A texel lights when its value >= 1 - coverage(rarity), so grey levels are a rarity knob:
 * white = every rarity, ~0.93 = Rare and up, ~0.89 = Elite and up, ~0.85 = Legendary only, black = never.
 */
export function computeAuthoredMask(rgba, width, height) {
  const n = width * height;
  const out = new Uint8Array(Math.max(0, n));
  if (!rgba || rgba.length < n * 4) return out;
  for (let i = 0; i < n; i++) {
    out[i] = Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); // the brightest channel: tinted masks still count
  }
  return out;
}

const vec = (p, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
// A dense mesh with more than this share of crease vertices is treated as noisy (a sculpt or a
// generated mesh is "sharp" almost everywhere) and only its open borders count as trim. Low-poly
// hard-surface pieces keep their creases: there every crease is a real plate edge.
export const MAX_CREASE_SHARE = 0.3;
export const LOW_POLY_VERTICES = 1500;

/**
 * Trim and flow attributes for one mesh.
 * positions: Float32Array (x,y,z per vertex, the mesh's own bind-pose space: +Y up, +Z front for
 *            the fitted armor); indices: index array or null (non-indexed triangles).
 * flow: 'sternum_out' | 'wrist_out' | 'top_down' | 'axis' (+ axis: {origin:[x,y,z], dir:[x,y,z],
 *       length, symmetric}) for weapons, in the same space as `positions`.
 * Returns { trim: Float32Array, flow: Float32Array } with one value per vertex in [0, 1].
 */
export function computeEnchantGeometryAttributes({ positions, indices = null, flow = 'top_down', axis = null, creaseDegrees = 38 } = {}) {
  const vertexCount = Math.floor((positions?.length || 0) / 3);
  const trim = new Float32Array(vertexCount);
  const flowOut = new Float32Array(vertexCount);
  if (!vertexCount) return { trim, flow: flowOut };

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vertexCount; v++) {
    for (let k = 0; k < 3; k++) {
      const c = positions[v * 3 + k];
      if (c < min[k]) min[k] = c;
      if (c > max[k]) max[k] = c;
    }
  }
  const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;

  // Weld split vertices (UV seams, hard normals) so only real openings count as borders.
  const eps = Math.max(1e-7, diag * 1e-5);
  const weldOf = new Uint32Array(vertexCount);
  const keyToId = new Map();
  let welded = 0;
  for (let v = 0; v < vertexCount; v++) {
    const key = `${Math.round(positions[v * 3] / eps)},${Math.round(positions[v * 3 + 1] / eps)},${Math.round(positions[v * 3 + 2] / eps)}`;
    let id = keyToId.get(key);
    if (id === undefined) { id = welded++; keyToId.set(key, id); }
    weldOf[v] = id;
  }

  const triCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  const corner = (t, c) => (indices ? indices[t * 3 + c] : t * 3 + c);
  const normals = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const a = vec(positions, corner(t, 0));
    const b = vec(positions, corner(t, 1));
    const c = vec(positions, corner(t, 2));
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    normals[t * 3] = nx; normals[t * 3 + 1] = ny; normals[t * 3 + 2] = nz;
  }
  // undirected welded edges -> faces using them
  const edges = new Map();
  for (let t = 0; t < triCount; t++) {
    for (let c = 0; c < 3; c++) {
      const a = weldOf[corner(t, c)];
      const b = weldOf[corner(t, (c + 1) % 3)];
      if (a === b) continue;
      const key = a < b ? a * welded + b : b * welded + a;
      const entry = edges.get(key);
      if (entry) entry.push(t); else edges.set(key, [t]);
    }
  }
  const cosCrease = Math.cos((creaseDegrees * Math.PI) / 180);
  const border = new Uint8Array(welded);
  const crease = new Uint8Array(welded);
  for (const [key, faces] of edges) {
    const a = Math.floor(key / welded);
    const b = key - a * welded;
    if (faces.length === 1) { border[a] = 1; border[b] = 1; continue; } // open border: hem, cuff, collar, plate edge
    if (faces.length !== 2) continue; // non-manifold (double-sided copies, overlapping shells): not a trim
    const f = faces[0] * 3; const g = faces[1] * 3;
    const dot = normals[f] * normals[g] + normals[f + 1] * normals[g + 1] + normals[f + 2] * normals[g + 2];
    if (dot < cosCrease) { crease[a] = 1; crease[b] = 1; } // a sharp crease: ridge, plate step
  }
  // Sculpted or generated meshes can be "sharp" almost everywhere; there creases say nothing
  // about trim, so only the real open borders are kept.
  let creaseCount = 0;
  for (let w = 0; w < welded; w++) if (crease[w] && !border[w]) creaseCount++;
  const creasesUsable = welded <= LOW_POLY_VERTICES || creaseCount <= welded * MAX_CREASE_SHARE;
  for (let v = 0; v < vertexCount; v++) {
    const w = weldOf[v];
    trim[v] = border[w] ? 1 : creasesUsable && crease[w] ? 0.6 : 0;
  }

  // flow
  const span = (k) => Math.max(1e-6, max[k] - min[k]);
  if (flow === 'axis' && axis) {
    const o = axis.origin || [0, 0, 0];
    const d = axis.dir || [0, 1, 0];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    const length = Math.max(1e-6, Number(axis.length) || 1);
    for (let v = 0; v < vertexCount; v++) {
      const along = ((positions[v * 3] - o[0]) * d[0] + (positions[v * 3 + 1] - o[1]) * d[1] + (positions[v * 3 + 2] - o[2]) * d[2]) / dl;
      const s = axis.symmetric ? Math.abs(along) : along;
      flowOut[v] = Math.max(0, Math.min(1, s / length));
    }
  } else if (flow === 'sternum_out') {
    // the front centre of the chest piece, a little above the middle (+Z is the front)
    const origin = [(min[0] + max[0]) / 2, min[1] + span(1) * 0.58, max[2]];
    let far = 1e-6;
    for (let v = 0; v < vertexCount; v++) {
      const d = Math.hypot(positions[v * 3] - origin[0], positions[v * 3 + 1] - origin[1], (positions[v * 3 + 2] - origin[2]) * 0.6);
      flowOut[v] = d;
      if (d > far) far = d;
    }
    for (let v = 0; v < vertexCount; v++) flowOut[v] = Math.min(1, flowOut[v] / far);
  } else if (flow === 'wrist_out') {
    // both hands: outwards from the body (|x|) and down (an A-pose lowers the fingers)
    const cx = (min[0] + max[0]) / 2;
    let lo = Infinity; let hi = -Infinity;
    for (let v = 0; v < vertexCount; v++) {
      const s = Math.abs(positions[v * 3] - cx) + 0.5 * (max[1] - positions[v * 3 + 1]);
      flowOut[v] = s;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    const range = Math.max(1e-6, hi - lo);
    for (let v = 0; v < vertexCount; v++) flowOut[v] = (flowOut[v] - lo) / range;
  } else {
    for (let v = 0; v < vertexCount; v++) flowOut[v] = (max[1] - positions[v * 3 + 1]) / span(1);
  }
  return { trim, flow: flowOut };
}
