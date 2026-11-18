// Proper world-space joint delta retargeting from the real, animated Game2
// Actor to the original separate humanoid GLTF skeletons. Do not clone Fighter.
// The neutral animation is evaluated by an independent Actor once, so first
// entering a match while jumping/running no longer permanently ruins calibration.
import * as THREE from 'three';
import {Actor} from '../engine/actor.js';
import {GAME2_NATIVE_ROLE_MAP} from './game2NativeRigRetarget.js';
const M=new THREE.Matrix4();
// Retarget scratch lives on each adapter instance: simultaneous Game 2 and
// Fleet boarding previews must not share transient quaternion values.
const AXIS=new THREE.Vector3(0,1,0);

export function nativeWorldBoneQuaternion(actor,role,out=new THREE.Quaternion()){
  const i=actor?.skel?.idx?.[GAME2_NATIVE_ROLE_MAP[role]];
  const m=actor?.Rw;
  if(i===undefined||!m||i*9+8>=m.length)return null;
  const j=i*9;
  const a=[m[j],m[j+1],m[j+2],m[j+3],m[j+4],m[j+5],m[j+6],m[j+7],m[j+8]];
  if(!a.every(Number.isFinite))return null;
  M.set(a[0],a[1],a[2],0,a[3],a[4],a[5],0,a[6],a[7],a[8],0,0,0,0,1);
  return out.setFromRotationMatrix(M).normalize();
}
export function buildGame2NeutralPose(animatedActor){
  if(!animatedActor?.skel?.anims?.BOTH_STAND1)return null;
  const reference=new Actor(animatedActor.skel);
  reference.setBoth('BOTH_STAND1',{blend:0,loop:true});
  reference.update(0);
  const neutral=new Map();
  for(const role of Object.keys(GAME2_NATIVE_ROLE_MAP)){
    const q=nativeWorldBoneQuaternion(reference,role,new THREE.Quaternion());
    if(q)neutral.set(role,q);
  }
  return neutral.size>=8?neutral:null;
}

export class Game2AvatarMotionRetargeter {
  constructor(root,rigBones,profile) {
    this.root=root;
    this.bones=rigBones;
    this.profile=profile;
    this.sourceNeutral=null;
    this.sourceSkeleton=null;
    this.bindWorld=new Map();
    this.neutralInverse=new Map();
    this.curQ=new THREE.Quaternion();
    this.relativeQ=new THREE.Quaternion();
    this.weightedQ=new THREE.Quaternion();
    this.desiredQ=new THREE.Quaternion();
    this.parentQ=new THREE.Quaternion();
    this.turnQ=new THREE.Quaternion();
    this.updated=0;
    // These WORLD orientations contain each original model's author-specific
    // parent rotations (Sketchfab/Blender/Kotor/Fortnite), not copied G2 axes.
    root.updateMatrixWorld(true);
    for(const [role,entry] of rigBones)
      this.bindWorld.set(role,entry.bone.getWorldQuaternion(new THREE.Quaternion()).clone());
    // Hierarchical order: parents must be updated before descendants or
    // the child local rotation will cancel the wrong parent world rotation.
    this.ordered=[...rigBones].sort((a,b)=>this.depth(a[1].bone)-this.depth(b[1].bone));
  }
  depth(bone){let d=0;for(let p=bone.parent;p;p=p.parent)d++;return d;}
  restore(){
    for(const entry of this.bones.values())entry.bone.quaternion.copy(entry.rest);
    this.root.updateMatrixWorld(true);
  }
  apply(actor,yaw=0){
    if(!actor?.skel||!actor?.Rw)return 0;
    if(this.sourceSkeleton!==actor.skel){
      this.sourceSkeleton=actor.skel;
      this.sourceNeutral=buildGame2NeutralPose(actor);
      this.neutralInverse.clear();
      for(const [role,q] of this.sourceNeutral||[])
        this.neutralInverse.set(role,q.clone().invert());
    }
    if(!this.sourceNeutral)return 0;
    this.restore();
    this.root.updateMatrixWorld(true);
    this.turnQ.setFromAxisAngle(AXIS,Number.isFinite(yaw)?yaw:0);
    let done=0;
    for(const [role,entry]of this.ordered){
      const bind=this.bindWorld.get(role),neutralInverse=this.neutralInverse.get(role);
      if(!bind||!neutralInverse)continue;
      if(!nativeWorldBoneQuaternion(actor,role,this.curQ))continue;
      // Crucial: the source neutral/world rotation and an imported GLB's bind
      // axes are not identical. Motion lives in the *source bind-bone basis*:
      //   relative = inverse(sourceNeutral) * sourceCurrent
      //   targetWorld = actorYaw * targetBindWorld * relative
      // The old sourceCurrent * inverse(sourceNeutral) * targetBindWorld
      // assumes both artists used the SAME world joint axes. That twists
      // arms and knees when, for example, a KOTOR bone has a rotated bind.
      this.relativeQ.copy(neutralInverse).multiply(this.curQ).normalize();
      const authoredWeight=this.profile.strength[role]??.91;
      const weight=Math.max(0,Math.min(1,Number.isFinite(authoredWeight)?authoredWeight:0));
      this.weightedQ.identity().slerp(this.relativeQ,weight);
      this.desiredQ.copy(this.turnQ).multiply(bind).multiply(this.weightedQ).normalize();
      // Hierarchical target solve: subtract the current parent world
      // orientation (which already includes the avatar's yaw and parent pose).
      // Avoid touching target-bone positions, scale or the gameplay Fighter.
      if(!entry.bone.parent)continue;
      entry.bone.parent.getWorldQuaternion(this.parentQ);
      entry.bone.quaternion.copy(this.parentQ.invert().multiply(this.desiredQ)).normalize();
      entry.bone.updateMatrixWorld(true);
      done++;
    }
    this.updated=done;
    return done;
  }
}
