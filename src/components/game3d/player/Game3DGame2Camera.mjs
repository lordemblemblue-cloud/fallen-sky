// Game 3D Play control adapter reuses the SAME camera math, mouse-look
// sensitivity, pitch range and arrow fallback as Luna's Game 2 manor.
// The reference-video's Game 3D follow shot needs a shorter, bounded boom;
// the shared Game 2 and Luna source stays unchanged.
//
// World 3D orbit yaw 0 faces -Z; the Game 2/Luna controller yaw 0 faces +Z.
// Translate by PI at the boundary, not by inverting W/A/S/D elsewhere.
import {MANOR_GAME2_CAMERA,updateManorGame2ArrowLook}
  from '../../dashboard/lakesideManor/manorGame2Controls.mjs';
import {applyManorMouseLook}
  from '../../dashboard/lakesideManor/manorMouseLook.mjs';

// Tight third-person framing from the user's gameplay video: the full-body
// character stays prominent and scroll zoom cannot pull back to a distant view.
// These bounds are Game 3D only. Preserve the shared Game 2 camera yaw,
// mouse sensitivity, pitch, target height and shoulder offset.
export const GAME3D_GAME2_CAMERA=Object.freeze({
  ...MANOR_GAME2_CAMERA,
  distance:3.45,
  minDistance:2.35,
  maxDistance:5.4,
});
export function game3dToGame2Yaw(orbitYaw=0){
  return (Number.isFinite(orbitYaw)?orbitYaw:0)+Math.PI;
}

// The THREE-based Game 3D controller consumes a camera-forward and a right
// vector. Derive both from the same Game 2 / Luna yaw convention rather than
// maintaining a separate set of potentially inverted W/A/S/D equations.
// Game 2 yaw=0 means +Z; Game 3D orbit yaw=0 means -Z.
export function game3dGame2MovementBasis(orbitYaw=0){
  const yaw=game3dToGame2Yaw(orbitYaw);
  const forward={x:Math.sin(yaw),z:Math.cos(yaw)};
  const right={x:-Math.cos(yaw),z:Math.sin(yaw)};
  return {forward,right};
}
export function applyGame3DGame2MouseLook(orbit,dx,dy,options={}){
  if(!orbit||!Number.isFinite(dx)||!Number.isFinite(dy))return false;
  // Recover from stale/non-finite orbit values before applying relative mouse
  // deltas. A poisoned pitch otherwise stays NaN and can destroy lookAt().
  const look={
    cameraYaw:game3dToGame2Yaw(orbit.yaw),
    pitch:Number.isFinite(orbit.pitch)?orbit.pitch:GAME3D_GAME2_CAMERA.pitch,
  };
  const applied=applyManorMouseLook(look,dx,dy,options);
  if(!applied)return false;
  orbit.yaw=look.cameraYaw-Math.PI;
  orbit.pitch=look.pitch;
  return true;
}
export function applyGame3DGame2ArrowLook(orbit,keys,delta){
  if(!orbit||!keys||!Number.isFinite(delta)||delta<=0)return false;
  const look={cameraYaw:game3dToGame2Yaw(orbit.yaw),pitch:orbit.pitch};
  // GameWorld3D stores lowercase event.key names, not the manor's code Set.
  const pressed={has:code=>Boolean(keys[code.toLowerCase()])};
  if(!updateManorGame2ArrowLook(look,pressed,delta))return false;
  orbit.yaw=look.cameraYaw-Math.PI;
  orbit.pitch=look.pitch;
  return true;
}
export function game3dGame2Zoom(current,deltaY){
  const prior=Number.isFinite(current)?current:GAME3D_GAME2_CAMERA.distance;
  if(!Number.isFinite(deltaY)||deltaY===0)return Math.max(
    GAME3D_GAME2_CAMERA.minDistance,
    Math.min(GAME3D_GAME2_CAMERA.maxDistance,prior));
  // Preserve the Game 2/Luna wheel notch and trackpad handling, using
  // only Game 3D's tighter zoom bounds.
  return Math.max(GAME3D_GAME2_CAMERA.minDistance,
    Math.min(GAME3D_GAME2_CAMERA.maxDistance,
      prior+Math.sign(deltaY)*.35));
}
