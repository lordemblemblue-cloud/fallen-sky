// Weapon clips edited in Blender (the Weapon Animation Studio, tools/game3d-weapon-anim/README.md), as the game plays
// them: public/models/animations/weapons/<body dir><state>.glb, one skeleton-only clip per game state, listed with its
// timing in manifest.json (tools/game3d-weapon-anim/export_clips.py writes both):
//
//   { version: 1, bodies: { 'fused-male-v1': { dir: '', clips: { swordCombo1: { file: 'swordCombo1.glb', duration,
//     hit, sweep: [start, end], cancel, windUp, chargeFrom, charge, nock, full, loop, variant } } },
//     'fused-female-v1': { dir: 'female/', clips: { ... } } } }
//
// The weapon binder (weaponComboBinder.js) plays a pack clip in place of the baked clip of the same state on that body,
// for every weapon of its family that swings that move set (`variant`: 'standard' unless the entry says otherwise; a
// long blade's katana moves are another variant). Whatever the entry does not time comes from the baked clip. Every
// track must bind to a node of the actual actor with finite values: a clip from another rig is skipped with a warning.
// No manifest, no change: every weapon keeps its baked clips. Presentation only: damage, hits and cooldowns stay where
// they are decided.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WEAPON_COMBO_STATES, WEAPON_IDLE_STATES, BOW_POSE_STATES } from './weaponComboClips.js';
import { clipBindsToActor } from '../player/mobilityClipPack.mjs';

export const WEAPON_CLIP_PACK_DIR = '/models/animations/weapons/';
export const WEAPON_CLIP_MANIFEST_URL = `${WEAPON_CLIP_PACK_DIR}manifest.json`;
export const WEAPON_CLIP_TIMING = Object.freeze(['hit', 'cancel', 'windUp', 'chargeFrom', 'charge', 'nock', 'full']);
// every state the player controller takes weapon clips for
export const AUTHORABLE_WEAPON_STATES = Object.freeze([...new Set([...Object.values(WEAPON_COMBO_STATES).flat(),
  ...WEAPON_IDLE_STATES, ...BOW_POSE_STATES])]);

// The userData a pack clip carries from its manifest entry: its own timing, in clip seconds.
export function weaponClipUserData(entry = {}) {
  const out = { generated: 'weaponClipPack', authored: true,
    variant: typeof entry.variant === 'string' && entry.variant ? entry.variant : 'standard' };
  for (const key of WEAPON_CLIP_TIMING) if (Number.isFinite(entry[key]) && entry[key] >= 0) out[key] = entry[key];
  if (Array.isArray(entry.sweep) && entry.sweep.length === 2 && entry.sweep.every(Number.isFinite)) out.sweep = entry.sweep.slice();
  if (entry.loop === true) out.loop = true;
  return out;
}

// The clips the manifest lists for a rig: [{ state, url, entry }], only states the game plays and plain file names
// inside the pack folder.
export function weaponClipPackEntries(manifest, rigId) {
  if (!manifest || manifest.version !== 1 || !rigId) return [];
  const body = manifest.bodies?.[rigId];
  if (!body || typeof body.clips !== 'object' || !body.clips || Array.isArray(body.clips)) return [];
  return Object.entries(body.clips)
    .filter(([state, entry]) => AUTHORABLE_WEAPON_STATES.includes(state) && typeof entry?.file === 'string'
      && /^(?:[A-Za-z0-9_-]+\/)?[A-Za-z0-9_-]+\.glb$/.test(entry.file))
    .map(([state, entry]) => ({ state, url: `${WEAPON_CLIP_PACK_DIR}${entry.file}`, entry }));
}

let manifestPromise = null;
async function fetchManifest() {
  if (!manifestPromise) {
    manifestPromise = globalThis.fetch(WEAPON_CLIP_MANIFEST_URL).then((response) => {
      if (!response.ok) throw new Error(`weapon clip manifest ${response.status}`);
      return response.json(); // a dev server's index.html fallback fails here: no pack
    }).catch((error) => { manifestPromise = null; throw error; });
  }
  return manifestPromise;
}
async function loadGltfClip(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return gltf.animations?.[0] || null;
}

/**
 * The pack's clips for `target` (a fused body: userData.rigId), keyed by game state, each named after its state with
 * its timing in userData (weaponClipUserData). {} without a rig id or a manifest, or when nothing binds. Never throws.
 */
export async function loadWeaponClipPack(target, { readManifest = fetchManifest, loadClip = loadGltfClip } = {}) {
  const rigId = target?.userData?.rigId;
  if (!rigId) return {};
  let manifest;
  try { manifest = await readManifest(); } catch { return {}; }
  const clips = {};
  for (const { state, url, entry } of weaponClipPackEntries(manifest, rigId)) {
    try {
      const clip = await loadClip(url);
      if (!clipBindsToActor(clip, target)) throw new Error('clip does not bind to this actor');
      clip.name = state;
      clip.userData = { ...weaponClipUserData(entry), url };
      clips[state] = clip;
    } catch (error) {
      globalThis.console.warn(`Weapon clip ${state} skipped:`, error?.message || error);
    }
  }
  return clips;
}
