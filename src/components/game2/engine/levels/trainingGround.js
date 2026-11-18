// Training-only soil, modest ground relief, and scattering of the supplied plant models.
import { mulberry32 } from '../level/kit.js';

const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
export function trainingGroundNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(0, 1, x - ix), fz = smooth(0, 1, z - iz);
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), fx), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx), fz);
}
function rectDistance(x, z, cx, cz, hx, hz) {
  const dx = Math.abs(x - cx) - hx, dz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(0, dx), Math.max(0, dz)) + Math.min(0, Math.max(dx, dz));
}
export function trainingPavingDistance(x, z) {
  return Math.min(rectDistance(x, z, 0, 21.4, 3.05, 8.7), rectDistance(x, z, 0, 39.1, 11.05, 9.1));
}
export function trainingGroundHeight(x, z) {
  if (Math.abs(x) > 27 || z < 13 || z > 63) return 0;
  const transition = smooth(0.05, 1.4, trainingPavingDistance(x, z));
  const edge = smooth(0, 0.7, Math.min(27 - Math.abs(x), z - 13, 63 - z));
  let height = 0.012 + 0.065 * trainingGroundNoise(x * 0.24, z * 0.24) + 0.025 * trainingGroundNoise(x * 0.8 + 7, z * 0.8);
  for (const [cx, cz] of [[-20, 20], [20, 36], [-21, 54]]) height += 0.035 * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / 5);
  return 0.004 + height * transition * edge;
}

export function buildTrainingTerrain() {
  const pos = [], nrm = [], col = [], uv = [], idx = [], tris = [];
  const step = 0.5, nx = 108, nz = 100;
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const x = -27 + ix * step, z = 13 + iz * step, y = trainingGroundHeight(x, z);
    const dx = (trainingGroundHeight(x + 0.05, z) - trainingGroundHeight(x - 0.05, z)) / 0.1;
    const dz = (trainingGroundHeight(x, z + 0.05) - trainingGroundHeight(x, z - 0.05)) / 0.1, len = Math.hypot(dx, 1, dz);
    const variation = 0.81 + trainingGroundNoise(x * 0.43, z * 0.43) * 0.16;
    pos.push(x, y, z); nrm.push(-dx / len, 1 / len, -dz / len);
    col.push(Math.round(255 * variation), Math.round(247 * variation), Math.round(230 * variation), 255);
    uv.push(x * 0.18, z * 0.18);
  }
  const point = i => pos.slice(i * 3, i * 3 + 3);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const a = z * (nx + 1) + x, b = a + 1, c = a + nx + 1, d = c + 1;
    for (const [i, j, k] of [[a, c, b], [b, c, d]]) {
      idx.push(i, j, k);
      tris.push({ a: point(i), b: point(j), c: point(k), normal: [0, 1, 0] });
    }
  }
  return { mesh: { pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Uint8Array(col), uv: new Float32Array(uv), idx: new Uint32Array(idx) }, tris };
}

function scatterBlocked(x, z) {
  // Structural rocks, plinths and wall buttresses must not grow floating plants.
  const boxes = [[-23, 23, -20, 25], [19, 27, 22.5, 29], [-20, 46, -17, 48], [21, 48, 23, 50], [-22, 53, -18, 58], [18, 53, 22, 58]];
  return Math.abs(x) > 25.4 || boxes.some(([x0, z0, x1, z1]) => x > x0 - 0.2 && x < x1 + 0.2 && z > z0 - 0.2 && z < z1 + 0.2);
}

export function buildTrainingFoliage(models) {
  const rand = mulberry32(91827), batches = new Map(), placements = [];
  const add = (model, x, z, scale, angle) => {
    const ca = Math.cos(angle), sa = Math.sin(angle), shade = 0.86 + rand() * 0.14;
    for (const group of model.groups) {
      if (!batches.has(group.texture)) batches.set(group.texture, { pos: [], nrm: [], col: [], uv: [], idx: [] });
      const out = batches.get(group.texture), offset = out.pos.length / 3;
      for (let i = 0; i < group.pos.length; i += 3) {
        const px = group.pos[i] * scale, pz = group.pos[i + 2] * scale;
        const wx = x + px * ca + pz * sa, wz = z - px * sa + pz * ca;
        out.pos.push(wx, trainingGroundHeight(wx, wz) - 0.008 + group.pos[i + 1] * scale, wz);
        const nx = group.nrm[i], nz = group.nrm[i + 2];
        // Bias leaf normals upward to approximate soft foliage lighting on both sides.
        const rx = (nx * ca + nz * sa) * 0.45, rz = (-nx * sa + nz * ca) * 0.45, ry = 0.8 + Math.abs(group.nrm[i + 1]) * 0.2;
        const len = Math.hypot(rx, ry, rz); out.nrm.push(rx / len, ry / len, rz / len);
        const root = smooth(0, 0.22, group.pos[i + 1]), tint = (0.62 + root * 0.38) * shade;
        out.col.push(Math.round(255 * tint), Math.round(255 * tint), Math.round(239 * tint), 255);
      }
      for (const value of group.uv) out.uv.push(value);
      for (const value of group.idx) out.idx.push(offset + value);
    }
  };
  for (let tries = 0; tries < 11500 && placements.length < 3100; tries++) {
    const x = -25 + rand() * 50, z = 14 + rand() * 48, distance = trainingPavingDistance(x, z);
    if (distance < 0.05 || scatterBlocked(x, z)) continue;
    const patch = trainingGroundNoise(x * 0.18 + 30, z * 0.18 - 8);
    const density = smooth(0.1, 0.9, distance) * smooth(0.22, 0.7, patch);
    if (rand() > density) continue;
    const tuft = rand() < 0.76;
    const scale = tuft ? 0.20 + rand() * 0.25 : 0.30 + rand() * 0.32;
    const model = tuft ? models.tufts[rand() < 0.8 ? 0 : 1] : models.grass[Math.floor(rand() * models.grass.length)];
    add(model, x, z, scale, rand() * Math.PI * 2);
    placements.push({ x, z, height: trainingGroundHeight(x, z), scale });
  }
  for (let i = 0; i < 50; i++) {
    const side = i % 2 ? -1 : 1, x = side * (22 + rand() * 2.8), z = 15 + rand() * 46;
    if (scatterBlocked(x, z)) continue;
    add(models.ferns[i % models.ferns.length], x, z, 0.23 + rand() * 0.2, rand() * Math.PI * 2);
  }
  const meshes = Array.from(batches, ([texture, b]) => ({ texture, mesh: { pos: new Float32Array(b.pos), nrm: new Float32Array(b.nrm), col: new Uint8Array(b.col), uv: new Float32Array(b.uv), idx: new Uint32Array(b.idx) } }));
  return { meshes, placements };
}
