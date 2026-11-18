// Game Two Part 9: physical saber-bind ripostes.
// A riposte starts only after two live blade segments actually intersect.
// This does not simulate hits, grant invulnerability or bypass Classic rules.
import { preciseParry } from './experimentalCounter.js';
import { staminaBroken } from './experimentalStamina.js';

export const BIND_RIPOSTE_COOLDOWN = 1.6;
export const BIND_RIPOSTE_STAMINA_COST = 12;
export const BIND_MIN_POST_CLASH_STAMINA = 24;
export const BIND_AI_BASE_CHANCE = 0.12;
export const BIND_AI_SKILL_CHANCE = 0.45;
export const BIND_MAX_DISTANCE = 3.3;

export function canBindRiposte(game, attacker, defender, contact, attackerSwing, defenderSwing, roll = Math.random()) {
  if (!game?.experimentalCombatActive?.() || game.net || game.online ||
      game.teamMode || game.director || game.bossWay || game.attract || game.boardingMode ||
      game.noDamage || !attackerSwing || defenderSwing ||
      !attacker || !defender || attacker === defender || !Array.isArray(contact) ||
      !contact.every(Number.isFinite) || attacker.remote || defender.remote ||
      !attacker.hasSaber || !defender.hasSaber ||
      attacker.status !== 'normal' || defender.status !== 'normal' ||
      attacker.kata || attacker.executing || defender.kata || defender.executing ||
      attacker.dodge || defender.dodge || defender.thrown ||
      defender.saber?.holstered || defender.saber?.inFlight ||
      defender.saber?.isActiveSwing?.() || !defender.onGround ||
      defender.spawnShield > game.t || attacker.spawnShield > game.t ||
      (attacker.experimentalBindReadyAt ?? 0) > game.t ||
      (defender.experimentalBindReadyAt ?? 0) > game.t) return false;
  const stamina = defender.experimentalStamina;
  if (!stamina || staminaBroken(stamina, game.t) ||
      stamina.current < BIND_MIN_POST_CLASH_STAMINA + BIND_RIPOSTE_STAMINA_COST) return false;
  const dx = attacker.pos[0] - defender.pos[0], dz = attacker.pos[2] - defender.pos[2];
  const distance = Math.hypot(dx, dz);
  if (distance > BIND_MAX_DISTANCE || distance < 0.2) return false;
  if (defender.isPlayer) return preciseParry(defender, contact, game.t);
  // Skilled AI gets a chance to read a front-facing blade bind, not a free
  // rear counter and not automatic tracking following a Force flank.
  const forward = (Math.sin(defender.yaw) * dx + Math.cos(defender.yaw) * dz) / distance;
  if (forward < 0.35 || defender.experimentalFlankRead ||
      !Number.isFinite(roll) || roll < 0 || roll >= 1) return false;
  const skill = Math.max(0, Math.min(1, defender.blockSkill ?? 0.5));
  return roll < BIND_AI_BASE_CHANCE + BIND_AI_SKILL_CHANCE * skill;
}

export function markBindRiposte(attacker, defender, now) {
  attacker.experimentalBindReadyAt = now + BIND_RIPOSTE_COOLDOWN;
  defender.experimentalBindReadyAt = now + BIND_RIPOSTE_COOLDOWN;
}
