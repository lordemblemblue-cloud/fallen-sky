// Blacksmith v2 (owner-approved 2026-11-18; docs/game3d/BLACKSMITH_V2_20261118.md): the
// handoff's P0 Combine / Enchant / Ascend cases, the additive per-item stat breakdown, and
// the server-authoritative Combine and Ascend in itemUpgrade + the Character Vault.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import {
  AXE_REINFORCEMENT_CONFIG, getAXEReinforcementCap, previewReinforcement, reinforcementSuccessChance, resolveReinforcement,
  getAXEEnhancementStatMultiplier,
} from '../base44/shared/axeItemEnhancement.ts';
import {
  AXE_COMBINE_CONFIG, AXE_EQUIPMENT_ASCENSION_CONFIG, ascensionSuccessChance, getAXEAscensionBonusFraction, getAXEItemSubtype,
  resolveAscensionRecord, resolveCombine, resolveCombineRecord, validateAXEAscensionDonor, validateCombine,
} from '../base44/shared/axeItemAdvancement.ts';
import { getAXEAscensionCost, getAXECombineCost } from '../base44/shared/axeServiceEconomy.ts';
import {
  SERVER_ROLLED_UPGRADES, enforceUpgradeLedger, inventoryItems, ledgerRecordsFor, readUpgrade, rollUpgrade, saveAsServerKnows, upgradeCost,
} from '../base44/shared/itemUpgradeLedger.ts';
import {
  computeAXEItemStatBreakdown, formatAXEItemStatTooltip, formatAXEStatLine, axeBreakdownAttack,
} from '../src/components/game3d/axe/equipment/AXEItemStatBreakdown.mjs';
import { getAXEEquipmentDisplayStats } from '../src/components/game3d/axe/equipment/AXEEquipmentDisplayStats.mjs';
import { evaluateAXESetBonuses, getAXESetCombatMultiplier } from '../src/components/game3d/axe/equipment/AXESetBonusSystem.js';
import { getAXEWeaponSkillPerkBonus, makeAXEFarmingItemPerks } from '../src/components/game3d/axe/equipment/AXEFarmingItemPerks.mjs';
import { createServerDice } from '../src/components/game3d/character/characterVault.js';
import { enchantPercentFromRecords } from '../src/components/game3d/enchantVfx/enchantVisualRules.mjs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const weapon = (id, { rarity = 'rare', level = 50, family = 'sword', template = 'tpl_' + id, stats = { attack: 1000 }, ...rest } = {}) => ({
  instanceId: id, id, templateId: template, name: `${rarity} ${family} ${id}`, rarity, itemLevel: level, slot: 'weapon', category: 'weapon',
  masteryWeaponId: family, baseStats: stats, rolledStats: {}, equipped: false, locked: false, ...rest,
});
const armor = (id, slot, { rarity = 'rare', level = 50, template = 'tpl_' + id, stats = { defense: 500 }, ...rest } = {}) => ({
  instanceId: id, id, templateId: template, name: `${rarity} ${slot} ${id}`, rarity, itemLevel: level, slot, category: slot,
  baseStats: stats, rolledStats: {}, equipped: false, locked: false, ...rest,
});
const withCombine = (item, count) => ({ ...item, combine: { count } });

// ---------------- Combine (V2 QA: Combine rows, P0) ----------------

test('Combine P0: Rare 50 sword + Rare 50 sword (another template) goes +0 -> +1 and uses up the donor once', () => {
  const target = weapon('sword_a', { template: 'fantasy_sword' });
  const donor = weapon('sword_b', { template: 'katana' }); // same family, rarity and level; not the same item
  assert.deepEqual(validateCombine(withCombine(target, 0), donor), { ok: true });
  const success = resolveCombine(withCombine(target, 0), donor, { roll: 0 });
  assert.equal(success.ok, true);
  assert.equal(success.target.combine.count, 1);
  assert.equal(success.donorConsumed, true);
  assert.equal(success.target.instanceId, 'sword_a', 'the target stays the same instance');
});

