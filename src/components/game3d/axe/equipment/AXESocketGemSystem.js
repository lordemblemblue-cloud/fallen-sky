// AXE Prompt 022 — socket drilling, gems and gem management.
// Socket creation and gem operations are separate from Aura/Core/enchantment.

export const AXE_SOCKET_CONFIG = Object.freeze({
  defaultMaxSockets: 4,
  safeSocketCount: 1,
  baseDrillSuccessChance: 0.9,
  minimumDrillSuccessChance: 0.35,
});

const BASE_GEM_DEFINITIONS = Object.freeze({
  gem_ruby_i: Object.freeze({ id: 'gem_ruby_i', name: 'Ruby I', rarity: 'common', stat: 'attack', value: 3, allowedSlots: ['weapon','gloves','ring'] }),
  gem_sapphire_i: Object.freeze({ id: 'gem_sapphire_i', name: 'Sapphire I', rarity: 'common', stat: 'defense', value: 3, allowedSlots: ['helm','chest','legs','boots','cape'] }),
  gem_jade_i: Object.freeze({ id: 'gem_jade_i', name: 'Jade I', rarity: 'uncommon', stat: 'maxHP', value: 20, allowedSlots: ['helm','chest','necklace','cape','wings'] }),
  gem_spirit_i: Object.freeze({ id: 'gem_spirit_i', name: 'Spirit Gem I', rarity: 'uncommon', stat: 'spirit', value: 2, allowedSlots: ['weapon','necklace','wings'] }),
  gem_crit_i: Object.freeze({ id: 'gem_crit_i', name: 'Critical Gem I', rarity: 'rare', stat: 'critChance', value: 1.5, allowedSlots: ['weapon','ring'] }),
});

// Gem fusion tiers are intentionally independent of socket drilling.
// The existing Tier I IDs/stats remain authoritative for saved items.
const GEM_TIERS = ['i', 'ii', 'iii', 'iv', 'v'];
const GEM_ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const GEM_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const GEM_CHANCES = [0.8, 0.65, 0.5, 0.35];
const GEM_SILVER_COSTS = [250, 600, 1250, 2500];
const GEM_ICONS = Object.freeze({
  gem_ruby_i: '🔴', gem_sapphire_i: '🔵', gem_jade_i: '🟢',
  gem_spirit_i: '🟣', gem_crit_i: '💎',
});
const enhancedGems = Object.values(BASE_GEM_DEFINITIONS).flatMap((base) => {
  const family = base.id.slice(0, -2);
  return GEM_TIERS.slice(1).map((tier, offset) => {
    const rank = offset + 2;
    return Object.freeze({
      ...base, id: family + '_' + tier,
      name: base.name.replace(/ I$/, ' ' + GEM_ROMAN[rank - 1]),
      rarity: GEM_RARITIES[rank - 1],
      tier: rank, value: Number((base.value * rank).toFixed(2)),
      icon: GEM_ICONS[base.id],
    });
  });
});
export const AXE_GEM_DEFINITIONS = Object.freeze({
  ...Object.fromEntries(Object.values(BASE_GEM_DEFINITIONS).map((gem) =>
    [gem.id, Object.freeze({ ...gem, tier: 1, icon: GEM_ICONS[gem.id] })])),
  ...Object.fromEntries(enhancedGems.map(gem => [gem.id, gem])),
});

