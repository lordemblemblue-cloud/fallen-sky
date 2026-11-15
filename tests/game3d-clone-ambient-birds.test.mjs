import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BIRD_QUALITY,birdBudget,birdRandom,makeBird,findBirdLanding,
  advanceBird} from '../src/components/game3d/wolfveil/ambient/WolfveilBirdFlightPlan.mjs';
test('one quality cap; automatic low-frame-rate and mobile bird reduction',()=>{
 const good=birdBudget('high',16.7,false);
 const slow=birdBudget('high',42,false);
 const mobile=birdBudget('high',16.7,true);
 assert.equal(good.near,BIRD_QUALITY.high.near);
 assert.ok(good.far>0&&slow.near<good.near&&slow.far<good.far);
 assert.ok(mobile.near<good.near);
 assert.ok(birdBudget('low',17).near<birdBudget('ultra',17).near);
});
test('seeded flock positions and flight speed are reproducible',()=>{
 const p={x:0,y:9,z:70},terrain=()=>5;
 assert.deepEqual(makeBird(1,p,terrain,birdRandom(31)),
   makeBird(1,p,terrain,birdRandom(31)));
});
test('landing positions require real sample and safe clearance',()=>{
 const center={x:0,z:70};
 assert.equal(findBirdLanding(center,()=>0),null);
 assert.equal(findBirdLanding(center,()=>0,{
   groundAt:()=>7,clearAt:()=>false}),null);
 const hit=findBirdLanding(center,()=>0,{groundAt:()=>7,clearAt:()=>true});
 assert.deepEqual(hit,{x:25,y:7,z:70});
});
test('steep unsafe terrain prevents landing rather than snapping to slopes',()=>{
 const center={x:0,z:70};
 assert.equal(findBirdLanding(center,()=>0,{
   groundAt:(x)=>x*5,clearAt:()=>true,tries:5}),null);
 assert.equal(findBirdLanding(center,()=>0,{
   groundAt:()=>NaN,clearAt:()=>true,tries:5}),null);
});
test('bird flies, descends, lands, rests and takes off independently',()=>{
 const center={x:0,z:0,y:0},b=makeBird(0,center,()=>0,birdRandom(30));
 b.x=0;b.z=0;b.y=2;b.time=b.flightFor+.2;b.restFor=.2;
 advanceBird(b,.08,{center,terrainY:()=>0,
   chooseLanding:()=>({x:b.x,z:b.z,y:0})});
 assert.equal(b.mode,'descending');
 let sawLanding=false,sawTakeoff=false;
 for(let i=0;i<100;i++){
   advanceBird(b,.08,{center,terrainY:()=>0,chooseLanding:()=>null});
   if(b.mode==='landed')sawLanding=true;
   if(b.mode==='takeoff')sawTakeoff=true;
 }
 assert.equal(sawLanding,true);
 assert.equal(sawTakeoff,true);
 assert.equal(b.mode,'flight');
 assert.equal(b.target,null);
});
test('unbounded or missing terrain cannot mutate game physics',()=>{
 const birds=readFileSync(new URL('../src/components/game3d/wolfveil/ambient/WolfveilAmbientBirds.mjs',import.meta.url),'utf8');
 assert.match(birds,/GLTFLoader/);
 assert.match(birds,/cloneSkinned/);
 assert.match(birds,/wolfveilIsProtectedSWTile/);
 assert.match(birds,/insideWolfveilImportedTown/);
 assert.match(birds,/raycast=noop/);
 assert.doesNotMatch(birds,/awardXP\(|createRigidBody\(|addCollider\(|server\.spawn|skinWeight\.set/);
});
test('real clone Wolfveil game loop mounts, ticks and disposes birds',()=>{
 const s=readFileSync(new URL('../src/components/game3d/GameWorld3D.jsx',import.meta.url),'utf8');
 assert.match(s,/createWolfveilAmbientBirds\(\{/);
 assert.match(s,/ambientBirds\?\.update\(delta,modelRef\.current\?\.position,envSystem\.getState\(\)\)/);
 assert.match(s,/ambientBirds\?\.dispose\(\)/);
 assert.match(s,/const ambientBirds=wolfveilVillage\?/);
});
