import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {
  EIGHT_WAY_DODGE_MOVES,SIDE_ROLL_VARIANTS,EIGHT_WAY_DODGE_BY_DIRECTION,
  EIGHT_WAY_DODGE_IFRAMES_SECONDS,dodgeDirectionFromAxes,getEightWayDodgeMove,
} from '../src/components/game3d/player/game3dEightWayDodge.mjs';
import {getCharacterDodge,getCharacterPlanarVectors} from '../src/components/game3d/player/characterDodgeVector.js';
import {createEightWayDodgeClips} from '../src/components/game3d/player/playerEightWayDodgeClips.js';
import {createPlayerMovementFallbackClips} from '../src/components/game3d/player/playerMovementFallbackClips.js';
import {nativePlayerAnimationClips} from '../src/components/game3d/player/playerNativeAnimationClips.js';

const source=p=>readFileSync(new URL('../src/components/game3d/'+p,import.meta.url),'utf8');
const world=source('GameWorld3D.jsx');
const controller=source('player/LunaDashboardPlayerController.jsx');
const library=source('player/playerAnimationLibrary.jsx');
function rig(style='mixamorig'){
  const root=new THREE.Group();
  const names=style==='mixamorig'
    ?['mixamorigHips','mixamorigSpine','mixamorigSpine2','mixamorigHead',
      'mixamorigLeftUpLeg','mixamorigRightUpLeg','mixamorigLeftLeg','mixamorigRightLeg',
      'mixamorigLeftArm','mixamorigRightArm','mixamorigLeftForeArm','mixamorigRightForeArm']
    :['pelvis','spine_01','spine_02','Head','thigh_l','thigh_r','calf_l','calf_r',
      'upperarm_l','upperarm_r','lowerarm_l','lowerarm_r'];
  for(const [index,name] of names.entries()){
    const bone=new THREE.Bone();bone.name=name;
    bone.position.set(0,index===0?.94:.12,0);
    root.add(bone);
  }
  return root;
}
const nearly=(a,b,tolerance=1e-6)=>Math.abs(a-b)<=tolerance;

test('exactly eight distinct 45-degree dodge directions; diagonal speed is normalized',()=>{
  const expected=['forward','forwardRight','right','backwardRight','backward',
    'backwardLeft','left','forwardLeft'];
  assert.deepEqual(EIGHT_WAY_DODGE_MOVES.map(x=>x.direction),expected);
  assert.equal(new Set(EIGHT_WAY_DODGE_MOVES.map(x=>x.key)).size,8);
  assert.deepEqual(EIGHT_WAY_DODGE_MOVES.map(x=>x.kind),
    ['roll','roll','step','roll','roll','roll','step','roll']);
  assert.equal(EIGHT_WAY_DODGE_IFRAMES_SECONDS,.45);
  for(const movement of EIGHT_WAY_DODGE_MOVES){
    assert.equal(EIGHT_WAY_DODGE_BY_DIRECTION[movement.direction],movement);
    assert.ok(movement.duration>.4&&movement.duration<.8);
  }
  assert.equal(dodgeDirectionFromAxes(1,-1),'forwardLeft');
  assert.equal(dodgeDirectionFromAxes(1,1),'forwardRight');
  assert.equal(dodgeDirectionFromAxes(-1,-1),'backwardLeft');
  assert.equal(dodgeDirectionFromAxes(-1,1),'backwardRight');
  assert.equal(dodgeDirectionFromAxes(0,0,'backward'),'backward');
  assert.equal(dodgeDirectionFromAxes(0,0),'forward');
  assert.equal(dodgeDirectionFromAxes(0,-1),'left');
  assert.equal(dodgeDirectionFromAxes(0,1),'right');
  assert.equal(getEightWayDodgeMove('left').kind,'step');
  assert.equal(getEightWayDodgeMove('left',{roll:true}).kind,'sideRoll');
  assert.equal(getEightWayDodgeMove('right',{roll:true}).kind,'sideRoll');
  assert.equal(SIDE_ROLL_VARIANTS.length,2);
});

