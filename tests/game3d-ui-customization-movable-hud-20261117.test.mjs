import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GAME3D_HUD_CUSTOMIZATION_KEY,GAME3D_HUD_CUSTOMIZATION_EVENT,
  GAME3D_HUD_LAYOUTS,GAME3D_HUD_WIDGETS,
  defaultGame3DHudCustomization,normalizeGame3DHudCustomization,
  readGame3DHudCustomization,saveGame3DHudCustomization,
  changeGame3DHudWidget,resetGame3DHudWidget,changeGame3DHudLayout,
  clampHudRectTranslation,
} from '../src/components/game3d/hud/Game3DHudCustomization.mjs';
import {GAME3D_PAUSE_SECTIONS,game3dPauseEscape}
  from '../src/components/game3d/game3dPauseMenuModel.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const game=source('src/pages/GameView.jsx');
const menu=source('src/components/game3d/PauseMenu.jsx');
const hud=source('src/components/game3d/hud/JadeSoulHUD.jsx');
const world=source('src/components/game3d/GameWorld3D.jsx');
const weapon=source('src/components/game3d/axe/weapons/AXEConceptDWeaponTemplate.jsx');
const editor=source('src/components/game3d/hud/Game3DHudLayoutEditor.jsx');
const variant=source('src/components/game3d/hud/Game3DHudLayoutVariants.css');
const editorCSS=source('src/components/game3d/hud/Game3DHudLayoutEditor.css');

