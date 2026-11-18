// Game Two Part 14: smoother grounded AI transitions without changing
// authored saber attack duration, hit tests, root movement or network state.
export const DUEL_MOTION_RESPONSE_SECONDS = 0.14;
export const DUEL_RECOVERY_LEG_BLEND = 0.2;
export const DUEL_BASE_LEG_BLEND = 0.14;

const limit = x => Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));

export function duelMotionEligible(f) {
  const g = f?.g, now = g?.t;
  return !!(g?.experimentalCombatActive?.() && !g.net && !g.online &&
    !g.teamMode && !g.tutorialMode && !g.director && !g.bossWay &&
    !g.boardingMode && !g.attract && !g.aiOff && !g.noDamage &&
    f && !f.isPlayer && !f.remote && f.hasSaber &&
    f.status === 'normal' && f.onGround && !f.dodge &&
    !f.kata && !f.kicking && !f.executing &&
    !f.thrown && !f.saber?.holstered && !f.saber?.inFlight &&
    Number.isFinite(now));
}

// A pending/authored recovery owns the defender's stance. Do not overlay
// secondary footwork blending while recovery or a locked leg pose is active.
function animationRecoveryLocked(f) {
  return !!(f.experimentalRecovery ||
    (f.legsLockUntil ?? 0) > f.g.t ||
    f.critStrike || (f.critAt ?? 0) > f.g.t ||
    (f.critUntil ?? 0) > f.g.t);
}

export function defensiveMotionActive(f) {
  return duelMotionEligible(f) && !animationRecoveryLocked(f) && (
    (f.experimentalExchangeRecoveryUntil ?? 0) > f.g.t ||
    (f.experimentalDuelSupportUntil ?? 0) > f.g.t ||
    (f.experimentalWeaponSetback?.stage === 'guard' &&
      f.experimentalWeaponSetback.guardUntil >= f.g.t &&
      f.experimentalWeaponSetback.expireAt >= f.g.t &&
      f.experimentalWeaponSetback.attacker === f.g.player &&
      f.experimentalInjury?.zone === 'torso' &&
      f.experimentalInjury.until > f.g.t) ||
    (f.experimentalAdaptiveResponse?.action === 'retreat') ||
    (f.experimentalExchangeChain?.stage === 'reply'));
}

// Track normal AI intent even before entering a defensive footwork phase.
// Only ease movement input in a *vulnerable*, grounded ready stance. One
// smoothing operation per Fighter.update (not once per planning module).
export function smoothDuelMotion(f, forward, lateral, dt) {
  const fwd = limit(forward), right = limit(lateral);
  const eligible = duelMotionEligible(f);
  const active = eligible && defensiveMotionActive(f) &&
    !f.cmd?.attack && !f.cmd?.alt &&
    !f.saber?.isActiveSwing?.() && (f.saber?.weaponTime ?? 0) <= 0 &&
    (f.forceUntil ?? 0) <= f.g.t && !f.critStrike &&
    (f.critUntil ?? 0) <= f.g.t;
  const previous = f.experimentalMotionState;
  if (!active || !Number.isFinite(dt) || dt <= 0) {
    f.experimentalMotionState = { fwd, right, active: false };
    return { fwd, right, blended: false };
  }
  const factor = Math.min(1, Math.max(0, dt) / DUEL_MOTION_RESPONSE_SECONDS);
  const priorFwd = Number.isFinite(previous?.fwd) ? previous.fwd : fwd;
  const priorRight = Number.isFinite(previous?.right) ? previous.right : right;
  const result = {
    fwd: limit(priorFwd + (fwd - priorFwd) * factor),
    right: limit(priorRight + (right - priorRight) * factor),
    blended: true,
  };
  f.experimentalMotionState = { fwd: result.fwd, right: result.right, active: true };
  return result;
}

export function duelLegBlend(f, authoredBlend = DUEL_BASE_LEG_BLEND) {
  const original = Number.isFinite(authoredBlend) ? Math.max(0, authoredBlend) : DUEL_BASE_LEG_BLEND;
  // Only stance/leg cycling is blended more. Attacks, rolls, Force casts,
  // impact reactions and all existing collision windows stay authored.
  return defensiveMotionActive(f) &&
    !f.cmd?.attack && !f.cmd?.alt &&
    !f.saber?.isActiveSwing?.() && (f.saber?.weaponTime ?? 0) <= 0 &&
    (f.forceUntil ?? 0) <= f.g.t && !f.critStrike &&
    (f.critUntil ?? 0) <= f.g.t
    ? Math.max(original, DUEL_RECOVERY_LEG_BLEND) : original;
}

// Actual interrupted swings terminate pending defensive decisions. The
// stagger/open animation itself is still played by Fighter as authored.
export function interruptDuelMotion(f) {
  if (!f?.g?.experimentalCombatActive?.() || f.isPlayer || f.remote ||
      f.g.net || f.g.online || f.g.teamMode || f.g.boardingMode ||
      f.g.attract || f.g.noDamage || f.g.aiOff ||
      f.g.director || f.g.bossWay || f.g.tutorialMode) return false;
  f.experimentalMotionState = null;
  f.experimentalDuelSupportUntil = 0;
  f.experimentalExchangeChain = null;
  f.experimentalExchangeRiposte = null;
  f.experimentalExchangeRecoveryUntil = 0;
  f.experimentalExchangeRecoveryTarget = null;
  f.experimentalExchangeRecoveryKind = null;
  f.experimentalAdaptiveResponse = null;
  f.experimentalTacticalCue = null; // no delayed response after an unrelated stagger
  f.experimentalSwingReceipt = null;
  f.experimentalRecovery = null;
  f.experimentalWeaponSetback = null;
  return true;
}
