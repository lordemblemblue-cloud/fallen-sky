import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveBlacksmithIngredientIntent,
  isBlacksmithOverEnchantReady,
  blacksmithAttemptMessage,
} from '../src/components/game3d/axe/services/AXEBlacksmithIngredientIntent.mjs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const base='src/components/game3d/axe/services/';
const ui=()=>read(base+'AXEBlacksmithImageWorkspace.jsx');
const flow=()=>read(base+'AXEBlacksmithWorkflowPanel.jsx');

test('Inventory ingredient selects Enchant%, enchantment slots, or Over-Enchant',()=>{
  assert.deepEqual(resolveBlacksmithIngredientIntent('mat_reinforce'),{
    tab:'enchant',enchantMode:'percent',label:'Enchant',
  });
  for(const id of ['mat_essence','mat_crystal','mat_starlight'])
    assert.equal(resolveBlacksmithIngredientIntent(id).enchantMode,'slots',id);
  assert.equal(resolveBlacksmithIngredientIntent('mat_over_enchant').tab,'over_enchant');
  assert.equal(resolveBlacksmithIngredientIntent('mat_protection'),null);
  assert.equal(resolveBlacksmithIngredientIntent('imaginary_combine_stone'),null,
    'Combine consumes a matching owned EQUIPMENT donor instead of a made-up stone');
});

test('Over-Enchant is locked until each item reaches its actual configured enchantment cap',()=>{
  const cap=item=>item.rarity==='mythic'?120:200;
  assert.equal(isBlacksmithOverEnchantReady({instanceId:'a',rarity:'rare'}, {percent:199},cap),false);
  assert.equal(isBlacksmithOverEnchantReady({instanceId:'a',rarity:'rare'}, {percent:200},cap),true);
  assert.equal(isBlacksmithOverEnchantReady({instanceId:'b',rarity:'mythic'}, {percent:120},cap),true);
  assert.equal(isBlacksmithOverEnchantReady({instanceId:'b',rarity:'mythic'}, {percent:119},cap),false);
  assert.equal(isBlacksmithOverEnchantReady(null,{percent:200},cap),false);
});

test('Compact forge shows just two small ingredient squares and a single plus',()=>{
  const source=flow();
  assert.match(source,/data-blacksmith-two-slot="true"/);
  assert.match(source,/className="axe-forge-ingredient-plus"/);
  assert.match(source,/ingredient\('target',target,'Equipment'/);
  assert.match(source,/data-ingredient="materials"/);
  assert.doesNotMatch(source,/axe-forge-flow-result/);
  assert.match(source,/axe-forge-enchant-modes/); // original left enchant selector restored
  assert.doesNotMatch(source,/4 Enchant Slots/);
  const css=read(base+'AXEBlacksmithWorkflowPanel.css');
  assert.match(css,/min-height:62px/);
  assert.match(css,/max-height:70px/);
});

test('Material or matching donor changes active upgrade without automatically paying',()=>{
  const source=ui();
  assert.match(source,/resolveBlacksmithIngredientIntent\(entry.id\)/);
  assert.match(source,/intent.tab === 'over_enchant' && !overReady/);
  assert.match(source,/pickTab\(intent.tab\)/);
  assert.match(source,/setEnchantMode\(intent.enchantMode\)/);
  assert.match(source,/pickTab\('combine'\)/);
  assert.match(source,/setDonorId\(entry.instanceId\)/);
  assert.match(source,/onSelectedItem\?\.\(entry\)/);
  assert.match(source,/selectedMaterialId && Object.hasOwn\(readout\?\.cost \|\| \{\}, selectedMaterialId\)/);
  assert.match(source,/\.filter\(entry => !\['over_enchant', 'combine'\]\.includes\(entry.id\)\)/);
});

test('Result circle and right fading history show REAL attempt outcome, not an equals preview',()=>{
  const workspace=ui();
  const css=read(base+'AXEBlacksmithImageWorkspace.css');
  assert.match(workspace,/className="axe-blacksmith-circle-result"/);
  assert.match(workspace,/className="axe-blacksmith-attempt-feed"/);
  assert.match(workspace,/recordForgeAttempt\(operation, result, summary\)/);
  assert.match(workspace,/recordForgeAttempt\(operation, result, 'Attempt '/);
  assert.match(css,/mask-image:linear-gradient\(to bottom,#000 0%,#000 72%,transparent 100%\)/);
  assert.ok(css.includes('.axe-blacksmith-operation-panel'));
  assert.deepEqual(blacksmithAttemptMessage('reinforcement',{ok:true},'Upgrade complete.').text,'Upgrade complete.');
  assert.equal(blacksmithAttemptMessage('combine',{ok:false,outcome:'failure'}).success,false);
});

test('Auto safety and the Stop button live outside the ingredient box',()=>{
  const source=ui(),panel=flow();
  assert.match(source,/className="axe-blacksmith-feed-safety"/);
  assert.match(source,/className="axe-blacksmith-feed-stop"/);
  assert.doesNotMatch(panel,/Stop Auto after current attempt/);
  assert.doesNotMatch(panel,/Minimum success rate/);
  assert.doesNotMatch(panel,/Use owned Stabilizers at high risk/);
  assert.match(panel,/aria-label="Automatic forge target"/);
});

test('Over-Enchant cannot bypass eligibility through device gateway or server endpoint',()=>{
  const gateway=read(base+'AXEServiceTransactionGateway.js');
  const server=read('base44/functions/itemUpgrade/entry.ts');
  assert.match(gateway,/const required = getAXEReinforcementCap\(item\)/);
  assert.match(gateway,/reason:'ENCHANT_CAP_REQUIRED'/);
  assert.match(server,/rowOf\(itemId, 'reinforcement'\)\?\.record/);
  assert.match(server,/readUpgrade\(known, 'reinforcement', itemId\)/);
  assert.match(server,/reason:'ENCHANT_CAP_REQUIRED'/);
});
