// PvE Kill Flow: a short, earned, target-specific opportunity after a LOCAL lethal
// strike. Never trusted as PvP proof, damage authority, XP or a remote kill receipt.
export const AXE_KILL_FLOW = Object.freeze({
  baseChance: 0.40,
  criticalChance: 0.65,
  chosenChanceBonus: 0.15,
  windowMs: 1750,
  chosenWindowBonusMs: 450,
  maxTargetDistance: 7.5,
  chosenTargetDistanceBonus: 1.5,
  maxConsecutiveCounters: 5,
  antiDuplicateMs: 750,
});

const distance = (a, b) =>
  Math.hypot(Number(a?.x) - Number(b?.x), Number(a?.z) - Number(b?.z));

// Re-check the exact still-locked target when the skill is pressed AND when
// it fires. The visual pursuit/lock hint is not permission to empower an
// unrelated target after a manual switch or an expired opportunity.
export function isKillFlowCastEligible({
  opportunity, opportunityId, target, lockedTarget, origin, family,
  now, maxRange, pvp = false, playerAlive = false,
} = {}) {
  if (pvp || !playerAlive || !opportunity?.id ||
      opportunity.id !== opportunityId ||
      !Number.isFinite(now) || !Number.isFinite(opportunity.expiresAt) ||
      now > opportunity.expiresAt ||
      !['single', 'three_hit'].includes(family) ||
      !target?.id || target.id !== opportunity.targetId ||
      lockedTarget?.id !== target.id ||
      target.alive !== true || target.dying || target.defeated ||
      target.group?.visible === false || !target.group?.position ||
      target.metadata?.rewardAuthority?.includes?.('server_pending') ||
      !origin || !Number.isFinite(maxRange) || maxRange <= 0) return false;
  const range = distance(origin, target.group.position);
  return Number.isFinite(range) && range <= maxRange;
}

export function chooseKillFlowTarget({ killedId, targets = [], origin, maxRange } = {}) {
  if (!origin || !Number.isFinite(maxRange) || maxRange <= 0) return null;
  return targets.filter(target =>
    target?.id && target.id !== killedId && target.alive === true && !target.dying &&
    !target.defeated && target.group?.visible !== false && target.group?.position &&
    !target.metadata?.rewardAuthority?.includes?.('server_pending') &&
    Number.isFinite(distance(origin, target.group.position)) &&
    distance(origin, target.group.position) <= maxRange
  ).sort((a, b) => distance(origin, a.group.position) - distance(origin, b.group.position))[0] || null;
}

export function createKillFlowCounter() {
  let offer = null;
  let lastKillId = null;
  let lastOfferedAt = -Infinity;
  let consecutive = 0;
  let lastCounterAt = -Infinity;
  let sequence = 0;
  return {
    peek(now = Date.now()) {
      if (offer && now > offer.expiresAt) offer = null;
      return offer ? { ...offer } : null;
    },
    reset() {
      offer = null; lastKillId = null; lastOfferedAt = -Infinity;
      consecutive = 0; lastCounterAt = -Infinity;
    },
    grant({ killedId, critical = false, targets = [], origin, chosen = false,
      now = Date.now(), roll = Math.random(), pvp = false, validKill = false } = {}) {
      if (pvp || !validKill || !killedId || !Number.isFinite(now) ||
        !Number.isFinite(roll) || roll < 0 || roll >= 1) return null;
      if (killedId === lastKillId && now - lastOfferedAt < AXE_KILL_FLOW.antiDuplicateMs) return null;
      if (now - lastCounterAt > 5000) consecutive = 0;
      // A streak cannot become an indefinitely free damage/charge engine.
      if (consecutive >= AXE_KILL_FLOW.maxConsecutiveCounters) return null;
      const chance = Math.min(.85, (critical
        ? AXE_KILL_FLOW.criticalChance : AXE_KILL_FLOW.baseChance)
        + (chosen ? AXE_KILL_FLOW.chosenChanceBonus : 0));
      const target = chooseKillFlowTarget({ killedId, targets, origin,
        maxRange: AXE_KILL_FLOW.maxTargetDistance +
          (chosen ? AXE_KILL_FLOW.chosenTargetDistanceBonus : 0) });
      lastKillId = killedId;
      lastOfferedAt = now;
      if (!target || roll >= chance) { offer = null; return null; }
      const id = 'killflow_' + (++sequence);
      offer = { id, targetId: target.id, expiresAt: now + AXE_KILL_FLOW.windowMs +
        (chosen ? AXE_KILL_FLOW.chosenWindowBonusMs : 0), chosen, criticalKill: !!critical,
        chance, sourceId: killedId };
      return { ...offer };
    },
    consume({ opportunityId, targetId, family, now = Date.now(), inRange = false,
      targetAlive = false, pvp = false } = {}) {
      const current = this.peek(now);
      if (!current || pvp || !inRange || !targetAlive ||
        current.id !== opportunityId || current.targetId !== targetId ||
        !['single', 'three_hit'].includes(family)) return null;
      offer = null;
      consecutive++;
      lastCounterAt = now;
      return { ...current, family, consecutive };
    },
  };
}

// This qualification is obtained ONLY when the locally verified kill offer is
// consumed; no held key or max-level charge is required for the next PvE cast.
export function counterChargeQualification(family) {
  if (!['single', 'three_hit'].includes(family)) return null;
  return { charged: true, counterInstant: true, family, powerMultiplier: 1.20,
    critBonusPct: 0, fatalBonusPct: 0, specializationId: 'standard' };
}
