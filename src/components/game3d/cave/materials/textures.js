import * as THREE from 'three';
import { clamp01, fbm, hash2, ridged, smoothstep, worley } from './noise.js';

const ROCK_DARK = [54, 50, 46];
const ROCK_MID = [112, 104, 96];
const ROCK_LIGHT = [154, 146, 134];
const RUST = [122, 78, 58];
const SOOT = [28, 26, 24];
const MOSS_DEEP = [38, 62, 34];
const MOSS_MID = [78, 110, 48];
const MOSS_LIT = [142, 154, 72];
const CLAY = [156, 78, 52];
const CLAY_DARK = [104, 52, 38];
const CLAY_LIT = [184, 108, 72];
const MORTAR = [186, 176, 160];
const MORTAR_DARK = [122, 112, 100];
const WOOD_LIT = [164, 112, 68];
const WOOD_DARK = [62, 40, 26];
const DIRT = [112, 82, 52];
const DIRT_DARK = [72, 52, 34];
const GRASS = [62, 96, 42];
const GRASS_LIT = [118, 142, 58];

function byte(value) {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return value | 0;
}

function setRgb(out, color) {
  out.r = color[0];
  out.g = color[1];
  out.b = color[2];
}

function mixToward(out, color, t) {
  out.r += (color[0] - out.r) * t;
  out.g += (color[1] - out.g) * t;
  out.b += (color[2] - out.b) * t;
}

function lerpColor(out, a, b, t) {
  out.r = a[0] + (b[0] - a[0]) * t;
  out.g = a[1] + (b[1] - a[1]) * t;
  out.b = a[2] + (b[2] - a[2]) * t;
}

function paintRoughRock(u, v, x, y, out) {
  const warp = fbm(u + 0.17, v, 11, 4, 3);
  const broad = fbm(u + warp * 0.33, v + warp * 0.24, 4, 5, 4);
  const fine = fbm(u, v, 19, 3, 12);
  const crack = smoothstep(0.72, 0.9, ridged(u * 1.15, v * 1.15, 7, 5, 3));
  const pit = smoothstep(0.66, 0.86, fbm(u + 8.2, v + 1.4, 28, 3, 8));
  lerpColor(out, ROCK_DARK, ROCK_LIGHT, broad);
  mixToward(out, RUST, smoothstep(0.58, 0.82, fine) * 0.38);
  mixToward(out, ROCK_MID, (1 - broad) * 0.25);
  if (hash2(x, y, 3) > 0.988) mixToward(out, [206, 198, 184], 0.65);
  mixToward(out, SOOT, Math.max(crack, pit * 0.8));
  out.height = clamp01(0.48 + (broad - 0.5) * 0.5 + (fine - 0.5) * 0.12 - crack * 0.62 - pit * 0.4);
  out.roughness = clamp01(0.84 + (fine - 0.5) * 0.16 - pit * 0.04);
  out.ao = clamp01(1 - crack * 0.72 - pit * 0.4);
}

function paintLayeredRock(u, v, _x, _y, out) {
  const beds = [
    [62, 68, 72],
    [141, 115, 86],
    [122, 83, 64],
    [106, 110, 112],
    [163, 147, 128],
    [94, 103, 88],
    [110, 88, 70],
  ];
  const warp = fbm(u * 1.4, v, 5, 4, 3) - 0.5;
  const layerPos = (v + warp * 0.055) * beds.length;
  const index = Math.abs(Math.floor(layerPos)) % beds.length;
  const next = (index + 1) % beds.length;
  const frac = layerPos - Math.floor(layerPos);
  const grain = fbm(u * 2.2, v * 8, 17, 3, 6);
  lerpColor(out, beds[index], beds[next], smoothstep(0.82, 1, frac) * 0.35);
  mixToward(out, beds[index], 0.15 + grain * 0.1);
  const seam = smoothstep(0.08, 0, frac) + smoothstep(0.05, 0, 1 - frac);
  const shelf = smoothstep(0.78, 0.96, frac);
  mixToward(out, SOOT, clamp01(seam) * 0.55);
  mixToward(out, [168, 160, 140], shelf * 0.18);
  const vertical = smoothstep(0.82, 0.94, ridged(u * 0.8, v * 2.4, 23, 4, 3));
  mixToward(out, SOOT, vertical * 0.45);
  out.height = clamp01(0.34 + shelf * 0.42 + grain * 0.08 - seam * 0.28 - vertical * 0.35);
  out.roughness = clamp01(0.9 - shelf * 0.12);
  out.ao = clamp01(1 - seam * 0.55 - vertical * 0.4);
}

