// Part 18: limited, earned weapon-stability and cautious wound responses.
// No disarm is faked: a real holster/weapon-drop requires an authored hand rig.
// Preserve the original saber collision, lethal damage, Force and move timers.
export const WEAPON_SETBACK_MIN_HIT = 12;
export const WEAPON_SETBACK_MAX_WAIT = 2.8;
export const WEAPON_SETBACK_GUARD = 0.7;
export const WOUNDED_REPOSITION = 1.2;

const distance = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
const valid = n => Number.isFinite(n);
const protectedMode = g => !!(g?.experimentalCombatActive?.() &&
  valid(g.t) && !g.net && !g.online && !g.teamMode && !g.tutorialMode &&
  !g.director && !g.bossWay && !g.boardingMode && !g.attract &&
  !g.noDamage && !g.aiOff);

export function woundedDefenseEligible(g, npc) {
  return !!(protectedMode(g) && npc && !npc.isPlayer && !npc.remote &&
    npc.hasSaber && !npc.isRancorBoss && npc.hp > 0 &&
    npc.status !== 'dead' && npc.status !== 'executed' &&
    npc.saber && !npc.saber.holstered &&
    g.player?.isPlayer && !g.player.remote && g.player.hp > 0 &&
    g.foesOf?.(npc)?.includes(g.player));
}

export function queueWeaponSetback(g, npc, attacker, damage) {
  if (!woundedDefenseEligible(g, npc) || attacker !== g.player ||
      !valid(damage) || damage < WEAPON_SETBACK_MIN_HIT ||
      npc.experimentalWeaponSetback) return false;
  npc.experimentalWeaponSetback = {
    attacker, stage: 'await-weapon-ready',
    expireAt: g.t + WEAPON_SETBACK_MAX_WAIT,
    guardUntil: 0, side: (npc.humId || 1) % 2 ? 1 : -1,
  };
  return true;
}

export function cancelWoundedWeaponControl(npc) {
  if (!npc) return;
  npc.experimentalWeaponSetback = null;
}

// Respect authentic active saber attacks, preexisting stun, Force animations
// and critical replies. A new weapon guard is entered only when those resolve.
function committed(npc, now) {
  return !!(npc.saber?.isActiveSwing?.() ||
    (npc.saber?.weaponTime ?? 0) > 0 ||
    (npc.forceUntil ?? 0) > now || (npc.legsLockUntil ?? 0) > now ||
    npc.dodge || npc.kata || npc.kicking || npc.executing ||
    npc.critStrike || (npc.critAt ?? 0) > now ||
    (npc.critUntil ?? 0) > now ||
    npc.experimentalAdaptiveResponse || npc.experimentalExchangeChain ||
    npc.experimentalExchangeRiposte || npc.experimentalFlankRead ||
    npc.experimentalSurgeResponse || npc.experimentalComboResponse);
}

// Called at the end of the local NPC decision pass, immediately before
// Fighter.update. The existing Fighter decides stance, acceleration, colliders,
// floor validation and all attack frames.
export function tickWoundedDefense(g, npc, perception) {
  const setback = npc?.experimentalWeaponSetback;
  const wound = npc?.experimentalInjury;
  if (!woundedDefenseEligible(g, npc)) {
    if (setback) cancelWoundedWeaponControl(npc);
    return null;
  }
  const now = g.t;
  if (setback && (setback.attacker !== g.player || now > setback.expireAt ||
      !wound || wound.until <= now || wound.zone !== 'torso')) {
    cancelWoundedWeaponControl(npc);
  }
  const state = npc.experimentalWeaponSetback;
  if (state) {
    if (npc.status !== 'normal' || !npc.onGround) return null;
    if (state.stage === 'await-weapon-ready') {
      // A fresh guard-break/get-up owns this recovery; never replay an old
      // torso-wound guard after an unrelated interruption resolves.
      if (npc.experimentalRecovery && npc.experimentalRecovery.reason !== 'saber-wound') {
        cancelWoundedWeaponControl(npc);
        return null;
      }
      if (npc.experimentalRecovery || committed(npc, now)) return 'waiting';
      state.stage = 'guard';
      state.guardUntil = Math.min(now + WEAPON_SETBACK_GUARD, state.expireAt);
    }
    if (state.stage === 'guard') {
      // A genuine new parry-open or knockdown recovery takes priority; it
      // cannot be overwritten by an older grip-stability posture.
      if (npc.experimentalRecovery) {
        cancelWoundedWeaponControl(npc);
        return null;
      }
      if (now > state.guardUntil) {
        cancelWoundedWeaponControl(npc);
        return null;
      }
      if (committed(npc, now)) {
        // An actual saber/Force commitment wins; never override its frames.
        cancelWoundedWeaponControl(npc);
        return null;
      }
      npc.cmd.attack = false; npc.cmd.alt = false;
      npc.cmd.walk = true;
      if (['visible', 'lead'].includes(perception)) {
        const d = distance(npc, g.player);
        if (valid(d) && d < 4.5) {
          npc.cmd.fwd = d < 1.3 ? -0.45 : d > 2.5 ? 0.05 : -0.15;
          npc.cmd.right = state.side * 0.35;
        }
      }
      return 'weapon-guard';
    }
  }
  // A recent lower-body wound earns a brief cautious stance, not a five-
  // second forced stun. Squad supporters continue coordinated footwork.
  if (!wound || wound.zone !== 'leg' || wound.until <= now ||
      now > wound.since + WOUNDED_REPOSITION || npc.status !== 'normal' ||
      !npc.onGround || npc.experimentalRecovery || committed(npc, now) ||
      !['visible', 'lead'].includes(perception)) return null;
  const d = distance(npc, g.player);
  if (!valid(d) || d > 4.5 || d < 0.2) return null;
  npc.cmd.attack = false; npc.cmd.alt = false;
  npc.cmd.walk = true;
  npc.cmd.fwd = d < 1.5 ? -0.4 : d > 2.7 ? 0.1 : -0.08;
  npc.cmd.right = ((npc.humId || 1) % 2 ? 1 : -1) * 0.35;
  return 'wound-caution';
}
