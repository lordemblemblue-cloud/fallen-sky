import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
const weapon=read('src/components/game3d/axe/weapons/AXEConceptDWeaponTemplate.jsx');
const css=read('src/components/game3d/hud/JadeConceptDCombatHUD.css');
const loadout=read('src/components/game3d/skills/loadoutStore.jsx');
const historical=read('public/game3d/hud/concept-d-ink-gold-only.svg');

test('the original FIRST screenshot has its own translucent image in the ACTUAL Game 3D dock',()=>{
  assert.match(hud,/<img className="jade-concept-d-ornament"/);
  // The existing first-image splash stays the default compact layout;
  // optional Concept D vertical uses its original approved artwork instead.
  assert.match(hud,/hudCustomization\.layout==='vertical'/);
  assert.match(hud,/clean-curl-splash-only\.webp/);
  assert.match(hud,/concept-d-original-ornament\.avif/);
  assert.match(hud,/aria-hidden="true" draggable="false" loading="eager" decoding="async"/);
  assert.match(css,/\.jade-hud \.jade-combat-concept-d > img\.jade-concept-d-ornament/);
  assert.match(css,/object-fit:contain/);
  assert.match(css,/opacity:\.91/);
  assert.match(css,/width:clamp\(425px,36vw,642px\)/);
  assert.match(css,/height:clamp\(234px,31vh,335px\)/);
  assert.doesNotMatch(css,/background:url\('\/game3d\/hud\/concept-d-ink-gold-only\.svg'\)/);
  assert.doesNotMatch(hud,/<svg className="jade-concept-d-ornament"/);
  assert.ok(historical.includes('<svg'),'historic drawing remains available but is not the live art');
});
test('the five primary boxes are real equipment skill data, not baked into the picture',()=>{
  assert.match(loadout,/export const ACTIVE_SLOTS = 10/);
  assert.match(hud,/Array\.from\(\{ length: ACTIVE_SLOTS \}/);
  assert.match(hud,/const SKILL_KEYS = \['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'\]/);
  assert.match(hud,/getSkillById\(id\)/);
  assert.match(hud,/loadout\?\.cooldowns\?\.\[index\]/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/\.jade-hud \.jade-combat-concept-d > \.jade-ability-matrix \{/);
  assert.match(css,/top:56%/);
  assert.match(css,/width:82%/);
  assert.match(css,/height:24%/);
  assert.match(css,/\.jade-skill-slot--buff \{\s*display:none/);
  assert.match(css,/data-secondary-open="true"\] \.jade-skill-slot--buff \{\s*display:grid/);
  assert.match(hud,/onClick=\{\(\)=>setShowSecondary\(current=>!current\)\}/);
});
test('three weapon choices above skills, previous arrow LEFT and next arrow RIGHT',()=>{
  assert.match(weapon,/DISPLAY_ORDER=\['offensive','ranged','defensive'\]/);
  assert.match(weapon,/ChevronLeft/);
  assert.match(weapon,/ChevronRight/);
  assert.match(weapon,/className="jade-concept-d-cycle-prev"/);
  assert.match(weapon,/onClick=\{\(\)=>onCycle\(-1\)\}/);
  assert.match(weapon,/className="jade-concept-d-cycle-next"/);
  assert.match(weapon,/onClick=\{\(\)=>onCycle\(1\)\}/);
  assert.match(weapon,/getItem\(role\)/);
  assert.match(weapon,/onClick=\{event=>onDraw\(role,event\.shiftKey\)\}/);
  assert.doesNotMatch(weapon,/jade-concept-d-assign|onAssign\(role\)/);
  assert.doesNotMatch(weapon,/jade-concept-d-favorite/);
  assert.match(css,/grid-template-columns:clamp\(26px,3vw,37px\) minmax\(0,1fr\) clamp\(26px,3vw,37px\)/);
  assert.match(css,/flex-direction:row/);
  assert.match(css,/top:8%/);
  assert.match(css,/height:38%/);
  assert.match(css,/width:74%/);
});
test('all weapon draws, saved Skill Book presets, and mouse-wheel/arrow switching stay connected',()=>{
  assert.match(hud,/drawAXEHUDWeaponRole\(role,\{level:playerLevel\|\|1\}\)/);
  assert.match(hud,/getActiveEquippedAXEWeapon\(\)/);
  assert.match(hud,/getSkillPresets\(\)\.index!==index/);
  assert.match(hud,/selectSkillPreset\(index\)/);
  assert.match(hud,/el\.addEventListener\('wheel',onWheel,\{passive:false\}\)/);
  assert.match(hud,/key==='ArrowLeft'\)cycleAvailable\(-1\)/);
  assert.match(hud,/key==='ArrowRight'\|\|key==='KeyC'\)cycleAvailable\(1\)/);
  assert.match(hud,/onTouchEnd=\{e=>/);
});
test('mobile/landscape viewport padding and live gauges remain unaffected',()=>{
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/@media\(max-height:510px\) and \(orientation:landscape\)/);
  assert.match(css,/width:min\(95vw,460px\)/);
  assert.match(css,/max-width:calc\(100vw - 12px\)/);
  assert.match(css,/bottom:clamp\(86px,16vh,135px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(hud,/<WeaponStack playerLevel=\{hud\?\.level\} \/>/);
  assert.match(hud,/<SkillMatrix loadout=\{loadout\}\/>/);
  assert.match(hud,/className="jade-xp-liquid-glass"/);
  assert.match(hud,/style=\{\{'--jade-xp-progress':xpPct\+'%'\}\}/);
  assert.match(hud,/style=\{\{width:hpPct\+'%'\}\}/);
  assert.match(hud,/style=\{\{width:willPct\+'%'\}\}/);
});
