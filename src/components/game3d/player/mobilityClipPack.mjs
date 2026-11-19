// The Game 3D mobility clip pack: skeleton-only game clips in public/models/animations/mocap/ (one animation
// per file, named like the file; src/lib/mocap/clipFormat.js) that bind by bone name to the fused bodies.
// tools/avatar-motion/mobility-clips.mjs writes the files and the manifest; tools/mocap/import-clip.mjs and the
// mocap lab write clips in the same format, so a captured Back_Flip lands in the game by being listed there.
//
//   manifest.json  { version: 1, bodies: { 'fused-male-v1': { dir: '', clips: ['Back_Flip', ...] },
//                                           'fused-female-v1': { dir: 'female/', clips: [...] } } }
//
// Every track of a loaded clip must bind to a node of the actual actor and hold finite values; a clip solved on
// another rig is dropped with a warning instead of silently animating nothing. Clip extras (speed, airborne,
// loop ...) are copied to clip.userData, as loadAvatarModel does for the body's own clips.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const MOBILITY_CLIP_PACK_DIR = '/models/animations/mocap/';
export const MOBILITY_CLIP_MANIFEST_URL = `${MOBILITY_CLIP_PACK_DIR}manifest.json`;

let manifestPromise = null;
const packsByTarget = new WeakMap();

/** The clips the manifest lists for a rig, with their URLs. */
export function mobilityClipPackEntries(manifest, rigId) {
  if (!manifest || manifest.version !== 1 || !rigId) return [];
  const body = manifest.bodies?.[rigId];
  if (!body || !Array.isArray(body.clips)) return [];
  const dir = typeof body.dir === 'string' ? body.dir : '';
  return body.clips
    .filter((name) => typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(name))
    .map((name) => ({ name, url: `${MOBILITY_CLIP_PACK_DIR}${dir}${name}.glb` }));
}

/** A clip is usable only when every track targets a node of this actor with finite values. */
export function clipBindsToActor(clip, target) {
  if (!clip?.tracks?.length || !(clip.duration > 0) || !target?.getObjectByName) return false;
  return clip.tracks.every((track) => {
    const nodeName = track.name.slice(0, track.name.lastIndexOf('.'));
    return !!target.getObjectByName(nodeName) && Array.from(track.values).every(Number.isFinite);
  });
}

async function fetchManifest() {
  if (!manifestPromise) {
    manifestPromise = globalThis.fetch(MOBILITY_CLIP_MANIFEST_URL).then((response) => {
      if (!response.ok) throw new Error(`Mobility clip manifest request failed (${response.status})`);
      return response.json();
    }).catch((error) => { manifestPromise = null; throw error; });
  }
  return manifestPromise;
}

async function loadGltfClip(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const clip = gltf.animations?.[0] || null;
  const extras = gltf.parser?.json?.animations?.[0]?.extras || null;
  return { clip, extras };
}

/**
 * Loads the pack for `target` (a fused body: userData.rigId from loadAvatarModel). Resolves to { [clipName]: clip };
 * an empty object when the actor has no rig id, the manifest is missing, or nothing binds. Never throws.
 */
export async function loadMobilityClipPack(target, { readManifest = fetchManifest, loadClip = loadGltfClip } = {}) {
  const rigId = target?.userData?.rigId;
  if (!rigId) return {};
  if (packsByTarget.has(target)) return packsByTarget.get(target);
  const pending = (async () => {
    let manifest;
    try { manifest = await readManifest(); }
    catch (error) { globalThis.console.warn('Mobility clip pack manifest unavailable:', error?.message || error); return {}; }
    const clips = {};
    for (const entry of mobilityClipPackEntries(manifest, rigId)) {
      try {
        const { clip, extras } = await loadClip(entry.url);
        if (!clipBindsToActor(clip, target)) throw new Error('clip does not bind to this actor');
        clip.name = entry.name;
        clip.userData = { ...(clip.userData || {}), ...(extras && typeof extras === 'object' ? extras : {}),
          mobilityPack: true, url: entry.url };
        clips[entry.name] = clip;
      } catch (error) {
        globalThis.console.warn(`Mobility clip ${entry.name} skipped:`, error?.message || error);
      }
    }
    return clips;
  })();
  packsByTarget.set(target, pending);
  try { return await pending; }
  catch (error) { packsByTarget.delete(target); globalThis.console.warn('Mobility clip pack failed:', error); return {}; }
}