test('Combine P0: a wrong subtype (bow) or a wrong level (75) is refused before anything is charged', () => {
  const target = withCombine(weapon('sword_a'), 0);
  assert.equal(validateCombine(target, weapon('bow_b', { family: 'bow' })).reason, 'SUBTYPE_MISMATCH');
  assert.equal(validateCombine(target, weapon('sword_c', { level: 75 })).reason, 'LEVEL_MISMATCH');
  // the server: nothing rolled, the record unchanged, no cost computed for a refused donor
  const refused = rollUpgrade('combine', { count: 0 }, { roll: 0, item: weapon('sword_a'), donor: weapon('bow_b', { family: 'bow' }) });
  assert.equal(refused.reason, 'SUBTYPE_MISMATCH');
  assert.deepEqual(refused.after, { count: 0 });
  assert.equal(refused.donorConsumed, undefined);
});

test('Combine P0: +12 is the cap; a 13th attempt is refused and +12 is unchanged', () => {
  const capped = resolveCombine(withCombine(weapon('sword_a'), 12), weapon('sword_b'), { roll: 0 });
  assert.equal(capped.reason, 'MAX_COMBINE');
  assert.equal(capped.target.combine.count, 12);
  assert.equal(resolveCombineRecord({ count: 12 }, weapon('sword_a'), weapon('sword_b'), { roll: 0 }).reason, 'MAX_COMBINE');
});

test('Combine P0: a forced failure at +5 keeps +5 and the donor; only the (free) fee is charged', () => {
  const failed = resolveCombineRecord({ count: 5 }, weapon('sword_a'), weapon('sword_b'), { roll: 0.999 });
  assert.equal(failed.ok, false);
  assert.equal(failed.outcome, 'failure');
  assert.deepEqual(failed.record, { count: 5 });
  assert.equal(failed.donorConsumed, false);
  assert.deepEqual(getAXECombineCost(), {}, 'the Combine fee is a config value, free for now');
  assert.deepEqual(AXE_COMBINE_CONFIG.fee, {});
  assert.deepEqual(upgradeCost('combine', { count: 5 }), {});
});

test('Combine: armor and jewelry match by slot, weapons by family; protected donors and the item itself never match', () => {
  const gloves = withCombine(armor('g1', 'gloves', { template: 'iron_gloves' }), 0);
  assert.equal(validateCombine(gloves, armor('g2', 'gloves', { template: 'silk_gloves' })).ok, true);
  assert.equal(validateCombine(gloves, armor('b1', 'boots')).reason, 'SLOT_MISMATCH');
  assert.equal(validateCombine(withCombine(armor('r1', 'ring'), 0), armor('r2', 'ring', { template: 'other_ring' })).ok, true);
  assert.equal(validateCombine(withCombine(armor('n1', 'necklace'), 0), armor('r2', 'ring')).reason, 'SLOT_MISMATCH');
  assert.equal(validateCombine(gloves, armor('g3', 'gloves', { rarity: 'elite' })).reason, 'GRADE_MISMATCH');
  assert.equal(validateCombine(gloves, armor('g4', 'gloves', { equipped: true })).reason, 'DONOR_PROTECTED');
  assert.equal(validateCombine(gloves, armor('g5', 'gloves', { locked: true })).reason, 'DONOR_PROTECTED');
  assert.equal(validateCombine(gloves, gloves).reason, 'SAME_INSTANCE');
  // a weapon that does not say its family only matches its own template
  const anon = (id, template) => ({ ...weapon(id, { template }), masteryWeaponId: undefined });
  assert.equal(getAXEItemSubtype(anon('w1', 't')), null);
  assert.equal(validateCombine(withCombine(anon('w1', 't'), 0), anon('w2', 't')).ok, true);
  assert.equal(validateCombine(withCombine(anon('w1', 't'), 0), anon('w3', 'u')).reason, 'SUBTYPE_MISMATCH');
  assert.equal(getAXEItemSubtype(weapon('d', { family: 'dual_blades' })), 'weapon:dual_blades');
});

// ---------------- Enchant (V2 QA: Enchant rows, P0) ----------------

test('Enchant P0: a forced failure at 90 % leaves 87 %; nothing breaks and nothing else resets', () => {
  const item = weapon('sword_a');
  const result = resolveReinforcement({ percent: 90 }, { item, roll: 0.999 });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'downgrade');
  assert.deepEqual(result.record, { percent: 87 });
  assert.equal(result.destroyed, undefined);
  assert.equal(previewReinforcement({ percent: 90 }, { item }).failurePercent, 87);
});

