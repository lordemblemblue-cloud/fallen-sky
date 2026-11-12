import { skillCombatFamily } from './ChargedSkillRules.mjs';

// The second skill evolution (Master rank, skill level 8) unlocks the hold.
// One resource payment and one cooldown per channel; max 8 pulses/1.8 seconds.
export const AXE_AOE_CHANNEL = Object.freeze({
  unlockMasteryLevel: 8,
  holdStartMs: 260,
  pulseIntervalMs: 240,
  maxPulses: 8,
  durationMs: 1800,
  pulseDamageScale: 0.42,
});

export function isAOEChannelUnlocked(skill, masteryLevel) {
  return skillCombatFamily(skill) === 'aoe' &&
    Number.isFinite(Number(masteryLevel)) &&
    Number(masteryLevel) >= AXE_AOE_CHANNEL.unlockMasteryLevel;
}
