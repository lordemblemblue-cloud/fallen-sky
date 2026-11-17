import * as THREE from 'three';
import { createEightWayDodgeClips } from './playerEightWayDodgeClips.js';

// Four playable Game 3D rigs are not identical: Adam/Eve use mixamorig bones;
// Getsuga/Artemis use the original pelvis/thigh/clavicle hierarchy. When a
// downloaded/embedded animation is missing, bind a clearly marked, restrained
// pose clip to bones actually present on THAT character. Never fake an asset
// URL or reuse a track targeting a different rig. These are last-resort visual
// placeholders; the character controller still owns collision and air travel.
const keys = Object.freeze({
  hips: ['Hips', 'pelvis'],
  spine: ['Spine', 'spine_01'],
  chest: ['Spine2', 'spine_02'],
  leftThigh: ['LeftUpLeg', 'thigh_l'],
  rightThigh: ['RightUpLeg', 'thigh_r'],
  leftShin: ['LeftLeg', 'calf_l'],
  rightShin: ['RightLeg', 'calf_r'],
  leftArm: ['LeftArm', 'upperarm_l'],
  rightArm: ['RightArm', 'upperarm_r'],
});
const axis = {
  x:new THREE.Vector3(1,0,0),
  y:new THREE.Vector3(0,1,0),
  z:new THREE.Vector3(0,0,1),
};
const canonical=n=>String(n||'').replace(/^mixamorig:?/i,'');

function movementBones(model){
  const all=[];
  model?.traverse?.(n=>{if(n.isBone)all.push(n)});
  const found={};
  for(const [key,names] of Object.entries(keys)){
    found[key]=all.find(b=>names.includes(canonical(b.name)))||null;
  }
  return found;
}
function quaternionTrack(bone, times, pose, dimension='x'){
  if(!bone)return null;
  const values=[];
  for(let i=0;i<times.length;i++){
    const turns=typeof pose[i]==='number'?pose[i]:0;
    const q=bone.quaternion.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(axis[dimension],turns));
    values.push(...q.toArray());
  }
  return new THREE.QuaternionKeyframeTrack(bone.name+'.quaternion',times,values);
}
function clip(name,duration,components){
  const tracks=components.filter(Boolean);
  if(!tracks.length)return null;
  const result=new THREE.AnimationClip(name,duration,tracks);
  result.userData={generatedFallback:true,source:'Game 3D missing-motion placeholder'};
  return result;
}

// The character's Y height during a jump is managed by the motion controller;
// only rotations live in these clips (no double-applied root translation).
export function createPlayerMovementFallbackClips(model){
  const b=movementBones(model);
  if(!b.hips)return {};
  const squat=[0,-.25,-.14,0],arms=[0,.15,.2,.22];
  const start=[0,.28,.62,1];
  const landing=[0,.3,.64,1];
  const dash=[0,.16,.42,.73,1];
  const make=(name,duration,time,poses)=>clip(name,duration,
    poses.map(([bone,values,direction])=>quaternionTrack(b[bone],time.map(t=>t*duration),values,direction||'x')));
  const jumpStart=make('game3d_jump_start',.24,start,[
    ['hips',squat],['leftThigh',[0,.32,.2,0]],['rightThigh',[0,.32,.2,0]],
    ['leftArm',arms],['rightArm',arms.map(v=>-v)],
  ]);
  const jumpLoop=make('game3d_jump_loop',.34,[0,.4,1],[
    ['hips',[0,-.08,-.04]],['leftThigh',[.1,.24,.1]],['rightThigh',[.1,.2,.1]],
    ['leftArm',[.18,.24,.18]],['rightArm',[-.18,-.24,-.18]],
  ]);
  const jumpLand=make('game3d_jump_land',.22,landing,[
    ['hips',[0,-.28,-.14,0]],['leftThigh',[0,.35,.2,0]],
    ['rightThigh',[0,.35,.2,0]],['chest',[0,-.13,-.08,0]],
  ]);
  const roll=make('game3d_forward_roll',.7,[0,.17,.34,.52,.68,.85,1],[
    ['hips',[0,Math.PI/3,2*Math.PI/3,Math.PI,4*Math.PI/3,5*Math.PI/3,2*Math.PI]],
    ['leftThigh',[.05,.62,.9,.95,.75,.2,0]],
    ['rightThigh',[.05,.62,.9,.95,.75,.2,0]],
    ['leftShin',[0,-.15,-.3,-.3,-.18,0,0]],
    ['rightShin',[0,-.15,-.3,-.3,-.18,0,0]],
    ['chest',[0,-.2,-.28,-.3,-.22,-.1,0]],
  ]);
  const makeDodge=(name,direction,sign)=>make(name,.38,dash,[
    ['hips',[0,.18*sign,.33*sign,.16*sign,0],direction],
    ['chest',[0,-.13*sign,-.19*sign,-.1*sign,0],direction],
    ['leftThigh',[0,.24,.33,.15,0]],
    ['rightThigh',[0,-.12,-.24,-.1,0]],
  ]);
  const fallback=Object.fromEntries(Object.entries({
    jumpStart,jumpLoop,jumpLand,roll,
    dodgeLeft:makeDodge('game3d_dodge_left','z',1),
    dodgeRight:makeDodge('game3d_dodge_right','z',-1),
    dodgeForward:makeDodge('game3d_dodge_forward','x',-1),
    dodgeBackward:makeDodge('game3d_dodge_backward','x',1),
  }).filter(([,value])=>value));
  // Full eight-direction acrobatic dodge set uses the exact same rig bind pose.
  // Generated clips are in place; World3D alone owns collision-checked travel.
  return {...fallback,...createEightWayDodgeClips(model)};
}
