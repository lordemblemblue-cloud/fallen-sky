import test from 'node:test';
import assert from 'node:assert/strict';
import { getModeArenaLayout, arenaFloorContains, overlapsArenaFootprint, arenaBodyBlockers, arenaLandingHeight, moveArenaBody, arenaRayFraction, arenaLineClear, arenaGrounded } from '../src/components/duelist/sim/modeArenaLayout.mjs';
import { makeControlPoints } from '../src/components/duelist/sim/control.mjs';
import { ESCORT_LENGTH, ESCORT_RADIUS, payloadPose } from '../src/components/duelist/sim/escort.mjs';
import { MODES, createMatch, joinMatch } from '../src/components/duelist/sim/match.mjs';

test('three distinct layouts fit existing arena bounds and contain mode-specific architecture',()=>{
  const ids=new Set();
  for(const mode of ['escort','tdm']){
    const map=getModeArenaLayout(mode);
    ids.add(map.id);
    assert.equal(map.radius,MODES[mode].arena);
    assert.equal(new Set(map.parts.map(p=>p.id)).size,map.parts.length);
    for(const p of map.parts){
      assert.ok(p.x0<p.x1 && p.z0<p.z1 && p.y0<p.y1,p.id);
      for(const x of [p.x0,p.x1]) for(const z of [p.z0,p.z1]){
        assert.ok(Math.hypot(x,z)<map.radius-0.5,p.id);
      }
    }
    assert.equal(map.parts.filter(p=>p.kind==='deck').length,mode==='control'?3:2);
    assert.equal(map.parts.filter(p=>p.kind==='step').length,mode==='control'?0:16);
    assert.equal(map.parts.filter(p=>p.kind==='duct').length,mode==='control'?0:32);
  }
  assert.equal(ids.size,2);
  for(const mode of ['duel','practice','ffa','ctf','football','story','constructor']){
    assert.equal(getModeArenaLayout(mode),null);
  }
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

test('entire transport objective corridor is clear of authored solids',()=>{
  const map=getModeArenaLayout('escort');
  for(let d=0;d<=ESCORT_LENGTH;d+=0.1){
    const p=payloadPose(d);
    for(const part of map.parts){
      assert.ok(!overlapsArenaFootprint(part,p.x,p.z,ESCORT_RADIUS+0.05),part.id+' obstructs '+d);
    }
  }
});

test('ground tunnel stays open; roof supports landing and has separate collision height',()=>{
  const map=getModeArenaLayout('tdm');
  const body={x:-7,y:0,z:2,radius:0.35,height:1.8};
  assert.deepEqual(arenaBodyBlockers(map,body),[]);
  assert.ok(arenaBodyBlockers(map,{...body,x:-10.2}).some(p=>p.kind==='wall'));
  assert.ok(arenaBodyBlockers(map,{...body,y:2}).some(p=>p.kind==='deck'));
  assert.deepEqual(arenaBodyBlockers(map,{...body,y:3.2}),[]);
  assert.equal(arenaLandingHeight(map,{x:-7,z:2,previousY:4,nextY:2}),3.2);
  assert.equal(arenaLandingHeight(map,{x:-7,z:2,previousY:0.1,nextY:-0.1}),0);
  assert.equal(arenaLandingHeight(map,{x:-7,z:2,previousY:1,nextY:2}),null);
});

test('team deathmatch architecture is rotationally symmetric',()=>{
  const {parts}=getModeArenaLayout('tdm');
  for(const p of parts){
    assert.ok(parts.some(q=>q.kind===p.kind &&
      Math.abs(q.x0+p.x1)<1e-6 && Math.abs(q.x1+p.x0)<1e-6 &&
      Math.abs(q.z0+p.z1)<1e-6 && Math.abs(q.z1+p.z0)<1e-6 &&
      Math.abs(q.y0-p.y0)<1e-6 && Math.abs(q.y1-p.y1)<1e-6),p.id);
  }
});

test('low-poly architecture stays under 65 boxes, with balanced mode capacity',()=>{
  for(const [mode,capacity] of [['escort',10],['tdm',8]]){
    const map=getModeArenaLayout(mode);
    assert.ok(map.parts.length<=65);
    assert.equal(map.capacity,capacity);
    const match=createMatch({mode});
    assert.equal(match.world.arenaLayout,map);
    assert.equal(match.capacity,capacity);
    assert.equal(match.seats.size,capacity);
    for(let i=0;i<capacity;i++)assert.equal(joinMatch(match,{id:'human'+i}).ok,true);
    assert.equal(joinMatch(match,{id:'overflow'}).ok,false);
  }
});
test('swept collisions stop crossing walls even on a large movement delta',()=>{
  const map=getModeArenaLayout('tdm');
  const body={x:-12,y:0,z:2};
  moveArenaBody(map,body,6,0,0);
  assert.ok(body.x<-10.8);
  assert.equal(arenaBodyBlockers(map,{...body,radius:0.4,height:1.8}).length,0);
});
test('steps climb to roof and downward movement lands rather than clips',()=>{
  const map=getModeArenaLayout('tdm');
  const body={x:-5.4,y:0,z:-7};
  for(let i=0;i<100;i++)moveArenaBody(map,body,0,0.09,-0.02);
  assert.ok(body.z>1.5,JSON.stringify(body));
  assert.ok(Math.abs(body.y-3.2)<0.001,JSON.stringify(body));
  assert.ok(arenaGrounded(map,body));
  const falling={x:-7,y:5,z:2};
  moveArenaBody(map,falling,0,0,-4);
  assert.ok(Math.abs(falling.y-3.2)<0.001);
});
test('lower tunnel remains traversable while attacks through a roof or wall are obstructed',()=>{
  const map=getModeArenaLayout('tdm');
  const body={x:-7,y:0,z:5.5};
  moveArenaBody(map,body,0,-5,0);
  assert.ok(body.z<0.6);
  assert.equal(arenaLineClear(map,{x:-7,y:0,z:2},{x:-7,y:3.2,z:2}),false);
  assert.ok(arenaRayFraction(map,{x:-12,y:1.2,z:2},{x:-7,y:1.2,z:2})<1);
});
