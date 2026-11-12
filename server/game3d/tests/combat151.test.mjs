import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateEncounter136}
 from '../privateWorldEncounter136.mjs';
import {createGame3DPrivateQuestEvidence151}
 from '../privateQuestCombatEvidence151.mjs';

const scope={ownerId:'owner151',characterId:'hero151',
 instanceId:'private-world-151',instanceEpoch:'epoch-151-00001',
 holderId:'worker-151-001',mapFingerprint:'a'.repeat(64)};
const session={trusted:true},pose=(x,z)=>({x,z});
const accepted=[
 {id:'patrol',objectives:[{id:'normal_kills',type:'kill',count:3}]},
 {id:'road_elite',objectives:[{id:'elite_kill',type:'kill_tier',tier:'elite',count:1}]},
 {id:'side_story',objectives:[{id:'cave',type:'discover_location',
   targetId:'cave_151',count:1},{id:'first_kill',type:'kill',count:1}]},
];
async function makeFixture({tier='normal',damage=35,quests=accepted}={}){
 let time=1000;
 const encounter=await createGame3DPrivateEncounter136({
  ...scope,worldOrigin:pose(0,0),
  mapWorld:{id:'mock-map',fingerprint:scope.mapFingerprint,
   valid:pt=>Number.isFinite(pt.x)&&Number.isFinite(pt.z)&&
    Math.abs(pt.x)<100&&Math.abs(pt.z)<100,
   height:()=>0,move:(_,next)=>next,canStrike:()=>true},
  attestWorldSnapshot:async()=>({
   ok:true,provenance:'authoritative-world-simulation',
   instanceId:scope.instanceId,ownerId:scope.ownerId,
   characterId:scope.characterId,mapId:'mock-map',
   mapFingerprint:scope.mapFingerprint,worldOrigin:pose(0,0),
   player:{position:pose(0,0),hp:100,
    stats:{maxHP:100,damage:45,defense:10}},
   enemies:[{id:'wolf151',position:pose(2,0),home:pose(2,0),
    hp:30,tier,aiProfile:'standard',
    stats:{maxHP:30,damage:10,defense:2}}],
  }),
  resolveAuthenticatedSubject:async c=>c?.trusted?{
   authenticated:true,identitySource:'trusted-server-session',
   accountId:scope.ownerId}:null,
  resolvePlayerStrike:()=>({damage}),resolveEnemyStrike:()=>({damage:5}),
  now:()=>time,
 });
 let lease={ok:true,source:'trusted-world-instance-lease',
  exclusive:true,committed:true,...scope,fencingToken:12,expiresAt:2000};
 let questState={ok:true,provenance:'trusted-server-quest-snapshot',
  ...scope,accepted:quests};
 const reviewer=createGame3DPrivateQuestEvidence151({
  encounter,scope,
  verifyExclusiveLease:async()=>lease,
  readTrustedQuestState:async()=>questState,
  now:()=>time,
 });
 const kill=async()=>{
  const a=await encounter.setInput({serverRequestContext:session,
   input:{seq:1,x:0,z:0,facing:Math.PI/2}});
  assert.equal(a.ok,true);
  const b=await encounter.submit({serverRequestContext:session,
   intent:{action:'basic',targetId:'wolf151',weaponPath:'damage',
    intentId:'attack-intent-151',intentSeq:1}});
  assert.equal(b.ok,true);
  const reply=encounter.tick()[0];
  assert.equal(reply.killed,true);
  return reply;
 };
 return {encounter,reviewer,kill,
  setLease:change=>{lease={...lease,...change}},
  setQuestState:change=>{questState={...questState,...change}},
  advance:ms=>{time+=ms}};
}
test('15.1 rejects public/unpinned factories and has no quest payout surface',async()=>{
 assert.throws(()=>createGame3DPrivateQuestEvidence151(),/requires pinned/);
 const f=await makeFixture();
 assert.equal(f.reviewer.privateServerOnly,true);
 assert.equal(f.reviewer.publicRouteInstalled,false);
 assert.equal(f.reviewer.questProgressWriterEnabled,false);
 assert.equal(f.reviewer.rewardWriterEnabled,false);
 assert.equal(typeof f.reviewer.completeQuest,'undefined');
 assert.equal(typeof f.reviewer.grantXP,'undefined');
});
test('a genuine 13.6 server kill proposes quest evidence once, never quest progress or rewards',async()=>{
 const f=await makeFixture();
 assert.deepEqual((await f.reviewer.review()).candidates,[]);
 await f.kill();
 const events=f.encounter.getEventsAfter(0);
 assert.equal(events.length,1);
 assert.equal(events[0].tier,'normal');
 assert.equal(events[0].killed,true);
 assert.equal(events[0].serverKillCommitted,false);
 const first=await f.reviewer.review();
 assert.equal(first.ok,true);
 assert.equal(first.lastSeq,events[0].seq);
 assert.deepEqual(first.candidates.map(x=>x.questId),['patrol','side_story']);
 assert.equal(first.candidates[0].evidenceId,
  scope.instanceId+':'+scope.instanceEpoch+':'+events[0].seq);
 assert.equal(first.candidates[0].tier,'normal');
 assert.equal(first.candidates[0].questCreditAuthorized,false);
 assert.equal(first.proposalOnly,true);
 assert.equal(first.appliedQuestProgress,false);
 assert.equal(first.rewardsIssued,false);
 const repeated=await f.reviewer.review();
 assert.equal(repeated.ok,true);
 assert.deepEqual(repeated.candidates,[],'event cursor dedupes replay');
 assert.equal(repeated.lastSeq,first.lastSeq);
});
test('private trusted normal-vs-elite matching and server-selected quest acceptance',async()=>{
 const f=await makeFixture({tier:'elite'});
 await f.kill();
 const r=await f.reviewer.review({acceptedQuestIds:['some_forged_quest'],
  event:{kind:'player_strike',killed:true,tier:'legendary'}});
 assert.equal(r.ok,true);
 assert.deepEqual(r.candidates.map(x=>x.questId),
  ['patrol','road_elite','side_story']);
 assert.equal(r.candidates[1].objectiveId,'elite_kill');
 assert(r.candidates.every(x=>x.enemyId==='wolf151'));
});
test('wrong scope, expired lease and fencing-token rotation fail closed',async()=>{
 for(const patch of [{instanceEpoch:'wrong-epoch'},{fencingToken:0},
  {expiresAt:1000},{source:'browser-claim'},{exclusive:false}]){
  const f=await makeFixture();
  f.setLease(patch);
  assert.equal((await f.reviewer.review()).reason,'private_quest_lease_lost');
  assert.equal((await f.reviewer.review()).reason,'private_quest_evidence_fenced');
 }
 const f=await makeFixture();
 assert.equal((await f.reviewer.review()).ok,true);
 f.setLease({fencingToken:13});
 assert.equal((await f.reviewer.review()).reason,'private_quest_lease_lost');
});
test('quest catalog requires trusted, account-bound state; never accepts browser quest payload',async()=>{
 for(const patch of [
  {provenance:'browser-claimed'},
  {characterId:'some_other_hero'},
  {accepted:[{id:'fake',objectives:[{type:'kill',count:Infinity}]}]},
  {accepted:[{id:'duplicate',objectives:[]},{id:'duplicate',objectives:[]}]},
  {accepted:[{id:'fake',objectives:[{type:'kill',count:1,
   targetId:'../../etc/passwd'}]}]},
 ]){
  const f=await makeFixture();
  f.setQuestState(patch);
  const r=await f.reviewer.review();
  assert.equal(r.reason,'untrusted_character_quest_state');
  assert.equal(r.rewardsIssued,false);
 }
});
test('missing event sequence and invalid completed-death flag block evidence instead of backfilling',async()=>{
 const f=await makeFixture();
 await f.kill();
 const raw=f.encounter;
 const fake={...raw,getEventsAfter:()=>[]};
 const reviewer=createGame3DPrivateQuestEvidence151({
  encounter:fake,scope,
  verifyExclusiveLease:async()=>({ok:true,
   source:'trusted-world-instance-lease',exclusive:true,committed:true,
   ...scope,fencingToken:12,expiresAt:2000}),
  readTrustedQuestState:async()=>({ok:true,
   provenance:'trusted-server-quest-snapshot',...scope,accepted}),
  now:()=>1000,
 });
 // Constructed AFTER kill: no historic kill is ever backfilled as a receipt.
 assert.equal((await reviewer.review()).ok,true);
 const f2=await makeFixture();
 const fake2={...f2.encounter,getEventsAfter:()=>[]};
 const r2=createGame3DPrivateQuestEvidence151({
  encounter:fake2,scope,
  verifyExclusiveLease:async()=>({ok:true,
   source:'trusted-world-instance-lease',exclusive:true,committed:true,
   ...scope,fencingToken:12,expiresAt:2000}),
  readTrustedQuestState:async()=>({ok:true,
   provenance:'trusted-server-quest-snapshot',...scope,accepted}),
  now:()=>1000,
 });
 await f2.kill();
 assert.equal((await r2.review()).reason,'private_combat_event_gap');
 const f3=await makeFixture();
 const wrong={...f3.encounter,getEventsAfter:cursor=>
  f3.encounter.getEventsAfter(cursor).map(event=>({...event,serverKillCommitted:true}))};
 const r3=createGame3DPrivateQuestEvidence151({
  encounter:wrong,scope,
  verifyExclusiveLease:async()=>({ok:true,
   source:'trusted-world-instance-lease',exclusive:true,committed:true,
   ...scope,fencingToken:12,expiresAt:2000}),
  readTrustedQuestState:async()=>({ok:true,
   provenance:'trusted-server-quest-snapshot',...scope,accepted}),
  now:()=>1000,
 });
 await f3.kill();
 assert.equal((await r3.review()).reason,'uncommitted_kill_evidence_invalid');
});
test('private event wire carries server NPC tier; no browser import or quest mutation',()=>{
 const root=new URL('../../../',import.meta.url);
 const read=p=>readFileSync(new URL(p,root),'utf8');
 const sim=read('server/game3d/privateWorldEncounter136.mjs');
 const sync=read('server/game3d/privateWorldSync137.mjs');
 const review=read('server/game3d/privateQuestCombatEvidence151.mjs');
 const client=read('src/components/game3d/GameWorld3D.jsx');
 assert.match(sim,/targetId:enemy\.id,tier:enemy\.tier,damage/);
 assert.match(sync,/'enemyId','tier'/);
 assert.doesNotMatch(client,/privateQuestCombatEvidence151|serverKillCommitted:true/);
 assert.doesNotMatch(review,/awardXP\(|grantQuestReward\(|addGold\(|grantItem\(|localStorage|window\.|document\.|createServer\(/);
});
