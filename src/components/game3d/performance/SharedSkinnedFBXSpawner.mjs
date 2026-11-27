// Game 3D-only reusable FBX source. One network download/parse per world and URL,
// independent skeletons for each actor, and at most two actor creations per frame.
// Models remain scene-owned: do not dispose shared source geometry/materials while
// any clone can still reference them.
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { shrinkModelTextures } from '../npc/sharedNpcModel.mjs';
import { game3dHiPolyRequested } from '../render/lowPolyWorld.mjs';

const defaultSchedule = callback => typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame(callback) : setTimeout(callback, 16);
const defaultCancel = handle => typeof cancelAnimationFrame === 'function'
  ? cancelAnimationFrame(handle) : clearTimeout(handle);

export function createSharedSkinnedFBXSpawner(loader, url, {
  maxPerFrame = 2,
  scheduleFrame = defaultSchedule,
  cancelFrame = defaultCancel,
  // opt-in (docs/GAME3D_LOW_POLY_20261122.md): scale the shared source's textures to 1024 px as they arrive, before any
  // clone is drawn; ?hiPoly=1 keeps the file's own sizes
  lowPolyTextures = false,
} = {}) {
  if (!loader?.load || !url) throw new Error('A loader and asset URL are required');
  const budget = Math.max(1, Math.floor(Number(maxPerFrame) || 2));
  let sourcePromise = null;
  let frame = null;
  let disposed = false;
  const pending = [];

  const schedule = () => {
    if (!disposed && frame === null && pending.length) frame = scheduleFrame(flush);
  };

  function flush() {
    frame = null;
    if (disposed) return;
    for (let i = 0; i < budget && pending.length; i++) {
      const { source, onLoaded, onError } = pending.shift();
      try { onLoaded(cloneSkinned(source)); } catch (error) { onError?.(error); }
    }
    schedule();
  }

  const warm = () => {
    if (disposed) return Promise.reject(new Error('Enemy model source disposed'));
    if (!sourcePromise) {
      sourcePromise = new Promise((resolve, reject) => {
        loader.load(url, (source) => {
          if (source && lowPolyTextures && !game3dHiPolyRequested()) shrinkModelTextures(source, 1024);
          resolve(source);
        }, undefined, reject);
      }).catch(error => {
        sourcePromise = null; // permit retry when the file temporarily fails
        throw error;
      });
    }
    return sourcePromise;
  };

  const spawn = (onLoaded, onError = error => console.warn('[Game3D] enemy model unavailable', error)) => {
    if (disposed) return;
    warm().then(source => {
      if (disposed) return;
      pending.push({ source, onLoaded, onError });
      schedule();
    }).catch(error => { if (!disposed) onError?.(error); });
  };

  const dispose = () => {
    disposed = true;
    pending.length = 0;
    if (frame !== null) cancelFrame(frame);
    frame = null;
  };

  return { warm, spawn, dispose };
}
