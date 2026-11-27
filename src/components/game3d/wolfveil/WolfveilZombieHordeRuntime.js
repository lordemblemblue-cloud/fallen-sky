// LIVE Game 3D: streamed owner-supplied zombie FBX enemies.
// No competing AI tick: active entities join GameWorld3D's original enemies
// array, so its strike telegraphs, dodge, combat HUD, collision, death,
// player-health and character-scoped experience rules remain in charge.
// Max 30 concurrent rigged models from 150 deterministic planned encounters.
import * as THREE from 'three';
import {clone as cloneSkinnedEnemy} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {consolidateModelMaterialGroups} from '../render/consolidateMaterialGroups.mjs';
import {shrinkModelTextures} from '../npc/sharedNpcModel.mjs';
import {game3dHiPolyRequested} from '../render/lowPolyWorld.mjs';
import {getAXEEnemyStats} from '../axe/balance/AXEPowerBudget';
import {
  planWolfveilZombieCamps,safeZombieGround,WOLFVEIL_ZOMBIE_MAX_ACTIVE,
} from './WolfveilZombieCamps.mjs';
import {WOLFVEIL_ZOMBIE_OWNER_ASSETS as ASSETS} from './WolfveilZombieOwnerAssets.mjs';

const ACTIVE_RADIUS=115;
const RELEASE_RADIUS=158;
const SPAWNS_PER_UPDATE=3;
const CHECK_INTERVAL=.45;
const DEATH_RESPAWN_MS=18000;

const clipPromise=(loader,url,label)=>new Promise(resolve=>{
  loader.load(url,fbx=>resolve(fbx.animations?.[0]||null),undefined,error=>{
    console.warn('Zombie '+label+' animation could not be loaded',error);
    resolve(null);
  });
});

