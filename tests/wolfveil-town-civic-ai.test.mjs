import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {townRoomWorldPoint,planWolfveilTownCivilians,townSegmentWalkable,
  findTownWalkPath,advanceTownCitizen,TOWN_STAFF}
  from '../src/components/game3d/wolfveil/WolfveilTownCivicAI.mjs';
import {prepareWolfveilCivicSources,createWolfveilCivicTaskRuntime,
  WOLFVEIL_CIVIC_TASKS}
  from '../src/components/game3d/wolfveil/WolfveilTownCivicTasks.mjs';

const collision={
 groundAt:(x,z)=>(Math.abs(x)<63&&Math.abs(z)<68?5:null),
 isSolid:(x,z,r=.45)=>Math.abs(x)<2+r&&Math.abs(z)<6+r,
};
const safe=(x,z)=>Number.isFinite(collision.groundAt(x,z))&&!collision.isSolid(x,z);
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('real shop room rotation and scale map into viewer-world coordinates exactly',()=>{
 const r={x:10,z:20,yaw:Math.PI/2,scale:.75};
 const p=townRoomWorldPoint(r,3,2);
 assert.ok(Math.abs(p.x-11.5)<1e-9&&Math.abs(p.z-17.75)<1e-9);
});
test('civic staff are attached only to real instantiated shops',()=>{
 const shops=[{id:'blacksmith',x:25,z:-15,yaw:0,scale:.75},
              {id:'potion',x:-25,z:-15,yaw:0,scale:.75}];
 const homes=[{id:'home_actual_1',x:32,z:25,yaw:0,scale:1}];
 const npcs=planWolfveilTownCivilians({shops,homes,collision,includeGuards:false});
 assert.equal(TOWN_STAFF.length,4);
 assert.equal(npcs.filter(a=>a.mode==='vendor').length,2);
 assert.equal(npcs.filter(a=>a.mode==='resident').length,1);
 assert.ok(npcs.every(a=>safe(a.x,a.z)));
 assert.ok(!npcs.some(a=>a.id==='civic_ori'));
});
test('existing guard roster remains distinct from static vendors and house owners',()=>{
 const npcs=planWolfveilTownCivilians({collision});
 assert.equal(npcs.filter(a=>a.role==='guard').length,4);
 assert.ok(npcs.every(a=>!collision.isSolid(a.x,a.z)));
 assert.equal(new Set(npcs.map(a=>a.id)).size,npcs.length);
});
test('swept walking checks walls and valid terrain, not just endpoints',()=>{
 assert.equal(townSegmentWalkable({x:-10,z:0},{x:10,z:0},collision),false);
 assert.equal(townSegmentWalkable({x:-10,z:9},{x:10,z:9},collision),true);
 assert.equal(townSegmentWalkable({x:-70,z:0},{x:-50,z:0},collision),false);
});
test('A* route passes around a wall without cutting corners',()=>{
 const start={x:-10,z:0},goal={x:10,z:0};
 const path=findTownWalkPath(start,goal,collision,{cell:1.25});
 assert.ok(path.length>=2,'needs obstacle bypass');
 let from=start;
 for(const p of path){assert.equal(townSegmentWalkable(from,p,collision),true);from=p;}
 assert.ok(Math.hypot(from.x-goal.x,from.z-goal.z)<.15);
});
test('blocked destination fails closed instead of teleporting',()=>{
 assert.deepEqual(findTownWalkPath({x:-10,z:0},{x:0,z:0},collision),[]);
});
test('moving citizen yields to others and cannot step through walls',()=>{
 const a={id:'walker',x:-4,z:0,speed:1,mode:'patrol',waypoints:[{x:4,z:0}]};
 assert.equal(advanceTownCitizen(a,.08,collision,[{id:'other',x:-3,z:0}]),false);
 assert.equal(a.x,-4);
 for(let i=0;i<60;i++)advanceTownCitizen(a,.08,collision,[]);
 assert.ok(a.x < -2.4,'cannot penetrate blocked rectangle');
});
test('task definitions specify actual placed sources with item identities',()=>{
 const sources=prepareWolfveilCivicSources(collision);
 assert.equal(sources.length,WOLFVEIL_CIVIC_TASKS.length);
 for(const s of sources){
  assert.ok(Number.isFinite(s.y)&&!collision.isSolid(s.x,s.z,.75));
  assert.ok(s.sourceId&&s.itemId&&s.npcId&&s.instruction);
 }
});
test('missing terrain or blocked source suppresses quest rather than promising an impossible pickup',()=>{
 const sources=prepareWolfveilCivicSources({...collision,isSolid:()=>true});
 assert.equal(sources.length,0);
 assert.equal(createWolfveilCivicTaskRuntime(sources).talk('civic_yuki'),null);
});
test('task requires NPC acceptance then physical pickup then a return conversation',()=>{
 const q=createWolfveilCivicTaskRuntime(prepareWolfveilCivicSources(collision));
 const s=q.sources[0];
 assert.equal(q.pickup({x:s.x,z:s.z}),null);
 assert.equal(q.talk(s.npcId).taskStatus,'accepted');
 assert.equal(q.pickup({x:s.x+10,z:s.z}),null);
 assert.equal(q.pickup({x:s.x,z:s.z}).taskStatus,'found');
 assert.equal(q.pickup({x:s.x,z:s.z}),null);
 assert.equal(q.talk(s.npcId).taskStatus,'awaiting_server');
 assert.equal(q.talk(s.npcId).canGrantItems,false);
});
test('provisional civic quests can never mint silver, XP or item grants',()=>{
 const q=createWolfveilCivicTaskRuntime(prepareWolfveilCivicSources(collision));
 const s=q.sources[1];q.talk(s.npcId);
 const result=q.pickup({x:s.x,z:s.z});
 assert.equal(result.grantXP,0);assert.equal(result.grantSilver,0);
 assert.equal(result.canGrantItems,false);
 assert.equal(q.snapshot()[s.id],'found');
});
test('real artisan town E handling and old inventory/XP authority are not replaced',()=>{
 const scene=source('src/components/game3d/wolfveil/WolfveilArtisanTownScene.mjs');
 const world=source('src/components/game3d/GameWorld3D.jsx');
 const quarter=source('src/components/game3d/wolfveil/WolfveilTownLivingQuarterScene.mjs');
 assert.match(scene,/realShops: shopRooms, realHomes: homeRooms/);
 assert.match(scene,/collectCivicQuestSource\(position\)/);
 assert.match(world,/importedSpawnTown\?\.collectCivicQuestSource\(model\.position\)/);
 assert.match(world,/game3dArtisanShopOpen/);
 assert.match(quarter,/questRewardAuthority:'server-only-not-connected'/);
 assert.match(quarter,/findTownWalkPath\(/);
});
