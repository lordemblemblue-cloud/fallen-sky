import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME3D_PAUSE_SECTIONS } from '../src/components/game3d/game3dPauseMenuModel.mjs';
import { getGame3DMenuShortcut, resolveGame3DMenuToggle } from
  '../src/components/game3d/axe/services/game3dMenuHotkeys.mjs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('C opens Character directly and closes it immediately from every subpage',()=>{
  assert.deepEqual(resolveGame3DMenuToggle('character',{groupId:'skills'}),
    {action:'open',groupId:'character'});
  for(const characterTab of ['Equipment','Vanity','Aura']){
    assert.deepEqual(resolveGame3DMenuToggle('character',{groupId:'character',characterTab}),
      {action:'close',groupId:'character'});
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
test('Services/subpages appear only while an active workspace is open, and Escape clears overlays',()=>{
  const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
  const game=read('src/pages/GameView.jsx');
  assert.match(hud,/showServicesNavigation = false/);
  assert.match(hud,/showServicesNavigation && <AXEServicesNavigation/);
  assert.match(game,/showServicesNavigation=\{services\.active\}/);
  assert.match(game,/onToggleServices=\{\(\) => services\.controller\.toggle\(\)\}/);
  assert.doesNotMatch(game,/toggle\.action === 'focus'/);
  assert.match(game,/The second C closes Character from ANY of its subpages/);
  assert.match(game,/onOpenService=\{\(groupId, serviceId = null\) =>/);
  assert.match(game,/void services\.controller\.open\(groupId, serviceId \? \{ serviceId \} : \{\}\)/);
  assert.match(game,/services\.controller\.close\(\);\s*setPauseMenuOpen\(\(v\) => !v\)/);
  const workspace=read('src/components/game3d/axe/services/AXEServiceWorkspace.jsx');
  assert.match(workspace,/event\.key === 'Escape'\) \{ event\.preventDefault\(\); onClose\(\); \}/);
  const style=read('src/components/game3d/PauseMenu.css');
  assert.match(style,/\[data-context="world"\] \.axe3d-pause__panel/);
  assert.match(style,/justify-content:flex-end/);
});

test('Escape initially shows a compact square-tile launcher, not the full settings navigation',()=>{
  const pause=read('src/components/game3d/PauseMenu.jsx');
  const style=read('src/components/game3d/PauseMenu.css');
  assert.match(pause,/const \[surface,setSurface\]=useState\(context==='entry'\?'settings':'launcher'\)/);
  assert.match(pause,/const launcher=!entry&&surface==='launcher'/);
  assert.match(pause,/\{launcher \? <motion\.section/);
  assert.match(pause,/className="axe3d-pause__launcher-grid"/);
  assert.match(style,/\.axe3d-pause__launcher-tile\{/);
  assert.match(style,/aspect-ratio:1\/1/);
  assert.match(style,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(pause,/data-menu-surface=\{launcher\?'launcher':'settings'\}/);
});

test('Each service is a real clickable tile; gear alone shows existing Settings',()=>{
  const pause=read('src/components/game3d/PauseMenu.jsx');
  for(const key of ["id:'character'","id:'skills'","id:'quest_logbook'","id:'companion'","id:'spiritual'","id:'blacksmith'"])
    assert.ok(pause.includes(key),key);
  assert.match(pause,/QUICK_SERVICE_TILES\.filter\(tile=>AXE_SERVICE_GROUPS\.some/);
  assert.match(pause,/onClick=\{\(\)=>onOpenService\?\.\(tile\.id\)\}/);
  assert.match(pause,/aria-label="Open game settings" title="Settings" onClick=\{openSettings\}/);
  assert.match(pause,/const openSettings=\(\)=>\{selectView\('graphics'\);setSurface\('settings'\);\}/);
  assert.match(pause,/className="axe3d-pause__settings-back"/);
  assert.match(pause,/onClick=\{\(\)=>setSurface\('launcher'\)\}/);
  assert.match(pause,/onClick=\{openScoreboard\}/);
  assert.match(pause,/onClick=\{\(\)=>onOpenMap\?\.\(\)\}/);
});

test('Letter hotkeys work even while launcher is open, and input remains guarded',()=>{
  const pause=read('src/components/game3d/PauseMenu.jsx');
  const game=read('src/pages/GameView.jsx');
  assert.match(pause,/getGame3DMenuShortcut\(event\)/);
  assert.match(pause,/onOpenService\?\.\(destination==='appearance'\?'character':destination\)/);
  assert.match(pause,/if\(destination==='map'\)onOpenMap\?\.\(\)/);
  assert.match(game,/onOpenMap=\{\(\) => \{/);
  assert.match(game,/window\.dispatchEvent\(new CustomEvent\('axeOpenWorldMap'/);
  assert.match(pause,/event\.key!=='Escape'\|\|event\.repeat/);
});

test('Escape launcher shows every real Service group and exposes its registered subpages',()=>{
  const pause=read('src/components/game3d/PauseMenu.jsx');
  const css=read('src/components/game3d/PauseMenu.css');
  const appearance=read('src/components/game3d/axe/services/AXEAppearanceWorkspace.jsx');
  assert.match(pause,/label:'Spirituality',hotkey:'J'/);
  assert.match(pause,/className="axe3d-pause__launcher-subpages" aria-label="All service subpages"/);
  assert.match(pause,/AXE_SERVICE_GROUPS\.map\(group=>\{/);
  assert.match(pause,/group\.visibleServiceIds \|\| group\.serviceIds/);
  assert.match(pause,/<details className="axe3d-pause__launcher-subpage-group" key=\{group\.id\}>/);
  assert.match(pause,/onOpenService\?\.\(group\.id,serviceId\)/);
  assert.match(pause,/getAXEService\(serviceId\)\?\.label/);
  assert.match(css,/\.axe3d-pause__launcher-subpage-buttons/);
  // A direct Cape choice must open Cape content, not silently return to Character.
  assert.match(appearance,/serviceId === 'cape' \? 'Vanity' : 'Character'/);
  assert.match(appearance,/setDetail\(serviceId === 'cape' \? 'cape' : ''\)/);
});

test('C/K/Escape close both the active workspace and the expanded Services row',()=>{
  const game=read('src/pages/GameView.jsx');
  const controller=read('src/components/game3d/axe/services/AXEServiceModeController.js');
  const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
  assert.match(game,/if \(toggle\.action === 'close'\) services\.controller\.close\(\)/);
  assert.match(game,/The second C closes Character from ANY of its subpages/);
  assert.match(game,/if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); services\.controller\.close\(\); \}/);
  assert.match(controller,/publish\(\{ \.\.\.initial\(\), message \}\)/);
  assert.match(hud,/\{showServicesNavigation && <AXEServicesNavigation/);
});