test('Enchant P0: a forced failure at 2 % leaves 0 % (never negative); at 0 % it stays 0 %', () => {
  const item = weapon('sword_a');
  // up to 40 % the existing odds never fail, so the failure is forced with a roll above 1
  assert.equal(reinforcementSuccessChance(2), 1);
  assert.deepEqual(resolveReinforcement({ percent: 2 }, { item, roll: 2 }).record, { percent: 0 });
  const zero = resolveReinforcement({ percent: 0 }, { item, roll: 2 });
  assert.equal(zero.outcome, 'no_change');
  assert.deepEqual(zero.record, { percent: 0 });
  // the old 70 % threshold and 40 % floor are gone: 45 % -> 42 %, 72 % -> 69 %
  assert.equal(resolveReinforcement({ percent: 45 }, { item, roll: 0.999 }).record.percent, 42);
  assert.equal(resolveReinforcement({ percent: 72 }, { item, roll: 0.999 }).record.percent, 69);
  // a Stabilizer still keeps the current Enchant
  assert.deepEqual(resolveReinforcement({ percent: 90 }, { item, roll: 0.999, protectedAttempt: true }).record, { percent: 90 });
  assert.equal(AXE_REINFORCEMENT_CONFIG.failurePenaltyPercent, 3);
  assert.equal(AXE_REINFORCEMENT_CONFIG.floorPercent, 0);
});

test('Enchant: every rarity reaches 200 %; success adds 5 points up to the cap; Mythic keeps its 120 % (config)', () => {
  for (const rarity of ['common', 'uncommon', 'unique', 'rare', 'rare_elite', 'elite', 'elite_set', 'legendary', 'heroic', 'chosen', 'ascendant']) {
    assert.equal(getAXEReinforcementCap({ rarity }), 200, rarity);
  }
  assert.equal(getAXEReinforcementCap({ rarity: 'mythic' }), 120);
  const rare = weapon('r');
  assert.equal(resolveReinforcement({ percent: 50 }, { item: rare, roll: 0 }).record.percent, 55, 'a Rare goes past its old 50 % cap');
  assert.equal(resolveReinforcement({ percent: 198 }, { item: rare, roll: 0 }).record.percent, 200);
  assert.equal(resolveReinforcement({ percent: 200 }, { item: rare, roll: 0 }).reason, 'max_reinforcement');
  // the light still follows the total enhancement %, now reachable by a Rare (59 % = green)
  assert.equal(enchantPercentFromRecords({ reinforcement: { percent: 59 } }, getAXEEnhancementStatMultiplier), 59);
});

// ---------------- Ascend (V2 QA: Ascend rows, P0) ----------------

