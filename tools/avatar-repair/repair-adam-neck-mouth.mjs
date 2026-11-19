// Repairs Adam's fused body (public/models/characters/fused/Male_Fused_v1.glb and _v2.glb, same mesh) IN PLACE:
// same vertices in the same order, same morph targets, same skeleton, same UVs. The armor body masks, the hair, the
// tattoos and every animation keep working because nothing is renumbered.
//
//   Mouth  The head sculpt had its lips parted with the teeth showing. The jaw region is closed by 45% of the
//          FX_JawOpen hinge (FX_JawOpen is scaled by 1.45 so its fully open pose stays where it was), then the slit
//          left between the lips is sealed a step at a time: measured by casting rays at the mouth, each lip moves as
//          a whole toward a meet line, the move fading out past the mouth corners. Normals around the lips are
//          recomputed.
//   Neck   Where the head meets the body (a 55-vertex seam shared by both primitives) the head's skin is a jagged
//          sawtooth over the upper back, lighter than the body, and the body texture near it is a mosaic of tiny
//          per-triangle charts whose rims show as orange triangle lines. Within a few centimetres of the seam the art
//          gives way to one smooth skin-colour field built per vertex from the art itself and continuous across
//          head and body; the normals there are averaged across both sides; the skin weights are blended across the
//          seam so both sides bend together.
//   Atlas  Every chart rim and gutter of both skin atlases is rebuilt from the chart interiors (dilation), so texture
//          filtering never picks up a neighbouring chart's colour.
//
// It refuses a file it has already repaired (asset.extras.fusedBodyRepair). Run from the repo root:
//   node tools/avatar-repair/repair-adam-neck-mouth.mjs <in.glb> <out.glb> [--report report.json]
// Used for this repo's files:
//   node tools/avatar-repair/repair-adam-neck-mouth.mjs public/models/characters/fused/Male_Fused_v2.glb public/models/characters/fused/Male_Fused_v2.glb
//   node tools/avatar-repair/repair-adam-neck-mouth.mjs public/models/characters/fused/Male_Fused_v1.glb public/models/characters/fused/Male_Fused_v1.glb
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readGlb, readAccessor, writeAccessorInPlace, compactGlb, writeGlb } from '../avatar-motion/glb-io.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sharp = createRequire(path.join(REPO, 'package.json'))('sharp');
const args = process.argv.slice(2);
const [inPath, outPath] = args;
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPORT = opt('--report', null);
const RECIPE = {
  version: 1,
  jaw: 0.45,
  seal: { iterations: 12, step: 0.5, share_lower: 0.5, plateau_lower: 0.004, fall_lower: 0.01, plateau_upper: 0.004, fall_upper: 0.006, sigma_columns: 4, depth: 0.01 },
  neck: { radius: 0.028, weight_iterations: 6, normal_iterations: 4 },
  tone: { smooth_iterations: 30, body: [0.035, 0.07], head: [0.018, 0.045] },
  atlas: { dilation_passes: 24, jpeg_quality: 92 },
};

const glb = readGlb(inPath);
const J = glb.json;
if (J.asset?.extras?.fusedBodyRepair) throw new Error(`${inPath} is already repaired (${JSON.stringify(J.asset.extras.fusedBodyRepair)})`);
const report = { in: path.basename(inPath) };
const bodyNode = J.nodes.find((n) => /_Body$/.test(n.name || '') && n.mesh !== undefined);
const mesh = J.meshes[bodyNode.mesh];
const names = mesh.extras.targetNames;
const primOf = (re) => mesh.primitives.find((p) => re.test(J.materials[p.material].name));
const primB = primOf(/^Skin_Body/), primH = primOf(/^Skin_Head/);
if (!primB || !primH || !names.includes('FX_JawOpen')) throw new Error('not a fused body with Skin_Body / Skin_Head and FX_JawOpen');

// ------------------------------------------------------------------ math
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth01 = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const toLin = (c) => Math.pow(c / 255, 2.2);
const toSrgb = (l) => Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, l), 1 / 2.2) * 255)));

