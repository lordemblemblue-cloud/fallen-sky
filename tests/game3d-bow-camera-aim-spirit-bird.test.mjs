import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import { BOW_PVE_RANGE,BOW_AIM_SETTINGS,selectCameraBowTarget,cameraBowImpactPoint,
  pickCameraBowCombatTargets } from '../src/components/game3d/combat/BowCameraAim.mjs';
import {createGame3DBowAimVisuals} from '../src/components/game3d/vfx/Game3DBowSpiritBird.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const makeCamera=()=>{const c=new THREE.PerspectiveCamera(55,16/9,.1,200);
  c.position.set(0,2,8);c.lookAt(0,1.4,0);c.updateMatrixWorld(true);return c;};
const enemy=(id,x=0,z=0)=>{
 const group=new THREE.Group();group.position.set(x,1.4,z);
 group.add(new THREE.Mesh(new THREE.SphereGeometry(.65,12,8),new THREE.MeshBasicMaterial()));
 group.updateMatrixWorld(true);
 return {id,name:id,alive:true,hp:100,group};
};
const base=()=>({camera:makeCamera(),origin:new THREE.Vector3(0,0,5),maxRange:12});

test('the small centre dot selects a real enemy hit, not the old 150 degree frontal fan',()=>{
 const straight=enemy('straight'),offAxis=enemy('off-axis',5,0);
 const hit=selectCameraBowTarget({...base(),enemies:[offAxis,straight]});
 assert.equal(hit?.target,straight);
 assert.equal(hit.rayHit,true);
 assert.equal(pickCameraBowCombatTargets({...base(),enemies:[offAxis,straight]})[0]?.target,straight);
 assert.ok(BOW_AIM_SETTINGS.edgeNdc<.1);
});
test('camera dot does not silently acquire off-axis enemies even when selected as a lock',()=>{
 const wide=enemy('wide',5,0);
 assert.equal(selectCameraBowTarget({...base(),enemies:[wide]}),null);
 assert.equal(selectCameraBowTarget({...base(),enemies:[wide],lockedEnemyId:'wide'}),null);
});
test('dead, invisible and out-of-range enemies never receive bow hits',()=>{
 const dead=enemy('dead');dead.alive=false;
 const hidden=enemy('hidden');hidden.group.visible=false;
 const distant=enemy('distant',0,-60);
 assert.equal(selectCameraBowTarget({...base(),enemies:[dead,hidden,distant]}),null);
});
test('a solid wall between the camera and target blocks the arrow hit',()=>{
 const wall=new THREE.Mesh(new THREE.BoxGeometry(4,4,.2),new THREE.MeshBasicMaterial());
 wall.position.set(0,1.4,4);wall.updateMatrixWorld(true);
 const hit=selectCameraBowTarget({...base(),enemies:[enemy('blocked')],groundMeshes:[wall]});
 assert.equal(hit,null);
});
test('free bow shots have a finite line-of-sight endpoint with no phantom target',()=>{
 const point=cameraBowImpactPoint(makeCamera(),[],40);
 assert.ok([point.x,point.y,point.z].every(Number.isFinite));
 assert.ok(Math.abs(makeCamera().position.distanceTo(point)-40)<.02);
});
test('the spirit-bird is VFX only, animates, caps allocations and disposes cleanly',()=>{
 const scene=new THREE.Scene(),vfx=createGame3DBowAimVisuals({scene,container:{}});
 assert.equal(vfx.fire({origin:{x:0,y:0,z:5},target:{x:0,y:1,z:0}}),true);
 assert.equal(scene.children.length,1);
 for(let i=0;i<16;i++)vfx.update(.05,{active:true});
 assert.equal(scene.children.length,1,'straight trace remains after projectile arrival');
 for(let i=0;i<10;i++)vfx.update(.05,{active:true});
 assert.equal(scene.children.length,0,'tracer must dispose after 1.2 seconds');
 for(let i=0;i<9;i++)vfx.fire({origin:{x:0,y:0,z:5},target:{x:i*.1,y:1,z:0}});
 assert.ok(scene.children.length<=6);
 vfx.confirmHit();vfx.dispose();
 assert.equal(scene.children.length,0);
});
test('the verified damage path is separate from reticle and bird visuals',()=>{
 const world=read('src/components/game3d/GameWorld3D.jsx');
 const bridge=read('src/components/game3d/rogueAttackBridge.jsx');
 const vfx=read('src/components/game3d/vfx/Game3DBowSpiritBird.mjs');
 assert.match(world,/selectCameraBowTarget\(\{/);
 assert.match(world,/activeWeaponPath==='ranged' && aoeRadius===0/);
 assert.match(world,/if\(appliedDamage>0\)bowVisuals\.confirmHit\(appliedDamage\)/);
 assert.match(world,/bowVisuals\.fire/);
 assert.match(world,/bowVisuals\.dispose/);
 assert.match(world,/rangedClickAttackPressed\.current = (?:bowClick|getActiveWeaponPath\(\)==='ranged')/);
 assert.match(world,/__gw3dBowOccluders=bowOccluders/);
 assert.match(bridge,/const bowPriority=ranged\?resolveBowPriorityTarget\(preselectedBowTarget\):null/);
 assert.match(bridge,/window\.addEventListener\('blur',onBlur\)/);
 assert.match(bridge,/lastRangedBaseDamage<=0/);
 assert.match(bridge,/game3dVerifiedBowHit/);
 assert.match(bridge,/if\(ranged\)\{lastRangedBaseDamage=0;return false;\}/);
 assert.doesNotMatch(bridge,/let bestDot = 0\.84/);
 assert.doesNotMatch(vfx,/combatSystem\.applyDamage|updateTargetHP|reportWeaponKill/);
});

test('AI bow range covers a real archery distance without changing duel range',()=>{
 const mid=enemy('mid',0,-22),far=enemy('far',0,-62);
 const midCamera=makeCamera(); midCamera.lookAt(0,1.4,-22); midCamera.updateMatrixWorld(true);
 const farCamera=makeCamera(); farCamera.lookAt(0,1.4,-62); farCamera.updateMatrixWorld(true);
 const args={...base(),maxRange:BOW_PVE_RANGE};
 assert.equal(BOW_PVE_RANGE,40);
 assert.equal(selectCameraBowTarget({...args,camera:midCamera,enemies:[mid]})?.target,mid);
 assert.equal(selectCameraBowTarget({...args,camera:farCamera,enemies:[far]}),null);
 const world=read('src/components/game3d/GameWorld3D.jsx');
 assert.match(world,/maxRange:BOW_PVE_RANGE/);
 assert.match(world,/dispatchRogueAttack\(playerDerivedRef,\s*strikeMultiplier,\s*bowAimTarget\)/);
 assert.match(world,/isRangedClickAttack \|\| pendingSkillStrike\?\.weaponType === 'ranged'/);
});
test('a hittable AI root without decoded triangles gets a bounded fallback body hitbox',()=>{
 const group=new THREE.Group(); group.position.set(0,0,0);
 const ai={id:'loading-ai',hp:100,alive:true,group};
 const camera=makeCamera();
 assert.equal(selectCameraBowTarget({camera,origin:new THREE.Vector3(0,0,5),
   enemies:[ai],maxRange:40})?.target,ai);
});
test('tracer and spirit projectile travel the exact same world-space straight segment',()=>{
 const scene=new THREE.Scene();
 const fx=createGame3DBowAimVisuals({scene,container:{},showDot:false});
 const origin={x:0,y:0,z:5},target={x:0,y:1.3,z:-12};
 assert.equal(fx.fire({origin,target}),true);
 assert.equal(scene.children.length,1);
 const root=scene.children[0];
 const trace=root.children.find(child=>child.isLine);
 assert.ok(trace,'a visible actual THREE.Line must connect bow and hit point');
 const first=new THREE.Vector3().fromBufferAttribute(trace.geometry.attributes.position,0);
 const last=new THREE.Vector3().fromBufferAttribute(trace.geometry.attributes.position,1);
 const bird=root.children.find(child=>child.isGroup);
 assert.ok(first.distanceTo(new THREE.Vector3(0,1.45,5))<1e-5);
 assert.ok(last.distanceTo(new THREE.Vector3(0,1.3,-12))<1e-5);
 fx.update(.2,{active:true});
 const progress=bird.position.clone().sub(first);
 const shot=last.clone().sub(first);
 assert.ok(progress.cross(shot).length()<1e-5,'bird must remain ON the line, never curve');
 fx.confirmHit();
 assert.equal(trace.material.color.getHex(),0x81f6b1);
 fx.dispose();
 assert.equal(scene.children.length,0);
});
test('nearer enemy hitbox receives the arrow, not an enemy behind it',()=>{
 const close=enemy('front',0,2),behind=enemy('back',0,-3);
 const selected=selectCameraBowTarget({...base(),maxRange:40,enemies:[behind,close]});
 assert.equal(selected?.target,close);
});

test('the muzzle cannot shoot through cover even when the camera can see a target',()=>{
 const ai=enemy('visible-to-camera');
 const muzzleWall=new THREE.Mesh(new THREE.BoxGeometry(.5,3,.5),new THREE.MeshBasicMaterial());
 muzzleWall.position.set(1.1,1.4,3.15);muzzleWall.updateMatrixWorld(true);
 const fromSide=new THREE.Vector3(2,0,5);
 const hit=selectCameraBowTarget({camera:makeCamera(),origin:fromSide,
   enemies:[ai],maxRange:40,groundMeshes:[muzzleWall]});
 assert.equal(hit,null);
});

test('every fired PvE arrow reports visible HIT or MISS, never an inherited green tracer',()=>{
 const scene=new THREE.Scene(),visual=createGame3DBowAimVisuals({scene,container:{},showDot:false});
 const shot={origin:{x:0,y:0,z:5},target:{x:0,y:1.3,z:0}};
 const trace=()=>scene.children.at(-1)?.children.find(child=>child.isLine);
 visual.fire(shot);
 assert.equal(trace()?.material?.color?.getHex(),0xffd375);
 visual.confirmMiss('MISS');
 assert.equal(trace()?.material?.color?.getHex(),0xff5d65);
 const first=visual.stats();
 assert.equal(first.fired,1); assert.equal(first.misses,1); assert.equal(first.hits,0);
 assert.ok(first.lastResolutionMs>=0 && Number.isFinite(first.lastResolutionMs));
 visual.fire(shot);
 assert.equal(trace()?.material?.color?.getHex(),0xffd375,'new arrow must start gold, not inherit old hit/miss');
 visual.confirmHit(42);
 assert.equal(trace()?.material?.color?.getHex(),0x81f6b1);
 const second=visual.stats();
 assert.equal(second.fired,2); assert.equal(second.hits,1); assert.equal(second.misses,1);
 assert.equal(second.pending,0);
 visual.dispose();
 assert.equal(scene.children.length,0);
});

test('horde shot-selection uses cheap broadphase and cached actor bounds',()=>{
 const original=THREE.Box3.prototype.setFromObject;
 let expensiveBounds=0;
 THREE.Box3.prototype.setFromObject=function(...args){
   expensiveBounds++;
   return original.apply(this,args);
 };
 try{
   const centerEnemy=enemy('center-ai');
   const farSide=Array.from({length:70},(_,i)=>enemy('outside-'+i,9+(i%12),i%10));
   const args={...base(),maxRange:40,enemies:[...farSide,centerEnemy]};
   for(let index=0;index<30;index++){
     const selected=selectCameraBowTarget(args);
     assert.equal(selected?.target,centerEnemy);
   }
   assert.ok(expensiveBounds<=3,
     'each shot must not traverse 70+ detailed FBX trees for hitbox bounds');
 }finally{
   THREE.Box3.prototype.setFromObject=original;
 }
});

test('boss/rogue outcomes are explicit and the projectile is created before strike resolution',()=>{
 const world=read('src/components/game3d/GameWorld3D.jsx');
 const bridge=read('src/components/game3d/rogueAttackBridge.jsx');
 const vfx=read('src/components/game3d/vfx/Game3DBowSpiritBird.mjs');
 assert.ok(world.indexOf('bowVisuals.fire({origin:model.position')<
   world.indexOf('attackConsumedByPriorityTarget=dispatchRogueAttack('),
   'shot tracer must exist when bridge verifies boss/rogue damage');
 assert.match(world,/game3dVerifiedBowMiss/);
 assert.match(world,/bowVisuals\.confirmMiss\('MISS'\)/);
 assert.match(world,/bowVisuals\.confirmMiss\(strike\.kind==='dodge'\?'DODGED':'MISS'\)/);
 assert.match(bridge,/game3dVerifiedBowMiss/);
 assert.match(bridge,/game3dVerifiedBowHit/);
 assert.match(bridge,/damage:applied/);
 assert.match(vfx,/game3dBowResult/);
 assert.match(vfx,/const shotStats=\{fired:0,hits:0,misses:0,lastResolutionMs:null\}/);
});
