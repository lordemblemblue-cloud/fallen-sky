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
 assert.match(world,/if\(appliedDamage>0&&activeWeaponPath==='ranged'\)/);
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
 const args={...base(),maxRange:BOW_PVE_RANGE};
 assert.equal(BOW_PVE_RANGE,40);
 assert.equal(selectCameraBowTarget({...args,enemies:[mid]})?.target,mid);
 assert.equal(selectCameraBowTarget({...args,enemies:[far]}),null);
 const world=read('src/components/game3d/GameWorld3D.jsx');
 assert.match(world,/maxRange:BOW_PVE_RANGE/);
 assert.match(world,/dispatchRogueAttack\(playerDerivedRef, strikeMultiplier, bowAimTarget\)/);
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
