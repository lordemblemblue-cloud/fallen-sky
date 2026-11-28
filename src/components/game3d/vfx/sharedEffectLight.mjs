import * as THREE from 'three';

// One PointLight shared by every instance of a transient effect (the skill-cast beam, the skill-use burst), kept in
// the scene for the world's whole life and dark while no instance plays. An effect that brought its own light changed
// the scene's light count, and three.js then compiles a new variant of every lit material, a stall at the moment the
// effect plays (several seconds, measured live, the first time each count appeared). GameWorld3D creates these lights
// before the world's first frame, so every material is compiled with them from the start.
//
// Instances that play at the same time all follow the hero, so they share one position, and the light gives exactly
// what their separate lights gave: the summed intensity, in the intensity-weighted mix of their colors.
export function createSharedEffectLight(scene, { name = 'SharedEffectLight', distance = 0, decay = 2 } = {}) {
  const light = new THREE.PointLight(0xffffff, 0, distance, decay);
  light.name = name;
  scene.add(light);
  const shares = new Map(); // instance -> { intensity, color }
  let disposed = false;

  const refresh = () => {
    let total = 0, r = 0, g = 0, b = 0;
    for (const { intensity, color } of shares.values()) {
      total += intensity;
      r += color.r * intensity;
      g += color.g * intensity;
      b += color.b * intensity;
    }
    light.intensity = total;
    if (total > 0) light.color.setRGB(r / total, g / total, b / total);
  };

  return {
    light,
    /** One instance's light this frame: its intensity and THREE.Color, with the light placed at `position`. */
    set(instance, intensity, color, position) {
      if (disposed) return;
      const share = shares.get(instance);
      if (share) {
        share.intensity = intensity;
        share.color = color;
      } else {
        shares.set(instance, { intensity, color });
      }
      light.position.copy(position);
      refresh();
    },
    /** The instance has ended: its share leaves the light. */
    release(instance) {
      if (shares.delete(instance)) refresh();
    },
    /** World teardown; safe to call again. */
    dispose() {
      if (disposed) return;
      disposed = true;
      shares.clear();
      scene.remove(light);
      light.dispose();
    },
  };
}
