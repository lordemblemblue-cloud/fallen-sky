// R147 tests actual shared ledger and gear-tier modules; no service or live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spentCounts, pickCostUnits, lootUnits, inventoryItems, findItem, readUpgrade, consumedItemIds, saveAsServerKnows, enforceUpgradeLedger, ledgerRecordsFor, heroLevelOf, rollUpgrade, upgradeCost } from '../../../base44/shared/itemUpgradeLedger.ts';
import { AXE_GEAR_TIER_CONFIG, getAXEGearStep, getAXEGearRarityWeights, makeAXEGearTemplate, listAXEGearTemplates, listAXEGearLooks, previewAXEGearTierUp, readAXEGearTierRecord, applyAXEGearTierRecord, migrateAXEGearTierItem } from '../../../base44/shared/axeGearTiers.ts';
const I='axe_equipment_inventory_v2', L='game_loot_inventory_v2', E='axe_reinforcement_v1', A='axe_item_advancement_v2';
const gear=(id,patch={})=>({...makeAXEGearTemplate('rare','sword',45),instanceId:id,...patch});
const unit=(dropId,id='mat_reinforce')=>({id,dropId});
const save=(items=[],materials=[],extra={})=>({[I]:JSON.stringify({items,activeWeaponInstanceId:items[0]?.instanceId??null}),[L]:JSON.stringify({material:materials}),...extra});
test('legacy duplicate drop IDs retain multiplicity when selecting costs',()=>{
  const s=save([], [unit('dup'),unit('dup'),unit('other')]);
  const spent=spentCounts([{spent:['dup']},{spent:['other']}]);
  assert.equal(spent.get('dup'),1);
  assert.deepEqual(pickCostUnits(s,{mat_reinforce:1},spent),{ok:true,dropIds:['dup']});
  assert.deepEqual(pickCostUnits(s,{mat_reinforce:2},spent),{ok:false,missing:{mat_reinforce:1}});
  assert.equal(spent.get('dup'),1);
});
test('one stale save correction removes only the counted units',()=>{
  const s=save([], [unit('dup'),unit('dup'),unit('other')]);
  const result=enforceUpgradeLedger(s,null,[{item_id:'a',service:'reinforcement',record:{percent:5},spent:['dup']}]);
  assert.deepEqual(lootUnits(result.data).map(x=>x.dropId),['dup','other']);
  assert.equal(lootUnits(s).length,3);
});
test('donor removal clears active weapon reference and leaves unrelated item',()=>{
  const s=save([gear('donor'),gear('target')]);
  const rows=[{item_id:'target',service:'combine',record:{count:1},consumed:['donor']}];
  assert.deepEqual([...consumedItemIds(rows)],['donor']);
  const corrected=saveAsServerKnows(s,rows);
  assert.equal(findItem(corrected,'donor'),null);
  assert.equal(JSON.parse(corrected[I]).activeWeaponInstanceId,null);
  assert.equal(inventoryItems(corrected).length,1);
});
test('ledger removes destroyed and consumed items but preserves other gear',()=>{
  const s=save([gear('destroyed'),gear('donor'),gear('target')]);
  const rows=[{item_id:'destroyed',service:'refine',record:{level:12,destroyed:true}},{item_id:'target',service:'combine',record:{count:1},consumed:['donor']}];
  const r=enforceUpgradeLedger(s,null,rows);
  assert.deepEqual(inventoryItems(r.data).map(x=>x.instanceId),['target']);
  assert.equal(readUpgrade(r.data,'combine','target').count,1);
});
test('ledger overrides edited enchant record with accepted result',()=>{
  const s=save([gear('a')],[],{[E]:JSON.stringify({a:{percent:200}})});
  const r=enforceUpgradeLedger(s,null,[{item_id:'a',service:'reinforcement',record:{percent:45}}]);
  assert.deepEqual(readUpgrade(r.data,'reinforcement','a'),{percent:45});
});
test('previous accepted record prevents unrecorded enchant change',()=>{
  const p=save([gear('a')],[],{[E]:JSON.stringify({a:{percent:20}})});
  const s={...p,[E]:JSON.stringify({a:{percent:90}})};
  assert.equal(readUpgrade(enforceUpgradeLedger(s,p,[]).data,'reinforcement','a').percent,20);
});
test('backup restore reconciles material multiplicity and held donor',()=>{
  const s=save([gear('a'),gear('donor')],[unit('dup')],{[A]:JSON.stringify({a:{combine:{count:0}}})});
  const rows=[{item_id:'a',service:'combine',record:{count:1},spent:['dup','dup'],consumed:['donor','absent']}];
  const result=ledgerRecordsFor(s,rows)[0];
  assert.deepEqual(result.record,{count:0});
  assert.deepEqual(result.spent,['dup']);
  assert.deepEqual(result.consumed,['absent']);
  assert.equal(rows[0].spent.length,2);
});
test('gear ladder and rarity boundaries follow configured levels',()=>{
  assert.equal(getAXEGearStep('rare',44),null);
  assert.equal(getAXEGearStep('rare',54),45);
  assert.equal(getAXEGearStep('elite',84),null);
  assert.equal(getAXEGearStep('legendary',154),null);
  assert.equal(getAXEGearStep('legendary',155),155);
  assert.equal(Object.hasOwn(getAXEGearRarityWeights(154,{isBoss:true}),'legendary'),false);
  assert.ok(getAXEGearRarityWeights(155).legendary>0);
  assert.equal(AXE_GEAR_TIER_CONFIG.enabled,false);
});
test('catalog has unique templates and all template looks resolve',()=>{
  const ts=listAXEGearTemplates(),ls=listAXEGearLooks(),ids=new Set(ts.map(x=>x.templateId)),looks=new Set(ls.map(x=>x.lookId));
  assert.equal(ids.size,ts.length);assert.equal(looks.size,ls.length);
  assert.ok(ts.every(x=>looks.has(x.lookId)&&x.placeholderArt));
  assert.equal(ts.length,540);assert.equal(ls.length,192);
});
test('gear tier-up checks hero level and configured stone cost',()=>{
  const a=gear('a');
  assert.equal(previewAXEGearTierUp(a,{heroLevel:54}).reason,'HERO_LEVEL_TOO_LOW');
  const p=previewAXEGearTierUp(a,{heroLevel:55});
  assert.equal(p.to,55);assert.equal(p.chance,1);assert.deepEqual(p.cost,{evo_upgrade_stone:1});
  assert.deepEqual(upgradeCost('tier_up',readAXEGearTierRecord(a),{item:a}),p.cost);
});
test('same band shares art; boundary changes only tier-system look',()=>{
  const a=gear('a'), b=previewAXEGearTierUp(a,{heroLevel:155});
  assert.equal(b.lookChanges,false);assert.equal(b.record.lookId,a.lookId);
  const c={...makeAXEGearTemplate('rare','sword',75),instanceId:'c'};
  const d=previewAXEGearTierUp(c,{heroLevel:155});
  assert.equal(d.lookChanges,true);assert.notEqual(d.record.lookId,c.lookId);
});
test('legacy gear keeps identity, existing art and advancement',()=>{
  const a={instanceId:'legacy',templateId:'existing',name:'Existing Sword',rarity:'rare',slot:'weapon',masteryWeaponId:'sword',itemLevel:75,modelKey:'original.glb',iconKey:'original.png',baseStats:{attack:20},rolledStats:{attack:2},advancement:{combine:4}};
  const p=previewAXEGearTierUp(a,{heroLevel:155});
  assert.equal(p.ok,true);assert.equal(p.lookChanges,false);
  const b=applyAXEGearTierRecord(a,p.record);
  assert.equal(b.instanceId,a.instanceId);assert.equal(b.modelKey,a.modelKey);assert.equal(b.iconKey,a.iconKey);assert.equal(b.name,a.name);assert.deepEqual(b.advancement,a.advancement);
  const m=migrateAXEGearTierItem(a);assert.equal(migrateAXEGearTierItem(m),m);
});
test('terminal tiers and hero level parse',()=>{
  const a={...makeAXEGearTemplate('legendary','sword',155),instanceId:'a'};
  assert.equal(a.requiredLevel,150);assert.equal(previewAXEGearTierUp(a,{heroLevel:155}).reason,'MAX_TIER');
  assert.equal(heroLevelOf({'wwm_player_progression_v1':JSON.stringify({level:55})}),55);
  assert.equal(heroLevelOf({}),null);
});
test('actual ledger tier roll and correction preserve item instance',()=>{
  const a=gear('a');const before=readAXEGearTierRecord(a);
  const r=rollUpgrade('tier_up',before,{roll:0,item:a,heroLevel:55});
  assert.equal(r.ok,true);assert.equal(r.after.level,55);
  const s=save([a]),fixed=enforceUpgradeLedger(s,null,[{item_id:'a',service:'tier_up',record:r.after}]);
  assert.equal(findItem(fixed.data,'a').itemLevel,55);
  assert.equal(findItem(fixed.data,'a').instanceId,'a');
  assert.deepEqual(readUpgrade(fixed.data,'tier_up','a'),r.after);
});
