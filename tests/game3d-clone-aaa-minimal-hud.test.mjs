import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../src/components/game3d/'+path, import.meta.url),'utf8');
const hud=read('hud/JadeSoulHUD.jsx');
const css=read('hud/JadeSoulHUD.css');
const world=read('GameWorld3D.jsx');
const placement=read('hud/staminaHudPlacement.mjs');

test('Level and real XP are now inside one compact octagon',()=>{
  assert.match(hud,/data-hud-agent-exp="octagon"/);
  assert.match(hud,/aria-label=\{\x60Level /);
  assert.match(hud,/--jade-xp-progress/);
  assert.match(hud,/jade-xp-number/);
  assert.match(hud,/jade-xp-readout/);
  assert.doesNotMatch(hud,/jade-xp-rail/);
  assert.match(css,/\.jade-hud \.jade-xp--compact/);
  assert.match(css,/clip-path:polygon\(23% 0,77% 0/);
});

test('HP and Will remain live real combat-resource tanks; permanent stamina bar removed',()=>{
  assert.match(hud,/jade-status-bars--refined/);
  assert.match(hud,/fmt\(hud\?\.hp\)/);
  assert.match(hud,/fmt\(hud\?\.maxHP\)/);
  assert.match(hud,/fmt\(currentWill\)/);
  assert.match(hud,/fmt\(maxWill\)/);
  assert.doesNotMatch(hud,/jade-status-row--stamina/);
  assert.match(css,/\.jade-status-row--hp \{grid-column:1/);
  assert.match(css,/\.jade-status-row--will \{grid-column:3/);
});

test('small near-avatar stamina circle only appears after real stamina spend',()=>{
  assert.match(hud,/Number\(resources\.stamina\) < previous - 0\.05/);
  assert.match(hud,/setStaminaVisible\(true\)/);
  assert.match(hud,/setTimeout\(\(\) => setStaminaVisible\(false\), 1950\)/);
  assert.match(hud,/data-stamina-visible=\{staminaVisible && !navigationHidden/);
  assert.match(hud,/aria-valuenow=\{Math\.max\(0,resources\.stamina\|\|0\)\}/);
  assert.match(css,/\.jade-hud \.jade-stamina-ring/);
});

test('project stamina beside the actual avatar after the live camera update',()=>{
  assert.match(world,/const hudProjection = new THREE\.Vector3\(\)/);
  const move=world.indexOf('playerCameraSystem.update(delta, playerStateMachine.intent)');
  const project=world.indexOf('hudProjection.set(');
  const publish=world.indexOf('screenVisible:Number.isFinite(hudProjection.x)');
  assert.ok(move > 0 && project > move && publish > project);
  assert.match(hud,/subscribePlayerPosition\(position =>/);
  assert.match(hud,/staminaHudAnchor\(position\)/);
  assert.match(placement,/position\.screenX \+ 6\.5/);
  assert.match(placement,/position\.screenY \+ 7/);
  assert.match(hud,/node\.dataset\.staminaOccluded/);
});

test('preserve existing weapon/ability controls and hide stamina in services',()=>{
  assert.match(hud,/<WeaponStack playerLevel=\{hud\?\.level\} \/>/);
  assert.match(hud,/<SkillMatrix loadout=\{loadout\}\/>/);
  assert.match(hud,/<AXEServicesNavigation/);
  assert.match(css,/\.jade-hud\[data-service-mode="true"\] \.jade-stamina-popup/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
});
