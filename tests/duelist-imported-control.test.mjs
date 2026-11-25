import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSource} from '../src/components/duelist/client/localSource.mjs';
import {IMPORTED_CONTROL as map,importedSupport,importedBlockers} from '../src/components/duelist/sim/importedControlLayout.mjs';
import {routesToTest} from '../scripts/imported-control-routes.mjs';
import {createDuelistControlPointArena} from '../src/components/duelist/client/maps/controlPointArena.mjs';
import metadata from '../src/components/duelist/sim/importedControlData.mjs';
import * as THREE from 'three';
const spawns=[...map.spawns.redTeam.primarySpawns,...map.spawns.redTeam.fallbackSpawns,...map.spawns.blueTeam.primarySpawns,...map.spawns.blueTeam.fallbackSpawns];
const idle=()=>({move:{x:0,z:0},presses:[]});
for(const slot of spawns)test(`imported spawn ${slot.id}: floor, clearance, objective exclusion and standing simulation`,()=>{
 assert.equal(importedSupport(map,slot.x,slot.z,slot.y+.1),slot.y);
 assert.deepEqual(importedBlockers(map,{...slot,radius:.55,height:2.2}),[]);
 assert.ok(map.controlPoints.every(p=>Math.hypot(p.x-slot.x,p.z-slot.z)>p.radius||Math.abs(p.y-slot.y)>3.5));
 const s=createLocalSource({mode:'control',testMode:true,classId:'duelist'});s.match.phase='live';const body=s.world.bodies.get('you');Object.assign(body,slot,{vy:0});
 for(let i=0;i<60;i++)s.step(1/60,idle);
 assert.equal(body.y,slot.y);assert.equal(body.x,slot.x);assert.equal(body.z,slot.z);
});
for(const route of routesToTest)test(`real match route: ${route.name}`,()=>{
 const s=createLocalSource({mode:'control',testMode:true,classId:'duelist'});s.match.phase='live';const body=s.world.bodies.get('you');Object.assign(body,route.waypoints[0],{vy:0});
 for(const target of route.waypoints.slice(1)){
   const steps=Math.ceil(Math.hypot(target.x-body.x,target.z-body.z)/4.6*60*2.2)+180;
   for(let n=0;n<steps;n++){
     const dx=target.x-body.x,dz=target.z-body.z,d=Math.hypot(dx,dz);if(d<.25)break;
     s.step(1/60,()=>({move:{x:dx/d,z:dz/d},run:true,presses:[]}));assert.ok(body.y>=-1,`fell on ${route.name}`);
   }
   assert.ok(Math.hypot(body.x-target.x,body.z-target.z)+Math.abs(body.y-target.y)<=.85,JSON.stringify({target,body}));
 }
});
test('generated physics metadata is identical to the visual construction',()=>{
 const original=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>new Proxy({}, {get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)})})};
 const visual=createDuelistControlPointArena(THREE);
 try{assert.deepEqual(visual.collisionDefinitions,metadata.collisionDefinitions);assert.deepEqual(visual.spawnDefinitions,metadata.spawnDefinitions);assert.equal(visual.capturePoints.length,3);}finally{visual.dispose();if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
test('Alpha capture requires the upper floor; fall resets to a validated spawn',()=>{
 const s=createLocalSource({mode:'control',testMode:true,classId:'duelist'});s.match.phase='live';let body=s.world.bodies.get('you');Object.assign(body,{x:0,y:0,z:-105,vy:0});
 for(let i=0;i<300;i++)s.step(1/60,idle);assert.equal(s.view().controlPoints[0].owner,null);
 Object.assign(body,{x:0,y:8,z:-105,vy:0});for(let i=0;i<300;i++)s.step(1/60,idle);assert.equal(s.view().controlPoints[0].owner,'red');
 Object.assign(body,{x:40,y:-18.2,z:50,vy:-1});s.step(1/30,idle);body=s.world.bodies.get('you');assert.ok(spawns.some(p=>p.x===body.x&&p.z===body.z&&p.y===body.y));
});
