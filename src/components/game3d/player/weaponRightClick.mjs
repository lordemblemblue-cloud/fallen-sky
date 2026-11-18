// What the right mouse button does with each weapon (owner request 2026-11-18; numbers from the owner-approved
// audit, docs/game3d/BLACKSMITH_COMBAT_V2_AUDIT_20261118.md, decisions 11 and 12):
// - Bow: hold to aim (the over-the-shoulder zoom). Only the bow zooms.
// - Sword: hold to put the off hand on the hilt: a two-hand stance whose attacks and sword skills hit harder,
//   walking a little slower and with no guard while it is held. A quick tap still guards.
// - Daggers: the right button is the normal attack (a stab); the left button chains the even faster light
//   slashes. Daggers have no right-click guard.
// - Empty hands and other weapons: a quick tap guards.
// - Riding: the bow still aims; anything else taps to guard.
// Damage multipliers apply to PvE strikes; duels take their damage from the server's own table.

export const RIGHT_CLICK = Object.freeze({ AIM: 'aim', STANCE: 'stance', ATTACK: 'attack', GUARD: 'guard' });

export function resolveRightClickAction({ family = null, ranged = false, mounted = false } = {}) {
  if (ranged || family === 'bow') return RIGHT_CLICK.AIM;
  if (mounted) return RIGHT_CLICK.GUARD;
  if (family === 'dual_blades') return RIGHT_CLICK.ATTACK;
  if (family === 'sword') return RIGHT_CLICK.STANCE;
  return RIGHT_CLICK.GUARD;
}

// The two-hand sword stance: held this long it is on (a shorter press is the guard tap).
export const SWORD_STANCE = Object.freeze({ holdMs: 220, damageMultiplier: 1.2, moveSpeedMultiplier: 0.75 });
// Dagger basic attacks: the light chain swings faster, so each light hit carries a little less than the stab.
export const DAGGER_ATTACKS = Object.freeze({ lightMultiplier: 0.75, normalMultiplier: 1 });

export function createSwordStance({ holdMs = SWORD_STANCE.holdMs } = {}) {
  let pressedAt = null;
  let active = false;
  return {
    press(now = 0) { pressedAt = Number(now) || 0; active = false; },
    // call every frame; true while the stance is on
    update(now = 0) {
      if (pressedAt !== null && !active && now - pressedAt >= holdMs) active = true;
      return active;
    },
    // { heldMs, wasActive }: a release before holdMs is a tap
    release(now = 0) {
      const heldMs = pressedAt === null ? 0 : Math.max(0, now - pressedAt);
      const wasActive = active || (pressedAt !== null && heldMs >= holdMs);
      pressedAt = null;
      active = false;
      return { heldMs, wasActive };
    },
    cancel() { pressedAt = null; active = false; },
    isHeld: () => pressedAt !== null,
    isActive: () => active,
  };
}

// A long two-handed blade (the odachi, any katana) is always held in both hands and keeps its own combo.
const LONG_BLADE = /greatsword|odachi|katana|tachi/i;
export const isLongBlade = (held) => LONG_BLADE.test(`${held?.cls || held?.class || ''} ${held?.id || ''}`);

// Which combo a basic melee click swings: null = no weapon combo (empty hands punch and kick).
export function basicMeleeComboKind({ family = null, stance = false, variant = 'light', longBlade = false } = {}) {
  if (family === 'dual_blades') return variant === 'normal' ? 'daggerStab' : 'daggerLight';
  if (family === 'sword') return stance && !longBlade ? 'swordTwoHand' : 'swordCombo';
  return null;
}
// The swings whose contact frame lands a basic strike (skills land on their own schedule).
export const BASIC_MELEE_COMBOS = Object.freeze(new Set(['swordCombo', 'swordTwoHand', 'daggerLight', 'daggerStab']));

// How the way the weapon is used scales a PvE strike.
export function weaponStyleMultiplier({ family = null, stance = false, variant = null, isSkill = false, skillWeaponType = null } = {}) {
  if (family === 'sword' && stance && (!isSkill || skillWeaponType === 'sword')) return SWORD_STANCE.damageMultiplier;
  if (family === 'dual_blades' && !isSkill) return variant === 'normal' ? DAGGER_ATTACKS.normalMultiplier : DAGGER_ATTACKS.lightMultiplier;
  return 1;
}
