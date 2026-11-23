/**
 * Fantasy Battle downloads: the cut PNG layers (one by one or as a .zip), the rig and skills JSON, a standalone HTML
 * player built from the same puppet core, and image recolours for setLayerTexture demos. The zip uses the fflate copy
 * that ships inside three (no new dependency).
 */
import { zipSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import coreSource from './core/puppetCore.mjs?raw';
import timelineSource from './core/skillTimeline.mjs?raw';
import playerSource from './standalone/playerRuntime.js?raw';
import rigData from './data/archerRig.json';
import skillDoc from './data/bowSkills.json';
import { ASSET_BASE } from './FantasyBattleStage.js';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const jsonBlob = (value) => new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });

export function downloadJson(value, filename) {
  downloadBlob(jsonBlob(value), filename);
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const README = `Silver Archer - Fantasy Battle layer kit

layers/*.png     every part cut from the owner's parts sheet (alpha-connected regions), plus the closed-eye blink patch,
                 hands split from their bracers, the bow without its painted string and a procedural arrow
parts.json       each layer's position on the source sheet (origin) and size
archerRig.json   bones (joint positions), layers (pivot on the sheet, position, z, mesh grid, parallax depth, springs),
                 expressions, sockets, stances, breathing and look settings
bowSkills.json   the skills as data: keyframes with phases and easing, per-bone rotation/offset/smearStretch/zIndex,
                 events (onHitFrame, playSFX, screenShake, spawnArrow, spawnEffect, hitStop)
player.html      a standalone player (Canvas 2D) running the same puppet core as the game
`;

/** Every PNG in parts.json, the JSON files, a readme and the standalone player, zipped. */
export async function buildKitZip(manifest, onProgress) {
  const files = { 'README.txt': strToU8(README), 'parts.json': strToU8(JSON.stringify(manifest, null, 1)), 'archerRig.json': strToU8(JSON.stringify(rigData, null, 2)), 'bowSkills.json': strToU8(JSON.stringify(skillDoc, null, 1)) };
  const names = Object.keys(manifest.parts);
  let done = 0;
  await Promise.all(names.map(async (name) => {
    files[`layers/${name}.png`] = [await fetchBytes(`${ASSET_BASE}${name}.png`), { level: 0 }];
    done += 1;
    onProgress?.(done / names.length);
  }));
  files['player.html'] = strToU8(await buildStandaloneHtml(manifest));
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' });
}

async function dataUrlOf(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Turn an ES module with no imports into plain script text (the standalone page has no bundler). */
export function inlineModule(source) {
  if (/^\s*import\s/m.test(source)) throw new Error('standalone sources must not import');
  return source.replace(/^export\s+(?=(async\s+)?(function|const|let|class)\b)/gm, '');
}

/** One self-contained HTML file: the layers the rig uses as data URLs, the rig, the skills and the player. */
export async function buildStandaloneHtml(manifest) {
  const needed = [...new Set([...rigData.layers.map((l) => l.part), ...Object.values(rigData.expressions), 'arrow'])];
  const images = Object.fromEntries(await Promise.all(needed.map(async (n) => [n, await dataUrlOf(`${ASSET_BASE}${n}.png`)])));
  const parts = { ...manifest, parts: Object.fromEntries(needed.map((n) => [n, manifest.parts[n]])) };
  const payload = JSON.stringify({ rig: rigData, parts, skills: skillDoc.skills, images }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Silver Archer - Fantasy Battle player</title>
<style>
  html, body { margin: 0; height: 100%; background: #120f1c; color: #f3e9ff; font-family: system-ui, sans-serif; }
  #fb-canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
  #fb-ui { position: fixed; left: 10px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
  #fb-ui button { padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.3); background: rgba(20,14,32,0.8); color: inherit; cursor: pointer; }
  #fb-help { position: fixed; left: 10px; top: 8px; font-size: 12px; opacity: 0.75; }
</style>
</head>
<body>
<canvas id="fb-canvas"></canvas>
<div id="fb-help">Silver Archer: move the mouse to look; keys 1, 2, 3 play the bow skills.</div>
<div id="fb-ui"></div>
<script>window.FB_DATA = ${payload};</script>
<script>
(function () {
${inlineModule(timelineSource)}
${inlineModule(coreSource)}
${playerSource.replace(/^\/\* global[^*]*\*\/\s*/m, '')}
}());
</script>
</body>
</html>
`;
}

/** A recoloured copy of an image (CSS filter on a canvas), as a data URL for setLayerTexture. */
export async function recolorImage(url, filter) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext('2d');
  g.filter = filter;
  g.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}
