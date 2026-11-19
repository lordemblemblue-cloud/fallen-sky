// Inspected user GLBs: #158 has 30 skinned joints, Idle and Tail_Idle;
// #160 has 28 skinned joints and Idle_Relaxed_Tail. Their bone names differ
// from the existing baby-wolf montage and the former faction wolf/tiger rigs.
// The mappings below use the actual names in the uploaded skinned GLBs.
import * as THREE from 'three';

export const FACTION_PET_RIG_PROFILES = Object.freeze({
  winged_faction_2_158: Object.freeze({
    idle: 'Idle',
    // body direction (tail end -> head end); the model is turned so this points +Z like every other mount
    forward: Object.freeze(['pelvis', 'neck']),
    nodes: Object.freeze([
      'pelvis','spine','neck','head',
      'front_l_upper','front_l_lower','front_l_foot',
      'front_r_upper','front_r_lower','front_r_foot',
      'rear_l_upper','rear_l_lower','rear_l_foot',
      'rear_r_upper','rear_r_lower','rear_r_foot',
      'wing_l_base','wing_r_base','tail_00','tail_07',
    ]),
    map: Object.freeze({
      pelvis:'RigPelvis_01', spine:'RigSpine2_08',
      neck:'RigNeck2_018', head:'RigHead_021',
      front_l_upper:'RigLFLeg1_012',front_l_lower:'RigLFLeg2_013',front_l_foot:'RigLFLegAnkle_015',
      front_r_upper:'RigRFLeg1_034',front_r_lower:'RigRFLeg2_035',front_r_foot:'RigRFLegAnkle_037',
      rear_l_upper:'RigLBLeg1_02',rear_l_lower:'RigLBLeg2_03',rear_l_foot:'RigLBLegAnkle_05',
      rear_r_upper:'RigRBLeg1_041',rear_r_lower:'RigRBLeg2_042',rear_r_foot:'RigRBLegAnkle_044',
    }),
    limbs: Object.freeze(['front_l_upper','front_r_upper','rear_l_upper','rear_r_upper']),
  }),
  winged_faction_3_160: Object.freeze({
    idle: 'Idle_Relaxed_Tail',
    forward: Object.freeze(['pelvis', 'chest']),
    nodes: Object.freeze([
      'pelvis','spine','chest','neck','head',
      'front.L.upper','front.L.lower','front.L.paw',
      'front.R.upper','front.R.lower','front.R.paw',
      'hind.L.upper','hind.L.lower','hind.L.paw',
      'hind.R.upper','hind.R.lower','hind.R.paw',
      'wing.L.base','wing.R.base','tail.01','tail.06',
    ]),
    map: Object.freeze({
      pelvis:'RigPelvis_01',spine:'RigSpine2_08',chest:'RigChest_010',
      neck:'RigNeck2_018',head:'RigHead_021',
      'front.L.upper':'RigLFLeg1_012','front.L.lower':'RigLFLeg2_013','front.L.paw':'RigLFLegAnkle_015',
      'front.R.upper':'RigRFLeg1_034','front.R.lower':'RigRFLeg2_035','front.R.paw':'RigRFLegAnkle_037',
      'hind.L.upper':'RigLBLeg1_02','hind.L.lower':'RigLBLeg2_03','hind.L.paw':'RigLBLegAnkle_05',
      'hind.R.upper':'RigRBLeg1_041','hind.R.lower':'RigRBLeg2_042','hind.R.paw':'RigRBLegAnkle_044',
    }),
    limbs: Object.freeze(['front.L.upper','front.R.upper','hind.L.upper','hind.R.upper']),
  }),
});

