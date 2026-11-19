import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  AXE_TEST_WEAPON_FIELDS, AXE_TEST_WEAPON_ZERO,
  isAXETestWeaponTunerEnabled, normalizeAXETestWeaponTuning,
  projectAXETestWeaponRecords,
} from '../src/components/game3d/axe/equipment/AXETestWeaponTuner.mjs';
import {computeAXEItemStatBreakdown,axeBreakdownAttack} from
  '../src/components/game3d/axe/equipment/AXEItemStatBreakdown.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const env={
  VITE_AXE_GAME3D_PREVIEW_MAX:'true',
  VITE_AXE_GAME3D_SERVER_ENV:'test',
  VITE_AXE_GAME3D_PREVIEW_HOST:'testing.example.com',
  DEV:false,
};
const item={instanceId:'test-weapon-1',slot:'weapon',category:'weapon',
  name:'Test Sword',rarity:'rare',baseStats:{attack:1000,critChance:8}};
const real=()=>({
  reinforcement:{percent:20},enchantments:[1,2,3,4],
  overEnchant:{level:2},advancement:{
    combine:{count:1},stage:{rank:1},refine:{level:2},ultimate:{level:0},
  },
  legacyDamageMultiplier:1,
});
const all=p=>Object.fromEntries(AXE_TEST_WEAPON_FIELDS.map(key=>[key,p]));

test('test weapon tuner cannot be enabled on the production hostname or environment',()=>{
  assert.equal(isAXETestWeaponTunerEnabled({hostname:'testing.example.com',env}),true);
  assert.equal(isAXETestWeaponTunerEnabled({hostname:'game.example.com',env}),false);
  assert.equal(isAXETestWeaponTunerEnabled({hostname:'testing.example.com',
    env:{...env,VITE_AXE_GAME3D_SERVER_ENV:'production'}}),false);
  assert.equal(isAXETestWeaponTunerEnabled({hostname:'testing.example.com',
    env:{...env,VITE_AXE_GAME3D_PREVIEW_MAX:'false'}}),false);
  assert.equal(isAXETestWeaponTunerEnabled({hostname:'localhost',env}),false);
});

test('all seven percentage bars clamp to 0..100 and reject bad input',()=>{
  assert.equal(AXE_TEST_WEAPON_FIELDS.length,7);
  assert.deepEqual(normalizeAXETestWeaponTuning({reinforcement:999,combine:-19,slots:'bad'}),
    {...AXE_TEST_WEAPON_ZERO,reinforcement:100});
  assert.deepEqual(normalizeAXETestWeaponTuning(all(100)),all(100));
});

test('100 percent reaches each canonical maximum without rewriting permanent records',()=>{
  const before=real();
  const snapshot=structuredClone(before);
  const projected=projectAXETestWeaponRecords(item,before,all(100));
  assert.equal(projected.reinforcement.percent,200);
  assert.deepEqual(projected.enchantments,[10,10,10,10]);
  assert.equal(projected.overEnchant.level,10);
  assert.equal(projected.advancement.combine.count,12);
  assert.equal(projected.advancement.stage.rank,4);
  assert.equal(projected.advancement.refine.level,15);
  assert.equal(projected.advancement.ultimate.level,0,'Rare cannot use Legendary Ultimate');
  assert.deepEqual(before,snapshot,'simulation cannot mutate owned records');
  assert.ok(axeBreakdownAttack(computeAXEItemStatBreakdown(item,projected)) >
    axeBreakdownAttack(computeAXEItemStatBreakdown(item,before)));
});

test('partial 50 percent independently interpolates each progression record',()=>{
  const output=projectAXETestWeaponRecords(item,real(),
    {...AXE_TEST_WEAPON_ZERO,reinforcement:50,combine:50});
  assert.equal(output.reinforcement.percent,110);
  assert.equal(output.advancement.combine.count,7);
  assert.deepEqual(output.enchantments,[1,2,3,4]);
  assert.equal(output.advancement.stage.rank,1);
});

test('invalid rarity and non-weapons cannot gain restricted paths',()=>{
  const common={...item,rarity:'common'};
  const projected=projectAXETestWeaponRecords(common,real(),all(100));
  assert.equal(projected.advancement.stage.rank,1);
  assert.equal(projected.advancement.ultimate.level,0);
  const legendary=projectAXETestWeaponRecords({...item,rarity:'legendary'},real(),all(100));
  assert.equal(legendary.advancement.stage.rank,4);
  assert.equal(legendary.advancement.ultimate.level,10);
  const helmet={...item,slot:'helm',category:'armor'};
  const original=real();
  assert.equal(projectAXETestWeaponRecords(helmet,original,all(100)),original);
});

test('zero percent is the real weapon record and its original attack',()=>{
  const before=real(),after=projectAXETestWeaponRecords(item,before,all(0));
  assert.equal(axeBreakdownAttack(computeAXEItemStatBreakdown(item,after)),
    axeBreakdownAttack(computeAXEItemStatBreakdown(item,before)));
});

test('Blacksmith and derived combat use one test projection; saves are guarded',()=>{
  const runtime=read('src/components/game3d/axe/equipment/AXEEquipmentRuntimeStats.js');
  const hud=read('src/components/game3d/playerHUDStore.jsx');
  const forge=read('src/components/game3d/axe/services/AXEBlacksmithImageWorkspace.jsx');
  const tuner=read('src/components/game3d/axe/equipment/AXETestWeaponTuner.mjs');
  assert.match(runtime,/getAXETestWeaponTuning\(itemId\)/);
  assert.match(runtime,/projectAXETestWeaponRecords\(item, records, tune\)/);
  assert.match(hud,/isAnyPreviewMaxActive\(\) \|\| hasAXETestWeaponTuning\(\)/);
  assert.match(hud,/subscribeAXETestWeaponTuning\(recomputeFromBonuses\)/);
  assert.match(forge,/<AXETestWeaponTuner item=\{selectedItem\} \/>/);
  assert.match(tuner,/subscribeCharacterChange\(\(\) => clearAXETestWeaponTuning\(\)\)/);
  assert.doesNotMatch(tuner,/localStorage|functions\.invoke|setAXEAdvancementRecord|setItemReinforcement|fetch\(/);
});
