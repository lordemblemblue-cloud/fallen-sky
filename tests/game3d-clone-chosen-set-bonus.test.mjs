import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AXE_CHOSEN_SET_ID,
  getAXEChosenSetStatus,
  applyAXEChosenSetToDerived,
} from '../src/components/game3d/axe/equipment/AXEChosenSetRules.mjs';

const slots=['helm','chest','gloves','legs','boots','cape'];
const completeSet=(rank=0)=>slots.map((slot,i)=>({
  instanceId:'chosen_'+slot+'_'+i,
  slot,rarity:'chosen',setId:AXE_CHOSEN_SET_ID,equipped:true,
  advancement:{stage:{rank}},
}));

test('Chosen cannot be awarded by a rare, mythic or pending evolution candidate',()=>{
  assert.equal(getAXEChosenSetStatus([]).bonusPct,0);
  assert.equal(getAXEChosenSetStatus(completeSet().map(i=>({...i,rarity:'mythic'}))).bonusPct,0);
  assert.equal(getAXEChosenSetStatus(completeSet().map(i=>({...i,setId:'AXE_Set_Skyrend'}))).bonusPct,0);
  assert.equal(getAXEChosenSetStatus(completeSet().map(i=>({...i,evolutionPath:'mythic_chosen',rarity:'mythic'}))).bonusPct,0);
});

test('six different worn Chosen armor slots are needed for a 100% all-core-stat set bonus',()=>{
  const set=completeSet();
  assert.equal(getAXEChosenSetStatus(set.slice(0,5)).bonusPct,0);
  assert.equal(getAXEChosenSetStatus([...set.slice(0,5),set[0]]).bonusPct,0);
  const worn=getAXEChosenSetStatus(set);
  assert.equal(worn.bonusPct,100);
  assert.equal(worn.equippedPieces,6);
  assert.deepEqual(worn.missingSlots,[]);
  assert.equal(getAXEChosenSetStatus(set.map((p,i)=>i===5?{...p,equipped:false}:p)).bonusPct,0);
});

test('200% boost requires six authentic Stage +4 records, not a level tag or five upgraded items',()=>{
  const almost=completeSet(4);
  almost[5]={...almost[5],advancement:{stage:{rank:3}}};
  assert.equal(getAXEChosenSetStatus(almost).bonusPct,100);
  assert.equal(getAXEChosenSetStatus(completeSet(4)).bonusPct,200);
  assert.equal(getAXEChosenSetStatus(completeSet(0).map(p=>({...p,ascensionRank:4}))).bonusPct,100);
  assert.equal(getAXEChosenSetStatus(completeSet(4).map((p,i)=>i===1?{...p,advancement:null}:p)).bonusPct,100);
});

test('Chosen doubles or triples core stats exactly once without mutating the source',()=>{
  const base={
    damage:100,totalDamage:100,physicalDamage:90,
    defense:75,maxHP:1000,chi:300,attackSuccess:25,attackBlock:20,
    critChance:25,criticalDamage:0.4,criticalDefense:0.25,evasionPct:30,
    effective:{strength:20,dexterity:15,constitution:30,focus:10},
  };
  const normal=applyAXEChosenSetToDerived(base,0);
  assert.strictEqual(normal,base,'incomplete set does not allocate/modify stats');
  const doubled=applyAXEChosenSetToDerived(base,100);
  assert.equal(doubled.damage,200);
  assert.equal(doubled.maxHP,2000);
  assert.equal(doubled.effective.strength,40);
  assert.equal(doubled.chosenSet.factor,2);
  const tripled=applyAXEChosenSetToDerived(base,200);
  assert.equal(tripled.damage,300);
  assert.equal(tripled.defense,225);
  assert.equal(tripled.maxHP,3000);
  assert.equal(tripled.effective.constitution,90);
  assert.equal(tripled.chosenSet.factor,3);
  assert.equal(base.damage,100);
  assert.equal(base.effective.strength,20);
});

test('critical/evasion/speed rates respect existing caps even on full +4 Chosen',()=>{
  const result=applyAXEChosenSetToDerived({
    critChance:48,criticalDamage:0.9,criticalDefense:0.5,
    evasionPct:65,attackSpeedPct:35,
  },200);
  assert.equal(result.critChance,50);
  assert.equal(result.criticalDamage,1);
  assert.equal(result.criticalDefense,0.6);
  assert.equal(result.evasionPct,70);
  assert.equal(result.attackSpeedPct,40);
});

test('runtime and Appearance consult character-scoped item Advancement store',()=>{
  const runtime=fs.readFileSync('src/components/game3d/axe/equipment/AXEEquipmentRuntimeStats.js','utf8');
  const hud=fs.readFileSync('src/components/game3d/playerHUDStore.jsx','utf8');
  const pane=fs.readFileSync('src/components/game3d/axe/services/AXEGlassLoadoutPane.jsx','utf8');
  const sets=fs.readFileSync('src/components/game3d/axe/equipment/AXESetBonusSystem.js','utf8');
  assert.match(runtime,/const sets = evaluateAXESetBonuses\(liveItems\);/);
  assert.match(runtime,/out\.chosenSet = sets\.chosen/);
  assert.match(hud,/applyAXEChosenSetToDerived\(withBuild, bonuses\.chosenSet\?\.bonusPct\)/);
  assert.match(pane,/subscribeAXEItemAdvancement/);
  assert.match(pane,/getAXEAdvancementState\(item\.instanceId\)/);
  assert.match(sets,/getAXEChosenSetStatus\(items\)/);
});
