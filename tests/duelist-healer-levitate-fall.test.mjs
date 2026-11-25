import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addFighter,step,bodyOf} from '../src/components/duelist/sim/world.mjs';
import {effectOn} from '../src/components/duelist/core/abilities.mjs';
import {encodeOwn,applyOwn,encodeFighter,applyFighter} from '../src/components/duelist/net/protocol.mjs';
import {getModeArenaLayout} from '../src/components/duelist/sim/modeArenaLayout.mjs';
const dt=1/60;
const hostileInput={move:{x:1,z:0},run:true,sprint:true,face:1,presses:['jump','dash','roll','resist','special','light','itemActive']};
function fixture(layout=null,y=0){
  const w=createWorld({arenaRadius:40,arenaLayout:layout});
  addFighter(w,{id:'healer',classId:'healer',x:0,y,z:-2,yaw:0});
  const target=addFighter(w,{id:'target',classId:'duelist',x:0,y,z:0});
  const b=bodyOf(w,'target');
  const tick=(healer={},victim={})=>step(w,dt,{healer,target:victim});
  tick({presses:['ability3'],target:'target'});
  for(let i=0;i<30&&!effectOn(target,'levitate',w.time);i++)tick();
  assert.ok(effectOn(target,'levitate',w.time),'actual healer cast landed');
  return {w,target,b,tick};
}
test('levitate blocks movement, attacks, relics and air escapes even after hit stagger clears',()=>{
  const {w,target,b,tick}=fixture();
  target.stunnedUntil=w.time; // simulates stagger immunity or resist clearing ordinary stun
  const x=b.x,z=b.z;
  for(let i=0;i<30;i++)tick({},hostileInput);
  assert.ok(b.y>1);
  assert.equal(b.x,x);assert.equal(b.z,z);assert.equal(b.speed,0);
  assert.equal(target.action,null);assert.equal(b.airDashReady,false);
});
test('first damaging attack drops the victim, then landing starts knockdown and recovery',()=>{
  const {w,target,b,tick}=fixture();
  for(let i=0;i<18;i++)tick();
  // A basic sword strike, after the healer's levitate casting recovery.
  for(let i=0;i<25;i++)tick();
  tick({presses:['light'],face:0});
  for(let i=0;i<45&&effectOn(target,'levitate',w.time);i++)tick({},hostileInput);
  assert.ok(!effectOn(target,'levitate',w.time));
  assert.ok(effectOn(target,'levitateFall',w.time),'hit releases target before duration expires');
  const x=b.x,z=b.z;
  const y=b.y;
  for(let i=0;i<120&&effectOn(target,'levitateFall',w.time);i++)tick({},hostileInput);
  assert.ok(y>0.5);assert.equal(b.y,0);
  assert.ok(target.downUntil>w.time&&target.riseUntil>target.downUntil);
  for(let i=0;i<180&&w.time+dt<target.riseUntil;i++)tick({},hostileInput);
  assert.equal(b.x,x);assert.equal(b.z,z);
  // Cross the deadline with no new attack or jump queued on the first free tick.
  tick();tick();
  tick({}, {move:{x:1,z:0},run:true});
  assert.ok(b.x>x);
});
test('natural expiry also falls and gets up; own-state snapshot retains the fall lock',()=>{
  const {w,target,b,tick}=fixture();
  for(let i=0;i<160&&!effectOn(target,'levitateFall',w.time);i++)tick({},hostileInput);
  assert.ok(effectOn(target,'levitateFall',w.time));
  const mirror=createWorld({arenaRadius:40});
  const f=addFighter(mirror,{id:'target',classId:'duelist'});
  const body=bodyOf(mirror,'target');
  applyOwn(f,body,JSON.parse(JSON.stringify(encodeOwn(target,b,w.time))));
  mirror.time=w.time;
  assert.ok(effectOn(f,'levitateFall',mirror.time));
  const x=body.x;
  step(mirror,dt,{target:hostileInput});
  assert.equal(body.x,x);assert.ok(body.y<b.y);
  const packet=encodeFighter(target,b);
  const remote=applyFighter(createWorld(),packet,()=>addFighter(createWorld(),{id:'target'}),()=>({}));
  assert.ok(remote.f.effects.levitateFall);
});
test('raised platform lift retains its height reference and lands on actual support',()=>{
  const layout=getModeArenaLayout('tdm');
  const w=createWorld({arenaRadius:40,arenaLayout:layout});
  addFighter(w,{id:'healer',classId:'healer',x:-7,y:3.2,z:0,yaw:0});
  const f=addFighter(w,{id:'target',classId:'duelist',x:-7,y:3.2,z:2});
  const b=bodyOf(w,'target');
  step(w,dt,{healer:{presses:['ability3'],target:'target'}});
  for(let i=0;i<30&&!effectOn(f,'levitate',w.time);i++)step(w,dt);
  assert.ok(effectOn(f,'levitate',w.time));
  for(let i=0;i<40;i++)step(w,dt,{target:hostileInput});
  assert.ok(b.y>4.5);assert.equal(b.x,-7);
  for(let i=0;i<180&&!Number.isFinite(f.downUntil);i++)step(w,dt,{target:hostileInput});
  assert.ok(Math.abs(b.y-3.2)<.01);assert.ok(f.riseUntil>w.time);
});

test('a target caught mid-jump cannot steer or double jump out of levitation',()=>{
  const w=createWorld({arenaRadius:40});
  addFighter(w,{id:'healer',classId:'healer',x:0,z:-2,yaw:0});
  const f=addFighter(w,{id:'target',classId:'duelist',x:0,z:0});
  const b=bodyOf(w,'target');
  step(w,dt,{target:{presses:['jump']}});
  for(let i=0;i<10;i++)step(w,dt);
  step(w,dt,{healer:{presses:['ability3'],target:'target'}});
  for(let i=0;i<30&&!effectOn(f,'levitate',w.time);i++)step(w,dt);
  assert.ok(effectOn(f,'levitate',w.time));assert.ok(b.y>0.5);
  const x=b.x,z=b.z,y=b.y;
  for(let i=0;i<20;i++)step(w,dt,{target:hostileInput});
  assert.equal(b.x,x);assert.equal(b.z,z);assert.ok(Math.abs(b.y-y)<1e-6);
  assert.equal(b.airDashReady,false);assert.equal(b.jumped,false);
});
