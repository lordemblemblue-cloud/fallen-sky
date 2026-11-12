import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DDuelMatch} from '../authority.mjs';
import {engineOutcomeBody,engineOutcomeDigest} from '../engineOutcomeStore.mjs';
import {
 assessGame3DWorldCombatCandidate135,
 createGame3DWorldCombatReviewer135,
} from '../worldCombatReview135.mjs';
import {createGame3DCombat13PrivateReview}
 from '../combat13PrivateReview.mjs';
import {previewGame3DServerEnemyStrike133}
 from '../serverEnemyTelegraph133.mjs';

const ownerId='owner1',characterId='hero1',instanceId='inst1',eventId='kill1';
function world(){
 const context={eventId,instanceId,ownerId,characterId,
  type:'enemy_killed',serverTick:20,tier:'normal',location:null};
 const body=engineOutcomeBody(context,'a'.repeat(64));
 const outcome={
  event_id:eventId,instance_id:instanceId,owner_id:ownerId,
  character_id:characterId,event_type:'enemy_killed',server_tick:'20',
  tier:'normal',location:null,evidence_digest:body.evidenceDigest,
  outcome_digest:engineOutcomeDigest(body),
 };
 const candidate={event_id:eventId,instance_id:instanceId,
  owner_id:ownerId,character_id:characterId,
  enemy_id:'wolf1',server_tick:'20',strike_kind:'single',
  weapon_path:'damage',target_count:1,hit_count:1,
  player_x:0,player_z:0,enemy_x:2,enemy_z:0,
  player_facing:Math.PI/2,
  observed_enemy_hp_before:8,observed_enemy_hp_after:0,observed_damage:10,
  record_kind:'unverified_world_combat',
  combat_authorized:false,reward_authorized:false,
 };
 return {candidate,outcome,ownerId,characterId,instanceId,eventId};
}
test('13.0–13.2 malformed movement cannot change duel position or sequence',()=>{
 let t=1000;const duel=createGame3DDuelMatch({
  id:'test',challengerId:'a',opponentId:'b',now:()=>t,
  resolveStrike:()=>({damage:0}),
 });
 duel.setConnected('a',true);duel.setConnected('b',true);
 const a=duel.get('a');
 for(const packet of [null,undefined,[],{}, {seq:0,x:1,z:0,facing:0},
  {seq:1.4,x:1,z:0,facing:0},
  {seq:1025,x:1,z:0,facing:0}]){
  assert.equal(duel.setInput('a',packet).ok,false);
  assert.equal(a.inputSeq,0);
 }
 assert.equal(duel.setInput('a',{seq:1,x:1,z:0,facing:Math.PI/2}).ok,true);
 t+=50;duel.tick(t);
 const x=a.position.x;
 assert.equal(duel.setInput('a',{seq:1,x:0,z:1,facing:0}).reason,'stale_input');
 assert.equal(duel.setInput('a',{seq:2000,x:0,z:1,facing:0}).reason,'input_sequence_gap');
 assert.equal(a.position.x,x);
 assert.equal(a.inputSeq,1);
 assert.equal(duel.setInput('a',{seq:2,x:0,z:0,facing:0}).ok,true);
 duel.setConnected('a',false);
 assert.equal(a.inputSeq,0);
});
test('13.3 reuses PvE strike geometry without applying enemy damage',()=>{
 const enemy={alive:true,dying:false,isBoss:false,tier:'normal',
  group:{position:{x:0,z:0}},combatStrikeSerial:0};
 const target={x:0,z:1.8};
 const preview=previewGame3DServerEnemyStrike133({
  enemy,target,serverTick:42});
 assert.equal(preview.ok,true);
 assert.equal(preview.variant,'focused');
 assert.equal(preview.targetInFrozenSectorAtPreview,true);
 assert.equal(preview.damageAuthorized,false);
 assert.equal(preview.enemyAuthorityInstalled,false);
 const far=previewGame3DServerEnemyStrike133({
  enemy,target:{x:0,z:20},serverTick:42});
 assert.equal(far.ok,true);
 assert.equal(far.targetInFrozenSectorAtPreview,false);
 for(const unsafe of [
  {...enemy,alive:false},{...enemy,isBoss:true},
  {...enemy,combatStrikeSerial:-1},
 ]){
  assert.equal(previewGame3DServerEnemyStrike133({
   enemy:unsafe,target,serverTick:42}).ok,false);
 }
 assert.equal(previewGame3DServerEnemyStrike133({
  enemy,target,serverTick:-1}).ok,false);
});

