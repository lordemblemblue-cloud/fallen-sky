// Character assets for Duelist Adventure: the owner's characters (rigged onto the fused bodies' skeleton by
// tools/duelist/rig_character.py) and Fallen Sky's fused bodies, with the authored roll / flip pack.
// Loaded once, cloned per fighter.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { armorPolicy } from './armorQuality.mjs';
import { ARMOR_VARIANTS } from './armorVariants.mjs';
import { readPrefs } from './prefs.mjs';

export const BODIES = Object.freeze({
  maskedWarrior: Object.freeze({ name: 'Masked Warrior', url: '/models/characters/duelist/masked-warrior.glb' }),
  huntress: Object.freeze({ name: 'Huntress', url: '/models/characters/duelist/huntress.glb' }),
  female: Object.freeze({ name: 'Eve', url: '/models/characters/fused/Female_Fused_v2.glb' }),
  male: Object.freeze({ name: 'Adam', url: '/models/characters/fused/Male_Fused_v2.glb' }),
});
export const BODY_URLS = Object.freeze(Object.fromEntries(Object.entries(BODIES).map(([id, b]) => [id, b.url])));
export const bodyName = (id) => BODIES[id]?.name || 'Duelist';
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
export async function loadFighterBody(bodyId = 'female', quality = readPrefs().armorQuality) {
  const policy = armorPolicy(quality);
  const id = Object.hasOwn(BODY_URLS, bodyId) ? bodyId : 'female';
  const variant = policy.simplified ? ARMOR_VARIANTS[id]?.[policy.quality] : null;
  const original = BODY_URLS[id];
  const bodyAsset = variant ? load(variant).then(gltf => ({ gltf, rigKey: variant })).catch(() => load(original).then(gltf => ({ gltf, rigKey: original }))) : load(original).then(gltf => ({ gltf, rigKey: original }));
  const [{ gltf, rigKey }, pack] = await Promise.all([bodyAsset, load(MOVEMENT_PACK_URL).catch(() => null)]);
  const model = cloneSkinned(gltf.scene);
  // SkeletonUtils shares cached geometry and textures, but each actor owns its skeleton.
  // Do not mutate or dispose the shared material/texture data. Fused armor cannot be
  // removed safely without an authored replacement body; reduce its material cost instead.
  const ownedMaterials = new Set();
  model.traverse((n) => {
    if (n.isSkinnedMesh) { n.frustumCulled = false; n.castShadow = policy.armorShadows; n.receiveShadow = policy.armorShadows; }
    if (!policy.simplified || !n.isMesh || !n.material) return;
    const simplify = (m) => {
      const next = new THREE.MeshStandardMaterial({ color: m.color || 0xffffff, map: m.map || null,
        alphaMap: m.alphaMap || null, alphaTest: m.alphaTest || 0, transparent: !!m.transparent,
        opacity: m.opacity ?? 1, side: m.side, depthWrite: m.depthWrite, vertexColors: !!m.vertexColors,
        roughness: 1, metalness: 0 });
      next.name = m.name; ownedMaterials.add(next); return next;
    };
    n.material = Array.isArray(n.material) ? n.material.map(simplify) : simplify(n.material);
    n.userData.ownMaterial = true;
    n.castShadow = false; n.receiveShadow = false;
  });
  model.userData.duelistOwnedMaterials = ownedMaterials;
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
  return { model, clips, bodyId, rigKey };
}

// Release only clone-owned resources. Cached source geometry/textures and shared guard
// materials survive so other actors and future spawns remain intact.
export function releaseFighterBody(model) {
  if (!model) return;
  const materials = new Set(model.userData.duelistOwnedMaterials || []);
  const skeletons = new Set();
  model.traverse(n => {
    if (n.isSkinnedMesh && n.skeleton) skeletons.add(n.skeleton);
    if (n.isMesh && n.userData.ownMaterial && n.material) {
      for (const m of Array.isArray(n.material) ? n.material : [n.material]) materials.add(m);
    }
  });
  for (const material of materials) material.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
  delete model.userData.duelistOwnedMaterials;
}
