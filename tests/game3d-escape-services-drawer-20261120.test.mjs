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
test('Launcher owns Services and Ranked; settings shows only option categories',()=>{
  const ids=GAME3D_PAUSE_SECTIONS.map(section=>section.id);
  for(const id of ['services','scoreboard','audio','controls','graphics','ui','community'])
    assert.ok(ids.includes(id),id);
  const pause=read('src/components/game3d/PauseMenu.jsx');
  assert.match(pause,/!\['overview','session','services','scoreboard'\]\.includes\(section\.id\)/);
  assert.match(pause,/axe3d-pause__launcher-page-grid/);
  assert.match(pause,/onOpenService\?\.\(group\.id,serviceId\)/);
  assert.match(pause,/presence\.count/);
  assert.match(pause,/if \(!entry && !confirmAction\) \{ onClose\(\); return; \}/);
  assert.doesNotMatch(pause,/className="axe3d-pause__settings-back"/);
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

test('Services and Faction are real accessible tiles with no redundant settings back button',()=>{
  const pause=read('src/components/game3d/PauseMenu.jsx');
  for(const key of ["id:'character'","id:'skills'","id:'quest_logbook'","id:'companion'","id:'spiritual'","id:'blacksmith'","id:'faction'"])
    assert.ok(pause.includes(key),key);
  assert.match(pause,/QUICK_SERVICE_TILES\.map/);
  assert.match(pause,/setLauncherGroup\(previous=>previous===tile\.id\?null:tile\.id\)/);
  assert.match(pause,/aria-label="Open game settings" title="Settings" onClick=\{openSettings\}/);
  assert.match(pause,/const openSettings=\(\)=>\{selectView\('graphics'\);setSurface\('settings'\);setLauncherGroup\(null\);\}/);
  assert.doesNotMatch(pause,/className="axe3d-pause__settings-back"/);
  assert.match(pause,/onClick=\{openScoreboard\}/);
  const footer=pause.slice(pause.indexOf('<footer className="axe3d-pause__launcher-footer">'),pause.indexOf('</footer>',pause.indexOf('<footer className="axe3d-pause__launcher-footer">')));
  assert.match(footer,/aria-label="Open ranked"/);
  assert.match(footer,/aria-label="Character logout" onClick=\{openCharacterLogout\}/);
  assert.doesNotMatch(footer,/onOpenMap|<span>Map<\/span>/);
  assert.match(pause,/const openCharacterLogout=\(\)=>\{selectView\('session'\);setSurface\('settings'\);setConfirmAction\('character'\);\}/);
  assert.match(pause,/typeof onReturnToCharacterSelect==='function'\)onReturnToCharacterSelect\(\)/);
  assert.equal(GAME3D_PAUSE_SECTIONS.find(s=>s.id==='scoreboard').label,'Ranked');
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

test('Service subpages are mobile-size tiles on demand rather than a stacked accordion',()=>{
  const pause=read('src/components/game3d/PauseMenu.jsx');
  const gold=read('src/components/game3d/PauseMenuGold.css');
  const appearance=read('src/components/game3d/axe/services/AXEAppearanceWorkspace.jsx');
  assert.match(pause,/label:'Spirituality',hotkey:'J'/);
  assert.match(pause,/AXE_SERVICE_GROUPS\.find\(item=>item\.id===launcherGroup\)/);
  assert.match(pause,/group\.visibleServiceIds\|\|group\.serviceIds/);
  assert.match(pause,/className="axe3d-pause__launcher-page-grid"/);
  assert.doesNotMatch(pause,/<details className="axe3d-pause__launcher-subpage-group"/);
  assert.match(pause,/onOpenService\?\.\(group\.id,serviceId\)/);
  assert.match(pause,/getAXEService\(serviceId\)\?\.label/);
  assert.match(gold,/\.axe3d-pause__launcher-page-grid button/);
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


test('approved celestial selection and clean artwork remain connected to the live entry screen',()=>{
  const entry=read('src/components/game3d/CharacterLoginScreen.jsx');
  const theme=read('src/components/game3d/CharacterCelestialSelection.css');
  const backdrop=read('src/components/game3d/CharacterLiquidGlassEntry.css');
  const game=read('src/pages/GameView.jsx');
  assert.match(entry,/import '\.\/CharacterCelestialSelection\.css'/);
  assert.match(entry,/data-selection-theme=\{step==='select'\?'celestial-v2':undefined\}/);
  assert.match(entry,/axe-celestial-medallion/);
  assert.match(theme,/\.axe-login-xross-roster\s*\{\s*left:3%;right:auto;/);
  assert.match(theme,/\.axe-login-stats-panel\.axe-login-info-rail\s*\{\s*left:auto;right:3%;/);
  assert.match(backdrop,/6441dedadbf552e1a9782302a29003db/);
  assert.doesNotMatch(backdrop,/09be16905_game3d_celestial_scene_backdrop/);
  assert.match(game,/import '\.\.\/components\/game3d\/hud\/FallenSkyCelestialWorld\.css'/);
});