// ------------------------------------------------------------------ data
function load(prim) {
  const d = {
    prim,
    P: readAccessor(glb, prim.attributes.POSITION),
    N: readAccessor(glb, prim.attributes.NORMAL),
    UV: readAccessor(glb, prim.attributes.TEXCOORD_0),
    JN: readAccessor(glb, prim.attributes.JOINTS_0),
    W: readAccessor(glb, prim.attributes.WEIGHTS_0),
    I: readAccessor(glb, prim.indices).map((r) => (Array.isArray(r) ? r[0] : r)),
  };
  d.P0 = d.P.map((p) => p.slice());
  d.N0 = d.N.map((n) => n.slice());
  return d;
}
const B = load(primB), H = load(primH);

// a sparse morph target's values, written back in place (same indices)
function sparseTarget(prim, name) {
  const acc = J.accessors[prim.targets[names.indexOf(name)].POSITION];
  if (!acc.sparse) throw new Error('expected a sparse morph target: ' + name);
  const iv = J.bufferViews[acc.sparse.indices.bufferView], vv = J.bufferViews[acc.sparse.values.bufferView];
  const isz = { 5121: 1, 5123: 2, 5125: 4 }[acc.sparse.indices.componentType];
  const idx = [], vals = [];
  const voff = (k) => (vv.byteOffset || 0) + (acc.sparse.values.byteOffset || 0) + k * 12;
  for (let k = 0; k < acc.sparse.count; k++) {
    const o = (iv.byteOffset || 0) + (acc.sparse.indices.byteOffset || 0) + k * isz;
    idx.push(isz === 1 ? glb.bin.readUInt8(o) : isz === 2 ? glb.bin.readUInt16LE(o) : glb.bin.readUInt32LE(o));
    vals.push([glb.bin.readFloatLE(voff(k)), glb.bin.readFloatLE(voff(k) + 4), glb.bin.readFloatLE(voff(k) + 8)]);
  }
  return {
    vals,
    dense(count) { const out = Array.from({ length: count }, () => [0, 0, 0]); idx.forEach((i, k) => { out[i] = vals[k]; }); return out; },
    write(next) {
      next.forEach((v, k) => { glb.bin.writeFloatLE(v[0], voff(k)); glb.bin.writeFloatLE(v[1], voff(k) + 4); glb.bin.writeFloatLE(v[2], voff(k) + 8); });
      for (let c = 0; c < 3; c++) { acc.min[c] = Math.min(0, ...next.map((v) => v[c])); acc.max[c] = Math.max(0, ...next.map((v) => v[c])); }
    },
  };
}
// weld primitives by position; each node keeps its split vertices
function weldAll(list) {
  const ids = new Map(), nodes = [];
  const key = (v) => `${Math.round(v[0] * 1e5)},${Math.round(v[1] * 1e5)},${Math.round(v[2] * 1e5)}`;
  for (const d of list) {
    d.node = new Int32Array(d.P.length);
    d.P.forEach((v, i) => {
      const k = key(v);
      if (!ids.has(k)) { ids.set(k, nodes.length); nodes.push({ verts: [], p: v.slice() }); }
      d.node[i] = ids.get(k);
      nodes[ids.get(k)].verts.push([d, i]);
    });
  }
  const adj = nodes.map(() => new Set());
  for (const d of list) for (let t = 0; t < d.I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = d.node[d.I[t + e]], b = d.node[d.I[t + (e + 1) % 3]];
    if (a !== b) { adj[a].add(b); adj[b].add(a); }
  }
  return { nodes, adj: adj.map((s) => [...s]) };
}
function boundaryNodes(d) {
  const cnt = new Map();
  for (let t = 0; t < d.I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = d.node[d.I[t + e]], b = d.node[d.I[t + (e + 1) % 3]];
    if (a === b) continue;
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  const out = new Set();
  for (const [k, n] of cnt) if (n === 1) k.split('_').forEach((x) => out.add(+x));
  return out;
}
function dijkstra(G, sources, maxD) {
  const dist = new Float64Array(G.nodes.length).fill(Infinity), heap = [];
  const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const s of sources) { dist[s] = 0; push(0, s); }
  while (heap.length) {
    const [d, v] = pop();
    if (d > dist[v] || d > maxD) continue;
    for (const u of G.adj[v]) { const nd = d + len(sub(G.nodes[v].p, G.nodes[u].p)); if (nd < dist[u]) { dist[u] = nd; push(nd, u); } }
  }
  return dist;
}
// area-weighted normals of the wanted nodes from every touching triangle
function nodeNormals(G, list, want) {
  const acc = new Map([...want].map((v) => [v, [0, 0, 0]]));
  for (const d of list) for (let t = 0; t < d.I.length; t += 3) {
    const a = d.node[d.I[t]], b = d.node[d.I[t + 1]], c = d.node[d.I[t + 2]];
    if (!acc.has(a) && !acc.has(b) && !acc.has(c)) continue;
    const pa = G.nodes[a].p, n = cross(sub(G.nodes[b].p, pa), sub(G.nodes[c].p, pa));
    for (const v of [a, b, c]) if (acc.has(v)) { const s = acc.get(v); s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; }
  }
  for (const [v, s] of acc) acc.set(v, norm(s));
  return acc;
}

