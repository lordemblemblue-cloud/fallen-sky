import test from 'node:test';
import assert from 'node:assert/strict';
import { staminaHudAnchor, staminaOverlapsEnemy } from '../src/components/game3d/hud/staminaHudPlacement.mjs';

test('stamina is placed lower at the avatar waist and closer to the right side', () => {
  assert.deepEqual(staminaHudAnchor({screenVisible:true,screenX:50,screenY:45}), {left:56.5,top:52});
});
test('the stamina anchor stays on-screen on mobile and at camera edges', () => {
  assert.deepEqual(staminaHudAnchor({screenVisible:true,screenX:99,screenY:99}), {left:88,top:84});
  assert.deepEqual(staminaHudAnchor({screenVisible:true,screenX:0,screenY:0}), {left:10,top:18});
});
test('hidden/offscreen/invalid positions do not show the stamina gauge', () => {
  assert.equal(staminaHudAnchor({screenVisible:false,screenX:50,screenY:50}),null);
  assert.equal(staminaHudAnchor({screenVisible:true,screenX:NaN,screenY:50}),null);
  assert.equal(staminaHudAnchor(null),null);
});
test('an enemy overlapping the waist gauge causes low-opacity combat mode', () => {
  const position={screenVisible:true,screenX:50,screenY:45};
  assert.equal(staminaOverlapsEnemy(position,[{x:565,y:520}],1000,1000),true);
});
test('a distant enemy does not wash out the stamina gauge', () => {
  const position={screenVisible:true,screenX:50,screenY:45};
  assert.equal(staminaOverlapsEnemy(position,[{x:120,y:120}],1000,1000),false);
});
test('invalid view sizes and missing enemy positions fail open to visibility', () => {
  const position={screenVisible:true,screenX:50,screenY:45};
  assert.equal(staminaOverlapsEnemy(position,[{x:565,y:520}],0,1000),false);
  assert.equal(staminaOverlapsEnemy(position,[{x:565,y:NaN}],1000,1000),false);
  assert.equal(staminaOverlapsEnemy(position,null,1000,1000),false);
});
