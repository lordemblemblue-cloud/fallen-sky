import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Clone binds the same authored 3-hit sword and bow animation states as Claude', () => {
  const clips = read('src/components/game3d/weapons/weaponComboClips.js');
  assert.match(clips, /swordCombo1.*swordCombo2.*swordCombo3/);
  assert.match(clips, /bowCombo1.*bowCombo2.*bowCombo3/);
  assert.match(clips, /bakeWeaponComboClips/);
  const binder = read('src/components/game3d/weapons/weaponComboBinder.js');
  assert.match(binder, /captureRestPose/);
  assert.match(binder, /setWeaponComboClips/);
});

test('The clone player preserves three-tap chaining while basic hits keep their damage rules', () => {
  const controller = read('src/components/game3d/player/LunaDashboardPlayerController.jsx');
  const world = read('src/components/game3d/GameWorld3D.jsx');
  assert.match(controller, /requestWeaponCombo/);
  assert.match(controller, /getComboState,/);
  assert.match(controller, /pollComboEvents,/);
  assert.match(world, /createWeaponComboBinder\(\{ model: fbx, controller: playerAnim/);
  assert.match(world, /comboKind && !isSkillStrike \? undefined : pendingSkillStrike\?\.hitIndex/);
  assert.match(world, /playerAnim\?\.pollComboEvents\?\.\(\)/);
  assert.match(world, /if \(!\(comboKind === 'swordCombo'/);
  assert.match(world, /bowVisuals\.fire\(/); // retained: no second shot at the combo cue
  assert.match(world, /basicAttackCooldown\(/);
  assert.match(world, /anim: mounted \? companionCurrentAnimRef\.current/);
});

test('Remote players show Claude combo clips without downloading absent pack GLBs', () => {
  const remote = read('src/components/game3d/RemotePlayersManager.jsx');
  assert.match(remote, /bakeRemoteComboClips\(loaded\.model\)/);
  assert.match(remote, /remoteComboKind\(anim\)/);
  assert.match(remote, /comboWeapons = false/);
  assert.match(remote, /stamp < r\.liveStamp/);
  assert.match(remote, /swingPlaying\(r\)/);
});

test('Original source assets are not silently replaced by invented GLB files', () => {
  const manifest = JSON.parse(read('public/game3d/weapons/manifest.json'));
  assert(manifest.weapons?.length >= 6);
  assert(read('src/components/game3d/weapons/playerWeaponRuntime.js').includes('loadWeaponManifest'));
});
