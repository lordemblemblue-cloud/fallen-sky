#!/usr/bin/env node
// Downloads the world models the game loads from the Base44 CDN (the app's own uploads) into a folder, so they can
// be counted (scripts/game3d-glb-stats.mjs) and converted (tools/low-poly/*.py). The files are not committed.
//
//   node scripts/game3d-fetch-world-models.mjs <out-dir>
import fs from 'node:fs';
import path from 'node:path';

export const WORLD_CDN_MODELS = Object.freeze({
  // owner long-grass tiles (WolfveilGrassTileReplacement.js)
  'long-grass-near.glb': 'https://media.base44.com/files/public/6876751a602125f45f1861b9/baf170ee6_Long_Grass_Tile_2m_Game3D_LOD_near.glb',
  'long-grass-far.glb': 'https://media.base44.com/files/public/6876751a602125f45f1861b9/7553e869a_Long_Grass_Tile_2m_Game3D_LOD_far.glb',
  'long-grass-full.glb': 'https://media.base44.com/files/public/6876751a602125f45f1861b9/9742a2995_Long_Grass_Tile_2m_Game3D.glb',
  // owner landscape models beside the routes (WolfveilOwnerLandscapeAssets.mjs)
  'realistic-grass.glb': 'https://media.base44.com/files/public/6876751a602125f45f1861b9/f5e95a78a_realistics_grass_06_1_.glb',
  'plant-pack.glb': 'https://media.base44.com/files/public/6876751a602125f45f1861b9/42cb63080_stylized_plant_pack_1_.glb',
  'garden-leaves.glb': 'https://media.base44.com/files/public/6876751a602125f45f1861b9/3f9132732_wolfveil_garden_leaves_optimized.glb',
  // ambient birds (wolfveil/ambient/WolfveilAmbientBirds.mjs)
  'ambient-bird.glb': 'https://media.base44.com/files/public/6ab42219a52fd34656a53b37/d9fad7809_tripo_convert_bdd73c28-af44-45e3-b758-1d783314f872.glb',
  // town guards (living quarter)
  'guard-warden.glb': 'https://media.base44.com/files/public/6ab42219a52fd34656a53b37/b06321b8e_falling_sky_guard_warden_game.glb',
  'guard-blue.glb': 'https://media.base44.com/files/public/6ab42219a52fd34656a53b37/18d7c6281_falling_sky_guard_blue_optimized.glb',
});

const out = process.argv[2];
if (!out) { console.error('usage: node scripts/game3d-fetch-world-models.mjs <out-dir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
for (const [name, url] of Object.entries(WORLD_CDN_MODELS)) {
  const file = path.join(out, name);
  if (fs.existsSync(file)) { console.log('have', name); continue; }
  const response = await fetch(url);
  if (!response.ok) { console.log('FAILED', name, response.status); continue; }
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  console.log('saved', name, fs.statSync(file).size);
}