test('settings are safe, deterministic, per-widget and preserve current horizontal layout by default',()=>{
  const defaults=defaultGame3DHudCustomization();
  assert.equal(defaults.layout,'horizontal');
  assert.equal(defaults.globalScale,1);
  assert.deepEqual(Object.keys(defaults.widgets),GAME3D_HUD_WIDGETS.map(o=>o.id));
  assert.deepEqual(defaults.widgets.combat,{x:0,y:0,scale:1});
  const normalized=normalizeGame3DHudCustomization({
    layout:'untrusted',globalScale:900,
    widgets:{combat:{x:1e9,y:-1e9,scale:-70},hacker:{x:8},skills:{scale:1.2}},
  });
  assert.equal(normalized.layout,'horizontal');
  assert.equal(normalized.globalScale,1.35);
  assert.deepEqual(normalized.widgets.combat,{x:95,y:-95,scale:.65});
  assert.equal(normalized.widgets.skills.scale,1.2);
  assert.ok(!Object.hasOwn(normalized.widgets,'hacker'));
  assert.equal(normalizeGame3DHudCustomization(null).widgets.vitals.scale,1);
});
test('real alternative Concept D vertical puts weapons on right and skills horizontal, no fake equipment',()=>{
  assert.deepEqual(GAME3D_HUD_LAYOUTS.map(o=>o.id),['horizontal','vertical']);
  const switched=changeGame3DHudLayout(defaultGame3DHudCustomization(),'vertical');
  assert.equal(switched.layout,'vertical');
  assert.equal(changeGame3DHudLayout(switched,'invalid').layout,'horizontal');
  assert.match(hud,/data-weapon-layout=\{hudCustomization\.layout\}/);
  assert.match(hud,/hudCustomization\.layout==='vertical'/);
  assert.match(hud,/concept-d-original-ornament\.avif/);
  assert.match(hud,/clean-curl-splash-only\.webp/);
  assert.match(variant,/data-weapon-layout="vertical"/);
  assert.match(variant,/\.jade-concept-d-rail\s*\{[^}]*flex-direction:column/s);
  assert.match(variant,/\.jade-ability-matrix\s*\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/s);
  assert.match(hud,/<WeaponStack playerLevel=\{hud\?\.level\}/);
  assert.match(hud,/<SkillMatrix loadout=\{loadout\}/);
  assert.match(weapon,/getAXEWeaponHUDArtwork\(item\)/);
  assert.match(weapon,/onClick=\{event=>onDraw\(role,event\.shiftKey\)\}/);
});
test('settings persist in browser, emit live update events and survive malformed saves',()=>{
  const data=new Map(),events=[];
  class TestEvent{constructor(type,opts){this.type=type;this.detail=opts?.detail;}}
  const host={
    localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)},
    CustomEvent:TestEvent,
    dispatchEvent:e=>events.push(e),
  };
  const next=changeGame3DHudWidget(changeGame3DHudLayout(defaultGame3DHudCustomization(),'vertical'),
    'weapons',{x:12.5,y:-7,scale:1.15});
  const saved=saveGame3DHudCustomization(next,host);
  assert.equal(data.has(GAME3D_HUD_CUSTOMIZATION_KEY),true);
  assert.equal(events.at(-1).type,GAME3D_HUD_CUSTOMIZATION_EVENT);
  assert.deepEqual(events.at(-1).detail,saved);
  assert.deepEqual(readGame3DHudCustomization(host),saved);
  assert.deepEqual(resetGame3DHudWidget(saved,'weapons').widgets.weapons,{x:0,y:0,scale:1});
  data.set(GAME3D_HUD_CUSTOMIZATION_KEY,'not json');
  assert.equal(readGame3DHudCustomization(host).layout,'horizontal');
});
test('dragged positions are bounded so resizing screens cannot permanently hide HUD',()=>{
  const rect={left:100,right:200,top:100,bottom:200};
  assert.deepEqual(clampHudRectTranslation(rect,{x:5,y:-10},{width:1000,height:800}),{x:50,y:-80});
  assert.deepEqual(clampHudRectTranslation(rect,{x:99,y:99},{width:1000,height:800}),{x:792,y:592});
  assert.deepEqual(clampHudRectTranslation(rect,{x:-99,y:-99},{width:1000,height:800}),{x:-92,y:-92});
  const panel=changeGame3DHudWidget(defaultGame3DHudCustomization(),'quest',{x:28,y:34,scale:1.25});
  assert.equal(panel.widgets.quest.scale,1.25);
  assert.equal(panel.widgets.quest.x,28);
});
test('UI is a real standalone Options section with resize slider, presets, drag edit and reset',()=>{
  assert.ok(GAME3D_PAUSE_SECTIONS.some(section=>section.id==='ui'));
  assert.deepEqual(game3dPauseEscape('ui'),{close:false,view:'overview',confirmAction:null});
  assert.match(menu,/view==='ui'/);
  assert.match(menu,/game3d-ui-customization-settings/);
  assert.match(menu,/GAME3D_HUD_LAYOUTS\.map/);
  assert.match(menu,/aria-label="Overall HUD size"/);
  assert.match(menu,/aria-label="Selected HUD box size"/);
  assert.match(menu,/onClick=\{onEditHUD\}/);
  assert.match(menu,/Reset all box positions/);
  assert.match(menu,/entry\?'Enter the world to drag/);
  assert.match(game,/onEditHUD=\{\(\)=>\{setPauseMenuOpen\(false\);setHudEditing\(true\);\}\}/);
});
test('editor repositions the EXISTING live DOM; no HUD replacement, duplicate world or forged stats',()=>{
  assert.match(game,/<Game3DHudLayoutEditor active=\{hudEditing\}/);
  assert.match(editor,/applyGame3DHudCustomization/);
  assert.match(editor,/\.style\.translate/);
  assert.match(editor,/\.style\.scale/);
  assert.match(editor,/getBoundingClientRect\(\)/);
  assert.match(editor,/MutationObserver/);
  assert.match(editor,/setPointerCapture\(event\.pointerId\)/);
  assert.match(editor,/onPointerDown=\{onDragStart\}/);
  assert.match(editor,/onPointerMove=\{onDragMove\}/);
  assert.match(editor,/onPointerUp=\{onDragEnd\}/);
  assert.match(editor,/Shift \+ arrows fine-tune/);
  assert.match(editor,/saveGame3DHudCustomization/);
  assert.match(editor,/window\.__axeHudEditMode=true/);
  assert.match(editor,/axePauseMenuOpened/);
  assert.match(editorCSS,/pointer-events:auto/);
});
test('combat and movement input are disabled during editing, not rebound in normal play',()=>{
  assert.match(world,/entryCamera\.isActive\(\) \|\| window\.__axeHudEditMode/);
  assert.match(world,/window\.__axeDialogueOpen \|\| window\.__axeHudEditMode/);
  assert.match(world,/if \(k === 'q' && !crouchTogglePressed\.current\)/);
  assert.match(world,/requestAirWalkAction/);
  assert.match(hud,/data-hud-template="approved-gold-shell-20261117"/);
  assert.match(hud,/<JadeQuestTracker/);
  assert.doesNotMatch(editor,/setPlayerHUD|awardXP|drawAXEHUDWeaponRole|startSkillCooldown/);
});
