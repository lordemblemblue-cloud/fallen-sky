/* global process, Buffer, console */
// Draws the archer rig to a PNG with the same core code as the game (software triangle rasterizer, no browser).
// Usage: node tools/fantasybattle/preview-rig.mjs out.png [--skill id --at seconds] [--combat 0..1] [--bones] [--frames n]
//        [--look x,y] [--expr name] [--scale k]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRig, createPuppetState, stepPuppet, faceState, socketPosition, setLookTarget, triggerExpression } from '../../src/components/fantasybattle/core/puppetCore.mjs';
import { SkillPlayer } from '../../src/components/fantasybattle/core/skillTimeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes(`--${name}`);
const outPath = args[0];
const rigData = JSON.parse(fs.readFileSync(path.join(root, 'src/components/fantasybattle/data/archerRig.json'), 'utf8'));
const skillsPath = path.join(root, 'src/components/fantasybattle/data/bowSkills.json');
const skills = fs.existsSync(skillsPath) ? JSON.parse(fs.readFileSync(skillsPath, 'utf8')).skills : [];
const imgDir = path.join(root, 'public/fantasybattle/archer');
const manifest = JSON.parse(fs.readFileSync(path.join(imgDir, 'parts.json'), 'utf8'));
const rig = buildRig(rigData, manifest);
const state = createPuppetState(rig, { seed: 7 });
state.life.combatTarget = Number(opt('combat', 0));
state.life.combat = state.life.combatTarget;
const look = (opt('look', '0,0')).split(',').map(Number);
setLookTarget(state.life, look[0], look[1]);
state.life.look.x = look[0]; state.life.look.y = look[1];
if (opt('expr')) triggerExpression(state.life, opt('expr'), 99);
const player = new SkillPlayer(skills);
const skillId = opt('skill');
const at = Number(opt('at', 0));
const dt = 1 / 60;
const frames = Number(opt('frames', 40));
for (let f = 0; f < frames; f += 1) stepPuppet(rig, state, dt, null);
if (skillId) {
  player.play(skillId);
  let t = 0;
  while (t < at - 1e-9) { const step = Math.min(dt, at - t); player.update(step); t += step; stepPuppet(rig, state, step, player.evaluate()); }
  if (at === 0) stepPuppet(rig, state, 0, player.evaluate());
}

