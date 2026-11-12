// Game 3D — weapon legacy forge. Independent of Combine Stage 1–12.
// Pure, deterministic policy shared by the Blacksmith preview and inventory mutation.
export const AXE_WEAPON_LEGACY_CONFIG = Object.freeze({
  requiredCombineStage: 12,
  requiredReinforcementPercent: 120,
  ordinaryDonors: 4,
  endgameSetDonors: 12,
  levelBandSize: 10,
  highestSupportedLevel: 200,
  damageBonusPctPerPreparation: 2,
  maxDamageBonusPct: 10,
  echoDamagePct: 12,
});

const rarityOf = item => String(item?.rarity || '').trim().toLowerCase();
const idOf = item => item?.instanceId || null;
const levelOf = item => Math.trunc(Number(item?.itemLevel ?? item?.level ?? 1));
const setOf = item => String(item?.setId || item?.set_id || item?.setBonusId || '').trim().toLowerCase();

export function getAXEWeaponLegacyMode(item) {
  if (!item || (item.slot || item.category) !== 'weapon') return null;
  const rarity = rarityOf(item);
  if (setOf(item) && ['elite', 'elite_set', 'chosen', 'ascendant'].includes(rarity)) return 'set_echo';
  if (['rare', 'elite'].includes(rarity)) return 'level_legacy';
  return null;
}

// A real weapon class, not the generic equipment slot. When old items have no
// class metadata, require their exact template rather than treating every
// unspecified weapon as the same type.
export function getAXEWeaponFamily(item) {
  const named = item?.masteryWeaponId || item?.weaponClass || item?.weaponType ||
    item?.weaponArchetype || item?.subtype;
  if (named) return String(named).trim().toLowerCase();
  const type = String(item?.type || '').trim().toLowerCase();
  if (type.startsWith('weapon') && type.replace(/^weapon\s*[-—:]?\s*/, '')) {
    return type.replace(/^weapon\s*[-—:]?\s*/, '');
  }
  return String(item?.templateId || item?.id || '').trim().toLowerCase();
}

export function nextAXEWeaponLegacyLevel(currentLevel) {
  const level = Math.trunc(Number(currentLevel));
  if (!Number.isSafeInteger(level) || level < 1 || level >= AXE_WEAPON_LEGACY_CONFIG.highestSupportedLevel) return null;
  const next = (Math.floor((level - 1) / AXE_WEAPON_LEGACY_CONFIG.levelBandSize) + 1) *
    AXE_WEAPON_LEGACY_CONFIG.levelBandSize + 1;
  return next <= AXE_WEAPON_LEGACY_CONFIG.highestSupportedLevel ? next : null;
}

export function canUseAXEWeaponLegacyDonor(target, donor) {
  const mode = getAXEWeaponLegacyMode(target);
  if (!mode || !donor || !idOf(target) || !idOf(donor) || idOf(target) === idOf(donor)) return false;
  if (donor.equipped || donor.locked || donor.favorited || donor.favorite ||
      donor.isFavorite || donor.vanityOnly) return false;
  if (mode === 'set_echo') {
    // Endgame recipes accept matching pieces from the exact same elite set.
    // Their equipment slots may differ, unlike four-weapon advancement.
    return !!setOf(target) && setOf(target) === setOf(donor) && rarityOf(target) === rarityOf(donor) &&
      !donor.legacyForge?.echoPct;
  }
  return (donor.slot || donor.category) === 'weapon' &&
    rarityOf(target) === rarityOf(donor) &&
    !!getAXEWeaponFamily(target) && getAXEWeaponFamily(target) === getAXEWeaponFamily(donor) &&
    !donor.legacyForge?.pendingLevel;
}

