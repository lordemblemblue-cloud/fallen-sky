import test from 'node:test';
import assert from 'node:assert/strict';
import {mountShoulderPoint,mountCameraObstruction} from '../src/components/game3d/ai/MountFollowRules.mjs';
import {planSelectedAbility} from '../src/components/game3d/combat/SelectedAbilityApproach.mjs';
import {game3dInputKey,game3dMoveAxes} from '../src/components/game3d/player/Game3DMovementInput.mjs';

const person={x:10,z:20};
test('idle mount parks right of hero with a slight forward lead',()=>{
  const p=mountShoulderPoint(person,0);
  assert.ok(p.x>11.5);
  assert.ok(p.z<20);
  const turn=mountShoulderPoint(person,Math.PI/2);
  assert.ok(turn.z<18.5);
});
test('camera ghosts only a mount actually crossing the eye-to-player segment',()=>{
  const camera={x:0,y:1,z:4},player={x:0,y:1,z:0};
  assert.equal(mountCameraObstruction({camera,player,mount:{x:0,y:1,z:2}}),true);
  assert.equal(mountCameraObstruction({camera,player,mount:{x:3,y:1,z:2}}),false);
  assert.equal(mountCameraObstruction({camera,player,mount:{x:0,y:1,z:-2}}),false);
});
const plan=(d,weaponPath='melee',rest={})=>planSelectedAbility({
  origin:{x:0,z:0},target:{position:{x:d,z:0},alive:true,visible:true},
  meleeReach:2,weaponPath,...rest,
});
test('selected melee ability never moves before pressing and respects 30m acquisition',()=>{
  assert.equal(plan(29).kind,'approach');
  assert.equal(plan(1.8).kind,'fire');
  assert.equal(plan(30.1).kind,'out_of_range');
});
test('bow selected ability has a 40m envelope, no melee pursuit',()=>{
  assert.equal(plan(40,'ranged').kind,'fire');
  assert.equal(plan(40.01,'ranged').kind,'out_of_range');
});
test('client never bypasses server-managed PvP or mounted melee rules',()=>{
  assert.equal(plan(12,'melee',{pvp:true}).kind,'pvp_worker');
  assert.equal(plan(12,'melee',{mounted:true}).kind,'mounted');
});
test('dead or missing target is never pursued',()=>{
  assert.equal(planSelectedAbility({origin:{x:0,z:0},target:{position:{x:5,z:0},alive:false}}).kind,'invalid');
  assert.equal(planSelectedAbility({origin:{x:0,z:0},target:null}).kind,'invalid');
});
test('physical WASD remains consistent across alternate keyboard layout keys',()=>{
  assert.equal(game3dInputKey({code:'KeyW',key:'z'}),'w');
  assert.equal(game3dInputKey({code:'KeyD',key:'D'}),'d');
  assert.equal(game3dInputKey({code:'ShiftLeft',key:'Shift'}),'shift');
});
test('opposite key presses cancel rather than create unintended motion',()=>{
  assert.deepEqual(game3dMoveAxes({w:true,s:true,a:true,d:true}),{forward:0,sideways:0});
  assert.deepEqual(game3dMoveAxes({w:true,d:true}),{forward:1,sideways:1});
});
