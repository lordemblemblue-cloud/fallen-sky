import * as THREE from 'three';
import { EIGHT_WAY_DODGE_MOVES, SIDE_ROLL_VARIANTS } from './game3dEightWayDodge.mjs';

// Authored, rig-local procedural motion clips (not a fake GLB or a stretched
// four-way dodge). Each action contains a timed recoil, body tuck, rotational
// roll/step, foot recovery, and upright return. The player world root NEVER
// translates or teleports here: GameWorld3D sweeps terrain and obstacles.
//
// Adam/Eve use mixamorig names; Getsuga/Artemis use pelvis/spine_01 etc.
// Only found bones receive tracks. The start/rest quaternions are captured
// once at load, before the player starts moving or mounts a companion.
const ALIASES=Object.freeze({
  hips:['hips','pelvis'],
  spine:['spine','spine_01'],
  chest:['spine2','spine_02','chest'],
  head:['head'],
  leftThigh:['leftupleg','thigh_l'],
  rightThigh:['rightupleg','thigh_r'],
  leftShin:['leftleg','calf_l'],
  rightShin:['rightleg','calf_r'],
  leftArm:['leftarm','upperarm_l'],
  rightArm:['rightarm','upperarm_r'],
  leftForearm:['leftforearm','lowerarm_l'],
  rightForearm:['rightforearm','lowerarm_r'],
});
const canonical=value=>String(value||'').toLowerCase().replace(/^mixamorig:?/,'');
function bonesFor(model){
  const bones=[];
  model?.traverse?.(node=>{if(node.isBone)bones.push(node);});
  return Object.fromEntries(Object.entries(ALIASES).map(([name,aliases])=>[
    name,bones.find(node=>aliases.includes(canonical(node.name)))||null,
  ]));
}
function quaternionTrack(bone,times,poses){
  if(!bone)return null;
  const base=bone.quaternion.clone();
  const values=[];
  for(const [x,y,z] of poses){
    const offset=new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'YXZ'));
    values.push(...base.clone().multiply(offset).toArray());
  }
  return new THREE.QuaternionKeyframeTrack(bone.name+'.quaternion',times,values);
}
function hipHeightTrack(hips,times,drops){
  if(!hips)return null;
  const baseline=hips.position.clone();
  // FBX/Mixamo rigs often use centimetre skeleton coordinates. Deriving the
  // local offset from the bind-pose pelvis makes it scale with those models.
  const reference=Math.max(.45,Math.min(160,Math.abs(baseline.y)||1));
  const values=[];
  for(const drop of drops)values.push(baseline.x,baseline.y+drop*reference,baseline.z);
  return new THREE.VectorKeyframeTrack(hips.name+'.position',times,values);
}
function buildClip(b,move){
  const {kind,side,pitch,duration,key}=move;
  const times=[0,.10,.25,.42,.61,.81,1].map(t=>t*duration);
  const isStep=kind==='step';
  const isSideRoll=kind==='sideRoll';
  const spin=pitch*Math.PI*2;
  const lateralSpin=side*Math.PI*2;
  const tuck=[0,.20,.85,1,.78,.3,0];
  const bank=[0,.13,.36,.33,.20,.06,0];
  const heel=[0,.26,.58,.55,.26,.08,0];

  const hipPose=times.map((_,i)=>{
    if(isStep)return [-.11*tuck[i],side*.045*tuck[i],-.24*side*bank[i]/.36];
    if(isSideRoll)return [-.16*tuck[i],side*.08*tuck[i],lateralSpin*[0,.03,.22,.51,.78,.97,1][i]];
    return [spin*[0,-.02,.17,.48,.74,.96,1][i],
      side*.17*tuck[i],side*.30*bank[i]/.36];
  });
  const chestPose=times.map((_,i)=>[
    isStep?-.12*tuck[i]:-.32*tuck[i],
    side*.09*tuck[i],
    (isStep?-.28:-.24)*side*bank[i]/.36,
  ]);
  const headPose=times.map((_,i)=>[
    isStep?.05*tuck[i]:.14*tuck[i],0,-side*.06*tuck[i],
  ]);
  const leftThigh=times.map((_,i)=>[
    .06+(isStep?.38:1.02)*tuck[i]+side*(isStep?-.12:-.08)*heel[i],0,
    -side*.07*tuck[i],
  ]);
  const rightThigh=times.map((_,i)=>[
    .06+(isStep?.38:1.02)*tuck[i]+side*(isStep?.12:.08)*heel[i],0,
    side*.07*tuck[i],
  ]);
  const leftShin=times.map((_,i)=>[
    (isStep?-.16:-.70)*tuck[i],0,0,
  ]);
  const rightShin=times.map((_,i)=>[
    (isStep?-.16:-.70)*tuck[i],0,0,
  ]);
  const leftArm=times.map((_,i)=>[
    -(isStep?.20:.58)*tuck[i],0,-(.21+.13*side)*tuck[i],
  ]);
  const rightArm=times.map((_,i)=>[
    -(isStep?.20:.58)*tuck[i],0,(.21-.13*side)*tuck[i],
  ]);
  const leftForearm=times.map((_,i)=>[
    -.22*tuck[i],0,-.16*tuck[i],
  ]);
  const rightForearm=times.map((_,i)=>[
    -.22*tuck[i],0,.16*tuck[i],
  ]);
  const drops=times.map((_,i)=>isStep
    ?[0,-.05,-.09,-.03,.02,.01,0][i]
    :[0,-.08,-.22,-.34,-.24,-.09,0][i]);
  const tracks=[
    quaternionTrack(b.hips,times,hipPose),
    hipHeightTrack(b.hips,times,drops),
    quaternionTrack(b.spine,times,chestPose.map(v=>v.map(a=>a*.46))),
    quaternionTrack(b.chest,times,chestPose),
    quaternionTrack(b.head,times,headPose),
    quaternionTrack(b.leftThigh,times,leftThigh),
    quaternionTrack(b.rightThigh,times,rightThigh),
    quaternionTrack(b.leftShin,times,leftShin),
    quaternionTrack(b.rightShin,times,rightShin),
    quaternionTrack(b.leftArm,times,leftArm),
    quaternionTrack(b.rightArm,times,rightArm),
    quaternionTrack(b.leftForearm,times,leftForearm),
    quaternionTrack(b.rightForearm,times,rightForearm),
  ].filter(Boolean);
  if(!tracks.length)return null;
  const clip=new THREE.AnimationClip(key,duration,tracks);
  clip.userData={generatedFallback:true,source:'Game 3D authored eight-way dodge',direction:move.direction,
    style:kind,recoverAt:.81,worldRootTranslation:false};
  return clip;
}

export function createEightWayDodgeClips(model) {
  const bones=bonesFor(model);
  if(!bones.hips)return {};
  return Object.fromEntries([...EIGHT_WAY_DODGE_MOVES,...SIDE_ROLL_VARIANTS]
    .map(move=>[move.key,buildClip(bones,move)])
    .filter(([,clip])=>!!clip));
}
