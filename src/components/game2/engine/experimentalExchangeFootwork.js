// Part 12: grounded AI defensive footwork and a single earned riposte.
// This module never grants a hit, a block, collision immunity or a free swing.
import { staminaBroken, STAMINA_SWING_COST } from './experimentalStamina.js';

export const EXCHANGE_RIPOSTE_DELAY = 0.23;
export const EXCHANGE_RIPOSTE_WINDOW = 0.95;
export const EXCHANGE_RIPOSTE_STAMINA_FLOOR = STAMINA_SWING_COST + 14;
export const EXCHANGE_SAFE_SEPARATION = 1.35;
export const EXCHANGE_PREFERRED_DISTANCE = 2.3;
export const EXCHANGE_MAX_RIPOSTE_RANGE = 2.65;

export function chooseExchangeFootwork(npc, opponent, side = 1) {
  if (!npc?.pos || !opponent?.pos) return null;
  const dx = opponent.pos[0] - npc.pos[0];
  const dz = opponent.pos[2] - npc.pos[2];
  const dist = Math.hypot(dx, dz);
  if (!Number.isFinite(dist) || dist < 0.1 || dist > 4.8) return null;
  // The existing Fighter.update handles acceleration, feet/torso blending,
  // BSP wall collision and steps. We only propose cautious locomotion input.
  const lateral = side < 0 ? -1 : 1;
  if (dist < EXCHANGE_SAFE_SEPARATION)
    return { fwd: -0.65, right: 0.27 * lateral, walk: true, dist };
  if (dist <= EXCHANGE_PREFERRED_DISTANCE)
    return { fwd: -0.12, right: 0.48 * lateral, walk: true, dist };
  return { fwd: 0.16, right: 0.32 * lateral, walk: true, dist };
}

// A physical block earlier in the exchange does not grant live knowledge of
// the player's position. Match Part 13's chest-to-chest world visibility check,
// and fail closed if no world geometry query is available.
export function exchangeHasCurrentSight(g, npc, player) {
  if (!g || !npc || !player || g.player !== player ||
      typeof g.world?.lineOfSight !== 'function') return false;
  const eye = f => typeof f?.chest === 'function'
    ? f.chest() : [f.pos?.[0], (f.pos?.[1] ?? NaN) + 1.15, f.pos?.[2]];
  const from = eye(npc), to = eye(player);
  if (!from || !to || ![0, 1, 2].every(i =>
      Number.isFinite(from[i]) && Number.isFinite(to[i]))) return false;
  return !!g.world.lineOfSight(from, to);
}

export function canExchangeRiposte(g, npc, token) {
  const player = token?.target, now = g?.t;
  if (!g?.experimentalCombatActive?.() || !Number.isFinite(now) ||
      g.net || g.online || g.teamMode || g.tutorialMode || g.director ||
      g.bossWay || g.boardingMode || g.aiOff || g.attract || g.noDamage ||
      !npc || npc.remote || npc.isPlayer || npc.status !== 'normal' ||
      !npc.onGround || npc.dodge || npc.kata || npc.executing ||
      !npc.hasSaber || npc.saber?.holstered || npc.saber?.inFlight ||
      npc.saber?.isActiveSwing?.() || npc.saber?.weaponTime > 0 ||
      (npc.forceUntil ?? 0) > now || npc.critStrike ||
      (npc.critAt ?? 0) > now || (npc.critUntil ?? 0) > now ||
      // A recovery or authored leg lock cannot be bypassed by an old
      // parry-riposte token. Never grant a swing while still recovering.
      npc.experimentalRecovery || (npc.legsLockUntil ?? 0) > now ||
      npc.experimentalAdaptiveResponse || npc.experimentalFlankRead ||
      npc.experimentalSurgeResponse || npc.experimentalComboResponse ||
      !player || !player.isPlayer || player.remote ||
      player.status === 'dead' || player.hp <= 0 ||
      now < token.readyAt || now > token.until ||
      (npc.experimentalExchangeRecoveryUntil ?? 0) <= now ||
      !g.foesOf?.(npc)?.includes(player) ||
      !exchangeHasCurrentSight(g, npc, player) ||
      !npc.experimentalStamina ||
      staminaBroken(npc.experimentalStamina, now) ||
      npc.experimentalStamina.current < EXCHANGE_RIPOSTE_STAMINA_FLOOR) return false;
  const dx = player.pos[0] - npc.pos[0], dz = player.pos[2] - npc.pos[2];
  const dist = Math.hypot(dx, dz);
  if (dist < 0.4 || dist > EXCHANGE_MAX_RIPOSTE_RANGE) return false;
  const front = (Math.sin(npc.yaw) * dx + Math.cos(npc.yaw) * dz) / dist;
  return front >= 0.3; // no automatic counter to a player behind the NPC
}
