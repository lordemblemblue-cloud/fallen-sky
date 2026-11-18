// Part 8 — Force Speed-powered saber burst. All state is local and
// Experimental-only: no extra network combat messages or Classic changes.
import { experimentalForceEnabled } from './experimentalForceCombos.js';
import { staminaBroken } from './experimentalStamina.js';
import { counterStepIntent } from './experimentalCounter.js';

export const SABER_SURGE_SECONDS = 2;
export const SABER_SURGE_RATE = 1.8;           // Classic Speed remains 1.35
export const SURGE_SWING_CONTACT_WINDOW = 0.8;
export const SURGE_FOLLOWUP_SECONDS = 0.85;
export const SURGE_EVADE_FORCE_PERCENT = 15;
export const SURGE_EVADE_STAMINA_COST = 10;
export const SURGE_AI_REACTION_MIN = 0.12;
export const SURGE_AI_REACTION_MAX = 0.36;

export function beginSaberSurge(force) {
  if (!experimentalForceEnabled(force) || !force.active?.speed) {
    if (force) force.saberSurge = null;
    return false;
  }
  force.saberSurge = { until: force.g.t + SABER_SURGE_SECONDS,
    swingAt: null, target: null, contactUntil: 0, consumed: false, aiReadUsed: false };
  return true;
}

export function saberSurgeActive(force, now = force?.g?.t) {
  return !!(experimentalForceEnabled(force) && force.active?.speed &&
    force.saberSurge && Number.isFinite(now) && now < force.saberSurge.until &&
    force.p?.status === 'normal' && !force.p.saber?.holstered);
}

export function saberSurgeRate(force, normalRate, now = force?.g?.t) {
  return saberSurgeActive(force, now) ? Math.max(normalRate, SABER_SURGE_RATE) : normalRate;
}

// Only a committed saber strike (not a wind-up, animation start or idle blade
// touch) can qualify for the one real-contact directional follow-up.
export function noteSurgeSwing(force, now) {
  if (!saberSurgeActive(force, now)) return false;
  const s = force.saberSurge;
  if (s.consumed) return false;
  s.swingAt = now;
  s.target = null;
  s.contactUntil = 0;
  return true;
}

export function noteSurgeContact(force, defender, outcome, now) {
  const s = force?.saberSurge;
  if (!s || s.consumed || !Number.isFinite(s.swingAt) ||
      !['hit', 'blocked'].includes(outcome) || !defender ||
      defender.remote || defender.status === 'dead' || defender.hp <= 0 ||
      !Number.isFinite(now) || now < s.swingAt ||
      now > s.swingAt + SURGE_SWING_CONTACT_WINDOW || s.swingAt >= s.until) return false;
  s.target = defender;
  s.contactUntil = now + SURGE_FOLLOWUP_SECONDS;
  s.swingAt = null; // one swing never creates multiple free contacts
  return true;
}

export function canSurgeEvade(force, fighter, now) {
  const s = force?.saberSurge, target = s?.target;
  if (!experimentalForceEnabled(force) || !s || s.consumed ||
      !target || target.remote || target.status === 'dead' || target.hp <= 0 ||
      !Number.isFinite(now) || now > s.contactUntil ||
      fighter !== force.p || !fighter.isPlayer || fighter.remote ||
      fighter.status !== 'normal' || !fighter.onGround ||
      fighter.dodge || fighter.kata || fighter.kicking ||
      fighter.executing || fighter.thrown || fighter.forceUntil > now ||
      fighter.saber?.holstered || fighter.saber?.inFlight ||
      fighter.saber?.isActiveSwing?.() || fighter.saber?.weaponTime > 0 ||
      (fighter.dodgeReadyAt || 0) > now || !counterStepIntent(fighter.cmd) ||
      force.holding || force.charging || force.dash ||
      force.fp < force.max * SURGE_EVADE_FORCE_PERCENT / 100) return false;
  const stamina = fighter.experimentalStamina;
  return !!(stamina && !staminaBroken(stamina, now) &&
    stamina.current >= SURGE_EVADE_STAMINA_COST &&
    Math.hypot(target.pos[0] - fighter.pos[0], target.pos[2] - fighter.pos[2]) <= 4.5);
}

export function consumeSurgeEvade(force) {
  if (!force?.saberSurge || force.saberSurge.consumed) return false;
  force.saberSurge.consumed = true;
  force.saberSurge.contactUntil = 0;
  return true;
}

export function planSaberSurgeResponse(force, defender, now, roll = Math.random()) {
  const attacker = force?.p, s = force?.saberSurge;
  if (!saberSurgeActive(force, now) || s.aiReadUsed ||
      !attacker.isPlayer || !defender || defender.remote ||
      defender.isPlayer || !defender.hasSaber || !defender.onGround ||
      defender.status !== 'normal' || defender.hp <= 0 ||
      defender.experimentalStamina?.current < 25) return null;
  const dx = attacker.pos[0] - defender.pos[0], dz = attacker.pos[2] - defender.pos[2];
  const d = Math.hypot(dx, dz);
  if (d <= 0.2 || d > 4) return null;
  const front = (Math.sin(defender.yaw) * dx + Math.cos(defender.yaw) * dz) / d;
  if (front < 0.15) return null; // no instant rear omniscience
  const skill = Math.max(0, Math.min(1, defender.blockSkill ?? 0.5));
  s.aiReadUsed = true; // at most one read per actual Speed activation
  if (roll > 0.16 + 0.52 * skill) return null;
  const delay = SURGE_AI_REACTION_MAX - (SURGE_AI_REACTION_MAX - SURGE_AI_REACTION_MIN) * skill;
  return { attacker, noticeAt: now + delay, until: now + delay + 0.35,
    side: Math.sin(defender.yaw - attacker.yaw) >= 0 ? 1 : -1 };
}
