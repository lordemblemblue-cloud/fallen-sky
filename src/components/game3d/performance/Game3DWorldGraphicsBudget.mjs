// Live in-world graphics budget. Changing the pause-menu quality preset or
// the dynamic-shadow switch must reduce work on the renderer that is already
// drawing the world. UI size and camera FOV are not part of this budget.
const PRESETS = Object.freeze({
  low: Object.freeze({ shadowSize: 256, shadowExtent: 14, fogScale: 0.5, particleScale: 0.25 }),
  medium: Object.freeze({ shadowSize: 512, shadowExtent: 18, fogScale: 0.72, particleScale: 0.5 }),
  high: Object.freeze({ shadowSize: 1024, shadowExtent: 25, fogScale: 1, particleScale: 1 }),
  ultra: Object.freeze({ shadowSize: 2048, shadowExtent: 32, fogScale: 1.15, particleScale: 1 }),
});

export function game3dWorldGraphicsBudget(raw) {
  const quality = PRESETS[raw?.quality] ? raw.quality : 'high';
  const preset = PRESETS[quality];
  return Object.freeze({
    quality,
    shadows: raw?.shadows !== false,
    shadowSize: preset.shadowSize,
    shadowExtent: preset.shadowExtent,
    fogScale: preset.fogScale,
    particleScale: preset.particleScale,
  });
}
