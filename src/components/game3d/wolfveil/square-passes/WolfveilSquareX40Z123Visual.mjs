// LAND-WS04: ONE reserved Game 3D Play 5m square X40-Z123, source-only renderer.
// This module is not imported by the shared scene. WS15 must explicitly opt in
// only after genuine GPU, terrain-contact, gameplay and multiplayer review.
import {
  WOLFVEIL_SQUARE_X40_Z123 as SQUARE,
  WOLFVEIL_X40_Z123_ART_STYLE as ART,
  auditWolfveilSquareX40Z123,
} from './WolfveilSquareX40Z123.mjs';
import {vec2,vec3,sin,normalize,smoothstep,positionGeometry} from 'three/tsl';
import {attachNodes,uniformOf,instanceRootWorld,offsetBeforeInstancing} from '../../../../lib/webgpuNodeKit.js';

// WebGPURenderer: the same anchored-tip dance in TSL (one graph for both blade kinds, like their one GLSL program)
function anchoredTipNodes({waveTime,waveGust,waveWind}){
  const root=instanceRootWorld();
  const tip=smoothstep(.12,.91,positionGeometry.y);
  const dance=sin(uniformOf(waveTime,'float').mul(1.2).add(root.x.mul(.19)).add(root.z.mul(.17)));
  const push=normalize(uniformOf(waveWind,'vec2').add(vec2(.001))).mul(dance.mul(uniformOf(waveGust,'float')).mul(tip).mul(.035));
  return {positionNode:offsetBeforeInstancing(vec3(push.x,0,push.y))};
}

const TAU=Math.PI*2;
const mounted=new WeakSet();
const isFiniteNumber=Number.isFinite;

