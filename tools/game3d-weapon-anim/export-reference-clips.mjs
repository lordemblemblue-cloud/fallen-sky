#!/usr/bin/env node
/* global process, console */
// The owner's weapon animations as reference clips for the Weapon Animation Studio (tools/game3d-weapon-anim/README.md):
//
//   node tools/game3d-weapon-anim/export-reference-clips.mjs [--out <studio folder>] [--body male|female|both]
//        [--downloads "C:/Users/<you>/Downloads"] [--blender "<blender.exe>"] [--only ref_af_sword_attack,...]
//
// Every source clip is retargeted onto the fused body (src/lib/mocap/retarget.js; FBX goes through Blender in the
// background, tools/mocap/blender/fbx_to_glb.py), kept in place (the game moves the hero itself; a dash or an aim walk
// keeps its steps, not its travel) and written as one animation of <out>/ref-clips-<body>.glb, the body with those
// clips. build_studio.py --refs imports them as actions named ref_<source>_<clip>, to borrow poses, timing and arcs
// from, or to copy keys into a game clip. The sources are the owner's files and stay out of the repository:
//   - the ActionForge 80-clip pack (actionforge_80_clips_fit.glb): its sword, shield, block and melee clips (ref_af_*);
//   - the Mixamo Pro Longbow Pack: the draw, aim, recoil, equip, block and melee FBX (ref_longbow_*);
//   - the Meshy exports (zipped FBX): Charged_Slash and the three Archery_Shot takes (ref_meshy_*).
// A missing source is reported and skipped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { retargetToRig } from '../../src/lib/mocap/retarget.js';
import { parseGlb, appendAnimation, serializeGlb } from '../../src/lib/mocap/glbClip.js';
import { BODY_FILES, bodiesOf, gltfSource, loadBody, loadFbxSource, parseArgs } from '../avatar-motion/mobility-clips.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_DOWNLOADS = process.env.WEAPON_ANIM_DOWNLOADS || path.join(os.homedir(), 'Downloads');

export const ACTIONFORGE_FILE = 'actionforge_80_clips_fit.glb';
export const ACTIONFORGE_CLIPS = Object.freeze(['sword_attack', 'sword_dash', 'sword_heavy_combo', 'sword_idle', 'sword_regular_a',
  'sword_regular_b', 'sword_regular_c', 'sword_regular_combo', 'sword_regular_a_rec', 'sword_regular_b_rec', 'sword_block',
  'shield_oneshot', 'shield_dash', 'idle_shield_loop', 'idle_shield_break', 'melee_hook', 'melee_hook_rec', 'punch_jab',
  'punch_cross', 'overhandthrow']);
export const LONGBOW_DIR = 'Pro Longbow Pack';
export const LONGBOW_CLIPS = Object.freeze(['standing draw arrow', 'standing aim overdraw', 'standing aim recoil',
  'standing aim walk forward', 'standing aim walk back', 'standing aim walk left', 'standing aim walk right',
  'standing equip bow', 'standing disarm bow', 'standing block', 'standing idle 01', 'standing melee kick',
  'standing melee punch']);
const MESHY_PREFIX = 'Meshy_AI_male_warrior_character_rigged_20261117_animated_mixamo_without_skin_';
export const MESHY_CLIPS = Object.freeze(['Charged_Slash', 'Archery_Shot', 'Archery_Shot_2', 'Archery_Shot_3']);