// ------------------------------------------------------------------ mouth
const jaw = sparseTarget(primH, 'FX_JawOpen');
const Dh = jaw.dense(H.P.length);
H.P.forEach((p, i) => { if (Dh[i][0] || Dh[i][1] || Dh[i][2]) H.P[i] = sub(p, mul(Dh[i], RECIPE.jaw)); });
jaw.write(jaw.vals.map((v) => mul(v, 1 + RECIPE.jaw)));
report.jaw_vertices = Dh.filter((d) => d[0] || d[1] || d[2]).length;

// the slit between the lips, per 1 mm column: front rays (glTF +z), the pit nearest the jaw split
function measureSlit(P, I) {
  const zmax = Math.max(...P.map((p) => p[2]));
  const moving = P.map((p, i) => [p, len(Dh[i])]).filter(([p, d]) => d > 2e-5 && p[2] > zmax - 0.04);
  const xc = moving.reduce((s, [p]) => s + p[0], 0) / moving.length;
  const splitY = Math.max(...moving.filter(([p]) => Math.abs(p[0] - xc) < 0.006).map(([p]) => p[1]));
  const tris = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = P[I[t]], b = P[I[t + 1]], c = P[I[t + 2]];
    if (Math.max(a[0], b[0], c[0]) < xc - 0.05 || Math.min(a[0], b[0], c[0]) > xc + 0.05) continue;
    if (Math.max(a[1], b[1], c[1]) < splitY - 0.04 || Math.min(a[1], b[1], c[1]) > splitY + 0.03) continue;
    if (Math.max(a[2], b[2], c[2]) < zmax - 0.07) continue;
    tris.push([a, b, c]);
  }
  const hitZ = (x, y) => {
    let best = -Infinity;
    for (const [a, b, c] of tris) {
      const v0x = b[0] - a[0], v0y = b[1] - a[1], v1x = c[0] - a[0], v1y = c[1] - a[1], den = v0x * v1y - v1x * v0y;
      if (Math.abs(den) < 1e-14) continue;
      const px = x - a[0], py = y - a[1], u = (px * v1y - v1x * py) / den, v = (v0x * py - px * v0y) / den;
      if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
      best = Math.max(best, a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
    }
    return best;
  };
  const STEP = 0.0002, REACH = 0.004, PIT = 0.0008, cols = [];
  for (let x = xc - 0.036; x <= xc + 0.036 + 1e-9; x += 0.001) {
    const rows = [];
    for (let y = splitY - 0.02; y <= splitY + 0.016 + 1e-9; y += STEP) rows.push([y, hitZ(x, y)]);
    const n = rows.length, k = Math.round(REACH / STEP);
    const pit = rows.map(([, z], i) => {
      if (z === -Infinity) return true;
      let up = -Infinity, dn = -Infinity;
      for (let j = i + 1; j <= Math.min(n - 1, i + k); j++) up = Math.max(up, rows[j][1]);
      for (let j = Math.max(0, i - k); j < i; j++) dn = Math.max(dn, rows[j][1]);
      return z < Math.min(up, dn) - PIT;
    });
    let best = null;
    for (let i = 0; i < n; i++) {
      if (!pit[i]) continue;
      let j = i;
      while (j + 1 < n && pit[j + 1]) j++;
      const mid = (rows[i][0] + rows[j][0]) / 2;
      if (Math.abs(mid - splitY) < 0.008 && (!best || Math.abs(mid - splitY) < Math.abs(best.mid - splitY))) best = { i, j, mid };
      i = j;
    }
    const front = Math.max(...rows.filter((r) => Math.abs(r[0] - splitY) < 0.008).map((r) => r[1]));
    cols.push(best ? { x, lo: rows[best.i][0] - STEP / 2, hi: rows[best.j][0] + STEP / 2, front } : { x, lo: null, hi: null, front });
  }
  return { zmax, cols };
}
{
  const S0 = RECIPE.seal, history = [];
  for (let it = 0; it < S0.iterations; it++) {
    const S = measureSlit(H.P, H.I);
    const cols = S.cols.map((c) => (c.lo === null ? { x: c.x, gap: 0, front: c.front } : { x: c.x, gap: c.hi - c.lo, lo: c.lo, hi: c.hi, front: c.front }));
    const open = cols.filter((c) => c.gap > 0);
    history.push({ columns: open.length, max_gap: +Math.max(0, ...open.map((c) => c.gap)).toFixed(4) });
    if (!open.length) break;
    // per-column shifts, spread and smoothed across x so the move fades out past the mouth corners
    const n = cols.length, dx = cols[1].x - cols[0].x;
    const nearestOpen = cols.map((c, i) => {
      if (c.gap) return i;
      let best = -1;
      for (let j = 0; j < n; j++) if (cols[j].gap && (best < 0 || Math.abs(j - i) < Math.abs(best - i))) best = j;
      return best;
    });
    const raw = cols.map((c) => (c.gap ? { lo: c.gap * S0.share_lower, up: c.gap * (1 - S0.share_lower) } : { lo: 0, up: 0 }));
    const SIG = S0.sigma_columns;
    const gauss = (key) => cols.map((_, i) => {
      let s = 0, w = 0;
      for (let j = Math.max(0, Math.floor(i - 3 * SIG)); j <= Math.min(n - 1, Math.ceil(i + 3 * SIG)); j++) { const k = Math.exp(-((j - i) ** 2) / (2 * SIG * SIG)); s += raw[j][key] * k; w += k; }
      return s / w;
    });
    const shLo = gauss('lo'), shUp = gauss('up');
    const prof = cols.map((c, i) => { const o = cols[nearestOpen[i]]; return { lo: o.lo, hi: o.hi, front: Number.isFinite(c.front) ? c.front : o.front, shLo: shLo[i], shUp: shUp[i], open: !!c.gap }; });
    const at = (x) => {
      const f = (x - cols[0].x) / dx, i = Math.floor(f), t = f - i;
      if (i < 0 || i >= n - 1) return null;
      const a = prof[i], b = prof[i + 1], mix = (k) => a[k] * (1 - t) + b[k] * t;
      if (mix('shLo') < 1e-6 && mix('shUp') < 1e-6) return null;
      return { lo: mix('lo'), hi: mix('hi'), front: mix('front'), shLo: mix('shLo'), shUp: mix('shUp'), open: a.open || b.open };
    };
    for (let i = 0; i < H.P.length; i++) {
      const p = H.P[i];
      if (p[2] < S.zmax - 0.05) continue;
      const c = at(p[0]);
      if (!c) continue;
      const isJaw = len(Dh[i]) > 1e-7;
      let dy = 0;
      // each lip moves as a whole over its height, then fades out toward the chin / nose
      if (p[1] < c.lo) { if (isJaw) { const d = c.lo - p[1]; dy = c.shLo * (d <= S0.plateau_lower ? 1 : 1 - smooth01((d - S0.plateau_lower) / S0.fall_lower)); } }
      else if (p[1] > c.hi) { if (!isJaw) { const d = p[1] - c.hi; dy = -c.shUp * (d <= S0.plateau_upper ? 1 : 1 - smooth01((d - S0.plateau_upper) / S0.fall_upper)); } }
      else if (c.open) dy = c.lo + (c.hi - c.lo) * S0.share_lower - p[1];
      // the lips and what sits right behind them; the teeth further back stay
      dy *= S0.step * (1 - smooth01((c.front - 0.003 - p[2]) / S0.depth));
      if (Math.abs(dy) > 1e-8) H.P[i] = [p[0], p[1] + dy, p[2]];
    }
  }
  const last = measureSlit(H.P, H.I).cols.filter((c) => c.lo !== null);
  history.push({ columns: last.length, max_gap: +Math.max(0, ...last.map((c) => c.hi - c.lo)).toFixed(4) });
  report.lip_slit = history;
}

