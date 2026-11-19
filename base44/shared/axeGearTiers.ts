// Gear tiers, levels 1–155 (owner plan, 2026-11-19; docs/game3d/GEAR_TIERS_20261119.md).
//
// Every rarity has a LADDER of item levels ("steps") and LOOK BANDS. Inside a band every step of
// a rarity and item type shares one look (one mesh and one icon); steps differ only in level and
// stats, so far fewer models are needed. Drops follow the monster's level, rounded down to the
// rarity's step; the Blacksmith tier-up moves an item to its next step (45 -> 55), changing the
// look only when the step crosses into the next band.
//
// THE DEFAULTS BELOW ARE FOR THE OWNER TO REVIEW (the doc lists the open questions). The game
// switches its drops over only when the gear-tier setting is on (AXEGearTierFlag.mjs).
// Shared by the game (drops, Blacksmith) and the server (itemUpgrade tier-up). Pure data.

type Rec = Record<string, any>;

export const AXE_GEAR_TIER_VERSION = 'gear-tiers-v1';

// Every equipment type that drops as combat gear: the four weapon families and the eight armor and
// jewelry slots. Base stats are the item at level 1, quality 0 and Common rarity, taken from the
// game's existing items: the starter weapons (inventoryData.jsx; bows from the weapon pack), the
// armor pack's slot stats (AXE_ARMOR_SLOT_BASE_STATS) and the starter ring and necklace.
// Wings, costume, vanity, trinket and auxiliary slots keep their own systems.
export const AXE_GEAR_ITEM_TYPES = Object.freeze([
  { id: 'sword', slot: 'weapon', family: 'sword', label: 'Sword', baseStats: { attack: 6 } },
  { id: 'dual_blades', slot: 'weapon', family: 'dual_blades', label: 'Daggers', baseStats: { attack: 6 } },
  { id: 'bow', slot: 'weapon', family: 'bow', label: 'Bow', baseStats: { attack: 5 } },
  { id: 'sky', slot: 'weapon', family: 'sky', label: 'Fan', baseStats: { attack: 6, spirit: 2 } },
  { id: 'helm', slot: 'helm', family: null, label: 'Helm', baseStats: { defense: 2, maxHP: 10 } },
  { id: 'chest', slot: 'chest', family: null, label: 'Chest Armor', baseStats: { defense: 4, maxHP: 24 } },
  { id: 'gloves', slot: 'gloves', family: null, label: 'Gloves', baseStats: { attack: 2, defense: 1 } },
  { id: 'legs', slot: 'legs', family: null, label: 'Leg Armor', baseStats: { defense: 3, maxHP: 14 } },
  { id: 'boots', slot: 'boots', family: null, label: 'Boots', baseStats: { evasion: 2, maxHP: 8 } },
  { id: 'cape', slot: 'cape', family: null, label: 'Cape', baseStats: { defense: 1, maxHP: 8 } },
  { id: 'ring', slot: 'ring', family: null, label: 'Ring', baseStats: { critChance: 0.5 } },
  { id: 'necklace', slot: 'necklace', family: null, label: 'Necklace', baseStats: { spirit: 1, maxChi: 5, maxHP: 6 } },
].map((type) => Object.freeze({ ...type, baseStats: Object.freeze(type.baseStats) })));

const band = (min: number, max: number, label: string) => Object.freeze({ min, max, label });
const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

