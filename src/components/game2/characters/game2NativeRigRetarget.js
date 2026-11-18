// Convert already-evaluated Game 2 Ghoul2 player joint motion into source
// GLB character bone ROLE rotations. This does NOT create a second controller.
// Each source clip (run, jump, saber attacks, Force casts, hit reactions) is
// sampled by the original Game 2 Actor and projected as local rotation
// differences onto semantically matching joints of the uploaded GLTF rig.
// Axes/retarget bindposes differ, so this is an approximate role remapping.
export const GAME2_NATIVE_ROLE_MAP = Object.freeze({
  pelvis:'pelvis',
  spine:'thoracic',
  head:'cranium',
  upperarm_left:'lhumerus',
  upperarm_right:'rhumerus',
  forearm_left:'lradius',
  forearm_right:'rradius',
  hand_left:'lhand',
  hand_right:'rhand',
  thigh_left:'lfemurYZ',
  thigh_right:'rfemurYZ',
  shin_left:'ltibia',
  shin_right:'rtibia',
});
const valid=q=>Array.isArray(q) && q.length===4 &&
  q.every(Number.isFinite)&&Math.hypot(...q)>.001;
export function game2NativeJointRotation(actor,role){
  const sourceName=GAME2_NATIVE_ROLE_MAP[role];
  const i=sourceName===undefined?undefined:actor?.skel?.idx?.[sourceName];
  const q=i===undefined?null:actor?.lq?.[i];
  return valid(q)?q:null;
}
export function game2QuaternionDelta(current,neutral) {
  if(!valid(current)||!valid(neutral))return null;
  const n=Math.hypot(...neutral),c=Math.hypot(...current);
  const [x,y,z,w]=current.map(v=>v/c);
  // qcurrent * inverse(qreference), glTF XYZW
  const [a,b,d,e]=neutral.map(v=>v/n);
  let out=[w*(-a)+x*e+y*(-d)-z*(-b),
           w*(-b)-x*(-d)+y*e+z*(-a),
           w*(-d)+x*(-b)-y*(-a)+z*e,
           w*e+x*a+y*b+z*d];
  if(out[3]<0)out=out.map(v=>-v);
  return out;
}
export function captureGame2RestPose(actor){
  const rest=new Map();
  for(const role of Object.keys(GAME2_NATIVE_ROLE_MAP)){
    const q=game2NativeJointRotation(actor,role);
    if(q)rest.set(role,q.slice());
  }
  return rest;
}