export function previewAXEWeaponLegacyForge({
  item, donors = [], combineCount = 0, reinforcementPercent = 0,
  operation = 'prepare', playerLevel = 1,
} = {}) {
  const mode = getAXEWeaponLegacyMode(item);
  if (!mode) return { ok: false, reason: 'WEAPON_RARITY_NOT_ELIGIBLE', mode };
  const legacy = item?.legacyForge || {};
  const level = levelOf(item);
  const nextLevel = nextAXEWeaponLegacyLevel(level);
  const required = mode === 'set_echo'
    ? AXE_WEAPON_LEGACY_CONFIG.endgameSetDonors
    : AXE_WEAPON_LEGACY_CONFIG.ordinaryDonors;
  const base = {
    mode, required, currentLevel: level, nextLevel,
    pendingLevel: Number(legacy.pendingLevel || 0) || null,
    damageBonusPct: Math.min(AXE_WEAPON_LEGACY_CONFIG.maxDamageBonusPct, Math.max(0, Number(legacy.damageBonusPct) || 0)),
    echoDamagePct: mode === 'set_echo' && legacy.echoSetId === setOf(item) && Number(legacy.echoPct) === AXE_WEAPON_LEGACY_CONFIG.echoDamagePct
      ? AXE_WEAPON_LEGACY_CONFIG.echoDamagePct : 0,
    combineCount: Number(combineCount), reinforcementPercent: Number(reinforcementPercent),
  };
  if (operation === 'claim') {
    if (mode !== 'level_legacy' || !base.pendingLevel) return { ...base, ok: false, reason: 'NO_PREPARED_LEVEL' };
    if (base.pendingLevel <= level || base.pendingLevel !== nextLevel) return { ...base, ok: false, reason: 'INVALID_PREPARED_LEVEL' };
    if (!Number.isFinite(Number(playerLevel)) || Number(playerLevel) < base.pendingLevel) {
      return { ...base, ok: false, reason: 'PLAYER_LEVEL_REQUIRED' };
    }
    return { ...base, ok: true, operation: 'claim', required: 0 };
  }
  if (operation !== 'prepare') return { ...base, ok: false, reason: 'INVALID_OPERATION' };
  if (base.combineCount !== AXE_WEAPON_LEGACY_CONFIG.requiredCombineStage) {
    return { ...base, ok: false, reason: 'COMBINE_STAGE_12_REQUIRED' };
  }
  if (!Number.isFinite(base.reinforcementPercent) ||
    base.reinforcementPercent < AXE_WEAPON_LEGACY_CONFIG.requiredReinforcementPercent) {
    return { ...base, ok: false, reason: 'REINFORCEMENT_120_REQUIRED' };
  }
  if (mode === 'level_legacy' && base.pendingLevel) return { ...base, ok: false, reason: 'LEVEL_UPGRADE_ALREADY_PREPARED' };
  if (mode === 'level_legacy' && !nextLevel) return { ...base, ok: false, reason: 'MAX_WEAPON_LEVEL' };
  if (mode === 'set_echo' && base.echoDamagePct) return { ...base, ok: false, reason: 'ECHO_ALREADY_UNLOCKED' };

  if (!Array.isArray(donors) || donors.length !== required ||
    new Set(donors.map(idOf)).size !== required ||
    !donors.every(donor => canUseAXEWeaponLegacyDonor(item, donor))) {
    return { ...base, ok: false, reason: 'MATCHING_DONORS_REQUIRED' };
  }
  return {
    ...base, ok: true, operation: 'prepare',
    projectedDamageBonusPct: mode === 'level_legacy'
      ? Math.min(AXE_WEAPON_LEGACY_CONFIG.maxDamageBonusPct,
        base.damageBonusPct + AXE_WEAPON_LEGACY_CONFIG.damageBonusPctPerPreparation)
      : base.damageBonusPct,
    projectedEchoDamagePct: mode === 'set_echo' ? AXE_WEAPON_LEGACY_CONFIG.echoDamagePct : 0,
  };
}

export function getAXEWeaponLegacyDamageMultiplier(item) {
  if (getAXEWeaponLegacyMode(item) !== 'level_legacy') return 1;
  const pct = Math.min(AXE_WEAPON_LEGACY_CONFIG.maxDamageBonusPct,
    Math.max(0, Number(item?.legacyForge?.damageBonusPct) || 0));
  return 1 + pct / 100;
}

export function getAXEWeaponLegacyEchoPct(item) {
  if (getAXEWeaponLegacyMode(item) !== 'set_echo') return 0;
  return item?.legacyForge?.echoSetId === setOf(item) &&
    Number(item?.legacyForge?.echoPct) === AXE_WEAPON_LEGACY_CONFIG.echoDamagePct
    ? AXE_WEAPON_LEGACY_CONFIG.echoDamagePct : 0;
}

// A *separate* follow-up hit. Never add this percentage to the player's
// sheet damage or trigger another echo from the echo hit itself.
export function getAXEWeaponLegacyEchoDamage(primaryFinalDamage, item) {
  const damage = Number(primaryFinalDamage);
  if (!Number.isFinite(damage) || damage <= 0) return 0;
  const pct = getAXEWeaponLegacyEchoPct(item);
  return pct ? Math.max(1, Math.round(damage * pct / 100)) : 0;
}
