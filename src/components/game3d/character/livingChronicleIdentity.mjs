/**
 * Living Chronicle — original Game 3D character-selection visual language.
 * No reference-video pixels, animations or assets. This generates only a
 * subtle color identity from the existing faction + saved progression.
 */
const PALETTES = Object.freeze({
  AXE_Faction_1: Object.freeze({
    accent: '#a6dfe1', muted: 'rgba(132,219,222,.18)',
    glow: 'rgba(89,204,213,.20)', phrase: 'Current of Dawn',
  }),
  AXE_Faction_2: Object.freeze({
    accent: '#e5c698', muted: 'rgba(213,166,101,.16)',
    glow: 'rgba(204,149,86,.18)', phrase: 'Ember of Resolve',
  }),
  AXE_Faction_3: Object.freeze({
    accent: '#c2b9ea', muted: 'rgba(177,151,229,.17)',
    glow: 'rgba(150,124,214,.18)', phrase: 'Veil of Stars',
  }),
});
const DEFAULT = Object.freeze({
  accent: '#c3d8e5', muted: 'rgba(154,192,210,.12)',
  glow: 'rgba(125,174,201,.14)', phrase: 'An Unwritten Path',
});

const finiteLevel = value => Number.isFinite(Number(value)) && Number(value) > 0
  ? Math.floor(Number(value)) : 0;

export function getLivingChronicleIdentity(character, overview) {
  const factionId = typeof character?.factionId === 'string' ? character.factionId : '';
  const palette = Object.prototype.hasOwnProperty.call(PALETTES, factionId)
    ? PALETTES[factionId] : DEFAULT;
  const spirit = overview?.spiritual || {};
  // Gently brighten the 2D signature for earned spiritual progress; gameplay
  // world lighting, character materials and stats remain untouched.
  const attained = finiteLevel(spirit.halo)
    + finiteLevel(spirit.wingLevel)
    + finiteLevel(spirit.titleLevel)
    + finiteLevel(spirit.aura);
  const light = Math.min(.6, .2 + Math.log1p(attained) * .068);
  return {
    ...palette,
    light,
    attained,
    css: {
      '--chronicle-accent': palette.accent,
      '--chronicle-muted': palette.muted,
      '--chronicle-glow': palette.glow,
      '--chronicle-luminosity': light.toFixed(3),
    },
  };
}

/** Original very small, rig-friendly idle gaze curve; no camera movement. */
export function sampleLivingChronicleGaze(seconds, weight = 1, reducedMotion = false) {
  if (reducedMotion || !Number.isFinite(seconds) || weight <= 0) {
    return {yaw:0,pitch:0};
  }
  const w = Math.max(0, Math.min(1, Number(weight) || 0));
  // Independent slow phases avoid mechanical mirrored left/right head turns.
  const yaw = (Math.sin(seconds * .37) * .055
    + Math.sin(seconds * .19 + 1.2) * .025) * w;
  const pitch = (Math.sin(seconds * .23 + .65) * .028
    - .013) * w;
  return {yaw,pitch};
}