function paintWetRock(u, v, x, y, out) {
  const stone = fbm(u, v, 8, 5, 4);
  const seep = Math.pow(fbm(u * 1.6, v * 0.45, 15, 4, 3), 1.35);
  const drip = smoothstep(0.55, 0.82, fbm(u * 3.4, v * 0.35, 21, 3, 4));
  lerpColor(out, [22, 28, 32], [58, 68, 74], stone);
  mixToward(out, [14, 22, 28], (1 - seep) * 0.65);
  mixToward(out, [86, 96, 102], drip * 0.25);
  const crack = smoothstep(0.76, 0.92, ridged(u, v * 1.4, 4, 4, 3));
  mixToward(out, [8, 10, 12], crack);
  if (hash2(x, y, 44) > 0.992) mixToward(out, [170, 190, 196], 0.4);
  out.height = clamp01(0.42 + (stone - 0.5) * 0.22 - crack * 0.45);
  out.roughness = clamp01(0.16 + (0.78 - 0.16) * seep + drip * 0.08);
  out.ao = clamp01(0.75 + stone * 0.25 - crack * 0.45);
}

function paintMossyRock(u, v, x, y, out) {
  paintRoughRock(u, v, x, y, out);
  const pocket = fbm(u * 1.8, v * 1.4, 31, 4, 3);
  const moss = smoothstep(0.42, 0.72, pocket) * (0.45 + fbm(u * 4, v * 4, 36, 3, 6) * 0.55);
  const damp = smoothstep(0.2, 0.55, v + (fbm(u, v, 2, 3, 2) - 0.5) * 0.2);
  const amount = clamp01(moss * (0.35 + damp * 0.9));
  mixToward(out, amount > 0.55 ? MOSS_LIT : MOSS_MID, amount * 0.82);
  mixToward(out, MOSS_DEEP, smoothstep(0.75, 0.95, pocket) * 0.4);
  out.height = clamp01(out.height * (1 - amount * 0.25) + amount * 0.62);
  out.roughness = clamp01(out.roughness * (1 - amount) + amount * 0.94);
  out.ao = clamp01(out.ao * (1 - amount * 0.35));
}

function paintCrystalRock(u, v, x, y, out) {
  const host = fbm(u, v, 9, 4, 4);
  lerpColor(out, [24, 22, 32], [48, 46, 58], host);
  const veinA = smoothstep(0.7, 0.88, ridged(u * 1.5, v * 1.35, 4, 5, 3));
  const veinB = smoothstep(0.76, 0.91, ridged(u * 2.3 + 0.4, v * 1.1, 12, 4, 3));
  const spark = hash2(x, y, 70) > 0.985 ? 1 : 0;
  if (veinA > 0) mixToward(out, [126, 104, 214], veinA);
  if (veinB > 0) mixToward(out, [78, 196, 186], veinB * 0.9);
  if (spark) mixToward(out, [236, 232, 255], 0.7);
  const crack = smoothstep(0.8, 0.94, ridged(u * 0.7, v * 0.8, 18, 3, 2));
  mixToward(out, [12, 10, 16], crack * (1 - Math.max(veinA, veinB)));
  out.height = clamp01(0.4 + host * 0.12 + veinA * 0.28 + veinB * 0.22 - crack * 0.2);
  out.roughness = clamp01(0.86 - veinA * 0.62 - veinB * 0.55 - spark * 0.3);
  out.ao = clamp01(0.9 - crack * 0.4);
  out.er = veinA * 150 + spark * 80;
  out.eg = veinB * 170 + veinA * 40;
  out.eb = veinA * 210 + veinB * 140 + spark * 120;
}

