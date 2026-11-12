// Optional 14.5 Three.js-only ghost markers. Not mounted by GameView.
// They intentionally use NEW meshes on a clearly separate preview layer.
import React,{useEffect} from 'react';
import * as THREE from 'three';
import {createPrivateWorldScenePreview145}
 from '../network/privateWorldScenePreview145.mjs';

function marker({kind}){
 const geometry=kind==='player'
  ?new THREE.ConeGeometry(.45,1.35,6)
  :new THREE.IcosahedronGeometry(.48,0);
 const material=new THREE.MeshBasicMaterial({
  color:kind==='player'?0x71c7ff:0xfaad75,
  transparent:true,opacity:.6,depthWrite:false,
  wireframe:true,
 });
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name='PRIVATE_145_PREVIEW_MARKER';
 mesh.renderOrder=999;
 const base=kind==='player'?0x71c7ff:0xfaad75;
 return {
  object:mesh,
  setPosition(x,y,z){mesh.position.set(x,y+.75,z)},
  setHealth({hp,maxHp,alive}){
   const pct=hp/maxHp;
   material.color.setHex(!alive?0x666666:pct<.3?0xff6565:base);
   mesh.visible=alive;
  },
  dispose(){geometry.dispose();material.dispose()},
 };
}
export default function PrivateWorldScenePreview145({
 scene,view,enabled=false,sampleHeight=()=>0,
}={}){
 useEffect(()=>{
  if(!enabled||!scene||!view)return;
  const overlay=new THREE.Group();
  overlay.name='PRIVATE_WORLD_145_READ_ONLY_OVERLAY';
  // Adapter owns a child group, not the existing scene's game entities.
  scene.add(overlay);
  const handle=createPrivateWorldScenePreview145({
   scene:overlay,view,sampleHeight,makeMarker:marker,
  });
  return ()=>{handle.dispose();scene.remove(overlay)};
 },[enabled,scene,view,sampleHeight]);
 return null;
}
