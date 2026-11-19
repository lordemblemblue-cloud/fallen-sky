#!/usr/bin/env node
/* global console, URL, Buffer */
// Wolfveil doorway survey maps (natural-zone audit, Phase A, 2026-11-18).
//   docs/game3d/zones-20261118/map-current-five-areas.jpg
//     today's five rectangles, veils and the 11 gates, river, roads, bridges,
//     mob areas, zombie camps, cave mouths and tunnels, and how far a standing
//     player can see past each gate (terrain-only sightlines, trees ignored).
//   docs/game3d/zones-20261118/map-natural-zone-proposal.jpg
//     the proposed natural zones and authored doorways, and the built Phase B
//     grotto prototype.
// Usage: node scripts/render-wolfveil-doorway-survey-map.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {
  WOLFVEIL_MAP_ROADS, WOLFVEIL_MAP_RIVER, WOLFVEIL_MAP_BRIDGES, WOLFVEIL_MAP_MOB_AREAS,
  WOLFVEIL_MAP_UNDERLAY, projectWolfveilMap,
} from '../src/components/game3d/wolfveil/WolfveilMapDesign.mjs';
import {WOLFVEIL_AREA_BORDERS as B, WOLFVEIL_AREAS, wolfveilAreaAtLocal} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {wolfveilAreaGates} from '../src/components/game3d/wolfveil/streaming/WolfveilAreaVeils.mjs';
import {WOLFVEIL_ZOMBIE_CAMPS} from '../src/components/game3d/wolfveil/WolfveilZombieCamps.mjs';
import {WOLFVEIL_EXPLORABLE_CAVES, WOLFVEIL_CAVE_CORRIDORS, WOLFVEIL_CAVE_HUB} from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import {WOLFVEIL_NATURAL_ZONE_PROPOSAL} from '../src/components/game3d/wolfveil/zones/WolfveilZoneGraph.mjs';
import {GROTTO_PLAN, grottoFootprintSamples} from '../src/components/game3d/wolfveil/zones/WolfveilGrottoZonePlan.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const OUT = path.join(root, 'docs/game3d/zones-20261118');
const SIZE = 1280, Z = 70, HEAD = 56;
const P = (x, zLocal) => projectWolfveilMap(x, zLocal + Z, SIZE);
const pw = (x, zWorld) => projectWolfveilMap(x, zWorld, SIZE);
const f = n => n.toFixed(1);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const poly = (pts, style) => `<polyline points="${pts.map(p => f(p.x) + ',' + f(p.y + HEAD)).join(' ')}" ${style}/>`;
const text = (x, y, s, {size = 13, fill = '#fff', anchor = 'start', weight = 600} = {}) =>
  `<text x="${f(x)}" y="${f(y + HEAD)}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" stroke="#000" stroke-width="3" paint-order="stroke">${esc(s)}</text>`;

