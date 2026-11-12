/**
 * Read-only per-character progression preview for the Game 3D entry gateway.
 *
 * IMPORTANT: stores expose the currently ACTIVE character, whereas the roster
 * can preview any saved character without activating them. Never call
 * activateAndSyncToHUD just to read a row; doing that would mutate live state.
 * Read the same namespaced snapshots the stores persist, scoped to the owner.
 */
const KEYS = Object.freeze({
  player: 'wwm_player_progression_v1',
  halo: 'halo_progression_v3',
  aura: 'aura_progression_v1',
  wings: 'wings_progression_v1',
  titles: 'title_progression_v2',
  essence: 'axe_elixir_progression_v1',
  enchantments: 'wwm_enchantments_v1',
  reinforcement: 'axe_reinforcement_v1',
  overEnchant: 'axe_over_enchant_v1',
});
const safeLevel = (value, fallback = 0) =>
  value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
    ? fallback : Math.max(0, Math.floor(Number(value)));
const safeQuantity = (value, fallback = null) =>
  value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
    ? fallback : Math.max(0, Number(value));
const humanize = value => typeof value === 'string' && value.trim()
  ? value.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '—';
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const essences = Object.freeze(['vitality', 'strength', 'dexterity', 'spirit']);

export function readCharacterSelectionOverview(characterId, userNamespace, storage = globalThis.localStorage) {
  if (typeof characterId !== 'string' || !characterId ||
      typeof userNamespace !== 'string' || !userNamespace) return null;
  const read = base => {
    try {
      const raw = storage?.getItem?.(`${base}::${userNamespace}::${characterId}`);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  };
  const p = read(KEYS.player);
  const halo = read(KEYS.halo);
  const aura = read(KEYS.aura);
  const wings = read(KEYS.wings);
  const titles = read(KEYS.titles);
  const essence = read(KEYS.essence);
  const ench = read(KEYS.enchantments);
  const reinforce = read(KEYS.reinforcement);
  const over = read(KEYS.overEnchant);

  const base = asObject(p?.baseStats);
  const rawBase = {
    strength: safeQuantity(base.strength),
    dexterity: safeQuantity(base.dexterity ?? base.agility),
    constitution: safeQuantity(base.constitution ?? base.vitality),
    focus: safeQuantity(base.focus ?? base.spirit),
  };
  const titleId = typeof titles?.equippedPathId === 'string' ? titles.equippedPathId : '';
  const wingId = typeof wings?.equippedPathId === 'string' ? wings.equippedPathId : '';
  const wingPaths = asObject(wings?.paths);
  const titlePaths = asObject(titles?.paths);
  const wingLevel = wingId ? safeLevel(wingPaths[wingId]?.level) : null;
  const titleLevel = titleId ? safeLevel(titlePaths[titleId]?.level) : null;
  const power = asObject(p?.powerProgression);
  const allocations = asObject(essence?.allocations);
  const experiences = asObject(essence?.experience);
  const forgeEnchant = Object.values(asObject(ench));
  const forgeReinforce = Object.values(asObject(reinforce));
  const forgeOver = Object.values(asObject(over));
  const enchantLevels = forgeEnchant.flatMap(item => Array.isArray(item) ? item.map(v => safeLevel(v)) : []);
  const reinforced = forgeReinforce.map(item => safeQuantity(item?.percent)).filter(v => v !== null);
  const overLevels = forgeOver.map(item => safeLevel(item?.level)).filter(v => v >= 0);
  const forgeItemIds = new Set([
    ...Object.keys(asObject(ench)),
    ...Object.keys(asObject(reinforce)),
    ...Object.keys(asObject(over)),
  ]);

  return {
    hasPlayerSave: !!p,
    level: p ? Math.max(1, safeLevel(p.level, 1)) : null,
    xp: safeQuantity(p?.xp),
    xpForNext: safeQuantity(p?.xpForNext),
    unspentPoints: safeQuantity(p?.unspentPoints),
    hp: safeQuantity(p?.hp),
    baseStats: rawBase,
    power: {
      tier: humanize((power.tierId || 'AXE_Power_Normal').replace(/^AXE_Power_/, '')),
      tierLevel: safeLevel(power.tierLevel),
      master: safeLevel(power.masterLevel),
      adept: safeLevel(power.adeptLevel),
      god: safeLevel(power.godLevel),
      rebirth: safeLevel(power.rebirthCount),
      palace: safeLevel(power.palaceRank),
      ascension: safeLevel(power.ascensionLevel),
    },
    spiritual: {
      halo: safeLevel(halo?.level),
      aura: safeLevel(aura?.level),
      wingId, wingName: wingId ? humanize(wingId) : 'Not equipped',
      wingLevel, wingReinforcement: wingId ? safeQuantity(wingPaths[wingId]?.reinforcementPercent, 0) : null,
      titleId, titleName: titleId ? humanize(titleId) : 'Not equipped', titleLevel,
      titleContribution: safeQuantity(titles?.contributionPoints, 0),
      wingPaths: Object.entries(wingPaths).map(([id, data]) => ({
        id, label: humanize(id), level: safeLevel(data?.level),
        reinforcement: safeQuantity(data?.reinforcementPercent, 0),
      })),
      titlePaths: Object.entries(titlePaths).map(([id, data]) => ({
        id, label: humanize(id), level: safeLevel(data?.level),
      })),
      essence: essences.map(id => ({
        id, label: humanize(id), level: safeLevel(allocations[id]),
        xp: safeLevel(experiences[id]),
        nextCost: 100 + 25 * safeLevel(allocations[id]),
      })),
      essenceUsed: essences.reduce((total, id) => total + safeLevel(allocations[id]), 0),
      hasSpiritualSave: !!(halo || aura || wings || titles || essence),
    },
    forge: {
      itemCount: forgeItemIds.size,
      totalEnchant: enchantLevels.length ? enchantLevels.reduce((sum, v) => sum + v, 0) : 0,
      highestEnchant: enchantLevels.length ? Math.max(...enchantLevels) : 0,
      highestOverEnchant: overLevels.length ? Math.max(...overLevels) : 0,
      highestReinforcement: reinforced.length ? Math.max(...reinforced) : 0,
      hasSave: !!(ench || reinforce || over),
    },
    // Do not read unrelated users' saves or write to the selected character.
  };
}

export function formatCharacterOverviewValue(value, suffix = '') {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—' : `${Number(value).toLocaleString('en-US', {maximumFractionDigits: 2})}${suffix}`;
}
