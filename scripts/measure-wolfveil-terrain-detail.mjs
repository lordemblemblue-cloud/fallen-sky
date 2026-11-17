#!/usr/bin/env node
// Scoping measurement for the Wolfveil ground. Builds nothing and changes
// nothing: it answers, with numbers, what a "high-poly to smart mesh" rework
// of the terrain would buy before anyone rebuilds the ground under the game.
//
//   node scripts/measure-wolfveil-terrain-detail.mjs      (about 15 seconds)
//
// 1. How close is the live ground (an even 310 x 310 grid) to a dense
//    "high-poly" sampling of the same designed height function?
// 2. How many triangles would an error-bounded adaptive ("smart") mesh need
//    to match that high-poly surface within a given tolerance?
// 3. How far is the live mesh's lighting (its smooth normals) from the
//    lighting of the true surface? This is what a baked normal map would add.
// 4. How much of the ground lies in each of the five areas, and what a
//    lighter ground for unloaded areas would save.
//
// Pure Node: no Three.js, no browser.
/* global console */
import {wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {createWolfveilTerrainSurfaceSampler} from '../src/components/game3d/wolfveil/WolfveilTerrainSurfaceSampler.mjs';
import {WOLFVEIL_AREA_IDS,wolfveilAreaAtLocal} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';

const SPAN = 1100, HALF = SPAN / 2;
const N = 1024, SIZE = N + 1, STEP = SPAN / N; // dense reference: ~1.07 m
let t = Date.now();
const ref = new Float32Array(SIZE * SIZE);
for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++)
  ref[j * SIZE + i] = wolfveilHeight(i * STEP - HALF, j * STEP - HALF);
console.log(`reference: ${SIZE}x${SIZE} samples @ ${STEP.toFixed(3)} m = ${(N * N * 2 / 1e6).toFixed(2)} M triangles (${Date.now() - t} ms)`);

function stats(err) {
  const sorted = Float32Array.from(err).sort();
  const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  let sum = 0; for (const e of err) sum += e * e;
  const over = lim => { let c = 0; for (const e of err) if (e > lim) c++; return 100 * c / err.length; };
  return { rms: Math.sqrt(sum / err.length), p50: q(.5), p95: q(.95), p99: q(.99), max: sorted[sorted.length - 1],
    over10cm: over(.10), over25cm: over(.25), over50cm: over(.5) };
}
const fmt = s => `rms ${(s.rms * 100).toFixed(1)} cm | p95 ${(s.p95 * 100).toFixed(1)} cm | p99 ${(s.p99 * 100).toFixed(1)} cm | max ${(s.max * 100).toFixed(0)} cm | >10cm ${s.over10cm.toFixed(1)}% | >25cm ${s.over25cm.toFixed(1)}% | >50cm ${s.over50cm.toFixed(2)}%`;

// 1. Live mesh: 310 segments, exact triangle split used by buildWolfveilTerrain.
for (const segments of [310]) {
  const sample = createWolfveilTerrainSurfaceSampler({ span: SPAN, segments });
  const err = new Float32Array(SIZE * SIZE);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++)
    err[j * SIZE + i] = Math.abs(sample(i * STEP - HALF, j * STEP - HALF) - ref[j * SIZE + i]);
  const s = stats(err);
  console.log(`\nLIVE even grid ${segments}x${segments} (${(SPAN / segments).toFixed(2)} m step, ${segments * segments * 2} triangles)\n  ${fmt(s)}`);
  // where the error lives: 11x11 grid of 100 m squares, share of total squared error
  const cells = new Float64Array(121);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const e = err[j * SIZE + i], c = Math.min(10, Math.floor(i * STEP / 100)), r = Math.min(10, Math.floor(j * STEP / 100));
    cells[r * 11 + c] = Math.max(cells[r * 11 + c], e);
  }
  const worst = [...cells].map((e, k) => ({ e, r: Math.floor(k / 11), c: k % 11 })).sort((a, b) => b.e - a.e);
  console.log('  100 m squares whose worst point is off by >50 cm:', worst.filter(w => w.e > .5).length, 'of 121; >25 cm:', worst.filter(w => w.e > .25).length);
  console.log('  worst squares (local x/z min corner):', worst.slice(0, 6).map(w => `x${-550 + w.c * 100},z${-550 + w.r * 100}: ${(w.e * 100).toFixed(0)} cm`).join(' | '));
}

// 2. Adaptive right-triangulated mesh (RTIN / "Martini") over the same reference.
t = Date.now();
const numTriangles = N * N * 2 - 2, numParent = numTriangles - N * N;
const coords = new Uint16Array(numTriangles * 4);
for (let i = 0; i < numTriangles; i++) {
  let id = i + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
  if (id & 1) { bx = by = cx = N; } else { ax = ay = cy = N; }
  while ((id >>= 1) > 1) {
    const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
    if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; } else { ax = bx; ay = by; bx = cx; by = cy; }
    cx = mx; cy = my;
  }
  const k = i * 4; coords[k] = ax; coords[k + 1] = ay; coords[k + 2] = bx; coords[k + 3] = by;
}
const errors = new Float32Array(SIZE * SIZE);
for (let i = numTriangles - 1; i >= 0; i--) {
  const k = i * 4, ax = coords[k], ay = coords[k + 1], bx = coords[k + 2], by = coords[k + 3];
  const mx = (ax + bx) >> 1, my = (ay + by) >> 1, cx = mx + my - ay, cy = my + ax - mx;
  const mid = my * SIZE + mx;
  const e = Math.abs((ref[ay * SIZE + ax] + ref[by * SIZE + bx]) / 2 - ref[mid]);
  errors[mid] = Math.max(errors[mid], e);
  if (i < numParent) {
    const l = ((ay + cy) >> 1) * SIZE + ((ax + cx) >> 1), r = ((by + cy) >> 1) * SIZE + ((bx + cx) >> 1);
    errors[mid] = Math.max(errors[mid], errors[l], errors[r]);
  }
}
console.log(`\nadaptive error pyramid built (${Date.now() - t} ms)`);