function baseLayers() {
  const out = [];
  for (const road of WOLFVEIL_MAP_ROADS)
    out.push(poly(road.points.map(([x, z]) => pw(x, z)), `fill="none" stroke="${road.kind === 'frontier' ? '#e9c9a0' : '#d8c3a0'}" stroke-width="${road.kind === 'primary' ? 3 : 2}" stroke-opacity=".8" stroke-dasharray="${road.kind === 'frontier' ? '6 4' : ''}"`));
  out.push(poly(WOLFVEIL_MAP_RIVER.points.map(([x, z]) => pw(x, z)), `fill="none" stroke="#4fb3ff" stroke-width="${WOLFVEIL_MAP_RIVER.width / 1100 * SIZE}" stroke-opacity=".75" stroke-linecap="round" stroke-linejoin="round"`));
  for (const bridge of WOLFVEIL_MAP_BRIDGES)
    out.push(poly([pw(...bridge.from), pw(...bridge.to)], 'fill="none" stroke="#f4e3c1" stroke-width="5"'));
  return out;
}
function cavesLayer(color = '#c48bff') {
  const out = [];
  for (const corridor of WOLFVEIL_CAVE_CORRIDORS)
    out.push(poly(corridor.waypoints.map(([x, , z]) => P(x, z)), `fill="none" stroke="${color}" stroke-width="1.6" stroke-opacity=".75" stroke-dasharray="4 3"`));
  const hub = P(WOLFVEIL_CAVE_HUB.x, WOLFVEIL_CAVE_HUB.z);
  out.push(`<circle cx="${f(hub.x)}" cy="${f(hub.y + HEAD)}" r="${WOLFVEIL_CAVE_HUB.radius / 1100 * SIZE}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="3 3"/>`);
  out.push(text(hub.x + 22, hub.y + 4, 'Rotunda (underground)', {size: 11, fill: color}));
  for (const cave of WOLFVEIL_EXPLORABLE_CAVES) {
    const m = P(cave.mouth[0], cave.mouth[1]);
    out.push(`<path d="M ${f(m.x - 9)} ${f(m.y + HEAD + 7)} Q ${f(m.x)} ${f(m.y + HEAD - 13)} ${f(m.x + 9)} ${f(m.y + HEAD + 7)} Z" fill="${color}" stroke="#000" stroke-width="1.5"/>`);
    out.push(text(m.x + 12, m.y - 6, cave.nameShort || cave.name, {size: 12, fill: color}));
  }
  return out;
}
// Terrain-only line of sight from 2.6 m above each gate: the farthest point a
// standing player can see past the border, ray by ray.
function sightlines(gate) {
  const eye = gate.baseY + 2.6, rays = [];
  for (let k = 0; k < 72; k++) {
    const angle = k / 72 * Math.PI * 2, dx = Math.sin(angle), dz = Math.cos(angle);
    let maxSlope = -Infinity, visible = 0;
    for (let d = 4; d <= 650; d += 4) {
      const x = gate.x + dx * d, z = gate.z + dz * d;
      if (Math.abs(x) > 549 || Math.abs(z) > 549) break;
      const slope = (wolfveilHeight(x, z) - eye) / d;
      if (slope >= maxSlope) { maxSlope = slope; visible = d; }
    }
    const end = {x: gate.x + dx * visible, z: gate.z + dz * visible};
    const area = wolfveilAreaAtLocal(end.x, end.z);
    rays.push({end, visible, beyond: area && area !== gate.behind && area !== gate.ahead ? 'third' : area === gate.ahead ? 'ahead' : 'behind'});
  }
  return rays;
}

