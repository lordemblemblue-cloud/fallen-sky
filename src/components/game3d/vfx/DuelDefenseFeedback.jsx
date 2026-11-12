import * as THREE from 'three';

// Local-only defensive reaction at the moment the DuelSession server confirms
// a hit, block or shield absorption. Does not affect collision, invulnerability,
// hit registration, character movement or backend shield durability.
export function createDuelDefenseFeedback({scene,getActor}={}) {
  const geometry=new THREE.RingGeometry(0.48,0.62,40);
  const material=new THREE.MeshBasicMaterial({
    color:0xa8dcff,transparent:true,opacity:0,side:THREE.DoubleSide,
    depthWrite:false,blending:THREE.AdditiveBlending,
  });
  const ripple=new THREE.Mesh(geometry,material);
  ripple.name='AXEDuelDefenseConfirmation';
  ripple.visible=false;
  scene.add(ripple);
  let elapsed=1,lifetime=0.4;
  const show=({shieldAbsorbed=0,blocked=false,hpDamage=0}={})=>{
    if (!getActor?.()?.parent) return;
    if (!(shieldAbsorbed>0 || blocked || hpDamage>0)) return;
    lifetime=shieldAbsorbed>0?0.45:blocked?0.3:0.18;
    material.color.setHex(shieldAbsorbed>0?0x9bdeff:blocked?0xd8f4ff:0xffc3aa);
    elapsed=0;
    ripple.visible=true;
  };
  const update=(delta,camera)=>{
    if (!ripple.visible) return;
    elapsed+=Math.max(0,Math.min(0.1,Number(delta)||0));
    const t=Math.min(1,elapsed/lifetime);
    const actor=getActor?.();
    if (t>=1 || !actor?.parent){ripple.visible=false;return;}
    ripple.position.copy(actor.position);
    ripple.position.y+=1.25;
    if(camera)ripple.quaternion.copy(camera.quaternion);
    ripple.scale.setScalar(1+t*1.5);
    material.opacity=(1-t)*0.65;
  };
  const dispose=()=>{
    scene.remove(ripple);
    geometry.dispose();
    material.dispose();
  };
  return {show,update,dispose};
}
