import * as THREE from 'three';

// A few PointLights that stay in the scene for the world's whole life, dark while free. Companion abilities, the
// legacy spells and the level-up celebration borrow one while they play instead of adding a light of their own.
// three.js compiles every lit material for a fixed number of lights, so an effect that added and removed a light
// made it recompile all of them mid-fight; the pool keeps the number fixed. A borrowed light's color, intensity,
// position, range and decay are plain shader values and change freely.
//
// GameWorld3D creates the pool before the world's first frame (createEffectLightPool) and disposes it on teardown.
// Effects find it through their scene (acquireEffectLight), so the code that creates them needs no new parameters.
// With no pool for the scene (previews, tests) an effect gets a light of its own, added and removed with it, as
// before. When every pooled light is busy the effect plays without one: cosmetic only, and rare at this size.
export const EFFECT_LIGHT_POOL_SIZE = 4;

const pools = new WeakMap(); // scene -> pool

function borrow(light, { color = 0xffffff, distance = 0, decay = 2, position = null }, onRelease) {
  light.color.set(color);
  light.distance = distance;
  light.decay = decay;
  light.intensity = 0;
  if (position) light.position.set(position.x, position.y, position.z);
  let released = false;
  return {
    light,
    /** This frame's intensity; also its position ({ x, y, z }) when it moves, and its color when that changes. */
    set(intensity, at = null, color = null) {
      if (released) return;
      light.intensity = intensity;
      if (at) light.position.set(at.x, at.y, at.z);
      if (color != null) light.color.set(color);
    },
    /** The effect has ended. Safe to call again. */
    release() {
      if (released) return;
      released = true;
      onRelease();
    },
  };
}

export function createEffectLightPool(scene, size = EFFECT_LIGHT_POOL_SIZE) {
  const slots = [];
  for (let i = 0; i < size; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 0, 2);
    light.name = `EffectLightPool${i}`;
    scene.add(light);
    slots.push({ light, busy: false });
  }
  let disposed = false;
  const pool = {
    lights: slots.map((slot) => slot.light),
    busy: () => slots.filter((slot) => slot.busy).length,
    acquire(options = {}) {
      if (disposed) return null;
      const slot = slots.find((candidate) => !candidate.busy);
      if (!slot) return null;
      slot.busy = true;
      return borrow(slot.light, options, () => {
        slot.light.intensity = 0;
        slot.busy = false;
      });
    },
    /** World teardown; safe to call again. */
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pools.get(scene) === pool) pools.delete(scene);
      for (const slot of slots) {
        slot.busy = true; // a handle released after teardown changes nothing
        scene.remove(slot.light);
        slot.light.dispose();
      }
    },
  };
  pools.set(scene, pool);
  return pool;
}

/**
 * A light for one effect instance ({ color, distance, decay, position }): borrowed from the scene's pool, or its own
 * light when the scene has no pool. Returns null when the pool is busy (or there is no scene).
 */
export function acquireEffectLight(scene, options = {}) {
  if (!scene) return null;
  const pool = pools.get(scene);
  if (pool) return pool.acquire(options);
  const light = new THREE.PointLight(0xffffff, 0, 0, 2);
  scene.add(light);
  return borrow(light, options, () => {
    scene.remove(light);
    light.dispose();
  });
}
