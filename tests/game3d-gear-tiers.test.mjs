// Gear tiers, levels 1–155 (owner plan 2026-11-19; docs/game3d/GEAR_TIERS_20261119.md): the ladders
// and look bands, every template with placeholder art, drops by monster level, the Blacksmith
// tier-up (game rules, server ledger and the itemUpgrade function), the save migration and the
// setting that keeps all of it off until the owner switches it on.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import {
  AXE_GEAR_ITEM_TYPES, AXE_GEAR_LADDERS, AXE_GEAR_TIER_CONFIG, applyAXEGearTierRecord, axeGearLevelScale,
  computeAXEGearBaseStats, getAXEGearDropLevel, getAXEGearRarityWeights, getAXEGearTierInfo, getAXEGearTierUpCost,
  listAXEGearLooks, listAXEGearTemplates, makeAXEGearTemplate, migrateAXEGearTierItem, previewAXEGearTierUp,
  readAXEGearTierRecord,
} from '../base44/shared/axeGearTiers.ts';
import { enforceUpgradeLedger, inventoryItems, rollUpgrade, upgradeCost } from '../base44/shared/itemUpgradeLedger.ts';
import { buildAXEGearTierDrop, getAXEGearLookArt } from '../src/components/game3d/axe/loot/AXEGearTierLoot.mjs';
import { resolveGearTiersEnabled } from '../src/components/game3d/axe/loot/AXEGearTierFlag.mjs';
import { AXE_SERVICE_GROUPS } from '../src/components/game3d/axe/services/AXEServiceGroups.js';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// ---------------- the plan: ladders, bands, templates, looks ----------------

