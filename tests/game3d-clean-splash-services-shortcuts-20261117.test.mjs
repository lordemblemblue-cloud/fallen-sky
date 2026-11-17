import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
const splashCss=read('src/components/game3d/hud/JadeConceptDCombatHUD.css');
const services=read('src/components/game3d/axe/services/AXEServicesNavigation.jsx');
const placement=read('src/components/game3d/hud/Game3DHUDPlacement.css');
const weapon=read('src/components/game3d/axe/weapons/AXEConceptDWeaponTemplate.jsx');
const loadout=read('src/components/game3d/skills/loadoutStore.jsx');

test('live HUD uses only the cleaned image from the approved screenshot, not the ghost-slot raster',()=>{
  const image=readFileSync(new URL('../public/game3d/hud/clean-curl-splash-only.webp',import.meta.url));
  assert.equal(image.toString('ascii',0,4),'RIFF');
  assert.equal(image.toString('ascii',8,12),'WEBP');
  assert.ok(image.length>1000&&image.length<20000);
  assert.match(hud,/src="\/game3d\/hud\/clean-curl-splash-only\.webp"/);
  assert.doesNotMatch(hud,/src="https:\/\/media\.base44\.com\/images\/public\/[^"]*splash/);
  assert.doesNotMatch(splashCss,/background:url\('\/game3d\/hud\/concept-d-original-ornament\.avif'\)/);
  assert.match(splashCss,/No fallback brush with baked circles\/boxes/);
});
test('the cleaned curved line cannot exceed the lower-right game-view boundary',()=>{
  const cleaned=splashCss.slice(splashCss.indexOf('CLEAN IMAGE, 2026-11-17'));
  assert.match(cleaned,/img\.jade-concept-d-ornament/);
  assert.match(cleaned,/inset:7% 2% 9% auto/);
  assert.match(cleaned,/width:96%/);
  assert.match(cleaned,/height:84%/);
  assert.match(cleaned,/object-fit:contain/);
  assert.match(cleaned,/clip-path:inset\(0\)/);
  assert.match(cleaned,/right:max\(8px,var\(--game3d-safe-right,0px\)\)/);
  assert.match(cleaned,/max-width:calc\(100% - 16px\)/);
});
test('original live five skill slots keep their 1 to 5 order and live cooldowns',()=>{
  assert.match(hud,/const SKILL_KEYS = \['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'\]/);
  assert.match(hud,/Array\.from\(\{ length: ACTIVE_SLOTS \}/);
  assert.match(hud,/data-slot=\{index \+ 1\}/);
  assert.match(hud,/const id = loadout\?\.activeSlots\?\.\[index\]/);
  assert.match(hud,/getSkillById\(id\)/);
  assert.match(hud,/loadout\?\.cooldowns\?\.\[index\]/);
  assert.match(loadout,/export const ACTIVE_SLOTS = 10/);
  assert.match(splashCss,/grid-template-columns:repeat\(5,var\(--jade-dock-slot\)\)/);
  assert.match(hud,/<WeaponStack playerLevel=\{hud\?\.level\} \/>/);
  assert.match(hud,/<SkillMatrix loadout=\{loadout\}\/>/);
});
test('owned Damage / Range / Defense selectors and cycle arrows remain above the skills',()=>{
  assert.match(weapon,/DISPLAY_ORDER=\['offensive','ranged','defensive'\]/);
  assert.match(weapon,/ChevronLeft/);
  assert.match(weapon,/ChevronRight/);
  assert.match(weapon,/onClick=\{\(\)=>onCycle\(-1\)\}/);
  assert.match(weapon,/onClick=\{\(\)=>onCycle\(1\)\}/);
  assert.match(weapon,/onClick=\{event=>onDraw\(role,event\.shiftKey\)\}/);
  assert.doesNotMatch(weapon,/jade-concept-d-assign/);
  assert.match(splashCss,/\.jade-hud \.jade-combat-concept-d > \.jade-weapon-position/);
});
test('shortcuts measure the actual visible Services button, including after responsive wrapping',()=>{
  assert.match(services,/node\.querySelector\('\.jade-services-options \.jade-services-button'\)/);
  assert.match(services,/node\.querySelector\(':scope > \.jade-services-button'\)/);
  assert.match(services,/buttonRect\.left-worldRect\.left/);
  assert.match(services,/buttonRect\.bottom-worldRect\.top\+7/);
  assert.match(services,/--axe-services-shortcuts-left/);
  assert.match(services,/--axe-services-shortcuts-top/);
  assert.match(services,/resize\?\.observe\(node\)/);
  assert.match(services,/removeProperty\('--axe-services-shortcuts-left'\)/);
  assert.match(services,/removeProperty\('--axe-services-shortcuts-top'\)/);
});
test('all three shortcut launchers occupy one row beneath Services, not the map or footer',()=>{
  assert.match(placement,/\.axe-echo-launch,\s*\.game3d-view \.axe-chronicle-vault-launch,\s*\.game3d-view \.axe-minigames-launch/);
  assert.match(placement,/top: var\(--axe-services-shortcuts-top, var\(--axe-services-top-fallback\)\) !important/);
  assert.match(placement,/bottom: auto !important/);
  assert.match(placement,/left: var\(--axe-services-shortcuts-left, var\(--axe-services-left-fallback\)\) !important/);
  assert.match(placement,/left: calc\(var\(--axe-services-shortcuts-left,[\s\S]*?var\(--axe-hud-launcher-size, 42px\)/);
  assert.match(placement,/left: calc\(var\(--axe-services-shortcuts-left,[\s\S]*?\* 2\) !important/);
  assert.doesNotMatch(placement,/bottom: var\(--axe-hud-xp-bottom, 36px\) !important/);
  assert.match(placement,/@media \(max-width: 420px\)/);
  assert.match(placement,/--axe-hud-launcher-size: 29px/);
});