test('Ascend P0: clean gear (Combine +0, Enchant 0 %) can ascend; success uses up the donor exactly once', () => {
  const target = weapon('sword_a');
  const result = resolveAscensionRecord({ rank: 0, id: 'stage_0', label: 'Base' }, target, weapon('sword_b'), { roll: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.record.rank, 1);
  assert.equal(result.donorConsumed, true);
});

test('Ascend P0: Rare / Elite / Legendary +4 add 15 / 75 / 100 % of the original roll (1,000 attack)', () => {
  for (const [rarity, bonus] of [['rare', 150], ['elite', 750], ['legendary', 1000]]) {
    const breakdown = computeAXEItemStatBreakdown(weapon('w', { rarity }), { advancement: { stage: { rank: 4 } } });
    assert.equal(breakdown.rows[0].ascend, bonus, rarity);
    assert.equal(breakdown.rows[0].total, 1000 + bonus, rarity);
  }
  const rare = computeAXEItemStatBreakdown(weapon('w'), { advancement: { stage: { rank: 4 } } });
  assert.equal(formatAXEStatLine(rare.rows[0]), 'Attack 1,000 (+150)');
  assert.equal(formatAXEItemStatTooltip(rare), 'Attack 1,000 (+150) = 1,150');
  // stages +1..+4 are a quarter each: 3.75 / 7.5 / 11.25 / 15 % for a Rare
  assert.deepEqual([1, 2, 3, 4].map((rank) => getAXEAscensionBonusFraction({ rarity: 'rare' }, rank)), [0.0375, 0.075, 0.1125, 0.15]);
  assert.deepEqual([1, 2, 3, 4].map((rank) => getAXEAscensionBonusFraction({ rarity: 'legendary' }, rank)), [0.25, 0.5, 0.75, 1]);
  const shield = computeAXEItemStatBreakdown(armor('c', 'chest'), { advancement: { stage: { rank: 4 } } });
  assert.equal(shield.rows[0].ascend, 75, 'a 500-defense Rare shows +75');
});

test('Ascend P0: a Rare +4 with 8 % chance shows +1.2 percentage points, never +15 points', () => {
  const ring = armor('ring', 'ring', { stats: { critChance: 8 } });
  const row = computeAXEItemStatBreakdown(ring, { advancement: { stage: { rank: 4 } } }).rows[0];
  assert.ok(Math.abs(row.bonus - 1.2) < 1e-9);
  assert.ok(Math.abs(row.total - 9.2) < 1e-9);
  assert.equal(formatAXEStatLine(row), 'Crit Chance 8.0% (+1.2 pp)');
  // chance stats stay within their cap
  const capped = computeAXEItemStatBreakdown(armor('x', 'ring', { rarity: 'legendary', stats: { critChance: 60 } }), { advancement: { stage: { rank: 4 } } }).rows[0];
  assert.equal(capped.total, 100);
  assert.equal(capped.capped, true);
});

test('Ascend P0: set bonuses are untouched by Ascension (a complete +4 set equals the same set at +0)', () => {
  const set = (rank) => ['helm', 'chest', 'gloves', 'legs', 'boots', 'cape'].map((slot, i) => ({
    slot, instanceId: 'piece_' + i, rarity: 'rare', setId: 'AXE_Set_RareStriker', equipped: true, advancement: { stage: { rank } },
  }));
  assert.deepEqual(evaluateAXESetBonuses(set(4)).stats, evaluateAXESetBonuses(set(0)).stats);
  assert.deepEqual(evaluateAXESetBonuses(set(4)).conditional, evaluateAXESetBonuses(set(0)).conditional);
  assert.deepEqual(evaluateAXESetBonuses(set(4)).stats, { attackPct: 15, critDamage: 10 }, 'the authored 2- and 4-piece values, unscaled');
  assert.equal(getAXESetCombatMultiplier(set(4), { pve: true, targetTier: 'normal', isSkill: true }),
    getAXESetCombatMultiplier(set(0), { pve: true, targetTier: 'normal', isSkill: true }));
  // the full-set aura (visual) still follows the ranks
  assert.equal(evaluateAXESetBonuses(set(4)).activeSets[0].fullAuraRank, 4);
});

test('Ascend P0: a forced +3 -> +4 failure keeps +3 and the donor; a success at 50 % uses the donor once', () => {
  const target = weapon('sword_a', { rarity: 'elite', level: 120 });
  const donor = weapon('sword_b', { rarity: 'elite', level: 110 });
  const record = { rank: 3, id: 'stage_3', label: 'Stage III' };
  assert.equal(ascensionSuccessChance(3), 0.5);
  const failed = resolveAscensionRecord(record, target, donor, { roll: 0.51 });
  assert.equal(failed.outcome, 'failure');
  assert.deepEqual(failed.record, record);
  assert.equal(failed.donorConsumed, false);
  const won = resolveAscensionRecord(record, target, donor, { roll: 0.49 });
  assert.equal(won.record.rank, 4);
  assert.equal(won.donorConsumed, true);
  assert.deepEqual(AXE_EQUIPMENT_ASCENSION_CONFIG.successChanceByRank, [1, 0.8, 0.65, 0.5]);
  assert.equal(ascensionSuccessChance(4), null);
});

test('Ascend: one donor of the same rarity and slot/subtype with an equal or lower level; Mythic, Common and Unique are off', () => {
  const target = weapon('t', { level: 80 });
  assert.equal(validateAXEAscensionDonor(target, weapon('d1', { level: 50 })).ok, true, 'lower level');
  assert.equal(validateAXEAscensionDonor(target, weapon('d2', { level: 80 })).ok, true, 'equal level');
  assert.equal(validateAXEAscensionDonor(target, weapon('d3', { level: 120 })).reason, 'DONOR_LEVEL_TOO_HIGH');
  assert.equal(validateAXEAscensionDonor(target, weapon('d4', { rarity: 'elite' })).reason, 'ASCENSION_RARITY_MISMATCH');
  assert.equal(validateAXEAscensionDonor(target, weapon('d5', { family: 'bow' })).reason, 'ASCENSION_SUBTYPE_MISMATCH');
  assert.equal(validateAXEAscensionDonor(target, armor('d6', 'chest')).reason, 'ASCENSION_SLOT_MISMATCH');
  assert.equal(validateAXEAscensionDonor(target, weapon('d7', { locked: true })).reason, 'DONOR_PROTECTED');
  assert.equal(validateAXEAscensionDonor(target, null).reason, 'DONOR_REQUIRED');
  for (const rarity of ['mythic', 'common', 'uncommon', 'unique', 'heroic']) {
    const item = weapon('m', { rarity });
    assert.equal(resolveAscensionRecord({ rank: 0 }, item, weapon('m2', { rarity }), { roll: 0 }).reason, 'ASCENSION_RARITY_NOT_ELIGIBLE', rarity);
    assert.equal(computeAXEItemStatBreakdown(item, { advancement: { stage: { rank: 4 } } }).rows[0].ascend, 0, rarity);
  }
  assert.equal(AXE_EQUIPMENT_ASCENSION_CONFIG.futureRarities.mythic.enabled, false);
  // Chosen keeps its materials-only stage (the Chosen set's x2/x3 is unchanged)
  const chosen = resolveAscensionRecord({ rank: 1 }, armor('ch', 'chest', { rarity: 'chosen' }), null, { roll: 0.99 });
  assert.equal(chosen.ok, true);
  assert.equal(chosen.legacy, true);
  assert.deepEqual(getAXEAscensionCost({ item: { rarity: 'chosen' }, advancement: { stage: { rank: 1 } } }), { evo_upgrade_stone: 2 });
  assert.deepEqual(getAXEAscensionCost({ item: weapon('x') }), {}, 'the Ascension fee and catalyst are config values, free for now');
});

test('Ascend: items ascended under the old rules keep their rank and get the new bonus; +4 adds no skill levels', () => {
  const old = { rank: 2, id: 'stage_2', label: 'Stage II', imprints: [{ rank: 1, bonus: 0.2 }, { rank: 2, bonus: 0.25 }], feedProgress: 1 };
  const row = computeAXEItemStatBreakdown(weapon('w', { rarity: 'legendary' }), { advancement: { stage: old } }).rows[0];
  assert.equal(row.ascend, 500, 'Legendary +2: 50 % of 1,000; old imprints are ignored');
  const next = resolveAscensionRecord(old, weapon('w', { rarity: 'legendary' }), weapon('d', { rarity: 'legendary' }), { roll: 0 });
  assert.deepEqual(next.record, { rank: 3, id: 'stage_3', label: 'Stage III' }, 'old imprints and feed progress are not carried forward');
  const perk = { slot: 'weapon', abilityPerks: makeAXEFarmingItemPerks({ slot: 'weapon', rarity: 'rare' }) };
  assert.equal(getAXEWeaponSkillPerkBonus(perk, { family: 'single' }), 12);
  assert.equal(getAXEWeaponSkillPerkBonus({ ...perk, abilityPerks: { ...perk.abilityPerks, ascendedSkillLevels: 4 } }, { family: 'single' }), 12,
    'an older item still carrying ascendedSkillLevels gets no extra levels');
  assert.equal(makeAXEFarmingItemPerks({ slot: 'weapon', rarity: 'legendary' }).ascendedSkillLevels, undefined);
});

// ---------------- Additive stats (Stat Rules v2) ----------------

test('Stats are additive: original + Combine + Enchant + Ascend, each from the original roll, never compounded', () => {
  const item = weapon('w');
  const records = { reinforcement: { percent: 50 }, enchantments: [10, 10, 0, 0], overEnchant: { level: 0 }, advancement: { combine: { count: 12 }, stage: { rank: 4 } } };
  const [row] = computeAXEItemStatBreakdown(item, records).rows;
  assert.equal(row.combine, 240); // 12 × 2 %
  assert.equal(row.enchant, 700); // 50 % + 20 slot levels × 1 %
  assert.equal(row.ascend, 150);
  assert.equal(row.total, 2090);
  assert.notEqual(row.total, 1000 * 1.7 * (1 + 0.24 + 0.15), 'not the old compounding');
  assert.equal(axeBreakdownAttack(computeAXEItemStatBreakdown(item, records)), 2090);
  // Combine and Enchant leave rate stats alone; Ascension grows them relatively
  const ring = armor('r', 'ring', { stats: { attack: 100, critChance: 2 } });
  const rows = computeAXEItemStatBreakdown(ring, records).rows;
  assert.equal(rows.find((r) => r.stat === 'critChance').combine, 0);
  assert.equal(rows.find((r) => r.stat === 'critChance').enchant, 0);
  assert.ok(Math.abs(rows.find((r) => r.stat === 'critChance').ascend - 0.3) < 1e-9);
  // the viewer reads the same breakdown
  const display = getAXEEquipmentDisplayStats(item, records);
  assert.deepEqual(display.map((r) => [r.stat, r.base, r.current, r.difference]), [['attack', 1000, 2090, 1090]]);
  assert.match(read('../src/components/game3d/axe/equipment/AXEEquipmentRuntimeStats.js'), /computeAXEItemStatBreakdown\(item, records\)/);
});

// ---------------- Server authority (itemUpgrade + Character Vault) ----------------

const INVENTORY = 'axe_equipment_inventory_v2';
const ADVANCEMENT = 'axe_item_advancement_v2';
const saveWith = (items, extra = {}) => ({
  [INVENTORY]: JSON.stringify({ items, activeWeaponInstanceId: items.find((i) => i.equipped && i.slot === 'weapon')?.instanceId || null }),
  game_loot_inventory_v2: JSON.stringify({ material: [] }),
  ...extra,
});

test('Vault: a donor the server used up leaves every save, and the server record wins', () => {
  assert.ok(SERVER_ROLLED_UPGRADES.includes('combine') && SERVER_ROLLED_UPGRADES.includes('stage'));
  const save = saveWith([weapon('a'), weapon('b'), weapon('c')], { [ADVANCEMENT]: JSON.stringify({ a: { combine: { count: 0 } } }) });
  const ledger = [{ item_id: 'a', service: 'combine', record: { count: 1 }, consumed: ['b'] }];
  const kept = enforceUpgradeLedger(save, save, ledger);
  assert.deepEqual(inventoryItems(kept.data).map((i) => i.instanceId), ['a', 'c']);
  assert.deepEqual(readUpgrade(kept.data, 'combine', 'a'), { count: 1 });
  assert.ok(kept.corrections.some((c) => /b: used up as a donor/.test(c)));
  // the server's own copy already treats the donor as gone
  assert.deepEqual(inventoryItems(saveAsServerKnows(save, ledger)).map((i) => i.instanceId), ['a', 'c']);
  // an edited save cannot add Ascension ranks without a server row
  const edited = { ...save, [ADVANCEMENT]: JSON.stringify({ c: { stage: { rank: 4, id: 'stage_4', label: 'Stage IV' } } }) };
  assert.deepEqual(readUpgrade(enforceUpgradeLedger(edited, save, []).data, 'stage', 'c'), { rank: 0, id: 'stage_0', label: 'Base' },
    'no rank the server never rolled');
  // a restore that brings the donor back no longer counts it as used up
  const restored = ledgerRecordsFor(save, ledger);
  assert.deepEqual(restored[0].consumed, []);
  assert.deepEqual(restored[0].record, { count: 0 });
});

// the itemUpgrade function itself, against an in-memory Base44 stand-in with scripted dice
const tables = {};
const entities = new Proxy({}, { get: (_, name) => ({
  filter: async (filter = {}) => (tables[name] || []).filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)).map((r) => structuredClone(r)),
  get: async (id) => structuredClone((tables[name] || []).find((r) => r.id === id) || null),
  create: async (data) => { const row = { id: `${name}-${(tables[name] ||= []).length + 1}`, ...structuredClone(data) }; tables[name].push(row); return structuredClone(row); },
  update: async (id, patch) => { const row = tables[name].find((r) => r.id === id); Object.assign(row, structuredClone(patch)); return structuredClone(row); },
}) });
const rolls = [];
let clock = Date.UTC(2026, 10, 18, 12);
class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
let handler;
const source = buildSync({ entryPoints: ['base44/functions/itemUpgrade/entry.ts'], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['npm:*'] }).outputFiles[0].text;
vm.runInNewContext(source, {
  module: { exports: {} }, exports: {}, Response, Request, Date: TestDate, console: { error() {}, warn() {}, log() {} },
  crypto: { getRandomValues: (array) => { array[0] = Math.floor((rolls.length ? rolls.shift() : 0.5) * 2 ** 32); return array; } },
  Deno: { serve: (fn) => { handler = fn; }, env: { get: () => undefined } },
  require: () => ({ createClientFromRequest: (req) => ({ auth: { me: async () => (req.headers.get('test-user') ? { id: req.headers.get('test-user') } : null) }, asServiceRole: { entities } }) }),
});
async function roll(data, status = 200) {
  clock += 1000;
  const res = await handler(new Request('https://test.local', { method: 'POST', headers: { 'test-user': 'alice' }, body: JSON.stringify({ action: 'roll', data: { characterId: 'c1', ...data } }) }));
  const body = await res.json();
  assert.equal(res.status, status, JSON.stringify(body));
  return body;
}
const resetServer = (items) => {
  for (const key of Object.keys(tables)) delete tables[key];
  tables.Game3DCharacterSave = [{ id: 's1', owner_id: 'alice', character_id: 'c1', revision: 3, data: saveWith(items) }];
  tables.Game3DItemUpgrade = [];
  rolls.length = 0;
};

