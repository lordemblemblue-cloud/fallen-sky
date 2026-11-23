// Keeps the bytes of downloaded model files in memory for the page's lifetime, so a gate hop (which remounts the
// world as the next area's scene) and every later load of the same model reuse them instead of downloading again.
// docs/GAME3D_LOW_POLY_20261122.md, "Downloads across gate hops".
//
// It switches on three.js's own loader cache (`Cache`), which FileLoader (used by GLTFLoader and FBXLoader) consults
// by URL, but only for model files and only for their raw bytes:
// - keys must be http(s) or same-origin paths ending in .glb / .gltf / .fbx / .bin (no blob:, no data:);
// - values must be ArrayBuffers. Images, ImageBitmaps and textures are never kept: those are GPU-side objects that a
//   world teardown disposes or closes, and reusing them in the next scene is how WebGPU loses objects after a remount;
// - the total is capped; the least recently used file goes first.
// A parsed model is never shared between scenes: every load still parses its own copy, exactly as before.
import { Cache } from 'three';

const MODEL_FILE = /\.(?:glb|gltf|fbx|bin)(?:[?#]|$)/i;

export function isCacheableModelKey(key) {
  const k = String(key || '');
  if (!MODEL_FILE.test(k)) return false;
  if (/^(?:blob|data):/i.test(k)) return false;
  return /^(?:https?:)?\/\//i.test(k) || k.startsWith('/');
}

/** Default cap: 192 MB, or 64 MB on a phone / tablet or a browser reporting 4 GB of memory or less. */
export function defaultModelCacheBytes(env = globalThis) {
  const coarse = !!env.matchMedia?.('(pointer: coarse)')?.matches;
  const memory = Number(env.navigator?.deviceMemory);
  return coarse || (Number.isFinite(memory) && memory > 0 && memory <= 4) ? 64 * 1048576 : 192 * 1048576;
}

/**
 * Install once per page (later calls return the same controller).
 * @returns {{stats(): {files: number, bytes: number, hits: number, misses: number, evicted: number, maxBytes: number},
 *   clear(): void}}
 */
export function installGame3DModelCache({ maxBytes = defaultModelCacheBytes(), cache = Cache } = {}) {
  if (cache.__game3dModelCache) return cache.__game3dModelCache;
  const order = new Map(); // key -> bytes; Map order = least recently used first
  let total = 0; let hits = 0; let misses = 0; let evicted = 0;
  const drop = (key) => {
    const bytes = order.get(key) || 0;
    order.delete(key);
    delete cache.files[key];
    total -= bytes;
  };
  cache.add = function add(key, file) {
    if (!isCacheableModelKey(key) || !(file instanceof ArrayBuffer) || file.byteLength === 0) return;
    if (file.byteLength > maxBytes) return;
    if (order.has(key)) drop(key);
    cache.files[key] = file;
    order.set(key, file.byteLength);
    total += file.byteLength;
    while (total > maxBytes && order.size) { drop(order.keys().next().value); evicted += 1; }
  };
  cache.get = function get(key) {
    if (!isCacheableModelKey(key)) return undefined;
    const file = cache.files[key];
    if (file === undefined || !(file instanceof ArrayBuffer) || file.byteLength === 0) {
      if (file !== undefined) drop(key); // a detached buffer can never be served
      misses += 1;
      return undefined;
    }
    const bytes = order.get(key); order.delete(key); order.set(key, bytes); // most recently used
    hits += 1;
    return file;
  };
  cache.enabled = true;
  const controller = {
    stats: () => ({ files: order.size, bytes: total, hits, misses, evicted, maxBytes }),
    clear: () => { for (const key of [...order.keys()]) drop(key); },
  };
  cache.__game3dModelCache = controller;
  return controller;
}