test('ladders: Common/Unique every 5 levels to 55; Rare every 10 from 45; Elite every 10 from 85; Legendary only 155', () => {
  assert.deepEqual(AXE_GEAR_LADDERS.common.steps, [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  assert.deepEqual(AXE_GEAR_LADDERS.uncommon.steps, AXE_GEAR_LADDERS.common.steps);
  assert.deepEqual(AXE_GEAR_LADDERS.rare.steps, [45, 55, 65, 75, 85, 95, 105, 115, 125, 135, 145, 155]);
  assert.deepEqual(AXE_GEAR_LADDERS.elite.steps, [85, 95, 105, 115, 125, 135, 145, 155]);
  assert.deepEqual(AXE_GEAR_LADDERS.legendary.steps, [155]);
  const bands = (r) => AXE_GEAR_LADDERS[r].bands.map((b) => [b.min, b.max]);
  assert.deepEqual(bands('common'), [[1, 30], [31, 55]]);
  assert.deepEqual(bands('rare'), [[45, 84], [85, 119], [120, 130], [131, 140], [141, 150], [151, 155]]);
  assert.deepEqual(bands('elite'), [[85, 119], [120, 130], [131, 140], [141, 150], [151, 155]]);
  assert.deepEqual(bands('legendary'), [[151, 155]]);
  // every step sits in exactly one band; the top bands hold one step each
  for (const [rarity, ladder] of Object.entries(AXE_GEAR_LADDERS)) {
    for (const step of ladder.steps) assert.equal(ladder.bands.filter((b) => step >= b.min && step <= b.max).length, 1, `${rarity} ${step}`);
  }
  assert.deepEqual(AXE_GEAR_LADDERS.rare.bands.slice(2).map((b) => AXE_GEAR_LADDERS.rare.steps.filter((s) => s >= b.min && s <= b.max)), [[125], [135], [145], [155]]);
});

test('every weapon family and armor/jewelry slot has a template per step, sharing one look per band', () => {
  assert.deepEqual(AXE_GEAR_ITEM_TYPES.map((t) => t.id), ['sword', 'dual_blades', 'bow', 'sky', 'helm', 'chest', 'gloves', 'legs', 'boots', 'cape', 'ring', 'necklace']);
  const templates = listAXEGearTemplates();
  const looks = listAXEGearLooks();
  assert.equal(templates.length, 12 * (12 + 12 + 12 + 8 + 1)); // 540 item steps
  assert.equal(looks.length, 12 * (2 + 2 + 6 + 5 + 1)); // 192 looks to model
  assert.equal(new Set(templates.map((t) => t.id)).size, templates.length);
  const byLook = new Map(looks.map((l) => [l.lookId, l]));
  for (const t of templates) {
    const look = byLook.get(t.lookId);
    assert.ok(look, t.id);
    assert.ok(look.steps.includes(t.itemLevel), t.id);
    assert.equal(t.modelKey, `gear/${t.lookId}/model.glb`);
    assert.equal(t.iconKey, `gear/${t.lookId}/icon.png`);
    assert.equal(t.placeholderArt, true);
  }
  // Rare swords Lv 45, 55, 65, 75 share one look; Lv 85 starts the next
  const look = (step) => makeAXEGearTemplate('rare', 'sword', step).lookId;
  assert.equal(new Set([45, 55, 65, 75].map(look)).size, 1);
  assert.notEqual(look(75), look(85));
  // real art for a look replaces the placeholder for every step, with no other change
  assert.deepEqual(getAXEGearLookArt('rare_45_84_sword', { rare_45_84_sword: { modelUrl: '/m.glb', iconUrl: '/i.png' } }),
    { modelUrl: '/m.glb', modelFormat: 'glb', iconUrl: '/i.png' });
  assert.deepEqual(getAXEGearLookArt('rare_45_84_sword'), { modelUrl: null, modelFormat: null, iconUrl: null });
});

test('stats are set per step with the existing loot curves (flat stats by level, rarity and quality; rates by rarity only)', () => {
  assert.equal(AXE_GEAR_TIER_CONFIG.levelScalePerLevel, 0.06);
  assert.equal(axeGearLevelScale(55), 1 + 54 * 0.06);
  const sword = (rarity, step, q = 0) => computeAXEGearBaseStats('sword', rarity, step, q).attack;
  assert.equal(sword('rare', 45), Math.round(6 * 1.18 * (1 + 44 * 0.06)));
  assert.ok(sword('rare', 55) > sword('rare', 45));
  assert.ok(sword('elite', 85) > sword('rare', 85));
  assert.ok(sword('rare', 45, 20) > sword('rare', 45, 0));
  assert.equal(computeAXEGearBaseStats('ring', 'rare', 155).critChance, Number((0.5 * 1.18).toFixed(2)), 'rate stats never scale with level');
  assert.equal(makeAXEGearTemplate('legendary', 'chest', 155).requiredLevel, 150, 'Legendary opens at 150');
  assert.equal(makeAXEGearTemplate('rare', 'chest', 55).requiredLevel, 55);
});

// ---------------- drops ----------------

test('drops follow the monster level: rarities only from their first step, item level = the step at or below it', () => {
  const allowed = (level) => Object.keys(getAXEGearRarityWeights(level)).sort();
  assert.deepEqual(allowed(1), ['common']);
  assert.deepEqual(allowed(44), ['common', 'uncommon']);
  assert.deepEqual(allowed(45), ['common', 'rare', 'uncommon']);
  assert.deepEqual(allowed(56), ['rare'], 'Common and Unique stop at 55');
  assert.deepEqual(allowed(85), ['elite', 'rare']);
  assert.deepEqual(allowed(154), ['elite', 'rare']);
  assert.deepEqual(allowed(155), ['elite', 'legendary', 'rare'], 'Legendary only from level-155 monsters');
  // a level-45 cave drops Lv 45 Rares; the next step is 55
  assert.equal(getAXEGearDropLevel('rare', 45), 45);
  assert.equal(getAXEGearDropLevel('rare', 54), 45);
  assert.equal(getAXEGearDropLevel('rare', 55), 55);
  assert.equal(getAXEGearDropLevel('rare', 44), null);
  assert.equal(getAXEGearDropLevel('elite', 120), 115);
  assert.equal(getAXEGearDropLevel('common', 7), 5);
  assert.equal(getAXEGearDropLevel('common', 3), 1);
  assert.equal(getAXEGearDropLevel('legendary', 154), null);
  // bosses shift the weights toward rarer grades, never past what the level allows
  const boss = getAXEGearRarityWeights(100, { isBoss: true });
  assert.ok(boss.elite / boss.rare > getAXEGearRarityWeights(100).elite / getAXEGearRarityWeights(100).rare);
});

test('a drop is an ordinary inventory item on its step, with its look and placeholder art', () => {
  const rng = seeded(11);
  for (const level of [1, 12, 33, 45, 50, 58, 90, 123, 155]) {
    for (let i = 0; i < 25; i++) {
      const drop = buildAXEGearTierDrop({ rng, monsterLevel: level, sourceId: `mob_${level}_${i}` });
      const item = drop.equipmentItem;
      assert.equal(drop.category, 'equipment');
      assert.equal(item.itemLevel, getAXEGearDropLevel(item.rarity, level), `${level} ${item.rarity}`);
      assert.ok(item.itemLevel <= level);
      assert.equal(item.templateId, `gear_${item.rarity}_${item.gearTier.typeId}_lv${item.itemLevel}`);
      assert.equal(item.slot, item.category);
      assert.ok(item.modelKey && item.iconKey && item.lookId);
      assert.equal(item.placeholderArt, true);
      if (item.slot === 'weapon') assert.ok(['sword', 'dual_blades', 'bow', 'sky'].includes(item.masteryWeaponId));
      assert.ok(Object.keys(item.baseStats).length > 0);
    }
  }
});

// ---------------- the Blacksmith tier-up ----------------

const tierItem = (rarity, typeId, step, extra = {}) => ({
  ...makeAXEGearTemplate(rarity, typeId, step), instanceId: `inst_${rarity}_${typeId}_${step}`, qualityBand: 10,
  rolledStats: { attack: 8, critChance: 0.4 }, ...extra,
});

test('tier-up 45 -> 55 keeps the look; 75 -> 85 crosses into the next band and takes its look', () => {
  const at45 = tierItem('rare', 'sword', 45);
  const up = previewAXEGearTierUp(at45, { heroLevel: 60 });
  assert.equal(up.ok, true);
  assert.equal(up.to, 55);
  assert.equal(up.lookChanges, false);
  assert.equal(up.record.templateId, 'gear_rare_sword_lv55');
  assert.equal(up.record.lookId, at45.lookId);
  assert.deepEqual(up.record.baseStats, computeAXEGearBaseStats('sword', 'rare', 55, 10));
  assert.ok(up.record.rolledStats.attack > 8, 'rolled stats keep their roll and grow with the level');
  assert.equal(up.chance, 1);
  const at75 = previewAXEGearTierUp(tierItem('rare', 'sword', 75), { heroLevel: 99 });
  assert.equal(at75.to, 85);
  assert.equal(at75.lookChanges, true);
  assert.equal(at75.record.lookId, 'rare_85_119_sword');
  // Common steps go up by 5; the last band edge (30 -> 35) changes the look
  assert.equal(previewAXEGearTierUp(tierItem('common', 'helm', 30), { heroLevel: 40 }).lookChanges, true);
  assert.equal(previewAXEGearTierUp(tierItem('common', 'helm', 30), { heroLevel: 40 }).to, 35);
});

test('tier-up refuses the top step, a hero below the next step and items outside the ladders; costs grow per step', () => {
  assert.equal(previewAXEGearTierUp(tierItem('rare', 'bow', 155), { heroLevel: 155 }).reason, 'MAX_TIER');
  assert.equal(previewAXEGearTierUp(tierItem('legendary', 'cape', 155), { heroLevel: 155 }).reason, 'MAX_TIER');
  assert.equal(previewAXEGearTierUp(tierItem('common', 'ring', 55), { heroLevel: 99 }).reason, 'MAX_TIER');
  const low = previewAXEGearTierUp(tierItem('rare', 'sword', 45), { heroLevel: 50 });
  assert.equal(low.reason, 'HERO_LEVEL_TOO_LOW');
  assert.equal(low.requiredLevel, 55);
  assert.equal(previewAXEGearTierUp({ instanceId: 'w', rarity: 'rare', slot: 'wings', itemLevel: 50 }).reason, 'NOT_TIERED_GEAR');
  assert.equal(previewAXEGearTierUp({ instanceId: 'c', rarity: 'chosen', slot: 'chest', itemLevel: 150 }).reason, 'NOT_TIERED_GEAR');
  const material = AXE_GEAR_TIER_CONFIG.tierUp.material;
  assert.deepEqual(getAXEGearTierUpCost(tierItem('rare', 'sword', 45)), { [material]: 1 });
  assert.deepEqual(getAXEGearTierUpCost(tierItem('rare', 'sword', 145)), { [material]: 11 });
  assert.deepEqual(getAXEGearTierUpCost(tierItem('rare', 'sword', 155)), {});
});

test('an older item keeps its own model, name and template; only its level and stats move to the next step', () => {
  const armorPiece = { instanceId: 'nightscale_1', templateId: 'armor_nightscale_chest', name: 'Nightscale Cuirass', rarity: 'rare',
    slot: 'chest', category: 'chest', itemLevel: 50, level: 50, qualityBand: 5, baseStats: { defense: 20, maxHP: 100 }, rolledStats: { strength: 3 },
    appearance: { armorPiece: 'nightscale_chest' } };
  const up = previewAXEGearTierUp(armorPiece, { heroLevel: 55 });
  assert.equal(up.ok, true);
  assert.equal(up.from, 50);
  assert.equal(up.to, 55);
  assert.equal(up.record.templateId, undefined);
  const after = applyAXEGearTierRecord(armorPiece, up.record);
  assert.equal(after.instanceId, 'nightscale_1', 'same instance: its Combine, Enchant and Ascension stay with it');
  assert.equal(after.templateId, 'armor_nightscale_chest');
  assert.equal(after.name, 'Nightscale Cuirass');
  assert.deepEqual(after.appearance, armorPiece.appearance);
  assert.equal(after.itemLevel, 55);
  assert.deepEqual(after.baseStats, computeAXEGearBaseStats('chest', 'rare', 55, 5));
});

test('save migration: older items keep level and stats, only note their step; it runs once', () => {
  const old = [
    { instanceId: 'r50', rarity: 'rare', slot: 'weapon', masteryWeaponId: 'sword', itemLevel: 50, baseStats: { attack: 30 } },
    { instanceId: 'e110', rarity: 'elite', slot: 'helm', itemLevel: 110, baseStats: { defense: 12 } },
    { instanceId: 'l135', rarity: 'legendary', slot: 'boots', itemLevel: 135, baseStats: { evasion: 9 } },
    { instanceId: 'starter', rarity: 'rare', slot: 'weapon', masteryWeaponId: 'sword', itemLevel: 1, baseStats: { attack: 6 } },
    { instanceId: 'wings', rarity: 'common', slot: 'wings', itemLevel: 1, baseStats: { maxHP: 5 } },
  ];
  const migrated = old.map(migrateAXEGearTierItem);
  for (let i = 0; i < old.length; i++) {
    assert.equal(migrated[i].itemLevel, old[i].itemLevel);
    assert.deepEqual(migrated[i].baseStats, old[i].baseStats);
  }
  assert.equal(migrated[0].gearTier.step, 45);
  assert.equal(getAXEGearTierInfo(migrated[0]).nextStep, 55);
  assert.equal(migrated[1].gearTier.step, 105);
  assert.equal(migrated[2].gearTier.step, null, 'old Legendary 135 is below the new first step (155)');
  assert.equal(getAXEGearTierInfo(migrated[2]).nextStep, 155);
  assert.equal(getAXEGearTierInfo(migrated[3]).nextStep, 45, 'a Rare starter weapon tiers up to the first Rare step');
  assert.equal(migrated[4], old[4], 'wings are outside the tier system and untouched');
  assert.deepEqual(migrated.map(migrateAXEGearTierItem), migrated, 'running it again changes nothing');
});

// ---------------- server authority ----------------

const saveWith = (items, { stones = 0, heroLevel = 60 } = {}) => ({
  axe_equipment_inventory_v2: JSON.stringify({ items, activeWeaponInstanceId: null }),
  game_loot_inventory_v2: JSON.stringify({ evolution: Array.from({ length: stones }, (_, i) => ({ id: 'evo_upgrade_stone', dropId: `stone_${i}` })) }),
  wwm_player_progression_v1: JSON.stringify({ level: heroLevel }),
});

test('ledger: a tier-up rolls on the server copy; the Vault restores a tier-up a reloaded save undid, and leaves other level changes alone', () => {
  const item = tierItem('rare', 'sword', 45);
  const before = readAXEGearTierRecord(item);
  const rolled = rollUpgrade('tier_up', before, { roll: 0.3, item, heroLevel: 60 });
  assert.equal(rolled.ok, true);
  assert.equal(rolled.after.level, 55);
  assert.equal(rollUpgrade('tier_up', before, { roll: 0.3, item, heroLevel: 50 }).reason, 'HERO_LEVEL_TOO_LOW');
  assert.deepEqual(upgradeCost('tier_up', before, { item }), { evo_upgrade_stone: 1 });
  const ledger = [{ item_id: item.instanceId, service: 'tier_up', record: rolled.after }];
  // a reloaded save still at Lv 45 gets the Lv 55 item back
  const reloaded = enforceUpgradeLedger(saveWith([item]), saveWith([item]), ledger);
  const kept = inventoryItems(reloaded.data)[0];
  assert.equal(kept.itemLevel, 55);
  assert.equal(kept.templateId, 'gear_rare_sword_lv55');
  assert.ok(reloaded.corrections.some((c) => /tier_up Lv 45 -> Lv 55/.test(c)));
  // the same save at Lv 55: nothing to put back
  const upgraded = applyAXEGearTierRecord(item, rolled.after);
  assert.deepEqual(enforceUpgradeLedger(saveWith([upgraded]), null, ledger).corrections, []);
  // another system raised the level further (Weapon Legacy): left alone
  const raised = { ...upgraded, itemLevel: 60, level: 60 };
  assert.equal(inventoryItems(enforceUpgradeLedger(saveWith([raised]), null, ledger).data)[0].itemLevel, 60);
  // items without a tier-up row are never touched by this rule
  const other = tierItem('elite', 'helm', 95);
  assert.equal(inventoryItems(enforceUpgradeLedger(saveWith([{ ...other, itemLevel: 99 }]), saveWith([other]), ledger).data)[0].itemLevel, 99);
});

const tables = {};
const entities = new Proxy({}, { get: (_, name) => ({
  filter: async (filter = {}) => (tables[name] || []).filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)).map((r) => structuredClone(r)),
  get: async (id) => structuredClone((tables[name] || []).find((r) => r.id === id) || null),
  create: async (data) => { const row = { id: `${name}-${(tables[name] ||= []).length + 1}`, ...structuredClone(data) }; tables[name].push(row); return structuredClone(row); },
  update: async (id, patch) => { const row = tables[name].find((r) => r.id === id); Object.assign(row, structuredClone(patch)); return structuredClone(row); },
}) });
let clock = Date.UTC(2026, 10, 19, 12);
class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
let handler;
vm.runInNewContext(buildSync({ entryPoints: ['base44/functions/itemUpgrade/entry.ts'], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['npm:*'] }).outputFiles[0].text, {
  module: { exports: {} }, exports: {}, Response, Request, Date: TestDate, console: { error() {}, warn() {}, log() {} },
  crypto: { getRandomValues: (array) => { array[0] = Math.floor(0.4 * 2 ** 32); return array; } },
  Deno: { serve: (fn) => { handler = fn; }, env: { get: () => undefined } },
  require: () => ({ createClientFromRequest: (req) => ({ auth: { me: async () => ({ id: req.headers.get('test-user') }) }, asServiceRole: { entities } }) }),
});
async function roll(data, status = 200) {
  clock += 1000;
  const res = await handler(new Request('https://test.local', { method: 'POST', headers: { 'test-user': 'alice' }, body: JSON.stringify({ action: 'roll', data: { characterId: 'c1', ...data } }) }));
  const body = await res.json();
  assert.equal(res.status, status, JSON.stringify(body));
  return body;
}

