import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=readFileSync(new URL('../public/game3d/hud/concept-d-original-ornament.avif',import.meta.url));
const css=readFileSync(new URL('../src/components/game3d/hud/JadeConceptDCombatHUD.css',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/components/game3d/hud/JadeSoulHUD.jsx',import.meta.url),'utf8');
const weapon=readFileSync(new URL('../src/components/game3d/axe/weapons/AXEConceptDWeaponTemplate.jsx',import.meta.url),'utf8');
const source=JSON.parse(readFileSync(new URL('../public/game3d/hud/first-left-splash-asset.json',import.meta.url),'utf8'));
const gitBlob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

test('existing original Concept D raster remains byte-perfect as a historical asset',()=>{
  assert.equal(raw.subarray(4,12).toString('ascii'),'ftypavif');
  assert.equal(gitBlob(raw),'c4329d1a5633ea80ba0a8c40a9018e63ab372b8d');
  assert.equal(raw.length,4480);
  assert.doesNotMatch(css,/background:url\('\/game3d\/hud\/concept-d-original-ornament\.avif'\)/);
  assert.doesNotMatch(css,/background:url\('\/game3d\/hud\/concept-d-ink-gold-only\.svg'\)/);
});
test('historical first raster is preserved, while the new CLEAN screenshot crop is the active backing',()=>{
  assert.equal(source.kind,'pixel-derived-raster-overlay');
  assert.equal(source.extraction.recreatedIllustration,false);
  assert.equal(source.dimensions.width,1140);
  assert.equal(source.dimensions.height,564);
  assert.match(source.imageUrl,/axe_first_design_exact_splash_five_slots\.webp$/);
  assert.match(ui,/<img className="jade-concept-d-ornament"/);
  assert.ok(!ui.includes(source.imageUrl));
  assert.match(ui,/src="\/game3d\/hud\/clean-curl-splash-only\.webp"/);
  assert.match(css,/object-fit:contain/);
  assert.match(css,/> img\.jade-concept-d-ornament\s*\{[\s\S]*?pointer-events:none/);
});
test('real weapon and skill controls align around enlarged first image and remain independent',()=>{
  assert.match(css,/width:clamp\(425px,36vw,642px\)/);
  assert.match(css,/height:clamp\(234px,31vh,335px\)/);
  assert.match(css,/\.jade-hud \.jade-combat-concept-d > \.jade-weapon-position\s*\{[\s\S]*?top:8%/);
  assert.match(css,/\.jade-hud \.jade-combat-concept-d > \.jade-ability-matrix\s*\{[\s\S]*?top:56%/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(weapon,/ChevronLeft/);
  assert.match(weapon,/ChevronRight/);
  assert.match(weapon,/onClick=\{event=>onDraw\(role,event\.shiftKey\)\}/);
  assert.match(weapon,/getAXEWeaponHUDArtwork\(item\)/);
  assert.match(ui,/<SkillMatrix loadout=\{loadout\}\/>/);
  assert.match(ui,/data-hud-template="approved-gold-shell-20261117"/);
  assert.match(ui,/<JadeQuestTracker/);
  assert.doesNotMatch(css,/jade-status-bars--refined|jade-quest-tracker/);
});
test('responsive HUD reserves area on mobile and short landscape displays',()=>{
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/@media\(max-height:510px\) and \(orientation:landscape\)/);
  assert.match(css,/bottom:clamp\(86px,16vh,135px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
