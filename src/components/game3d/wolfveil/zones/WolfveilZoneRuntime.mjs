// ZoneRuntime: the ownership ledger of ONE playable natural zone.
//
// Everything a zone creates is registered here, so that UNLOAD can release it
// and prove that nothing of the zone is left behind: scene objects, geometries
// and their raycast BVHs, materials, textures, render targets, audio nodes,
// timers, frame callbacks, event listeners, per-frame updates and any custom
// cleanup. Audit section 5 ("one zone-owned root ... UNLOAD(A) ... verify all
// owned references are gone") is the contract.
//
// Shared GPU resources may be used by a zone only through `share()` (an
// explicit global cache that the zone never disposes) or through `own()` on a
// resource another live zone also owns: ownership is reference counted, so the
// last owner disposes it.
//
// No Three.js import: objects are duck-typed, so Node tests drive the same code.

const TEXTURE_SLOTS = Object.freeze([
  'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap', 'envMap',
  'lightMap', 'metalnessMap', 'normalMap', 'roughnessMap', 'specularMap', 'gradientMap',
  'matcap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
  'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'iridescenceMap',
  'iridescenceThicknessMap', 'anisotropyMap', 'specularIntensityMap', 'specularColorMap',
]);
export const ZONE_RESOURCE_KINDS = Object.freeze([
  'geometry', 'material', 'texture', 'renderTarget', 'bvh', 'audio', 'disposable',
]);

// Module-wide reference counts: a resource owned by two live zones is disposed
// by the last one to let go. WeakMap, so the ledger itself never retains it.
const owners = new WeakMap();
const diagnostics = {created: 0, disposed: 0, finalized: 0};
const finalizer = typeof FinalizationRegistry === 'function'
  ? new FinalizationRegistry(() => { diagnostics.finalized++; })
  : null;

/** Counters across every ZoneRuntime in this page (finalized = garbage-collected roots). */
export function zoneRuntimeDiagnostics() {
  return {...diagnostics, live: diagnostics.created - diagnostics.disposed};
}

const isTexture = value => Boolean(value && (value.isTexture || value.isCubeTexture));
function texturesOf(material) {
  const found = [];
  for (const slot of TEXTURE_SLOTS) if (isTexture(material?.[slot])) found.push(material[slot]);
  const uniforms = material?.uniforms;
  if (uniforms && typeof uniforms === 'object') {
    for (const uniform of Object.values(uniforms)) {
      const value = uniform?.value;
      if (isTexture(value)) found.push(value);
      else if (Array.isArray(value)) for (const item of value) if (isTexture(item)) found.push(item);
    }
  }
  return found;
}

/**
 * @param {object} options
 * @param {string} options.id                zone id from the zone graph
 * @param {object} options.root              an Object3D-like group the zone owns
 * @param {object} [options.parent]          where the root is attached while loaded
 * @param {object} [options.clock]           {setTimeout, clearTimeout, setInterval, clearInterval,
 *                                            requestAnimationFrame, cancelAnimationFrame}
 */