test('360-degree vectors follow the actual character yaw, not camera yaw',()=>{
  const actor=new THREE.Group();
  const inputs=[
    ['forward',{forward:true}],
    ['forwardLeft',{forward:true,left:true}],
    ['left',{left:true}],
    ['backwardLeft',{backward:true,left:true}],
    ['backward',{backward:true}],
    ['backwardRight',{backward:true,right:true}],
    ['right',{right:true}],
    ['forwardRight',{forward:true,right:true}],
  ];
  for(const yaw of [0,Math.PI/4,Math.PI/2,-Math.PI*.63,Math.PI]){
    actor.rotation.y=yaw;actor.updateMatrixWorld(true);
    const basis=getCharacterPlanarVectors(actor);
    const forward=basis.forward.clone(),right=basis.right.clone();
    for(const [expected,input] of inputs){
      const result=getCharacterDodge(actor,input);
      assert.equal(result.direction,expected);
      assert.ok(nearly(result.vector.length(),1),expected+' is unit-length');
      assert.ok(nearly(result.vector.y,0));
      const f=(input.forward?1:0)-(input.backward?1:0);
      const s=(input.right?1:0)-(input.left?1:0);
      const planned=forward.multiplyScalar(f).addScaledVector(right,s).normalize();
      assert.ok(result.vector.distanceTo(planned)<1e-5,expected+' yaw '+yaw);
      forward.copy(basis.forward);
    }
    const backRoll=getCharacterDodge(actor,{}, {fallback:'backward'});
    assert.equal(backRoll.direction,'backward');
    assert.ok(backRoll.vector.dot(forward)<-.999);
  }
});

test('all eight authored animation clips bind the current rig with a complete upright recovery',()=>{
  for(const style of ['mixamorig','unreal']){
    const actor=rig(style);
    const clips=createEightWayDodgeClips(actor);
    assert.equal(Object.keys(clips).length,10);
    for(const move of [...EIGHT_WAY_DODGE_MOVES,...SIDE_ROLL_VARIANTS]){
      const clip=clips[move.key];
      assert.ok(clip,move.key);
      assert.ok(nearly(clip.duration,move.duration));
      assert.equal(clip.userData.direction,move.direction);
      assert.equal(clip.userData.style,move.kind);
      assert.equal(clip.userData.worldRootTranslation,false);
      assert.ok(clip.tracks.length>=8,move.key+' animates full skeleton');
      const hipQ=clip.tracks.find(t=>t.name.toLowerCase().includes('hips.quaternion')||
        t.name.toLowerCase().includes('pelvis.quaternion'));
      const hipPosition=clip.tracks.find(t=>t.name.toLowerCase().includes('hips.position')||
        t.name.toLowerCase().includes('pelvis.position'));
      assert.ok(hipQ,move.key+' animated hip rotation');
      assert.ok(hipPosition,move.key+' crouch and recover track');
      assert.equal(hipQ.times.length,7);
      const last=Array.from(hipQ.values.slice(-4));
      const rest=new THREE.Quaternion().fromArray(last);
      assert.ok(nearly(Math.abs(rest.w),1,1e-4),move.key+' ends upright');
      assert.ok(nearly(rest.x,0,1e-4)&&nearly(rest.y,0,1e-4)&&nearly(rest.z,0,1e-4));
      const initial=Array.from(hipPosition.values.slice(0,3));
      const recovered=Array.from(hipPosition.values.slice(-3));
      assert.deepEqual(recovered,initial,'hip returns to bind-pose position');
      for(let i=0;i<hipPosition.values.length;i+=3){
        assert.ok(nearly(hipPosition.values[i],initial[0]));
        assert.ok(nearly(hipPosition.values[i+2],initial[2]));
      }
    }
    const initial=createPlayerMovementFallbackClips(actor);
    for(const move of EIGHT_WAY_DODGE_MOVES)assert.ok(initial[move.key]);
    assert.ok(initial.roll&&initial.dodgeBackward,'older dodge/roll remain available');
  }
});