// ------------------------------------------------------------------ neck seam
const G = weldAll([B, H]);
const bB = boundaryNodes(B), bH = boundaryNodes(H);
const ring = [...bB].filter((v) => bH.has(v) && G.nodes[v].p[1] > 0.75 && G.nodes[v].p[1] < 0.9);
if (ring.length < 20) throw new Error(`neck seam not found (${ring.length} shared boundary vertices)`);
const R = RECIPE.neck.radius;
const ringDist = dijkstra(G, ring, R * 3);
report.seam_vertices = ring.length;
{
  const band = [];
  for (let v = 0; v < G.nodes.length; v++) if (ringDist[v] < R) band.push(v);
  const wgt = new Map(band.map((v) => [v, 1 - smooth01(ringDist[v] / R)]));
  // skin weights blended across the seam
  const dense = (d, i) => { const m = new Map(); d.JN[i].forEach((j, k) => { if (d.W[i][k] > 0) m.set(j, (m.get(j) || 0) + d.W[i][k]); }); return m; };
  const Wn = G.nodes.map((n, v) => (wgt.has(v) ? dense(...n.verts[0]) : null));
  for (let it = 0; it < RECIPE.neck.weight_iterations; it++) {
    const next = new Map();
    for (const v of band) {
      const m = new Map(), nb = G.adj[v].filter((u) => Wn[u]), a = 0.5 * wgt.get(v);
      for (const [j, w] of Wn[v]) m.set(j, (m.get(j) || 0) + w * (1 - a));
      for (const u of nb) for (const [j, w] of Wn[u]) m.set(j, (m.get(j) || 0) + w * a / nb.length);
      next.set(v, m);
    }
    for (const [v, m] of next) Wn[v] = m;
  }
  for (const v of band) {
    const top = [...Wn[v]].sort((x, y) => y[1] - x[1]).slice(0, 4), s = top.reduce((t, [, w]) => t + w, 0) || 1;
    const JN = [0, 0, 0, 0], W4 = [0, 0, 0, 0];
    top.forEach(([j, w], k) => { JN[k] = j; W4[k] = w / s; });
    for (const [d, i] of G.nodes[v].verts) { d.JN[i] = JN.slice(); d.W[i] = W4.slice(); }
  }
  // one set of normals across the seam: the original normals of both sides, averaged and smoothed, faded out
  const want = new Set();
  for (let v = 0; v < G.nodes.length; v++) if (ringDist[v] < R * 1.6) want.add(v);
  let NN = new Map();
  for (const v of want) { const s = [0, 0, 0]; for (const [d, i] of G.nodes[v].verts) { s[0] += d.N0[i][0]; s[1] += d.N0[i][1]; s[2] += d.N0[i][2]; } NN.set(v, norm(s)); }
  for (let it = 0; it < RECIPE.neck.normal_iterations; it++) {
    const next = new Map();
    for (const v of want) { const s = [...NN.get(v)]; for (const u of G.adj[v]) if (NN.has(u)) { const n = NN.get(u); s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; } next.set(v, norm(s)); }
    NN = next;
  }
  for (const v of want) {
    const t = ringDist[v] < R ? 1 : 1 - smooth01((ringDist[v] - R) / (R * 0.6));
    for (const [d, i] of G.nodes[v].verts) d.N[i] = norm(add(mul(d.N0[i], 1 - t), mul(NN.get(v), t)));
  }
  report.seam_band = band.length;
}