test('Server P0: a Combine success writes the stage and uses up the donor once; a retry repeats it; the donor is gone for the server', async () => {
  resetServer([weapon('a'), weapon('b', { template: 'other_sword' }), weapon('c')]);
  rolls.push(0.01);
  const first = await roll({ serviceId: 'combine', itemId: 'a', donorId: 'b', transactionId: 'tx-1' });
  assert.equal(first.result.ok, true);
  assert.deepEqual(first.result.after, { count: 1 });
  assert.equal(first.result.donorConsumed, true);
  assert.deepEqual(first.result.cost, {});
  const row = tables.Game3DItemUpgrade.find((r) => r.item_id === 'a' && r.service === 'combine');
  assert.deepEqual(row.consumed, ['b']);
  assert.equal(row.attempts, 1);
  // a double click / lost answer: the same result, never a second roll or a second donor
  const again = await roll({ serviceId: 'combine', itemId: 'a', donorId: 'b', transactionId: 'tx-1' });
  assert.equal(again.repeated, true);
  assert.deepEqual(again.result, first.result);
  assert.equal(tables.Game3DItemUpgrade.length, 1);
  assert.deepEqual(tables.Game3DItemUpgrade[0].consumed, ['b']);
  // the used-up donor can be neither a donor nor a target again
  assert.equal((await roll({ serviceId: 'combine', itemId: 'a', donorId: 'b', transactionId: 'tx-2' }, 409)).code, 'donor_unavailable');
  assert.equal((await roll({ serviceId: 'combine', itemId: 'b', donorId: 'c', transactionId: 'tx-3' }, 409)).code, 'item_consumed');
});