function paintCliffRock(u, v, x, y, out) {
  const warp = fbm(u, v, 6, 4, 3) - 0.5;
  const ledgePos = (v + warp * 0.04) * 5;
  const frac = ledgePos - Math.floor(ledgePos);
  const ledge = smoothstep(0.72, 0.95, frac);
  const face = fbm(u * 1.6, v * 0.6, 14, 4, 4);
  const fissure = smoothstep(0.84, 0.95, ridged(u * 0.55, v * 1.8, 22, 4, 2));
  lerpColor(out, [70, 66, 62], [132, 122, 110], face);
  mixToward(out, [156, 148, 132], ledge * 0.45);
  const lichen = smoothstep(0.62, 0.84, fbm(u * 3, v * 2, 40, 3, 5)) * ledge;
  mixToward(out, [122, 132, 86], lichen * 0.7);
  mixToward(out, SOOT, fissure * 0.7);
  if (hash2(x, y, 8) > 0.99) mixToward(out, [180, 170, 150], 0.45);
  out.height = clamp01(0.36 + face * 0.18 + ledge * 0.46 - fissure * 0.4);
  out.roughness = clamp01(0.9 - ledge * 0.08);
  out.ao = clamp01(1 - fissure * 0.55 - (1 - ledge) * 0.08);
}

function paintGravel(u, v, _x, _y, out) {
  const cells = worley(u, v, 18, 5);
  const pebbles = [
    [132, 122, 110],
    [96, 88, 80],
    [154, 140, 118],
    [78, 74, 70],
    [118, 108, 96],
  ];
  const index = Math.floor(cells.id * pebbles.length) % pebbles.length;
  const grit = fbm(u * 3, v * 3, 9, 3, 8);
  setRgb(out, pebbles[index]);
  mixToward(out, pebbles[(index + 2) % pebbles.length], grit * 0.35);
  const gap = smoothstep(0.08, 0.16, cells.edge);
  mixToward(out, [36, 32, 28], 1 - gap);
  const sand = smoothstep(0.55, 0.8, fbm(u, v, 16, 3, 3));
  mixToward(out, [128, 112, 84], sand * gap * 0.35);
  out.height = clamp01((1 - cells.f1 * 1.35) * gap * 0.85 + grit * 0.05);
  out.roughness = clamp01(0.78 + cells.f1 * 0.25);
  out.ao = clamp01(0.45 + gap * 0.55);
}

function paintPackedDirt(u, v, x, y, out) {
  const broad = fbm(u, v, 3, 5, 3);
  const fine = fbm(u, v, 27, 3, 14);
  lerpColor(out, DIRT_DARK, [154, 116, 74], broad);
  mixToward(out, [96, 78, 52], fine * 0.35);
  const pebble = worley(u, v, 22, 11);
  if (pebble.f1 < 0.18 && pebble.id > 0.72) mixToward(out, [90, 84, 76], 0.55);
  const print = footprint(u, v, 0.38, 0.42, 0.4) + footprint(u, v, 0.62, 0.68, -0.2);
  mixToward(out, DIRT_DARK, clamp01(print) * 0.35);
  if (hash2(x, y, 5) > 0.97) mixToward(out, [86, 110, 58], 0.35);
  out.height = clamp01(0.46 + (broad - 0.5) * 0.16 + (fine - 0.5) * 0.05 - print * 0.22 + (pebble.f1 < 0.18 ? 0.12 : 0));
  out.roughness = clamp01(0.94 - print * 0.05);
  out.ao = clamp01(0.82 - print * 0.25);
}

function footprint(u, v, cx, cy, rot) {
  const dx = u - cx;
  const dy = v - cy;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const lx = dx * cs - dy * sn;
  const ly = dx * sn + dy * cs;
  const heel = Math.hypot(lx / 0.035, (ly + 0.03) / 0.045);
  const ball = Math.hypot(lx / 0.04, (ly - 0.035) / 0.028);
  return smoothstep(1, 0.72, Math.min(heel, ball));
}

function paintWetStoneFloor(u, v, _x, _y, out) {
  const slab = worley(u, v, 6, 8);
  const tone = fbm(u * 2, v * 2, 13, 3, 4);
  lerpColor(out, [48, 54, 58], [92, 98, 102], tone);
  const mortar = smoothstep(0.07, 0.14, slab.edge);
  mixToward(out, [28, 30, 32], 1 - mortar);
  const puddle = smoothstep(0.58, 0.8, fbm(u * 1.2, v * 1.2, 19, 4, 3)) * mortar;
  mixToward(out, [18, 32, 38], puddle * 0.55);
  const wear = smoothstep(0.15, 0.02, slab.f1);
  mixToward(out, [120, 124, 126], wear * mortar * 0.25);
  out.height = clamp01(0.25 + mortar * 0.45 - puddle * 0.08 + wear * 0.05);
  out.roughness = clamp01(0.72 - puddle * 0.55 - wear * 0.1);
  out.ao = clamp01(0.55 + mortar * 0.45);
}

