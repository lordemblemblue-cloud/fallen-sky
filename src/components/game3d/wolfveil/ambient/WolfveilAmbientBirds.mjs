// Wolfveil Game 3D clone only: decorative birds that orbit, land and take off.
// The user's 2.2MB bird GLB is rigged, but contains NO animation clips.
// Wings and state transitions are animated procedurally, never via combat AI.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clone as cloneSkinned} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {createWolfveilTerrainSurfaceSampler} from '../WolfveilTerrainSurfaceSampler.mjs';
import {wolfveilDistanceToRiver,wolfveilRouteClearance} from '../WolfveilLayout.js';
import {clearOf} from '../WolfveilForestLayout.js';
import {insideWolfveilImportedTown} from '../WolfveilImportedTownLayout.mjs';
import {wolfveilIsProtectedSWTile} from '../WolfveilSWQuarterQuality.mjs';
import {birdRandom,birdBudget,makeBird,findBirdLanding,advanceBird,
  BIRD_QUALITY} from './WolfveilBirdFlightPlan.mjs';
import {classifyWolfveilBirdBone,sampleWolfveilBirdPose}
  from './WolfveilBirdRigAnimation.mjs';

export const WOLFVEIL_OWNER_BIRD_ASSET=
  'https://media.base44.com/files/public/6ab42219a52fd34656a53b37/d9fad7809_tripo_convert_bdd73c28-af44-45e3-b758-1d783314f872.glb';

const noop=()=>{};
const FLAP_AXIS=new THREE.Vector3(0,0,1);
const FLAP_ROTATION=new THREE.Quaternion();
const SWEEP_AXIS=new THREE.Vector3(0,1,0);
const SWEEP_ROTATION=new THREE.Quaternion();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function makeFarGeometry(){
  const geo=new THREE.BufferGeometry();
  // Two slightly swept triangular wings: distant flock silhouette only.
  geo.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,.13, -.87,.05,-.14, -.27,.02,-.23,
    0,0,.13, .87,.05,-.14, .27,.02,-.23,
  ],3));
  geo.computeVertexNormals();
  return geo;
}
function fallbackBird(shared){
  const root=new THREE.Group();
  const body=new THREE.Mesh(shared.body,shared.material);
  body.scale.set(.48,.32,.26);
  root.add(body);
  const l=new THREE.Group(),r=new THREE.Group();
  l.position.set(0,.02,-.08);r.position.set(0,.02,.08);
  const blade=new THREE.Mesh(shared.wing,shared.material);
  blade.rotation.y=.5;blade.position.z=-.32;l.add(blade);
  const other=blade.clone();
  other.rotation.y=-.5;other.position.z=.32;r.add(other);
  root.add(l,r);
  return {root,wings:[{bone:l,base:l.quaternion.clone(),sign:1,segment:0},
                      {bone:r,base:r.quaternion.clone(),sign:-1,segment:0}],
    head:[],tail:[],rootY:root.position.y,fallback:true};
}
function animatedBird(model,shared){
  if(!model)return fallbackBird(shared);
  const root=cloneSkinned(model);
  const wings=[],head=[],tail=[];
  root.traverse(o=>{
    if(o.isBone){
      const joint=classifyWolfveilBirdBone(o.name);
      if(joint?.kind==='wing')wings.push({
        bone:o,base:o.quaternion.clone(),sign:joint.sign,segment:joint.segment,
      });
      if(joint?.kind==='head'||joint?.kind==='neck')
        head.push({bone:o,base:o.quaternion.clone(),kind:joint.kind});
      if(joint?.kind==='tail')
        tail.push({bone:o,base:o.quaternion.clone()});
    }
    if(o.isMesh){o.castShadow=false;o.receiveShadow=false;
      o.raycast=noop;o.frustumCulled=false;
      o.userData={...o.userData,decorativeOnly:true,nonCollider:true};}
  });
  return {root,wings,head,tail,rootY:root.position.y,fallback:false};
}
/** Apply actual GLB joint poses, always relative to the supplied bind pose.
 * None of the bird's original vertex weights or bone transforms are replaced.
 * Shoulder joints lift both wings, optional outer joints feather the tips,
 * and optional neck/tail bones stabilize banking, ascent and braking.
 */
