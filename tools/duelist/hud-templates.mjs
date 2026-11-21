// Duelist Adventure's gameplay HUD templates (the owner's spec, 2026-11-20): original, minimal and translucent —
// dark blue-gray glass, thin silver lines, restrained cyan / red / gold accents, no neon. Frames only: no portraits,
// names, skills, keys, numbers or text are baked in; the game draws every changing value over them.
//
// Writes public/ui/duelist/hud/parts/*.svg (each frame on its own, used by client/DuelistHud.jsx) and
// public/ui/duelist/hud/templates/*.svg + *.png (full 1920x1080 RGBA templates, each independently replaceable).
//   node tools/duelist/hud-templates.mjs
/* global console, Buffer */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'public', 'ui', 'duelist', 'hud');
const W = 1920;
const H = 1080;

const C = { gold: '#d6b36d', cyan: '#5ec8ef', red: '#e5585e', silver: '#c6cfdb', line: '#b7c6d9' };
const DEFS = `<defs>
  <linearGradient id="dh-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2636" stop-opacity="0.8"/><stop offset="1" stop-color="#0e1621" stop-opacity="0.72"/></linearGradient>
  <linearGradient id="dh-glass-soft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2636" stop-opacity="0.55"/><stop offset="1" stop-color="#0e1621" stop-opacity="0.42"/></linearGradient>
  <linearGradient id="dh-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#121b28" stop-opacity="0"/><stop offset="0.18" stop-color="#121b28" stop-opacity="0.78"/><stop offset="0.82" stop-color="#121b28" stop-opacity="0.78"/><stop offset="1" stop-color="#121b28" stop-opacity="0"/></linearGradient>
  <linearGradient id="dh-fade-gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.gold}" stop-opacity="0"/><stop offset="0.25" stop-color="${C.gold}" stop-opacity="0.7"/><stop offset="0.75" stop-color="${C.gold}" stop-opacity="0.7"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></linearGradient>
</defs>`;

const poly = (points, { fill = 'url(#dh-glass)', stroke = C.line, op = 0.3, width = 1 } = {}) =>
  `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-opacity="${op}" stroke-width="${width}"/>`;