// normals around the lips, recomputed where they moved (welded within the head)
{
  const keep = H.node;
  const GH = weldAll([H]);
  const moved = new Set();
  H.P.forEach((p, i) => { if (len(sub(p, H.P0[i])) > 1e-7) moved.add(H.node[i]); });
  for (const v of [...moved]) for (const u of GH.adj[v]) moved.add(u);
  const NN = nodeNormals(GH, [H], moved);
  for (const v of moved) for (const [, i] of GH.nodes[v].verts) H.N[i] = NN.get(v);
  report.mouth_vertices = moved.size;
  H.node = keep;
}

for (const d of [B, H]) {
  writeAccessorInPlace(glb, d.prim.attributes.POSITION, d.P);
  writeAccessorInPlace(glb, d.prim.attributes.NORMAL, d.N);
  writeAccessorInPlace(glb, d.prim.attributes.JOINTS_0, d.JN);
  writeAccessorInPlace(glb, d.prim.attributes.WEIGHTS_0, d.W);
  const acc = J.accessors[d.prim.attributes.POSITION];
  acc.min = [0, 1, 2].map((k) => Math.min(...d.P.map((p) => p[k])));
  acc.max = [0, 1, 2].map((k) => Math.max(...d.P.map((p) => p[k])));
}

// ------------------------------------------------------------------ textures
async function imageOf(prim) {
  const img = J.images[J.textures[J.materials[prim.material].pbrMetallicRoughness.baseColorTexture.index].source];
  const bv = J.bufferViews[img.bufferView];
  const { data, info } = await sharp(glb.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { img, data, w: info.width, h: info.height };
}
// every UV triangle (or those triFilter keeps): fn(x, y, b0, b1, b2, ia, ib, ic) for each texel centre inside it
function rasterUV(d, w, h, fn, triFilter, I = d.I) {
  for (let t = 0; t < I.length; t += 3) {
    const ia = I[t], ib = I[t + 1], ic = I[t + 2];
    if (triFilter && !triFilter(ia, ib, ic)) continue;
    const a = [d.UV[ia][0] * w, d.UV[ia][1] * h], b = [d.UV[ib][0] * w, d.UV[ib][1] * h], c = [d.UV[ic][0] * w, d.UV[ic][1] * h];
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) - 1)), x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0]) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) - 1)), y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1]) + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const b0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den;
      const b1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
      const b2 = 1 - b0 - b1;
      if (b0 < 0 || b1 < 0 || b2 < 0) continue;
      fn(x, y, b0, b1, b2, ia, ib, ic);
    }
  }
}
function dilate(data, w, h, covered, passes) {
  let mask = covered;
  for (let p = 0; p < passes; p++) {
    const next = mask.slice();
    let filled = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !mask[yy * w + xx]) continue;
        const j = yy * w + xx;
        r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
      }
      if (!n) continue;
      data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n; data[i * 4 + 3] = 255;
      next[i] = 1; filled++;
    }
    mask = next;
    if (!filled) break;
  }
  return mask;
}
{
  const imgs = { B: await imageOf(primB), H: await imageOf(primH) };
  const nodeDist = (d, i) => ringDist[d.node[i]];
  const ZONE = { B: RECIPE.tone.body, H: RECIPE.tone.head };
  // chart interiors (texel centre inside the UV triangle); a chart too small for one keeps the texel at its centroid
  const interior = {};
  for (const [k, d] of [['B', B], ['H', H]]) {
    const im = imgs[k], mask = new Uint8Array(im.w * im.h);
    for (let t = 0; t < d.I.length; t += 3) {
      let hit = 0;
      rasterUV(d, im.w, im.h, (x, y) => { mask[y * im.w + x] = 1; hit++; }, null, [d.I[t], d.I[t + 1], d.I[t + 2]]);
      if (!hit) {
        const u = (d.UV[d.I[t]][0] + d.UV[d.I[t + 1]][0] + d.UV[d.I[t + 2]][0]) / 3, v = (d.UV[d.I[t]][1] + d.UV[d.I[t + 1]][1] + d.UV[d.I[t + 2]][1]) / 3;
        mask[Math.min(im.h - 1, Math.max(0, Math.floor(v * im.h))) * im.w + Math.min(im.w - 1, Math.max(0, Math.floor(u * im.w)))] = 1;
      }
    }
    interior[k] = mask;
  }
  // one colour per seam-area vertex (welded across head and body) from the art around it, smoothed over the mesh
  const zoneOut = Math.max(ZONE.B[1], ZONE.H[1]) + 0.01;
  const acc = new Map();
  for (const [k, d] of [['B', B], ['H', H]]) {
    const im = imgs[k];
    rasterUV(d, im.w, im.h, (x, y, b0, b1, b2, ia, ib, ic) => {
      if (!interior[k][y * im.w + x]) return;
      const q = (y * im.w + x) * 4, c = [toLin(im.data[q]), toLin(im.data[q + 1]), toLin(im.data[q + 2])];
      for (const [i, w] of [[ia, b0], [ib, b1], [ic, b2]]) {
        if (w <= 0) continue;
        const v = d.node[i], s = acc.get(v) || [0, 0, 0, 0];
        s[0] += c[0] * w; s[1] += c[1] * w; s[2] += c[2] * w; s[3] += w; acc.set(v, s);
      }
    }, (ia, ib, ic) => Math.min(nodeDist(d, ia), nodeDist(d, ib), nodeDist(d, ic)) < zoneOut);
  }
  let col = new Map();
  for (const [v, s] of acc) if (s[3] > 0) col.set(v, [s[0] / s[3], s[1] / s[3], s[2] / s[3]]);
  const zoneNodes = [];
  for (let v = 0; v < G.nodes.length; v++) if (ringDist[v] < zoneOut) zoneNodes.push(v);
  for (let it = 0; it < 6; it++) for (const v of zoneNodes) if (!col.has(v)) {
    const nb = G.adj[v].filter((u) => col.has(u));
    if (nb.length) col.set(v, [0, 1, 2].map((c) => nb.reduce((s, u) => s + col.get(u)[c], 0) / nb.length));
  }
  for (let it = 0; it < RECIPE.tone.smooth_iterations; it++) {
    const next = new Map(col);
    for (const v of zoneNodes) {
      if (!col.has(v)) continue;
      const nb = G.adj[v].filter((u) => col.has(u));
      if (!nb.length) continue;
      next.set(v, [0, 1, 2].map((c) => col.get(v)[c] * 0.4 + 0.6 * nb.reduce((s, u) => s + col.get(u)[c], 0) / nb.length));
    }
    col = next;
  }
  // repaint: inside the zone the art gives way to the smooth field, interpolated across each triangle
  report.repainted_texels = {};
  for (const [k, d] of [['B', B], ['H', H]]) {
    const im = imgs[k], [zin, zout] = ZONE[k];
    let n = 0;
    rasterUV(d, im.w, im.h, (x, y, b0, b1, b2, ia, ib, ic) => {
      const i = y * im.w + x;
      if (!interior[k][i]) return;
      const dd = Math.max(0, b0 * nodeDist(d, ia) + b1 * nodeDist(d, ib) + b2 * nodeDist(d, ic));
      const f = dd <= zin ? 1 : 1 - smooth01((dd - zin) / (zout - zin));
      const ca = col.get(d.node[ia]), cb = col.get(d.node[ib]), cc = col.get(d.node[ic]);
      if (f <= 0 || !ca || !cb || !cc) return;
      for (let c = 0; c < 3; c++) im.data[i * 4 + c] = toSrgb(toLin(im.data[i * 4 + c]) * (1 - f) + (ca[c] * b0 + cb[c] * b1 + cc[c] * b2) * f);
      n++;
    }, (ia, ib, ic) => Math.min(nodeDist(d, ia), nodeDist(d, ib), nodeDist(d, ic)) < zout);
    report.repainted_texels[k === 'B' ? 'body' : 'head'] = n;
  }
  // every chart rim and gutter rebuilt from the chart interiors
  for (const k of ['B', 'H']) {
    const im = imgs[k];
    dilate(im.data, im.w, im.h, interior[k], RECIPE.atlas.dilation_passes);
    const jpg = await sharp(im.data, { raw: { width: im.w, height: im.h, channels: 4 } }).removeAlpha().jpeg({ quality: RECIPE.atlas.jpeg_quality, chromaSubsampling: '4:4:4' }).toBuffer();
    const pending = glb.extra.reduce((t, x) => t + x.length, 0);
    let offset = glb.bin.length + pending;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { glb.extra.push(Buffer.alloc(pad)); offset += pad; }
    glb.extra.push(jpg);
    J.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: jpg.length });
    im.img.bufferView = J.bufferViews.length - 1;
    im.img.mimeType = 'image/jpeg';
  }
}

J.asset.extras = { ...(J.asset.extras || {}), fusedBodyRepair: { tool: 'tools/avatar-repair/repair-adam-neck-mouth.mjs', version: RECIPE.version } };
compactGlb(glb);
report.out = { path: outPath, bytes: writeGlb(glb, outPath) };
console.log(JSON.stringify(report, null, 1));
if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