const key=s=>String(s||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const boneNodes=root=>{
  const nodes=new Map();
  root.traverse(node=>{if(node.isBone)nodes.set(key(node.name),node);});
  return nodes;
};

// The uploaded #160 file stores every Idle_Relaxed_Tail rotation key as an (almost) zero or overflowing
// quaternion (its accessor min/max say so too). three.js turns those into identity or exploding bones, so
// the tail, wings, neck and head jumped out of their rest pose and the mesh vanished at the loop seam.
// Only finite, unit-length rotation keys and finite, sane translation/scale keys are kept.
export function isUsableAnimationTrack(track){
  const v=track?.values;
  if(!v||!v.length)return false;
  for(let i=0;i<v.length;i++)if(!Number.isFinite(v[i]))return false;
  if(track instanceof THREE.QuaternionKeyframeTrack||/\.quaternion$/.test(track.name)){
    for(let i=0;i<v.length;i+=4){
      const len=Math.hypot(v[i],v[i+1],v[i+2],v[i+3]);
      if(Math.abs(len-1)>.05)return false;
    }
    return true;
  }
  for(let i=0;i<v.length;i++)if(Math.abs(v[i])>1e3)return false;
  return true;
}
export function sanitizePetClip(clip){
  if(!clip)return null;
  const tracks=clip.tracks.filter(isUsableAnimationTrack);
  // a clip whose rotations were all dropped animates nothing visible (only constant TRS keys remain)
  if(!tracks.some(t=>/\.quaternion$/.test(t.name)))return null;
  return new THREE.AnimationClip(clip.name,clip.duration,tracks.map(t=>t.clone()));
}
const nativeIdle=(clips,profile)=>{
  const found=(clips||[]).find(clip=>key(clip.name)===key(profile.idle))||
    (clips||[]).find(clip=>/idle/i.test(clip.name))||null;
  return sanitizePetClip(found);
};

// Every other mount (and the baby-wolf gait source) faces +Z; companion AI yaw, the rider seat and the gait
// retarget all assume it. #160 points +X inside its root, so it travelled sideways, the rider sat across it
// and the borrowed leg swings went sideways. Turn the rigged content (not the root, which the AI rotates)
// so the profile's tail-to-head direction points +Z. Idempotent per root; clones keep the flag.
export function faceFactionPetForward(root,profileId){
  const profile=FACTION_PET_RIG_PROFILES[profileId];
  if(!root||!profile?.forward)return 0;
  if(Number.isFinite(root.userData?.factionPetFacingYaw))return root.userData.factionPetFacingYaw;
  root.updateMatrixWorld(true);
  const nodes=boneNodes(root);
  const from=nodes.get(key(profile.forward[0])),to=nodes.get(key(profile.forward[1]));
  if(!from||!to)return 0;
  const toRoot=root.matrixWorld.clone().invert();
  const dir=to.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot)
    .sub(from.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot));
  dir.y=0;
  if(dir.lengthSq()<1e-12)return 0;
  dir.normalize();
  const turn=-Math.atan2(dir.x,dir.z);
  const fix=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),turn);
  for(const child of [...root.children]){
    let rigged=false;
    child.traverse(n=>{if(n.isBone||n.isSkinnedMesh)rigged=true;});
    if(!rigged)continue; // e.g. the companion's ground ring
    child.position.applyQuaternion(fix);
    child.quaternion.premultiply(fix);
  }
  root.userData.factionPetFacingYaw=turn;
  root.updateMatrixWorld(true);
  return turn;
}