function updateRig(actor,bird){
  const pose=sampleWolfveilBirdPose(bird);
  for(const w of actor.wings){
    const angle=w.segment===0?pose.wingAngle:
      pose.wingTipAngle*(1/Math.max(1,w.segment));
    w.bone.quaternion.copy(w.base).multiply(
      FLAP_ROTATION.setFromAxisAngle(FLAP_AXIS,angle*w.sign));
    w.bone.quaternion.multiply(SWEEP_ROTATION.setFromAxisAngle(
      SWEEP_AXIS,pose.wingSweep*w.sign*(w.segment===0?1:.45)));
  }
  for(const joint of actor.tail){
    joint.bone.quaternion.copy(joint.base).multiply(
      FLAP_ROTATION.setFromAxisAngle(FLAP_AXIS,pose.tail));
  }
  for(const joint of actor.head){
    joint.bone.quaternion.copy(joint.base).multiply(
      FLAP_ROTATION.setFromAxisAngle(FLAP_AXIS,
        pose.head*(joint.kind==='head'?1:.42)));
  }
  actor.root.position.y=actor.rootY+pose.bob;
  return pose;
}
/** Optional visual-only wildlife system for the clone's existing Wolfveil scene.
 * One GLB is loaded; near rigged birds share its geometry/textures.
 * Distant flocks are one instanced silhouette batch, not extra skinned models.
 */
