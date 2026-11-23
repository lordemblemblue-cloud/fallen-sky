// One renderer for the creator stages (the character creator and the selected-character preview on the select
// screen) instead of a new one at every mount. Every WebGPURenderer opens a GPU device of its own and every classic
// one a WebGL context; the select screen remounts its stage for each character it shows, the creator and the
// preview take turns, and React's development double mount doubles each. Three's dispose() left those devices
// alive (seven after one pass through the creator, docs/GAME3D_CHARACTER_SCREEN_PERF_20261122.md).
//
// The stage that holds the lease draws with the shared renderer; a stage opened while it is busy gets a private
// renderer, destroyed with that stage (the behaviour before the pool). A released shared renderer waits `idleMs`
// for the next stage (select <-> creator, the next character), then it is destroyed: entering the world leaves no
// creator renderer, device or context behind.
//
// Dependency-free so tests can drive it with fake renderers; creatorStageScene.js wires it to createSceneRenderer.

export const CREATOR_RENDERER_IDLE_MS = 4000;

/**
 * @param {object} o
 * @param {() => object} o.create makes a renderer entry value (e.g. createSceneRenderer's {renderer, ready})
 * @param {(value: object, data: object) => void} o.destroy frees it (and anything cached in `data`)
 * @param {(value: object) => boolean} [o.isLost] true when the value can no longer draw (lost device or context)
 * @param {number} [o.idleMs]
 */
export function createCreatorRendererPool({ create, destroy, isLost = () => false, idleMs = CREATOR_RENDERER_IDLE_MS,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimer = (id) => globalThis.clearTimeout(id) } = {}) {
  let shared = null;
  let idleTimer = null;
  const stats = { created: 0, destroyed: 0, reused: 0, private: 0, live: 0 };

  const cancelIdle = () => {
    if (idleTimer === null) return;
    clearTimer(idleTimer);
    idleTimer = null;
  };
  const make = () => {
    const entry = { value: create(), data: {}, inUse: true, destroyed: false };
    stats.created++;
    stats.live++;
    return entry;
  };
  const destroyEntry = (entry) => {
    if (entry.destroyed) return;
    entry.destroyed = true;
    stats.destroyed++;
    stats.live--;
    try { destroy(entry.value, entry.data); } catch (error) { globalThis.console?.warn?.('[creator] renderer cleanup', error); }
  };
  const lost = (entry) => {
    try { return Boolean(isLost(entry.value)); } catch { return true; }
  };

  const lease = (entry) => {
    let released = false;
    return {
      value: entry.value,
      /** A cache that lives as long as this renderer (e.g. the studio environment map). */
      data: entry.data,
      shared: entry === shared,
      release() {
        if (released) return;
        released = true;
        if (entry !== shared || lost(entry)) {
          if (entry === shared) shared = null;
          destroyEntry(entry);
          return;
        }
        entry.inUse = false;
        cancelIdle();
        idleTimer = setTimer(() => {
          idleTimer = null;
          if (shared !== entry || entry.inUse) return;
          shared = null;
          destroyEntry(entry);
        }, idleMs);
      },
    };
  };

  return {
    /** A renderer for one stage: the shared one when it is free, else a private one. Release it with the stage. */
    acquire() {
      if (shared && !shared.inUse && lost(shared)) {
        cancelIdle();
        destroyEntry(shared);
        shared = null;
      }
      if (shared && !shared.inUse) {
        cancelIdle();
        shared.inUse = true;
        stats.reused++;
        return lease(shared);
      }
      if (!shared) {
        shared = make();
        return lease(shared);
      }
      stats.private++;
      return lease(make());
    },
    /** Destroy the idle shared renderer now (a stage in use keeps its renderer). */
    flushIdle() {
      if (!shared || shared.inUse) return;
      cancelIdle();
      destroyEntry(shared);
      shared = null;
    },
    stats: () => ({ ...stats, sharedInUse: Boolean(shared?.inUse), sharedIdle: Boolean(shared && !shared.inUse) }),
  };
}
