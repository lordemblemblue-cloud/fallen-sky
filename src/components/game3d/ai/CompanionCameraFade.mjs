import { mountCameraObstruction, MOUNT_SIDE_FOLLOW } from './MountFollowRules.mjs';

// Only the unmounted local companion's rendered materials are affected.
// Each material is cloned once, so outfit, avatar and shared GLB assets cannot
// inherit the opacity change. The player still sees and can use the mount.
export function createCompanionCameraFade(root){
  const materials=[];
  root?.traverse?.(object=>{
    if(!object.isMesh||!object.material)return;
    const source=Array.isArray(object.material)?object.material:[object.material];
    const clones=source.map(material=>material.clone());
    materials.push({object,original:object.material,source,clones});
    object.material=Array.isArray(object.material)?clones:clones[0];
  });
  let alpha=1;
  const cameraPoint={x:0,y:0,z:0};
  const playerPoint={x:0,y:0,z:0};
  const mountPoint={x:0,y:0,z:0};
  return {
    update({camera,player,mounted=false,delta=0}={}){
      if(!root||!camera||!player)return;
      cameraPoint.x=camera.position.x;cameraPoint.y=camera.position.y;cameraPoint.z=camera.position.z;
      playerPoint.x=player.position.x;playerPoint.y=player.position.y+1.45;playerPoint.z=player.position.z;
      mountPoint.x=root.position.x;mountPoint.y=root.position.y+1.05;mountPoint.z=root.position.z;
      const obstructed=!mounted&&root.visible!==false&&mountCameraObstruction({
        camera:cameraPoint,player:playerPoint,mount:mountPoint,
      });
      const next=obstructed?MOUNT_SIDE_FOLLOW.fadeOpacity:1;
      const blend=1-Math.exp(-11*Math.max(0,Math.min(.15,delta)));
      alpha+= (next-alpha)*blend;
      if(Math.abs(alpha-next)<.005)alpha=next;
      for(const entry of materials)entry.clones.forEach((material,i)=>{
        const source=entry.source[i];
        material.opacity=(Number.isFinite(source.opacity)?source.opacity:1)*alpha;
        material.transparent=source.transparent||alpha<.995;
        material.depthWrite=alpha<.995?false:source.depthWrite;
      });
    },
    dispose(){
      for(const entry of materials){
        entry.object.material=entry.original;
        entry.clones.forEach(material=>material.dispose());
      }
      materials.length=0;
    },
  };
}
