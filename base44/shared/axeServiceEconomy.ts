// Central resource-cost contract for equipment Services. Costs are real inventory items
// from lootStore. Shared with the server: itemUpgrade pays server-rolled upgrades with these
// (docs/game3d/SERVER_UPGRADES.md).
//
// These numbers are provisional balance values. The backend contract is the
// important part: preview -> validate ownership -> consume -> mutate item state.

import { AXE_COMBINE_CONFIG, AXE_EQUIPMENT_ASCENSION_CONFIG, isAXELegacyStageRarity } from './axeItemAdvancement.ts';

export const AXE_SERVICE_COST_RULES = Object.freeze({
  // the older materials-only stage path, kept for the Chosen set (Blacksmith v2)
  stage: Object.freeze({
    base: Object.freeze({ evo_upgrade_stone: 1 }),
    growthEveryRank: 1,
  }),
  refine: Object.freeze({
    base: Object.freeze({ mat_reinforce: 1 }),
    growthEveryLevels: 3,
    protected: Object.freeze({ mat_protection: 1 }),
  }),
  ultimate: Object.freeze({
    base: Object.freeze({ mat_divine_essence: 1, mat_heroic_core: 1 }),
    growthEveryLevels: 2,
    protected: Object.freeze({ mat_protection: 1 }),
  }),
  sockets: Object.freeze({
    base: Object.freeze({ mat_crystal: 1 }),
    growthEverySockets: 1,
    protected: Object.freeze({ mat_protection: 1 }),
  }),
  equipment_aura: Object.freeze({
    base: Object.freeze({ mat_aura_shard: 1 }),
  }),
});

type Cost = Record<string, number>;

const scaleCost = (base: Cost = {}, scale = 1): Cost => Object.fromEntries(
  Object.entries(base).map(([id, value]) => [id, Math.max(1, Math.floor(Number(value || 0) * scale))]),
);

const mergeCost = (...costs: Array<Cost | null | undefined>): Cost => {
  const out: Cost = {};
  for (const cost of costs) {
    for (const [id, value] of Object.entries(cost || {})) {
      out[id] = (out[id] || 0) + Math.max(0, Number(value || 0));
    }
  }
  return out;
};

export function getAXEServiceInventoryCost(serviceId: string, {
  advancement = null,
  sockets = null,
  protectedAttempt = false,
}: { advancement?: Record<string, any> | null; sockets?: Record<string, any> | null; protectedAttempt?: boolean } = {}): Cost {
  if (serviceId === 'stage') {
    const rank = Math.max(0, Number(advancement?.stage?.rank || 0));
    return scaleCost(AXE_SERVICE_COST_RULES.stage.base, 1 + rank * AXE_SERVICE_COST_RULES.stage.growthEveryRank);
  }

  if (serviceId === 'refine') {
    const level = Math.max(0, Number(advancement?.refine?.level || 0));
    const scale = 1 + Math.floor(level / AXE_SERVICE_COST_RULES.refine.growthEveryLevels);
    return mergeCost(
      scaleCost(AXE_SERVICE_COST_RULES.refine.base, scale),
      protectedAttempt ? AXE_SERVICE_COST_RULES.refine.protected : null,
    );
  }

  if (serviceId === 'ultimate') {
    const level = Math.max(0, Number(advancement?.ultimate?.level || 0));
    const scale = 1 + Math.floor(level / AXE_SERVICE_COST_RULES.ultimate.growthEveryLevels);
    return mergeCost(
      scaleCost(AXE_SERVICE_COST_RULES.ultimate.base, scale),
      protectedAttempt ? AXE_SERVICE_COST_RULES.ultimate.protected : null,
    );
  }

  if (serviceId === 'sockets') {
    const open = Math.max(0, Number(sockets?.sockets?.length || 0));
    return mergeCost(
      scaleCost(AXE_SERVICE_COST_RULES.sockets.base, 1 + open * AXE_SERVICE_COST_RULES.sockets.growthEverySockets),
      protectedAttempt ? AXE_SERVICE_COST_RULES.sockets.protected : null,
    );
  }

  if (serviceId === 'equipment_aura') {
    return { ...AXE_SERVICE_COST_RULES.equipment_aura.base };
  }

  return {};
}

// Reinforcement and over-enchant: what the next attempt costs at the item's current record
// (enchantmentStore and itemUpgrade both use these).
export function getAXEReinforcementCost(percent: unknown = 0, { protectedAttempt = false }: { protectedAttempt?: boolean } = {}): Cost {
  return { mat_reinforce: 1 + Math.floor((Number(percent) || 0) / 20), ...(protectedAttempt ? { mat_protection: 1 } : {}) };
}

export function getAXEOverEnchantCost(level: unknown = 0, { protectedAttempt = false }: { protectedAttempt?: boolean } = {}): Cost {
  return { mat_over_enchant: 1 + Math.floor((Number(level) || 0) / 2), ...(protectedAttempt ? { mat_protection: 1 } : {}) };
}

// Combine (Blacksmith v2): the configured fee, charged on every attempt (free for now).
export function getAXECombineCost(): Cost {
  return mergeCost(AXE_COMBINE_CONFIG.fee);
}

// Ascension (Blacksmith v2): the fee on every attempt plus the catalyst on a success (on a
// failure too only when catalystOnFailure). `success` left out: the most an attempt can cost,
// which must be affordable before anything is rolled. Chosen keeps its older stage cost.
export function getAXEAscensionCost({ success, item = null, advancement = null }: {
  success?: boolean; item?: Record<string, any> | null; advancement?: Record<string, any> | null;
} = {}): Cost {
  if (item && isAXELegacyStageRarity(item)) return getAXEServiceInventoryCost('stage', { advancement });
  const config = AXE_EQUIPMENT_ASCENSION_CONFIG;
  const withCatalyst = success === undefined || success === true || config.catalystOnFailure;
  return mergeCost(config.fee, withCatalyst ? config.catalyst : null);
}
