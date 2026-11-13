// Renders the valley landscaping plan: chiselled low-poly stones and grass
// tufts, batched into a handful of instanced draw calls that the camera can
// cull by region. Decorative only: never a floor, click target or collider.
import * as THREE from 'three';
import {createWolfveilTerrainSurfaceSampler} from './WolfveilTerrainSurfaceSampler.mjs';
import {planWolfveilTrailLandscaping} from './WolfveilTrailLandscapingPlan.mjs';

const ROCK_TONES=[0x6b6a63,0x7c7a6e,0x8b887b,0x5d605a,0x7a7265];
const GREEN_TONES=[0x4f6b35,0x5f7d3e,0x6f8848,0x47633a];
const DRY_TONES=[0x8a7a45,0x9b8650,0x7d6a3e,0xa3905a];
const MOSS=new THREE.Color(0x5a6b44);
const REGION=275; // metres per culling region

// 20 flat facets, pushed in and out so the silhouette reads as broken stone.
function rockGeometry(){
  const geometry=new THREE.IcosahedronGeometry(1,0),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    // Same bump for every copy of a shared corner keeps the faces closed.
    const bump=.8+.4*Math.abs(Math.sin(x*12.9898+y*78.233+z*37.719)*43758.5453%1);
    p.setXYZ(i,x*bump,(y<0?y*.5:y*.86)*bump,z*bump);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Five tapered blades, three triangles each, darker at the root.
function tuftGeometry(){
  const position=[],color=[];
  for(let blade=0;blade<5;blade++){
    const angle=blade*2.39996,dx=Math.cos(angle),dz=Math.sin(angle);
    const tx=-dz,tz=dx,root=.05+blade%3*.045,lean=.1+blade%2*.07;
    const height=.42+blade%3*.13,width=.05;
    const at=(t,side)=>[dx*(root+lean*t*t)+tx*side*width*(1-t*.75),height*t,
      dz*(root+lean*t*t)+tz*side*width*(1-t*.75)];
    const a=at(0,-1),b=at(0,1),c=at(.55,-1),d=at(.55,1),tip=at(1,0);
    for(const [v,shade] of [[a,.55],[b,.55],[c,.85],[b,.55],[d,.85],[c,.85],
      [c,.85],[d,.85],[tip,1.08]]){position.push(...v);color.push(shade,shade,shade);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
  geometry.computeVertexNormals();
  return geometry;
}

function byRegion(items){
  const regions=new Map();
  for(const item of items){
    const key=Math.floor(item.x/REGION)+':'+Math.floor(item.z/REGION);
    if(!regions.has(key))regions.set(key,[]);
    regions.get(key).push(item);
  }
  return [...regions.values()];
}

export function buildWolfveilTrailLandscaping(world,{terrainSpan=1100,terrainSegments=310}={}){
  const heightAt=createWolfveilTerrainSurfaceSampler({span:terrainSpan,segments:terrainSegments});
  const plan=planWolfveilTrailLandscaping({heightAt});
  const rockShape=rockGeometry(),tuftShape=tuftGeometry();
  const rockMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.96,flatShading:true});
  const tuftMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95,
    vertexColors:true,side:THREE.DoubleSide});
  const dummy=new THREE.Object3D(),tint=new THREE.Color();
  const batch=(geometry,material,items,name,place)=>{
    const mesh=new THREE.InstancedMesh(geometry,material,items.length);
    items.forEach((item,i)=>{
      place(item);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint);
    });
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();
    mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=false;
    mesh.raycast=()=>{};
    mesh.userData={decorativeOnly:true,source:'wolfveil_trail_landscaping'};
    return world.mesh(mesh);
  };
  for(const region of byRegion(plan.rocks))batch(rockShape,rockMaterial,region,'SWV_Landscape_Stones',r=>{
    // Sink each stone into the soil so it reads as bedded, not dropped.
    dummy.position.set(r.x,r.y-r.size*r.squash*.18,r.z);
    dummy.rotation.set(r.tilt,r.yaw,r.tilt*.6);
    dummy.scale.set(r.size*r.stretch,r.size*r.squash,r.size);
    tint.set(ROCK_TONES[Math.floor(r.tone*ROCK_TONES.length)%ROCK_TONES.length]).lerp(MOSS,r.moss*.45);
  });
  for(const region of byRegion(plan.tufts))batch(tuftShape,tuftMaterial,region,'SWV_Landscape_GrassTufts',t=>{
    dummy.position.set(t.x,t.y-.02,t.z);
    dummy.rotation.set(0,t.yaw,0);
    dummy.scale.set(t.size,t.size*(t.dry?.8:1),t.size);
    const tones=t.dry?DRY_TONES:GREEN_TONES;
    tint.set(tones[Math.floor(t.tone*tones.length)%tones.length]);
  });
  return {rocks:plan.rocks.length,tufts:plan.tufts.length,triangles:plan.triangles,
    plantAnchors:plan.plantAnchors,grassAnchors:plan.grassAnchors};
}