test('Server P0: a Combine failure keeps the stage and the donor; a mismatched donor is refused without a row', async () => {
  resetServer([weapon('a'), weapon('b'), weapon('bow', { family: 'bow' }), weapon('far', { level: 75 })]);
  rolls.push(0.999);
  const failed = await roll({ serviceId: 'combine', itemId: 'a', donorId: 'b', transactionId: 'tx-f' });
  assert.equal(failed.result.ok, false);
  assert.equal(failed.result.outcome, 'failure');
  assert.equal(failed.result.donorConsumed, false);
  assert.deepEqual(tables.Game3DItemUpgrade[0].record, { count: 0 });
  assert.deepEqual(tables.Game3DItemUpgrade[0].consumed, []);
  const before = tables.Game3DItemUpgrade.length;
  assert.equal((await roll({ serviceId: 'combine', itemId: 'a', donorId: 'bow', transactionId: 'tx-bow' })).result.reason, 'SUBTYPE_MISMATCH');
  assert.equal((await roll({ serviceId: 'combine', itemId: 'a', donorId: 'far', transactionId: 'tx-far' })).result.reason, 'LEVEL_MISMATCH');
  assert.equal(tables.Game3DItemUpgrade.length, before, 'nothing written for a refused donor');
  assert.deepEqual(tables.Game3DItemUpgrade[0].spent, [], 'no material charged');
  // a donor this device has not saved to the server yet
  assert.equal((await roll({ serviceId: 'combine', itemId: 'a', donorId: 'ghost', transactionId: 'tx-ghost' }, 409)).code, 'not_synced');
});

