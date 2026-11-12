import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateEncounter136}
 from '../privateWorldEncounter136.mjs';

const OWNER='owner1',HERO='hero1',WORLD='encounter1';
const session={trusted:true};
const pose=(x,z)=>({x,z});
function map({los=true,height=()=>0,teleport=false}={}){
 return {
  id:'mock-map',fingerprint:'a'.repeat(64),
  valid:p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z)&&
   Math.abs(p.x)<100&&Math.abs(p.z)<100,
  height,
  move:(_,next)=>teleport?pose(999,999):next,
  canStrike:()=>los,
 };
}
function snapshot(overrides={}){
 return {ok:true,provenance:'authoritative-world-simulation',
  instanceId:WORLD,ownerId:OWNER,characterId:HERO,
  worldOrigin:pose(0,0),
  mapId:'mock-map',mapFingerprint:'a'.repeat(64),
  player:{position:pose(0,0),hp:100,
   stats:{maxHP:100,damage:30,defense:10}},
  enemies:[{id:'wolf1',position:pose(2,0),home:pose(2,0),
   stats:{maxHP:30,damage:10,defense:2},hp:30,tier:'normal',
   aiProfile:'standard'}],
  ...overrides,
 };
}
async function fixture({source=snapshot(),mapWorld=map(),
 playerStrike=()=>({damage:12,critical:false}),
 enemyStrike=()=>({damage:8}),
 getSubject=async ctx=>ctx?.trusted?
  {authenticated:true,identitySource:'trusted-server-session',
   accountId:OWNER}:null,
}={}){
 let clock=1000;
 const encounter=await createGame3DPrivateEncounter136({
  instanceId:WORLD,ownerId:OWNER,characterId:HERO,
  worldOrigin:pose(0,0),mapWorld,
  attestWorldSnapshot:async()=>source,
  resolveAuthenticatedSubject:getSubject,
  resolvePlayerStrike:playerStrike,resolveEnemyStrike:enemyStrike,
  now:()=>clock,
 });
 const step=ms=>{clock+=ms;return encounter.tick()};
 const input=(options={})=>encounter.setInput({
  serverRequestContext:session,
  input:{seq:1,x:0,z:0,facing:Math.PI/2,...options},
 });
 const attack=(options={})=>encounter.submit({
  serverRequestContext:session,
  intent:{action:'basic',targetId:'wolf1',weaponPath:'damage',
   intentId:'intent_00000001',intentSeq:1,...options},
 });
 return {encounter,step,input,attack,clock:()=>clock};
}

test('13.6 requires a real private world attester and server-only resolvers',async()=>{
 const args={instanceId:WORLD,ownerId:OWNER,characterId:HERO,
  worldOrigin:pose(0,0),mapWorld:map(),
  resolveAuthenticatedSubject:async()=>null,
  resolvePlayerStrike:()=>({damage:5}),
  resolveEnemyStrike:()=>({damage:5}),
  now:()=>1000};
 await assert.rejects(createGame3DPrivateEncounter136(args),
  /requires private world authority/);
 await assert.rejects(createGame3DPrivateEncounter136({
  ...args,attestWorldSnapshot:async()=>({...snapshot(),
   provenance:'browser-claimed'}),
 }),/snapshot missing or invalid/);
 await assert.rejects(createGame3DPrivateEncounter136({
  ...args,attestWorldSnapshot:async()=>snapshot({ownerId:'intruder'}),
 }),/snapshot missing or invalid/);
 await assert.rejects(createGame3DPrivateEncounter136({
  ...args,attestWorldSnapshot:async()=>snapshot({
   mapFingerprint:'client-specified',
  }),
 }),/snapshot missing or invalid/);
 await assert.rejects(createGame3DPrivateEncounter136({
  ...args,attestWorldSnapshot:async()=>snapshot({
   worldOrigin:pose(999,0),
  }),
 }),/snapshot missing or invalid/);
 await assert.rejects(createGame3DPrivateEncounter136({
  ...args,attestWorldSnapshot:async()=>snapshot({
   enemies:[...snapshot().enemies,...snapshot().enemies],
  }),
 }),/snapshot missing or invalid/);
 await assert.rejects(createGame3DPrivateEncounter136({
  ...args,attestWorldSnapshot:async()=>snapshot({
   enemies:[{...snapshot().enemies[0],position:pose(Infinity,0)}],
  }),
 }),/snapshot missing or invalid/);
 await assert.rejects(createGame3DPrivateEncounter136({
  ...args,attestWorldSnapshot:async()=>snapshot({
   enemies:[{...snapshot().enemies[0],position:pose(0.2,0)}],
  }),
 }),/invalid authoritative world spawn geometry/);
 await assert.rejects(createGame3DPrivateEncounter136({
  ...args,attestWorldSnapshot:async()=>snapshot({
   enemies:[{...snapshot().enemies[0],tier:'worldBoss'}],
  }),
 }),/snapshot missing or invalid/);
});