function adaptive(maxError) {
  const tris = [];
  const walk = (ax, ay, bx, by, cx, cy) => {
    const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
    if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * SIZE + mx] > maxError) {
      walk(cx, cy, ax, ay, mx, my); walk(bx, by, cx, cy, mx, my);
    } else tris.push(ax, ay, bx, by, cx, cy);
  };
  walk(0, 0, N, N, N, 0); walk(N, N, 0, 0, 0, N);
  // true error of the emitted mesh at every reference sample
  const err = new Float32Array(SIZE * SIZE);
  for (let k = 0; k < tris.length; k += 6) {
    const [ax, ay, bx, by, cx, cy] = tris.slice(k, k + 6);
    const ha = ref[ay * SIZE + ax], hb = ref[by * SIZE + bx], hc = ref[cy * SIZE + cx];
    const x0 = Math.min(ax, bx, cx), x1 = Math.max(ax, bx, cx), y0 = Math.min(ay, by, cy), y1 = Math.max(ay, by, cy);
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
      const wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
      const wc = 1 - wa - wb;
      if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
      err[y * SIZE + x] = Math.abs(wa * ha + wb * hb + wc * hc - ref[y * SIZE + x]);
    }
  }
  return { triangles: tris.length / 6, s: stats(err) };
}
console.log('\nADAPTIVE mesh, measured against the same reference:');
for (const tol of [0.5, 0.25, 0.15, 0.10, 0.05]) {
  const { triangles, s } = adaptive(tol);
  console.log(`  tolerance ${(tol * 100).toFixed(0).padStart(2)} cm -> ${String(triangles).padStart(7)} triangles (${(triangles / 192200 * 100).toFixed(0)}% of live) | ${fmt(s)}`);
}

// 3. Lighting detail: angle between the live mesh's smooth normal and the true normal.
const nrm = (hx0, hx1, hz0, hz1, d) => { const x = (hx0 - hx1) / (2 * d), z = (hz0 - hz1) / (2 * d), l = Math.hypot(x, 1, z); return [x / l, 1 / l, z / l]; };
const SEG = 310, GS = SPAN / SEG, G = SEG + 1;
const grid = new Float32Array(G * G);
for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) grid[j * G + i] = wolfveilHeight(i * GS - HALF, j * GS - HALF);
const gh = (i, j) => grid[Math.max(0, Math.min(SEG, j)) * G + Math.max(0, Math.min(SEG, i))];
const vn = new Float32Array(G * G * 3);
for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const n = nrm(gh(i - 1, j), gh(i + 1, j), gh(i, j - 1), gh(i, j + 1), GS); vn.set(n, (j * G + i) * 3); }
const ang = []; const D = 0.25;
for (let j = 8; j < SIZE - 8; j += 2) for (let i = 8; i < SIZE - 8; i += 2) {
  const x = i * STEP - HALF, z = j * STEP - HALF;
  const tn = nrm(wolfveilHeight(x - D, z), wolfveilHeight(x + D, z), wolfveilHeight(x, z - D), wolfveilHeight(x, z + D), D);
  const u = (x + HALF) / GS, v = (z + HALF) / GS, iu = Math.min(SEG - 1, Math.floor(u)), iv = Math.min(SEG - 1, Math.floor(v)), fu = u - iu, fv = v - iv;
  const m = [0, 0, 0];
  for (const [di, dj, w] of [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]])
    for (let c = 0; c < 3; c++) m[c] += w * vn[((iv + dj) * G + iu + di) * 3 + c];
  const l = Math.hypot(...m), dot = Math.min(1, (m[0] * tn[0] + m[1] * tn[1] + m[2] * tn[2]) / l);
  ang.push(Math.acos(dot) * 180 / Math.PI);
}
ang.sort((a, b) => a - b);
const aq = p => ang[Math.floor(p * ang.length)];
console.log(`\nLIGHTING: angle between live smooth normal and true surface normal (${ang.length} samples)`);
console.log(`  median ${aq(.5).toFixed(1)} deg | p90 ${aq(.9).toFixed(1)} deg | p99 ${aq(.99).toFixed(1)} deg | share over 10 deg: ${(100 * ang.filter(a => a > 10).length / ang.length).toFixed(1)}% | over 20 deg: ${(100 * ang.filter(a => a > 20).length / ang.length).toFixed(1)}%`);

// 4. The ground per area: today's grid, and a lighter ground for unloaded areas.
{
  const cells = Object.fromEntries(WOLFVEIL_AREA_IDS.map(id => [id, 0]));
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const area = wolfveilAreaAtLocal((i + .5) * GS - HALF, (j + .5) * GS - HALF);
    if (area) cells[area]++;
  }
  const total = SEG * SEG * 2;
  console.log('\nGROUND PER AREA (live grid, ' + total + ' triangles drawn whole today)');
  for (const id of WOLFVEIL_AREA_IDS) {
    const own = cells[id] * 2, rest = total - own;
    console.log('  standing in ' + id.padEnd(5) + ' own ground ' + String(own).padStart(6) + ' triangles (' +
      (100 * own / total).toFixed(1).padStart(4) + '%) | rest at half detail: ' + String(Math.round(own + rest / 4)).padStart(6) +
      ' in all (saves ' + Math.round(rest * 3 / 4) + ') | rest at quarter detail: ' + String(Math.round(own + rest / 16)).padStart(6) +
      ' (saves ' + Math.round(rest * 15 / 16) + ')');
  }
}
