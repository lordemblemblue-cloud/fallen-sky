// Hold-to-charge basic attacks (owner 2026-11-19): holding the attack button charges the swing. The wind-up plays in
// slow motion while the button is held, then speeds back up to finish the strike on release, as a montage over
// locomotion (player/LunaDashboardPlayerController.jsx plays it; player/locomotionUnderlay.js keeps the legs moving).
//
// Damage: a charged strike does double damage when the held weapon's mastery passive is maxed AND the button was
// held for the full charge (the same 1.2 s as the bow's and the skills' charges). Anything less hits as a normal
// swing. The damage stays decided where it is today: GameWorld3D lands a basic melee strike on its swing's contact
// frame and multiplies it by `holdChargeMultiplier` there. PvE only, like the other basic-attack style multipliers
// (duels resolve damage on the server).
import { BOW_FULL_CHARGE_MS } from './ArcheryChargeRules.mjs';

export const HOLD_CHARGE = Object.freeze({
  engageMs: 200, // still held this long after the press, the swing becomes a charge (a quicker click is a normal hit)
  fullMs: BOW_FULL_CHARGE_MS, // held this long: fully charged (1.2 s)
  multiplier: 2, // a full charge with the mastery passive maxed
  releaseSpeed: 1.6, // the strike after the release plays this much faster, back to normal once it has landed
  minSlowSpeed: 0.12, // the charge's wind-up never plays slower than this
});

// The held weapon's mastery passive is maxed: its weapon mastery is at its cap (weaponSynergyData MASTERY_MAX_LEVEL;
// WeaponPassiveResolver turns the mastery level into the weapon's passives). `levelOf` / `maxLevel` are injected so
// this stays a pure rule.
export function isChargePassiveMaxed(family, { levelOf = () => 0, maxLevel = 20 } = {}) {
  if (!family) return false;
  const level = Number(levelOf(family));
  return Number.isFinite(level) && level >= Math.max(1, Number(maxLevel) || 20);
}

// How far a hold has come. engaged: the swing turned into a charge; full: held for the full charge.
export function holdChargeStatus(heldMs = 0, { engaged = true } = {}) {
  const ms = Math.max(0, Number.isFinite(Number(heldMs)) ? Number(heldMs) : 0);
  const progress = Math.min(1, ms / HOLD_CHARGE.fullMs);
  return { heldMs: ms, progress, percent: Math.floor(progress * 100 + 1e-9), engaged: !!engaged && ms >= HOLD_CHARGE.engageMs,
    full: !!engaged && ms >= HOLD_CHARGE.fullMs };
}

// The damage multiplier a landed swing carries: double for a full charge with the passive maxed, otherwise 1.
export function holdChargeMultiplier({ heldMs = 0, engaged = false, passiveMaxed = false } = {}) {
  const status = holdChargeStatus(heldMs, { engaged });
  return status.full && passiveMaxed ? HOLD_CHARGE.multiplier : 1;
}

// The charge's wind-up speed: slow enough that the coil reaches its peak exactly when the charge is full.
// clipLeft: clip seconds from where the wind-up is to its peak; heldMs: how long the button has been held so far.
export function chargeWindUpSpeed(clipLeft, heldMs) {
  const msLeft = HOLD_CHARGE.fullMs - Math.max(0, Number(heldMs) || 0);
  if (!(clipLeft > 0)) return 0;
  if (!(msLeft > 1)) return 1;
  return Math.max(HOLD_CHARGE.minSlowSpeed, Math.min(1, clipLeft / (msLeft / 1000)));
}