test('13.6 rejects forged client subject, teleport packets and stale movement',async()=>{
 const f=await fixture();
 const unauthorized=await f.encounter.setInput({
  serverRequestContext:{trusted:false},
  input:{seq:1,x:1,z:0,facing:Math.PI/2},
 });
 assert.equal(unauthorized.reason,'unverified_player_session');
 assert.equal((await f.input({seq:1,x:1000})).reason,'invalid_player_input');
 assert.equal((await f.input({seq:2000})).reason,'player_input_gap');
 assert.equal((await f.input({seq:1,x:0,z:1})).ok,true);
 f.step(50);
 assert.equal(f.encounter.snapshot().player.z,0.325);
 assert.equal((await f.input({seq:1})).reason,'stale_player_input');
 assert.equal((await f.input({seq:2,x:0,z:0})).ok,true);
 const player=f.encounter.snapshot().player;
 assert.equal(player.lastIntentSeq,0);
 assert.equal(f.encounter.privateServerOnly,true);
});

test('13.6 ignores client damage and gives server only one hit per intent',async()=>{
 let rolls=0;
 const f=await fixture({playerStrike:()=>{rolls++;return {damage:35}}});
 assert.equal((await f.input()).ok,true);
 assert.equal((await f.attack({damage:999999,enemyHp:0,
  targetPosition:pose(0,0)})).queued,true);
 const replies=f.encounter.tick();
 assert.equal(replies[0].ok,true);
 assert.equal(replies[0].damage,35);
 assert.equal(replies[0].killed,true);
 assert.equal(f.encounter.snapshot().enemies[0].hp,0);
 assert.equal(rolls,1);
 assert.equal((await f.attack()).ok,true);
 const replay=f.encounter.tick()[0];
 assert.deepEqual(replay,replies[0]);
 assert.equal(rolls,1);
 // A matching replay returns the same result, but a different target/weapon
 // under the same ID and sequence must be refused.
 await f.attack({targetId:'different_enemy'});
 assert.equal(f.encounter.tick()[0].reason,'intent_payload_conflict');
 assert.equal(rolls,1);
 assert.equal(f.encounter.getEventsAfter(0).filter(
  e=>e.kind==='player_strike').length,1);
 assert.equal(f.encounter.getEventsAfter(0).filter(
  e=>e.kind==='enemy_telegraph').length,0,
  'a killed NPC must not telegraph after its death on the same tick');
 assert.equal(replies[0].rewardsIssued,false);
 assert.equal(f.encounter.snapshot().rewardsIssued,false);
});

test('13.6 enforces server map LOS, cooldown, attack facing and range',async()=>{
 const wall=await fixture({mapWorld:map({los:false})});
 await wall.input();await wall.attack();
 const denied=wall.encounter.tick()[0];
 assert.equal(denied.reason,'blocked_by_world');
 assert.equal(wall.encounter.snapshot().enemies[0].hp,30);
 assert.equal(wall.encounter.getEventsAfter(0).filter(
  e=>e.kind==='enemy_telegraph').length,0);
 const turn=await fixture();
 await turn.input({facing:0});await turn.attack();
 assert.equal(turn.encounter.tick()[0].reason,'target_not_in_front');
 const far=await fixture({source:snapshot({enemies:[{
  ...snapshot().enemies[0],position:pose(12,0),home:pose(12,0),
 }]})});
 await far.input();await far.attack();
 assert.equal(far.encounter.tick()[0].reason,'out_of_range');
 const good=await fixture();
 await good.input();await good.attack();
 assert.equal(good.encounter.tick()[0].ok,true);
 await good.attack({intentId:'intent_00000002',intentSeq:2});
 assert.equal(good.encounter.tick()[0].reason,
  'player_strike_cooldown');
});