test('Server P0: Ascension +3 -> +4 keeps the donor on a failure and uses it once on a success', async () => {
  const target = weapon('t', { rarity: 'legendary', level: 135 });
  resetServer([target, weapon('d', { rarity: 'legendary', level: 135, template: 'x' }), weapon('d2', { rarity: 'legendary', level: 135 })]);
  tables.Game3DItemUpgrade.push({ id: 'u0', owner_id: 'alice', character_id: 'c1', item_id: 't', service: 'stage', record: { rank: 3, id: 'stage_3', label: 'Stage III' }, attempts: 3, spent: [], consumed: ['old_1', 'old_2', 'old_3'] });
  rolls.push(0.75);
  const failed = await roll({ serviceId: 'stage', itemId: 't', donorId: 'd', transactionId: 'asc-1' });
  assert.equal(failed.result.outcome, 'failure');
  assert.equal(failed.result.chance, 0.5);
  assert.deepEqual(tables.Game3DItemUpgrade[0].record.rank, 3);
  assert.deepEqual(tables.Game3DItemUpgrade[0].consumed, ['old_1', 'old_2', 'old_3']);
  rolls.push(0.25);
  const won = await roll({ serviceId: 'stage', itemId: 't', donorId: 'd', transactionId: 'asc-2' });
  assert.equal(won.result.ok, true);
  assert.deepEqual(won.result.after, { rank: 4, id: 'stage_4', label: 'Stage IV' });
  assert.deepEqual(tables.Game3DItemUpgrade[0].consumed, ['old_1', 'old_2', 'old_3', 'd']);
  // the used-up donor is refused; +4 is the cap
  assert.equal((await roll({ serviceId: 'stage', itemId: 't', donorId: 'd', transactionId: 'asc-3' }, 409)).code, 'donor_unavailable');
  assert.equal((await roll({ serviceId: 'stage', itemId: 't', donorId: 'd2', transactionId: 'asc-4' })).result.reason, 'MAX_STAGE');
  assert.deepEqual(tables.Game3DItemUpgrade[0].consumed, ['old_1', 'old_2', 'old_3', 'd'], 'd2 is kept');
});