const slug = (text) => String(text).toLowerCase().replace(/^standing /, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Every reference clip this tool knows: { name, kind: 'glb' | 'fbx' | 'zip', file, anim? }. */
export function referenceSources(downloads = DEFAULT_DOWNLOADS) {
  return [
    ...ACTIONFORGE_CLIPS.map((clip) => ({ name: `ref_af_${clip}`, kind: 'glb', file: path.join(downloads, ACTIONFORGE_FILE), anim: `${clip}_fit` })),
    ...LONGBOW_CLIPS.map((clip) => ({ name: `ref_longbow_${slug(clip)}`, kind: 'fbx', file: path.join(downloads, LONGBOW_DIR, `${clip}.fbx`) })),
    ...MESHY_CLIPS.map((clip) => ({ name: `ref_meshy_${slug(clip)}`, kind: 'zip', file: path.join(downloads, `${MESHY_PREFIX}${clip}.zip`) })),
  ];
}

// The .fbx of a zipped export, extracted on its own into a new empty folder (nothing else in the archive is read).
function fbxFromZip(zip) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapon-ref-'));
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'unzip';
  const args = process.platform === 'win32' ? ['-xf', zip, '-C', dir, '*.fbx'] : ['-j', zip, '*.fbx', '-d', dir];
  const r = spawnSync(tar, args, { encoding: 'utf8' });
  const find = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? find(path.join(d, e.name))
    : e.name.toLowerCase().endsWith('.fbx') ? [path.join(d, e.name)] : []));
  const found = fs.existsSync(dir) ? find(dir) : [];
  if (!found.length) throw new Error(`no .fbx extracted from ${zip} (${r.error?.message || r.stderr || r.status})`);
  return found[0];
}

function loadSource(entry, { blender } = {}) {
  if (!fs.existsSync(entry.file)) throw new Error(`missing ${entry.file}`);
  if (entry.kind === 'glb') return gltfSource(entry.file, entry.anim);
  return loadFbxSource(entry.kind === 'zip' ? fbxFromZip(entry.file) : entry.file, { blender });
}

// in place: the hips keep their height and sway, not the travel
function inPlace(solved) {
  const t = solved.hips.translations, n = t.length / 3;
  const travel = [t[(n - 1) * 3] - t[0], t[(n - 1) * 3 + 2] - t[2]];
  for (let i = 0; i < n; i++) { t[i * 3] = t[0]; t[i * 3 + 2] = t[2]; }
  return travel;
}

/** Writes <out>/ref-clips-<body>.glb for each body; returns a report row per clip and body. */
export function buildReferenceClips({ out, body = 'both', downloads = DEFAULT_DOWNLOADS, blender, only = null } = {}) {
  const sources = referenceSources(downloads).filter((s) => !only || only.includes(s.name));
  const report = [];
  const solvedBy = Object.fromEntries(bodiesOf(body).map((b) => [b, []]));
  for (const entry of sources) {
    let source;
    try { source = loadSource(entry, { blender }); }
    catch (error) { report.push({ clip: entry.name, error: String(error.message || error).split('\n')[0] }); continue; }
    for (const b of Object.keys(solvedBy)) {
      try {
        const solved = retargetToRig(loadBody(b).rig, source, { fps: 30, rootMotion: true });
        const travel = inPlace(solved);
        solvedBy[b].push({ name: entry.name, solved });
        report.push({ clip: entry.name, body: b, seconds: +solved.times[solved.times.length - 1].toFixed(2), bones: solved.bones.length,
          travel: travel.map((v) => +v.toFixed(2)).join(',') });
      } catch (error) {
        report.push({ clip: entry.name, body: b, error: String(error.message || error).split('\n')[0] });
      }
    }
  }
  fs.mkdirSync(out, { recursive: true });
  for (const [b, clips] of Object.entries(solvedBy)) {
    if (!clips.length) continue;
    const glb = parseGlb(fs.readFileSync(path.join(ROOT, BODY_FILES[b])));
    glb.json.animations = []; // the body's own clips stay out
    for (const { name, solved } of clips) {
      appendAnimation(glb, { name, channels: [
        { node: solved.hips.node, path: 'translation', times: Float32Array.from(solved.times), values: Float32Array.from(solved.hips.translations) },
        ...solved.bones.map((bone) => ({ node: bone.node, path: 'rotation', times: Float32Array.from(solved.times), values: Float32Array.from(bone.rotations) })),
      ] });
    }
    fs.writeFileSync(path.join(out, `ref-clips-${b}.glb`), serializeGlb(glb));
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2), { body: 'both', out: 'tools/game3d-weapon-anim/studio' });
  const report = buildReferenceClips({ out: path.resolve(ROOT, a.out), body: a.body, downloads: a.downloads || DEFAULT_DOWNLOADS,
    blender: a.blender, only: a.only ? String(a.only).split(',') : null });
  console.table(report);
}