test('13.6 NPC freezes telegraph and checks player position at impact',async()=>{
 const f=await fixture();
 // Clock t=1000: first enemy begins a fixed-direction warning.
 f.encounter.tick();
 const telegraphs=f.encounter.getEventsAfter(0).filter(
  e=>e.kind==='enemy_telegraph');
 assert.equal(telegraphs.length,1);
 assert.ok(telegraphs[0].impactAt>1000);
 await f.input({x:0,z:1,facing:Math.PI/2});
 f.step(100);f.step(100);f.step(100);f.step(100);
 assert.ok(f.encounter.snapshot().player.z>1.5);
 f.step(400);
 assert.equal(f.encounter.snapshot().player.hp,100);
 assert.equal(f.encounter.getEventsAfter(0).filter(
  e=>e.kind==='enemy_miss').length,1);
 assert.equal(f.encounter.getEventsAfter(0).filter(
  e=>e.kind==='enemy_strike').length,0);
});

test('13.6 NPC resolves only after server windup, with bounded damage',async()=>{
 let rolls=0;
 const f=await fixture({enemyStrike:()=>{
  rolls++;return {damage:8,critical:false};
 }});
 f.encounter.tick();
 assert.equal(rolls,0);
 f.step(700);
 assert.equal(f.encounter.snapshot().player.hp,100);
 assert.equal(rolls,0);
 f.step(20);
 assert.equal(f.encounter.snapshot().player.hp,92);
 assert.equal(rolls,1);
 f.step(100);
 assert.equal(rolls,1,'enemy cooldown must prevent immediate repeat');
});

test('13.6 rejects invalid private damage without modifying enemy HP or player HP',async()=>{
 const f=await fixture({
  playerStrike:()=>({damage:Infinity}),
  enemyStrike:()=>({damage:-10}),
 });
 await f.input();await f.attack();
 const result=f.encounter.tick()[0];
 assert.equal(result.reason,'invalid_strike_result');
 assert.equal(f.encounter.snapshot().player.stamina,100);
 assert.equal(f.encounter.snapshot().enemies[0].hp,30);
 f.step(720);
 assert.equal(f.encounter.snapshot().player.hp,100);
 assert.equal(f.encounter.getEventsAfter(0).filter(
  e=>e.kind==='enemy_strike_refused').length,1);
});

test('13.6 server geometry controls movement even with a valid client input',async()=>{
 const f=await fixture({mapWorld:map({teleport:true})});
 await f.input({x:1,z:0});
 f.step(50);
 assert.equal(f.encounter.snapshot().player.x,0);
 assert.equal(f.encounter.snapshot().player.z,0);
 assert.equal(f.encounter.productionReady,false);
 assert.equal(f.encounter.xpAwardsEnabled,false);
 assert.equal(f.encounter.itemRewardsEnabled,false);
 assert.equal(f.encounter.economyEnabled,false);
});

test('13.6 replay order and unknown targets fail closed',async()=>{
 const f=await fixture();
 await f.input();
 await f.attack({intentId:'intent_00000002',intentSeq:2});
 const invalid=f.encounter.tick()[0];
 assert.equal(invalid.reason,'out_of_order_intent');
 await f.attack({targetId:'fake',intentId:'intent_00000001',intentSeq:1});
 assert.equal(f.encounter.tick()[0].reason,'target_unavailable');
 await f.attack({intentId:'intent_00000001',intentSeq:2});
 assert.equal(f.encounter.tick()[0].reason,'intent_payload_conflict');
 assert.equal(f.encounter.snapshot().enemies[0].hp,30);
});
