import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('src/components/game3d/hud/JadeConceptDCombatHUD.css');
const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
const weapon=read('src/components/game3d/axe/weapons/AXEConceptDWeaponTemplate.jsx');
const original=JSON.parse(read('public/game3d/hud/first-left-splash-asset.json'));
const section=css.slice(css.indexOf('owner correction: CLUMP controls'));

test('keep the user FIRST picture as the sole original transparent background',()=>{
  assert.match(hud,/<img className="jade-concept-d-ornament"/);
  assert.ok(!hud.includes(original.imageUrl));
  assert.match(hud,/clean-curl-splash-only\.webp/);
  assert.equal(original.extraction.recreatedIllustration,false);
  assert.match(section,/ORIGINAL\s*\n\s*unmodified first-image translucent splash/);
  assert.doesNotMatch(section,/background:url\(|<svg|paint|brushstroke:|clip-path:polygon/);
  assert.match(css,/object-fit:contain/);
});
test('five skills are compact, clumped and right-aligned inside that image',()=>{
  assert.match(section,/--jade-dock-slot:clamp\(32px,3vw,49px\)/);
  assert.match(section,/--jade-dock-gap:clamp\(2px,\.30vw,4px\)/);
  assert.match(section,/> \.jade-ability-matrix \{\s*top:59%;[\s\S]*?left:auto;\s*right:10%/);
  assert.match(section,/grid-template-columns:repeat\(5,var\(--jade-dock-slot\)\)/);
  assert.match(section,/column-gap:var\(--jade-dock-gap\)/);
  assert.match(section,/\.jade-ability-matrix \.jade-skill-slot \{\s*width:var\(--jade-dock-slot\);\s*height:var\(--jade-dock-slot\)/);
  assert.match(hud,/const SKILL_KEYS = \['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'\]/);
  assert.match(hud,/Array\.from\(\{ length: ACTIVE_SLOTS \}/);
});
test('three real equipped weapon selectors are the same size as skill sockets',()=>{
  assert.match(section,/> \.jade-weapon-position \{\s*top:15%;\s*left:auto;\s*right:14\.5%/);
  assert.match(section,/grid-template-columns:var\(--jade-dock-arrow\) max-content var\(--jade-dock-arrow\)/);
  assert.match(section,/justify-content:center;\s*align-items:center;\s*gap:var\(--jade-dock-gap\)/);
  assert.match(section,/\.jade-concept-d-role \{[\s\S]*?flex:0 0 var\(--jade-dock-slot\)/);
  assert.match(section,/\.jade-concept-d-weapon-circle,[\s\S]*?\{\s*width:var\(--jade-dock-slot\);\s*height:var\(--jade-dock-slot\)/);
  assert.match(section,/\.jade-concept-d-role\[data-active="true"\] \.jade-concept-d-weapon-circle \{[\s\S]*?transform:none/);
  assert.match(weapon,/DISPLAY_ORDER=\['offensive','ranged','defensive'\]/);
  assert.match(weapon,/onClick=\{\(\)=>onCycle\(-1\)\}/);
  assert.match(weapon,/onClick=\{\(\)=>onCycle\(1\)\}/);
  assert.match(weapon,/ChevronLeft/);
  assert.match(weapon,/ChevronRight/);
});
test('remove bottom-right mini settings boxes and the intrusive assignment popup',()=>{
  assert.doesNotMatch(weapon,/Settings2|jade-concept-d-assign|jade-concept-d-favorite|onAssign|aria-expanded=\{assigning===role\}/);
  assert.doesNotMatch(hud,/jade-weapon-chooser|setAssigning|assigning && <div|jade-weapon-notice/);
  assert.match(section,/\.jade-concept-d-assign,[\s\S]*?\.jade-weapon-chooser,[\s\S]*?\.jade-weapon-notice,[\s\S]*?\.jade-concept-d-favorite \{\s*display:none!important/);
  assert.match(hud,/className="jade-weapon-status-sr" role="status" aria-live="polite"/);
  assert.match(section,/\.jade-weapon-status-sr \{\s*position:absolute;\s*width:1px;\s*height:1px/);
});
test('reassign weapons without a popup, preserving owned inventory and Skill Book binding',()=>{
  assert.match(weapon,/onClick=\{event=>onDraw\(role,event\.shiftKey\)\}/);
  assert.match(hud,/const cycleOwnedForRole=useCallback\(role=>/);
  assert.match(hud,/getOwnedWeaponsForAXERole\(role\)\.filter\(item=>/);
  assert.match(hud,/!occupied\.has\(item\.instanceId\)/);
  assert.match(hud,/assignAXEHUDWeaponRole\(role,next\.instanceId\)/);
  assert.match(hud,/drawAXEHUDWeaponRole\(role,\{level:playerLevel\|\|1\}\)/);
  assert.match(hud,/getSkillPresets\(\)\.index!==index/);
  assert.match(hud,/selectSkillPreset\(index\)/);
  assert.match(hud,/el\.addEventListener\('wheel',onWheel,\{passive:false\}\)/);
  assert.match(hud,/key==='ArrowLeft'\)cycleAvailable\(-1\)/);
});
test('mobile and short landscape keep both rows clumped and off-screen overlap guarded',()=>{
  assert.match(css,/max-width:calc\(100vw - 12px\)/);
  assert.match(section,/@media \(max-width:680px\)/);
  assert.match(section,/--jade-dock-slot:clamp\(23px,6vw,34px\)/);
  assert.match(section,/right:7%/);
  assert.match(section,/@media \(max-height:510px\) and \(orientation:landscape\)/);
  assert.match(section,/--jade-dock-slot:clamp\(22px,3\.2vw,32px\)/);
  assert.match(section,/\.jade-ability-matrix\[data-secondary-open="true"\] \{\s*top:44%;\s*height:41%/);
  assert.match(hud,/data-secondary-open=\{showSecondary\?'true':'false'\}/);
});
test('layout footprint fits reference illustration in representative viewports',()=>{
  const screens=[
    {w:1920,dock:642,slot:49,gap:4,arrow:27,skillRight:.10,weaponRight:.145},
    {w:1280,dock:460,slot:Math.max(30,Math.min(43,.034*1280)),gap:4,arrow:Math.max(21,Math.min(25,.023*1280)),skillRight:.10,weaponRight:.145},
    {w:390,dock:Math.min(.95*390,460),slot:Math.max(23,Math.min(34,.06*390)),gap:3,arrow:Math.max(18,Math.min(23,.046*390)),skillRight:.07,weaponRight:.11},
    {w:320,dock:Math.min(.95*320,460),slot:23,gap:3,arrow:18,skillRight:.07,weaponRight:.11},
  ];
  for(const v of screens){
    const five=v.slot*5+v.gap*4;
    const weaponRow=v.slot*3+v.gap*4+v.arrow*2;
    const skillLeft=v.dock*(1-v.skillRight)-five;
    const weaponLeft=v.dock*(1-v.weaponRight)-weaponRow;
    assert.ok(skillLeft>=0&&weaponLeft>=0,'all boxes fit: '+v.w);
    assert.ok(Math.abs((skillLeft+five/2)-(weaponLeft+weaponRow/2))<=23,
      'weapons remain directly above skills: '+v.w);
    assert.ok(v.dock*v.skillRight>=0,'right-side padding exists');
  }
});
