// Reusable sculpted geometry and instancing for the Wolfveil Valley
// reference-driven Game 1 environment. THREE is already the Game 3D engine.
import * as THREE from 'three';
import {wolfveilSWDirtPathTint} from './WolfveilSWQuarterQuality.mjs';
import {buildWolfveilRiverSurfaceAttributes} from './WolfveilSilverRiverFlow.mjs';
import {wolfveilRiverCrossSections} from './WolfveilRiverBanks.mjs';
import {fitWolfveilWaterToBanks,resampleWolfveilRiverPoints} from './WolfveilRiverShoreline.mjs';
import {createWolfveilSilverRiverMaterial} from './WolfveilSilverRiverMaterial.js';
import {createWolfveilTerrainSurfaceSampler} from './WolfveilTerrainSurfaceSampler.mjs';
import {createWolfveilPathSurface} from './WolfveilPathSurface.mjs';
import {WOLFVEIL_PALETTE as PAL,wolfveilHeight,wolfveilDistanceToRiver,
} from './WolfveilLayout.js';
import { WOLFVEIL_PALACE, WOLFVEIL_PALACE_APPROACH } from './WolfveilPalaceLayout.mjs';
const TAU=Math.PI*2;
export const clamp=(a,min,max)=>Math.max(min,Math.min(max,a));
export const smooth=(a,b,t)=>{const q=clamp((t-a)/(b-a),0,1);return q*q*(3-2*q);};
export const mulberry32=(seed)=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
export const material=(hex,roughness=.83,opts={})=>new THREE.MeshStandardMaterial({
  color:hex,roughness,metalness:0,...opts,
});
const sharedCube=new THREE.BoxGeometry(1,1,1);
const sharedColumn=new THREE.CylinderGeometry(1,1,1,9);
export class WolfveilBuilder {
  constructor(scene){
    this.scene=scene;this.group=new THREE.Group();
    this.group.name='Game1_ShadowWolf_WolfveilValley';
    this.group.userData.environment='wolfveil';
    scene.add(this.group);
    this.positions=new Map();this.meshes=[];this.ownedMaterials=[];
    this.materials={
      cedar:material(PAL.cedar,.85),cedarLight:material(PAL.cedarLight,.87),
      darkCedar:material(0x3c2820,.84), plaster:material(PAL.plaster,.95),
      indigo:material(PAL.indigo,.55),roofEdge:material(PAL.roofLight,.58),
      basalt:material(PAL.basalt,.91),granite:material(PAL.granite,.89),
      moss:material(PAL.moss,.92),ink:material(PAL.ink,.86),
      lantern:material(PAL.lantern,.43,{emissive:PAL.lantern,emissiveIntensity:.8}),
      spirit:material(PAL.spirit,.4,{emissive:0x5c389c,emissiveIntensity:.8}),
      coral:material(PAL.autumn,.83),
    };
    this.ownedMaterials.push(...Object.values(this.materials));
  }
  box(id,x,y,z,w,h,d,yaw=0){
    if(!(w>0&&h>0&&d>0))throw Error('Invalid Wolfveil box '+id);
    let data=this.positions.get(id);
    if(!data){data=[];this.positions.set(id,data);}
    data.push({x,y,z,w,h,d,yaw});
  }
  mesh(object){
    this.group.add(object);this.meshes.push(object);
    return object;
  }
  flush(){
    const dummy=new THREE.Object3D();
    for(const [name,positions] of this.positions){
      if(!positions.length)continue;
      const isPost=name==='wolf_pillar';
      const m=new THREE.InstancedMesh(isPost?sharedColumn:sharedCube,
        this.materials[name]||this.materials.basalt,positions.length);
      for(let i=0;i<positions.length;i++){
        const b=positions[i];dummy.position.set(b.x,b.y,b.z);
        dummy.rotation.set(0,b.yaw,0);
        dummy.scale.set(b.w,b.h,b.d);dummy.updateMatrix();
        m.setMatrixAt(i,dummy.matrix);
      }
      m.name='SWV_Instanced_'+name;
      m.instanceMatrix.needsUpdate=true;m.receiveShadow=true;
      m.castShadow=['cedar','cedarLight','basalt','darkCedar'].includes(name)&&positions.length<350;
      m.frustumCulled=false;this.mesh(m);
    }
  }
  dispose(){
    // Shared immutable Game 3D foliage can be attached to several instanced
    // meshes. Release each geometry one time, not once per mesh reference.
    // Game 1's separate geometries behave identically.
    const releasedGeometries=new Set();
    for(const m of this.meshes){
      m.traverse((child)=>{
        const geometry=child.geometry;
        if(geometry&&geometry!==sharedCube&&geometry!==sharedColumn&&
           !releasedGeometries.has(geometry)){
          releasedGeometries.add(geometry);
          geometry.dispose?.();
        }
        if(child.material&&!this.ownedMaterials.includes(child.material)){
          if(Array.isArray(child.material))child.material.forEach(mat=>mat.dispose?.());
          else child.material.dispose?.();
        }
      });
    }
    for(const m of this.ownedMaterials){m.map?.dispose?.();m.dispose();}
    this.group.parent?.remove(this.group);
  }
}
// Builder for world-space unindexed colored triangles; keeps roofs/walls/paths
// in a small number of material batches instead of thousands of draw calls.
export class WolfveilTriangles{
  constructor(){this.v=[];this.c=[];this.uv=[];this.tris=0;}
  tri(a,b,c,col=[1,1,1],uv=[[0,0],[1,0],[0,1]]){
    for(let i=0;i<3;i++){
      const p=[a,b,c][i];this.v.push(...p);this.c.push(...col);this.uv.push(...uv[i]);
    }
    this.tris++;
  }
  quad(a,b,c,d,col=[1,1,1],uv=[[0,0],[1,0],[1,1],[0,1]]){
    this.tri(a,b,c,col,[uv[0],uv[1],uv[2]]);
    this.tri(a,c,d,col,[uv[0],uv[2],uv[3]]);
  }
  geometry(){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.v,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));
    g.computeVertexNormals();return g;
  }
}
export function buildWolfveilTerrain({span=1100,segments=310}={}){
  const g=new THREE.BufferGeometry(),v=[],c=[],uv=[],idx=[];
  const rand=Math.sin;
  for(let zi=0;zi<=segments;zi++){
    const z=(zi/segments-.5)*span;
    for(let xi=0;xi<=segments;xi++){
      const x=(xi/segments-.5)*span,y=wolfveilHeight(x,z);
      v.push(x,y,z);uv.push(x/7,z/7);
      const riverDistance=wolfveilDistanceToRiver(x,z);
      const moist=Math.max(0,1-riverDistance/70);
      const woodland=smooth(90,350,-x);
      const altitude=smooth(95,260,y);
      const noise=.5+.5*rand(x*.071+rand(z*.034))*rand(z*.053-x*.061);
      const dry=[.44,.58,.30],wood=[.26,.42,.29],stone=[.58,.60,.58];
      const soil=[.56,.46,.34];
      const t=clamp(.15+.37*noise,0,1);
      const sample=[0,1,2].map(k=>dry[k]*(1-woodland*.63)+wood[k]*woodland*.63);
      for(let k=0;k<3;k++){
        sample[k]=sample[k]*(1-altitude*.80)+stone[k]*altitude*.80;
        sample[k]=sample[k]*(1-moist*.39)+soil[k]*moist*.39;
        sample[k]*=.84+t*.30;
      }
      // Earth/gravel shoreline is part of the ONE physical terrain,
      // never a second floating overlay. Break up the old featureless bank
      // with a muted mineral strip that follows each actual river bend.
      const bankBand=smooth(8,14,riverDistance)*
        (1-smooth(26,37,riverDistance));
      const riverbedShade=smooth(0,10,riverDistance);
      const bankRock=[.43,.48,.47],riverGravel=[.34,.39,.38];
      for(let k=0;k<3;k++){
        sample[k]=sample[k]*(1-bankBand*.39)+bankRock[k]*bankBand*.39;
        sample[k]=sample[k]*(1-(1-riverbedShade)*.24)+
          riverGravel[k]*(1-riverbedShade)*.24;
      }
      c.push(...sample);
    }
  }
  for(let z=0;z<segments;z++)for(let x=0;x<segments;x++){
    const p=z*(segments+1)+x,q=p+segments+1;
    idx.push(p,q,p+1,q,q+1,p+1);
  }
  g.setIndex(idx);
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();
  return g;
}
export function makeRidgeGeometry(center,depth=340,seed=98){
  const rand=mulberry32(seed);
  const triangles=new WolfveilTriangles();
  const [x,z]=center;
  // Five broad fractured belts and a serrated summit replace the former
  // four giant flat triangles. Major crags show stratified rock faces, long
  // erosion grooves and snow/mineral shelves from multiple viewing angles.
  const sections=29,levels=[1,.83,.59,.36,.17,.045],rings=[];
  const peakY=wolfveilHeight(x,z)+160+rand()*53;
  const profile=Array.from({length:sections},(_,i)=>.74+.28*rand()+
    .21*Math.sin(i/sections*TAU*3)+.10*Math.sin(i/sections*TAU*7));
  for(let tier=0;tier<levels.length;tier++){
    const w=levels[tier],ratio=tier/(levels.length-1);
    rings[tier]=Array.from({length:sections},(_,i)=>{
      const a=i/sections*TAU,
        r=depth*.53*w*profile[i]*(.82+.17*Math.sin(i*12.3+tier*4.13));
      const xx=x+Math.cos(a)*r+(rand()-.5)*w*2.5,
        zz=z+Math.sin(a)*r+(rand()-.5)*w*2.5;
      const ground=wolfveilHeight(xx,zz);
      const y=(1-ratio)*Math.max(ground-3,ground+ratio*34)+
        ratio*peakY+(rand()-.5)*(2+ratio*11);
      return [xx,y,zz];
    });
  }
  const summit=[x+(rand()-.5)*10,peakY+12,z+(rand()-.5)*10];
  for(let tier=0;tier<levels.length-1;tier++){
    for(let i=0;i<sections;i++){
      const n=(i+1)%sections,
        shade=.70+rand()*.34,
        isSnow=tier>=4&&i%3===0;
      const col=isSnow?[.67,.71,.73]:
        [.31*shade+.06,.38*shade+.05,.43*shade+.03];
      triangles.quad(rings[tier][i],rings[tier][n],
        rings[tier+1][n],rings[tier+1][i],col);
    }
  }
  for(let i=0;i<sections;i++)
    triangles.tri(rings.at(-1)[i],rings.at(-1)[(i+1)%sections],
      summit,[.62,.66,.67]);
  return triangles.geometry();
}
export function addWolfEarPeaks(world){
  const peaks=[
    {name:'SWV_TwinWolfEarPeak_West',x:-76,z:477,size:185,seed:84},
    {name:'SWV_TwinWolfEarPeak_East',x:52,z:502,size:160,seed:85},
    {name:'SWV_RidgeSouth',x:-510,z:280,size:230,seed:93},
    {name:'SWV_RidgeEast',x:480,z:275,size:215,seed:101},
    {name:'SWV_SnowRidge',x:45,z:740,size:310,seed:75},
  ];
  for(const p of peaks){
    const rock=world.mesh(new THREE.Mesh(makeRidgeGeometry([p.x,p.z],p.size,p.seed),
      material(0xffffff,.92,{vertexColors:true,side:THREE.DoubleSide})));
    rock.name=p.name;rock.receiveShadow=true;
  }
}
export function addWolfveilPaths(world,routes,{
  excludePalaceApproach=false,swQuarterQuality=false,canonicalPlaySurface=false,
  terrainSpan=1100,terrainSegments=310,coalesceTerrainStrips=true,
}={}){
  // The real Luna entrance already has seven physical stairs. On the live
  // palace map, the old road must not cover these or the hillside treads.
  const mesh=new WolfveilTriangles();
  const surface=canonicalPlaySurface?createWolfveilTerrainSurfaceSampler({
    span:terrainSpan,segments:terrainSegments,
  }):null;
  const project=canonicalPlaySurface?createWolfveilPathSurface({
    heightAt:wolfveilHeight,span:terrainSpan,segments:terrainSegments,
  }):null;
  function emit(strip){
    if(!strip)return;
    const {corners,pathTint,x0,z0,x1,z1,nx,nz}=strip;
    const projected=project(corners);
    if(projected){
      const dx=x1-x0,dz=z1-z0,length2=dx*dx+dz*dz;
      const acrossX=nx*2,acrossZ=nz*2,width2=acrossX*acrossX+acrossZ*acrossZ;
      const uv=p=>[((p[0]-corners[0][0])*acrossX+
        (p[2]-corners[0][1])*acrossZ)/width2,
        ((p[0]-x0)*dx+(p[2]-z0)*dz)/length2];
      for(const tri of projected)mesh.tri(...tri,pathTint,tri.map(uv));
    }else{
      const vertex=p=>[p[0],surface(p[0],p[1])+.10,p[1]];
      mesh.quad(vertex(corners[0]),vertex(corners[1]),
        vertex(corners[2]),vertex(corners[3]),pathTint);
    }
  }
  const samePoint=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;
  const rectangularCore=({corners:c})=>c.every(p=>p.every(v=>Math.abs(v)<=terrainSpan*.5))&&
    Math.abs((c[1][0]-c[0][0])*(c[3][0]-c[0][0])+
      (c[1][1]-c[0][1])*(c[3][1]-c[0][1]))<1e-8&&
    samePoint([c[1][0]+c[3][0]-c[0][0],c[1][1]+c[3][1]-c[0][1]],c[2]);
  for(const route of routes){
    const pts=route.points;
    const caps=[];
    for(let k=0;k<pts.length-1;k++){
      const a=pts[k],b=pts[k+1],dist=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const steps=Math.ceil(dist/1.5);
      const cap={start:false,end:false,normal:null,tint:null};caps.push(cap);
      let pending=null;
      for(let j=0;j<steps;j++){
        let t0=j/steps,t1=(j+1)/steps;
        if(excludePalaceApproach && route.id==='public_gate_market_sanctuary'){
          const z0=a[1]+(b[1]-a[1])*t0,z1=a[1]+(b[1]-a[1])*t1;
          const cutStart=WOLFVEIL_PALACE_APPROACH.fromZ;
          const cutEnd=WOLFVEIL_PALACE.z+WOLFVEIL_PALACE.depth/2;
          if(z1>cutStart && z0<cutEnd){
            if(z0<cutStart)t1=(cutStart-a[1])/(b[1]-a[1]);
            else if(z1>cutEnd)t0=(cutEnd-a[1])/(b[1]-a[1]);
            else continue;
          }
        }
        const x0=a[0]+(b[0]-a[0])*t0,z0=a[1]+(b[1]-a[1])*t0;
        const x1=a[0]+(b[0]-a[0])*t1,z1=a[1]+(b[1]-a[1])*t1;
        if(wolfveilDistanceToRiver((x0+x1)/2,(z0+z1)/2)<12)continue;
        // Each strip follows the UNIT route tangent. Dividing a 1.5m strip
        // by the entire route length shrank long Play roads into hairlines.
        // Keep the legacy non-Play rendering opt-out unchanged.
        const nx=(canonicalPlaySurface?b[1]-a[1]:z1-z0)/dist*route.width*.5;
        const nz=-(canonicalPlaySurface?b[0]-a[0]:x1-x0)/dist*route.width*.5;
        const tint=route.kind==='primary'?[.63,.61,.54]:
          route.kind==='residential'?[.61,.53,.43]:[.46,.43,.35];
        const pathTint=swQuarterQuality
          ?wolfveilSWDirtPathTint((x0+x1)*.5,(z0+z1)*.5,tint,route.width*.5+1.6):tint;
        const corners=[[x0-nx,z0-nz],[x0+nx,z0+nz],
          [x1+nx,z1+nz],[x1-nx,z1-nz]];
        if(canonicalPlaySurface&&excludePalaceApproach&&
          route.id==='public_gate_market_sanctuary'){
          // The full-width perpendicular caps must also stop at the stair
          // boundary; centreline-only clipping leaves a diagonal corner in it.
          const cutStart=WOLFVEIL_PALACE_APPROACH.fromZ;
          const cutEnd=WOLFVEIL_PALACE.z+WOLFVEIL_PALACE.depth/2;
          for(const p of corners){
            if(Math.max(z0,z1)<=cutStart+1e-8)p[1]=Math.min(p[1],cutStart);
            if(Math.min(z0,z1)>=cutEnd-1e-8)p[1]=Math.max(p[1],cutEnd);
          }
        }
        if(canonicalPlaySurface){
          if(Math.abs(t0)<1e-9)cap.start=true;
          if(Math.abs(t1-1)<1e-9){cap.end=true;cap.normal=[nx,nz];cap.tint=pathTint;}
          const strip={corners,pathTint,x0,z0,x1,z1,nx,nz};
          // Preserve palette transitions, stair caps, river gaps and outer
          // meadow joins. Removing only redundant coplanar strip boundaries
          // lets the original terrain grid supply the necessary detail.
          if(coalesceTerrainStrips&&pending&&rectangularCore(pending)&&
            rectangularCore(strip)&&pending.pathTint.every((v,i)=>v===pathTint[i])&&
            samePoint(pending.corners[3],corners[0])&&
            samePoint(pending.corners[2],corners[1])){
            pending.corners[2]=corners[2];pending.corners[3]=corners[3];
            pending.x1=x1;pending.z1=z1;
          }else{emit(pending);pending=strip;}
          continue;
        }
        const y0=wolfveilHeight(x0,z0)+.10,y1=wolfveilHeight(x1,z1)+.10;
        mesh.quad([x0-nx,y0,z0-nz],[x0+nx,y0,z0+nz],
          [x1+nx,y1,z1+nz],[x1-nx,y1,z1-nz],pathTint);
      }
      emit(pending);
    }
    if(canonicalPlaySurface)for(let k=1;k<pts.length-1;k++){
      const prior=caps[k-1],next=caps[k];
      if(!prior?.end||!next?.start)continue; // preserve river and stair gaps
      const a=pts[k-1],b=pts[k],c=pts[k+1];
      const ax=b[0]-a[0],az=b[1]-a[1],bx=c[0]-b[0],bz=c[1]-b[1];
      const length=Math.hypot(bx,bz),turn=ax*bz-az*bx;
      if(length<1e-8||Math.abs(turn)<1e-8)continue;
      const sign=Math.sign(turn),[nx,nz]=prior.normal;
      const bevel=[b,[b[0]+sign*nx,b[1]+sign*nz],
        [b[0]+sign*bz/length*route.width*.5,b[1]-sign*bx/length*route.width*.5]];
      if(bevel.some(p=>wolfveilDistanceToRiver(p[0],p[1])<12))continue;
      if(excludePalaceApproach&&route.id==='public_gate_market_sanctuary'&&
        bevel.some(p=>p[1]>WOLFVEIL_PALACE_APPROACH.fromZ&&
          p[1]<WOLFVEIL_PALACE.z+WOLFVEIL_PALACE.depth/2))continue;
      const projected=project(bevel);
      if(!projected)continue; // outer meadow representation stays unchanged
      const uv=p=>[(p[0]-b[0])/route.width+.5,(p[2]-b[1])/route.width+.5];
      for(const tri of projected)mesh.tri(...tri,prior.tint,tri.map(uv));
    }
  }
  const obj=world.mesh(new THREE.Mesh(mesh.geometry(),
    material(0xffffff,.92,{vertexColors:true,side:THREE.DoubleSide})));
  obj.name='SWV_PhysicalTraversablePathNetwork';obj.receiveShadow=true;
  return obj;
}
export function addWolfveilWater(world,river,{silverWater=false}={}){
  const m=new WolfveilTriangles();
  // Every adjacent segment now reuses the EXACT same corner vertices:
  // no open triangular wedges or overhanging cutoff at river bends.
  // Mitered joints are bounded so tight turns never grow huge spikes.
  // Game 3D silver surface extends just into the real graded bank at each
  // shared river waypoint. No new walkable ground, no extra collision mesh.
  // Keep default Game 1 surface dimensions unchanged.
  const densePoints=silverWater?resampleWolfveilRiverPoints(river.points):river.points;
  const shoreline=silverWater?fitWolfveilWaterToBanks(
    densePoints,river.width,wolfveilHeight):null;
  const sections=shoreline?.sections??wolfveilRiverCrossSections(river.points,river.width);
  for(let i=0;i<sections.length-1;i++){
    const a=sections[i],b=sections[i+1];
    m.quad(a.left,a.right,b.right,b.left);
  }
  const silver=silverWater?createWolfveilSilverRiverMaterial():null;
  const uniforms={
    uFlowTime:{value:0},uRain:{value:0},uWet:{value:0},
    uShallow:{value:new THREE.Color(0x55b9b2)},
    uDeep:{value:new THREE.Color(0x245f72)},
  };
  const riverMat=silver?.material??new THREE.ShaderMaterial({
    side:THREE.DoubleSide,transparent:true,depthWrite:false,
    uniforms,vertexShader:`varying vec3 vWorld;varying vec2 vUv2;
    void main(){vUv2=uv;vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;
      gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`precision highp float;
    uniform float uFlowTime,uRain,uWet;
    uniform vec3 uShallow,uDeep;
    varying vec3 vWorld;varying vec2 vUv2;
    void main(){
      float t=uFlowTime;
      float wave=sin(vWorld.x*.62-vWorld.z*.20+t*2.5)*.5+.5;
      float small=sin(vWorld.x*2.5+vWorld.z*.36+t*4.4)*.5+.5;
      float edge=smoothstep(.25,.47,abs(vUv2.x-.5));
      vec3 col=mix(uDeep,uShallow,.25+.38*wave+.22*small);
      float surf=pow(small,8.)*.10;
      col+=vec3(surf)+vec3(.17,.18,.14)*uRain*.14;
      col=mix(col,vec3(.46,.34,.24),uWet*.25);
      col+=vec3(.18,.21,.19)*edge*(.15+.14*wave);
      gl_FragColor=vec4(col,.91);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  world.ownedMaterials.push(riverMat);
  const geometry=m.geometry();
  if(silver){
    const profile=buildWolfveilRiverSurfaceAttributes(densePoints);
    // Unindexed quad triangles: two upstream, one downstream, then one
    // upstream/two downstream. These attributes remain continuous at bends.
    if(geometry.getAttribute('position').count!==profile.distance.length)
      throw Error('Wolfveil river surface flow attributes do not match triangles');
    geometry.setAttribute('riverFlow',new THREE.Float32BufferAttribute(profile.flow,3));
    geometry.setAttribute('riverTravel',new THREE.Float32BufferAttribute(profile.distance,1));
  }
  const water=world.mesh(new THREE.Mesh(geometry,riverMat));
  water.name='SWV_ContinuousDownhillRiver';
  // Legacy Game 1 water keeps the original material and update contract.
  return {water,uniforms:silver?.uniforms??uniforms,
    updateAppearance:silver?.updateAppearance,
    bindContact:silver?.bindContact,
    get shoreline(){return shoreline?{
      covered:shoreline.covered,unresolved:shoreline.unresolved,
      sections:shoreline.sections.length,
    }:null;}};
}
