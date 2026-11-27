import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFollowCamera} from '../src/components/duelist/client/controls.mjs';
import {conduitLiveRay} from '../src/components/duelist/sim/conduitLiveLayout.mjs';
import manifest from '../src/components/duelist/sim/conduitLiveData.mjs';
const dt=1/60;
const aim=(camera,yaw,pitch)=>assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)))<1e-6);
const setup=()=>{const camera=new THREE.PerspectiveCamera(55,1,.05,400);return {camera,follow:createFollowCamera(camera)};};
const eye=p=>new THREE.Vector3(p.x,p.y+1.45,p.z);

test('actual Conduit collision, 360 degree orbit at all navigation nodes and three pitches',()=>{
 const {camera,follow}=setup();let count=0,compressed=0;
 for(const {id,pos:target} of manifest.nodes){
  follow.snap();
  for(const pitch of [-.2,.32,1.1])for(let i=0;i<24;i++){
   const yaw=i*Math.PI/12;
   follow.update(dt,{target,yaw,pitch,interiorRay:conduitLiveRay});
   assert.equal(conduitLiveRay(camera.position,camera.position,.12),1,`${id} camera clearance at ${yaw},${pitch}`);
   assert.equal(conduitLiveRay(eye(target),camera.position,0),1,`${id} line of sight`);
   aim(camera,yaw,pitch);count++;
   if(camera.position.distanceTo(eye(target))<4.2)compressed++;
   if(target.y===-5)assert.ok(camera.position.y<0,`${id}: basement camera stays below ground`);
  }
 }
 assert.ok(count>1000);assert.ok(compressed>0);
});

test('instant wall retraction, smooth extension and immediate manual heading, including target lock',()=>{
 const {camera,follow}=setup();const target={x:0,y:-5,z:0};
 // A wall behind the player in one direction; distance is measured along a radial arm.
 const ray=(a,b)=>b.z < -1 ? (-1-a.z)/(b.z-a.z):1;
 follow.update(dt,{target,yaw:Math.PI,pitch:0,interiorRay:ray});
 assert.ok(Math.abs(camera.position.z-4.3)<1e-6);
 follow.update(dt,{target,yaw:0,pitch:0,interiorRay:ray});
 assert.ok(camera.position.z> -1&&camera.position.z<-.9);aim(camera,0,0);
 follow.update(dt,{target,yaw:Math.PI,pitch:0,interiorRay:ray,lockOn:{x:10,y:-5,z:0}});
 assert.ok(camera.position.z>1&&camera.position.z<2);aim(camera,Math.PI,0);
 for(let i=0;i<60;i++)follow.update(dt,{target,yaw:Math.PI,pitch:0,interiorRay:ray});
 assert.ok(camera.position.z>4.29);
});

test('low ceiling selects a safe eye and a zero-length arm still responds to every heading',()=>{
 const {camera,follow}=setup();const target={x:0,y:-5,z:0};
 const ray=(a,b)=>a.y> -3.7?0:a.x===b.x&&a.y===b.y&&a.z===b.z?1:0;
 for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
  follow.update(dt,{target,yaw,pitch:.32,interiorRay:ray});
  assert.ok(camera.position.y<=-3.7);aim(camera,yaw,.32);
 }
});

test('non-Conduit camera keeps its existing lock-on framing and ground behavior',()=>{
 const {camera,follow}=setup();follow.update(dt,{target:{x:0,y:0,z:0},yaw:0,pitch:0,lockOn:{x:4,y:0,z:0}});
 assert.ok(Math.abs(camera.position.x-1)<1e-6);assert.equal(camera.position.z,-4.3);
});
