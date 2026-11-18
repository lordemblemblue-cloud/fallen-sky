// Opt-in Game Two saber configuration policy; no changes to Classic gameplay.
export const SABER_SEQUENCE = Object.freeze(['single', 'dual', 'staff']);
export function nextSaberKit(current) {
  return SABER_SEQUENCE[(SABER_SEQUENCE.indexOf(current) + 1) % SABER_SEQUENCE.length];
}
export function maySwitchSaber(fighter, now, nextAllowedAt = 0) {
  if (!fighter?.hasSaber || fighter.status !== 'normal' || fighter.thrown ||
      fighter.kata || fighter.kicking || fighter.saber?.holstered ||
      fighter.saber?.weaponTime > 0 || fighter.saber?.isActiveSwing?.() ||
      now < nextAllowedAt) return false;
  return true;
}
export const SABER_SWAP_COOLDOWN = 0.75;