function paintBrickFace(kind) {
  return (u, v, x, y, out) => {
    const pores = fbm(u, v, 41, 4, 10);
    const sand = hash2(x, y, 17);
    const streak = fbm(u * 0.6, v * 2.4, 52, 3, 4);
    if (kind === 'clean') lerpColor(out, CLAY_DARK, CLAY_LIT, 0.35 + streak * 0.5);
    else if (kind === 'worn') lerpColor(out, [96, 72, 60], [150, 124, 104], streak);
    else if (kind === 'broken') lerpColor(out, [78, 48, 40], [132, 74, 56], streak);
    else lerpColor(out, CLAY, [120, 86, 64], streak);
    mixToward(out, [186, 160, 120], sand > 0.96 ? 0.55 : pores * 0.12);
    const edge = Math.min(u, v, 1 - u, 1 - v);
    const bevel = smoothstep(0, 0.08, edge);
    mixToward(out, SOOT, (1 - bevel) * (kind === 'clean' ? 0.25 : 0.45));
    let chip = 0;
    if (kind === 'worn' || kind === 'broken' || kind === 'mossy') {
      chip = smoothstep(0.62, 0.84, fbm(u * 3, v * 3, kind === 'broken' ? 8 : 3, 3, 4)) * (1 - bevel);
      mixToward(out, [70, 60, 54], chip * (kind === 'broken' ? 0.8 : 0.4));
    }
    let crack = 0;
    if (kind === 'broken') {
      const line = Math.abs(v - (0.32 + fbm(u, v, 4, 3, 2) * 0.35));
      crack = smoothstep(0.018, 0.004, line);
      mixToward(out, [28, 18, 16], crack);
    }
    let moss = 0;
    if (kind === 'mossy') {
      moss = smoothstep(0.45, 0.75, fbm(u * 2, v * 2, 6, 4, 3)) * smoothstep(0.15, 0.55, 1 - v);
      mixToward(out, moss > 0.6 ? MOSS_LIT : MOSS_MID, moss * 0.85);
    }
    if (kind === 'worn') {
      const salt = smoothstep(0.72, 0.9, fbm(u * 4, v * 3, 15, 2, 6));
      mixToward(out, [214, 210, 198], salt * 0.45);
    }
    out.height = clamp01(0.55 + pores * 0.12 + bevel * 0.2 - chip * 0.45 - crack * 0.55 + moss * 0.08);
    out.roughness = clamp01(0.86 - bevel * 0.04 + moss * 0.06);
    out.ao = clamp01(0.78 + bevel * 0.22 - crack * 0.35);
  };
}

