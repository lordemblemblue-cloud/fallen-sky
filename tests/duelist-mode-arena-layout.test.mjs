import test from 'node:test';
import assert from 'node:assert/strict';
import { getModeArenaLayout, arenaFloorContains, arenaBodyBlockers, arenaLandingHeight, moveArenaBody, arenaRayFraction, arenaLineClear, arenaGrounded } from '../src/components/duelist/sim/modeArenaLayout.mjs';
import { makeControlPoints } from '../src/components/duelist/sim/control.mjs';
import { ESCORT_LENGTH, payloadPose } from '../src/components/duelist/sim/escort.mjs';
import { MODES, createMatch, joinMatch } from '../src/components/duelist/sim/match.mjs';

test('Conduit is the regular shared TDM and FFA arena; other layouts retain their identity',()=>{
 const t=getModeArenaLayout('tdm'),f=getModeArenaLayout('ffa');
 assert.equal(t.id,'the-conduit');assert.equal(f.id,t.id);assert.equal(f.world,t.world);
 assert.equal(t.radius,44.8);assert.equal(MODES.tdm.arena,t.radius);assert.equal(MODES.ffa.arena,f.radius);
 assert.equal(t.capacity,8);assert.equal(f.capacity,6);
 assert.ok(getModeArenaLayout('escort').escortImported);
 for(const mode of ['duel','practice','football','story','constructor'])assert.equal(getModeArenaLayout(mode),null);
});

test('approved Control Point objectives are accessible on their correct elevation',()=>{
  const map=getModeArenaLayout('control');
  const points=makeControlPoints(map.radius,map.controlPoints);
  assert.equal(map.radius,150);
  assert.deepEqual(points.map(({x,y,z})=>({x,y,z})),map.controlPoints.map(({x,y,z})=>({x,y,z})));
  for(const p of points){
    assert.deepEqual(arenaBodyBlockers(map,{x:p.x,z:p.z,y:p.y,radius:0.4,height:1.8}),[]);
  }
  const match=createMatch({mode:'control'});
  assert.equal(match.capacity,8);
  assert.equal(match.world.arenaLayout,map);
  assert.equal(match.world.arenaRadius,150);
});

test('entire transport objective centerline follows supported walkable surfaces',()=>{
 const map=getModeArenaLayout('escort');for(let d=0;d<=ESCORT_LENGTH;d+=.4){const p=payloadPose(d);assert.ok(arenaFloorContains(map,p.x,p.z,.05));assert.equal(arenaBodyBlockers(map,{...p,radius:.38,height:1.8}).length,0);}
});

test('Conduit actual spawn and collision rules work in regular and private test entry',()=>{
 for(const mode of ['tdm','ffa']){
  const map=getModeArenaLayout(mode),match=createMatch({mode});
  assert.equal(match.world.arenaLayout,map);assert.equal(match.capacity,map.capacity);
  assert.equal(match.seats.size,map.capacity);
  for(const seat of match.seats.values()){
   const b=match.world.bodies.get(seat.id),f=match.world.fighters.get(seat.id);
   assert.equal(f.vitals.dead,false,seat.id);assert.ok(arenaGrounded(map,b),seat.id);
   assert.equal(arenaBodyBlockers(map,{...b,radius:.4,height:1.8}).length,0);
   if(mode==='tdm')assert.ok(seat.team==='blue'?b.z<0:b.z>0);
   else assert.equal(seat.team,null);
  }
  const solo=createMatch({mode,testMode:true,seats:1,players:[{id:'you'}]});
  assert.equal(solo.world.arenaLayout,map);
  for(let i=0;i<map.capacity;i++)assert.equal(joinMatch(match,{id:'human'+i}).ok,true);
  assert.equal(joinMatch(match,{id:'overflow'}).ok,false);
 }
 const map=getModeArenaLayout('tdm'),b={x:0,y:-5,z:2.6};
 assert.ok(arenaGrounded(map,b));
 assert.ok(arenaBodyBlockers(map,{x:0,y:-5,z:0,radius:.4,height:1.8}).length);
 moveArenaBody(map,b,0,.2,-.06);assert.equal(b.y,-5);
 assert.equal(arenaLineClear(map,{x:0,y:-5,z:0},{x:0,y:5,z:0}),false);
 assert.ok(arenaRayFraction(map,{x:0,y:-4,z:-2.5},{x:0,y:-4,z:2.5})<1);
 assert.equal(arenaLandingHeight(map,{x:0,z:2.6,previousY:-4,nextY:-5.1}),-5);
});
test('escort capacity is unchanged',()=>{
 const map=getModeArenaLayout('escort'),match=createMatch({mode:'escort'});
 assert.equal(map.capacity,10);assert.equal(match.capacity,10);
 for(let i=0;i<10;i++)assert.equal(joinMatch(match,{id:'human'+i}).ok,true);
 assert.equal(joinMatch(match,{id:'overflow'}).ok,false);
});