// ---------- procedural "life" layer: tail wave, wing flaps, breathing, head look ----------
const TAU=Math.PI*2;
function petParts(root){
  const bones=[];
  root.traverse(n=>{if(n.isBone)bones.push(n);});
  const num=n=>Number((key(n.name).match(/(\d+)$/)||[])[1]);
  // numbered tail joints only: #158's tail-tip sphere ('tail_ico') just rides on its parent
  const tail=bones.filter(b=>/^tail/.test(key(b.name))&&Number.isFinite(num(b))).sort((a,b)=>num(a)-num(b));
  const wings=bones.filter(b=>/wing/.test(key(b.name)));
  const byKey=name=>bones.find(b=>key(b.name)===name)||null;
  return {tail,wings,head:byKey('head'),neck:byKey('neck'),chest:byKey('chest')||byKey('spine')};
}
// The bone's local rotation in the skin's bind pose (how the model was built). #160's file rests its wings
// folded straight up, while the bind pose spreads them; the wing layer is based on the bind pose.
export function bindLocalQuaternion(root,bone){
  let skeleton=null;
  root.traverse(n=>{if(!skeleton&&n.isSkinnedMesh&&n.skeleton?.bones.includes(bone))skeleton=n.skeleton;});
  if(!skeleton)return null;
  const i=skeleton.bones.indexOf(bone),p=skeleton.bones.indexOf(bone.parent);
  if(i<0||p<0)return null;
  const world=skeleton.boneInverses[i].clone().invert(),parent=skeleton.boneInverses[p].clone().invert();
  const q=new THREE.Quaternion();
  parent.invert().multiply(world).decompose(new THREE.Vector3(),q,new THREE.Vector3());
  return q.normalize();
}
// an axis given in the root's frame, expressed in the bone's local frame for a given local base rotation
function axisInBone(root,bone,axisRoot,base){
  const rootQ=root.getWorldQuaternion(new THREE.Quaternion());
  const parentQ=bone.parent?bone.parent.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion();
  const inRoot=rootQ.clone().invert().multiply(parentQ).multiply(base);
  return axisRoot.clone().applyQuaternion(inRoot.invert()).normalize();
}
function lifeTrack(root,bone,duration,layers,base=null){
  // layers: [{axis: Vector3 (root frame), angle: t => radians}] applied on top of `base` (default: rest pose)
  const frames=Math.max(12,Math.round(duration*24));
  const times=Array.from({length:frames+1},(_,i)=>duration*i/frames);
  const restPose=bone.userData.petRestQuaternion||bone.quaternion.clone();
  bone.userData.petRestQuaternion=restPose;
  const rest=base||restPose;
  const axes=layers.map(l=>axisInBone(root,bone,l.axis,rest));
  const values=[];
  times.forEach((t,i)=>{
    const tt=i===frames?0:t; // exact loop
    const q=rest.clone();
    layers.forEach((l,k)=>q.multiply(new THREE.Quaternion().setFromAxisAngle(axes[k],l.angle(tt))));
    values.push(...q.normalize().toArray());
  });
  return new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`,times,values);
}
const DEG=Math.PI/180;
// mode: idle | walk | run. Body frame after faceFactionPetForward: forward +Z, up +Y, side = X.
export function factionPetLifeTracks(root,mode,duration){
  root.updateMatrixWorld(true);
  const {tail,wings,head,neck,chest}=petParts(root);
  const F=new THREE.Vector3(0,0,1),U=new THREE.Vector3(0,1,0),X=new THREE.Vector3(1,0,0);
  const toRoot=root.matrixWorld.clone().invert();
  const w=TAU/duration; // one full rhythm per clip, so every track loops seamlessly
  const amp={idle:{sway:9,lift:4,flap:5,tip:7},walk:{sway:11,lift:5,flap:8,tip:10},run:{sway:15,lift:8,flap:16,tip:20},
    fly:{sway:7,lift:9,flap:30,tip:22}}[mode];
  const tracks=[];
  tail.forEach((bone,i)=>{
    const lag=i*.55;
    tracks.push(lifeTrack(root,bone,duration,[
      {axis:U,angle:t=>amp.sway*DEG*Math.sin(w*t-lag)},
      {axis:X,angle:t=>amp.lift*DEG*Math.sin(2*w*t-lag*.7)},
    ]));
  });
  // wings beat together (mirrored about the body), tips trail their base
  const bases=wings.filter(b=>!/wing/.test(key(b.parent?.name||'')));
  for(const bone of wings){
    const side=Math.sign(bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot).x)||1;
    const isBase=bases.includes(bone);
    const a=(isBase?amp.flap:amp.tip)*DEG,lag=isBase?0:.6;
    tracks.push(lifeTrack(root,bone,duration,[
      {axis:F,angle:t=>side*a*Math.sin(w*t-lag)},
      ...(mode==='idle'?[{axis:U,angle:t=>side*2*DEG*Math.sin(w*t+1.1)}]:[]),
    ],bindLocalQuaternion(root,bone)));
  }
  if(mode==='idle'){
    if(head)tracks.push(lifeTrack(root,head,duration,[{axis:U,angle:t=>9*DEG*Math.sin(w*t)},{axis:X,angle:t=>3*DEG*Math.sin(2*w*t+.4)}]));
    if(neck)tracks.push(lifeTrack(root,neck,duration,[{axis:X,angle:t=>2*DEG*Math.sin(2*w*t)}]));
    if(chest)tracks.push(lifeTrack(root,chest,duration,[{axis:X,angle:t=>1.2*DEG*Math.sin(2*w*t)}]));
  }
  return tracks;
}

/**
 * Finish a winged pet's clip set: a usable native idle is kept; otherwise the idle is the procedural life
 * layer. Walk and run keep their gait tracks and get tail and wing motion in time with the stride wherever
 * the clip has none of its own.
 */
export function withFactionPetLife(root,clips,nativeClips,profileId){
  const profile=FACTION_PET_RIG_PROFILES[profileId];
  if(!profile||!root)return clips;
  const usableIdle=nativeIdle(nativeClips,profile);
  const out=[];
  for(const clip of clips){
    if(clip.name==='idle'&&usableIdle){out.push(clip);continue;}
    if(['idle','walk','run'].includes(clip.name)){
      // keep whatever the clip already drives (the retargeted wolf gait or idle) and add the rest
      const duration=clip.tracks.length?clip.duration:4;
      const has=new Set(clip.tracks.map(t=>t.name));
      const life=factionPetLifeTracks(root,clip.name,duration).filter(t=>!has.has(t.name));
      out.push(new THREE.AnimationClip(clip.name,duration,[...clip.tracks,...life]));
      continue;
    }
    out.push(clip);
  }
  if(!out.some(c=>c.name==='idle'))out.unshift(new THREE.AnimationClip('idle',4,factionPetLifeTracks(root,'idle',4)));
  // Ridden flight (character/mountFlight.mjs): the wing beat and tucked legs, with the tail and its life layer.
  if(!out.some(c=>/^fly$/i.test(c.name))){
    const fly=proceduralMountFlightClip(root,{profile,pelvisBob:profileId!=='winged_faction_3_160'});
    if(fly){
      const has=new Set(fly.tracks.map(t=>t.name));
      const life=factionPetLifeTracks(root,'fly',fly.duration).filter(t=>!has.has(t.name));
      const clip=new THREE.AnimationClip('fly',fly.duration,[...fly.tracks,...life]);
      clip.userData=fly.userData;
      out.push(clip);
    }
  }
  return out;
}

/**
 * Keep the original pet's tail and wing movements while the old baby-wolf
 * walk/run cycles drive its anatomically mapped legs and torso.
 * Avoid dueling actions on the same bone (native head/spine vs retarget).
 */
export function combineNativeFactionPetClips(nativeClips, retargetedClips, profileId) {
  const profile=FACTION_PET_RIG_PROFILES[profileId];
  if(!profile)throw new Error('Unknown faction pet rig profile');
  const embedded=nativeIdle(nativeClips,profile);
  if(!embedded)return retargetedClips;
  const idle=new THREE.AnimationClip('idle',embedded.duration,embedded.tracks.map(t=>t.clone()));
  const mapped=new Set(Object.keys(profile.map).map(key));
  const accent=embedded.tracks.filter(t=>{
    const name=t.name.slice(0,t.name.lastIndexOf('.'));
    return /tail|wing/i.test(name)&&!mapped.has(key(name))&&t instanceof THREE.QuaternionKeyframeTrack;
  });
  const result=[idle];
  for(const clip of retargetedClips){
    if(clip.name==='idle')continue;
    const duration=clip.duration,frames=Math.max(8,Math.round(duration*24));
    const times=Array.from({length:frames+1},(_,i)=>duration*i/frames);
    const extra=accent.map(track=>{
      const sample=track.createInterpolant();
      const values=times.flatMap((_,i)=>Array.from(sample.evaluate(
        // End pose matches start pose for a smooth repeat.
        i===frames?0:embedded.duration*i/frames
      )));
      return new THREE.QuaternionKeyframeTrack(track.name,times,values);
    });
    result.push(new THREE.AnimationClip(clip.name,duration,[...clip.tracks,...extra]));
  }
  return result;
}

/**
 * Offline recovery when the shared baby-wolf montage cannot load. This is a
 * small procedural gait, NOT a claim that original walking clips are embedded
 * in the new GLBs. Native idle remains preferred and intact.
 */
export function proceduralFactionPetGait(root,embeddedClips,profileId) {
  const profile=FACTION_PET_RIG_PROFILES[profileId];
  if(!profile)throw new Error('Unknown faction pet rig profile');
  const nodes=boneNodes(root);
  const idle=nativeIdle(embeddedClips,profile);
  const declared=(embeddedClips||[]).find(clip=>key(clip.name)===key(profile.idle))||(embeddedClips||[]).find(clip=>/idle/i.test(clip.name));
  const result=[];
  // an unusable native idle still yields an (empty) idle slot for withFactionPetLife to fill
  if(idle||declared)result.push(new THREE.AnimationClip('idle',idle?.duration||declared.duration,idle?idle.tracks.map(t=>t.clone()):[]));
  for(const [name,duration,amount] of [['walk',1.05,.18],['run',.66,.32]]){
    const frames=20,ts=Array.from({length:frames+1},(_,i)=>duration*i/frames);
    const tracks=profile.limbs.map((boneName,index)=>{
      const bone=nodes.get(key(boneName));
      if(!bone)return null;
      const rest=bone.quaternion.clone(),axis=new THREE.Vector3(1,0,0);
      const phase=index===0||index===3?0:Math.PI;
      const values=ts.flatMap((_,i)=>{
        const swing=Math.sin(2*Math.PI*(i===frames?0:i)/frames+phase)*amount;
        return rest.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis,swing)).normalize().toArray();
      });
      return new THREE.QuaternionKeyframeTrack(bone.uuid+'.quaternion',ts,values);
    }).filter(Boolean);
    result.push(new THREE.AnimationClip(name,duration,tracks));
  }
  return combineNativeFactionPetClips(embeddedClips,result,profileId);
}

// ---------------------------------------------------------------------------------------- flight (ridden mounts)

export const MOUNT_FLIGHT_CLIP = Object.freeze({
  name: 'fly', beatHz: 2.1, beats: 2, fps: 30,
  wingLift: 0.22,   // mean raise of the wing base above its bind pose (rad)
  wingBeat: 0.55,   // base beat amplitude (rad)
  wingTip: 0.42,    // extra tip amplitude (rad), lagging the base
  tipLag: 0.6,      // rad of beat phase
  legTuck: 0.45,    // upper legs swing back (rad); lower legs bend half as much
  bob: 0.035,       // pelvis bob per beat (model units)
});

const snapshotTransforms = (root) => {
  const saved = [];
  root.traverse((node) => saved.push([node, node.position.clone(), node.quaternion.clone(), node.scale.clone()]));
  return () => {
    for (const [node, position, quaternion, scale] of saved) {
      node.position.copy(position); node.quaternion.copy(quaternion); node.scale.copy(scale);
    }
    root.updateMatrixWorld(true);
  };
};

/** Upper-leg bones of a mount: the rig profile's limbs, a dog-map rig's Limb_0 joints, or name patterns. */
export function mountLegBones(root, { profile = null, dogMap = null } = {}) {
  const nodes = boneNodes(root);
  const fromNames = (names) => names.map((n) => nodes.get(key(n))).filter(Boolean);
  if (profile?.limbs) return fromNames(profile.limbs);
  if (dogMap) return fromNames(Object.keys(dogMap).filter((n) => /Limb_0$/i.test(n)));
  const found = [];
  nodes.forEach((bone, k) => { if (/^(front|hind|rear|fore|back)[lr].*(upper|1)$/.test(k) || /limb0$/.test(k)) found.push(bone); });
  return found;
}

/** Wing base bones (a wing bone whose parent is not a wing) with their first wing child as the tip. */
export function mountWingBones(root) {
  const wings = [];
  root.traverse((node) => {
    if (!node.isBone || !/wing/i.test(node.name) || /wing/i.test(node.parent?.name || '')) return;
    const tip = node.children.find((child) => child.isBone && /wing/i.test(child.name)) || null;
    wings.push({ base: node, tip });
  });
  return wings;
}

/**
 * A looping wing-beat flight cycle for a ridden mount (character/mountFlight.mjs). Wings beat about the body's
 * forward axis around their bind pose (#160's file rests them folded straight up, like the life layer above)
 * with the tips lagging, the upper legs tuck back, the pelvis bobs with every beat. A rig without wing bones (the
 * bear) still gets the tuck and the bob. Rotations are solved against each bone's rest world orientation, so no
 * per-rig axis table is needed. Returns null when the skeleton offers nothing to animate.
 */
export function proceduralMountFlightClip(root, { profile = null, dogMap = null, pelvisBob = true, config = MOUNT_FLIGHT_CLIP } = {}) {
  root.updateMatrixWorld(true);
  const wings = mountWingBones(root);
  const legs = mountLegBones(root, { profile, dogMap });
  const nodes = boneNodes(root);
  const pelvis = nodes.get('pelvis') || nodes.get('rigpelvis01') || nodes.get('tripospine0') || null;
  const head = nodes.get('head') || nodes.get('righead021') || null;
  if (!wings.length && !legs.length) return null;
  const restore = snapshotTransforms(root);
  for (const { base, tip } of wings) for (const bone of [base, tip]) {
    const bind = bone && bindLocalQuaternion(root, bone);
    if (bind) bone.quaternion.copy(bind);
  }
  root.updateMatrixWorld(true);
  const rootQuat = root.getWorldQuaternion(new THREE.Quaternion());
  const worldPos = (node) => node.getWorldPosition(new THREE.Vector3());
  // Body axes in world space from the skeleton: forward = pelvis -> head on the ground plane.
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rootQuat).normalize();
  let forward = pelvis && head ? worldPos(head).sub(worldPos(pelvis)) : new THREE.Vector3(0, 0, 1).applyQuaternion(rootQuat);
  forward.addScaledVector(up, -forward.dot(up));
  if (forward.lengthSq() < 1e-8) forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQuat);
  forward.normalize();
  const left = new THREE.Vector3().crossVectors(up, forward).normalize();
  const center = pelvis ? worldPos(pelvis) : worldPos(root);

  const restWorld = new Map();
  root.traverse((node) => { if (node.isBone) restWorld.set(node, node.getWorldQuaternion(new THREE.Quaternion())); });
  const wingBind = new Map(wings.flatMap(({ base, tip }) => [base, tip].filter(Boolean).map((b) => [b, b.quaternion.clone()])));
  const toBind = () => { for (const [bone, q] of wingBind) bone.quaternion.copy(q); root.updateMatrixWorld(true); };
  const setWorld = (bone, world) => {
    const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(parent.multiply(world)).normalize();
    bone.updateMatrixWorld(true);
  };
  const aboutAxis = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
  // Tuck direction per leg: the rotation that moves the child joint backwards (against the forward axis).
  const tuckSign = (bone) => {
    const child = bone.children.find((c) => c.isBone);
    if (!child) return 1;
    const before = worldPos(child);
    setWorld(bone, aboutAxis(left, 0.3).multiply(restWorld.get(bone)));
    const after = worldPos(child);
    restore(); toBind();
    return after.sub(before).dot(forward) < 0 ? 1 : -1;
  };
  const legPlan = legs.map((bone) => ({ bone, sign: tuckSign(bone), lower: bone.children.find((c) => c.isBone) || null }));
  const wingPlan = wings.map(({ base, tip }) => ({ base, tip, side: worldPos(base).sub(center).dot(left) >= 0 ? 1 : -1 }));
  const bobbing = pelvisBob && pelvis && pelvis.parent;
  const pelvisParentInverse = bobbing ? pelvis.parent.getWorldQuaternion(new THREE.Quaternion()).invert() : null;
  const pelvisParentScale = bobbing ? pelvis.parent.getWorldScale(new THREE.Vector3()).y || 1 : 1;
  const pelvisRest = bobbing ? pelvis.position.clone() : null;
  const bobDirection = bobbing ? up.clone().applyQuaternion(pelvisParentInverse).normalize().multiplyScalar(config.bob / pelvisParentScale) : null;

  const duration = config.beats / config.beatHz;
  const frames = Math.max(8, Math.round(duration * config.fps));
  const times = Array.from({ length: frames + 1 }, (_, i) => duration * i / frames);
  const tracks = new Map();
  const push = (name, value) => { if (!tracks.has(name)) tracks.set(name, []); tracks.get(name).push(...value); };
  for (let i = 0; i <= frames; i++) {
    const t = i === frames ? 0 : times[i];
    const phase = 2 * Math.PI * config.beatHz * t;
    restore(); toBind();
    for (const { base, tip, side } of wingPlan) { // parents first: the wing base before its tip
      const raise = config.wingLift + config.wingBeat * Math.sin(phase);
      setWorld(base, aboutAxis(forward, side * raise).multiply(restWorld.get(base)));
      push(`${base.name}.quaternion`, base.quaternion.toArray());
      if (tip) {
        const flick = config.wingTip * Math.sin(phase - config.tipLag);
        setWorld(tip, aboutAxis(forward, side * (raise + flick)).multiply(restWorld.get(tip)));
        push(`${tip.name}.quaternion`, tip.quaternion.toArray());
      }
    }
    for (const { bone, sign, lower } of legPlan) {
      const tuck = config.legTuck * (0.85 + 0.15 * Math.sin(phase - 0.9));
      setWorld(bone, aboutAxis(left, sign * tuck).multiply(restWorld.get(bone)));
      push(`${bone.name}.quaternion`, bone.quaternion.toArray());
      if (lower) {
        setWorld(lower, aboutAxis(left, -sign * tuck * 0.5).multiply(restWorld.get(lower)));
        push(`${lower.name}.quaternion`, lower.quaternion.toArray());
      }
    }
    if (bobbing) push(`${pelvis.name}.position`, pelvisRest.clone().addScaledVector(bobDirection, Math.sin(phase - 0.5)).toArray());
  }
  restore();
  const clipTracks = [];
  for (const [name, values] of tracks) {
    if (name.endsWith('.quaternion')) {
      for (let f = 1; f <= frames; f++) { // one hemisphere per track
        const a = (f - 1) * 4, b = f * 4;
        if (values[a] * values[b] + values[a + 1] * values[b + 1] + values[a + 2] * values[b + 2] + values[a + 3] * values[b + 3] < 0) for (let k = 0; k < 4; k++) values[b + k] = -values[b + k];
      }
      clipTracks.push(new THREE.QuaternionKeyframeTrack(name, times, values));
    } else clipTracks.push(new THREE.VectorKeyframeTrack(name, times, values));
  }
  const clip = new THREE.AnimationClip(config.name, duration, clipTracks);
  clip.userData = { loop: true, procedural: 'mount-flight', wings: wingPlan.length, legs: legPlan.length };
  return clip;
}
