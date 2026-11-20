import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME3D_PAUSE_SECTIONS } from '../src/components/game3d/game3dPauseMenuModel.mjs';
import { getGame3DMenuShortcut, resolveGame3DMenuToggle } from
  '../src/components/game3d/axe/services/game3dMenuHotkeys.mjs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('C opens Character directly; C from other Character tabs first focuses Character',()=>{
  assert.deepEqual(resolveGame3DMenuToggle('character',{groupId:'skills'}),
    {action:'open',groupId:'character'});
  for(const characterTab of ['Equipment','Vanity','Aura']){
    assert.deepEqual(resolveGame3DMenuToggle('character',{groupId:'character',characterTab}),
      {action:'focus',groupId:'character'});
  }
  assert.deepEqual(resolveGame3DMenuToggle('character',{groupId:'character',characterTab:'Character'}),
    {action:'close',groupId:'character'});
});
test('K toggles Skill Book and switches from Character',()=>{
  assert.deepEqual(resolveGame3DMenuToggle('skills',{groupId:'character'}),
    {action:'open',groupId:'skills'});
  assert.deepEqual(resolveGame3DMenuToggle('skills',{groupId:'skills'}),
    {action:'close',groupId:'skills'});
  assert.equal(getGame3DMenuShortcut({code:'KeyC',target:{closest:()=>null}}),'character');
  assert.equal(getGame3DMenuShortcut({code:'KeyK',target:{closest:()=>null}}),'skills');
});
test('Escape sections now offer Services and Scoreboard, while retaining Settings pages',()=>{
  const ids = GAME3D_PAUSE_SECTIONS.map(section=>section.id);
  for(const id of ['services','scoreboard','audio','controls','graphics','ui','community','session'])
    assert.ok(ids.includes(id),id);
  const pause=read('src/components/game3d/PauseMenu.jsx');
  assert.match(pause,/\['session','services','scoreboard'\]\.includes\(section\.id\)/);
  assert.match(pause,/AXE_SERVICE_GROUPS\.filter\(group=>group\.id!=='character'\)/);
  assert.match(pause,/onOpenService\?\.\(group\.id\)/);
  assert.match(pause,/presence\.count/);
  assert.match(pause,/if \(!entry && !confirmAction\) \{ onClose\(\); return; \}/);
  assert.match(pause,/onClick=\{\(\)=>selectView\('graphics'\)\}/);
});
test('HUD never draws Services button in Game 3D, and Escape launch clears overlays',()=>{
  const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
  const game=read('src/pages/GameView.jsx');
  assert.match(hud,/showServicesNavigation = false/);
  assert.match(hud,/showServicesNavigation && <AXEServicesNavigation/);
  assert.match(game,/showServicesNavigation=\{false\}/);
  assert.match(game,/characterTab: activeCharacterSubview/);
  assert.match(game,/toggle\.action === 'focus'/);
  assert.match(game,/setFocusCharacterRequest\(value => value \+ 1\)/);
  assert.match(game,/onOpenService=\{groupId =>/);
  assert.match(game,/void services\.controller\.open\(groupId\)/);
  assert.match(game,/services\.controller\.close\(\);\s*setPauseMenuOpen\(\(v\) => !v\)/);
  const workspace=read('src/components/game3d/axe/services/AXEServiceWorkspace.jsx');
  assert.match(workspace,/event\.key === 'Escape'\) \{ event\.preventDefault\(\); onClose\(\); \}/);
  const style=read('src/components/game3d/PauseMenu.css');
  assert.match(style,/\[data-context="world"\] \.axe3d-pause__panel/);
  assert.match(style,/justify-content:flex-end/);
});
