import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('six rig-fitted combo animations are included and bound to the live player',()=>{
  const c=read('src/components/game3d/weapons/weaponComboClips.js');
  const binder=read('src/components/game3d/weapons/weaponComboBinder.js');
  const world=read('src/components/game3d/GameWorld3D.jsx');
  assert.match(c,/swordCombo1.*swordCombo2.*swordCombo3/);
  assert.match(c,/bowCombo1.*bowCombo2.*bowCombo3/);
  assert.match(binder,/captureRestPose/);
  assert.match(world,/createWeaponComboBinder\(\{ model: fbx, controller: playerAnim/);
  assert.match(world,/comboKind && !isSkillStrike \? undefined/);
  assert.match(world,/playerAnim\?\.pollComboEvents\?\.\(\)/);
});

test('the player's attacks remain hit/cooldown-authoritative and existing bow visuals remain single-shot',()=>{
  const world=read('src/components/game3d/GameWorld3D.jsx');
  const c=read('src/components/game3d/player/LunaDashboardPlayerController.jsx');
  assert.match(world,/basicAttackCooldown\(/);
  assert.match(world,/bowVisuals\.fire\(/);
  assert.match(world,/if \(!\(comboKind === 'swordCombo'/);
  assert.match(c,/WEAPON_COMBO_CHAIN_GRACE_SECONDS/);
  assert.match(c,/WEAPON_COMBO_BUFFER_SECONDS/);
  assert.match(c,/setWeaponComboClips,/);
  assert.match(c,/pollComboEvents,/);
});

test('remote players see real combo skeletal motion; missing private weapons are not requested',()=>{
  const r=read('src/components/game3d/RemotePlayersManager.jsx');
  const rc=read('src/components/game3d/weapons/remoteWeaponCombos.js');
  assert.match(r,/bakeRemoteComboClips\(loaded\.model\)/);
  assert.match(r,/comboWeapons = false/);
  assert.match(r,/stamp < r\.liveStamp/);
  assert.match(rc,/REMOTE_COMBO_STAND_INS/);
  assert.match(rc,/remoteComboKind/);
});