export function createZoneRuntime({id, root, parent = null, clock = globalThis} = {}) {
  if (!id || typeof id !== 'string') throw new TypeError('ZoneRuntime requires a zone id');
  if (!root || !Array.isArray(root.children)) throw new TypeError('ZoneRuntime requires a root group');
  const ledger = new Map(ZONE_RESOURCE_KINDS.map(kind => [kind, new Set()]));
  const sharedSet = new Set();
  const timeouts = new Set(), intervals = new Set(), frames = new Set();
  const listeners = new Set(), cleanups = [], updates = new Set();
  let disposed = false, report = null, weak = null;
  const createdAt = Date.now();
  diagnostics.created++;
  finalizer?.register(root, id);
  root.name = root.name || 'WV_Zone_' + id;
  root.userData = {...(root.userData || {}), wolfveilZone: id, zoneRuntimeOwned: true};
  if (parent?.add) parent.add(root);

  const assertAlive = () => {
    if (disposed) throw new Error('ZoneRuntime ' + id + ' is already unloaded');
  };
  function own(resource, kind = 'disposable') {
    assertAlive();
    if (!resource) return resource;
    if (!ledger.has(kind)) throw new TypeError('Unknown zone resource kind: ' + kind);
    if (sharedSet.has(resource)) return resource;
    const set = ledger.get(kind);
    if (!set.has(resource)) {
      set.add(resource);
      owners.set(resource, (owners.get(resource) || 0) + 1);
    }
    return resource;
  }
  /** A global-cache resource this zone uses but must never dispose. */
  function share(resource) {
    assertAlive();
    if (resource) sharedSet.add(resource);
    return resource;
  }
  function adoptMaterial(material) {
    if (!material || sharedSet.has(material)) return;
    own(material, 'material');
    for (const texture of texturesOf(material)) if (!sharedSet.has(texture)) own(texture, 'texture');
  }
  /** Registers every geometry, BVH, material and texture under `object`. */
  function adopt(object) {
    assertAlive();
    const visit = node => {
      if (node.geometry && !sharedSet.has(node.geometry)) {
        own(node.geometry, 'geometry');
        if (node.geometry.boundsTree) own(node.geometry.boundsTree, 'bvh');
      }
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) adoptMaterial(material);
    };
    if (typeof object?.traverse === 'function') object.traverse(visit);
    else if (object) visit(object);
    return object;
  }
  /** Adds an object to the zone root and adopts everything it holds. */
  function add(object) {
    assertAlive();
    root.add(object);
    return adopt(object);
  }
  function setTimeoutOwned(fn, ms = 0) {
    assertAlive();
    const handle = clock.setTimeout(() => { timeouts.delete(handle); if (!disposed) fn(); }, ms);
    timeouts.add(handle);
    return handle;
  }
  function setIntervalOwned(fn, ms) {
    assertAlive();
    const handle = clock.setInterval(() => { if (!disposed) fn(); }, ms);
    intervals.add(handle);
    return handle;
  }
  function requestFrame(fn) {
    assertAlive();
    const raf = clock.requestAnimationFrame?.bind(clock);
    if (!raf) return setTimeoutOwned(() => fn(Date.now()), 16);
    const handle = raf(time => { frames.delete(handle); if (!disposed) fn(time); });
    frames.add(handle);
    return handle;
  }
  function listen(target, type, handler, options) {
    assertAlive();
    target.addEventListener(type, handler, options);
    listeners.add({target, type, handler, options});
    return handler;
  }
  /** Per-frame work that exists only while the zone is loaded. */
  function onUpdate(fn) {
    assertAlive();
    updates.add(fn);
    return () => updates.delete(fn);
  }
  function onDispose(fn) {
    assertAlive();
    cleanups.push(fn);
  }
  function update(dt, context) {
    if (disposed) return;
    for (const fn of updates) fn(dt, context);
  }
  function countObjects() {
    let objects = 0;
    const walk = node => { objects++; for (const child of node.children || []) walk(child); };
    walk(root);
    return objects;
  }
  function stats() {
    const counts = Object.fromEntries([...ledger].map(([kind, set]) => [kind, set.size]));
    return {
      id, disposed, objects: disposed ? 0 : countObjects(), ...counts,
      shared: sharedSet.size, timers: timeouts.size + intervals.size + frames.size,
      listeners: listeners.size, updates: updates.size, cleanups: cleanups.length,
    };
  }
  const releaseOne = (resource, kind, errors) => {
    const left = (owners.get(resource) || 1) - 1;
    if (left > 0) { owners.set(resource, left); return false; }
    owners.delete(resource);
    try {
      if (kind === 'audio') {
        try { resource.stop?.(); } catch { /* an un-started source throws; it is still released */ }
        resource.disconnect?.();
      } else {
        // A geometry drops its raycast BVH with it (three-mesh-bvh has no dispose).
        if (kind === 'geometry' && resource.boundsTree) resource.boundsTree = null;
        resource.dispose?.();
      }
    } catch (error) {
      errors.push(kind + ': ' + (error?.message || error));
    }
    return true;
  };
  /**
   * UNLOAD: stop, unsubscribe, detach and release everything. Returns what was
   * released. Idempotent; the second call returns the first report.
   */
  function dispose() {
    if (disposed) return report;
    disposed = true;
    const errors = [];
    for (const handle of timeouts) clock.clearTimeout(handle);
    for (const handle of intervals) clock.clearInterval(handle);
    for (const handle of frames) clock.cancelAnimationFrame?.(handle);
    const timerCount = timeouts.size + intervals.size + frames.size;
    timeouts.clear(); intervals.clear(); frames.clear();
    for (const {target, type, handler, options} of listeners) {
      try { target.removeEventListener(type, handler, options); } catch (error) { errors.push('listener: ' + error?.message); }
    }
    const listenerCount = listeners.size;
    listeners.clear();
    updates.clear();
    const cleanupCount = cleanups.length;
    while (cleanups.length) {
      const fn = cleanups.pop();
      try { fn(); } catch (error) { errors.push('cleanup: ' + (error?.message || error)); }
    }
    const objects = countObjects();
    root.parent?.remove?.(root);
    // Geometry BVHs first (they reference the geometry), then the GPU-backed
    // resources. Materials after their textures so no material re-uploads one.
    const order = ['bvh', 'geometry', 'texture', 'material', 'renderTarget', 'audio', 'disposable'];
    const released = {};
    for (const kind of order) {
      let count = 0;
      for (const resource of ledger.get(kind)) if (releaseOne(resource, kind, errors)) count++;
      released[kind] = count;
      ledger.get(kind).clear();
    }
    // Break the object graph so nothing the page still holds can keep it alive.
    const detach = node => {
      for (const child of [...(node.children || [])]) { detach(child); node.remove?.(child); }
      if (node.geometry) node.geometry = null;
      if (node.material) node.material = null;
      node.onBeforeRender = null; node.onAfterRender = null;
    };
    detach(root);
    sharedSet.clear();
    diagnostics.disposed++;
    report = Object.freeze({
      id, objects, ...released, timers: timerCount, listeners: listenerCount,
      cleanups: cleanupCount, errors: Object.freeze(errors),
      residentMs: Date.now() - createdAt,
    });
    return report;
  }
  /** WeakRefs to the zone root (for a heap check that it was collected). */
  function weakRoot() {
    if (!weak && typeof WeakRef === 'function') weak = new WeakRef(root);
    return weak;
  }
  return {
    id, root, add, adopt, own, share, listen, onUpdate, onDispose, update, stats, dispose, weakRoot,
    setTimeout: setTimeoutOwned, setInterval: setIntervalOwned, requestFrame,
    get disposed() { return disposed; },
    get report() { return report; },
  };
}