export function createWolfveilZombieHordeRuntime({
  scene,loader,enemies,sampleGroundY,onCountChange=()=>{},
}={}){
  if(!scene?.add||!loader?.load||!Array.isArray(enemies)||
      typeof sampleGroundY!=='function')throw Error('Missing live Game 3D zombie runtime dependencies');

  const planned=planWolfveilZombieCamps();
  const active=new Map(),cooldowns=new Map();
  let disposed=false,ready=false,source=null,elapsed=0;
  const clips={};
  const state={planned:planned.length,active:0,loaded:false,failed:null,
    verifiedServerRewards:false,spawnedIds:[]};
  const refreshStatus=()=>{
    state.active=active.size;
    state.spawnedIds=[...active.keys()];
    onCountChange(enemies.filter(e=>e.alive&&!e.dying).length);
  };
  const loadOnce=new Promise(resolve=>{
    loader.load(ASSETS.model,root=>resolve(root),undefined,e=>{
      console.warn('Uploaded zombie mesh unavailable; camps stay unpopulated',e);
      state.failed=String(e?.message||e);
      resolve(null);
    });
  });
  Promise.all([loadOnce,Promise.all(Object.entries(ASSETS)
    .filter(([key])=>key!=='model')
    .map(async([key,url])=>{clips[key]=await clipPromise(loader,url,key);}))])
    .then(([root])=>{
      if(disposed)return;
      if(!root){state.failed||='Missing owner-supplied zombie FBX';return;}
      source=root;
      // Low-poly world: the zombie's 205 draw groups (2 materials) become 2, and its 2048 px textures 1024 px, once
      // on the shared source before any clone is drawn (?hiPoly=1 keeps the file as loaded).
      if(!game3dHiPolyRequested()){
        state.drawGroups=consolidateModelMaterialGroups(root);
        state.texturesShrunk=shrinkModelTextures(root,1024);
      }
      // The uploaded 16MB Attack file includes the actual mesh, rig and its
      // default attack motion; smaller FBXs are motions only.
      clips.attack ||= root.animations?.[0]||null;
      clips.idle ||= clips.idleVariant||null;
      clips.death ||= clips.dying||null;
      state.loaded=true;
      ready=true;
    }).catch(error=>{
      state.failed=String(error?.message||error);
    });

  function createEntity(spawn,y){
    if(!source||disposed)return null;
    const model=cloneSkinnedEnemy(source);
    const sourceBounds=new THREE.Box3().setFromObject(model);
    const dim=sourceBounds.getSize(new THREE.Vector3());
    const maxDim=Math.max(dim.x,dim.y,dim.z);
    if(!Number.isFinite(maxDim)||maxDim<=0)return null;
    const scale=1.7/maxDim;
    model.scale.setScalar(scale);
    model.position.set(spawn.x,y,spawn.viewerZ);
    model.name='Wolfveil_Zombie_'+spawn.campId+'_'+spawn.index;
    const tintMaterials=[];
    model.traverse(child=>{
      if(!child.isMesh)return;
      child.castShadow=!child.isSkinnedMesh;
      child.receiveShadow=true;
      child.frustumCulled=false;
      if(!child.material)return;
      child.material=Array.isArray(child.material)
        ?child.material.map(m=>m.clone()):child.material.clone();
      for(const mat of (Array.isArray(child.material)?child.material:[child.material]))
        tintMaterials.push(mat);
    });
    const ringGeometry=new THREE.RingGeometry(.72/scale,.93/scale,20);
    const ringMaterial=new THREE.MeshBasicMaterial({
      color:0xdf4444,side:THREE.DoubleSide,transparent:true,opacity:.52,
      depthWrite:false,
    });
    const ring=new THREE.Mesh(ringGeometry,ringMaterial);
    ring.name='Wolfveil_Zombie_Hostile_Foot_Marker';
    ring.rotation.x=-Math.PI/2;
    ring.position.y=.035/scale;
    model.add(ring);
    scene.add(model);

    const mixer=new THREE.AnimationMixer(model);
    const entry={
      id:spawn.id,name:'Zombie · '+spawn.campLabel,
      bossName:'Zombie · '+spawn.campLabel,
      group:model,mixer,alive:true,dying:false,
      walkAction:null,runAction:null,idleAction:null,
      attackClip:clips.attack,dyingClip:clips.dying,deathClip:clips.death,
      hitClip:null,
      state:'idle',stateTimer:(spawn.index%5)*.4,
      target:null,hitCooldown:0,
      tintMaterials,ringGeometry,ringMaterial,
      campId:spawn.campId,campNumber:spawn.campNumber,
      zoneCenter:spawn.zoneCenter,zoneRadius:spawn.zoneRadius,
      home:[spawn.x,y,spawn.viewerZ],respawnAt:null,
      tier:'normal',level:spawn.level,
      // Retain the source camp's HP and XP as fixed progress goals.
      // Adjust only ATTACK pressure to player level in GameWorld3D.
      derived:getAXEEnemyStats(spawn.level,'normal'),
      xpReward:spawn.xpReward,
      wolfveilZombieCampSpawn:true,
      authoritativeServerSpawnVerified:false,
      attackCooldown:.6+(spawn.index%6)*.3,
      aiProfile:'aggressive',attacking:false,attackWindupTimer:0,
      thinkInterval:.35+(spawn.index%5)*.13,
      thinkTimer:spawn.index*.03,
      speedJitter:.84+(spawn.index%7)*.035,
      idleVariance:.9+(spawn.index%3)*.1,
      walkVariance:.8+(spawn.index%4)*.11,
    };
    entry.maxHp=entry.derived.maxHP;
    entry.hp=entry.maxHp;
    const bind=(key,clip,{loopOnce=false,speed=1}={})=>{
      if(!clip)return null;
      const action=mixer.clipAction(clip,key==='walk'?model:model);
      action.setEffectiveTimeScale(speed);
      if(loopOnce){action.setLoop(THREE.LoopOnce);action.clampWhenFinished=true;}
      return action;
    };
    // Independent action states; the two idles vary pose across a crowd.
    const idle=spawn.index%3===0?clips.idleVariant||clips.idle:clips.idle;
    entry.idleAction=bind('idle',idle);
    entry.runAction=bind('run',clips.run,{speed:.92});
    entry.walkAction=bind('walk',clips.run?.clone(),{speed:.42});
    entry.attackAction=bind('attack',clips.attack,{loopOnce:true});
    entry.idleAction?.reset().fadeIn(.18).play();
    enemies.push(entry);
    active.set(spawn.id,entry);
    return entry;
  }

  function releaseEntity(entry){
    if(!entry)return;
    active.delete(entry.id);
    // Remove from the SAME enemies collection as combat target queries.
    const index=enemies.indexOf(entry);
    if(index!==-1)enemies.splice(index,1);
    entry.mixer?.stopAllAction();
    entry.mixer?.uncacheRoot(entry.group);
    scene.remove(entry.group);
    for(const mat of entry.tintMaterials)mat.dispose();
    entry.ringGeometry?.dispose();
    entry.ringMaterial?.dispose();
    // Shared mesh geometry, skeleton source and original maps are NOT
    // disposed: other visible zombies still refer to the same assets.
  }

  function update(dt,playerPosition){
    if(disposed||!ready||!playerPosition)return;
    elapsed+=Math.max(0,Math.min(.15,Number(dt)||0));
    if(elapsed<CHECK_INTERVAL)return;
    elapsed=0;
    const px=playerPosition.x,pz=playerPosition.z;
    if(!Number.isFinite(px)||!Number.isFinite(pz))return;
    const now=performance.now();

    // Complete both uploaded cinematic stages: Dying transitions to Death,
    // while GameWorld3D owns the death timer, fade and eventual respawn.
    for(const entry of active.values()){
      if(!entry.dying){
        entry.zombieFinalPlayed=false;
        continue;
      }
      const firstDuration=Math.min(1.3,Math.max(.45,
        (Number(entry.dyingClip?.duration)||1.5)*.72));
      if(!entry.zombieFinalPlayed&&entry.deathTimer>=firstDuration){
        entry.zombieFinalPlayed=true;
        if(entry.deathClip&&entry.mixer){
          entry.mixer.clipAction(entry.dyingClip||entry.deathClip).fadeOut(.16);
          const final=entry.mixer.clipAction(entry.deathClip);
          final.setLoop(THREE.LoopOnce);
          final.clampWhenFinished=true;
          final.reset().fadeIn(.16).play();
          entry.deathAction=final;
        }
      }
    }

    let released=0;
    for(const entry of [...active.values()]){
      const distance=Math.hypot(entry.group.position.x-px,entry.group.position.z-pz);
      if(distance>RELEASE_RADIUS){
        if(entry.dying&&entry.respawnAt)cooldowns.set(entry.id,entry.respawnAt);
        releaseEntity(entry);
        released++;
      }
    }

    let created=0;
    const near=planned.filter(p=>{
      if(active.has(p.id)||!p.isSafeSource)return false;
      const cooldown=cooldowns.get(p.id)||0;
      if(cooldown>now)return false;
      if(cooldown)cooldowns.delete(p.id);
      return Math.hypot(p.x-px,p.viewerZ-pz)<=ACTIVE_RADIUS;
    }).sort((a,b)=>
      Math.hypot(a.x-px,a.viewerZ-pz)-Math.hypot(b.x-px,b.viewerZ-pz));
    for(const spawn of near){
      if(active.size>=WOLFVEIL_ZOMBIE_MAX_ACTIVE||created>=SPAWNS_PER_UPDATE)break;
      // Same real terrain BVH sample used by player feet. Reject cliffs and
      // liquid/open spaces rather than placing a floating/invisible enemy.
      const y=safeZombieGround(sampleGroundY,spawn);
      if(y===null)continue;
      if(createEntity(spawn,y))created++;
    }
    if(created||released)refreshStatus();
  }
  function dispose(){
    if(disposed)return;
    disposed=true;
    for(const entry of [...active.values()])releaseEntity(entry);
    cooldowns.clear();
    state.loaded=false;
    refreshStatus();
  }
  return {update,dispose,status:()=>({...state}),
    plannedCount:planned.length,visibleCount:()=>active.size,
    respawnSeconds:DEATH_RESPAWN_MS/1000};
}