function paintMasonry(kind) {
  return (u, v, x, y, out, size) => {
    const bw = 64;
    const bh = 32;
    const gap = 5;
    const row = Math.floor((v * size) / bh);
    const shift = (row & 1) ? bw / 2 : 0;
    const px = Math.floor(u * size);
    const py = Math.floor(v * size);
    const sx = (px + shift) % size;
    const lx = sx % bw;
    const ly = py % bh;
    const col = Math.floor(sx / bw);
    const brickId = hash2(col + 3, row + 5, 9);
    const mortar = lx < gap || ly < gap;
    const missing = kind === 'broken' && brickId > 0.84;
    if (mortar || missing) {
      const grime = fbm(u * 2, v * 2, 12, 3, 6);
      lerpColor(out, MORTAR_DARK, MORTAR, missing ? 0.15 : 0.55 + grime * 0.3);
      if (kind === 'worn' || kind === 'mossy') mixToward(out, [90, 82, 72], 0.25);
      let moss = 0;
      if (kind === 'mossy') {
        moss = smoothstep(0.4, 0.75, fbm(u * 3, v * 3, 7, 3, 4)) * (ly < gap + 2 || v > 0.45 ? 1 : 0.2);
        mixToward(out, MOSS_MID, moss * 0.8);
      }
      out.height = missing ? 0.08 : 0.16 + grime * 0.05;
      out.roughness = 0.95;
      out.ao = missing ? 0.35 : 0.55;
      return;
    }
    const inset = Math.min(lx - gap, ly - gap, bw - 1 - lx, bh - 1 - ly);
    const bevel = smoothstep(0, 4.5, inset);
    const tone = hash2(col, row, 21);
    const clayA = kind === 'worn' ? [112, 84, 70] : kind === 'broken' ? [120, 64, 48] : CLAY;
    const clayB = kind === 'worn' ? [156, 132, 112] : CLAY_LIT;
    lerpColor(out, clayA, clayB, tone);
    const pores = fbm(u * 4, v * 4, 33 + col, 2, 8);
    mixToward(out, [90, 60, 48], pores * 0.18);
    mixToward(out, SOOT, (1 - bevel) * 0.4);
    if (kind === 'worn') mixToward(out, [210, 206, 196], smoothstep(0.7, 0.92, pores) * 0.4);
    if (kind === 'broken' && brickId > 0.7) mixToward(out, [60, 40, 34], (1 - bevel) * 0.5);
    if (kind === 'mossy' && (ly > bh * 0.62 || brickId > 0.78)) {
      const moss = smoothstep(0.5, 0.8, fbm(u * 5, v * 5, 4, 2, 6));
      mixToward(out, MOSS_DEEP, moss * 0.75);
    }
    out.height = clamp01(0.42 + bevel * 0.4 + pores * 0.05);
    out.roughness = clamp01(0.84 + (1 - bevel) * 0.08);
    out.ao = clamp01(0.62 + bevel * 0.38);
  };
}

function paintMortar(u, v, _x, _y, out) {
  const n = fbm(u, v, 2, 5, 4);
  const grit = fbm(u, v, 18, 2, 12);
  lerpColor(out, [132, 122, 108], [198, 190, 174], n);
  mixToward(out, [98, 90, 80], grit > 0.72 ? 0.35 : 0);
  out.height = clamp01(0.35 + n * 0.2 + (grit - 0.5) * 0.08);
  out.roughness = 0.96;
  out.ao = clamp01(0.75 + n * 0.2);
}

function paintWood(kind) {
  return (u, v, _x, _y, out) => {
    const ring = kind === 'end'
      ? Math.sin(Math.hypot(u - 0.5, v - 0.5) * 46 + fbm(u, v, 8, 3, 4) * 6)
      : Math.sin((u * 22) + fbm(v * 1.4, u, 6, 4, 3) * 5.5);
    const late = smoothstep(-0.2, 0.85, ring);
    const weather = kind === 'support' ? 0.35 : kind === 'worn' ? 0.2 : 0;
    if (kind === 'end') lerpColor(out, [96, 62, 36], [168, 122, 74], late);
    else if (kind === 'support') lerpColor(out, [58, 40, 28], [112, 84, 60], late);
    else lerpColor(out, WOOD_DARK, WOOD_LIT, 0.25 + late * 0.75);
    const fiber = fbm(kind === 'end' ? u * 2 : v * 2, kind === 'end' ? v * 2 : u * 6, 11, 3, 6);
    mixToward(out, WOOD_DARK, fiber * 0.22);
    mixToward(out, [150, 146, 136], weather * (0.3 + fiber * 0.4));
    const knotU = 0.34;
    const knotV = kind === 'end' ? 0.5 : 0.62;
    const knot = Math.hypot((u - knotU) * (kind === 'end' ? 1 : 1.4), (v - knotV) * (kind === 'end' ? 1 : 0.45));
    const knotMask = smoothstep(0.16, 0.02, knot);
    if (kind !== 'support') mixToward(out, [74, 42, 24], knotMask * 0.75);
    const split = kind === 'support'
      ? smoothstep(0.012, 0.002, Math.abs(u - (0.5 + (fbm(v, u, 9, 3, 2) - 0.5) * 0.08)))
      : 0;
    mixToward(out, SOOT, split);
    out.height = clamp01(0.48 + late * 0.16 - fiber * 0.08 + knotMask * 0.12 - split * 0.35);
    out.roughness = clamp01(0.78 + weather * 0.15 - late * 0.06);
    out.ao = clamp01(0.84 - split * 0.4 - (1 - late) * 0.08);
  };
}