// The ladders. 'uncommon' is the engine's id for the player-facing "Unique".
export const AXE_GEAR_LADDERS = Object.freeze({
  // a new drop every 5 levels (the owner allowed 3 or 5), randomized stats, two looks
  common: Object.freeze({ steps: Object.freeze([1, ...range(5, 55, 5)]), bands: Object.freeze([band(1, 30, 'I'), band(31, 55, 'II')]) }),
  uncommon: Object.freeze({ steps: Object.freeze([1, ...range(5, 55, 5)]), bands: Object.freeze([band(1, 30, 'I'), band(31, 55, 'II')]) }),
  // every 10 levels from 45; the top bands hold one step each (125, 135, 145, 155)
  rare: Object.freeze({ steps: Object.freeze(range(45, 155, 10)), bands: Object.freeze([
    band(45, 84, 'I'), band(85, 119, 'II'), band(120, 130, 'III'), band(131, 140, 'IV'), band(141, 150, 'V'), band(151, 155, 'VI')]) }),
  elite: Object.freeze({ steps: Object.freeze(range(85, 155, 10)), bands: Object.freeze([
    band(85, 119, 'I'), band(120, 130, 'II'), band(131, 140, 'III'), band(141, 150, 'IV'), band(151, 155, 'V')]) }),
  // only from level-155 monsters
  legendary: Object.freeze({ steps: Object.freeze([155]), bands: Object.freeze([band(151, 155, 'I')]) }),
} as Record<string, { steps: readonly number[]; bands: readonly { min: number; max: number; label: string }[] }>);

export const AXE_GEAR_TIER_CONFIG = Object.freeze({
  // OFF until the owner has seen the numbers: the game keeps today's drops (AXEGearTierFlag.mjs)
  enabled: false,
  // the existing loot curves (AXEEquipmentLootSystem.js / AXELevelGearProgression.mjs)
  levelScalePerLevel: 0.06,
  rarityScale: Object.freeze({ common: 1, uncommon: 1.08, rare: 1.18, elite: 1.32, legendary: 1.52 } as Record<string, number>),
  // the level a hero needs to equip a step; Legendary (step 155) opens at 150
  requiredLevelByRarity: Object.freeze({ legendary: 150 } as Record<string, number>),
  // Blacksmith tier-up (owner question 2; defaults): Upgrade Stones = base + perStep × the item's
  // step index on its ladder, always succeeds, Combine / Enchant / Ascension carry over
  tierUp: Object.freeze({
    material: 'evo_upgrade_stone', base: 1, perStep: 1,
    successChance: 1,
    // the hero must be able to equip the next step
    requireHeroLevel: true,
  }),
  // gear rarity weights by monster level (owner plan: Common/Unique 1–55, Rare from 45, Elite
  // from 85, Legendary only at 155). Elite mobs and bosses shift these like today.
  dropWeights: Object.freeze([
    Object.freeze({ min: 1, max: 10, weights: Object.freeze({ common: 100 }) }),
    Object.freeze({ min: 11, max: 20, weights: Object.freeze({ common: 80, uncommon: 20 }) }),
    Object.freeze({ min: 21, max: 30, weights: Object.freeze({ common: 60, uncommon: 40 }) }),
    Object.freeze({ min: 31, max: 44, weights: Object.freeze({ common: 48, uncommon: 52 }) }),
    Object.freeze({ min: 45, max: 55, weights: Object.freeze({ common: 25, uncommon: 45, rare: 30 }) }),
    Object.freeze({ min: 56, max: 84, weights: Object.freeze({ rare: 100 }) }),
    Object.freeze({ min: 85, max: 114, weights: Object.freeze({ rare: 76, elite: 24 }) }),
    Object.freeze({ min: 115, max: 134, weights: Object.freeze({ rare: 50, elite: 50 }) }),
    Object.freeze({ min: 135, max: 154, weights: Object.freeze({ rare: 30, elite: 70 }) }),
    Object.freeze({ min: 155, max: Infinity, weights: Object.freeze({ rare: 15, elite: 60, legendary: 25 }) }),
  ]),
});

export const AXE_GEAR_RARITIES = Object.freeze(Object.keys(AXE_GEAR_LADDERS));
const RARITY_LABEL: Record<string, string> = { common: 'Common', uncommon: 'Unique', rare: 'Rare', elite: 'Elite', legendary: 'Legendary' };
export const axeGearRarityLabel = (rarity: string) => RARITY_LABEL[rarity] || rarity;
const RATE_STATS = new Set(['critChance', 'criticalChance', 'critDamage', 'criticalDamage', 'critDefense', 'criticalDefense',
  'attackPct', 'damagePct', 'defensePct', 'hpPct', 'maxHPPct', 'chiPct', 'maxChiPct']);

