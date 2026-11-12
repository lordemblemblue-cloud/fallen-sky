// Shared quadruped animation track bank, derived from the existing Baby Wolf
// idle/walk/run source. Cross-rig clips require a target SKINNED hierarchy.
// Retarget *bone rotations*, never world/root translation (physics owns travel).
// If a rig uses anonymous joint names, use a bounded bone-local fallback pose
// instead of binding incompatible source tracks or leaving the mount frozen.
import * as THREE from 'three';

export const WOLF_MOUNT_CLIP_NAMES=Object.freeze(['idle','walk','run']);
const normalize=s=>String(s||'').toLowerCase().replace(/mixamorig|armature|rig|skeleton|bone|joint|def/gi,'')
  .replace(/[^a-z0-9]/g,'');
const side=s=>{
  const n=String(s||'').toLowerCase();
  if(/(?:left|lfront|lrear|lhind|_l$|\.l$|^l_|lfore|lthigh|lleg)/.test(n))return 'l';
  if(/(?:right|rfront|rrear|rhind|_r$|\.r$|^r_|rfore|rthigh|rleg)/.test(n))return 'r';
  return '';
};
const region=s=>{
  const n=normalize(s);
  if(/tail/.test(n))return 'tail';
  if(/head|jaw|muzzle/.test(n))return 'head';
  if(/neck/.test(n))return 'neck';
  if(/spine|back|chest|abdomen|torso|pelvis|hip|root/.test(n))return 'body';
  if(/front|fore|shoulder|scapula|arm/.test(n))return 'frontLeg';
  if(/hind|rear|backleg|thigh|femur|haunch/.test(n))return 'hindLeg';
  if(/leg|paw|foot|ankle|hock|knee|elbow|calf/.test(n))return 'leg';
  return '';
};
const boneDepth=bone=>{let depth=0,p=bone?.parent;while(p&&depth<64){if(p.isBone)depth++;p=p.parent;}return depth;};
const matchedKind=(name,candidates)=>{
  const n=normalize(name);
  let best=null,score=-1;
  for(const bone of candidates){
    const alias=normalize(bone.name);
    const r=region(name),r2=region(bone.name),s=side(name),s2=side(bone.name);
    const value=(alias===n&&n?12:0)+(r&&r===r2?6:0)
      +(s&&s===s2?3:0)+(Math.abs(boneDepth(bone))<8?1:0);
    if(value>score){score=value;best=bone;}
  }
  return score>=7?best:null;
};
const cloneQuaternionTrack=(track,sourceBone,targetBone)=>{
  const times=Array.from(track.times),values=[];
  // Displacement relative to SOURCE rest orientation is transferred to the
  // TARGET rest orientation: preserves its skeleton's bind pose while moving.
  const sourceRest=sourceBone.quaternion.clone().invert();
  const targetRest=targetBone.quaternion.clone();
  const animated=new THREE.Quaternion();
  for(let i=0;i<times.length;i++){
    animated.fromArray(track.values,i*4);
    const output=targetRest.clone().multiply(sourceRest).multiply(animated).normalize();
    values.push(...output.toArray());
  }
  return new THREE.QuaternionKeyframeTrack(targetBone.name+'.quaternion',times,values);
};
const findNamedBone=(bones,name)=>{
  const direct=bones.find(b=>b.name===name);
  if(direct)return direct;
  const n=normalize(name);
  return bones.find(b=>normalize(b.name)===n)||null;
};
export function extractBabyWolfMotions(clips=[]){
  const used=new Set(),out={};
  for(const kind of WOLF_MOUNT_CLIP_NAMES){
    const named=clips.find(c=>!used.has(c)&&new RegExp(kind==='run'?'run|gallop|sprint':kind==='walk'?'walk|trot':'idle|stand|rest','i').test(c?.name||''));
    const fallback=clips.find(c=>!used.has(c));
    const clip=named||fallback;
    if(clip){used.add(clip);out[kind]=clip;}
  }
  return out;
}
export function retargetBabyWolfMotions(sourceRoot,sourceClips,targetRoot){
  const targetBones=[],sourceBones=[];
  targetRoot?.traverse(n=>{if(n.isBone)targetBones.push(n);});
  sourceRoot?.traverse(n=>{if(n.isBone)sourceBones.push(n);});
  const source=extractBabyWolfMotions(sourceClips);
  const retargeted={};
  if(!targetBones.length)return {clips:[],method:'no-rig'};
  for(const kind of WOLF_MOUNT_CLIP_NAMES){
    const clip=source[kind];
    const output=[];
    if(clip&&sourceBones.length){
      const usedTarget=new Set();
      for(const track of clip.tracks){
        if(!track.name.endsWith('.quaternion')||track.values.length!==track.times.length*4)continue;
        const path=track.name.slice(0,-'.quaternion'.length);
        const src=findNamedBone(sourceBones,path);
        if(!src)continue;
        const target=findNamedBone(targetBones,path)||
          matchedKind(path,targetBones.filter(b=>!usedTarget.has(b)));
        if(!target||usedTarget.has(target))continue;
        usedTarget.add(target);
        output.push(cloneQuaternionTrack(track,src,target));
      }
    }
    if(output.length>=2)retargeted[kind]=new THREE.AnimationClip(kind,-1,output);
    else retargeted[kind]=makeQuadrupedFallback(targetBones,kind);
  }
  return {clips:WOLF_MOUNT_CLIP_NAMES.map(key=>retargeted[key]).filter(Boolean),
    method:Object.values(retargeted).some(c=>c?.userData?.proceduralFallback)?
      'baby-wolf-retarget-with-rig-fallback':'baby-wolf-retarget'};
}

// Emergency rig-local leg animation if a very different skeleton cannot map
// source joints. It still animates target bones for all THREE states.
export function makeQuadrupedFallback(bones,kind){
  if(!bones?.length)return null;
  let limbs=bones.filter(b=>/front|fore|hind|rear|thigh|upperleg|shoulder|leg/i.test(b.name));
  if(limbs.length<4){
    // Graceful anonymous-rig fallback: choose a bounded set of deeper joints
    // and leave the first (often master/root) alone.
    limbs=bones.filter(b=>boneDepth(b)>=1).slice(0,8);
  }
  if(limbs.length===0)limbs=bones.slice(1,Math.min(5,bones.length));
  if(limbs.length===0)limbs=bones.slice(0,1);
  const frames=kind==='idle'?16:20;
  const duration=kind==='run'?.58:kind==='walk'?1.05:1.8;
  const times=Array.from({length:frames+1},(_,i)=>duration*i/frames);
  const tracks=[];
  limbs.slice(0,8).forEach((bone,idx)=>{
    const rest=bone.quaternion.clone(),values=[];
    for(let i=0;i<=frames;i++){
      const t=i/frames;
      const phase=idx%4===0||idx%4===3?0:Math.PI;
      const amplitude=kind==='idle'?.015:kind==='run'?.43:.25;
      const swing=Math.sin(t*2*Math.PI+phase)*amplitude;
      const q=rest.clone().multiply(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1,0,0),swing));
      values.push(...q.toArray());
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name+'.quaternion',times,values));
  });
  const clip=new THREE.AnimationClip(kind,duration,tracks);
  clip.userData={proceduralFallback:true,source:'baby-wolf-compatible-gait-fallback'};
  return clip;
}