test('itemUpgrade: a tier-up is paid from the server copy, kept once per transaction, and refused for a hero below the next step', async () => {
  const item = tierItem('rare', 'sword', 45);
  tables.Game3DCharacterSave = [{ id: 's1', owner_id: 'alice', character_id: 'c1', revision: 1, data: saveWith([item], { stones: 3, heroLevel: 60 }) }];
  tables.Game3DItemUpgrade = [];
  const first = await roll({ serviceId: 'tier_up', itemId: item.instanceId, transactionId: 'tu-1' });
  assert.equal(first.result.ok, true);
  assert.equal(first.result.after.level, 55);
  assert.deepEqual(first.result.cost, { evo_upgrade_stone: 1 });
  assert.equal(first.result.spent.length, 1);
  const again = await roll({ serviceId: 'tier_up', itemId: item.instanceId, transactionId: 'tu-1' });
  assert.equal(again.repeated, true);
  assert.equal(tables.Game3DItemUpgrade.length, 1);
  // the next step (65) needs hero level 65: the server reads the level from its copy of the save
  const low = await roll({ serviceId: 'tier_up', itemId: item.instanceId, transactionId: 'tu-2' });
  assert.equal(low.result.reason, 'HERO_LEVEL_TOO_LOW');
  assert.equal(tables.Game3DItemUpgrade[0].attempts, 1, 'nothing rolled, nothing paid');
  // wings are not tiered gear
  tables.Game3DCharacterSave[0].data = saveWith([item, { instanceId: 'wing_1', rarity: 'rare', slot: 'wings', itemLevel: 50, baseStats: {} }], { stones: 3, heroLevel: 99 });
  assert.equal((await roll({ serviceId: 'tier_up', itemId: 'wing_1', transactionId: 'tu-3' })).result.reason, 'NOT_TIERED_GEAR');
});

