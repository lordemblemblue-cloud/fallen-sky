// Game 3D Combat / Quest 16.5 — REAL disposable PostgreSQL only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateQuestAcceptance154}
 from '../privateQuestAcceptance154.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestTurnIn156}
 from '../privateQuestTurnIn156.mjs';
import {createGame3DPrivateEchoQuest165}
 from '../privateEchoQuest165.mjs';
const url=process.env.GAME3D_165_DISPOSABLE_PG_URL;
const A={ownerId:'owner165',characterId:'hero165'};
const B={ownerId:'other165',characterId:'otherhero165'};
let receiptNo=0;
const trustedDiscoveries=new Map();
const validOps=new Set([
 'accept_private_server_quest','project_committed_quest_kill',
 'turn_in_private_server_quest','read_private_server_quests',
 'accept_private_echo_quest','record_private_world_discovery',
 'credit_private_echo_objective','turn_in_private_echo_quest',
 'read_private_echo_questbook','read_private_echo_branch_leads'
]);
const auth=async({operation,ownerId,characterId})=>
 ownerId===A.ownerId&&characterId===A.characterId&&validOps.has(operation);
async function trustedKill(pool,tier='normal'){
 const id='trusted-kill-165-'+(++receiptNo);
 await pool.query(`INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
 map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,server_kill_committed)
 VALUES($1,$2,$3,'instance-165-test','epoch-165-test',$4,$5,$6,$7,
 'server-committed-private-pve-kill',true)`,[
 id,A.ownerId,A.characterId,'e'.repeat(64),receiptNo,'wolf_'+receiptNo,tier
 ]);
 return id;
}
function discovery(targetId,options={}){
 const id='trusted-discover-165-'+(++receiptNo);
 const p={sourceKind:'trusted-private-world-discovery',
  receiptId:id,worldId:'world-165-test',
  targetId,ownerId:A.ownerId,characterId:A.characterId,
  evidenceDigest:createHash('sha256').update(id+targetId).digest('hex'),
  occurredAt:Date.now(),...options
 };
 trustedDiscoveries.set(id,p);
 return id;
}
test('16.5 five Echo chapters + independent side paths, real committed evidence',
 {skip:!url,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_echo_165_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:url,max:16,
   options:'-c search_path='+schema});
  await pool.query(await readFile(new URL(
   '../sql/008_combat50_verified_event_provenance.sql',import.meta.url),'utf8'));
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'immutable private evidence'; END;$$`);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '045_combat165_private_echo_story.sql'
  ])await pool.query(await readFile(
   new URL('../sql/'+file,import.meta.url),'utf8'));
  await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id) VALUES($1,$2),($3,$4)`,
   [A.ownerId,A.characterId,B.ownerId,B.characterId]);
  const starter=createGame3DPrivateQuestAcceptance154({
   pool,authorizeServerOperation:auth});
  const credits=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:auth});
  const starterTurnIn=createGame3DPrivateQuestTurnIn156({
   pool,authorizeServerOperation:auth});
  const story=createGame3DPrivateEchoQuest165({
   pool,authorizeServerOperation:auth,
   resolveTrustedWorldDiscovery:async({receiptId})=>
    trustedDiscoveries.get(receiptId)||null
  });
  const verifyKill=async(questId,tier='normal')=>{
   const receiptId=await trustedKill(pool,tier);
   const r=await story.credit({...A,questId,receiptId,kind:'kill'});
   assert.equal(r.ok,true,JSON.stringify(r));
   return {receiptId,result:r};
  };
  const verifyDiscover=async(questId,target,options={})=>{
   const receiptId=discovery(target,options);
   const recorded=await story.recordDiscovery({...A,receiptId});
   assert.equal(recorded.ok,true,JSON.stringify(recorded));
   return {receiptId,result:await story.credit({...A,questId,receiptId,
    kind:'discovery'})};
  };
  await t.test('no client spoofing, server prerequisite and wrong-character protection',async()=>{
   assert.equal((await story.accept({...A,questId:'echo_ch_14_first_echo'})).reason,
    'echo_prerequisite_unfinished');
   assert.equal((await story.accept({...B,questId:'echo_ch_14_first_echo'})).reason,
    'private_echo_accept_unauthorized');
   assert.equal((await story.accept({...A,questId:'not_an_echo_quest'})).reason,
    'echo_quest_not_in_server_catalog');
   assert.equal((await story.credit({...A,questId:'echo_ch_14_first_echo',
    receiptId:'browser-fake-kill-165',kind:'kill'})).reason,
    'echo_quest_not_accepted');
   assert.equal((await story.readBranchLeads(A)).leads.length,0);
  });
  await t.test('actual trusted starter patrol must be turned in first',async()=>{
   assert.equal((await starter.accept({...A,questId:'axe_q_first_patrol'})).ok,true);
   for(let i=0;i<3;i++)assert.equal((await credits.project({...A,
    receiptId:await trustedKill(pool)})).ok,true);
   assert.equal((await starterTurnIn.turnIn({...A,
    questId:'axe_q_first_patrol'})).ok,true);
   assert.equal((await story.accept({...A,questId:'echo_ch_14_first_echo'})).ok,true);
   assert.equal((await story.accept({...A,questId:'echo_ch_15_world_signs'})).reason,
    'echo_prerequisite_unfinished');
  });
  await t.test('Chapter 1.4 requires 2 actual committed kills after acceptance',async()=>{
   const wrong=await story.credit({...A,questId:'echo_ch_14_first_echo',
    receiptId:'untrusted-client-kill-165',kind:'kill',clientConfirmed:true});
   assert.equal(wrong.reason,'echo_objective_receipt_not_verified');
   assert.equal((await story.turnIn({...A,questId:'echo_ch_14_first_echo'})).reason,
    'echo_objective_incomplete');
   const first=await verifyKill('echo_ch_14_first_echo');
   assert.equal(first.result.credited,1);
   const replay=await story.credit({...A,questId:'echo_ch_14_first_echo',
    receiptId:first.receiptId,kind:'kill'});
   assert.equal(replay.progressCommitted,false);
   assert.equal(replay.credited,1);
   const second=await verifyKill('echo_ch_14_first_echo');
   assert.equal(second.result.readyToTurnIn,true);
   const two=await Promise.all([
    story.turnIn({...A,questId:'echo_ch_14_first_echo'}),
    story.turnIn({...A,questId:'echo_ch_14_first_echo'})
   ]);
   assert.equal(two.filter(x=>x.questCompleted).length,1);
   assert.equal(two.filter(x=>x.reason==='echo_quest_already_closed').length,1);
   assert.equal((await story.accept({...A,questId:'echo_ch_15_world_signs'})).ok,true);
  });
  await t.test('Chapter 1.5 requires verified Spirit Vein, not a client GPS claim',async()=>{
   const bad=discovery('ft_spirit_vein',{sourceKind:'browser-location-report'});
   assert.equal((await story.recordDiscovery({...A,receiptId:bad})).reason,
    'unverified_private_world_discovery');
   const wrong=await verifyDiscover('echo_ch_15_world_signs','ft_weathered_tablet');
   assert.equal(wrong.result.reason,'echo_objective_receipt_not_verified');
   const old=discovery('ft_spirit_vein',{occurredAt:Date.now()-3600000});
   assert.equal((await story.recordDiscovery({...A,receiptId:old})).ok,true);
   assert.equal((await story.credit({...A,questId:'echo_ch_15_world_signs',
    receiptId:old,kind:'discovery'})).reason,
    'echo_objective_receipt_not_verified');
   const correct=await verifyDiscover('echo_ch_15_world_signs','ft_spirit_vein');
   assert.equal(correct.result.ok,true);
   assert.equal(correct.result.credited,1);
   assert.equal((await story.turnIn({...A,questId:'echo_ch_15_world_signs'})).ok,true);
   assert.equal((await story.accept({...A,questId:'echo_ch_16_crossroads'})).ok,true);
  });
  await t.test('Chapter 1.6 requires a committed elite kill, then two optional leads',async()=>{
   const normal=await trustedKill(pool,'normal');
   assert.equal((await story.credit({...A,questId:'echo_ch_16_crossroads',
    receiptId:normal,kind:'kill'})).reason,
    'echo_objective_receipt_not_verified');
   assert.equal((await story.turnIn({...A,questId:'echo_ch_16_crossroads'})).reason,
    'echo_objective_incomplete');
   assert.equal((await verifyKill('echo_ch_16_crossroads','elite')).result.credited,1);
   assert.equal((await story.turnIn({...A,questId:'echo_ch_16_crossroads'})).ok,true);
   const r=await story.readBranchLeads(A);
   assert.equal(r.eligibility,'verified');
   assert.deepEqual(r.leads.map(x=>x.questId),
    ['echo_branch_hidden_echo','echo_branch_broken_road']);
   assert(r.leads.every(x=>x.optional&&!x.autoAccepted));
   assert.equal((await story.accept({...A,questId:'echo_ch_17_aftershocks'})).ok,true);
   assert.equal((await story.accept({...A,questId:'echo_branch_hidden_echo'})).ok,true);
   assert.equal((await story.accept({...A,questId:'echo_branch_broken_road'})).ok,true);
  });
  await t.test('both optional branches progress independently and never auto-finish',async()=>{
   const initial=await story.readQuestbook(A);
   const sides=initial.quests.filter(x=>x.kind==='side');
   assert.equal(sides.length,2);
   assert(sides.every(x=>x.status==='accepted'&&x.credited===0));
   assert.equal((await verifyDiscover(
    'echo_branch_hidden_echo','ft_weathered_tablet')).result.credited,1);
   assert.equal((await story.turnIn({...A,questId:'echo_branch_hidden_echo'})).ok,true);
   const broken=await story.readQuestbook(A);
   assert.equal(broken.quests.find(x=>
    x.questId==='echo_branch_broken_road').status,'accepted');
   for(let i=0;i<3;i++){
    const n=await verifyKill('echo_branch_broken_road');
    assert.equal(n.result.credited,i+1);
   }
   assert.equal((await story.turnIn({...A,questId:'echo_branch_broken_road'})).ok,true);
   assert.deepEqual((await story.readBranchLeads(A)).leads,[]);
  });
  await t.test('Chapter 1.7 needs 4 kills and chapter 1.8 needs champion, no XP',async()=>{
   for(let i=0;i<4;i++)await verifyKill('echo_ch_17_aftershocks');
   assert.equal((await story.turnIn({...A,questId:'echo_ch_17_aftershocks'})).ok,true);
   assert.equal((await story.accept({...A,questId:'echo_ch_18_traces_remain'})).ok,true);
   const elite=await trustedKill(pool,'elite');
   assert.equal((await story.credit({...A,questId:'echo_ch_18_traces_remain',
    receiptId:elite,kind:'kill'})).reason,'echo_objective_receipt_not_verified');
   assert.equal((await verifyKill('echo_ch_18_traces_remain','champion')).result.credited,1);
   assert.equal((await story.turnIn({...A,questId:'echo_ch_18_traces_remain'})).ok,true);
   const all=await story.readQuestbook(A);
   assert.equal(all.quests.length,7);
   assert(all.quests.every(x=>x.status==='completed'&&x.rewardsIssued===false));
   const xp=(await pool.query(`SELECT xp_total::text AS xp FROM
    game3d_trusted_character WHERE owner_id=$1 AND character_id=$2`,
    [A.ownerId,A.characterId])).rows[0].xp;
   assert.equal(xp,'0','no XP/point/currency reward settlement');
  });
  await t.test('immutable proofs and turn-in rows cannot be retroactively edited',async()=>{
   for(const table of ['game3d_private_echo_objective_credit_165',
    'game3d_private_echo_turnin_165',
    'game3d_private_world_discovery_receipt_165']){
    await assert.rejects(pool.query('DELETE FROM '+table));
   }
   const n=await pool.query(`SELECT count(*)::int AS n FROM
    game3d_private_echo_turnin_165`);
   assert.equal(n.rows[0].n,7);
   assert.equal((await story.readQuestbook(B)).reason,
    'private_echo_read_unauthorized');
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('16.5 mirrors all existing Echo chapter/branch objectives, no client writes',()=>{
 const source=readFileSync(new URL('../privateEchoQuest165.mjs',import.meta.url),'utf8');
 const authored=readFileSync(new URL(
  '../../../src/components/game3d/axe/quests/AXEEchoChapters.js',
  import.meta.url),'utf8');
 const names=['echo_ch_14_first_echo','echo_ch_15_world_signs',
  'echo_ch_16_crossroads','echo_ch_17_aftershocks',
  'echo_ch_18_traces_remain','echo_branch_hidden_echo',
  'echo_branch_broken_road'];
 for(const id of names){assert(source.includes(id));assert(authored.includes(id))}
 for(const id of ['ft_spirit_vein','ft_weathered_tablet']){
  assert(source.includes(id));assert(authored.includes(id))}
 assert.doesNotMatch(source,
  /localStorage|window\.|awardXP\(|grantItem\(|addContribution\(|createServer\(/);
});