const rarityOf = (item: Rec | null | undefined) => String(item?.rarity || '').trim().toLowerCase();
const levelOf = (item: Rec | null | undefined) => { const n = Number(item?.itemLevel ?? item?.level ?? 1); return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1; };
// stats with their keys in one order, so records compare equal however a save stored them
export const sortedAXEStats = (stats: Rec | null | undefined): Record<string, number> =>
  Object.fromEntries(Object.entries(stats || {}).filter(([, v]) => Number.isFinite(Number(v))).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, Number(v)]));

export function getAXEGearItemType(typeId: string) {
  return AXE_GEAR_ITEM_TYPES.find((type) => type.id === typeId) || null;
}

// An owned item's type: its weapon family, or its armor / jewelry slot.
export function getAXEGearItemTypeFor(item: Rec | null | undefined) {
  const slot = String(item?.slot || item?.category || '').trim().toLowerCase();
  if (slot === 'weapon') {
    const family = String(item?.masteryWeaponId || item?.weaponFamily || '').trim().toLowerCase();
    return AXE_GEAR_ITEM_TYPES.find((type) => type.slot === 'weapon' && type.family === family) || null;
  }
  return AXE_GEAR_ITEM_TYPES.find((type) => type.slot === slot) || null;
}

export const getAXEGearLadder = (rarity: string) => AXE_GEAR_LADDERS[String(rarity || '').toLowerCase()] || null;

// The step at or below a level on a rarity's ladder (null below the first step).
export function getAXEGearStep(rarity: string, level: unknown): number | null {
  const ladder = getAXEGearLadder(rarity);
  const lvl = Math.floor(Number(level));
  if (!ladder || !Number.isFinite(lvl)) return null;
  const steps = ladder.steps.filter((step) => step <= lvl);
  return steps.length ? steps[steps.length - 1] : null;
}

// The look band holding a step.
export function getAXEGearBand(rarity: string, level: unknown) {
  const ladder = getAXEGearLadder(rarity);
  const lvl = Math.floor(Number(level));
  if (!ladder || !Number.isFinite(lvl)) return null;
  return ladder.bands.find((b) => lvl >= b.min && lvl <= b.max) || null;
}

export const axeGearBandId = (rarity: string, b: { min: number; max: number }) => `${rarity}_${b.min}_${b.max}`;
export const axeGearLookId = (rarity: string, b: { min: number; max: number }, typeId: string) => `${axeGearBandId(rarity, b)}_${typeId}`;
export const axeGearTemplateId = (rarity: string, typeId: string, step: number) => `gear_${rarity}_${typeId}_lv${step}`;
// Placeholder asset keys: the art pipeline adds a real model / icon for a look under these keys
// (AXE_GEAR_LOOK_ASSETS in the game), and every step of that look shows it, with no other change.
export const axeGearModelKey = (lookId: string) => `gear/${lookId}/model.glb`;
export const axeGearIconKey = (lookId: string) => `gear/${lookId}/icon.png`;

export const axeGearLevelScale = (level: unknown) =>
  1 + Math.max(0, Math.floor(Number(level) || 1) - 1) * AXE_GEAR_TIER_CONFIG.levelScalePerLevel;

// An item type's base stats at a step, for a rarity and quality band (the same rules as the
// existing loot: flat stats scale with rarity, level and quality; rate stats with rarity only).
export function computeAXEGearBaseStats(typeId: string, rarity: string, level: unknown, qualityBand: unknown = 0): Record<string, number> {
  const type = getAXEGearItemType(typeId);
  if (!type) return {};
  const rarityScale = AXE_GEAR_TIER_CONFIG.rarityScale[rarity] || 1;
  const scale = rarityScale * axeGearLevelScale(level) * (1 + Math.max(0, Number(qualityBand) || 0) / 100);
  return sortedAXEStats(Object.fromEntries(Object.entries(type.baseStats).map(([key, value]) => {
    const v = Number(value) * (RATE_STATS.has(key) ? rarityScale : scale);
    return [key, Number(v.toFixed(Math.abs(Number(value)) < 2 ? 2 : 0))];
  })));
}