const line = (x1, y1, x2, y2, { stroke = C.line, op = 0.3, width = 1 } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-opacity="${op}" stroke-width="${width}"/>`;
const hex = (cx, cy, r) => [[cx, cy - r], [cx + r * 0.866, cy - r / 2], [cx + r * 0.866, cy + r / 2], [cx, cy + r], [cx - r * 0.866, cy + r / 2], [cx - r * 0.866, cy - r / 2]];
const diamond = (cx, cy, r) => [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
const panel = (x0, x1, y0, y1, side, color) => {
  // a score panel chamfered on its outer side (side -1: left panel, its point at the left; +1: right panel)
  const mid = (y0 + y1) / 2;
  return side < 0
    ? poly([[x0 + 18, y0], [x1, y0], [x1, y1], [x0 + 18, y1], [x0, mid]], { stroke: color, op: 0.6, width: 1 })
    : poly([[x0, y0], [x1 - 18, y0], [x1, mid], [x1 - 18, y1], [x0, y1]], { stroke: color, op: 0.6, width: 1 });
};
const timerPlate = (cx, y = 4) => poly([[cx - 48, y], [cx + 48, y], [cx + 58, y + 13], [cx + 48, y + 26], [cx - 48, y + 26], [cx - 58, y + 13]], { stroke: C.gold, op: 0.6 });

// ---- the frames: { w, h, body } in reference pixels (1920x1080 screen)
const PARTS = {
  // bottom left: the portrait (tight to the left edge) and its level badge
  portrait: { w: 150, h: 178, body: [
    poly(hex(75, 72, 66), { stroke: C.gold, op: 0.85, width: 1.6 }),
    poly(hex(75, 72, 57), { fill: 'none', stroke: C.silver, op: 0.35 }),
    line(75, 138, 75, 148, { stroke: C.gold, op: 0.5 }),
    poly([[49, 148], [101, 148], [108, 160], [101, 172], [49, 172], [42, 160]], { stroke: C.gold, op: 0.8, width: 1.2 }),
  ].join('') },
  // beside it: the class symbol, the HP readout, the segmented HP bar and the EXP bar
  vitals: { w: 470, h: 98, body: [
    poly(diamond(28, 28, 22), { stroke: C.gold, op: 0.85, width: 1.2 }),
    poly([[58, 10], [296, 10], [306, 27], [296, 44], [58, 44]]),
    line(58, 44, 200, 44, { stroke: C.cyan, op: 0.55, width: 1.2 }),
    poly([[64, 54], [446, 54], [438, 72], [56, 72]], { op: 0.32 }),
    ...Array.from({ length: 9 }, (_, i) => {
      const k = (i + 1) / 10;
      return line(64 + 382 * k, 55, 56 + 382 * k, 71, { op: 0.2 });
    }),
    poly([[60, 82], [424, 82], [420, 90], [56, 90]], { op: 0.22 }),
  ].join('') },
  // bottom centre: the special's emblem and its slim charge meter (how much a special costs differs by class: the
  // game marks it on the meter)
  special: { w: 470, h: 86, body: [
    `<circle cx="43" cy="43" r="34" fill="url(#dh-glass)" stroke="${C.gold}" stroke-opacity="0.85" stroke-width="1.4"/>`,
    `<circle cx="43" cy="43" r="27" fill="none" stroke="${C.silver}" stroke-opacity="0.28"/>`,
    poly([[92, 38], [444, 38], [436, 50], [84, 50]], { stroke: C.gold, op: 0.55 }),
    line(84, 57, 300, 57, { stroke: C.gold, op: 0.3 }),
  ].join('') },
  // bottom right: four skill slots, three small status bars and the weapon plate
  skills: { w: 540, h: 124, body: [
    ...[0, 1, 2, 3].map((i) => {
      const x = 8 + i * 96;
      return poly([[x + 12, 8], [x + 84, 8], [x + 84, 80], [x + 72, 92], [x, 92], [x, 20]], { stroke: C.cyan, op: 0.45, width: 0.9 })
        + line(x + 22, 104, x + 62, 104, { op: 0.25 });
    }),
    ...[22, 44, 66].map((y) => poly([[404, y], [532, y], [528, y + 6], [400, y + 6]], { op: 0.25 })),
    poly([[400, 82], [522, 82], [532, 95], [522, 108], [400, 108]], { op: 0.25 }),
  ].join('') },
  // top right: the kill count and five kill-feed rows
  kills: { w: 360, h: 214, body: [
    poly([[18, 4], [342, 4], [352, 20], [342, 36], [18, 36], [8, 20]], { stroke: C.gold, op: 0.7 }),
    `<rect x="270" y="10" width="64" height="20" rx="3" fill="none" stroke="${C.silver}" stroke-opacity="0.45"/>`,
    ...[0, 1, 2, 3, 4].map((i) => {
      const y = 46 + i * 33;
      return poly([[22, y], [338, y], [346, y + 13], [338, y + 26], [22, y + 26], [14, y + 13]], { fill: 'url(#dh-glass-soft)', op: 0.18 });
    }),
  ].join('') },
  // ---- top centre, by mode
  ctf: { w: 620, h: 124, body: [
    timerPlate(310),
    panel(60, 294, 38, 84, -1, C.cyan), panel(326, 560, 38, 84, 1, C.red),
    poly(diamond(310, 61, 9), { fill: C.gold, stroke: C.gold, op: 0.6 }),
    line(130, 104, 490, 104, { stroke: C.silver, op: 0.5 }),
    poly(diamond(130, 104, 4), { fill: C.silver, stroke: C.silver, op: 0.5 }), poly(diamond(490, 104, 4), { fill: C.silver, stroke: C.silver, op: 0.5 }),
    `<circle cx="190" cy="104" r="9" fill="url(#dh-glass)" stroke="${C.cyan}" stroke-opacity="0.45"/>`,
    `<circle cx="430" cy="104" r="9" fill="url(#dh-glass)" stroke="${C.red}" stroke-opacity="0.45"/>`,
  ].join('') },
  control3: { w: 660, h: 124, body: [
    panel(52, 236, 30, 76, -1, C.cyan), panel(424, 608, 30, 76, 1, C.red),
    ...[282, 330, 378].map((cx) => poly(hex(cx, 53, 20), { stroke: C.silver, op: 0.5 })),
    poly([[70, 86], [236, 86], [234, 90], [68, 90]], { op: 0.25 }), poly([[424, 86], [590, 86], [592, 90], [426, 90]], { op: 0.25 }),
  ].join('') },
  control1: { w: 440, h: 92, body: [
    panel(42, 196, 22, 62, -1, C.cyan), panel(244, 398, 22, 62, 1, C.red),
    `<circle cx="220" cy="42" r="22" fill="url(#dh-glass)" stroke="${C.gold}" stroke-opacity="0.7" stroke-width="1.2"/>`,
    ...[208, 220, 232].map((x) => `<circle cx="${x}" cy="80" r="3" fill="none" stroke="${C.silver}" stroke-opacity="0.45"/>`),
  ].join('') },
  tdm: { w: 520, h: 112, body: [
    timerPlate(260),
    panel(42, 244, 38, 84, -1, C.cyan), panel(276, 478, 38, 84, 1, C.red),
    line(260, 42, 260, 80, { stroke: C.gold, op: 0.55 }),
    poly([[206, 90], [314, 90], [320, 99], [314, 108], [206, 108], [200, 99]], { op: 0.3 }),
  ].join('') },
  duel: { w: 440, h: 104, body: [
    panel(40, 190, 30, 72, -1, C.cyan), panel(250, 400, 30, 72, 1, C.red),
    `<circle cx="220" cy="51" r="24" fill="url(#dh-glass)" stroke="${C.gold}" stroke-opacity="0.7" stroke-width="1.2"/>`,
    ...[92, 110, 128].map((x) => poly(diamond(x, 88, 5), { fill: 'none', stroke: C.cyan, op: 0.5 })),
    ...[312, 330, 348].map((x) => poly(diamond(x, 88, 5), { fill: 'none', stroke: C.red, op: 0.5 })),
  ].join('') },
  // ---- announcements under the scoreboard (the text is the game's)
  bannerObjective: { w: 640, h: 58, body: [
    `<rect x="0" y="10" width="640" height="38" fill="url(#dh-fade)"/>`,
    `<rect x="0" y="10" width="640" height="1" fill="url(#dh-fade-gold)"/>`,
    `<rect x="0" y="47" width="640" height="1" fill="url(#dh-fade-gold)"/>`,
    poly(diamond(130, 29, 4), { fill: C.gold, stroke: C.gold, op: 0.6 }), poly(diamond(510, 29, 4), { fill: C.gold, stroke: C.gold, op: 0.6 }),
  ].join('') },
  bannerEvent: { w: 700, h: 70, body: [
    `<rect x="0" y="8" width="700" height="54" fill="url(#dh-fade)"/>`,
    `<rect x="0" y="8" width="700" height="1" fill="url(#dh-fade-gold)"/>`,
    `<rect x="40" y="12" width="620" height="1" fill="url(#dh-fade-gold)" opacity="0.5"/>`,
    `<rect x="0" y="61" width="700" height="1" fill="url(#dh-fade-gold)"/>`,
    poly(diamond(120, 35, 5), { fill: C.gold, stroke: C.gold, op: 0.6 }), poly(diamond(580, 35, 5), { fill: C.gold, stroke: C.gold, op: 0.6 }),
  ].join('') },
};

// where each frame sits on a 1920x1080 screen (client/duelistHud.css uses the same layout)
export const LAYOUT = {
  portrait: { x: 18, y: H - 178 - 22 },
  vitals: { x: 164, y: H - 98 - 40 },
  special: { x: (W - 470) / 2, y: H - 86 - 26 },
  skills: { x: W - 540 - 22, y: H - 124 - 18 },
  kills: { x: W - 360 - 18, y: 18 },
  ctf: { x: (W - 620) / 2, y: 14 },
  control3: { x: (W - 660) / 2, y: 14 },
  control1: { x: (W - 440) / 2, y: 14 },
  tdm: { x: (W - 520) / 2, y: 14 },
  duel: { x: (W - 440) / 2, y: 14 },
  bannerObjective: { x: (W - 640) / 2, y: 142 },
  bannerEvent: { x: (W - 700) / 2, y: 204 },
};

const TEMPLATES = {
  'universal-hud': ['portrait', 'vitals', 'special', 'skills', 'kills'],
  'scoreboard-capture-the-flag': ['ctf'],
  'scoreboard-three-point-control': ['control3'],
  'scoreboard-single-control-point': ['control1'],
  'scoreboard-team-deathmatch': ['tdm'],
  'scoreboard-duel': ['duel'],
  'notification-objective': ['bannerObjective'],
  'notification-event': ['bannerEvent'],
};

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${DEFS}${body}</svg>\n`;

mkdirSync(join(out, 'parts'), { recursive: true });
mkdirSync(join(out, 'templates'), { recursive: true });
for (const [id, p] of Object.entries(PARTS)) writeFileSync(join(out, 'parts', `${id}.svg`), svg(p.w, p.h, p.body));
for (const [name, parts] of Object.entries(TEMPLATES)) {
  const body = parts.map((id) => `<g transform="translate(${LAYOUT[id].x} ${LAYOUT[id].y})">${PARTS[id].body}</g>`).join('');
  const text = svg(W, H, body);
  writeFileSync(join(out, 'templates', `${name}.svg`), text);
  await sharp(Buffer.from(text)).png().toFile(join(out, 'templates', `${name}.png`));
}
console.log(`${Object.keys(PARTS).length} parts and ${Object.keys(TEMPLATES).length} 1920x1080 templates (SVG + RGBA PNG) -> ${out}`);
