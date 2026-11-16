import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AXE_COMPANION_PLAYER_XP_SHARE,splitAXECompanionPlayerXP}
  from '../src/components/game3d/axe/progression/AXEMountSharedXP.mjs';

const read=name=>readFileSync('src/components/game3d/'+name,'utf8');

test('active companion gets 50% of actual player XP, including larger enemy rewards',()=>{
  assert.equal(AXE_COMPANION_PLAYER_XP_SHARE,0.5);
  assert.deepEqual(splitAXECompanionPlayerXP(100),{xp:50,remainder:0});
  assert.deepEqual(splitAXECompanionPlayerXP(250),{xp:125,remainder:0});
  assert.deepEqual(splitAXECompanionPlayerXP(16),{xp:8,remainder:0});
  assert.deepEqual(splitAXECompanionPlayerXP(0),{xp:0,remainder:0});
});

test('odd XP earns the exact half rate across multiple fights instead of losing fractions',()=>{
  const first=splitAXECompanionPlayerXP(9);
  const second=splitAXECompanionPlayerXP(11,first.remainder);
  const third=splitAXECompanionPlayerXP(1,second.remainder);
  const fourth=splitAXECompanionPlayerXP(1,third.remainder);
  assert.deepEqual(first,{xp:4,remainder:0.5});
  assert.deepEqual(second,{xp:6,remainder:0});
  assert.deepEqual(third,{xp:0,remainder:0.5});
  assert.deepEqual(fourth,{xp:1,remainder:0});
});

test('player HUD is sole source of half-XP sharing; actual rested bonus and quests are included',()=>{
  const hud=read('playerHUDStore.jsx');
  const world=read('GameWorld3D.jsx');
  const store=read('axe/progression/AXEMountStore.js');
  const system=read('axe/progression/AXEMountSystem.js');
  const insights=read('axe/services/AXECompanionInsights.jsx');
  assert.match(hud,/awardActiveAXEMountSharedXP\(actualAwardedXP/);
  assert.match(hud,/Number\(xpGained\)\|\|0\)\+Math.max\(0,Number\(restedBonus\)\|\|0\)/);
  assert.match(hud,/xpSource = 'combat'/);
  assert.match(world,/xpSource: 'quest'/);
  assert.match(store,/export function awardActiveAXEMountSharedXP/);
  assert.match(store,/state\.activeMountId/);
  assert.match(store,/splitAXECompanionPlayerXP\(playerAmount,mount\.xpCarry\)/);
  assert.match(store,/context\.sharedRemainder/);
  assert.match(store,/creditedSource=source==='quest'\?'quest':'pve'/);
  assert.match(system,/questXp/);
  assert.match(system,/xpCarry/);
  assert.match(insights,/\['Quest Rewards','questXp',Sparkles\]/);
  // Quest rewards contribute XP but must not train the combat-only mastery ranks.
  assert.match(store,/source==='pve'\|\|source==='pvp'/);
});

test('Companions header is inline, underlined and hides its search hint on focus',()=>{
  const workspace=read('axe/services/AXECompanionWorkspace.jsx');
  const equipment=read('axe/services/AXEGlassLoadoutPane.jsx');
  const css=read('axe/services/AXEGlassLoadoutPane.css');
  assert.match(workspace,/const TABS=\['Equipment','Mastery','Vanity','Imbuement'\]/);
  assert.doesNotMatch(workspace,/EQUIPMENT_VIEWS|axe-comp-equipment-subnav/);
  assert.match(equipment,/<strong>Companions<\/strong>/);
  assert.match(equipment,/className="axe-comp-roster-search"/);
  assert.match(equipment,/placeholder=\{rosterFocused\?'':'Search companion'\}/);
  assert.match(equipment,/onFocus=\{\(\)=>setRosterFocused\(true\)\}/);
  assert.match(equipment,/onBlur=\{\(\)=>setRosterFocused\(false\)\}/);
  assert.match(equipment,/filteredMounts\.map/);
  assert.match(css,/\.axe-comp-roster-title \.axe-comp-roster-search/);
  assert.match(css,/border-bottom:2px solid #ffe3af/);
});
