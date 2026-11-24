import test from 'node:test';
import assert from 'node:assert/strict';
import { getModeArenaLayout, overlapsArenaFootprint, arenaBodyBlockers, arenaLandingHeight } from '../src/components/duelist/sim/modeArenaLayout.mjs';
import { makeControlPoints, CONTROL } from '../src/components/duelist/sim/control.mjs';
import { ESCORT_LENGTH, ESCORT_RADIUS, payloadPose } from '../src/components/duelist/sim/escort.mjs';
import { MODES } from '../src/components/duelist/sim/match.mjs';

test('three distinct layouts fit existing arena bounds and contain roofs, walls and steps',()=>{
  const ids=new Set();
  for(const mode of ['control','escort','tdm']){
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
    assert.equal(map.parts.filter(p=>p.kind==='deck').length,2);
    assert.equal(map.parts.filter(p=>p.kind==='step').length,16);
    assert.equal(map.parts.filter(p=>p.kind==='duct').length,32);
  }
  assert.equal(ids.size,3);
  for(const mode of ['duel','practice','ffa','ctf','football','story','constructor']){
    assert.equal(getModeArenaLayout(mode),null);
  }
});

test('default control pads have clear footprints including capture radius',()=>{
  const map=getModeArenaLayout('control');
  for(const p of makeControlPoints(map.radius)){
    for(const part of map.parts){
      assert.ok(!overlapsArenaFootprint(part,p.x,p.z,CONTROL.radius),part.id+' obstructs '+p.id);
    }
  }
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
  const map=getModeArenaLayout('control');
  const body={x:-3,y:0,z:0,radius:0.35,height:1.8};
  assert.deepEqual(arenaBodyBlockers(map,body),[]);
  assert.ok(arenaBodyBlockers(map,{...body,x:-6.2}).some(p=>p.kind==='wall'));
  assert.ok(arenaBodyBlockers(map,{...body,y:2}).some(p=>p.kind==='deck'));
  assert.deepEqual(arenaBodyBlockers(map,{...body,y:3.2}),[]);
  assert.equal(arenaLandingHeight(map,{x:-3,z:0,previousY:4,nextY:2}),3.2);
  assert.equal(arenaLandingHeight(map,{x:-3,z:0,previousY:0.1,nextY:-0.1}),0);
  assert.equal(arenaLandingHeight(map,{x:-3,z:0,previousY:1,nextY:2}),null);
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
