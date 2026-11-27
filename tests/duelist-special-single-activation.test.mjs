import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, step, bodyOf, specialActivationLocked } from '../src/components/duelist/sim/world.mjs';
import { encodeOwn, applyOwn } from '../src/components/duelist/net/protocol.mjs';
import { classById } from '../src/components/duelist/core/classes.mjs';

const dt=1/60;
const cast=(w,id='a',presses=['special'])=>step(w,dt,{[id]:{presses}});
const advance=(w,seconds)=>{for(let i=0;i<Math.ceil(seconds/dt);i++)step(w,dt);};
const starts=events=>events.filter(e=>e.type==='special');
const add=(w,id,classId,x=0,z=0,team='blue',yaw=0)=>addFighter(w,{id,classId,weapon:classById(classId).weapon,x,z,team,yaw});

test('Duelist cannot restart Execution with a second charge, even in the same input',()=>{
  const w=createWorld({arenaRadius:40}),a=add(w,'a','duelist'),b=add(w,'b','warrior',0,3,'red',Math.PI);
  a.meter=100;b.vitals.hp=b.vitals.max.hp*.2;
  const first=cast(w,'a',['special','special','special']);
  assert.equal(starts(first).length,1);
  const action=a.action;
  const meter=a.meter;
  assert.ok(specialActivationLocked(a,w.time));
  assert.equal(starts(cast(w)).length,0);
  assert.equal(a.action,action);
  assert.equal(a.meter,meter);
  advance(w,2.2);
  assert.equal(specialActivationLocked(a,w.time),false);
});

test('invalid Execution target leaves meter intact and permits a new press',()=>{
  const w=createWorld({arenaRadius:40}),a=add(w,'a','duelist');
  a.meter=100;
  assert.equal(starts(cast(w)).length,0);
  assert.equal(a.meter,100);
  assert.equal(specialActivationLocked(a,w.time),false);
  const b=add(w,'b','warrior',0,3,'red',Math.PI);b.vitals.hp=b.vitals.max.hp*.2;
  assert.equal(starts(cast(w)).length,1);
});

for(const cls of ['warrior','healer'])test(cls+' special cannot restart in unlimited-meter practice',()=>{
  const w=createWorld({arenaRadius:40}),a=add(w,'a',cls);
  a.meter=100;
  assert.equal(starts(cast(w,'a',['special','special'])).length,1);
  advance(w,.9);
  const deadline=a.specialActiveUntil;
  assert.ok(deadline>w.time);
  // Practice refreshes the meter independently of the activation lock.
  a.meter=100;
  for(let i=0;i<10;i++)assert.equal(starts(cast(w)).length,0);
  assert.equal(a.specialActiveUntil,deadline);
  assert.equal(a.meter,100);
  const copy=add(createWorld(),'a',cls);
  const own=encodeOwn(a,bodyOf(w,'a'),w.time);
  applyOwn(copy,bodyOf(w,'a'),own);
  assert.equal(copy.specialActiveUntil,deadline);
  advance(w,6);
  assert.equal(specialActivationLocked(a,w.time),false);
  assert.equal(starts(cast(w)).length,1);
});
