import test from 'node:test';
import assert from 'node:assert/strict';
import {WOLFVEIL_SOUTH_GATE_FIRE_DESIGN as d,planWolfveilSouthGateBlueFire as plan,stageWolfveilSouthGateBlueFire as stage} from '../src/components/game3d/wolfveil/landscaping/WolfveilSouthGateBlueFire.mjs';
const tile=(x,z)=>({minX:x,maxX:x+5,minZ:z,maxZ:z+5});
const providers={heightAt:(x,z)=>2+.004*x,clearAt:()=>true};
test('requires real providers and explicit approved squares',()=>{
  assert.throws(()=>plan(),/requires/);
  let p=plan({...providers}); assert.equal(p.flames.length+p.grass.length,0);
});
test('single tile never allows geometry across any other square',()=>{
 const t=tile(5,-253),p=plan({...providers,approvedSquares:[t]});
 assert.ok(p.flames.length>0);
 for(const v of [...p.flames,...p.grass]){
   assert.ok(v.x>=t.minX&&v.x<t.maxX&&v.z>=t.minZ&&v.z<t.maxZ);
   assert.equal(v.y,2+.004*v.x);
 }
});
test('path retains an entirely fire-free grass center',()=>{
 const p=plan({...providers,approvedSquares:[...Array.from({length:28},(_,i)=>tile(0,-360+i*5)),...Array.from({length:28},(_,i)=>tile(-5,-360+i*5))]});
 assert.ok(p.grass.length>0);
 assert.ok(p.flames.every(v=>Math.abs(v.x)>=4.7));
 assert.equal(p.worldZOffsetApplied,false);
});
test('clearance and invalid height always fail closed',()=>{
 const t=tile(5,-253);
 assert.equal(plan({approvedSquares:[t],heightAt:()=>NaN,clearAt:()=>true}).flames.length,0);
 assert.equal(plan({approvedSquares:[t],heightAt:()=>2,clearAt:()=>false}).flames.length,0);
});
test('arena remains clear of fire and exposes a server-only spawn anchor',()=>{
 const tiles=[];
 for(let x=-40;x<40;x+=5)for(let z=-430;z<-345;z+=5)tiles.push(tile(x,z));
 const p=plan({...providers,approvedSquares:tiles});
 assert.ok(p.flames.length>80);
 const c=d.clearing;
 const ring=p.flames.filter(f=>Math.hypot(f.x-c.x,f.z-c.z)>30);
 assert.ok(ring.length>0);
 assert.ok(p.flames.every(v=>Math.hypot(v.x-c.x,v.z-c.z)>=c.combatClearRadius));
 assert.match(p.encounterAnchor.authority,/server_required/);
});
test('deterministic seed with no terrain/collision writes',()=>{
 const opts={...providers,approvedSquares:[tile(5,-253)]};
 assert.deepEqual(plan(opts),plan(opts));
});
test('Three adapter needs actual Game 3D opt-in',()=>{
 assert.throws(()=>stage({}, {flames:[],grass:[]}),/Game 3D/);
});
