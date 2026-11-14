// AXE Prompt 021 — Set 2 / Set 3 / Set 4 / Set 5 equipment bonuses.
import { AXE_PROCEDURAL_SET_FAMILIES } from '../loot/AXELevelGearProgression.mjs';
import { AXE_ARMOR_PACK_SETS } from './AXEArmorPackCatalog.js';
import { AXE_CHOSEN_SET_ID, getAXEChosenSetStatus } from './AXEChosenSetRules.mjs';
// Set identity, grade and activation thresholds are separate concepts so Rare,
// Elite and Heroic versions can share a family without sharing balance values.

export const AXE_SET_GRADES = Object.freeze(['rare', 'elite', 'heroic']);

const BASE_AXE_SET_DEFINITIONS = Object.freeze({
  AXE_Set_StarterVanguard: Object.freeze({
    id: 'AXE_Set_StarterVanguard',
    name: 'Vanguard',
    allowedGrades: AXE_SET_GRADES,
    allowMixedGrades: false,
    thresholds: Object.freeze({
      2: Object.freeze({ defense: 8, maxHP: 30 }),
      3: Object.freeze({ attack: 6, critDefense: 1 }),
      4: Object.freeze({ strength: 2, vitality: 2 }),
      5: Object.freeze({ attackPct: 5, defensePct: 5 }),
    }),
  }),
  AXE_Set_HeavenlyPath: Object.freeze({
    id: 'AXE_Set_HeavenlyPath',
    name: 'Heavenly Path',
    allowedGrades: Object.freeze(['elite', 'heroic']),
    allowMixedGrades: true,
    thresholds: Object.freeze({
      2: Object.freeze({ maxHPPct: 4 }),
      3: Object.freeze({ critChance: 1.5, critDefense: 1.5 }),
      4: Object.freeze({ spirit: 3, maxChi: 20 }),
      5: Object.freeze({ attackPct: 8, defensePct: 8 }),
    }),
  }),
});

// Procedural pieces have no required 3D model. Two matching pieces unlock a
// unique contextual effect; four provide a small ordinary stat bonus.
export const AXE_SET_DEFINITIONS = Object.freeze({
  ...BASE_AXE_SET_DEFINITIONS,
  [AXE_CHOSEN_SET_ID]: Object.freeze({
    id: AXE_CHOSEN_SET_ID,
    name: 'Chosen',
    allowedGrades: Object.freeze(['chosen']),
    allowMixedGrades: false,
    thresholds: Object.freeze({6:Object.freeze({})}),
    description: 'Six unique Chosen armor pieces: +100% core stats. All six Ascension +4: +200%.',
  }),
  ...Object.fromEntries(AXE_ARMOR_PACK_SETS.filter(set=>set.pieces.length>=5 &&
    ['rare','elite','legendary'].includes(set.rarity)).map((set,i)=>[
    'AXE_Set_Armor_'+set.id,Object.freeze({
      id:'AXE_Set_Armor_'+set.id,name:set.label,
      allowedGrades:Object.freeze([set.rarity]),
      allowMixedGrades:false,
      thresholds:Object.freeze({2:Object.freeze({}),4:Object.freeze({defense:2})}),
      conditionalThresholds:Object.freeze({2:Object.freeze(
        i%3===0 ? {mobDamagePct:15} :
        i%3===1 ? {aerialDamagePct:20} : {virtualAbilityPoints:3},
      )}),
    }),
  ])),
  ...Object.fromEntries(AXE_PROCEDURAL_SET_FAMILIES.map(family => [family.id,Object.freeze({
    id:family.id,name:family.name,
    allowedGrades:Object.freeze(['rare','elite','legendary','mythic']),
    allowMixedGrades:false,
    thresholds:Object.freeze({2:Object.freeze({}),4:Object.freeze({defense:2})}),
    conditionalThresholds:Object.freeze({2:family.uniqueEffect}),
  })])),
});

export function getAXESetDefinition(setId) {
  return AXE_SET_DEFINITIONS[setId] || null;
}

const addStats = (target, source = {}) => {
  for (const [key, raw] of Object.entries(source)) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    target[key] = (target[key] || 0) + value;
  }
  return target;
};

