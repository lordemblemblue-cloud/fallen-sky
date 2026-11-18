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
  wolfveilRouteClearance,
} from './WolfveilLayout.js';
import {wolfveilTrailBreakAt} from './WolfveilTrailBreaks.mjs';
import {wolfveilLandscapeSurface,wolfveilNoise2,WOLFVEIL_SUMMITS} from './WolfveilLandscapeDesign.mjs';
import {makeWolfveilTrailDirtTextures,makeWolfveilTrailEdgeAlpha,applyWolfveilTrailUVs} from './WolfveilTrailSurface.js';
import {wolfveilSplatWeights} from './WolfveilTerrainSplat.js';
import { WOLFVEIL_PALACE, WOLFVEIL_PALACE_APPROACH } from './WolfveilPalaceLayout.mjs';
import {insideWolfveilImportedTown} from './WolfveilImportedTownLayout.mjs';
import {createWolfveilPavingCollector,upgradeWolfveilTrailDirt} from './WolfveilPavedRoads.js';
import {wolfveilTrailBreakGravel} from './WolfveilTrailBreakLandscape.mjs';
const BREAK_GRAVEL=Object.freeze([.205,.180,.145]); // linear grey-brown gravel

import {getWolfveilSumiETextures,cloneRepeatedTexture} from './WolfveilSumiETextures.mjs';
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
    for(const m of this.ownedMaterials){m.map?.dispose?.();m.bumpMap?.dispose?.();m.dispose();}
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
export function buildWolfveilTerrain({span=1100,segments=310,caveCutouts=false,landscape=false}={}){
  const g=new THREE.BufferGeometry(),v=[],c=[],uv=[],idx=[];
  const splat=landscape?new Float32Array((segments+1)*(segments+1)*4):null;
  const rand=Math.sin;
  // Heights first, so each vertex can read its neighbours' slope for free.
  const row=segments+1,step=span/segments,heights=new Float32Array(row*row);
  for(let zi=0;zi<=segments;zi++)for(let xi=0;xi<=segments;xi++)
    heights[zi*row+xi]=wolfveilHeight((xi/segments-.5)*span,(zi/segments-.5)*span);
  const heightOf=(xi,zi)=>heights[clamp(zi,0,segments)*row+clamp(xi,0,segments)];
  for(let zi=0;zi<=segments;zi++){
    const z=(zi/segments-.5)*span;
    for(let xi=0;xi<=segments;xi++){
      const x=(xi/segments-.5)*span,y=heights[zi*row+xi];
      v.push(x,y,z);uv.push(x/7,z/7);
      const riverDistance=wolfveilDistanceToRiver(x,z);
      if(landscape){
        // Game 3D landscape design (WolfveilLandscapeDesign.mjs): one palette
        // for meadow, riverbank, trails, fighting grounds, camps and ranges.
        const slope=Math.hypot(heightOf(xi+1,zi)-heightOf(xi-1,zi),
          heightOf(xi,zi+1)-heightOf(xi,zi-1))/(2*step);
        const surface=wolfveilLandscapeSurface(x,z,y,slope,{
          riverDistance,routeClearance:wolfveilRouteClearance(x,z),
          west:smooth(90,350,-x),
        });
        // Washed-out trail stretches: the soil under the stepping stones
        // turns to grey-brown gravel (WolfveilTrailBreakLandscape.mjs).
        const gravel=wolfveilTrailBreakGravel(x,z);
        if(gravel>0){
          for(let k=0;k<3;k++)surface.color[k]+=(BREAK_GRAVEL[k]-surface.color[k])*gravel*.8;
          surface.dirt=Math.max(surface.dirt??0,gravel*.95);
        }
        c.push(surface.color[0],surface.color[1],surface.color[2]);
        // Baked-texture blend weights (grass, dirt, rock, snow) for this vertex.
        splat.set(wolfveilSplatWeights(surface),(zi*(segments+1)+xi)*4);
        continue;
      }
      const moist=Math.max(0,1-riverDistance/70);
      const woodland=smooth(90,350,-x);
      const altitude=smooth(70,150,y);
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
      // Landscaping painted into the ONE physical terrain: bare rock where the
      // ground tilts, sun-dried grass in drifting patches, worn soil on trail
      // shoulders and a fine speckle so flat colour never reads as plastic.
      const slope=Math.hypot(heightOf(xi+1,zi)-heightOf(xi-1,zi),
        heightOf(xi,zi+1)-heightOf(xi,zi-1))/(2*step);
      const rocky=smooth(.24,.52,slope)*.85;
      const dryGrass=smooth(.5,.82,.5+.5*rand(x*.021+1.7)*rand(z*.027-.6)+
        .25*rand(x*.063-z*.049))*.6*(1-moist);
      const shoulder=(1-smooth(0,3.6,wolfveilRouteClearance(x,z)))*.5;
      const speckle=.94+.12*Math.abs(rand(x*12.9898+z*78.233)*43758.5453%1);
      const rockTone=[.47,.46,.43],dryTone=[.60,.52,.30],soilTone=[.50,.41,.30];
      for(let k=0;k<3;k++){
        sample[k]=sample[k]*(1-dryGrass)+dryTone[k]*dryGrass;
        sample[k]=sample[k]*(1-shoulder)+soilTone[k]*shoulder;
        sample[k]=(sample[k]*(1-rocky)+rockTone[k]*(.86+.3*noise)*rocky)*speckle;
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
  // A heightfield has only one surface at each X/Z. Removing WHOLE cells
  // at the four cave mouths opened ~3.55m holes above the waterfall ridge:
  // a surface walker could fall directly into the underground cave floor.
  // Keep ALL two triangles in EVERY cell, including the cave approach sites.
  // Actual cave entry/exit is via the explicitly activated stone-mouth
  // interaction, never via a missing terrain polygon.
  // Retain caveCutouts in the public signature for legacy callers; it no
  // longer authorizes deleting an overworld floor.
  void caveCutouts;
  for(let z=0;z<segments;z++)for(let x=0;x<segments;x++){
    const p=z*(segments+1)+x,q=p+segments+1;
    idx.push(p,q,p+1,q,q+1,p+1);
  }
  g.setIndex(idx);
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();
  if(splat)g.userData.splatWeights=splat;
  return g;
}
export function makeRidgeGeometry(center,depth=340,seed=98){
  const rand=mulberry32(seed);
  const [cx,cz]=center;
  const sections=64,tiers=16;
  const pos=[],col=[],uvs=[],indices=[];
  const basePeak=wolfveilHeight(cx,cz)+depth*(.22+rand()*.06);
  const lobePhaseA=rand()*TAU,lobePhaseB=rand()*TAU,areteCount=4+Math.floor(rand()*3);
  const azimuthProfile=Array.from({length:sections},(_,i)=>{
    const a=i/sections*TAU;
    const ridgeSpur=Math.pow(Math.abs(Math.cos(a*areteCount*.5+lobePhaseA)),.68);
    const flute=1-.24*Math.pow(Math.abs(Math.sin(a*9+lobePhaseB)),1.6);
    return (.72+.34*ridgeSpur+.14*Math.sin(a*3+lobePhaseA))*flute;
  });

  for(let t=0;t<=tiers;t++){
    const ratio=t/tiers;
    const radialScale=Math.pow(1-ratio,.88);
    for(let i=0;i<sections;i++){
      const a=i/sections*TAU;
      const couloir=Math.sin(a*11+ratio*3.6+lobePhaseB);
      const couloirCut=(1-Math.abs(couloir))*smooth(.12,.85,ratio)*(1-smooth(.82,1.,ratio));
      const strataStep=Math.sin(ratio*Math.PI*12)*.018*depth*(1-ratio*.4);
      const r=depth*.55*radialScale*azimuthProfile[i]*(1-.16*couloirCut)+strataStep;
      const spineDrift=(rand()-.5)*1.2*(1-ratio);
      const xx=cx+Math.cos(a)*r+spineDrift;
      const zz=cz+Math.sin(a)*r+spineDrift;
      const ground=wolfveilHeight(xx,zz);
      const areteCrest=Math.pow(Math.max(0,Math.cos(a*areteCount+lobePhaseA)),2)*depth*.035*smooth(.2,.9,ratio);
      const elevation=(1-smooth(0,.22,ratio))*(ground-2.5)+
        smooth(0,.22,ratio)*(ground*(1-ratio)+basePeak*ratio)+
        areteCrest-couloirCut*depth*.028+
        Math.sin(ratio*21+a*5)*1.15*smooth(.15,.9,ratio);
      pos.push(xx,elevation,zz);
      uvs.push(xx*.045,elevation*.055);

      const footBlend=1-smooth(.04,.30,ratio);
      const snowLine=smooth(.70,.93,ratio+.09*Math.cos(a*5+lobePhaseB)-couloirCut*.18);
      const inkCrevice=clamp(couloirCut*1.15+(.5-.5*Math.sin(ratio*26))*.28,0,1);
      const moss=[.29,.42,.30],slate=[.34,.41,.49],ochre=[.48,.44,.38],snow=[.84,.88,.91],ink=[.13,.18,.24];
      const warmBand=smooth(.35,.65,.5+.5*Math.sin(ratio*9+a*2));
      let rC=slate[0]*(1-warmBand*.32)+ochre[0]*warmBand*.32;
      let gC=slate[1]*(1-warmBand*.32)+ochre[1]*warmBand*.32;
      let bC=slate[2]*(1-warmBand*.32)+ochre[2]*warmBand*.32;
      rC=rC*(1-inkCrevice*.58)+ink[0]*inkCrevice*.58;
      gC=gC*(1-inkCrevice*.58)+ink[1]*inkCrevice*.58;
      bC=bC*(1-inkCrevice*.58)+ink[2]*inkCrevice*.58;
      rC=rC*(1-footBlend)+moss[0]*footBlend;
      gC=gC*(1-footBlend)+moss[1]*footBlend;
      bC=bC*(1-footBlend)+moss[2]*footBlend;
      rC=rC*(1-snowLine)+snow[0]*snowLine;
      gC=gC*(1-snowLine)+snow[1]*snowLine;
      bC=bC*(1-snowLine)+snow[2]*snowLine;
      col.push(rC,gC,bC);
    }
  }
  for(let t=0;t<tiers;t++){
    for(let i=0;i<sections;i++){
      const next=(i+1)%sections;
      const a=t*sections+i,b=t*sections+next;
      const c2=(t+1)*sections+next,d=(t+1)*sections+i;
      indices.push(a,b,c2,a,c2,d);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setIndex(indices);
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.computeVertexNormals();
  return g;
}
// A pointed, fluted rock spire ("wolf ear") seated on a terrain summit:
// sharp aretes, couloirs, strata ledges and a leaning tip. Visual only.
export function makeWolfEarSpireGeometry([cx,cz],{height=64,radius=34,leanX=0,leanZ=0,seed=1}={}){
  const sections=48,tiers=22;
  const pos=[],col=[],uvs=[],indices=[];
  let baseY=Infinity;
  for(let i=0;i<sections;i++){
    const a=i/sections*TAU;
    baseY=Math.min(baseY,wolfveilHeight(cx+Math.cos(a)*radius,cz+Math.sin(a)*radius));
  }
  baseY-=5;
  const crest=wolfveilHeight(cx,cz);
  const top=Math.max(crest,baseY)+height;
  for(let t=0;t<=tiers;t++){
    const ratio=t/tiers;
    const lean=Math.pow(ratio,1.7);
    const ox=cx+leanX*lean,oz=cz+leanZ*lean;
    const taper=Math.pow(1-ratio,.92)*(1-.12*Math.sin(ratio*Math.PI));
    const ledge=Math.sin(ratio*Math.PI*9+seed)*.045*(1-ratio);
    const y=baseY+(top-baseY)*ratio;
    for(let i=0;i<sections;i++){
      const a=i/sections*TAU;
      const arete=Math.pow(Math.abs(Math.cos(a*2.5+seed)),.6);
      const flute=1-.22*Math.pow(Math.abs(wolfveilNoise2(a*3.1+seed,ratio*4.2)),1.4);
      const r=Math.max(.15,radius*taper*(.74+.30*arete)*flute*(1+ledge));
      const x=ox+Math.cos(a)*r,z=oz+Math.sin(a)*r;
      // The lowest ring is buried in the summit so no seam shows.
      const yy=t===0?Math.min(y,wolfveilHeight(x,z)-3):y+wolfveilNoise2(a*2+seed,ratio*6)*1.4*(1-ratio);
      pos.push(x,yy,z);
      uvs.push(a*radius*.09,yy*.07);
      const strata=.5+.5*Math.sin(yy*.55+wolfveilNoise2(a,seed)*2.2);
      const crevice=1-flute;
      let r0=.27+.08*strata,g0=.27+.075*strata,b0=.28+.07*strata;
      r0*=1-crevice*1.6;g0*=1-crevice*1.6;b0*=1-crevice*1.5;
      // Snow only collects on the gentler ledges near the top.
      const snow=Math.max(0,Math.min(1,(ratio-.55)/.3))*(.35+.65*(1-arete))*(.55+.45*strata);
      col.push(r0+(.86-r0)*snow,g0+(.88-g0)*snow,b0+(.92-b0)*snow);
    }
  }
  for(let t=0;t<tiers;t++)for(let i=0;i<sections;i++){
    const next=(i+1)%sections,a=t*sections+i,b=t*sections+next;
    const c2=(t+1)*sections+next,d=(t+1)*sections+i;
    indices.push(a,b,c2,a,c2,d);
  }
  const g=new THREE.BufferGeometry();
  g.setIndex(indices);
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.computeVertexNormals();
  return g;
}
export function addWolfEarPeaks(world,{landscape=false}={}){
  const suite=getWolfveilSumiETextures();
  const rockMap=cloneRepeatedTexture(suite.caveRock.map,1,1);
  const rockBump=cloneRepeatedTexture(suite.caveRock.bumpMap,1,1);
  const ridgeMat=material(0xffffff,.89,{
    vertexColors:true,side:THREE.DoubleSide,
    map:rockMap,bumpMap:rockBump,bumpScale:.09,
  });
  ridgeMat.name='SWV_Sculpted_SumiE_MountainRock';
  world.ownedMaterials.push(ridgeMat);
  if(landscape){
    // The boundary ranges are now sculpted into the shared terrain itself
    // (WolfveilLandscapeDesign.mjs). Only the two "wolf ear" spires remain as
    // separate rock: they crown the two Wolf-Ear summits and lean apart.
    const west=WOLFVEIL_SUMMITS.find(s=>s.id==='west_ear');
    const east=WOLFVEIL_SUMMITS.find(s=>s.id==='east_ear');
    const ears=[
      {name:'SWV_TwinWolfEarPeak_West',at:[west.x,west.z],height:72,radius:36,leanX:-18,leanZ:6,seed:84},
      {name:'SWV_TwinWolfEarPeak_East',at:[east.x,east.z],height:66,radius:33,leanX:17,leanZ:8,seed:85},
    ];
    for(const ear of ears){
      const rock=world.mesh(new THREE.Mesh(makeWolfEarSpireGeometry(ear.at,ear),ridgeMat));
      rock.name=ear.name;rock.receiveShadow=true;rock.castShadow=false;
      rock.raycast=()=>{};
    }
    return;
  }
  const peaks=[
    {name:'SWV_TwinWolfEarPeak_West',x:-76,z:477,size:195,seed:84},
    {name:'SWV_TwinWolfEarPeak_East',x:52,z:502,size:172,seed:85},
    {name:'SWV_RidgeSouth',x:-510,z:280,size:245,seed:93},
    {name:'SWV_RidgeEast',x:480,z:275,size:235,seed:101},
    {name:'SWV_SnowRidge',x:45,z:740,size:330,seed:75},
    {name:'SWV_WestCedarCrag_North',x:-475,z:65,size:225,seed:112},
    {name:'SWV_WestCedarCrag_South',x:-485,z:-195,size:215,seed:127},
    {name:'SWV_EastQuarryMassif',x:485,z:-55,size:225,seed:139},
    {name:'SWV_EastRavineSpire',x:465,z:-275,size:205,seed:151},
    {name:'SWV_NorthHighlandShoulder_West',x:-265,z:560,size:250,seed:163},
    {name:'SWV_NorthHighlandShoulder_East',x:285,z:545,size:245,seed:177},
  ];
  for(const p of peaks){
    const rock=world.mesh(new THREE.Mesh(makeRidgeGeometry([p.x,p.z],p.size,p.seed),ridgeMat));
    rock.name=p.name;rock.receiveShadow=true;rock.castShadow=false;
    rock.raycast=()=>{};
  }
}
export function addWolfveilPaths(world,routes,{
  excludePalaceApproach=false,swQuarterQuality=false,canonicalPlaySurface=false,
  terrainSpan=1100,terrainSegments=310,coalesceTerrainStrips=true,
  trailBreaks=false,importedTownAtMarket=false,landscape=false,
}={}){
  // Landscape trails are 1.4 m wider: the extra margin is the feathered verge.
  const verge=landscape&&canonicalPlaySurface?1.4:0;
  // The real Luna entrance already has seven physical stairs. On the live
  // palace map, the old road must not cover these or the hillside treads.
  const mesh=new WolfveilTriangles();
  const surface=canonicalPlaySurface?createWolfveilTerrainSurfaceSampler({
    span:terrainSpan,segments:terrainSegments,
  }):null;
  const project=canonicalPlaySurface?createWolfveilPathSurface({
    heightAt:wolfveilHeight,span:terrainSpan,segments:terrainSegments,
  }):null;
  // Game 3D landscape: granite setts / herringbone brick + kerbs on top of
  // the main road and residential lanes (WolfveilPavedRoads.js).
  const paving=verge&&canonicalPlaySurface?createWolfveilPavingCollector({
    terrainSpan,terrainSegments,surfaceAt:surface,
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
      const segLen=Math.max(.5,Math.hypot(x1-x0,z1-z0));
      const vertex=p=>[p[0],surface(p[0],p[1])+.10,p[1]];
      mesh.quad(vertex(corners[0]),vertex(corners[1]),
        vertex(corners[2]),vertex(corners[3]),pathTint,
        [[0,0],[1,0],[1,segLen*.28],[0,segLen*.28]]);
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
    let walked=0; // metres along this route before the current segment
    for(let k=0;k<pts.length-1;k++){
      const a=pts[k],b=pts[k+1],dist=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const segmentStart=walked;walked+=dist;
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
        if(importedTownAtMarket&&insideWolfveilImportedTown((x0+x1)*.5,(z0+z1)*.5,-1.5))continue;
        if(wolfveilDistanceToRiver((x0+x1)/2,(z0+z1)/2)<12)continue;
        // Washed-out stretch: the dirt ribbon stops and resumes further on.
        if(trailBreaks&&wolfveilTrailBreakAt(route.id,segmentStart+dist*(t0+t1)*.5))continue;
        // Each strip follows the UNIT route tangent. Dividing a 1.5m strip
        // by the entire route length shrank long Play roads into hairlines.
        // Keep the legacy non-Play rendering opt-out unchanged.
        const nx=(canonicalPlaySurface?b[1]-a[1]:z1-z0)/dist*(route.width+verge)*.5;
        const nz=-(canonicalPlaySurface?b[0]-a[0]:x1-x0)/dist*(route.width+verge)*.5;
        const tint=verge
          // Warm packed earth; the dirt texture carries the detail.
          ?(route.kind==='primary'?[.98,.94,.86]:route.kind==='residential'?[.94,.86,.76]:
            route.kind==='ridge'?[.90,.88,.84]:route.kind==='frontier'?[.86,.76,.64]:[.88,.80,.70])
          :route.kind==='primary'?[.63,.61,.54]:
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
          paving?.add(route,corners,verge);
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
        const segLen=Math.max(.5,Math.hypot(x1-x0,z1-z0));
        mesh.quad([x0-nx,y0,z0-nz],[x0+nx,y0,z0+nz],
          [x1+nx,y1,z1+nz],[x1-nx,y1,z1-nz],pathTint,
          [[0,0],[1,0],[1,segLen*.28],[0,segLen*.28]]);
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
        [b[0]+sign*bz/length*(route.width+verge)*.5,b[1]-sign*bx/length*(route.width+verge)*.5]];
      if(importedTownAtMarket&&bevel.some(p=>insideWolfveilImportedTown(p[0],p[1],-1.5)))continue;
      if(bevel.some(p=>wolfveilDistanceToRiver(p[0],p[1])<12))continue;
      if(excludePalaceApproach&&route.id==='public_gate_market_sanctuary'&&
        bevel.some(p=>p[1]>WOLFVEIL_PALACE_APPROACH.fromZ&&
          p[1]<WOLFVEIL_PALACE.z+WOLFVEIL_PALACE.depth/2))continue;
      paving?.addBevel(route,bevel,verge); // paving turns the corner too
      const projected=project(bevel);
      if(!projected)continue; // outer meadow representation stays unchanged
      const uv=verge
        // Corner fan: the verge coordinate is the distance from the bend point.
        ?p=>[.5-.5*Math.min(1,Math.hypot(p[0]-b[0],p[2]-b[1])/((route.width+verge)*.5)),.5]
        :p=>[(p[0]-b[0])/route.width+.5,(p[2]-b[1])/route.width+.5];
      for(const tri of projected)mesh.tri(...tri,prior.tint,tri.map(uv));
    }
  }
  if(verge){
    // Real packed dirt with pebbles in world space + a feathered, ragged verge.
    const geometry=mesh.geometry();
    const strip=geometry.getAttribute('uv');
    applyWolfveilTrailUVs(geometry,i=>strip.getX(i));
    const dirt=makeWolfveilTrailDirtTextures();
    const edge=makeWolfveilTrailEdgeAlpha();
    edge.channel=1;
    const pathMat=material(0xffffff,.95,{
      vertexColors:true,side:THREE.DoubleSide,
      map:dirt.map,bumpMap:dirt.bumpMap,bumpScale:.065,alphaMap:edge,
      transparent:true,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    });
    pathMat.name='SWV_SumiE_TexturedDirtTrailNetwork';
    world.ownedMaterials.push(pathMat);
    // Blender-baked trail dirt replaces the procedural placeholder once loaded.
    upgradeWolfveilTrailDirt(pathMat,{metresPerRepeat:4.5});
    const obj=world.mesh(new THREE.Mesh(geometry,pathMat));
    obj.name='SWV_PhysicalTraversablePathNetwork';obj.receiveShadow=true;
    // Drawn after the translucent west soil overlay so trails stay on top.
    obj.renderOrder=2;
    obj.userData.paving=paving?.build(world)??null;
    return obj;
  }
  const dirtSuite=getWolfveilSumiETextures().dirt;
  const dirtMap=cloneRepeatedTexture(dirtSuite.map,1,1);
  const dirtBump=cloneRepeatedTexture(dirtSuite.bumpMap,1,1);
  const pathMat=material(0xffffff,.93,{
    vertexColors:true,side:THREE.DoubleSide,
    map:dirtMap,bumpMap:dirtBump,bumpScale:.048,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
  });
  pathMat.name='SWV_SumiE_TexturedDirtTrailNetwork';
  world.ownedMaterials.push(pathMat);
  const obj=world.mesh(new THREE.Mesh(mesh.geometry(),pathMat));
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