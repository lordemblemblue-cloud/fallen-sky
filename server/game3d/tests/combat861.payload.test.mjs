import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGame3DPrivatePreviewPayload861 as valid,
 PREVIEW_PAYLOAD_LIMITS_861 as limits}
 from '../privatePreviewPayloadValidation861.mjs';

const enemy=(name='wolf1')=>({id:name,x:1,z:2,hp:18,maxHp:20,
 alive:true,pendingImpactAt:null});
const objective=(name='patrol_kills')=>({
 questId:'axe_q_first_patrol',objectiveId:name,status:'accepted',
 current:2,required:3,targetReached:false});
const event=(seq=4)=>({
 seq,kind:'player_strike',serverTime:1000,targetId:'wolf1',
 damage:10,critical:false,killed:false});
const fresh=()=>({
 protocol:'game3d-private-presentation-849',
 snapshot:{eventSeq:4,serverTime:1000,
  player:{x:0,z:0,hp:90,maxHp:100,stamina:80,
   facing:0,lastIntentSeq:1},enemies:[enemy()]},
 questbook:{objectives:[objective()],objectiveTargetOnly:true,
  turnInAuthorized:false},
 events:[event(4)],nextSeq:4,reset:false,gap:false,hasMore:false,
});
test('86.1 accepts genuine 84.9 read-only schema with bounded numeric values',()=>{
 assert.equal(valid(fresh()),true);
 assert.equal(valid({...fresh(),snapshot:{...fresh().snapshot,serverTime:0}}),true);
 assert.equal(limits.maxEvents,40);
 assert.equal(limits.maxEnemies,16);
 assert.equal(limits.maxObjectives,128);
});
test('86.1 denies unexpected nested session/receipt/reward fields',()=>{
 const p=fresh();p.snapshot.player.leaseNonce='private';
 assert.equal(valid(p),false);
 const q=fresh();q.events[0].xpAuthorized=true;
 assert.equal(valid(q),false);
 const r=fresh();r.questbook.objectives[0].serverReceipt='SECRET';
 assert.equal(valid(r),false);
 const s=fresh();s.rewardAuthorized=true;
 assert.equal(valid(s),false);
});
test('86.1 rejects invalid player vitals, non-finite numbers and inconsistent HP',()=>{
 for(const patch of [{hp:-1},{hp:101},{hp:'90'},{hp:null},
  {maxHp:0},{stamina:-2},{x:Infinity},{z:NaN},
  {facing:'north'},{lastIntentSeq:-1},{lastIntentSeq:1.25}]){
  const p=fresh();Object.assign(p.snapshot.player,patch);
  assert.equal(valid(p),false,JSON.stringify(patch));
 }
});
test('86.1 rejects invalid or repeated enemy identities and HP states',()=>{
 const cases=[
  [{...enemy(),id:'unsafe<script>'}],
  [{...enemy(),hp:24}],
  [{...enemy(),hp:-5}],
  [{...enemy(),alive:1}],
  [{...enemy(),pendingImpactAt:'now'}],
  [enemy(),enemy()],
 ];
 for(const enemies of cases){
  const p=fresh();p.snapshot.enemies=enemies;
  assert.equal(valid(p),false);
 }
});
test('86.1 refuses duplicate, malformed, forged and inconsistent quest objectives',()=>{
 const cases=[
  [{...objective(),status:'<script>'}],
  [{...objective(),current:4}],
  [{...objective(),current:3,targetReached:false}],
  [{...objective(),required:0}],
  [{...objective(),current:1.5}],
  [{...objective(),objectiveId:'x'}],
  [{...objective(),turnInAuthorized:true}],
  [objective(),objective()],
 ];
 for(const objectives of cases){
  const p=fresh();p.questbook.objectives=objectives;
  assert.equal(valid(p),false);
 }
 const p=fresh();p.questbook.turnInAuthorized=true;assert.equal(valid(p),false);
});
test('86.1 validates event sequence and prevents malformed replay cursors',()=>{
 for(const mutate of [
  p=>{p.events=[event(4),event(3)]},
  p=>{p.events=[event(3),event(3)];p.nextSeq=3},
  p=>{p.events=[event(5)];p.nextSeq=5},
  p=>{p.events=[event(3)]},
  p=>{p.nextSeq=10},
  p=>{p.events=[];p.hasMore=true},
  p=>{p.reset=true},
  p=>{p.gap=true},
  p=>{p.events[0].seq=0;p.nextSeq=0},
 ]){const p=fresh();mutate(p);assert.equal(valid(p),false)}
});
test('86.1 accepts genuine reset/gap with authoritative snapshot cursor',()=>{
 for(const key of ['reset','gap']){
  const p=fresh();p.events=[];p[key]=true;
  assert.equal(valid(p),true);
 }
 const p=fresh();p.events=[];p.nextSeq=3;
 assert.equal(valid(p),true,'empty non-reset page may retain a private old cursor');
});
test('86.1 rejects false event data types, unsafe text and unexpected flags',()=>{
 for(const mutate of [
  e=>{e.seq='4'},e=>{e.kind='<script>'},
  e=>{e.serverTime=Infinity},e=>{e.damage=-1},
  e=>{e.enemyHp=-1},e=>{e.playerHp=null},e=>{e.critical=1},
  e=>{e.killed='false'},e=>{e.tier={name:'normal'}},
  e=>{e.targetId='x'.repeat(161)},e=>{e.serverKillCommitted=true},
 ]){const p=fresh();mutate(p.events[0]);assert.equal(valid(p),false)}
});
test('86.1 checks strict maximum server-count bounds',()=>{
 const p=fresh();p.snapshot.enemies=Array.from({length:16},(_,i)=>enemy('wolf'+i));
 p.questbook.objectives=Array.from({length:128},(_,i)=>
  objective('patrol_'+i.toString().padStart(3,'0')));
 p.events=Array.from({length:40},(_,i)=>event(i+1));p.nextSeq=40;
 p.snapshot.eventSeq=40;
 assert.equal(valid(p),true);
 p.events.push(event(41));assert.equal(valid(p),false);p.events.pop();
 p.snapshot.enemies.push(enemy('excess'));assert.equal(valid(p),false);
 p.snapshot.enemies.pop();
 p.questbook.objectives.push(objective('excess_kills'));
 assert.equal(valid(p),false);
});
test('86.1 refuses exceptions from malicious property access rather than throwing',()=>{
 const p=fresh();
 Object.defineProperty(p.snapshot.player,'hp',{get(){throw Error('bad getter')}});
 assert.doesNotThrow(()=>valid(p));
 assert.equal(valid(p),false);
});
test('86.1 refuses missing objects, nulls and unsupported payload versions',()=>{
 for(const p of [null,undefined,{},[],{...fresh(),protocol:'other'},
  {...fresh(),events:null},{...fresh(),snapshot:null}]){
  assert.equal(valid(p),false);
 }
});
