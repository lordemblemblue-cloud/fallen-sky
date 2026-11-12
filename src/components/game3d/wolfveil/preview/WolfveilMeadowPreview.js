import * as THREE from 'three';
import { WOLFVEIL_MEADOW, COMPACT_TOWN, COMPACT_TOWN_ROUTES } from './WolfveilCompactTownDesign.mjs';

function randomGenerator(seed){
  let value=seed>>>0;
  return () => {
    value+=0x6D2B79F5;
    let t=Math.imul(value^(value>>>15),1|value);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
const distanceToSegment=(x,z,a,b)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-(a[0]+dx*t),z-(a[1]+dz*t));
};
function nearRoute(x,z){
  return COMPACT_TOWN_ROUTES.some(route=>route.points.slice(1).some((point,i)=>
    distanceToSegment(x,z,route.points[i],point)<route.width/2+1.3));
}
function buildGrassGeometry(){
  const points=[],uv=[],indices=[];
  for(let blade=0;blade<6;blade++){
    const angle=blade*2.3999632;
    const tx=-Math.sin(angle),tz=Math.cos(angle);
    const dx=Math.cos(angle),dz=Math.sin(angle),base=points.length/3;
    const height=.75+blade%3*.12, spread=.11+blade%2*.12;
    const width=.08+(blade%3)*.02;
    for(const [t,w] of [[0,1],[.52,.62],[1,.025]]){
      const lean=t*t*(.15+.08*(blade%4));
      const cx=dx*(spread+lean),cz=dz*(spread+lean);
      for(const side of [-1,1]){
        points.push(cx+tx*side*width*w,height*t,cz+tz*side*width*w);
        uv.push((side+1)*.5,t);
      }
    }
    indices.push(base,base+1,base+2,base+1,base+3,base+2,
      base+2,base+3,base+4,base+3,base+5,base+4);
  }
  const geo=new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();
  return geo;
}
function flowerGeometry(){
  const points=[],indices=[],colors=[];
  const stem=new THREE.Color(0x557449),petal=new THREE.Color(0xffcbd2);
  const push=(a,b,c,col)=>{
    const start=points.length/3;
    for(const p of [a,b,c]){points.push(...p);colors.push(col.r,col.g,col.b);}
    indices.push(start,start+1,start+2);
  };
  push([-.028,0,0],[.028,0,0],[0,.52,0],stem);
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5,dx=Math.cos(a),dz=Math.sin(a);
    const cx=.13*dx,cz=.13*dz;
    push([0,.48,0],[cx-.08*dz,.56,cz+.08*dx],[cx*1.8,.62,cz*1.8],petal);
  }
  const geo=new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  return geo;
}
/**
 * Instanced, shader-wind meadow with real curved blade geometry, flower heads
 * and bark/soil gaps. The FBX / GLB owner assets are distinct hero assets.
 */
export function addWolfveilMeadowPreview(world,workstreamPreviewHeight) {
  const root=new THREE.Group();
  root.name='WV_WIP_MultiMinute_Grass_Flower_Meadow';
  root.userData={visualOnly:true,wind:true,nonAuthoritative:true};
  world.group.add(root);
  const windTime={value:0};
  const material=new THREE.MeshStandardMaterial({
    color:0xffffff,side:THREE.DoubleSide,roughness:.95,vertexColors:false,
  });
  material.onBeforeCompile=shader=>{
    shader.uniforms.uWindTime=windTime;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nuniform float uWindTime;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n'+
        'float bend = max(position.y, 0.0);\n'+
        'transformed.x += bend*bend*.12*sin(uWindTime*1.3 + position.z*3.2);\n'+
        'transformed.z += bend*bend*.08*cos(uWindTime*1.1 + position.x*3.7);');
  };
  const flowerMaterial=new THREE.MeshStandardMaterial({
    vertexColors:true,side:THREE.DoubleSide,roughness:.87,
  });
  world.ownedMaterials.push(material,flowerMaterial);
  const grassGeo=buildGrassGeometry(),petalGeo=flowerGeometry();
  const rand=randomGenerator(WOLFVEIL_MEADOW.seed);
  const grassSpecs=[],flowerSpecs=[];
  const width=WOLFVEIL_MEADOW.maxX-WOLFVEIL_MEADOW.minX;
  const depth=WOLFVEIL_MEADOW.maxZ-WOLFVEIL_MEADOW.minZ;
  for(let i=0;i<WOLFVEIL_MEADOW.clumps*1.7 &&
      grassSpecs.length<WOLFVEIL_MEADOW.clumps;i++){
    const x=WOLFVEIL_MEADOW.minX+rand()*width;
    const z=WOLFVEIL_MEADOW.minZ+rand()*depth;
    if(x>COMPACT_TOWN.minX-3&&z>COMPACT_TOWN.minZ-3&&z<COMPACT_TOWN.maxZ+3)continue;
    if(nearRoute(x,z))continue;
    grassSpecs.push({x,z,y:workstreamPreviewHeight(x,z),
      yaw:rand()*Math.PI*2,scale:.8+rand()*1.3,
      height:.55+rand()*.7,tone:Math.floor(rand()*5)});
    if(rand()<.17&&flowerSpecs.length<WOLFVEIL_MEADOW.flowerClusters){
      flowerSpecs.push({x:x+.18,z:z+.12,y:workstreamPreviewHeight(x+.18,z+.12),
        yaw:rand()*Math.PI*2,scale:.65+rand()*1.3});
    }
  }
  const grassTints=[
    0x426541,0x5a7846,0x7c8650,0x477c56,0x9b9255,
  ].map(value=>new THREE.Color(value));
  const dummy=new THREE.Object3D();
  // Patch-level culling avoids drawing the entire field if only one corner is seen.
  const patchSize=70,patches=new Map();
  for(const spec of grassSpecs){
    const key=Math.floor((spec.x-WOLFVEIL_MEADOW.minX)/patchSize)+':'+
      Math.floor((spec.z-WOLFVEIL_MEADOW.minZ)/patchSize);
    if(!patches.has(key))patches.set(key,[]);
    patches.get(key).push(spec);
  }
  for(const [key,specs] of patches){
    const mesh=new THREE.InstancedMesh(grassGeo,material,specs.length);
    mesh.name='WV_WIP_WindGrass_Patch_'+key;
    specs.forEach((spec,i)=>{
      dummy.position.set(spec.x,spec.y-.025,spec.z);
      dummy.rotation.set(0,spec.yaw,0);
      dummy.scale.set(spec.scale,spec.height,spec.scale);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,grassTints[spec.tone]);
    });
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow=true;mesh.castShadow=false;
    root.add(mesh);
  }
  if(flowerSpecs.length){
    const mesh=new THREE.InstancedMesh(petalGeo,flowerMaterial,flowerSpecs.length);
    mesh.name='WV_WIP_FlowerClusters_Instanced';
    flowerSpecs.forEach((spec,i)=>{
      dummy.position.set(spec.x,spec.y,spec.z);
      dummy.rotation.set(0,spec.yaw,0);
      dummy.scale.setScalar(spec.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();mesh.castShadow=false;
    root.add(mesh);
  }
  return {
    clumps:grassSpecs.length,flowers:flowerSpecs.length,patches:patches.size,
    update(delta){windTime.value+=Math.max(0,Math.min(.1,Number(delta)||0));},
  };
}
