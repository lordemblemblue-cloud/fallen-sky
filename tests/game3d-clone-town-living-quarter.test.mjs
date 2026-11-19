import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {
 CLONE_TOWN_HOUSES,CLONE_TOWN_GUARDS,CLONE_TOWN_CITIZENS,
 verifyTownPlotPlan,inTownBuildablePlot,chooseTownPlots,rectanglesOverlap,
} from '../src/components/game3d/wolfveil/WolfveilTownLivingQuarterLayout.mjs';
import {
 makeTownDialogueBrain,makeTownSentence,townConversationResult,
} from '../src/components/game3d/wolfveil/WolfveilTownDialogueBrain.mjs';
import {buildWolfveilTownLivingQuarter}
 from '../src/components/game3d/wolfveil/WolfveilTownLivingQuarterScene.mjs';
import {WOLFVEIL_IMPORTED_TOWN_FLOOR_Y} from
 '../src/components/game3d/wolfveil/WolfveilImportedTownLayout.mjs';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const floorY=WOLFVEIL_IMPORTED_TOWN_FLOOR_Y+.025;
const mockCollision={
 groundAt:()=>floorY,
 isSolid:()=>false,
 resolve:()=>false,
};

test('one double-sized detached hall and four shop or home buildings per side, with no overlaps',()=>{
 const plan=verifyTownPlotPlan();
 assert.equal(plan.ok,true,plan.violations.join('; '));
 assert.equal(plan.houses,9);
 assert.equal(plan.largerHouses,1);
 assert.equal(CLONE_TOWN_HOUSES.filter(h=>h.side==='left').length,4);
 assert.equal(CLONE_TOWN_HOUSES.filter(h=>h.side==='right').length,4);
 const lodge=CLONE_TOWN_HOUSES.find(h=>h.role==='lodge');
 assert.ok(lodge.w>=24);
 for(const h of CLONE_TOWN_HOUSES){
  assert.ok(inTownBuildablePlot(h),h.id);
  for(const n of CLONE_TOWN_HOUSES)if(n!==h)
    assert.equal(rectanglesOverlap(h,n,1),false,h.id+' vs '+n.id);
 }
 assert.equal(CLONE_TOWN_GUARDS.length,2);
 assert.equal(CLONE_TOWN_CITIZENS.length,8);
});
test('reject hazardous house foundations, rather than bridging water or protruding tiles',()=>{
 const noFloor={groundAt:(x,z)=>x>0?null:floorY,isSolid:()=>false};
 const chosen=chooseTownPlots(noFloor);
 assert.ok(chosen.rejected.some(x=>x.id.startsWith('east_')));
 assert.ok(chosen.accepted.some(x=>x.id.startsWith('west_')));
 const uneven={groundAt:(x,z)=>x>40?floorY+1.5:floorY,isSolid:()=>false};
 assert.ok(chooseTownPlots(uneven).rejected.length>0);
 assert.equal(chooseTownPlots(mockCollision).accepted.length,9);
});
test('locally-generated chatter is varied, bounded, repeatable and never mints items',()=>{
 const a=makeTownDialogueBrain(98),b=makeTownDialogueBrain(98);
 for(let i=0;i<20;i++)assert.equal(a(),b());
 const rand=makeTownDialogueBrain(199);
 const agent={id:'guard_sera',name:'Sera',role:'guard',questNpcId:'archer_vex'};
 const choices=Array.from({length:22},()=>makeTownSentence(agent,rand,{friend:{name:'Ren'}}));
 assert.ok(new Set(choices).size>=6);
 const conversation=townConversationResult(agent,rand,{friend:{name:'Ren'}});
 assert.equal(conversation.name,'Sera');
 assert.equal(conversation.canGrantItems,false);
 assert.ok(conversation.text.length>20);
 assert.equal(conversation.questNpcId,'archer_vex');
});
test('Three.js houses, 2 guard patrols, merchants and non-combat sprites attach and dispose',()=>{
 const scene=new THREE.Group();
 const town=buildWolfveilTownLivingQuarter(scene,{collision:mockCollision});
 assert.equal(town.report.houses,9);
 assert.equal(town.report.guards,CLONE_TOWN_GUARDS.length+1); // patrols and the longhouse warden
 assert.equal(town.report.citizens,CLONE_TOWN_CITIZENS.length+CLONE_TOWN_GUARDS.length+1);
 assert.equal(town.report.shops,6);
 assert.equal(town.report.rejected.length,0);
 assert.equal(typeof town.report.architectureBatched,'boolean');
 assert.equal(scene.children.length,1);
 assert.equal(town.root.children.filter(n=>n.name.startsWith('CloneTownHouse_')).length,9);
 assert.equal(town.root.children.filter(n=>n.name.startsWith('CloneTownNPC_')).length,CLONE_TOWN_CITIZENS.length+CLONE_TOWN_GUARDS.length+1);
 assert.equal(town.isSolid(39,-44),true,'closed merchant house is a genuine wall');
 assert.equal(town.isSolid(0,-35),false,'central approach remains open');
 const guard=town.agents.find(a=>a.id==='guard_sera');
 assert.ok(guard);
 for(let i=0;i<200;i++)town.update(.06,{x:-20,z:-35});
 const moved=town.agents.find(a=>a.id==='guard_sera');
 assert.notEqual(moved.z,guard.z,'guard patrol walks along its street');
 const talk=town.interact({x:moved.x,z:moved.z});
 assert.ok(talk&&talk.name);
 assert.equal(talk.canGrantItems,false);
 const near=town.nearestResident({x:999,z:999});
 assert.equal(near,null);
 const position={x:39,z:-44},prev={x:20,z:-44};
 assert.equal(town.resolveCollision(position,prev),true);
 assert.notEqual(position.x,39,'house collision must stop entry');
 town.dispose();
 assert.equal(scene.children.length,0);
});
test('clone world hooks town updates, E interaction, legitimate handoff, and cleanup',()=>{
 const importer=source('src/components/game3d/wolfveil/WolfveilImportedTownScene.mjs');
 const world=source('src/components/game3d/GameWorld3D.jsx');
 assert.ok(importer.indexOf('collision=bakeWolfveilTownCollision')<
   importer.indexOf('buildWolfveilTownLivingQuarter(root'));
 assert.match(importer,/livingQuarter\?\.resolveCollision/);
 assert.match(source('src/components/game3d/wolfveil/WolfveilTownLivingQuarterScene.mjs'),/mergeGeometries/);
 assert.match(source('src/components/game3d/wolfveil/WolfveilTownLivingQuarterScene.mjs'),/pendingReply/);
 assert.match(importer,/livingQuarter\?\.dispose/);
 assert.match(importer,/nearestResident\(position\)/);
 assert.match(world,/importedSpawnTown\?\.nearestResident\(model\.position\)/);
 assert.match(world,/importedSpawnTown\?\.interactResident\(model\.position\)/);
 assert.match(world,/getAXENPCQuestHandoff\(\{/);
 assert.match(world,/conversation\.questOffer&&handoff\.mode==='offer'/);
 assert.match(world,/nearbyTownResident\.name/);
 assert.doesNotMatch(source('src/components/game3d/wolfveil/WolfveilTownDialogueBrain.mjs'),
   /createInventoryItem|grantQuestReward|awardXP|setGold|addItemToInventory/);
});