function paintIron(u, v, x, y, out) {
  const hammer = fbm(u, v, 3, 4, 5);
  const scratch = smoothstep(0.78, 0.93, ridged(u * 2.5, v * 0.4, 9, 3, 4));
  lerpColor(out, [28, 30, 34], [78, 82, 88], hammer);
  mixToward(out, [20, 18, 16], scratch * 0.55);
  const pit = worley(u, v, 10, 4);
  if (pit.f1 < 0.12) mixToward(out, [16, 16, 18], 0.45);
  if (hash2(x, y, 12) > 0.992) mixToward(out, [150, 140, 120], 0.5);
  out.height = clamp01(0.5 + (hammer - 0.5) * 0.25 - scratch * 0.15 - (pit.f1 < 0.12 ? 0.2 : 0));
  out.roughness = clamp01(0.46 + hammer * 0.22 + scratch * 0.15);
  out.ao = clamp01(0.8 - scratch * 0.2);
}

function paintDirtPath(u, v, x, y, out) {
  paintPackedDirt(u, v, x, y, out);
  const rut = Math.exp(-(((u - 0.34) * 9) ** 2)) + Math.exp(-(((u - 0.68) * 9) ** 2));
  const along = 0.65 + 0.35 * fbm(u * 0.5, v * 2, 14, 3, 3);
  mixToward(out, [64, 46, 30], clamp01(rut * along) * 0.45);
  mixToward(out, [138, 118, 86], (1 - rut) * 0.12);
  const pebble = worley(u, v, 14, 6);
  if (pebble.f1 < 0.16 && pebble.id > 0.6) mixToward(out, [100, 96, 90], 0.4);
  out.height = clamp01(out.height - rut * 0.28 + (pebble.f1 < 0.16 ? 0.1 : 0));
  out.roughness = clamp01(0.96 - rut * 0.06);
  out.ao = clamp01(out.ao - rut * 0.18);
}

function paintStonePath(u, v, _x, _y, out) {
  const slab = worley(u, v, 5, 17);
  const tone = fbm(u * 2.4, v * 2.4, 10, 3, 5);
  const stones = [
    [138, 134, 126],
    [104, 100, 94],
    [156, 148, 136],
    [88, 86, 82],
  ];
  const index = Math.floor(slab.id * stones.length) % stones.length;
  setRgb(out, stones[index]);
  mixToward(out, stones[(index + 1) % stones.length], tone * 0.4);
  const joint = smoothstep(0.06, 0.13, slab.edge);
  mixToward(out, [62, 58, 52], 1 - joint);
  const polish = smoothstep(0.22, 0.05, slab.f1) * joint;
  mixToward(out, [176, 172, 164], polish * 0.35);
  const moss = smoothstep(0.55, 0.8, fbm(u * 2, v * 2, 29, 3, 3)) * (1 - joint);
  mixToward(out, MOSS_DEEP, moss * 0.65);
  out.height = clamp01(0.22 + joint * 0.55 - polish * 0.06);
  out.roughness = clamp01(0.82 - polish * 0.28);
  out.ao = clamp01(0.5 + joint * 0.5);
}

function paintGrassEdge(u, v, x, y, out) {
  const soil = fbm(u, v, 4, 4, 3);
  lerpColor(out, DIRT, [96, 78, 48], soil);
  const cover = smoothstep(0.28, 0.62, fbm(u * 2.2, v * 2.2, 8, 4, 4));
  const blade = Math.abs(Math.sin(u * 70 + fbm(u, v, 12, 3, 3) * 8));
  const shade = smoothstep(0.2, 0.85, blade);
  lerpColor(out, outColor(out), shade > 0.55 ? GRASS_LIT : GRASS, cover);
  mixToward(out, [32, 48, 24], cover * (1 - shade) * 0.45);
  if (hash2(x, y, 6) > 0.985) mixToward(out, [186, 176, 92], cover);
  out.height = clamp01(0.3 + cover * (0.25 + shade * 0.35));
  out.roughness = clamp01(0.9 - cover * 0.05);
  out.ao = clamp01(0.7 + cover * shade * 0.25);
}

