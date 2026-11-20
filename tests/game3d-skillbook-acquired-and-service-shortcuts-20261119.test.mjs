import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME3D_MENU_HOTKEYS, getGame3DMenuShortcut, resolveGame3DMenuToggle } from
  '../src/components/game3d/axe/services/game3dMenuHotkeys.mjs';
import { buildAcquiredSkillEntries } from
  '../src/components/game3d/axe/services/AXEAcquiredSkillsModel.mjs';
import { createAXEServiceModeController } from
  '../src/components/game3d/axe/services/AXEServiceModeController.js';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const serviceKeys = Object.entries(GAME3D_MENU_HOTKEYS).filter(([, destination]) => destination !== 'map');

test('every Services hotkey, including both aliases for Character, toggles closed', () => {
  for (const [key, destination] of serviceKeys) {
    const canonical = destination === 'appearance' ? 'character' : destination;
    assert.deepEqual(resolveGame3DMenuToggle(destination, { groupId: null }),
      { action: 'open', groupId: canonical }, key);
    assert.deepEqual(resolveGame3DMenuToggle(destination, { groupId: canonical }),
      { action: 'close', groupId: canonical }, key);
    assert.deepEqual(resolveGame3DMenuToggle(destination, { groupId: 'other' }),
      { action: 'open', groupId: canonical }, key);
  }
});

test('Map remains a separate open/close toggle; modifiers and typing are ignored', () => {
  assert.deepEqual(resolveGame3DMenuToggle('map', {mapOpen:true}),
    {action:'close',groupId:null});
  assert.deepEqual(resolveGame3DMenuToggle('map', {mapOpen:false}),
    {action:'open',groupId:null});
  for (const [code, destination] of Object.entries(GAME3D_MENU_HOTKEYS)) {
    const event = { code, repeat:false, defaultPrevented:false, ctrlKey:false, altKey:false,
      metaKey:false, shiftKey:false, isComposing:false, target:{closest:()=>null} };
    assert.equal(getGame3DMenuShortcut(event), destination);
    assert.equal(getGame3DMenuShortcut({...event,repeat:true}), null);
    assert.equal(getGame3DMenuShortcut({...event,shiftKey:true}), null);
    assert.equal(getGame3DMenuShortcut({...event,target:{closest:()=>({})}}), null);
  }
});

function createController(options={}) {
  return createAXEServiceModeController({
    summon: async () => ({ok:false,reason:'NO_STATION'}),
    enter: async () => ({ok:false,reason:'NO_STATION'}),
    leave: () => {},
    ...options,
  });
}

test('closing ANY service restores a collapsed Services button, even from an expanded menu', async () => {
  for (const [, destination] of serviceKeys) {
    const canonical = destination === 'appearance' ? 'character' : destination;
    const controller=createController();
    controller.toggle();
    assert.equal(controller.getSnapshot().expanded,true);
    await controller.open(canonical);
    assert.equal(controller.getSnapshot().groupId,canonical);
    controller.close();
    assert.equal(controller.getSnapshot().groupId,null);
    assert.equal(controller.getSnapshot().expanded,false);
    assert.equal(controller.getSnapshot().phase,'closed');
    controller.dispose();
  }
});

test('clicking Services while a page is active closes the page and subpage strip', async () => {
  const controller=createController();
  await controller.open('skills');
  assert.equal(controller.getSnapshot().expanded,true);
  controller.toggle();
  assert.deepEqual({
    expanded:controller.getSnapshot().expanded,group:controller.getSnapshot().groupId,
  },{expanded:false,group:null});
  controller.dispose();
});

test('a stale async station response cannot reopen Services after a shortcut closes it', async () => {
  let completeSummon;
  const controller=createController({summon:()=>new Promise(resolve=>{completeSummon=resolve;})});
  const opening=controller.open('blacksmith');
  assert.equal(controller.getSnapshot().expanded,true);
  controller.close();
  completeSummon({ok:true,station:{id:'old',groupId:'blacksmith'}});
  await opening;
  assert.equal(controller.getSnapshot().groupId,null);
  assert.equal(controller.getSnapshot().expanded,false);
  controller.dispose();
});

test('acquired roster reflects only awarded abilities and collected skill drops', () => {
  const options={
    lootDefinitions:[{id:'skill_flame_cleave',category:'skill',name:'Flame Cleave',icon:'🔥'},
      {id:'mat_essence',category:'material',name:'Essence'}],
    abilities:[{id:'shadow_teleport',name:'Shadow Teleport',icon:'🌀'}],
    registry:[{skill_id:'sword_heavy_strike',skill_name:'Heavy Strike'}],
  };
  const before=buildAcquiredSkillEntries(options);
  assert.deepEqual(before,[]); // catalog availability never implies ownership

  const collected=buildAcquiredSkillEntries({
    ...options,inventory:{skill:[{id:'skill_flame_cleave',name:'Flame Cleave',
      category:'skill',collectedAt:100}],material:[{id:'mat_essence',category:'material'}]},
    storedItems:[{id:'skill_flame_cleave',category:'skill',collectedAt:200}],
  });
  assert.equal(collected.length,1);
  assert.deepEqual([collected[0].learned,collected[0].collectedCount],[false,2]);

  const afterQuest=buildAcquiredSkillEntries({
    ...options,learnedIds:new Set(['shadow_teleport']),
    inventory:{skill:[{id:'skill_flame_cleave',category:'skill',name:'Flame Cleave'}]},
  });
  assert.equal(afterQuest.find(s=>s.id==='shadow_teleport').learned,true);
  assert.equal(afterQuest.find(s=>s.id==='skill_flame_cleave').learned,false);

  const afterLearning=buildAcquiredSkillEntries({
    ...options,learnedIds:new Set(['shadow_teleport','skill_flame_cleave']),
  });
  assert.equal(afterLearning.length,2);
  assert.ok(afterLearning.every(s=>s.learned));
});

test('Skill Book listens to loot, vault and learned ownership in BOTH layouts',()=>{
  const panel=read('src/components/game3d/axe/services/AXEAcquiredSkillsPanel.jsx');
  assert.match(panel,/subscribeLearnedSkills\(refresh\)/);
  assert.match(panel,/subscribeLootInventory\(refresh\)/);
  assert.match(panel,/subscribeGame3DStorage\(refresh\)/);
  for (const path of ['src/components/game3d/axe/services/AXESkillBookRedesign.jsx',
    'src/components/game3d/axe/services/AXECloneSkillTreeWorkspace.jsx']) {
    assert.match(read(path),/<AXEAcquiredSkillsPanel \/>/);
  }
  assert.match(read('src/components/game3d/questRewards.jsx'),/grantLearnedSkillId\(unlock\.id\)/);
});