test('13.3–13.4 canonical kill candidate remains an unverified observation',()=>{
 const r=assessGame3DWorldCombatCandidate135(world());
 assert.equal(r.ok,true);
 assert.equal(r.engineOutcomeDigestConsistent,true);
 for(const k of ['worldGeometryVerified','authoritativePvEEnabled',
  'combatAuthorized','xpAuthorized','lootAuthorized',
  'rankedEligible','productionReady'])assert.equal(r[k],false,k);
});
test('13.3 rejects mismatched source event, owner, instance and tampered hash',()=>{
 for(const [which,change] of [
  ['candidate',{owner_id:'intruder'}],
  ['candidate',{combat_authorized:true}],
  ['candidate',{reward_authorized:true}],
  ['candidate',{server_tick:'19'}],
  ['candidate',{record_kind:'trusted'}],
  ['outcome',{outcome_digest:'f'.repeat(64)}],
  ['outcome',{owner_id:'intruder'}],
  ['outcome',{instance_id:'elsewhere'}],
  ['outcome',{tier:'boss'}],
 ]){
  const w=world();w[which]={...w[which],...change};
  assert.equal(assessGame3DWorldCombatCandidate135(w).ok,false,
   which+': '+JSON.stringify(change));
 }
});
test('13.4 denies impossible hit, target count, facing and kill damage',()=>{
 const tweaks=[
  {player_facing:0},{enemy_x:30},{enemy_x:2,enemy_z:25},
  {observed_enemy_hp_after:1},{observed_damage:7},
  {observed_enemy_hp_before:0},{target_count:2},
  {hit_count:4},{player_x:Infinity},{player_x:NaN},
  {strike_kind:'triple',hit_count:2},{weapon_path:'strange'},
 ];
 for(const changes of tweaks){
  const w=world();w.candidate={...w.candidate,...changes};
  assert.equal(assessGame3DWorldCombatCandidate135(w).ok,false,
   JSON.stringify(changes));
 }
 const triple=world();triple.candidate.strike_kind='triple';
 triple.candidate.hit_count=3;
 assert.equal(assessGame3DWorldCombatCandidate135(triple).ok,true);
 const aoe=world();aoe.candidate.strike_kind='aoe';
 aoe.candidate.target_count=12;
 assert.equal(assessGame3DWorldCombatCandidate135(aoe).ok,true);
});
function mock({wrong=false,missing=false,throwRows=false}={}){
 const calls=[];let released=0;
 return {pool:{connect:async()=>({
  query:async(sql,params)=>{
   calls.push({sql,params});
   if(sql.startsWith('SELECT owner_id,character_id,revision')){
    return {rowCount:1,rows:[{
     owner_id:wrong?'other':ownerId,character_id:characterId,revision:1,
    }]};
   }
   if(sql.startsWith('SELECT row_to_json(w)')){
    if(throwRows)throw Error('DB unavailable');
    const w=world();
    return {rowCount:missing?0:1,
     rows:missing?[]:[{candidate:w.candidate,outcome:w.outcome}]};
   }
   return {rowCount:0,rows:[]};
  },
  release:()=>{released++},
 })},calls,get released(){return released}};
}
const session=async()=>({
 authenticated:true,identitySource:'trusted-server-session',accountId:ownerId,
});
test('13.5 authenticates account, reads one serializable snapshot, writes nothing',async()=>{
 const d=mock();
 const inspect=createGame3DWorldCombatReviewer135({
  pool:d.pool,resolveAuthenticatedSubject:session});
 const result=await inspect.inspect({characterId,instanceId,eventId});
 assert.equal(result.ok,true);
 assert.equal(result.xpAuthorized,false);
 assert.equal(d.calls[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
 assert.deepEqual(d.calls[1].params,[ownerId,characterId]);
 assert.deepEqual(d.calls[2].params,[eventId,instanceId,ownerId,characterId]);
 assert.equal(d.calls.at(-1).sql,'COMMIT');
 assert.equal(d.released,1);
 assert.equal(d.calls.some(x=>/^(INSERT|UPDATE|DELETE)/.test(x.sql)),false);
});
test('13.5 fails closed for unrelated characters, missing records, DB errors',async()=>{
 const a=mock();
 const anonymous=createGame3DWorldCombatReviewer135({
  pool:a.pool,resolveAuthenticatedSubject:async()=>null});
 assert.equal((await anonymous.inspect({characterId,instanceId,eventId})).ok,false);
 assert.equal(a.calls.length,0);
 const wrong=mock({wrong:true});
 const inspector=createGame3DWorldCombatReviewer135({
  pool:wrong.pool,resolveAuthenticatedSubject:session});
 const r=await inspector.inspect({characterId,instanceId,eventId});
 assert.equal(r.code,'world_combat_account_scope_denied');
 assert.equal(wrong.calls.some(x=>x.sql.startsWith('SELECT row_to_json(w)')),false);
 const missing=mock({missing:true});
 const absent=await createGame3DWorldCombatReviewer135({
  pool:missing.pool,resolveAuthenticatedSubject:session}).inspect({
   characterId,instanceId,eventId});
 assert.equal(absent.code,'world_combat_candidate_not_found_or_ambiguous');
 const broken=mock({throwRows:true});
 await assert.rejects(createGame3DWorldCombatReviewer135({
  pool:broken.pool,resolveAuthenticatedSubject:session}).inspect({
   characterId,instanceId,eventId}),/DB unavailable/);
 assert.equal(broken.calls.at(-1).sql,'ROLLBACK');
 assert.equal(broken.released,1);
});
test('13.5 has explicit disabled release and no public write or grant actions',()=>{
 const review=createGame3DCombat13PrivateReview({
  pool:{connect:async()=>{}},resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal(review.version,'13.5');
 assert.equal(review.readOnly,true);
 assert.equal(review.readiness().productionReady,false);
 assert.equal(review.readiness().authoritativePvEEnabled,false);
 assert.equal(review.readiness().releaseAuthorized,false);
 for(const name of ['mintItem','creditXP','recordEnemyKill',
  'settleCombat','awardLoot','sendDamage']){
  assert.equal(name in review,false,name);
 }
});
test('13.5 SQL candidates require existing engine outcome and no rewards',()=>{
 const sql=readFileSync(new URL('../sql/027_combat135_world_kill_candidates.sql',import.meta.url),'utf8');
 assert.match(sql,/REFERENCES game3d_engine_outcome\(event_id\)/);
 assert.match(sql,/CHECK\(combat_authorized=false\)/);
 assert.match(sql,/CHECK\(reward_authorized=false\)/);
 assert.match(sql,/game3d_combat_world_kill_candidate_immutable/);
});
