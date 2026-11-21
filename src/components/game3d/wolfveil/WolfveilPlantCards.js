// Game 3D baked plant cards (2026-11-18 landscaping, round 2).
//
// Twelve plants are modelled at high poly in Blender
// (tools/landscape-bake/bake_plants.py: thousands of individual leaves,
// pinnae, petals and blades) and baked side-on into one card atlas (albedo +
// alpha, normal, AO). In game each plant is three crossed cards (6
// triangles); every card in a region is one instanced draw, the atlas cell
// is a per-instance attribute and the cards sway with the shared live wind
// (render/liveWind.mjs) including its travelling gust fronts.
//
// The procedural plant meshes stay visible until both atlas textures have
// loaded (and in Node / on a failed load); then each layer swaps over.
// Decorative only: no raycasts, colliders or walkable floors.
import * as THREE from 'three';
import {LIVE_WIND_SHEET_GLSL} from '../render/liveWind.mjs';
import {WOLFVEIL_PLANT_ATLAS,wolfveilPlantCell} from './WolfveilPlantCardAtlas.mjs';
import {byRegion} from './WolfveilTrailLandscaping.js';
import {createWolfveilPlantCardNodes} from './WolfveilPlantCardNodes.mjs';
import {attachNodes} from '../../../lib/webgpuNodeKit.js';

/** Three vertical quads at 0/60/120 degrees; x,z in [-.5,.5], y in [0,1]. */
export function createWolfveilPlantCardGeometry(){
  const pos=[],uv=[],nrm=[],idx=[];
  for(let k=0;k<3;k++){
    const a=k*Math.PI/3,cx=Math.cos(a),cz=Math.sin(a),base=pos.length/3;
    // Up-biased normals: foliage cards light like a soft volume, not a sheet.
    const n=new THREE.Vector3(-cz*.45,.85,cx*.45).normalize();
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]){
      pos.push((u-.5)*cx,v,(u-.5)*cz);uv.push(u,v);nrm.push(n.x,n.y,n.z);
    }
    idx.push(base,base+1,base+2,base,base+2,base+3);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const VERTEX_HEAD=`
attribute vec4 aCell;
uniform float uPlantTime,uPlantGust;
uniform vec2 uPlantWind,uPlantSheet;
${LIVE_WIND_SHEET_GLSL}`;
const VERTEX_UV=`
#ifdef USE_MAP
vMapUv=uv*aCell.zw+aCell.xy;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv=uv*aCell.zw+aCell.xy;
#endif`;
// World-space sway: roots never move; tips lean downwind and lay over as a
// gust front passes, scaled by the card's real height.
const VERTEX_PROJECT=`
vec4 mvPosition=vec4(transformed,1.);
float plantSize=1.;
vec3 plantRoot=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;
#ifdef USE_INSTANCING
mvPosition=instanceMatrix*mvPosition;
plantSize=length(instanceMatrix[1].xyz);
plantRoot=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
#endif
vec4 plantWorld=modelMatrix*mvPosition;
float flex=position.y*position.y;
vec2 wd=normalize(uPlantWind+vec2(.0001));
float front=liveWindSheet(plantRoot.xz,wd,uPlantSheet.x)*(.35+.65*uPlantSheet.y);
float sway=.6*sin(uPlantTime*1.9+plantRoot.x*.21+plantRoot.z*.17)+.4*sin(uPlantTime*3.3+plantRoot.z*.31-plantRoot.x*.11);
plantWorld.xz+=wd*(sway*(.035+.05*uPlantGust)+front*(.09+.07*uPlantGust))*flex*plantSize;
plantWorld.y-=front*.03*flex*plantSize;
mvPosition=viewMatrix*plantWorld;
gl_Position=projectionMatrix*mvPosition;`;

/**
 * One shared card material + atlas for every plant layer of a scene.
 * layer(world, items, {...}) adds instanced cards for a list of items;
 * update(frame) feeds the scene's live-wind frame.
 */