export function axeGearRequiredLevel(rarity: string, step: number): number {
  const fixed = AXE_GEAR_TIER_CONFIG.requiredLevelByRarity[rarity];
  return Number.isFinite(fixed) ? Math.min(step, fixed) : step;
}

// One item template: a rarity, an item type and a step, with its look and placeholder assets.
export function makeAXEGearTemplate(rarity: string, typeId: string, step: number) {
  const type = getAXEGearItemType(typeId);
  const ladder = getAXEGearLadder(rarity);
  if (!type || !ladder || !ladder.steps.includes(step)) return null;
  const b = getAXEGearBand(rarity, step)!;
  const lookId = axeGearLookId(rarity, b, typeId);
  return Object.freeze({
    id: axeGearTemplateId(rarity, typeId, step),
    templateId: axeGearTemplateId(rarity, typeId, step),
    name: `${axeGearRarityLabel(rarity)} ${type.label} ${b.label}`,
    rarity, slot: type.slot, category: type.slot === 'ring' || type.slot === 'necklace' ? 'accessory' : type.slot,
    masteryWeaponId: type.family, weaponFamily: type.family, typeId,
    itemLevel: step, level: step, requiredLevel: axeGearRequiredLevel(rarity, step),
    baseStats: Object.freeze(computeAXEGearBaseStats(typeId, rarity, step)),
    gearTier: Object.freeze({ version: AXE_GEAR_TIER_VERSION, system: true, rarity, typeId, step,
      bandId: axeGearBandId(rarity, b), bandMin: b.min, bandMax: b.max, lookId }),
    lookId, modelKey: axeGearModelKey(lookId), iconKey: axeGearIconKey(lookId), placeholderArt: true,
  });
}

// Every template the plan defines (rarity × item type × step).
export function listAXEGearTemplates() {
  const out = [];
  for (const rarity of AXE_GEAR_RARITIES) {
    for (const type of AXE_GEAR_ITEM_TYPES) {
      for (const step of getAXEGearLadder(rarity)!.steps) out.push(makeAXEGearTemplate(rarity, type.id, step)!);
    }
  }
  return out;
}

// Every look (rarity × band × item type): what the art pipeline has to make.
export function listAXEGearLooks() {
  const out = [];
  for (const rarity of AXE_GEAR_RARITIES) {
    const ladder = getAXEGearLadder(rarity)!;
    for (const b of ladder.bands) {
      const steps = ladder.steps.filter((step) => step >= b.min && step <= b.max);
      for (const type of AXE_GEAR_ITEM_TYPES) {
        const lookId = axeGearLookId(rarity, b, type.id);
        out.push(Object.freeze({ lookId, rarity, typeId: type.id, slot: type.slot, family: type.family, bandId: axeGearBandId(rarity, b),
          min: b.min, max: b.max, steps, modelKey: axeGearModelKey(lookId), iconKey: axeGearIconKey(lookId) }));
      }
    }
  }
  return out;
}

// ---- drops ----

// The rarity weights at a monster level (null-free: only rarities available there).
export function getAXEGearRarityWeights(monsterLevel: unknown, { enemyTier = 'normal', isBoss = false }: { enemyTier?: string; isBoss?: boolean } = {}) {
  const lvl = Math.max(1, Math.floor(Number(monsterLevel) || 1));
  const row = AXE_GEAR_TIER_CONFIG.dropWeights.find((r) => lvl >= r.min && lvl <= r.max) || AXE_GEAR_TIER_CONFIG.dropWeights[0];
  const threat = isBoss || ['boss', 'worldBoss', 'gateBoss', 'caveBoss', 'miniBoss'].includes(enemyTier) ? 1.6
    : ['elite', 'champion'].includes(enemyTier) ? 1.22 : 1;
  const ranks = ['common', 'uncommon', 'rare', 'elite', 'legendary'];
  const out: Record<string, number> = {};
  for (const [rarity, weight] of Object.entries(row.weights)) {
    if (getAXEGearStep(rarity, lvl) == null) continue; // never a rarity before its first step
    out[rarity] = weight * Math.pow(threat, ranks.indexOf(rarity));
  }
  return out;
}

