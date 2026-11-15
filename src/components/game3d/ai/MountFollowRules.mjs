// Game 3D mount following: parked at the player's RIGHT shoulder, never
// in the default third-person camera boom. World orbit yaw 0 faces -Z.
// This rule is cosmetic; movement/collision/server authority stay unchanged.
export const MOUNT_SIDE_FOLLOW = Object.freeze({
  rightMeters: 1.85, // comfortably more than one foot for large mounts
  aheadMeters: 0.65,
  occlusionRadiusMeters: 1.45,
  fadeOpacity: 0.20,
});
export function mountShoulderPoint(ownerPosition,yaw=0,config=MOUNT_SIDE_FOLLOW){
  if(!ownerPosition)return null;
  const a=Number.isFinite(yaw)?yaw:0;
  return {
    x:ownerPosition.x + Math.cos(a)*config.rightMeters - Math.sin(a)*config.aheadMeters,
    z:ownerPosition.z - Math.sin(a)*config.rightMeters - Math.cos(a)*config.aheadMeters,
  };
}
// How near is the mount's head/torso to the sight segment camera -> player?
// 0/1 endpoints are deliberately excluded: standing beside the PLAYER alone
// must not ghost the pet unless it is actually between the eye and the hero.
export function mountCameraObstruction({camera,player,mount,radius=MOUNT_SIDE_FOLLOW.occlusionRadiusMeters}={}){
  if(!camera||!player||!mount)return false;
  const ax=player.x-camera.x,ay=player.y-camera.y,az=player.z-camera.z;
  const len=ax*ax+ay*ay+az*az;
  if(!(len>0.01))return false;
  const bx=mount.x-camera.x,by=mount.y-camera.y,bz=mount.z-camera.z;
  const t=(ax*bx+ay*by+az*bz)/len;
  if(t<.07||t>.94)return false;
  const dx=bx-ax*t,dy=by-ay*t,dz=bz-az*t;
  return dx*dx+dy*dy+dz*dz < radius*radius;
}
