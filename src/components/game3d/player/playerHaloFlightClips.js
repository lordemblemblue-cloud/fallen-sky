import * as THREE from 'three';

// Rig-bound original Halo flight poses, no new model/asset dependency.
// Motion controllers own the avatar's world Y, X/Z collision and stamina.
// Hips position is never translated by animation (no roof/floor clipping).
const names=Object.freeze({
  hips:['Hips','pelvis'],
  spine:['Spine','spine_01'],
  chest:['Spine2','spine_02'],
  leftThigh:['LeftUpLeg','thigh_l'],
  rightThigh:['RightUpLeg','thigh_r'],
  leftShin:['LeftLeg','calf_l'],
  rightShin:['RightLeg','calf_r'],
  leftArm:['LeftArm','upperarm_l'],
  rightArm:['RightArm','upperarm_r'],
});
const canon=s=>String(s||'').replace(/^mixamorig:?/i,'');
const phases=[0,.12,.27,.48,.70,.88,1];
function bonesOf(model){
  const all=[];model?.traverse?.(n=>{if(n.isBone)all.push(n)});
  return Object.fromEntries(Object.entries(names).map(([k,v])=>
    [k,all.find(b=>v.includes(canon(b.name)))||null]));
}
const curves=Object.freeze({
  // Air Jump: body springs upward and travels forward at an incline.
  airJump:{duration:.28,hips:[0,-.12,-.28,-.34,-.18,-.07,0],
    chest:[0,-.20,-.40,-.48,-.27,-.06,0],
    leftThigh:[0,.22,.45,.66,.37,.07,0],
    rightThigh:[0,.12,.28,.30,.08,-.04,0],
    leftArm:[0,-.15,-.38,-.48,-.30,-.06,0],
    rightArm:[0,-.15,-.38,-.48,-.30,-.06,0]},
  // One clear air kick before the sustained alternating Skywalk gait.
  airWalkKick:{duration:.32,hips:[0,-.12,-.20,-.17,-.06,0,0],
    chest:[0,-.15,-.23,-.08,.04,0,0],
    leftThigh:[0,.24,.70,.90,.36,.05,0],
    rightThigh:[0,-.12,-.24,-.28,-.08,0,0],
    leftArm:[0,-.12,-.30,-.23,-.05,0,0],
    rightArm:[0,.08,.18,.23,.08,0,0]},
  // Air Walk: alternating outward kicks (aerial running), never root travel.
  airWalkLoop:{duration:.52,hips:[0,-.04,-.07,0,.06,.04,0],
    chest:[0,-.17,-.28,-.20,-.12,-.12,-.17],
    leftThigh:[.5,.9,.5,-.1,-.38,0,.5],
    rightThigh:[-.38,0,.5,.9,.5,-.1,-.38],
    leftArm:[-.35,-.15,.18,.34,.12,-.25,-.35],
    rightArm:[.20,.33,.10,-.23,-.35,-.08,.20]},
  // The last aerial kick compresses into a streamlined forward charge.
  airWalkFinisher:{duration:.42,hips:[0,-.18,-.42,-.38,-.15,-.05,0],
    chest:[0,-.30,-.62,-.46,-.22,-.07,0],
    leftThigh:[0,.6,.34,-.10,-.24,-.05,0],
    rightThigh:[0,.24,-.42,-.68,-.3,0,0],
    leftArm:[0,-.34,-.68,-.86,-.38,-.1,0],
    rightArm:[0,-.2,-.55,-.72,-.34,-.1,0]},
  // Long soft wing glide pose, with slight corrections rather than a run.
  wingGlide:{duration:.82,hips:[0,.02,.035,.02,-.01,-.02,0],
    chest:[-.11,-.12,-.14,-.12,-.10,-.1,-.11],
    leftThigh:[.08,.10,.14,.08,.04,.06,.08],
    rightThigh:[.08,.06,.04,.08,.14,.10,.08],
    leftArm:[-.16,-.19,-.22,-.20,-.18,-.17,-.16],
    rightArm:[-.16,-.17,-.18,-.20,-.22,-.19,-.16]},
});
const AXIS_X=new THREE.Vector3(1,0,0);
function bakeTrack(bone,curve,duration){
  if(!bone||!curve)return null;
  const rest=bone.quaternion.clone();
  const values=[];
  for(const angle of curve){
    const q=rest.clone().multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X,angle));
    values.push(...q.toArray());
  }
  return new THREE.QuaternionKeyframeTrack(bone.name+'.quaternion',
    phases.map(t=>t*duration),values);
}
export function createHaloFlightClips(model){
  const bones=bonesOf(model);
  if(!bones.hips)return {};
  return Object.fromEntries(Object.entries(curves).map(([key,definition])=>{
    const tracks=Object.entries(definition).filter(([k])=>k!=='duration')
      .map(([k,curve])=>bakeTrack(bones[k],curve,definition.duration)).filter(Boolean);
    if(!tracks.length)return [key,null];
    const clip=new THREE.AnimationClip(key,definition.duration,tracks);
    clip.userData={generatedFallback:true,source:'Game 3D Halo flight',
      localPoseOnly:true,worldRootTranslation:false};
    return [key,clip];
  }).filter(([,clip])=>clip));
}