test('Client: the dice pass the donor; an itemUpgrade deployed before v2 leaves Combine/Ascend on this device', async () => {
  const engine = { get: () => ({ status: 'saved' }), flush: async () => true };
  const calls = [];
  const dice = createServerDice(engine, { call: async (fn, action, data) => { calls.push({ fn, action, data }); return { result: { ok: true } }; }, getIdentity: () => ({ characterId: 'c1' }) });
  await dice({ serviceId: 'combine', itemId: 'a', donorId: 'b', transactionId: 't1' });
  assert.equal(calls[0].data.donorId, 'b');
  const oldServer = createServerDice(engine, {
    call: async () => { throw Object.assign(new Error('That upgrade is not rolled by the server'), { code: 'invalid' }); },
    getIdentity: () => ({ characterId: 'c1' }),
  });
  assert.deepEqual(await oldServer({ serviceId: 'stage', itemId: 'a', donorId: 'b' }), { local: true });
  assert.equal((await oldServer({ serviceId: 'reinforcement', itemId: 'a' })).reason, 'upgrade_not_available', 'only the donor upgrades fall back');
  // the game routes Combine and Ascend through the server with their donors
  const gateway = read('../src/components/game3d/axe/services/AXEServiceTransactionGateway.js');
  assert.match(gateway, /if \(DONOR_UPGRADES\.includes\(serviceId\)\) return checkDonorUpgrade\(serviceId, payload\)/);
  assert.match(gateway, /consumeAXEEquipmentItem\(rolled\.donorId, \{ allowEquipped: true, allowLocked: true \}\)/);
  assert.match(read('../base44/entities/game3-d-item-upgrade.jsonc'), /"combine", "stage"/);
});