export function createWolfveilAmbientBirds({
  scene,quality='medium',mobile=false,modelUrl=WOLFVEIL_OWNER_BIRD_ASSET,
  originZ=70,seed=0xB1D05,loader=new GLTFLoader(),
}={}){
  if(!scene?.add)throw Error('Ambient birds require existing Game 3D scene');
  let disposed=false,loaded=false,qualityName=BIRD_QUALITY[quality]?quality:'medium';
  let elapsed=0,frames=0,avgFrameMs=16.7,activeNear=0,activeFar=0;
  const random=birdRandom(seed),terrain=createWolfveilTerrainSurfaceSampler();
  const center={x:0,y:0,z:0},near=[],far=[],templateAssets=[];
  const MAX_NEAR=BIRD_QUALITY.ultra.near,MAX_FAR=BIRD_QUALITY.ultra.far;
  const visual=new THREE.Group();visual.name='Game3D_Clone_AmbientBirds_VisualOnly';
  visual.userData={decorativeOnly:true,nonCollider:true};
  scene.add(visual);
  const shared={
    body:new THREE.SphereGeometry(1,7,5),
    wing:new THREE.ConeGeometry(.18,.85,3),
    material:new THREE.MeshStandardMaterial({color:0x596d73,roughness:.9}),
  };
  const farMaterial=new THREE.MeshBasicMaterial({
    color:0x334d5c,side:THREE.DoubleSide,depthWrite:false,
  });
  // Distant silhouettes remain ONE instanced draw call. A shared shader time
  // animates their wing vertices; per-instance world positions shift phases
  // so the flock does not flap synchronously.
  const farWingClock={value:0};
  farMaterial.customProgramCacheKey=()=>'wolfveil-bird-instanced-flap-v1';
  farMaterial.onBeforeCompile=shader=>{
    shader.uniforms.uWolfveilBirdTime=farWingClock;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nuniform float uWolfveilBirdTime;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        #ifdef USE_INSTANCING
          float birdPhase=instanceMatrix[3].x*.17+instanceMatrix[3].z*.23;
        #else
          float birdPhase=0.0;
        #endif
        transformed.y += abs(position.x)*.16*
          sin(uWolfveilBirdTime*16.0+birdPhase);`);
  };
  const farGeometry=makeFarGeometry();
  const farMesh=new THREE.InstancedMesh(farGeometry,farMaterial,MAX_FAR);
  farMesh.name='DistantAmbientBirds_Instanced';
  farMesh.count=0;farMesh.castShadow=false;farMesh.receiveShadow=false;
  farMesh.raycast=noop;farMesh.frustumCulled=false;
  farMesh.userData={decorativeOnly:true,nonCollider:true};
  visual.add(farMesh);
  const dummy=new THREE.Object3D();
  const heightAt=(x,zWorld)=>{
    const z=zWorld-originZ;
    return Math.abs(x)<540&&Math.abs(z)<540?terrain(x,z):null;
  };
  const safeGround=(x,zLocal)=>terrain(x,zLocal);
  const safeClear=(x,zLocal)=>{
    // No static landscape work in another owner's tile or town/canal/road.
    if(insideWolfveilImportedTown(x,zLocal,13)||
      wolfveilDistanceToRiver(x,zLocal)<20||
      wolfveilRouteClearance(x,zLocal)<7||
      wolfveilIsProtectedSWTile(x,zLocal,2))return false;
    return clearOf({x,z:zLocal},2.5);
  };
  const chooseLanding=()=>findBirdLanding(center,random,{
    groundAt:safeGround,clearAt:safeClear,originZ,
  });
  const spawn=(index)=>makeBird(index,center,heightAt,random);
  function fillFar(){
    for(let i=far.length;i<MAX_FAR;i++){
      const b=spawn(100+i);
      b.y+=9;b.speed+=1.2;far.push(b);
    }
  }
  function fillNear(model){
    for(let i=near.length;i<MAX_NEAR;i++){
      const b=spawn(i),rig=animatedBird(model,shared);
      const actor=new THREE.Group();
      actor.name='AmbientBird_'+i;actor.userData={decorativeOnly:true,nonCollider:true};
      actor.add(rig.root);rig.root.scale.setScalar(.95+random()*.38);
      actor.visible=false;visual.add(actor);
      near.push({bird:b,actor,rig});
    }
  }
  // Distant birds appear with no network access. When the owner's model
  // arrives, the detailed birds replace nearby silhouettes.
  fillFar();
  try{
    loader.load(modelUrl,gltf=>{
      if(disposed)return;
      const root=gltf?.scene;
      if(!root){fillNear(null);loaded=true;refreshBudget();return;}
      templateAssets.push(root);
      fillNear(root);loaded=true;refreshBudget();
    },undefined,()=>{
      if(disposed)return;
      // Graceful lightweight fallback, not an invented second bird asset.
      fillNear(null);loaded=true;refreshBudget();
    });
  }catch{
    fillNear(null);loaded=true;refreshBudget();
  }
  function refreshBudget(){
    const budget=birdBudget(qualityName,avgFrameMs,mobile);
    activeNear=loaded?budget.near:0;
    activeFar=budget.far;
    farMesh.count=activeFar;
  }
  refreshBudget();
  function refreshCenter(playerPosition){
    if(!finite(playerPosition?.x)||!finite(playerPosition?.z))return;
    center.x=playerPosition.x;center.z=playerPosition.z;
    center.y=finite(playerPosition.y)?playerPosition.y:0;
  }
  function update(dt,playerPosition=null,weather={}){
    if(disposed)return;
    const step=clamp(finite(dt)?dt:0,0,.08);
    if(!step)return;
    elapsed+=step;frames++;
    farWingClock.value=elapsed;
    refreshCenter(playerPosition);
    avgFrameMs=avgFrameMs*.96+step*1000*.04;
    if(frames%120===0)refreshBudget();
    const wind=Math.min(24,Math.max(0,Number(weather.windMph)||0));
    const windX=(wind/15)*Math.sin(elapsed*.23),windZ=(wind/15)*Math.cos(elapsed*.19);
    for(let i=0;i<near.length;i++){
      const item=near[i],b=item.bird,enabled=i<activeNear;
      item.actor.visible=enabled;
      if(!enabled)continue;
      if(Math.hypot(b.x-center.x,b.z-center.z)>240){
        const angle=random()*Math.PI*2,rad=80+random()*48;
        b.x=center.x+Math.cos(angle)*rad;b.z=center.z+Math.sin(angle)*rad;
        b.y=(heightAt(b.x,b.z)??center.y)+20;b.mode='flight';b.time=0;b.target=null;
      }
      advanceBird(b,step,{center,terrainY:heightAt,chooseLanding,windX,windZ});
      item.actor.position.set(b.x,b.y,b.z);
      // Uploaded bird faces local -X, so orient that axis along travel.
      item.actor.rotation.y=Math.atan2(Math.sin(b.heading),-Math.cos(b.heading));
      const pose=updateRig(item.rig,b);
      // Source model faces local -X. Rotate flight attitude on the same
      // actor, not on the player or glider. Gentle turns bank through X;
      // ascents and braking tilt the nose through Z.
      item.actor.rotation.x=pose.bank;
      item.actor.rotation.z=pose.pitch;
    }
    // Distant low-geometry flock, one draw call, amortized matrices.
    if(frames%2===0){
      for(let i=0;i<activeFar;i++){
        const b=far[i];
        if(Math.hypot(b.x-center.x,b.z-center.z)>290){
          const a=random()*Math.PI*2,r=120+random()*70;
          b.x=center.x+Math.cos(a)*r;b.z=center.z+Math.sin(a)*r;
          b.y=(heightAt(b.x,b.z)??center.y)+29;b.mode='flight';b.time=0;
        }
        advanceBird(b,step*2,{center,terrainY:heightAt,
          chooseLanding:()=>null,windX,windZ});
        dummy.position.set(b.x,b.y+8,b.z);
        dummy.rotation.set(.12*Math.sin(elapsed*7+b.phase),
          Math.atan2(Math.sin(b.heading),-Math.cos(b.heading)),0);
        dummy.scale.set(.8,.9,.8);dummy.updateMatrix();
        farMesh.setMatrixAt(i,dummy.matrix);
      }
      farMesh.instanceMatrix.needsUpdate=true;
    }
  }
  function dispose(){
    if(disposed)return;disposed=true;
    visual.removeFromParent();
    // Rigged clones share materials/textures. Only the original template owns
    // those GPU resources; don't free an individual bird's shared geometry.
    const seen=new Set();
    for(const root of templateAssets)root.traverse(o=>{
      if(!o.isMesh)return;
      if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose();}
      for(const mat of Array.isArray(o.material)?o.material:[o.material]){
        if(mat&&!seen.has(mat)){seen.add(mat);mat.dispose();}
      }
    });
    shared.body.dispose();shared.wing.dispose();shared.material.dispose();
    farGeometry.dispose();farMaterial.dispose();
    visual.clear();
  }
  return {
    update,setQuality(q){if(BIRD_QUALITY[q]){qualityName=q;refreshBudget();}},
    status(){return {loaded,modelSource:loaded&&templateAssets.length?'owner_glb':'fallback_or_loading',
      animation:'text_keyframed_bone_flight',animatedWingJoints:near[0]?.rig?.wings?.length||0,
      activeNear,activeFar,modeCounts:near.slice(0,activeNear).reduce((o,item)=>{
        o[item.bird.mode]=(o[item.bird.mode]||0)+1;return o;
      },{}),flightStages:near.slice(0,activeNear).reduce((o,item)=>{
        const stage=item.bird.flightStage||'flap';
        o[stage]=(o[stage]||0)+1;return o;
      },{}),frameMs:Math.round(avgFrameMs),visualOnly:true};},
    dispose,
  };
}
