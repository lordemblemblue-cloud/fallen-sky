import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWolfveilTownNavigation } from '../src/components/game3d/wolfveil/WolfveilTownInteriorNavigation.mjs';

const makeRoom = (id,x,z,yaw=0,scale=1) => ({id,label:id,x,z,yaw,scale});
const map = makeWolfveilTownNavigation({
  shops: [makeRoom('blacksmith',15,0,0,.75),makeRoom('tailor',-15,0,Math.PI/2,.75)],
  homes: Array.from({length:8},(_,i)=>makeRoom('residence-'+i,30+i*12,50)),
  fountain:{x:0,z:0,radius:6.55},
});

test('all 8 houses and 4 shop types are represented by walkable room definitions',()=>{
  assert.equal(map.report.walkableHomes,8);
  assert.equal(map.report.shopCount,2);
  assert.equal(map.report.coarseWholeHouseBarriers,false);
});

test('home front genkan is an actual passage; side wall is solid',()=>{
  const h={x:30,z:50};
  assert.equal(map.isSolid(h.x,h.z+2.92),false,'front door must not block player');
  assert.equal(map.isSolid(h.x-4.46,h.z),true,'side wall should block');
  const entrance={x:h.x,z:h.z+1.7};
  assert.equal(map.resolveCollision(entrance,{x:h.x,z:h.z+4.1}),false,'walk through genkan');
  assert.equal(map.roomAt(entrance)?.kind,'home');
  const side={x:h.x-3.1,z:h.z};
  assert.equal(map.resolveCollision(side,{x:h.x-5.6,z:h.z}),true,'no walking through wall');
  assert.ok(side.x<=h.x-4.8,'wall slide must keep character outside');
});

test('the four storefront approaches include a front entrance and open side genkan',()=>{
  assert.equal(map.nearestShop({x:15+3.1*.75,z:2.05*.75})?.id,'blacksmith');
  assert.equal(map.isSolid(15+8.4*.75, -1.65*.75),false,'open side door');
  assert.equal(map.isSolid(15+8.4*.75,-4.6*.75),true,'closed wall segment');
  const entrance={x:15+3.1*.75,z:1.25*.75};
  assert.equal(map.resolveCollision(entrance,{x:entrance.x,z:3.8*.75}),false);
  assert.equal(map.roomAt(entrance)?.id,'blacksmith');
});

test('rotation is applied to door gaps and protects side walls',()=>{
  const room={x:-15,z:0, yaw:Math.PI/2, scale:.75};
  const at=(x,z)=>({x:room.x+Math.cos(room.yaw)*x*room.scale+Math.sin(room.yaw)*z*room.scale,
                     z:room.z-Math.sin(room.yaw)*x*room.scale+Math.cos(room.yaw)*z*room.scale});
  assert.equal(map.isSolid(...Object.values(at(8.4,-1.65))),false);
  assert.equal(map.isSolid(...Object.values(at(-9.4,0))),true);
  assert.equal(map.nearestShop(at(3.1,2.05))?.id,'tailor');
});

test('swept collision catches sprinting through thin walls and fountain basin',()=>{
  const p={x:30-3.3,z:50};
  assert.equal(map.resolveCollision(p,{x:30-5.8,z:50}),true);
  assert.equal(map.isSolid(0,0),true);
  const basinTarget={x:-4,z:0};
  assert.equal(map.resolveCollision(basinTarget,{x:-9,z:0}),true);
});
