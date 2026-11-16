#!/usr/bin/env node
// Rebuilds the Game 3D weapon pack: optimizes each source GLB in headless Blender, then solves the grip of
// every weapon on every supported rig and writes public/game3d/weapons/manifest.json.
//
//   node tools/game3d-weapons/build-weapons.mjs                 # all weapons, then the manifest
//   node tools/game3d-weapons/build-weapons.mjs odachi          # only these ids (manifest keeps the others)
//   node tools/game3d-weapons/build-weapons.mjs --grips-only    # skip Blender, re-solve grips from the existing meta
//   options: --source-dir <dir>  --blender <exe>  --preview <dir> (flat-side check renders)
//
// Sources stay where they are (read only). Blender runs with --factory-startup, never touching a user session.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRigs, rigManifest, solveWeaponGrips } from './calibrate-grips.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/game3d-weapons/weapons.config.json'), 'utf8'));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const gripsOnly = args.includes('--grips-only') && args.splice(args.indexOf('--grips-only'), 1);
const sourceDir = opt('--source-dir', CONFIG.sourceDir);
const blender = opt('--blender', process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe');
const previewDir = opt('--preview', null);
const only = new Set(args);
const outDir = path.join(ROOT, CONFIG.outDir);
const metaDir = path.join(ROOT, 'tools/game3d-weapons/meta'); // measured points, kept out of the shipped folder
fs.mkdirSync(metaDir, { recursive: true });
if (previewDir) fs.mkdirSync(previewDir, { recursive: true });

if (!gripsOnly) {
  for (const spec of CONFIG.weapons) {
    if (only.size && !only.has(spec.id)) continue;
    const src = path.join(sourceDir, spec.source);
    if (!fs.existsSync(src)) throw new Error(`missing source ${src}`);
    const specFile = path.join(os.tmpdir(), `axe-weapon-${spec.id}.json`);
    fs.writeFileSync(specFile, JSON.stringify(spec));
    const out = path.join(outDir, `${spec.id}.glb`);
    const meta = path.join(metaDir, `${spec.id}.json`);
    const extra = previewDir ? [path.join(previewDir, `${spec.id}.png`)] : [];
    console.log(`optimizing ${spec.id} <- ${spec.source}`);
    const run = spawnSync(blender, ['-b', '--factory-startup', '--python', path.join(ROOT, 'tools/game3d-weapons/optimize_weapon.py'), '--', specFile, src, out, meta, ...extra],
      { encoding: 'utf8', maxBuffer: 64 << 20 });
    const ok = /OPTIMIZE_OK/.test(run.stdout || '');
    if (!ok) { console.error(run.stdout?.slice(-4000), run.stderr?.slice(-4000)); throw new Error(`Blender failed on ${spec.id}`); }
    console.log(`  ${(fs.statSync(out).size / 1048576).toFixed(2)} MB`, (run.stdout.match(/OPTIMIZE_OK.*/) || [''])[0]);
  }
}

// Manifest: weapon entries + per-rig grips solved from each rig's bind pose.
const rigs = loadRigs(ROOT);
const weapons = [];
for (const spec of CONFIG.weapons) {
  const metaFile = path.join(metaDir, `${spec.id}.json`);
  if (!fs.existsSync(metaFile)) { console.warn(`no meta for ${spec.id}; run without --grips-only`); continue; }
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const glb = path.join(outDir, `${spec.id}.glb`);
  weapons.push({
    id: spec.id, label: spec.label, class: spec.class, url: `/game3d/weapons/${spec.id}.glb`,
    bytes: fs.statSync(glb).size, tris: meta.tris, length: meta.length,
    hand: spec.class === 'bow' ? 'left' : 'right',
    points: {
      ...Object.fromEntries(['tip', 'secondaryGrip', 'nock', 'stringTop', 'stringBottom', 'limbTop', 'limbBottom']
        .filter((k) => meta[k]).map((k) => [k, meta[k]])),
      ...(meta.guardLowerY !== undefined ? { bladeBase: [0, Number((meta.guardLowerY + 0.03).toFixed(4)), 0] } : {}),
    },
    handleRadius: meta.handleRadius,
    ...(spec.class === 'bow' ? { dynamicString: true, stringSource: meta.stringSource } : {}),
    ...(spec.emissive ? { emissive: spec.emissive } : {}),
    grips: solveWeaponGrips(spec.class, meta, rigs),
  });
}
const manifest = {
  version: 1,
  generatedBy: 'tools/game3d-weapons/build-weapons.mjs',
  convention: 'Weapon GLB: origin at the main grip, +Y to the tip / upper limb, +Z blade edge / arrow flight, metres for a 1.7 m body. Grip: the weapon root as a child of the hand bone (position, quaternion xyzw, uniform scale) in that bone\'s local space; "carry" while idle or moving, "combat" while attacking or aiming. Bone names are glTF names (three.js strips ":").',
  rigs: rigManifest(rigs),
  weapons,
};
// readable but compact: number arrays stay on one line
const json = JSON.stringify(manifest, null, 1).replace(/\[\s*(-?[\d.e-]+(?:,\s*-?[\d.e-]+)*)\s*\]/g, (m, inner) => `[${inner.split(/,\s*/).join(', ')}]`);
fs.writeFileSync(path.join(outDir, 'manifest.json'), json + '\n');
console.log(`manifest: ${weapons.length} weapons x ${Object.keys(manifest.rigs).length} rigs`);
for (const r of Object.values(rigs)) for (const [side, h] of Object.entries(r.hands)) {
  console.log(`  ${r.id} ${side}: hand ${h.palm.h.toFixed(4)} units, thumb on palm side ${h.palm.thumbSide === null ? 'n/a' : (h.palm.thumbSide > 0)}, fist bones ${Object.keys(h.fist).length}`);
}
