// Combat Foundation 2.3. Deliberately tunable beta combat resource rules.
// Character stat-derived Chi is the capacity for Will, never the live balance.
export const COMBAT_RESOURCE_RULES = Object.freeze({
  maxStamina: 100,
  basicStamina: 6,
  dodgeStamina: 22,
  airWalkBoostStamina: 24,
  airWalkGlideStaminaPerSecond: 6.5,
  airWalkRunStaminaPerSecond: 12,
  airWalkFinisherStamina: 28,
  guardStamina: 12,
  skillStamina: 5,
  skillWillBase: 7,
  skillWillExtraHit: 2,
  buffWill: 9,
  regenDelay: 0.85,
  staminaRegenPerSecond: 18,
  willRegenCapacityPctPerSecond: 0.018,
});

const clamp = (value, max) => Math.min(max, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0));
const finitePositive = (n, fallback = 0) => Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : fallback;

export function getCombatResourceCaps(hud = {}) {
  const stats = hud.derived || {};
  // Game 3D's canonical derived stat is chi (not maxChi).
  const maxWill = Math.max(1, Math.round(finitePositive(stats.chi, 30)));
  const manaRegen = Math.max(0, Number(stats.manaRegen) || 0);
  return { maxWill, maxStamina: COMBAT_RESOURCE_RULES.maxStamina, manaRegen };
}

export function createCombatResourceLedger(hud = {}) {
  const caps = getCombatResourceCaps(hud);
  return { ...caps, will: caps.maxWill, stamina: caps.maxStamina,
    willDelay: 0, staminaDelay: 0 };
}

export function syncCombatResourceCaps(current, hud = {}) {
  const caps = getCombatResourceCaps(hud);
  if (current.maxWill === caps.maxWill && current.maxStamina === caps.maxStamina &&
      current.manaRegen === caps.manaRegen) return current;
  // Preserve current percentage through equipment / stat changes, not free refills.
  return { ...current, ...caps,
    will: clamp(current.will / Math.max(1, current.maxWill) * caps.maxWill, caps.maxWill),
    stamina: clamp(current.stamina / Math.max(1, current.maxStamina) * caps.maxStamina, caps.maxStamina) };
}

export function combatActionCost(action, skill = null) {
  const c = COMBAT_RESOURCE_RULES;
  if (action === 'basic') return { stamina: c.basicStamina, will: 0 };
  if (action === 'dodge') return { stamina: c.dodgeStamina, will: 0 };
  // Both actions use the same atomic character-scoped stamina ledger as dodge.
  // Time is bounded by the frame simulation cap; invalid/malicious values can
  // never turn a negative cost into stamina restoration.
  if (action === 'air_walk') return { stamina: c.airWalkBoostStamina, will: 0 };
  if (action === 'air_walk_finisher') return { stamina: c.airWalkFinisherStamina, will: 0 };
  if (action === 'air_walk_run') {
    const seconds=Number(skill?.seconds);
    const safe=Number.isFinite(seconds)?Math.max(0,Math.min(.08,seconds)):0;
    return {stamina:safe*c.airWalkRunStaminaPerSecond,will:0};
  }
  if (action === 'glide') {
    const seconds = Number(skill?.seconds);
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0,Math.min(.08,seconds)) : 0;
    return { stamina: safeSeconds*c.airWalkGlideStaminaPerSecond, will: 0 };
  }
  if (action === 'guard') return { stamina: c.guardStamina, will: 0 };
  if (action === 'skill') {
    if (skill?.skill_type === 'ACTIVE_BUFF') return { stamina: 0, will: c.buffWill };
    // Pay once for the ENTIRE cast, not for every delayed combo hit or echo.
    const hits = Math.max(1, Math.min(10, Math.floor(Number(skill?.hit_count) || 1)));
    return { stamina: c.skillStamina,
      will: c.skillWillBase + (hits - 1) * c.skillWillExtraHit };
  }
  return { stamina: 0, will: 0 };
}

export function trySpendCombatResource(current, action, skill = null) {
  const cost = combatActionCost(action, skill);
  if (current.stamina + 1e-8 < cost.stamina) {
    return { ok: false, reason: 'not_enough_stamina', cost, state: current };
  }
  if (current.will + 1e-8 < cost.will) {
    return { ok: false, reason: 'not_enough_will', cost, state: current };
  }
  return { ok: true, cost, state: {
    ...current,
    stamina: clamp(current.stamina - cost.stamina, current.maxStamina),
    will: clamp(current.will - cost.will, current.maxWill),
    staminaDelay: cost.stamina > 0 ? COMBAT_RESOURCE_RULES.regenDelay : current.staminaDelay,
    willDelay: cost.will > 0 ? COMBAT_RESOURCE_RULES.regenDelay : current.willDelay,
  } };
}

export function advanceCombatResourceLedger(current, delta, { alive = true } = {}) {
  const dt = Number(delta);
  if (!Number.isFinite(dt) || dt <= 0 || !alive) return current;
  const capped = Math.min(0.12, dt);
  const staminaDelay = Math.max(0, current.staminaDelay - capped);
  const willDelay = Math.max(0, current.willDelay - capped);
  // Regeneration only runs for the part of this tick after the delay expires.
  const staminaRegenTime = Math.max(0, capped - current.staminaDelay);
  const willRegenTime = Math.max(0, capped - current.willDelay);
  const stamina = clamp(current.stamina + staminaRegenTime * COMBAT_RESOURCE_RULES.staminaRegenPerSecond, current.maxStamina);
  const will = clamp(current.will + willRegenTime * (
    current.manaRegen + current.maxWill * COMBAT_RESOURCE_RULES.willRegenCapacityPctPerSecond
  ), current.maxWill);
  if (stamina === current.stamina && will === current.will &&
      staminaDelay === current.staminaDelay && willDelay === current.willDelay) return current;
  return { ...current, stamina, will, staminaDelay, willDelay };
}