export function evaluateAXESetBonuses(items = []) {
  const groups = new Map();

  for (const item of items) {
    if (!item?.equipped || !item.setId) continue;
    // Chosen is evaluated separately by distinct canonical armor slots and
    // actual stage records, not by a raw count (six duplicate helms must fail).
    if (item.setId === AXE_CHOSEN_SET_ID) continue;
    const def = getAXESetDefinition(item.setId);
    if (!def) continue;

    const grade = String(item.rarity || '').toLowerCase();
    if (!def.allowedGrades.includes(grade)) continue;

    const key = def.allowMixedGrades ? item.setId : `${item.setId}::${grade}`;
    const current = groups.get(key) || {
      setId: item.setId,
      grade: def.allowMixedGrades ? 'mixed' : grade,
      count: 0,
      itemIds: [],
      definition: def,
    };

    current.count += 1;
    current.itemIds.push(item.instanceId || item.id);
    groups.set(key, current);
  }

  const activeSets = [];
  const stats = {};
  const conditional = {};

  for (const group of groups.values()) {
    const activeThresholds = [];
    for (const threshold of [2, 3, 4, 5]) {
      const bonus = group.definition.thresholds[threshold];
      if (group.count >= threshold && bonus) {
        activeThresholds.push(threshold);
        addStats(stats, bonus);
      }
      if (group.count >= threshold && group.definition.conditionalThresholds?.[threshold]) {
        addStats(conditional, group.definition.conditionalThresholds[threshold]);
      }
    }
    activeSets.push({
      setId: group.setId,
      setName: group.definition.name,
      grade: group.grade,
      equippedPieces: group.count,
      itemIds: group.itemIds,
      activeThresholds,
      conditionalBonuses: Object.fromEntries(Object.entries(group.definition.conditionalThresholds || {})
        .filter(([threshold]) => group.count >= Number(threshold))
        .flatMap(([, effects]) => Object.entries(effects))),
      nextThreshold: [2, 3, 4, 5].find((n) => n > group.count &&
        (group.definition.thresholds[n] || group.definition.conditionalThresholds?.[n])) || null,
    });
  }

  const chosen = getAXEChosenSetStatus(items);
  if (chosen.equippedPieces) activeSets.push({
    setId: AXE_CHOSEN_SET_ID,
    setName: 'Chosen',
    grade: 'chosen',
    equippedPieces: chosen.equippedPieces,
    requiredPieces: chosen.requiredPieces,
    ascendedPieces: chosen.ascendedPieces,
    missingSlots: chosen.missingSlots,
    itemIds: chosen.itemIds,
    activeThresholds: chosen.complete ? [6] : [],
    conditionalBonuses: {},
    chosenBonusPct: chosen.bonusPct,
    nextThreshold: chosen.complete ? null : 6,
  });
  return { stats, activeSets, conditional, chosen };
}

// Contextual modifiers are applied at strike resolution, NEVER as a global
// permanent damage stat (that would incorrectly buff PvP, bosses and ground
// attacks). +3 virtual skill points = +9% skill damage at 3% per point;
// this is not three spendable points in the skill tree.
export function getAXESetCombatMultiplier(items = [], {
  pve=false, targetTier='', isAerialAttack=false, isSkill=false,
} = {}) {
  const {conditional} = evaluateAXESetBonuses(items);
  if (!pve) return 1;
  const isOrdinaryMob=['normal','elite','champion'].includes(String(targetTier));
  const mobPct=isOrdinaryMob ? Number(conditional.mobDamagePct||0) : 0;
  const aerialPct=isAerialAttack ? Number(conditional.aerialDamagePct||0) : 0;
  const skillPct=isSkill ? Number(conditional.virtualAbilityPoints||0)*3 : 0;
  // Cap the combined situational boost independently of temporary skill buffs.
  return 1+Math.min(50,Math.max(0,mobPct+aerialPct+skillPct))/100;
}

export function describeAXESetProgress(item, equippedItems = []) {
  if (!item?.setId) return null;
  const def = getAXESetDefinition(item.setId);
  if (!def) return null;

  const relevant = equippedItems.filter((candidate) => {
    if (!candidate?.equipped || candidate.setId !== item.setId) return false;
    if (def.allowMixedGrades) return true;
    return String(candidate.rarity || '').toLowerCase() === String(item.rarity || '').toLowerCase();
  });

  const count = relevant.length;
  return {
    setId: def.id,
    name: def.name,
    equippedPieces: count,
    thresholds: [2, 3, 4, 5].map((threshold) => ({
      threshold,
      active: count >= threshold,
      bonus: def.thresholds[threshold] || null,
    })),
  };
}
