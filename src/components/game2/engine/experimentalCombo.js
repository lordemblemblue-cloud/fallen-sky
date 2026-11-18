// Part 4: bounded post-parry combo links for offline Experimental Game Two.
// A combo only advances on an actual saber swing and a real, resolved blade
// contact. Failed evades and missed swings never award a free link.
import { staminaBroken } from './experimentalStamina.js';
import { counterStepIntent } from './experimentalCounter.js';

export const COMBO_MAX_STEPS = 2;           // first parry flank + one follow-up
export const COMBO_STEP_WINDOW = 1.7;       // time to land the follow-up strike
export const COMBO_CONTACT_WINDOW = 1.15;  // time to choose next Q + direction
export const COMBO_LINK_FORCE_PERCENT = 18;
export const COMBO_LINK_STAMINA_COST = 12;
export const AI_COMBO_RESPONSE_WINDOW = 1.2;

export function startCounterCombo(actor, target, now) {
  if (!actor || !target || !Number.isFinite(now)) return null;
  const state = { target, links: 1, phase: 'step', until: now + COMBO_STEP_WINDOW };
  actor.experimentalCombo = state;
  return state;
}

export function recordComboSwing(actor, now) {
  const s = actor?.experimentalCombo;
  if (!s || now > s.until || !['step', 'reposition'].includes(s.phase) ||
      !s.target || s.target.status === 'dead') return false;
  actor.experimentalCombo = { ...s, phase: 'swing', until: now + COMBO_CONTACT_WINDOW };
  return true;
}

export function recordComboContact(attacker, defender, result, now) {
  const s = attacker?.experimentalCombo;
  if (!s || s.phase !== 'swing' || now > s.until || s.target !== defender ||
      !['hit', 'blocked'].includes(result)) return false;
  // A surviving opponent can react; a defeated one cannot be chain-farmed.
  if (defender?.status === 'dead' || defender?.hp <= 0) {
    attacker.experimentalCombo = null;
    return false;
  }
  attacker.experimentalCombo = { ...s, phase: 'contact', until: now + COMBO_CONTACT_WINDOW };
  return true;
}

export function canComboReposition(actor, force, now) {
  const s = actor?.experimentalCombo;
  if (!s || !Number.isFinite(now) || s.phase !== 'contact' || now > s.until ||
      s.links >= COMBO_MAX_STEPS || !s.target || s.target.remote ||
      s.target.status === 'dead' || s.target.hp <= 0 ||
      actor.remote || !actor.isPlayer || actor.status !== 'normal' ||
      !actor.onGround || actor.dodge || actor.kata || actor.kicking ||
      actor.executing || actor.thrown || actor.forceUntil > now ||
      actor.saber?.holstered || actor.saber?.inFlight ||
      actor.saber?.isActiveSwing?.() || actor.saber?.weaponTime > 0 ||
      !counterStepIntent(actor.cmd)) return false;
  const dx = s.target.pos[0] - actor.pos[0], dz = s.target.pos[2] - actor.pos[2];
  if (Math.hypot(dx, dz) > 4.5) return false;
  if (!force || force.holding || force.charging || force.dash ||
      force.fp < force.max * COMBO_LINK_FORCE_PERCENT / 100) return false;
  const stamina = actor.experimentalStamina;
  return !!(stamina && !staminaBroken(stamina, now) &&
    stamina.current >= COMBO_LINK_STAMINA_COST);
}

export function advanceComboReposition(actor, now) {
  const s = actor?.experimentalCombo;
  if (!s || s.phase !== 'contact' || s.links >= COMBO_MAX_STEPS) return false;
  actor.experimentalCombo = { ...s, links: s.links + 1, phase: 'reposition',
    until: now + COMBO_STEP_WINDOW };
  return true;
}

export function aiComboResponse(attacker, defender, now, roll = Math.random()) {
  if (!attacker?.isPlayer || !defender || defender.remote || defender.isPlayer ||
      defender.status === 'dead' || !defender.hasSaber ||
      !Number.isFinite(now) || !attacker.experimentalCombo ||
      defender.experimentalStamina?.current < 25) return null;
  const d = Math.hypot(defender.pos[0] - attacker.pos[0], defender.pos[2] - attacker.pos[2]);
  if (d > 4.5) return null;
  // React once to a confirmed hit/block; high-skilled opponents read the
  // follow-up more often, but every reaction still needs resources/cooldown.
  const skill = Math.max(0, Math.min(1, defender.blockSkill ?? 0.5));
  const flank = Math.sin(attacker.yaw - defender.yaw);
  return { attacker, until: now + AI_COMBO_RESPONSE_WINDOW,
    side: Math.abs(flank) > 0.15 ? (flank > 0 ? 1 : -1) : (roll < 0.5 ? -1 : 1),
    forceEvade: roll < 0.18 + 0.48 * skill };
}