// The item level a monster of this level drops for a rarity: its step at or below the monster's
// level (a level-45 cave drops Lv 45 Rares; the next step is 55). null when the rarity can't drop.
export function getAXEGearDropLevel(rarity: string, monsterLevel: unknown): number | null {
  return getAXEGearStep(rarity, monsterLevel);
}

// ---- owned items: which step they are on, and the tier-up ----

// Where an owned item sits on the ladders (older items keep their own level and stats; their step
// is the one at or below their level). null for items outside the tier system.
export function getAXEGearTierInfo(item: Rec | null | undefined) {
  const rarity = rarityOf(item);
  const ladder = getAXEGearLadder(rarity);
  const type = getAXEGearItemTypeFor(item);
  if (!ladder || !type) return null;
  const level = levelOf(item);
  const step = getAXEGearStep(rarity, level);
  const index = step == null ? -1 : ladder.steps.indexOf(step);
  const nextStep = index + 1 < ladder.steps.length ? ladder.steps[index + 1] : null;
  const b = step == null ? null : getAXEGearBand(rarity, step);
  const nextBand = nextStep == null ? null : getAXEGearBand(rarity, nextStep);
  return {
    rarity, typeId: type.id, level, step, stepIndex: index, offLadder: step == null || step !== level,
    nextStep, atMax: nextStep == null,
    bandId: b ? axeGearBandId(rarity, b) : null, lookId: b ? axeGearLookId(rarity, b, type.id) : null,
    nextBandId: nextBand ? axeGearBandId(rarity, nextBand) : null,
    lookChanges: !!(nextBand && (!b || axeGearBandId(rarity, nextBand) !== axeGearBandId(rarity, b))),
    system: item?.gearTier?.system === true || String(item?.templateId || '').startsWith('gear_'),
  };
}

// What one tier-up costs at the item's current step.
export function getAXEGearTierUpCost(item: Rec | null | undefined): Record<string, number> {
  const info = getAXEGearTierInfo(item);
  if (!info || info.atMax) return {};
  const config = AXE_GEAR_TIER_CONFIG.tierUp;
  return { [config.material]: config.base + config.perStep * Math.max(0, info.stepIndex) };
}

const RATE_CURVE = (level: number) => 0.18 + level * 0.0025; // AXELevelGearProgression rolls rate affixes on this
const round = (value: number, original: number) => (Math.abs(original) < 2 ? Number(value.toFixed(2)) : Math.max(1, Math.round(value)));

// The item's record after one tier-up (its new level, stats and look); `heroLevel` checks the hero
// can equip the next step. Rolled stats keep their roll and grow with the level like the loot
// rolls them; base stats become the next step's, at the item's own quality band.
export function previewAXEGearTierUp(item: Rec | null | undefined, { heroLevel = null }: { heroLevel?: number | null } = {}) {
  if (!item) return { ok: false, reason: 'ITEM_MISSING' };
  const info = getAXEGearTierInfo(item);
  if (!info) return { ok: false, reason: 'NOT_TIERED_GEAR' };
  if (info.atMax) return { ok: false, reason: 'MAX_TIER', info };
  const next = info.nextStep!;
  const rarity = info.rarity;
  const requiredLevel = axeGearRequiredLevel(rarity, next);
  if (AXE_GEAR_TIER_CONFIG.tierUp.requireHeroLevel && heroLevel != null && Number(heroLevel) < requiredLevel) {
    return { ok: false, reason: 'HERO_LEVEL_TOO_LOW', requiredLevel, info };
  }
  const flatRatio = axeGearLevelScale(next) / axeGearLevelScale(info.level);
  const rateRatio = RATE_CURVE(next) / RATE_CURVE(info.level);
  const rolledStats = sortedAXEStats(Object.fromEntries(Object.entries(item.rolledStats || {})
    .filter(([, v]) => Number.isFinite(Number(v)))
    .map(([key, v]) => [key, RATE_STATS.has(key) ? Number(Math.min(1.5, Number(v) * rateRatio).toFixed(2)) : round(Number(v) * flatRatio, Number(v))])));
  const template = makeAXEGearTemplate(rarity, info.typeId, next)!;
  const record = {
    level: next, requiredLevel, typeId: info.typeId,
    baseStats: computeAXEGearBaseStats(info.typeId, rarity, next, item.qualityBand),
    rolledStats,
    // tier-system items take the step's template and look; other items (armor and weapon pack
    // pieces with real models) keep their own model, name and template
    ...(info.system ? { templateId: template.templateId, name: template.name, lookId: template.lookId } : {}),
  };
  return { ok: true, info, from: info.level, to: next, lookChanges: info.lookChanges && info.system, cost: getAXEGearTierUpCost(item),
    chance: AXE_GEAR_TIER_CONFIG.tierUp.successChance, record };
}

