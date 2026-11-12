import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneGame3DPrivatePreviewPayload862 as clone,
 GAME3D_IMMUTABLE_PREVIEW_VERSION_862}
 from '../privateImmutablePreviewProjection862.mjs';

const original=()=>({
 protocol:'game3d-private-presentation-849',
 snapshot:{eventSeq:3,serverTime:1000,
  player:{x:1,z:1,hp:90,maxHp:100,stamina:70,facing:0,lastIntentSeq:1},
  enemies:[{id:'wolf1',x:2,z:2,hp:15,maxHp:20,
   alive:true,pendingImpactAt:null}]},
 questbook:{objectives:[{questId:'axe_q_first_patrol',
  objectiveId:'patrol_kills',status:'accepted',
  current:2,required:3,targetReached:false}],
  objectiveTargetOnly:true,turnInAuthorized:false},
 events:[{seq:3,kind:'player_strike',serverTime:1000,targetId:'wolf1',
  damage:12,critical:false,killed:false}],
 nextSeq:3,reset:false,gap:false,hasMore:false,
});

test('86.2 creates an immutable, serializable payload with correct public values',()=>{
 const input=original(),copy=clone(input);
 assert.ok(copy);
 assert.equal(GAME3D_IMMUTABLE_PREVIEW_VERSION_862,'86.2');
 assert.equal(JSON.stringify(copy),JSON.stringify(input));
 assert.equal(copy.snapshot.player.hp,90);
 assert.equal(copy.questbook.objectives[0].targetReached,false);
 assert.equal(copy.events[0].damage,12);
 assert.equal(Object.isFrozen(copy),true);
 assert.equal(Object.isFrozen(copy.snapshot),true);
 assert.equal(Object.isFrozen(copy.snapshot.player),true);
 assert.equal(Object.isFrozen(copy.snapshot.enemies),true);
 assert.equal(Object.isFrozen(copy.snapshot.enemies[0]),true);
 assert.equal(Object.isFrozen(copy.questbook.objectives[0]),true);
 assert.equal(Object.isFrozen(copy.events[0]),true);
});
test('86.2 drops malicious nonenumerable toJSON hooks, prototypes and hidden receipts',()=>{
 const input=original();
 Object.defineProperty(input,'toJSON',{value:()=>({secret:'outer'})});
 Object.defineProperty(input.events[0],'toJSON',{value:()=>({secret:'event'})});
 Object.defineProperty(input.snapshot.player,'toJSON',
  {value:()=>({secret:'player'})});
 Object.defineProperty(input.questbook.objectives[0],'toJSON',
  {value:()=>({secret:'objective'})});
 Object.setPrototypeOf(input.snapshot.enemies[0],{
  toJSON(){return {secret:'enemy'}},
 });
 const copy=clone(input);
 assert.ok(copy);
 const output=JSON.stringify({data:copy});
 assert.doesNotMatch(output,/secret|receiptId|toJSON|outer|enemy":{/);
 assert.equal(copy.snapshot.player.hp,90);
 assert.equal(copy.events[0].seq,3);
 assert.equal(Object.getPrototypeOf(copy),null);
 assert.equal(Object.getPrototypeOf(copy.snapshot),null);
 assert.equal(Object.getPrototypeOf(copy.snapshot.player),null);
 assert.equal(Object.getPrototypeOf(copy.snapshot.enemies[0]),null);
 assert.equal(Object.getPrototypeOf(copy.events[0]),null);
});
test('86.2 a mutable original cannot modify the checked HTTP copy',()=>{
 const input=original(),copy=clone(input);
 assert.ok(copy);
 input.snapshot.player.hp=0;
 input.events[0].damage=99999;
 input.questbook.objectives[0].current=3;
 input.questbook.objectives[0].targetReached=true;
 input.snapshot.enemies[0].hp=0;
 assert.equal(copy.snapshot.player.hp,90);
 assert.equal(copy.events[0].damage,12);
 assert.equal(copy.questbook.objectives[0].current,2);
 assert.equal(copy.snapshot.enemies[0].hp,15);
 assert.throws(()=>{copy.snapshot.player.hp=10},TypeError);
});
test('86.2 rejects a getter changing a value during snapshot materialization',()=>{
 const input=original();
 let seen=0;
 Object.defineProperty(input.snapshot.player,'hp',{
  enumerable:true,configurable:true,
  get(){seen++;return seen<=3?90:'INVALID';},
 });
 assert.equal(clone(input),null);
 assert.ok(seen>=4);
});
test('86.2 malicious getter exceptions cannot escape into an HTTP response',()=>{
 const input=original();
 Object.defineProperty(input.snapshot.enemies[0],'hp',{
  enumerable:true,get(){throw Error('inaccessible entity')},
 });
 assert.doesNotThrow(()=>clone(input));
 assert.equal(clone(input),null);
});
test('86.2 rejects malformed counts, player vitals and illegal event fields',()=>{
 const cases=[
  x=>{x.snapshot.player.hp=-1},
  x=>{x.questbook.objectives[0].current=4},
  x=>{x.events[0].rewardAuthorized=true},
  x=>{x.events[0].seq=4},
  x=>{x.questbook.turnInAuthorized=true},
  x=>{x.snapshot.enemies[0].alive='yes'},
 ];
 for(const mutate of cases){
  const input=original();mutate(input);
  assert.equal(clone(input),null);
 }
});
test('86.2 strips original array toJSON handlers without changing event arrays',()=>{
 const input=original();
 input.events.toJSON=()=>({receipt:'SECRET'});
 input.snapshot.enemies.toJSON=()=>({privateNpc:'SECRET'});
 input.questbook.objectives.toJSON=()=>({killProof:'SECRET'});
 const copy=clone(input);
 assert.ok(copy);
 const text=JSON.stringify(copy);
 assert.doesNotMatch(text,/SECRET|killProof|privateNpc|receipt/);
 assert.equal(copy.events.length,1);
 assert.equal(copy.snapshot.enemies.length,1);
 assert.equal(copy.questbook.objectives.length,1);
 assert.equal(Object.isFrozen(copy.events),true);
 assert.equal(Object.hasOwn(copy.events,'toJSON'),true);
 assert.equal(copy.events.toJSON,undefined);
});
test('86.2 refuses absent, invalid and oversized original projections',()=>{
 for(const bad of [null,undefined,[],{},{
  ...original(),snapshot:null,
 }]){
  assert.equal(clone(bad),null);
 }
 const input=original();
 input.events=Array.from({length:41},(_,i)=>({...input.events[0],seq:i+1}));
 input.nextSeq=41;input.snapshot.eventSeq=41;
 assert.equal(clone(input),null);
});
