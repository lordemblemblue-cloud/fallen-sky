// Cinematic handoff on the ACTUAL Game 3D player and world camera.
// Character creation remains in the loaded scene, and Play rotates the camera
// continuously from the last frontal preview to the ordinary Game 2/Luna pose.
export const GAME3D_WORLD_ENTRY_SECONDS = 2.6;
const clamp01=value=>Math.max(0,Math.min(1,value));
const PI2=Math.PI*2;
const deltaTime=delta=>Number.isFinite(delta)?Math.max(0,Math.min(delta,.12)):0;
const smooth=value=>value*value*(3-2*value);
const mix=(a,b,t)=>a+(b-a)*t;
const shortestArc=(a,b)=>{
  const turn=((b-a+Math.PI)%PI2+PI2)%PI2-Math.PI;
  return Math.abs(turn+Math.PI)<.00001?Math.PI:turn;
};
const MODES=Object.freeze({
  start:   {yaw:.42,distance:5.1,eyeHeight:2.3,targetHeight:1.42},
  faction: {yaw:.42,distance:4.7,eyeHeight:2.25,targetHeight:1.44},
  select:  {yaw:.42,distance:3.85,eyeHeight:2.13,targetHeight:1.45},
  creator: {yaw:.27,distance:2.65,eyeHeight:1.94,targetHeight:1.48},
});
const copyPosition=p=>({x:p.x,y:p.y,z:p.z});

export function createGame3DWorldEntryCamera({
  enabled=false,duration=GAME3D_WORLD_ENTRY_SECONDS,arcRadians=Math.PI*.78,
}={}) {
  let active=Boolean(enabled),elapsed=0,previewTime=0,previewPose=null,from=null;
  const seconds=Number.isFinite(duration)&&duration>0?duration:GAME3D_WORLD_ENTRY_SECONDS;
  const arc=Number.isFinite(arcRadians)?arcRadians:Math.PI*.78;
  return {
    isActive:()=>active,
    start:()=>{elapsed=0;from=previewPose;active=true;},
    cancel:()=>{active=false;elapsed=0;from=null;previewPose=null;},
    // Start/Faction: wider distant angle under the fading right-side shade.
    // Create: smoothly dolly to a flattering frontal body view.
    // Select: ease back for full character framing. No new scene or actor.
    preview(delta,{camera,model,mode='select',clipAgainstTerrain}={}) {
      if(!camera?.position||!model?.position)return false;
      const dt=deltaTime(delta),settings=MODES[mode]||MODES.select;
      previewTime+=dt;
      const p=model.position;
      const yaw=settings.yaw+Math.sin(previewTime*.19)*.012;
      // Keep the actor on the right side of the frame, aligned with the
      // creator's full-body stage. During Play this offset blends back to the
      // centered over-the-shoulder gameplay target.
      const portraitOffset=mode==='creator'?.82:mode==='select'?.67:.48;
      const target={x:p.x-portraitOffset,y:p.y+settings.targetHeight,z:p.z};
      const eye={x:p.x+Math.sin(yaw)*settings.distance,
        y:p.y+settings.eyeHeight,z:p.z+Math.cos(yaw)*settings.distance};
      // Frame-rate-independent dolly; do not jump when the user opens creator.
      // The first frame starts at the real camera's existing pose.
      const t=1-Math.exp(-7*dt);
      const last=previewPose;
      if(last){
        eye.x=mix(last.eye.x,eye.x,t);eye.y=mix(last.eye.y,eye.y,t);eye.z=mix(last.eye.z,eye.z,t);
        target.x=mix(last.target.x,target.x,t);target.y=mix(last.target.y,target.y,t);target.z=mix(last.target.z,target.z,t);
      }
      const safe=typeof clipAgainstTerrain==='function'?clipAgainstTerrain({eye,target}):{eye,target};
      const nextEye=safe?.eye||eye,nextTarget=safe?.target||target;
      camera.position.set(nextEye.x,nextEye.y,nextEye.z);
      camera.lookAt(nextTarget.x,nextTarget.y,nextTarget.z);
      previewPose={eye:copyPosition(nextEye),target:copyPosition(nextTarget)};
      return true;
    },
    // The normal PlayerCameraSystem has already calculated this frame's
    // final behind-player pose; interpolate from the EXACT previous portrait,
    // terrain-clipping every shot. On completion leave that normal pose intact.
    update(delta,{camera,model,clipAgainstTerrain}={}) {
      if(!active||!camera?.position||!model?.position)return false;
      elapsed+=deltaTime(delta);
      const progress=clamp01(elapsed/seconds);
      if(progress>=1){active=false;from=null;previewPose=null;return false;}
      const eased=smooth(progress),player=model.position;
      const destination=copyPosition(camera.position);
      const dx=destination.x-player.x,dz=destination.z-player.z;
      const endYaw=Math.atan2(dx,dz),endDistance=Math.max(.8,Math.hypot(dx,dz));
      const startEye=from?.eye||{
        x:player.x+Math.sin(endYaw+arc)*3.7,
        y:player.y+2.1,
        z:player.z+Math.cos(endYaw+arc)*3.7,
      };
      const startTarget=from?.target||{x:player.x,y:player.y+1.45,z:player.z};
      const startYaw=Math.atan2(startEye.x-player.x,startEye.z-player.z);
      const startDistance=Math.max(.8,Math.hypot(startEye.x-player.x,startEye.z-player.z));
      const yaw=startYaw+shortestArc(startYaw,endYaw)*eased;
      const distance=mix(startDistance,endDistance,eased);
      const eye={x:player.x+Math.sin(yaw)*distance,
        y:mix(startEye.y,destination.y,eased),
        z:player.z+Math.cos(yaw)*distance};
      const target={x:mix(startTarget.x,player.x,eased),
        y:mix(startTarget.y,player.y+1.45,eased),
        z:mix(startTarget.z,player.z,eased)};
      const safe=typeof clipAgainstTerrain==='function'?clipAgainstTerrain({eye,target}):{eye,target};
      const nextEye=safe?.eye||eye,nextTarget=safe?.target||target;
      camera.position.set(nextEye.x,nextEye.y,nextEye.z);
      camera.lookAt(nextTarget.x,nextTarget.y,nextTarget.z);
      return true;
    },
  };
}
