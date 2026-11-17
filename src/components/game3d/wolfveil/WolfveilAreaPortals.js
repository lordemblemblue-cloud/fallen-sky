// Visible gateways between the five Wolfveil areas. Each one is a slim arch
// of light over an existing road, trail or bridge where it crosses an area
// border (see streaming/WolfveilAreaPortalPlan.mjs).
//
// Decorative only: no collider, no raycast target, no trigger. The area a
// player is in still follows their position, so nothing can be skipped or
// blocked by walking around an arch. Only the gateways of the current area
// that are close enough to matter are drawn.
import * as THREE from 'three';
import {
  WOLFVEIL_AREA_PORTAL_STYLE,planWolfveilAreaPortalVisuals,
} from './streaming/WolfveilAreaPortalPlan.mjs';

const noRaycast=()=>{};

export function createWolfveilAreaPortals(world,{offsetZ=70}={}){
  if(!world?.group)throw new TypeError('Wolfveil portals require the authoritative WolfveilBuilder');
  const style=WOLFVEIL_AREA_PORTAL_STYLE;
  const plan=planWolfveilAreaPortalVisuals();
  const root=new THREE.Group();
  root.name='WV_Portal_AreaGateways';
  root.userData={wolfveilAreaShared:true,decorativeOnly:true,nonCollider:true};
  const archMaterial=new THREE.MeshBasicMaterial({
    color:style.archColor,transparent:true,opacity:.92,fog:true,toneMapped:false,
  });
  archMaterial.name='WV_Portal_ArchLight';
  const veilMaterial=new THREE.MeshBasicMaterial({
    color:style.veilColor,transparent:true,opacity:style.veilOpacity,fog:true,
    side:THREE.DoubleSide,depthWrite:false,toneMapped:false,
  });
  veilMaterial.name='WV_Portal_Veil';
  // Portals of the same width share one arch and one veil geometry.
  const geometries=new Map();
  const shapesFor=radius=>{
    const key=radius.toFixed(2);
    if(!geometries.has(key))geometries.set(key,{
      arch:new THREE.TorusGeometry(radius,style.tubeMeters,8,40,Math.PI),
      veil:new THREE.CircleGeometry(Math.max(.1,radius-style.tubeMeters),32,0,Math.PI),
    });
    return geometries.get(key);
  };
  const gateways=plan.map(entry=>{
    const group=new THREE.Group();
    group.name='WV_Portal_'+entry.id;
    group.position.set(entry.x,entry.y,entry.z); // Wolfveil local; the root adds +70 m
    group.rotation.y=entry.yaw;
    group.userData={wolfveilAreaShared:true,portalId:entry.id,areas:[entry.a,entry.b]};
    const shapes=shapesFor(entry.radius);
    const arch=new THREE.Mesh(shapes.arch,archMaterial);
    const veil=new THREE.Mesh(shapes.veil,veilMaterial);
    for(const mesh of [arch,veil]){
      mesh.raycast=noRaycast;mesh.castShadow=false;mesh.receiveShadow=false;
      mesh.userData={decorativeOnly:true,nonCollider:true};
      group.add(mesh);
    }
    veil.renderOrder=2;
    group.visible=false;
    root.add(group);
    return {entry,group};
  });
  world.group.add(root);
  let elapsed=0,enabled=true,disposed=false;

  // `position` is the player's Game 3D world position; `area` the loaded area.
  function update(dt,position,area){
    if(disposed)return;
    elapsed+=Math.max(0,Math.min(Number(dt)||0,.1));
    veilMaterial.opacity=style.veilOpacity*(1+.45*Math.sin(elapsed*1.6));
    const px=Number(position?.x),pz=Number(position?.z)-offsetZ;
    const near=Number.isFinite(px)&&Number.isFinite(pz);
    for(const {entry,group} of gateways){
      group.visible=enabled&&near&&(entry.a===area||entry.b===area)&&
        Math.hypot(entry.x-px,entry.z-pz)<=style.showWithinMeters;
    }
  }
  function dispose(){
    if(disposed)return;
    disposed=true;
    root.parent?.remove(root);
    for(const shapes of geometries.values()){shapes.arch.dispose();shapes.veil.dispose();}
    geometries.clear();
    archMaterial.dispose();veilMaterial.dispose();
  }
  return {
    root,count:gateways.length,update,dispose,
    setEnabled(next){enabled=Boolean(next);if(!enabled)for(const {group} of gateways)group.visible=false;},
    visibleIds:()=>gateways.filter(({group})=>group.visible).map(({entry})=>entry.id),
  };
}
