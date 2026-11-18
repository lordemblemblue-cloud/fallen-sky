// Part 17: evidence-backed nonlethal saber wounds in local Experimental duels.
// No dismemberment is inferred from a capsule hit, no armor/HP modification,
// and no injury is ever created by a block, touch, dodge or protected hit.
import { scheduleCombatRecovery } from './experimentalCombatRecovery.js';
import { queueWeaponSetback } from './experimentalWoundedDefense.js';

export const WOUND_MIN_DAMAGE = 8;
export const WOUND_REACT_COOLDOWN = 0.85;
export const WOUND_DURATION = 5;
export const WOUND_TORSO_RECOVERY = 0.55;
export const WOUND_LEG_HEIGHT = 0.84;
export const WOUND_SPEED_MIN = 0.66;
export const WOUND_SPEED_MAX = 0.82;

export function injuryEligible(g, attacker, target) {
  return !!(g?.experimentalCombatActive?.() && Number.isFinite(g.t) &&
    !g.net && !g.online && !g.teamMode && !g.tutorialMode &&
    !g.director && !g.bossWay && !g.boardingMode && !g.attract &&
    !g.noDamage && !g.aiOff && attacker?.isPlayer && !attacker.remote &&
    target && !target.isPlayer && !target.remote && target.hasSaber &&
    !target.isRancorBoss && target.hp > 0 &&
    target.status !== 'dead' && target.status !== 'executed' &&
    (target.spawnShield ?? 0) <= g.t &&
    g.foesOf?.(attacker)?.includes(target));
}

// The original capsule contact has no bone ID: distinguish lower from
// upper-body by real contact height without fabricating precise limb cuts.
export function saberImpactZone(target, point) {
  if (!target?.pos || !Array.isArray(point) ||
      point.length !== 3 || !point.every(Number.isFinite)) return null;
  const height = point[1] - target.pos[1];
  if (height < 0 || height > 2.65) return null;
  return height < WOUND_LEG_HEIGHT ? 'leg' : 'torso';
}

export function recordSaberWound(g, attacker, target, point, actualDamage) {
  if (!injuryEligible(g, attacker, target) ||
      !Number.isFinite(actualDamage) || actualDamage < WOUND_MIN_DAMAGE ||
      (target.experimentalInjuryReadyAt ?? 0) > g.t) return null;
  const zone = saberImpactZone(target, point);
  if (!zone) return null;
  const hpMax = Math.max(1, Number.isFinite(target.maxHp) ? target.maxHp : 100);
  const severity = Math.min(1, Math.max(0.15, actualDamage / hpMax * 2));
  // Repeated real wounds refresh but cannot stack movement debuffs or queue
  // extra counters and stuns every physics tick.
  const prior = target.experimentalInjury;
  target.experimentalInjury = {
    zone,
    severity: Math.max(severity, prior && prior.zone === zone &&
      prior.until > g.t ? prior.severity : 0),
    since: g.t, until: g.t + WOUND_DURATION,
  };
  target.experimentalInjuryReadyAt = g.t + WOUND_REACT_COOLDOWN;
  // Torso impact gives a single brief, vulnerable authored-pain recovery.
  // A guard-break or get-up recovery already underway owns the sequence.
  if (zone === 'torso' && !target.experimentalRecovery && target.status === 'normal')
    scheduleCombatRecovery(g, target, 'saber-wound');
  if (zone === 'torso') queueWeaponSetback(g, target, attacker, actualDamage);
  return zone;
}

export function activeSaberWound(npc, now = npc?.g?.t) {
  const w = npc?.experimentalInjury;
  return !!(w && Number.isFinite(now) && w.until > now &&
    npc?.g?.experimentalCombatActive?.() && !npc.g.net &&
    !npc.g.online && !npc.g.teamMode && !npc.g.tutorialMode &&
    !npc.g.director && !npc.g.bossWay && !npc.g.boardingMode &&
    !npc.g.attract && !npc.g.noDamage &&
    !npc.remote && !npc.isPlayer && npc.status !== 'dead') ? w : null;
}

export function injuryMovementScale(npc, now = npc?.g?.t) {
  const w = activeSaberWound(npc, now);
  if (!w || w.zone !== 'leg') return 1;
  return Math.max(WOUND_SPEED_MIN, Math.min(WOUND_SPEED_MAX,
    WOUND_SPEED_MAX - 0.16 * w.severity));
}

// Leg-wounded enemies can still defend and attack normally, but cannot
// sprint while grounded between authored attack/Force animations.
export function applyInjuredFootwork(g, npc) {
  const w = activeSaberWound(npc, g?.t);
  if (!w) {
    if (npc?.experimentalInjury && npc.experimentalInjury.until <= g?.t)
      npc.experimentalInjury = null;
    return false;
  }
  if (w.zone !== 'leg' || npc.status !== 'normal' ||
      !npc.onGround || npc.kata || npc.kicking || npc.dodge ||
      npc.executing || npc.critStrike ||
      npc.saber?.isActiveSwing?.() || npc.saber?.weaponTime > 0 ||
      (npc.forceUntil ?? 0) > g.t) return false;
  npc.cmd.walk = true;
  return true;
}
