import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=readFileSync(new URL('../public/game3d/hud/concept-d-original-ornament.avif',import.meta.url));
const css=readFileSync(new URL('../src/components/game3d/hud/JadeConceptDCombatHUD.css',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/components/game3d/hud/JadeSoulHUD.jsx',import.meta.url),'utf8');
const weapon=readFileSync(new URL('../src/components/game3d/axe/weapons/AXEConceptDWeaponTemplate.jsx',import.meta.url),'utf8');
const gitBlob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

test('approved Concept D decoration is a real image-file extraction, not a traced approximation',()=>{
  assert.equal(raw.subarray(4,12).toString('ascii'),'ftypavif');
  // This is the Git blob of the source-derived transparent raster. Keeping a
  // bytewise signature prevents accidental replacement by an AI-drawn SVG.
  assert.equal(gitBlob(raw),'c4329d1a5633ea80ba0a8c40a9018e63ab372b8d');
  assert.equal(raw.length,4480);
  assert.match(css,/concept-d-original-ornament\.avif/);
  assert.doesNotMatch(css,/concept-d-ink-gold-only\.svg/);
});

test('image maintains original aspect ratio and remains a click-through decorative layer',()=>{
  assert.match(css,/aspect-ratio:1040 \/ 655/);
  assert.match(css,/background:url\('\/game3d\/hud\/concept-d-original-ornament\.avif'\) center \/ contain no-repeat/);
  assert.match(css,/\.jade-concept-d-ornament\s*\{[^}]*pointer-events:none/s);
  assert.match(ui,/className="jade-concept-d-ornament" aria-hidden="true"/);
});

test('real weapon and skills align around original image without touching HP/WILL/EXP',()=>{
  assert.match(css,/top:16%;\s*bottom:auto;\s*right:8\.4%;\s*left:auto;\s*width:19%;\s*height:65%/);
  assert.match(css,/left:12%;\s*right:auto;\s*top:auto;\s*bottom:24%;\s*width:63%/);
  assert.match(weapon,/onClick=\{\(\)=>onDraw\(role\)\}/);
  assert.match(weapon,/getAXEWeaponHUDArtwork\(item\)/);
  assert.match(ui,/<SkillMatrix loadout=\{loadout\}\/>/);
  assert.match(ui,/data-hud-template="approved-gold-shell-20261117"/);
  assert.match(ui,/<JadeQuestTracker/);
  assert.doesNotMatch(css,/jade-status-bars--refined|jade-quest-tracker/);
});

test('responsive HUD keeps owner image proportional at tablet, mobile and landscape',()=>{
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/@media\(max-height:510px\) and \(orientation:landscape\)/);
  assert.match(css,/bottom:clamp\(88px,16vh,125px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
