import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AXE_HUD_WEAPON_ROLES,roleForCycle} from '../src/components/game3d/axe/weapons/AXEWeaponRoleSlots.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const svg=read('public/game3d/hud/concept-d-ink-gold-only.svg');
const css=read('src/components/game3d/hud/JadeConceptDCombatHUD.css');
const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
const weapon=read('src/components/game3d/axe/weapons/AXEConceptDWeaponTemplate.jsx');
const loadout=read('src/components/game3d/skills/loadoutStore.jsx');
const world=read('src/components/game3d/GameWorld3D.jsx');

test('transparent artwork is ONLY the gray ink splash and angled gold edge',()=>{
  assert.match(svg,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg,/id="ink"/);
  assert.match(svg,/id="gold"/);
  assert.match(svg,/M197 536|M 197 536/);
  assert.match(svg,/filter id="goldglow"/);
  assert.doesNotMatch(svg,/<rect\b|<circle\b|<text\b|<image\b/);
  // Original Concept D vector remains as historical reference only; the
  // live game MUST show the user's literal first-image translucent raster.
  assert.doesNotMatch(css,/background:url\('\/game3d\/hud\/concept-d-ink-gold-only\.svg'\)/);
  assert.match(hud,/<img className="jade-concept-d-ornament"/);
  assert.match(hud,/axe_first_design_exact_splash_five_slots\.webp/);
  assert.match(css,/pointer-events:none/);
});
test('three roles are live owned-weapon circles, not artwork cutouts',()=>{
  assert.deepEqual(AXE_HUD_WEAPON_ROLES.map(row=>row.role),['offensive','defensive','ranged']);
  assert.match(weapon,/DISPLAY_ORDER=\['offensive','ranged','defensive'\]/);
  assert.match(weapon,/getItem\(role\)/);
  assert.match(weapon,/getAXEWeaponHUDArtwork\(item\)/);
  assert.match(weapon,/aria-pressed=\{active\}/);
  assert.match(weapon,/onClick=\{\(\)=>onDraw\(role\)\}/);
  assert.match(weapon,/onClick=\{\(\)=>onAssign\(role\)\}/);
  assert.match(weapon,/ref=\{wheelRef\}/);
  assert.match(css,/\.jade-concept-d-weapon-circle\s*\{/);
  assert.match(css,/border-radius:50%/);
});
test('original weapon transaction and wheel/arrow/touch switching are preserved',()=>{
  assert.match(hud,/drawAXEHUDWeaponRole\(role,\{level:playerLevel\|\|1\}\)/);
  assert.match(hud,/assignAXEHUDWeaponRole\(role,id\)/);
  assert.match(hud,/getOwnedWeaponsForAXERole\(assigning\)/);
  assert.match(hud,/el\.addEventListener\('wheel',onWheel,\{passive:false\}\)/);
  assert.match(hud,/key==='ArrowLeft'\)cycleAvailable\(-1\)/);
  assert.match(hud,/const roles=\['offensive','ranged','defensive'\]/);
  assert.match(hud,/key==='ArrowRight'\|\|key==='KeyC'\)cycleAvailable\(1\)/);
  assert.match(hud,/onTouchEnd=\{e=>/);
  assert.equal(roleForCycle(['offensive','defensive','ranged'],'ranged',1),'offensive');
  assert.match(world,/if \(k === 'q' && !crouchTogglePressed\.current\)/);
  assert.doesNotMatch(hud,/key==='KeyQ'|key==='q'/);
  assert.match(weapon,/title="Q: crouch \(weapon switching uses scroll, arrows or Shift\+C\)"/);
});
test('five primary skills stay visible; remaining five persist with expandable real keycaps',()=>{
  assert.match(loadout,/export const ACTIVE_SLOTS = 10/);
  assert.match(hud,/Array\.from\(\{ length: ACTIVE_SLOTS \}/);
  assert.match(hud,/const SKILL_KEYS = \['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'\]/);
  assert.match(hud,/data-secondary-open=\{showSecondary\?'true':'false'\}/);
  assert.match(hud,/onClick=\{\(\)=>setShowSecondary\(current=>!current\)\}/);
  assert.match(css,/\.jade-skill-slot--buff\s*\{\s*display:none/);
  assert.match(css,/data-secondary-open="true"\] \.jade-skill-slot--buff\s*\{\s*display:grid/);
  assert.match(hud,/getSkillById\(id\)/);
  assert.match(hud,/loadout\?\.cooldowns\?\.\[index\]/);
});
test('actual equipped weapon family selects corresponding saved Damage/Range/Defense skill bank',()=>{
  assert.match(loadout,/export function getSkillPresets\(/);
  assert.match(loadout,/export function selectSkillPreset\(index\)/);
  assert.match(hud,/inferAXEWeaponRole\(result\.item\|\|item\)/);
  assert.match(hud,/drawnRole==='ranged'\?1:drawnRole==='defensive'\?2/);
  assert.match(hud,/drawnRole==='offensive'\?0:null/);
  assert.match(hud,/getSkillPresets\(\)\.index!==index/);
  assert.match(hud,/selectSkillPreset\(index\)/);
});
test('concept D is scoped to bottom-right and leaves original player HP, WILL, EXP and quests alone',()=>{
  assert.match(hud,/data-combat-hud="concept-d"/);
  assert.match(hud,/className="jade-concept-d-ornament"/);
  assert.match(hud,/AXEConceptDWeaponTemplate/);
  assert.match(hud,/<WeaponStack playerLevel=\{hud\?\.level\} \/>/);
  assert.match(hud,/<SkillMatrix loadout=\{loadout\}\/>/);
  assert.match(hud,/data-hud-template="approved-gold-shell-20261117"/);
  assert.match(hud,/<JadeQuestTracker/);
  assert.doesNotMatch(css,/\.jade-hud-template\s*\{|jade-quest-tracker|jade-status-bars--refined/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/bottom:clamp\(88px,16vh,125px\)/);
  assert.match(css,/@media\(max-height:510px\) and \(orientation:landscape\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
