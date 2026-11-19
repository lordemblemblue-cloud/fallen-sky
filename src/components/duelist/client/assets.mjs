// Character assets for Duelist Adventure: Fallen Sky's fused bodies (until the owner's own models arrive)
// with their own locomotion clips, and the authored roll / flip pack. Loaded once, cloned per fighter.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const BODY_URLS = Object.freeze({
  female: '/models/characters/fused/Female_Fused_v2.glb',
  male: '/models/characters/fused/Male_Fused_v2.glb',
});
export const MOVEMENT_PACK_URL = '/models/animations/dodges/dodges.glb';
export const BODY_HEIGHT = 1.7;
// The bodies' own clips the game plays (their special-ability clips are not used).
export const LOCOMOTION_CLIPS = Object.freeze({ idle: 'Combat_Idle', walk: 'Walk', run: 'Run' });
export const MOVEMENT_CLIPS = Object.freeze({ roll: 'Front_Roll', backFlip: 'Back_Flip', flipLeft: 'Flip_Left', flipRight: 'Flip_Right' });

const cache = new Map();
const load = (url) => {
  if (!cache.has(url)) cache.set(url, new GLTFLoader().loadAsync(url).catch((error) => { cache.delete(url); throw error; }));
  return cache.get(url);
};

/**
 * A fresh body for one fighter: { model, clips } with the model 1.7 m tall, feet on the ground, facing +Z.
 * clips: { idle, walk, run, roll, backFlip, flipLeft, flipRight } (AnimationClips bound by bone name).
 */
export async function loadFighterBody(gender = 'female') {
  const [gltf, pack] = await Promise.all([load(BODY_URLS[gender] || BODY_URLS.female), load(MOVEMENT_PACK_URL).catch(() => null)]);
  const model = cloneSkinned(gltf.scene);
  model.traverse((n) => {
    if (n.isSkinnedMesh) { n.frustumCulled = false; n.castShadow = true; n.receiveShadow = true; }
  });
  // 1.7 m tall, standing on y = 0, centred
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
  if (!box.isEmpty()) {
    const scale = BODY_HEIGHT / Math.max(1e-6, box.max.y - box.min.y);
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);
    box.makeEmpty();
    model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
    const centre = box.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -box.min.y, -centre.z);
  }
  // keep only the tracks whose bone exists on this body (the packs also carry other bodies' hair bones)
  const byName = (list, name) => {
    const clip = list?.find((c) => c.name === name);
    if (!clip) return null;
    const tracks = clip.tracks.filter((t) => model.getObjectByName(THREE.PropertyBinding.parseTrackName(t.name).nodeName));
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  };
  const clips = {};
  for (const [key, name] of Object.entries(LOCOMOTION_CLIPS)) clips[key] = byName(gltf.animations, name);
  for (const [key, name] of Object.entries(MOVEMENT_CLIPS)) clips[key] = byName(pack?.animations, name);
  return { model, clips, gender };
}