test('lateral steps never become a full roll; diagonal and backward moves visibly roll',()=>{
  const clips=createEightWayDodgeClips(rig());
  const hipTrack=key=>clips[key].tracks.find(t=>t.name==='mixamorigHips.quaternion');
  for(const key of ['dodgeStepLeft','dodgeStepRight']){
    const track=hipTrack(key);
    const middle=new THREE.Quaternion().fromArray(track.values,12);
    assert.ok(Math.abs(middle.w)>.6,'sidestep should stay upright rather than somersault');
  }
  for(const key of ['dodgeRollForwardLeft','dodgeRollForwardRight',
    'dodgeRollBackward','dodgeRollBackwardLeft','dodgeRollBackwardRight']){
    const track=hipTrack(key);
    const mid=new THREE.Quaternion().fromArray(track.values,12);
    assert.ok(Math.abs(mid.w)<.5,'roll reaches inverted phase');
  }
});

test('existing actor-native dodge clips take priority when the rig supplies them',()=>{
  const actor=rig();
  const native=new THREE.AnimationClip('Dodge_Roll_Backward',.72,[
    new THREE.NumberKeyframeTrack('Dummy.weight',[0,.72],[0,1]),
  ]);
  actor.animations=[native];
  assert.equal(nativePlayerAnimationClips(actor).dodgeRollBackward,native);
});

test('world and controller implement real stamina-limited, collision-checked 360 dodge',()=>{
  // Owner, 2026-11: dodge keys point on screen (dashboard controls); the eight-way move follows the body.
  assert.match(world,/getInputDodge\(model, orbit\.current\.yaw, \{/);
  assert.match(world,/fallback: key === 'r' \? 'backward' : 'forward'/);
  assert.match(world,/const roll=getDodgeVectorAndName\('r'\);/,'R alone rolls backward');
  // The lock is the duration of the move that actually plays (game3dDodgeProfiles.mjs: the forward sidestep /
  // back roll variants when the body has their clips, otherwise the eight-way move).
  assert.match(world,/dodgeMoveFor\(dodge\.direction, \{ rollDodges \}\)\.duration/);
  assert.match(world,/playerAnim\?\.requestDodge\?\.\(dodge\.vector, dodge\.direction, \{ rollDodges \}\)/);
  assert.match(world,/playerAnim\?\.requestRoll\?\.\(roll.vector,roll.direction\)/);
  assert.match(world,/dodgeMoveFor\(roll\.direction,\{rollKey:true\}\)\.duration/);
  assert.match(world,/\|\| getEightWayDodgeMove\(direction, \{ roll: !!options\.rollKey \}\)/);
  assert.match(world,/canSpendCombatResource\('dodge'\)/);
  assert.match(world,/spendCombatResource\('dodge'\)/);
  assert.match(world,/startDodgeVanish\(\)/);
  assert.match(controller,/getEightWayDodgeMove\(directionName,\{roll:true\}\)/);
  assert.match(controller,/getEightWayDodgeMove\(directionName\)/);
  assert.match(controller,/moveWithCollision\(specialMoveVelocity.x\*step,specialMoveVelocity.z\*step\)/);
  assert.match(controller,/specialMoveTimer = Math.min\(\.68,timing.duration\)/);
  // (swimming refuses the dodge as well: player/playerSwimState.mjs)
  assert.match(controller,/isDead \|\| isMounted \|\| isSwimming \|\| isBusy/);
  assert.match(library,/^.*createPlayerMovementFallbackClips\(target\)/m);
  assert.match(library,/!\/\^dodge\(\?:Roll\|Step\)\//);
  assert.doesNotMatch(world,/dodgeVanish\.active[^\n]*model\.visible=false/);
});