export function getAXEGemUpgradePreview(gemId) {
  const gem = AXE_GEM_DEFINITIONS[gemId];
  if (!gem) return { eligible: false, reason: 'GEM_MISSING' };
  const rank = GEM_TIERS.indexOf(gemId.split('_').at(-1));
  if (rank < 0 || rank === GEM_TIERS.length - 1) {
    return { eligible: false, reason: 'MAX_GEM_TIER', gem, maxTier: GEM_TIERS.length };
  }
  const nextId = gemId.slice(0, -(GEM_TIERS[rank].length)) + GEM_TIERS[rank + 1];
  return {
    eligible: true, gem, nextGem: AXE_GEM_DEFINITIONS[nextId],
    gemId, nextId, copies: 2,
    silver: GEM_SILVER_COSTS[rank],
    chance: GEM_CHANCES[rank],
    // Failed fusion spends Silver and one donor; it preserves one original gem.
    failureConsumes: 1,
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function drillSuccessChance(openSockets = 0, maxSockets = AXE_SOCKET_CONFIG.defaultMaxSockets) {
  const t = clamp01((Number(openSockets) || 0) / Math.max(1, Number(maxSockets) || 1));
  return Math.max(
    AXE_SOCKET_CONFIG.minimumDrillSuccessChance,
    AXE_SOCKET_CONFIG.baseDrillSuccessChance - t * 0.5,
  );
}

export function normalizeSocketState(item = {}) {
  const maxSockets = Math.max(0, Number(item.maxSockets ?? item.max_sockets ?? AXE_SOCKET_CONFIG.defaultMaxSockets));
  const sockets = Array.isArray(item.sockets) ? item.sockets.map((s, index) => ({
    index,
    open: s?.open !== false,
    gemId: s?.gemId || s?.gem_id || null,
  })) : [];

  return { maxSockets, sockets };
}

export function resolveDrill(item = {}, {
  roll = Math.random(),
  protectedAttempt = false,
  guaranteed = false,
} = {}) {
  const state = normalizeSocketState(item);
  if (state.sockets.length >= state.maxSockets) {
    return { ok: false, reason: 'MAX_SOCKETS', sockets: state.sockets };
  }

  const chance = guaranteed ? 1 : drillSuccessChance(state.sockets.length, state.maxSockets);
  if (roll > chance) {
    return {
      ok: false,
      outcome: protectedAttempt ? 'protected' : 'failure',
      chance,
      sockets: state.sockets,
    };
  }

  const next = [...state.sockets, { index: state.sockets.length, open: true, gemId: null }];
  return { ok: true, outcome: 'success', chance, sockets: next };
}

export function canInsertAXEGem(item, socketIndex, gemId) {
  const gem = AXE_GEM_DEFINITIONS[gemId];
  if (!gem) return { ok: false, reason: 'GEM_MISSING' };

  const state = normalizeSocketState(item);
  const socket = state.sockets[socketIndex];
  if (!socket) return { ok: false, reason: 'SOCKET_MISSING' };
  if (!socket.open) return { ok: false, reason: 'SOCKET_LOCKED' };
  if (socket.gemId) return { ok: false, reason: 'SOCKET_OCCUPIED' };

  const slot = item.slot || item.category;
  if (gem.allowedSlots?.length && !gem.allowedSlots.includes(slot)) {
    return { ok: false, reason: 'GEM_SLOT_RESTRICTED' };
  }

  return { ok: true, gem };
}

export function insertAXEGem(item, socketIndex, gemId) {
  const valid = canInsertAXEGem(item, socketIndex, gemId);
  if (!valid.ok) return valid;

  const state = normalizeSocketState(item);
  const sockets = state.sockets.map((socket, index) =>
    index === socketIndex ? { ...socket, gemId } : socket
  );
  return { ok: true, sockets, gem: valid.gem };
}

export function removeAXEGem(item, socketIndex, { preserveGem = true } = {}) {
  const state = normalizeSocketState(item);
  const socket = state.sockets[socketIndex];
  if (!socket) return { ok: false, reason: 'SOCKET_MISSING' };
  if (!socket.gemId) return { ok: false, reason: 'SOCKET_EMPTY' };

  const removedGemId = socket.gemId;
  const sockets = state.sockets.map((entry, index) =>
    index === socketIndex ? { ...entry, gemId: null } : entry
  );

  return {
    ok: true,
    sockets,
    removedGemId,
    gemPreserved: !!preserveGem,
  };
}

export function replaceAXEGem(item, socketIndex, gemId, { preserveOldGem = true } = {}) {
  const state = normalizeSocketState(item);
  const socket = state.sockets[socketIndex];
  if (!socket) return { ok: false, reason: 'SOCKET_MISSING' };

  const slot = item.slot || item.category;
  const gem = AXE_GEM_DEFINITIONS[gemId];
  if (!gem) return { ok: false, reason: 'GEM_MISSING' };
  if (gem.allowedSlots?.length && !gem.allowedSlots.includes(slot)) {
    return { ok: false, reason: 'GEM_SLOT_RESTRICTED' };
  }

  const oldGemId = socket.gemId || null;
  const sockets = state.sockets.map((entry, index) =>
    index === socketIndex ? { ...entry, gemId } : entry
  );

  return { ok: true, sockets, oldGemId, oldGemPreserved: !!preserveOldGem, gem };
}

export function collectAXEGemStats(item = {}) {
  const state = normalizeSocketState(item);
  const stats = {};
  for (const socket of state.sockets) {
    if (!socket.gemId) continue;
    const gem = AXE_GEM_DEFINITIONS[socket.gemId];
    if (!gem) continue;
    stats[gem.stat] = (stats[gem.stat] || 0) + Number(gem.value || 0);
    if (gem.secondaryStat && Number.isFinite(Number(gem.secondaryValue))) {
      stats[gem.secondaryStat] = (stats[gem.secondaryStat] || 0) + Number(gem.secondaryValue);
    }
  }
  return stats;
}