// Rounded three-sided cross-sections with sculpted mid-ribs, never crossed
// billboard cards. Geometry lives in one shared, disposable InstancedMesh.
export function buildWolfveilX40Z123BladeGeometry(THREE,{understory=false}={}) {
  if(typeof THREE?.BufferGeometry!=='function'||
     typeof THREE?.Float32BufferAttribute!=='function')
    throw new TypeError('A current Three.js geometry interface is required');
  const positions=[],uv=[],indices=[];
  const bladeCount=understory?6:7;
  for(let blade=0;blade<bladeCount;blade++){
    const az=blade*2.3999632297;
    const spread=(understory?.035:.017)+(blade%3)*.019;
    const lean=(understory?.19:.085)+(blade%3)*.012;
    const lift=(understory?.76:.86)+(blade%3)*.035;
    const width=understory?.058:.019;
    const base=positions.length/3;
    for(const t of [0,.5,1]){
      // Roots and tips are narrow, mid-leaf remains sculpted and volumetric.
      const w=(understory?(.004+Math.sin(t*Math.PI)*width):
        (.003+(1-t)*width));
      const sway=lean*t*t;
      const cx=Math.cos(az)*(spread+sway);
      const cz=Math.sin(az)*(spread+sway);
      for(let side=0;side<3;side++){
        const a=az+side*TAU/3;
        positions.push(cx+Math.cos(a)*w,t*lift,cz+Math.sin(a)*w);
        uv.push(side/3,t);
      }
    }
    // Three slim solid faces in two vertical sections per blade/frond.
    for(let level=0;level<2;level++)for(let side=0;side<3;side++){
      const a=base+level*3+side,b=base+level*3+(side+1)%3;
      indices.push(a,b,a+3,b,b+3,a+3);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Reversible VISUAL-ONLY opt-in. Caller supplies the canonical preview and
 * the existing WolfveilBuilder/THREE; this file never modifies shared scene
 * code, terrain BVH, authoritative tree anchors or gameplay collision.
 * The host's world builder owns geometry/material disposal on teardown.
 */
export function mountWolfveilSquareX40Z123Visual({
  THREE,world,preview,enable=false,
}={}) {
  if(enable!==true)return Object.freeze({mounted:false,reason:'opt-in-disabled',
    grass:0,stones:0,understory:0,collidersAdded:0});
  if(typeof world?.mesh!=='function'||!Array.isArray(world?.ownedMaterials)||
     world?.group?.position?.z!==SQUARE.playOffsetZ||
     typeof THREE?.InstancedMesh!=='function'||typeof THREE?.MeshStandardMaterial!=='function'||
     typeof THREE?.Object3D!=='function'||typeof THREE?.Color!=='function'||
     typeof THREE?.IcosahedronGeometry!=='function')
    throw new TypeError('X40-Z123 requires the existing WolfveilBuilder and Three.js');
  if(mounted.has(world))throw new Error('X40-Z123 already mounted in this world');
  if(preview?.square?.id!==SQUARE.id||
     preview.contract?.visibleWorldOffsetZ!==SQUARE.playOffsetZ||
     preview.sceneAttached!==false||preview.rendered!==false||
     preview.collidersAdded!==0||preview.plan?.rendererMounted!==false||
     preview.plan?.changesServerCollision!==false)
    throw new Error('X40-Z123 needs an unmouted canonical Play preview (+70 world Z)');
  const audit=auditWolfveilSquareX40Z123(preview.plan);
  if(!audit.passed||preview.plan.placements.length>580)
    throw new Error('X40-Z123 art/footprint/instance budget audit failed');
  const items=preview.plan.placements;
  const byKind={
    'short-grass':items.filter(p=>p.kind==='short-grass'),
    'moss-stone':items.filter(p=>p.kind==='moss-stone'),
    'understory':items.filter(p=>p.kind==='understory'),
  };
  const specs=[
    {kind:'short-grass',key:'grass',style:ART.grass,geometry:()=>buildWolfveilX40Z123BladeGeometry(THREE)},
    {kind:'moss-stone',key:'stones',style:ART.stone,geometry:()=>new THREE.IcosahedronGeometry(1,0)},
    {kind:'understory',key:'understory',style:ART.understory,geometry:()=>buildWolfveilX40Z123BladeGeometry(THREE,{understory:true})},
  ];
  const dummy=new THREE.Object3D(),meshes=[];
  const waveTime={value:0},waveGust={value:.22};
  const waveWind={value:new THREE.Vector2(.6,.8)};
  let tipNodes=null;
  for(const spec of specs){
    const roots=byKind[spec.kind];
    if(!roots.length)continue;
    const material=new THREE.MeshStandardMaterial({color:0xffffff,
      roughness:spec.style.roughness,metalness:0,
      emissive:0,side:THREE.DoubleSide});
    material.name='Wolfveil_X40Z123_'+spec.key+'_SumiE_PBR';
    if(spec.kind!=='moss-stone'){
      material.customProgramCacheKey=()=> 'wolfveil-x40-z123-anchored-tips-v1';
      material.onBeforeCompile=shader=>{
        if(!shader.vertexShader?.includes('#include <common>')||
           !shader.vertexShader.includes('#include <begin_vertex>'))return;
        shader.uniforms.uWS04Time=waveTime;
        shader.uniforms.uWS04Wind=waveWind;
        shader.uniforms.uWS04Gust=waveGust;
        shader.vertexShader=shader.vertexShader
          .replace('#include <common>',`#include <common>\nuniform float uWS04Time,uWS04Gust;\nuniform vec2 uWS04Wind;`)
          .replace('#include <begin_vertex>',`#include <begin_vertex>\n#ifdef USE_INSTANCING\nvec3 ws04Root=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;\n#else\nvec3 ws04Root=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;\n#endif\nfloat ws04Tip=smoothstep(.12,.91,position.y);\nfloat ws04Dance=sin(uWS04Time*1.2+ws04Root.x*.19+ws04Root.z*.17);\ntransformed.xz+=normalize(uWS04Wind+vec2(.001))*.035*ws04Dance*uWS04Gust*ws04Tip;`);
      };
      tipNodes??=anchoredTipNodes({waveTime,waveGust,waveWind});
      attachNodes(material,tipNodes); // WebGPURenderer
    }
    const geometry=spec.geometry();
    const mesh=new THREE.InstancedMesh(geometry,material,roots.length);
    roots.forEach((p,i)=>{
      const isStone=spec.kind==='moss-stone';
      const isFern=spec.kind==='understory';
      dummy.position.set(p.x,isStone?p.y+p.height*.28:p.y-.008,p.z);
      dummy.rotation.set(0,p.yaw,0);
      // The actual six-frond source geometry has max planar radius ~.291.
      // Dividing by .30 keeps every transformed leaf inside its approved
      // p.radius, even next to a neighbouring author's reserved tile edge.
      const width=isStone?p.radius:isFern?p.radius/.30:p.radius/.18;
      dummy.scale.set(width,isStone?p.height*.7:p.height/(isFern?.83:.895),width);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,new THREE.Color(p.tint));
    });
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();
    mesh.name='SWV_X40Z123_'+spec.key;
    mesh.userData={decorativeOnly:true,nonCollider:true,
      wolfveilSquareId:SQUARE.id,renderWorldZOffsetAppliedByParent:true};
    mesh.raycast=()=>{};  // No proxy walkable floor or selection collider.
    mesh.castShadow=false;mesh.receiveShadow=true;
    mesh.frustumCulled=false;
    world.ownedMaterials.push(material);
    world.mesh(mesh);
    meshes.push(mesh);
  }
  mounted.add(world);
  return Object.freeze({mounted:true,grass:byKind['short-grass'].length,
    stones:byKind['moss-stone'].length,understory:byKind.understory.length,
    meshes:Object.freeze(meshes),collidersAdded:0,
    triangleBudgetPerGrassInstance:7*12,
    updateWind({time,gust,wind}={}){
      if(isFiniteNumber(time))waveTime.value=time;
      if(isFiniteNumber(gust))waveGust.value=Math.max(0,Math.min(1,gust));
      if(Array.isArray(wind)&&wind.length===2&&wind.every(isFiniteNumber)&&
          (wind[0]!==0||wind[1]!==0))waveWind.value.set(wind[0],wind[1]);
    },
  });
}