export function createWolfveilPlantCardKit({textures=typeof document!=='undefined',loader=null}={}){
  const uniforms={uPlantTime:{value:0},uPlantWind:{value:new THREE.Vector2(.6,.8)},
    uPlantGust:{value:.3},uPlantSheet:{value:new THREE.Vector2(0,0)}};
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.86,metalness:0,
    side:THREE.DoubleSide,alphaTest:.42});
  material.name='SWV_BakedPlantCards';
  material.customProgramCacheKey=()=> 'wolfveil-baked-plant-cards-v3';
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>'+VERTEX_HEAD)
      .replace('#include <uv_vertex>','#include <uv_vertex>'+VERTEX_UV)
      .replace('#include <project_vertex>',VERTEX_PROJECT);
    // Card lighting: the baked normal map is applied in a tangent frame built
    // from the TRUE card face (screen derivatives, turned toward the viewer),
    // then blended toward the soft up-biased foliage normal. (Feeding the
    // up-biased normal into getTangentFrame breaks the frame: black texels.)
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
{
  vec3 cardN=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
  if(dot(cardN,vViewPosition)<0.)cardN=-cardN;
  normal=cardN;
#ifdef USE_NORMALMAP_TANGENTSPACE
  tbn=getTangentFrame(-vViewPosition,cardN,vNormalMapUv);
#endif
}`)
      .replace('#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n  normal=normalize(mix(normal,normalize(vNormal),.5));');
  };
  attachNodes(material,createWolfveilPlantCardNodes(uniforms)); // WebGPURenderer: the same cards in TSL
  const geometry=createWolfveilPlantCardGeometry();
  const layers=[],owned=[geometry,material];
  const state={ready:false,failed:false,disposed:false};
  function swap(){
    for(const l of layers){
      for(const m of l.meshes)m.visible=true;
      for(const m of l.fallback)m.visible=false;
    }
  }
  if(textures){
    const tl=loader||new THREE.TextureLoader(),maps={};
    for(const [key,url,srgb] of [['map',WOLFVEIL_PLANT_ATLAS.albedoUrl,true],['normalMap',WOLFVEIL_PLANT_ATLAS.normalUrl,false]]){
      tl.load(url,t=>{
        if(state.disposed){t.dispose();return;}
        t.anisotropy=8;
        if(srgb)t.colorSpace=THREE.SRGBColorSpace;
        t.needsUpdate=true;
        owned.push(t);
        maps[key]=t;
        if(maps.map&&maps.normalMap){
          material.map=maps.map;material.normalMap=maps.normalMap;
          material.normalScale.set(.8,.8);material.needsUpdate=true;
          state.ready=true;swap();
        }
      },undefined,()=>{state.failed=true;});
    }
  }
  return {
    material,uniforms,
    get ready(){return state.ready;},
    get failed(){return state.failed;},
    get count(){return layers.reduce((s,l)=>s+l.count,0);},
    /**
     * items: [{x,y,z,yaw,...}]; cellOf(item) -> atlas cell name;
     * heightOf(item) -> card height in metres; tintOf(item) -> [r,g,b].
     * fallback: meshes to hide once the atlas is ready.
     */
    layer(world,items,{name,cellOf,heightOf,tintOf=()=>[1,1,1],fallback=[],sink=.02}){
      const meshes=[];
      const dummy=new THREE.Object3D(),tint=new THREE.Color();
      for(const region of byRegion(items)){
        const mesh=new THREE.InstancedMesh(geometry,material,region.length);
        const cells=new Float32Array(region.length*4);
        region.forEach((item,i)=>{
          const cell=wolfveilPlantCell(cellOf(item));
          const h=heightOf(item,cell);
          dummy.position.set(item.x,item.y-sink*h,item.z);
          dummy.rotation.set(0,item.yaw||0,0);
          dummy.scale.set(h,h,h);
          dummy.updateMatrix();
          mesh.setMatrixAt(i,dummy.matrix);
          const t=tintOf(item);
          mesh.setColorAt(i,tint.setRGB(t[0],t[1],t[2]));
          cells.set(cell.uv,i*4);
        });
        mesh.geometry=geometry;
        mesh.instanceMatrix.needsUpdate=true;
        if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
        // Per-instance atlas cell, on a per-mesh clone of the shared buffers.
        const g=geometry.clone();
        g.setAttribute('aCell',new THREE.InstancedBufferAttribute(cells,4));
        owned.push(g);
        mesh.geometry=g;
        mesh.computeBoundingSphere();
        mesh.name=name;
        mesh.receiveShadow=true;mesh.castShadow=false;
        mesh.raycast=()=>{};
        mesh.visible=state.ready;
        mesh.userData={decorativeOnly:true,nonCollider:true,bakedPlantCards:true};
        world.mesh(mesh);
        meshes.push(mesh);
      }
      const layer={name,meshes,fallback,count:items.length};
      layers.push(layer);
      if(state.ready)for(const m of fallback)m.visible=false;
      return layer;
    },
    update(frame){
      if(!frame)return;
      if(Number.isFinite(frame.time))uniforms.uPlantTime.value=frame.time;
      if(Array.isArray(frame.wind)&&frame.wind.every(Number.isFinite))uniforms.uPlantWind.value.set(frame.wind[0],frame.wind[1]);
      if(Number.isFinite(frame.gust))uniforms.uPlantGust.value=frame.gust;
      if(Number.isFinite(frame.windSheet))uniforms.uPlantSheet.value.set(frame.windSheet,frame.windGust||0);
    },
    dispose(){
      state.disposed=true;
      for(const o of owned)o.dispose?.();
    },
  };
}