async function compose(name, title, layers, legend) {
  const base = await sharp(path.join(root, 'public', WOLFVEIL_MAP_UNDERLAY.url)).resize(SIZE, SIZE, {kernel: 'lanczos3'}).toBuffer();
  const legendH = 24 * Math.ceil(legend.length / 3) + 18;
  const H = SIZE + HEAD + legendH;
  const legendSvg = legend.map(([color, label, dash], i) => {
    const x = 16 + (i % 3) * (SIZE / 3), y = SIZE + HEAD + 18 + Math.floor(i / 3) * 24;
    return `<line x1="${x}" y1="${y}" x2="${x + 26}" y2="${y}" stroke="${color}" stroke-width="5" ${dash ? 'stroke-dasharray="5 4"' : ''}/>` +
      `<text x="${x + 34}" y="${y + 5}" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#e8e8e8">${esc(label)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${H}">
    <rect x="0" y="0" width="${SIZE}" height="${HEAD}" fill="#14161a"/>
    <text x="16" y="36" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="#f4f1ea">${esc(title)}</text>
    <rect x="0" y="${SIZE + HEAD}" width="${SIZE}" height="${legendH}" fill="#14161a"/>
    ${layers.join('\n')}
    ${legendSvg}
    <text x="${SIZE - 16}" y="${SIZE + HEAD - 10}" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#fff" text-anchor="end" stroke="#000" stroke-width="3" paint-order="stroke">North up · 1,100 m core · Play coordinates (local Z + 70)</text>
  </svg>`;
  await sharp({create: {width: SIZE, height: H, channels: 3, background: '#14161a'}})
    .composite([{input: base, top: HEAD, left: 0}, {input: Buffer.from(svg), top: 0, left: 0}])
    .jpeg({quality: 86}).toFile(path.join(OUT, name));
  console.log('wrote', path.join('docs/game3d/zones-20261118', name));
}

fs.mkdirSync(OUT, {recursive: true});
const gates = wolfveilAreaGates();
const report = [];
{ // ---------------------------------------------------- current five areas
  const layers = baseLayers();
  for (const mob of WOLFVEIL_MAP_MOB_AREAS) {
    const c = pw(mob.x, mob.z);
    layers.push(`<circle cx="${f(c.x)}" cy="${f(c.y + HEAD)}" r="${f(mob.radius / 1100 * SIZE)}" fill="#e5675f" fill-opacity=".18" stroke="#e5675f" stroke-width="1.4"/>`);
  }
  for (const camp of WOLFVEIL_ZOMBIE_CAMPS) {
    const c = P(camp.x, camp.z);
    layers.push(`<rect x="${f(c.x - 6)}" y="${f(c.y + HEAD - 6)}" width="12" height="12" fill="#ff3b30" stroke="#000" stroke-width="1.5" transform="rotate(45 ${f(c.x)} ${f(c.y + HEAD)})"/>`);
    layers.push(text(c.x + 10, c.y + 14, 'Z' + camp.number + ' L' + camp.level, {size: 11, fill: '#ffb4ad'}));
  }
  layers.push(...cavesLayer());
  for (const gate of gates) {
    const rays = sightlines(gate);
    for (const ray of rays) {
      if (ray.beyond === 'behind' || ray.visible < 60) continue;
      const a = P(gate.x, gate.z), b = P(ray.end.x, ray.end.z);
      layers.push(`<line x1="${f(a.x)}" y1="${f(a.y + HEAD)}" x2="${f(b.x)}" y2="${f(b.y + HEAD)}" stroke="#ffe37a" stroke-width="1" stroke-opacity=".38"/>`);
    }
    const ahead = rays.filter(r => r.beyond !== 'behind').map(r => r.visible);
    report.push({id: gate.id, label: gate.label, kind: gate.kind, behind: gate.behind, ahead: gate.ahead,
      x: +gate.x.toFixed(1), z: +gate.z.toFixed(1),
      sightlinePastBorder: {median: ahead.sort((p, q) => p - q)[ahead.length >> 1] || 0, max: Math.max(0, ...ahead)}});
  }
  // Five rectangles: the border lines (the veils stand on them).
  const H = 550;
  for (const [x1, z1, x2, z2] of [
    [-H, B.northZ, H, B.northZ], [B.westX, B.southZ, B.westX, B.northZ], [B.eastX, B.southZ, B.eastX, B.northZ],
    [B.westX, B.southZ, B.eastX, B.southZ], [B.westX, -H, B.westX, B.southZ], [B.eastX, -H, B.eastX, B.southZ],
  ]) layers.push(poly([P(x1, z1), P(x2, z2)], 'fill="none" stroke="#ffffff" stroke-width="3" stroke-opacity=".9" stroke-dasharray="10 6"'));
  const labels = {town: [-40, 40], south: [-30, -420], west: [-470, -150], east: [300, 40], north: [-60, 420]};
  for (const area of WOLFVEIL_AREAS) {
    const [x, z] = labels[area.id], c = P(x, z);
    layers.push(text(c.x, c.y, area.label.toUpperCase(), {size: 16, fill: '#ffffff', weight: 800}));
  }
  gates.forEach((gate, i) => {
    const c = P(gate.x, gate.z);
    layers.push(`<circle cx="${f(c.x)}" cy="${f(c.y + HEAD)}" r="11" fill="${gate.kind === 'bridge' ? '#d43d2a' : '#1d1d1f'}" stroke="#fff" stroke-width="2"/>`);
    layers.push(text(c.x, c.y + 5, String(i + 1), {size: 12, anchor: 'middle', weight: 800}));
  });
  await compose('map-current-five-areas.jpg', 'Wolfveil today: five rectangles, veils and 11 gates (survey 2026-11-18)', layers, [
    ['#ffffff', 'Area border / spirit veil (rectangles)', true], ['#d43d2a', 'Bridge torii gate (numbered)'], ['#1d1d1f', 'Trail torii gate (numbered)'],
    ['#ffe37a', 'Terrain-only sightline past the gate (2.6 m eye)'], ['#4fb3ff', 'Silverrun river'], ['#d8c3a0', 'Roads (frontier trail dashed)'],
    ['#e5675f', 'Mob areas'], ['#ff3b30', 'Zombie camps (Z#, level)'], ['#c48bff', 'Cave mouths, tunnels, rotunda', true],
  ]);
}
{ // ---------------------------------------------------- proposal
  const layers = baseLayers();
  layers.push(...cavesLayer('#b48cff'));
  for (const zone of WOLFVEIL_NATURAL_ZONE_PROPOSAL.zones) {
    if (zone.id.startsWith('grotto')) continue;
    const c = P(zone.anchor[0], zone.anchor[1]);
    layers.push(text(c.x, c.y - 18, zone.label, {size: 14, fill: '#b9f5c9', anchor: 'middle', weight: 800}));
  }
  const doorColor = {B: '#5eead4', C: '#fbbf24', D: '#60a5fa', E: '#a3e635'};
  WOLFVEIL_NATURAL_ZONE_PROPOSAL.doorways.forEach((door, i) => {
    if (door.id === 'grotto_inner') return;
    const c = P(door.at[0], door.at[1]);
    layers.push(`<rect x="${f(c.x - 8)}" y="${f(c.y + HEAD - 8)}" width="16" height="16" fill="${doorColor[door.phase]}" stroke="#000" stroke-width="2" transform="rotate(45 ${f(c.x)} ${f(c.y + HEAD)})"/>`);
    layers.push(text(c.x + 12, c.y + 5, 'D' + (i + 1) + ' ' + door.kind + ' (' + door.phase + ')', {size: 11, fill: doorColor[door.phase]}));
  });
  // The built prototype footprint.
  for (const s of grottoFootprintSamples(2)) {
    const c = P(s.x, s.z);
    layers.push(`<circle cx="${f(c.x)}" cy="${f(c.y + HEAD)}" r="1.4" fill="${s.zone === 'grotto_hall' ? '#5eead4' : '#f472b6'}"/>`);
  }
  const g = P(GROTTO_PLAN.mouth.x, GROTTO_PLAN.mouth.z);
  layers.push(text(g.x + 14, g.y + 34, 'Phase B prototype: grotto hall + chamber (built, behind the flag)', {size: 12, fill: '#5eead4'}));
  await compose('map-natural-zone-proposal.jpg', 'Proposal: natural zones joined by authored doorways (not built except Phase B)', layers, [
    ['#5eead4', 'Phase B: built prototype doorway'], ['#fbbf24', 'Phase C: town-forest trailhead'], ['#60a5fa', 'Phase D: one bridge landing'],
    ['#a3e635', 'Phase E: remaining doorways'], ['#b9f5c9', 'Candidate zone (label at its anchor)'], ['#b48cff', 'Caves and tunnels', true],
  ]);
}
fs.writeFileSync(path.join(OUT, 'gate-sightlines.json'), JSON.stringify(report, null, 1) + '\n');
console.log('wrote docs/game3d/zones-20261118/gate-sightlines.json');
