// Part 10: bounded, evidence-based AI decisions after an actual saber block.
// Only command intent and existing Force Evade are used. No instant attack,
// aim snap, invented animation, invulnerability or server-side gameplay change.
import { staminaBroken, STAMINA_SWING_COST } from './experimentalStamina.js';

export const ADAPTIVE_COOLDOWN = 2.1;
export const ADAPTIVE_WINDOW = 1.35;
export const ADAPTIVE_RETREAT_SECONDS = 0.45;
export const ADAPTIVE_FORCE_PERCENT = 15;
export const ADAPTIVE_STAMINA_FLOOR = 30;
export const ADAPTIVE_NOTICE_MIN = 0.18;
export const ADAPTIVE_NOTICE_MAX = 0.42;
export const ADAPTIVE_MAX_RANGE = 3.8;
const valid = x => Number.isFinite(x);

export function adaptiveAIEligible(g, npc, enemy, now = g?.t) {
  if (!g?.experimentalCombatActive?.() || g.net || g.online || g.teamMode ||
      g.tutorialMode || g.director || g.bossWay || g.attract || g.boardingMode ||
      g.noDamage || g.aiOff || !valid(now) || !npc || !enemy ||
      npc.isPlayer || npc.remote || !npc.hasSaber || npc.saber?.holstered ||
      npc.saber?.inFlight || npc.status !== 'normal' || !npc.onGround ||
      npc.hp <= 0 || npc.dodge || npc.thrown || npc.kata || npc.executing ||
      !enemy.isPlayer || enemy.remote || enemy.status === 'dead' ||
      enemy.hp <= 0 || (npc.spawnShield ?? 0) > now || (enemy.spawnShield ?? 0) > now ||
      (npc.critAt ?? 0) > now || (npc.critUntil ?? 0) > now ||
      npc.experimentalFlankRead || npc.experimentalSurgeResponse || npc.experimentalComboResponse ||
      (npc.experimentalAdaptiveReadyAt ?? 0) > now ||
      npc.experimentalAdaptiveResponse || npc.experimentalExchangeChain ||
      (npc.experimentalExchangeRecoveryUntil ?? 0) > now) return false;
  const stamina = npc.experimentalStamina;
  if (!stamina || staminaBroken(stamina, now) || stamina.current < ADAPTIVE_STAMINA_FLOOR ||
      !g.foesOf?.(npc)?.includes(enemy)) return false;
  const dx = enemy.pos[0] - npc.pos[0], dz = enemy.pos[2] - npc.pos[2], d = Math.hypot(dx, dz);
  if (!valid(d) || d < 0.45 || d > ADAPTIVE_MAX_RANGE) return false;
  // A recently flanked opponent must finish its separate perception process.
  // React only to a physically present combatant in the forward arc.
  const forward = (Math.sin(npc.yaw) * dx + Math.cos(npc.yaw) * dz) / d;
  return forward >= 0.25;
}

export function planAdaptiveExchange(g, npc, enemy, role, roll = Math.random()) {
  if (!['blocked', 'was-blocked'].includes(role) || !valid(roll) ||
      roll < 0 || roll >= 1 || !adaptiveAIEligible(g, npc, enemy)) return null;
  const stamina = npc.experimentalStamina.current;
  const skill = Math.max(0, Math.min(1, npc.blockSkill ?? 0.5));
  const d = Math.hypot(enemy.pos[0] - npc.pos[0], enemy.pos[2] - npc.pos[2]);
  const force = g.forceOf?.(npc), readyForce = force &&
    force.fp >= (force.max || 100) * ADAPTIVE_FORCE_PERCENT / 100 &&
    !force.holding && !force.charging && !force.dash;
  let action;
  if (stamina < 48) action = 'retreat';
  else if (readyForce && roll < 0.14 + skill * 0.32) action = 'force-step';
  else if (stamina >= STAMINA_SWING_COST + 28 && d <= 2.7 &&
      roll < (role === 'blocked' ? 0.86 : 0.53 + skill * 0.23)) action = 'attack';
  else action = 'retreat';
  const notice = ADAPTIVE_NOTICE_MAX - (ADAPTIVE_NOTICE_MAX - ADAPTIVE_NOTICE_MIN) * skill;
  return {
    target: enemy, role, action,
    noticeAt: g.t + notice, until: g.t + notice + ADAPTIVE_WINDOW,
    retreatUntil: g.t + notice + ADAPTIVE_RETREAT_SECONDS,
    side: Math.sin(npc.yaw - enemy.yaw) >= 0 ? 1 : -1,
  };
}