// The item's tier fields as a record (what the server's ledger keeps for a tier-up).
export function readAXEGearTierRecord(item: Rec | null | undefined): Rec | null {
  if (!item) return null;
  const info = getAXEGearTierInfo(item);
  return {
    level: levelOf(item),
    requiredLevel: Number(item.requiredLevel ?? levelOf(item)),
    typeId: info?.typeId ?? null,
    baseStats: sortedAXEStats(item.baseStats),
    rolledStats: sortedAXEStats(item.rolledStats),
    ...(info?.system ? { templateId: item.templateId ?? null, name: item.name ?? null, lookId: item.gearTier?.lookId ?? item.lookId ?? null } : {}),
  };
}

// An owned item with a tier record applied (the game's inventory and the Character Vault).
export function applyAXEGearTierRecord(item: Rec, record: Rec): Rec {
  if (!item || !record) return item;
  const rarity = rarityOf(item);
  const step = Number(record.level);
  if (!Number.isFinite(step) || step < 1) return item;
  const b = getAXEGearBand(rarity, step);
  const lookId = record.lookId ?? item.gearTier?.lookId ?? item.lookId ?? null;
  return {
    ...item,
    itemLevel: step, level: step, requiredLevel: Number(record.requiredLevel ?? step),
    baseStats: { ...(record.baseStats || {}) }, rolledStats: { ...(record.rolledStats || {}) },
    ...(record.templateId ? { templateId: record.templateId } : {}),
    ...(record.name ? { name: record.name } : {}),
    ...(lookId ? { lookId, modelKey: axeGearModelKey(lookId), iconKey: axeGearIconKey(lookId) } : {}),
    gearTier: { ...(item.gearTier || {}), version: AXE_GEAR_TIER_VERSION, rarity, typeId: record.typeId ?? item.gearTier?.typeId ?? null,
      step, bandId: b ? axeGearBandId(rarity, b) : null, ...(lookId ? { lookId } : {}),
      system: item.gearTier?.system === true || String(record.templateId || item.templateId || '').startsWith('gear_') },
  };
}

// Save migration (non-destructive): older items keep their level, stats, model and name; they
// only gain the gearTier note of the step at or below their level, so the Blacksmith knows the
// next step. Running it twice changes nothing.
export function migrateAXEGearTierItem(item: Rec): Rec {
  if (!item || typeof item !== 'object') return item;
  const info = getAXEGearTierInfo(item);
  if (!info) return item;
  const note = { version: AXE_GEAR_TIER_VERSION, rarity: info.rarity, typeId: info.typeId, step: info.step,
    bandId: info.bandId, lookId: info.system ? info.lookId : (item.gearTier?.lookId ?? null), system: info.system, offLadder: info.offLadder };
  const current = item.gearTier || {};
  const same = Object.entries(note).every(([k, v]) => current[k] === v);
  return same ? item : { ...item, gearTier: { ...current, ...note } };
}