// ---------------- the setting ----------------

test('the switch-over is off by default; a developer machine can turn it on with ?gearTiers=1, a live site only with the build flag', () => {
  assert.equal(AXE_GEAR_TIER_CONFIG.enabled, false);
  assert.equal(resolveGearTiersEnabled({}), false);
  const memory = new Map();
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  assert.equal(resolveGearTiersEnabled({ hostname: '127.0.0.1', search: '?gearTiers=1', storage }), true);
  assert.equal(resolveGearTiersEnabled({ hostname: '127.0.0.1', storage }), true, 'remembered on this machine');
  assert.equal(resolveGearTiersEnabled({ hostname: 'fallensky.example', search: '?gearTiers=1', storage }), false, 'a live site ignores the address');
  assert.equal(resolveGearTiersEnabled({ hostname: 'fallensky.example', env: { VITE_GAME3D_GEAR_TIERS: 'true' } }), true);
  // off: no Tier Up operation, today's drops, the gateway refuses
  const blacksmith = AXE_SERVICE_GROUPS.find((g) => g.id === 'blacksmith');
  assert.equal(blacksmith.serviceIds.includes('tier_up'), false);
  assert.match(read('../src/components/game3d/axe/loot/AXEEquipmentLootSystem.js'), /if \(isGearTiersEnabled\(\)\) \{\s*return buildAXEGearTierDrop/);
  assert.match(read('../src/components/game3d/axe/services/AXEServiceTransactionGateway.js'), /if \(!isGearTiersEnabled\(\)\) return \{ ok: false, reason: 'GEAR_TIERS_OFF' \}/);
  assert.match(read('../src/components/game3d/axe/equipment/AXEEquipmentSystem.js'), /const required = Number\(item\.requiredLevel \?\? item\.itemLevel \?\? 1\) \|\| 1;/);
});