export function queueAdaptiveExchange(g, npc, enemy, role, roll = Math.random()) {
  const response = planAdaptiveExchange(g, npc, enemy, role, roll);
  if (!response) return false;
  npc.experimentalAdaptiveResponse = response;
  npc.experimentalAdaptiveReadyAt = g.t + ADAPTIVE_COOLDOWN;
  return true;
}

// This runs *after* the normal AI brain chooses commands and stamina regen
// runs, but *before* Fighter.update, so the same locomotion, combat and map
// collision path processes the response. Returned label is informational.
export function tickAdaptiveExchange(g, npc, now = g?.t) {
  const r = npc?.experimentalAdaptiveResponse;
  if (!r) return null;
  const target = r.target;
  if (!valid(now) || now > r.until || !g?.experimentalCombatActive?.() ||
      g.net || g.tutorialMode || g.director || g.bossWay || g.aiOff ||
      !target || !g.foesOf?.(npc)?.includes(target) ||
      !target.isPlayer || target.status === 'dead' || target.hp <= 0 ||
      !npc.hasSaber || npc.status !== 'normal' || npc.hp <= 0 ||
      !npc.onGround || npc.dodge || npc.kata ||
      (npc.critAt ?? 0) > now || (npc.critUntil ?? 0) > now ||
      npc.experimentalFlankRead || npc.experimentalSurgeResponse || npc.experimentalComboResponse ||
      staminaBroken(npc.experimentalStamina, now) ||
      npc.experimentalStamina?.current < ADAPTIVE_STAMINA_FLOOR) {
    npc.experimentalAdaptiveResponse = null;
    return null;
  }
  if (now < r.noticeAt) return null; // no instant awareness
  const dx = target.pos[0] - npc.pos[0], dz = target.pos[2] - npc.pos[2];
  const d = Math.hypot(dx, dz);
  if (d > ADAPTIVE_MAX_RANGE || d < 0.45 ||
      (Math.sin(npc.yaw) * dx + Math.cos(npc.yaw) * dz) / d < 0.25) {
    npc.experimentalAdaptiveResponse = null;
    return null;
  }
  const ready = !npc.saber?.isActiveSwing?.() && (npc.saber?.weaponTime ?? 0) <= 0 &&
    (npc.forceUntil ?? 0) <= now && !npc.executing && !npc.critStrike;
  if (r.action === 'force-step') {
    const F = g.forceOf?.(npc), cost = (F?.max || 100) * ADAPTIVE_FORCE_PERCENT / 100;
    if (ready && F && F.fp >= cost && !F.holding && !F.charging && !F.dash &&
        (npc.dodgeReadyAt ?? 0) <= now) {
      // Existing evadeHeld verifies the real BSP floor and the entire dodge
      // path, then spends Force once and plays the authored dodge animation.
      npc.cmd.attack = false; npc.cmd.fwd = -0.6; npc.cmd.right = r.side;
      if (g.combat?.evadeHeld?.(target, npc, F, cost)) {
        npc.experimentalAdaptiveResponse = null;
        return 'force-step';
      }
    }
    // No safe route or no Force: take normal grounded retreat instead.
    r.action = 'retreat';
    r.retreatUntil = now + ADAPTIVE_RETREAT_SECONDS;
  }
  if (r.action === 'attack') {
    if (!ready) return null; // wait for authentic saber recovery frames
    if (npc.experimentalStamina.current < STAMINA_SWING_COST + 6) {
      r.action = 'retreat';
      r.retreatUntil = now + ADAPTIVE_RETREAT_SECONDS;
    } else if (d <= 2.7) {
      npc.cmd.attack = true;
      npc.cmd.alt = false;
      npc.experimentalAdaptiveResponse = null;
      return 'attack';
    } else {
      npc.experimentalAdaptiveResponse = null;
      return null;
    }
  }
  if (r.action === 'retreat') {
    if (now >= r.retreatUntil) { npc.experimentalAdaptiveResponse = null; return null; }
    npc.cmd.attack = false; npc.cmd.fwd = -0.7; npc.cmd.right = r.side * 0.3;
    npc.cmd.walk = false;
    return 'retreat';
  }
  return null;
}