function outColor(out) {
  return [out.r, out.g, out.b];
}

function paintGrassBlade(u, v, _x, _y, out) {
  const columns = 5;
  const column = Math.min(columns - 1, Math.floor(u * columns));
  const localU = u * columns - column;
  const sway = (hash2(column, 1, 3) - 0.5) * 0.18;
  const width = 0.08 + hash2(column, 2, 5) * 0.05;
  const center = 0.5 + sway * (1 - v);
  const dist = Math.abs(localU - center);
  const tip = smoothstep(0.15, 0.92, v);
  const body = smoothstep(width, width * 0.35, dist) * smoothstep(0.02, 0.12, v);
  const alpha = body * (1 - tip * 0.15);
  const lit = hash2(column, 4, 9);
  lerpColor(out, [28, 48, 22], [156, 168, 74], lit * 0.7 + v * 0.3);
  mixToward(out, [18, 28, 14], (1 - v) * 0.35);
  out.a = alpha * 255;
  out.height = clamp01(0.4 + alpha * 0.4);
  out.roughness = 0.72;
  out.ao = clamp01(0.65 + v * 0.3);
}

function normalsFromHeight(height, size, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const y0 = (y - 1 + size) % size;
    const y1 = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const x0 = (x - 1 + size) % size;
      const x1 = (x + 1) % size;
      const hl = height[y * size + x0];
      const hr = height[y * size + x1];
      const hd = height[y0 * size + x];
      const hu = height[y1 * size + x];
      let nx = (hl - hr) * strength;
      let ny = (hd - hu) * strength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const i = (y * size + x) * 4;
      data[i] = byte((nx * 0.5 + 0.5) * 255);
      data[i + 1] = byte((ny * 0.5 + 0.5) * 255);
      data[i + 2] = byte((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

function multiplyCavity(height, ao, albedo, size) {
  const radius = size >= 512 ? 2 : 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      let count = 0;
      for (let oy = -radius; oy <= radius; oy += radius) {
        const sy = (y + oy + size) % size;
        for (let ox = -radius; ox <= radius; ox += radius) {
          const sx = (x + ox + size) % size;
          sum += height[sy * size + sx];
          count += 1;
        }
      }
      const cavity = clamp01(0.72 + (height[y * size + x] - sum / count) * 3.1);
      const i = (y * size + x) * 4;
      const aoValue = clamp01((ao[i] / 255) * cavity);
      const packed = byte(aoValue * 255);
      ao[i] = packed;
      ao[i + 1] = packed;
      ao[i + 2] = packed;
      const bake = 0.84 + 0.16 * aoValue;
      albedo[i] = byte(albedo[i] * bake);
      albedo[i + 1] = byte(albedo[i + 1] * bake);
      albedo[i + 2] = byte(albedo[i + 2] * bake);
    }
  }
}

function uploadTexture(data, size, colorSpace, name) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = name;
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

const RECIPES = {
  roughRock: { size: 256, normalStrength: 4.4, paint: paintRoughRock },
  layeredRock: { size: 256, normalStrength: 5.2, paint: paintLayeredRock },
  wetRock: { size: 256, normalStrength: 2.4, paint: paintWetRock },
  mossyRock: { size: 256, normalStrength: 3.6, paint: paintMossyRock },
  crystalRock: { size: 256, normalStrength: 3.8, emissive: true, paint: paintCrystalRock },
  cliffRock: { size: 256, normalStrength: 5.4, paint: paintCliffRock },
  gravelFloor: { size: 256, normalStrength: 4.8, paint: paintGravel },
  packedDirt: { size: 256, normalStrength: 2.8, paint: paintPackedDirt },
  wetStoneFloor: { size: 256, normalStrength: 3.2, paint: paintWetStoneFloor },
  cleanBrick: { size: 256, normalStrength: 3.4, paint: paintBrickFace('clean') },
  wornBrick: { size: 256, normalStrength: 3.8, paint: paintBrickFace('worn') },
  brokenBrick: { size: 256, normalStrength: 4.6, paint: paintBrickFace('broken') },
  mossyBrick: { size: 256, normalStrength: 3.4, paint: paintBrickFace('mossy') },
  cleanMasonry: { size: 512, normalStrength: 4.2, paint: paintMasonry('clean') },
  wornMasonry: { size: 512, normalStrength: 4.4, paint: paintMasonry('worn') },
  brokenMasonry: { size: 512, normalStrength: 4.8, paint: paintMasonry('broken') },
  mossyMasonry: { size: 512, normalStrength: 4.2, paint: paintMasonry('mossy') },
  mortar: { size: 256, normalStrength: 2.2, paint: paintMortar },
  woodPlank: { size: 256, normalStrength: 3.2, paint: paintWood('plank') },
  woodEnd: { size: 256, normalStrength: 2.6, paint: paintWood('end') },
  woodSupport: { size: 256, normalStrength: 3.6, paint: paintWood('support') },
  forgedIron: { size: 256, normalStrength: 2.8, paint: paintIron },
  dirtPath: { size: 256, normalStrength: 3.1, paint: paintDirtPath },
  stonePath: { size: 256, normalStrength: 4.4, paint: paintStonePath },
  grassEdge: { size: 256, normalStrength: 3.4, paint: paintGrassEdge },
  grassBlade: { size: 128, normalStrength: 1.4, cavity: false, paint: paintGrassBlade },
};

const textureCache = new Map();

export function getCaveTextureSet(id) {
  const recipe = RECIPES[id];
  if (!recipe) {
    throw new Error(`No cave texture recipe for "${id}"`);
  }
  const cached = textureCache.get(id);
  if (cached) return cached;
  const images = makeTextureSet(recipe);
  const set = {
    id,
    size: images.size,
    albedo: uploadTexture(images.albedo, images.size, THREE.SRGBColorSpace, `Cave/${id}/albedo`),
    normal: uploadTexture(images.normal, images.size, THREE.NoColorSpace, `Cave/${id}/normal`),
    roughness: uploadTexture(images.roughness, images.size, THREE.NoColorSpace, `Cave/${id}/roughness`),
    ao: uploadTexture(images.ao, images.size, THREE.NoColorSpace, `Cave/${id}/ao`),
    emissive: images.emissive
      ? uploadTexture(images.emissive, images.size, THREE.SRGBColorSpace, `Cave/${id}/emissive`)
      : null,
  };
  textureCache.set(id, set);
  return set;
}

export function releaseCaveTextures() {
  for (const set of textureCache.values()) {
    set.albedo.dispose();
    set.normal.dispose();
    set.roughness.dispose();
    set.ao.dispose();
    set.emissive?.dispose();
  }
  textureCache.clear();
}

function makeTextureSet(recipe) {
  const size = recipe.size;
  const albedo = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const ao = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const emissive = recipe.emissive ? new Uint8Array(size * size * 4) : null;
  const out = { r: 0, g: 0, b: 0, a: 255, height: 0.5, roughness: 0.85, ao: 1, er: 0, eg: 0, eb: 0 };
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      out.a = 255;
      out.er = 0;
      out.eg = 0;
      out.eb = 0;
      recipe.paint(x / size, v, x, y, out, size);
      const i = (y * size + x) * 4;
      const baked = 0.82 + 0.18 * clamp01(out.ao);
      albedo[i] = byte(out.r * baked);
      albedo[i + 1] = byte(out.g * baked);
      albedo[i + 2] = byte(out.b * baked);
      albedo[i + 3] = byte(out.a);
      const roughByte = byte(clamp01(out.roughness) * 255);
      roughness[i] = roughByte;
      roughness[i + 1] = roughByte;
      roughness[i + 2] = roughByte;
      roughness[i + 3] = 255;
      const aoByte = byte(clamp01(out.ao) * 255);
      ao[i] = aoByte;
      ao[i + 1] = aoByte;
      ao[i + 2] = aoByte;
      ao[i + 3] = 255;
      height[y * size + x] = out.height;
      if (emissive) {
        emissive[i] = byte(out.er);
        emissive[i + 1] = byte(out.eg);
        emissive[i + 2] = byte(out.eb);
        emissive[i + 3] = 255;
      }
    }
  }
  if (recipe.cavity !== false) multiplyCavity(height, ao, albedo, size);
  return {
    size,
    albedo,
    roughness,
    ao,
    emissive,
    normal: normalsFromHeight(height, size, recipe.normalStrength),
  };
}

export function listCaveTextureIds() {
  return Object.keys(RECIPES);
}
