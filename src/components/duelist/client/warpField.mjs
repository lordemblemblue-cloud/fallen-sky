/**
 * Renderer-neutral state for Duelist telekinesis distortion.
 *
 * Both the existing GLSL EffectComposer pass and a future WebGPU/TSL node
 * can consume the same projected ring/lens records. This module imports no
 * WebGL, Three.js renderer, DOM, or shader APIs.
 */
export const MAX_WARP_EFFECTS = 8;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export function createWarpField({ maxEffects = MAX_WARP_EFFECTS } = {}) {
  const limit = Math.max(1, Math.floor(Number.isFinite(maxEffects) ? maxEffects : MAX_WARP_EFFECTS));
  const waves = [];
  const lenses = [];

  return {
    ring({ at, kind = 'out', r0 = 0.2, r1 = 5, strength = 0.03, thickness = 0.35, ttl = 0.45 }) {
      if (waves.length >= limit) waves.shift();
      waves.push({
        at: at.clone(), kind, r0, r1, strength, thickness,
        ttl: Math.max(1e-6, ttl), age: 0,
      });
    },

    // Held bodies are supplied by the simulation each frame (not accumulated).
    hold(list = []) {
      lenses.length = 0;
      for (const lens of list) lenses.push(lens);
    },

    update(dt) {
      const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i].age += elapsed / waves[i].ttl;
        if (waves[i].age >= 1) waves.splice(i, 1);
      }
    },

    /**
     * Emit projected effects in screen-height units, waves before lenses.
     *
     * project(worldPosition) -> { x, y, perMetre } | null, where null means
     * outside the view frustum.
     * write(index, x, y, radius, strength, kind, thickness, spin) consumes
     * numeric fields for reusable shader uniforms / TSL nodes.
     * kind: 0 outward ring, 1 inward ring, 2 swirling lens.
     * Returns the number of visible effects emitted.
     */
    write(project, write) {
      let count = 0;
      for (const wave of waves) {
        if (count >= limit) break;
        const s = project(wave.at);
        if (!s) continue;
        const progress = wave.kind === 'in' ? 1 - easeOutCubic(wave.age) : easeOutCubic(wave.age);
        const radius = (wave.r0 + (wave.r1 - wave.r0) * progress) * s.perMetre;
        const fade = (1 - wave.age) ** 1.6;
        write(
          count, s.x, s.y, radius, wave.strength * fade,
          wave.kind === 'in' ? 1 : 0,
          Math.max(0.004, radius * wave.thickness), 0,
        );
        count += 1;
      }

      for (const lens of lenses) {
        if (count >= limit) break;
        const s = project(lens.at);
        if (!s) continue;
        write(count, s.x, s.y, lens.radius * s.perMetre, lens.strength, 2, 0, lens.spin);
        count += 1;
      }
      return count;
    },
  };
}
