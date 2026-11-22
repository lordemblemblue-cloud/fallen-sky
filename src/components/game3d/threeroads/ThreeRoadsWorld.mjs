// The War of Three Roads: the one object GameWorld3D creates, updates and
// disposes. Everything else (places, cast, enemies, pledge steps) is a
// subsystem listed in subsystems.mjs, so GameWorld3D never has to change
// when a subsystem is added or grows.
//
// A subsystem is `create(ctx)` returning null (nothing to do in this scene)
// or `{ update(dt, playerPosition, ctx)?, dispose()? }`. One failing
// subsystem is switched off and reported; it must never take the world or
// another subsystem down with it.
//
// ctx, as GameWorld3D hands it over (world coordinates: x east, z north,
// world z = Wolfveil local z + 70):
//   region, worldArea      which scene this is ('wolfveil' + one of the five
//                          areas, or a cave / dungeon region id)
//   areaScenes             true when only worldArea is loaded (the default);
//                          false when ?wholeWorld=1 loads the whole valley
//   scene                  THREE.Scene (world coordinates); people and
//                          monsters go straight into it
//   wolfveilWorld          the Wolfveil world object, or null outside the
//                          valley; add scenery under wolfveilWorld.group, in
//                          LOCAL coordinates, so the area loader manages it
//   renderer, camera
//   sampleGroundY(x, z)    height of the loaded ground under a point, or null
//   snapToGround(obj, off) stand an object on the ground
//   groundMeshes           array of walkable meshes (push a floor to walk on it)
//   fbxLoader, gltfLoader
//   enemies                GameWorld3D's own enemy list (its AI loop owns
//                          every entry pushed into it)
//   questNPCs              GameWorld3D's quest-giver list ({id, name, group,
//                          mixer, ...}); an entry pushed here can be spoken to
//   getPlayer()            the player's model, or null before it has loaded
//   bus                    a small event bus shared by the subsystems
import { THREE_ROADS_SUBSYSTEMS } from './subsystems.mjs';

export function createThreeRoadsBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (typeof fn !== 'function') return () => {};
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    emit(type, detail) {
      for (const fn of [...(handlers.get(type) || [])]) {
        try { fn(detail); } catch (error) {
          globalThis.console?.warn('Three Roads listener for ' + type + ' failed', error);
        }
      }
    },
    clear() { handlers.clear(); },
  };
}

export function createThreeRoadsWorld(deps = {}, {
  subsystems = THREE_ROADS_SUBSYSTEMS,
  warn = (...args) => globalThis.console?.warn(...args),
} = {}) {
  const bus = createThreeRoadsBus();
  const ctx = Object.freeze({ ...deps, bus });
  const live = [];
  const status = {};
  for (const entry of subsystems) {
    const id = entry?.id || 'unnamed';
    try {
      const made = typeof entry?.create === 'function' ? entry.create(ctx) : null;
      status[id] = made ? 'on' : 'idle';
      if (made) live.push({ id, made });
    } catch (error) {
      status[id] = 'failed';
      warn('Three Roads subsystem ' + id + ' could not start', error);
    }
  }
  let disposed = false;
  return {
    bus,
    status: () => ({ ...status }),
    get(id) { return live.find(item => item.id === id)?.made || null; },
    update(dt, playerPosition) {
      if (disposed) return;
      for (const item of live) {
        if (status[item.id] !== 'on' || typeof item.made.update !== 'function') continue;
        try { item.made.update(dt, playerPosition, ctx); } catch (error) {
          status[item.id] = 'failed';
          warn('Three Roads subsystem ' + item.id + ' stopped after an error', error);
          try { item.made.dispose?.(); } catch { /* already failing */ }
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const item of [...live].reverse()) {
        if (status[item.id] === 'failed') continue;
        try { item.made.dispose?.(); } catch (error) {
          warn('Three Roads subsystem ' + item.id + ' did not dispose cleanly', error);
        }
        status[item.id] = 'disposed';
      }
      bus.clear();
    },
  };
}