const textures = new Map();
async function tex(part) {
  if (!textures.has(part)) {
    const { data, info } = await sharp(path.join(imgDir, `${part}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    textures.set(part, { data, w: info.width, h: info.height });
  }
  return textures.get(part);
}

const k = Number(opt('scale', 1));
const view = { x0: -260, x1: 300, y0: -10, y1: 640 };
const W = Math.round((view.x1 - view.x0) * k); const H = Math.round((view.y1 - view.y0) * k);
const px = new Float32Array(W * H * 4);
for (let i = 0; i < W * H; i += 1) { px[i * 4] = 0.55; px[i * 4 + 1] = 0.6; px[i * 4 + 2] = 0.66; px[i * 4 + 3] = 1; }
const toScreen = (x, y) => [(x - view.x0) * k, (view.y1 - y) * k];

function sample(t, u, v) {
  const x = u * t.w - 0.5; const y = v * t.h - 0.5;
  const x0 = Math.floor(x); const y0 = Math.floor(y); const fx = x - x0; const fy = y - y0;
  const out = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const sx = Math.min(t.w - 1, Math.max(0, x0 + dx)); const sy = Math.min(t.h - 1, Math.max(0, y0 + dy));
    const i = (sy * t.w + sx) * 4; const a = t.data[i + 3] / 255;
    out[0] += t.data[i] / 255 * a * w; out[1] += t.data[i + 1] / 255 * a * w; out[2] += t.data[i + 2] / 255 * a * w; out[3] += a * w;
  }
  return out; // premultiplied
}

function drawTriangle(t, P, UV, opacity) {
  const minX = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0])));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
  const minY = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
  const den = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]);
  if (Math.abs(den) < 1e-9) return;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const sx = x + 0.5; const sy = y + 0.5;
      const a = ((P[1][1] - P[2][1]) * (sx - P[2][0]) + (P[2][0] - P[1][0]) * (sy - P[2][1])) / den;
      const b = ((P[2][1] - P[0][1]) * (sx - P[2][0]) + (P[0][0] - P[2][0]) * (sy - P[2][1])) / den;
      const c = 1 - a - b;
      if (a < -1e-4 || b < -1e-4 || c < -1e-4) continue;
      const s = sample(t, a * UV[0][0] + b * UV[1][0] + c * UV[2][0], a * UV[0][1] + b * UV[1][1] + c * UV[2][1]);
      const sa = s[3] * opacity;
      if (sa <= 0) continue;
      const i = (y * W + x) * 4;
      px[i] = s[0] * opacity + px[i] * (1 - sa); px[i + 1] = s[1] * opacity + px[i + 1] * (1 - sa); px[i + 2] = s[2] * opacity + px[i + 2] * (1 - sa);
    }
  }
}

function drawLine(a, b, color, width) {
  const [x0, y0] = toScreen(a[0], a[1]); const [x1, y1] = toScreen(b[0], b[1]);
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
  for (let s = 0; s <= n; s += 1) {
    const x = x0 + (x1 - x0) * s / n; const y = y0 + (y1 - y0) * s / n;
    for (let dy = -width; dy <= width; dy += 1) for (let dx = -width; dx <= width; dx += 1) {
      const ix = Math.round(x + dx); const iy = Math.round(y + dy);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = (iy * W + ix) * 4; px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2];
    }
  }
}

const face = faceState(rig, state.life);
for (const li of state.order) {
  const l = rig.layers[li];
  let part = l.part; let opacity = 1;
  if (l.role === 'face') part = face.face;
  if (l.role === 'faceFade') { if (!face.fadeFrom) continue; part = face.fadeFrom; opacity = face.fadeOpacity; }
  if (l.role === 'blink') { opacity = face.blink; if (opacity <= 0) continue; }
  const t = await tex(part);
  const pos = state.positions[li]; const uv = l.grid.uvs; const idx = l.grid.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const P = [0, 1, 2].map((j) => toScreen(pos[idx[i + j] * 2], pos[idx[i + j] * 2 + 1]));
    const UV = [0, 1, 2].map((j) => [uv[idx[i + j] * 2], uv[idx[i + j] * 2 + 1]]);
    drawTriangle(t, P, UV, opacity);
  }
  if (l.id === 'bow') {
    const top = socketPosition(rig, state, 'bowTop'); const bottom = socketPosition(rig, state, 'bowBottom');
    const draw = state.params.draw ?? 0;
    const nockRest = [(top[0] + bottom[0]) / 2, (top[1] + bottom[1]) / 2];
    const hand = socketPosition(rig, state, 'nock');
    const nock = [nockRest[0] + (hand[0] - nockRest[0]) * draw, nockRest[1] + (hand[1] - nockRest[1]) * draw];
    drawLine(top, nock, [0.95, 0.92, 0.85], 0); drawLine(nock, bottom, [0.95, 0.92, 0.85], 0);
  }
}
if (flag('bones')) {
  for (let b = 0; b < rig.bones.length; b += 1) {
    const [x, y] = toScreen(state.frame[b * 6 + 4], state.frame[b * 6 + 5]);
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      const ix = Math.round(x + dx); const iy = Math.round(y + dy);
      if (ix >= 0 && iy >= 0 && ix < W && iy < H) { const i = (iy * W + ix) * 4; px[i] = 1; px[i + 1] = 0.1; px[i + 2] = 0.3; }
    }
  }
}
const out = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H * 4; i += 1) out[i] = Math.round(Math.min(1, Math.max(0, px[i])) * 255);
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(outPath);
console.log(`wrote ${outPath} (${W}x${H}) expression=${face.face} draw=${state.params.draw ?? 0}`);
