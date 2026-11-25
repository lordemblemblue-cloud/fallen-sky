import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditConduitPlacement,chooseConduitSpawn,resolveConduitPickupPosition} from '../src/components/duelist/sim/conduitPlacement.mjs';
const p=(x,y=-5,z=0,id=String(x))=>({x,y,z,id});
const disc=(y,radius=10,cutouts=[])=>({cx:0,cz:0,radius,yMin:y-.5,yMax:y,walkable:true,cutouts});
const world=(parts={})=>({obbs:[],discs:[disc(-5)],annuli:[],cylinders:[],ramps:[],shaftOpenings:[],jumpPads:[],...parts});
test('spawn footprint rejects an edge, hole, blocked headroom and station collision',()=>{
  const w=world({discs:[disc(-5,10,[{cx:3,cz:0,hx:1,hz:1,cos:1,sin:0}])],cylinders:[{cx:0,cz:0,radius:1.1,yMin:-5,yMax:-3.5,label:'station'}],
    obbs:[{cx:-3,cy:-3.5,cz:0,hx:1,hy:.2,hz:1,cos:1,sin:0,label:'ceiling',walkable:false}]});
  for(const x of [0,3,-3,9.8])assert.equal(auditConduitPlacement(w,p(x)).ok,false);
  assert.equal(auditConduitPlacement(w,p(0,-5,2.6)).ok,true);
});
test('spawn scoring rejects nearby enemies and reservations and prefers concealment and rotation',()=>{
  const w=world(),a=p(-6),b=p(6),c=p(0),enemy=p(0,-5,1,'enemy');
  assert.equal(chooseConduitSpawn(w,[a,b,c],{enemies:[enemy],canSee:s=>s.id===a.id}).spawn.id,b.id);
  assert.equal(chooseConduitSpawn(w,[a,b],{reserved:[b]}).spawn.id,a.id);
  assert.equal(chooseConduitSpawn(w,[a,b],{recentIds:[a.id]}).spawn.id,b.id);
  assert.equal(chooseConduitSpawn(w,[c],{enemies:[enemy]}),null);
  assert.equal(chooseConduitSpawn(w,[a,b],{enemies:[enemy],requireUnexposed:true}),null);
});
test('core relocates onto a nearby clear floor, stays on its tier and never invents a fallback',()=>{
  const w=world({cylinders:[{cx:0,cz:0,radius:1.1,yMin:-5,yMax:-3.5,label:'station'}]});
  assert.deepEqual(resolveConduitPickupPosition(w,'t0_core',[0,-5,0]),[0,-5,2.6]);
  assert.deepEqual(resolveConduitPickupPosition(w,'other',[5,-5,0]),[5,-5,0]);
  assert.equal(resolveConduitPickupPosition(world({discs:[]}),'t0_core',[0,-5,0]),null);
  const resolved=resolveConduitPickupPosition(w,'other',[0,-5,0]);
  assert.equal(resolved[1],-5);assert.ok(Math.hypot(resolved[0],resolved[2])<=3.01);
});
