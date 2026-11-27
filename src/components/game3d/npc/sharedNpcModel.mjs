// One parse of an NPC model file per world mount, shared by every NPC that uses it (docs/GAME3D_LOW_POLY_20261122.md,
// "Archer NPC textures"). The quest givers that fall back to the archer FBX and the Living Quest NPC used to load and
// parse it once each: four copies in the town, each with six embedded 2048 px textures (384 MB of GPU memory).
//
// - The first request per loader instance (GameWorld3D makes one FBXLoader per world mount) parses the file; every
//   NPC gets a SkeletonUtils clone of it: its own bones, skeleton and mixer target, its own material copies (NPCs tint
//   them), and the shared geometry and textures. A new world mount has a new loader and parses again, so nothing
//   crosses a teardown (the model bytes come from Game3DModelCache.mjs, not the network).
// - The shared copy's textures are scaled to NPC_TEXTURE_MAX as each image arrives, before its first upload.
// - `?hiPoly=1` keeps the earlier behaviour: one full-resolution parse per NPC.
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { game3dHiPolyRequested } from '../render/lowPolyWorld.mjs';

export const NPC_TEXTURE_MAX = 1024;
const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap',
  'bumpMap', 'specularMap', 'lightMap', 'displacementMap'];

/** A canvas copy of `image` no larger than `max` on its longer side, or `image` itself when it is small enough. */
export function shrinkImage(image, max = NPC_TEXTURE_MAX, doc = globalThis.document) {
  const w = image?.naturalWidth || image?.width || 0;
  const h = image?.naturalHeight || image?.height || 0;
  if (!(w > max || h > max) || !doc?.createElement) return image;
  const scale = max / Math.max(w, h);
  const canvas = doc.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return image;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Scale a texture's image down when it arrives (TextureLoader assigns it after the file decodes), or now. */
export function shrinkTextureOnArrival(texture, max = NPC_TEXTURE_MAX, doc = globalThis.document) {
  const source = texture?.source;
  if (!source || source.__npcShrink) return;
  source.__npcShrink = true;
  let data = source.data;
  if (data) {
    const smaller = shrinkImage(data, max, doc);
    if (smaller !== data) { source.data = smaller; texture.needsUpdate = true; }
    return;
  }
  Object.defineProperty(source, 'data', {
    configurable: true, enumerable: true,
    get() { return data; },
    set(value) { data = value ? shrinkImage(value, max, doc) : value; },
  });
}

export function shrinkModelTextures(model, max = NPC_TEXTURE_MAX, doc = globalThis.document) {
  const seen = new Set();
  model?.traverse?.((node) => {
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (!material) continue;
      for (const slot of TEXTURE_SLOTS) {
        const texture = material[slot];
        if (texture?.isTexture && !seen.has(texture)) { seen.add(texture); shrinkTextureOnArrival(texture, max, doc); }
      }
    }
  });
  return seen.size;
}

/** An NPC's own copy of the shared model: own bones and materials, shared geometry and textures. */
export function instanceSharedModel(source) {
  const copy = cloneSkinned(source);
  copy.animations = source.animations || [];
  copy.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    node.material = Array.isArray(node.material) ? node.material.map((m) => m.clone()) : node.material.clone();
  });
  copy.userData.sharedNpcModel = true;
  return copy;
}

const sharedByLoader = new WeakMap();

/**
 * Drop-in for `loader.load(url, onLoad, undefined, onError)` for NPC models: the same callbacks, one parse per loader.
 * @param {{hiPoly?: boolean, textureMax?: number}} [options]
 */
export function loadSharedNpcModel(loader, url, onLoad, onError = () => {}, { hiPoly = game3dHiPolyRequested(), textureMax = NPC_TEXTURE_MAX } = {}) {
  if (!loader?.load) { onError(new Error('loadSharedNpcModel: no loader')); return; }
  if (hiPoly) { loader.load(url, onLoad, undefined, onError); return; }
  let byUrl = sharedByLoader.get(loader);
  if (!byUrl) { byUrl = new Map(); sharedByLoader.set(loader, byUrl); }
  let entry = byUrl.get(url);
  if (!entry) {
    entry = new Promise((resolve, reject) => loader.load(url, (model) => {
      if (model) shrinkModelTextures(model, textureMax);
      resolve(model);
    }, undefined, reject));
    byUrl.set(url, entry);
    entry.catch(() => { if (byUrl.get(url) === entry) byUrl.delete(url); });
  }
  entry.then((source) => {
    if (!source) { onError(new Error('Empty NPC model')); return; }
    onLoad(instanceSharedModel(source));
  }, onError);
}
