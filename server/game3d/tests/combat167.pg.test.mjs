// Game 3D Quest 16.7 — real PostgreSQL, same-transaction private UI projection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile as readAsync} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateQuestAcceptance154}
 from '../privateQuestAcceptance154.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestTurnIn156}
 from '../privateQuestTurnIn156.mjs';
import {createGame3DPrivateEchoQuest165}
 from '../privateEchoQuest165.mjs';
import {createGame3DPrivateStoryRivalConsent164}
 from '../privateStoryRivalConsent164.mjs';
import {createGame3DPrivateQuestbookProjection167}
 from '../privateQuestbookProjection167.mjs';

const url=process.env.GAME3D_167_DISPOSABLE_PG_URL;
const A={ownerId:'owner167A',characterId:'hero167A'};
const B={ownerId:'owner167B',characterId:'hero167B'};
const C={ownerId:'owner167C',characterId:'hero167C'};
let receiptNumber=0;
const discoveries=new Map();
const ops=new Set([
 'accept_private_server_quest','project_committed_quest_kill',
 'turn_in_private_server_quest','accept_private_echo_quest',
 'record_private_world_discovery','credit_private_echo_objective',
 'turn_in_private_echo_quest','read_private_echo_questbook',
 'offer_private_rival_lead','respond_private_rival_lead',
 'read_private_rival_invitation','read_private_questbook_projection'
]);
const auth=async({operation,ownerId,characterId})=>
 [A,B].some(x=>x.ownerId===ownerId&&x.characterId===characterId)&&
 ops.has(operation);
const leadId='rival-evidence-167-ab';
const proof={status:'candidate',
 leadId,evidenceKind:'trusted-private-pvp-candidate-151',
 initiatorOwnerId:A.ownerId,initiatorCharacterId:A.characterId,
 counterpartOwnerId:B.ownerId,counterpartCharacterId:B.characterId,
 verifiedDefeats:3,distinctMatches:3,
 evidenceDigest:createHash('sha256').update('trusted-167').digest('hex'),
 issuedAt:Date.now()
};
async function kill(pool,tier='normal'){
 const receiptId='kill-167-'+(++receiptNumber);
 await pool.query(`
 INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
  map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
  server_kill_committed)
 VALUES($1,$2,$3,'world-167-fixture','epoch-167-fixture',$4,$5,$6,$7,
  'server-committed-private-pve-kill',true)`,
 [receiptId,A.ownerId,A.characterId,'f'.repeat(64),receiptNumber,
  'enemy_'+receiptNumber,tier]);
 return receiptId;
}
function attestedDiscovery(targetId){
 const receiptId='discovery-167-'+(++receiptNumber);
 discoveries.set(receiptId,{
  sourceKind:'trusted-private-world-discovery',
  receiptId,ownerId:A.ownerId,characterId:A.characterId,
  worldId:'world-167-fixture',targetId,occurredAt:Date.now(),
  evidenceDigest:createHash('sha256').update(receiptId).digest('hex')
 });
 return receiptId;
}
test('16.7 private read-only Questbook and NPC and Rival projection',
 {skip:!url,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_projection_167_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:url,max:16,
   options:'-c search_path='+schema});
  await pool.query(await readAsync(new URL(
   '../sql/008_combat50_verified_event_provenance.sql',import.meta.url),'utf8'));
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'immutable game evidence'; END;$$`);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '044_combat164_private_rival_consent.sql',
   '045_combat165_private_echo_story.sql'
  ])await pool.query(await readAsync(
   new URL('../sql/'+file,import.meta.url),'utf8'));
  for(const actor of [A,B,C])await pool.query(`
   INSERT INTO game3d_trusted_character(owner_id,character_id)
   VALUES($1,$2)`,[actor.ownerId,actor.characterId]);
  const starter=createGame3DPrivateQuestAcceptance154({
   pool,authorizeServerOperation:auth});
  const credits=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:auth});
  const completeStarter=createGame3DPrivateQuestTurnIn156({
   pool,authorizeServerOperation:auth});
  const echo=createGame3DPrivateEchoQuest165({
   pool,authorizeServerOperation:auth,
   resolveTrustedWorldDiscovery:async({receiptId})=>
    discoveries.get(receiptId)||null
  });
  const rival=createGame3DPrivateStoryRivalConsent164({
   pool,authorizeServerOperation:auth,
   resolveTrustedRivalLead:async({leadId:id})=>id===leadId?proof:null
  });
  const projection=createGame3DPrivateQuestbookProjection167({
   pool,authorizeServerOperation:auth});
  const read=async(actor=A)=>{
   const result=await projection.readSnapshot(actor);
   assert.equal(result.ok,true,JSON.stringify(result));
   return result;
  };
  const get=(snapshot,questId)=>
   snapshot.questbook.entries.find(x=>x.id===questId);
  const echoDefeat=async(questId,tier='normal')=>
   echo.credit({...A,questId,receiptId:await kill(pool,tier),kind:'kill'});
  const echoDiscover=async(questId,targetId)=>{
   const receiptId=attestedDiscovery(targetId);
   assert.equal((await echo.recordDiscovery({...A,receiptId})).ok,true);
   return echo.credit({...A,questId,receiptId,kind:'discovery'});
  };

  await t.test('unregistered player, cross-character and unauthorized reads fail closed',async()=>{
   assert.equal((await projection.readSnapshot(C)).reason,
    'private_questbook_projection_unauthorized');
   assert.equal((await projection.readSnapshot({
    ownerId:'../fake',characterId:'hero167A'
   })).reason,'invalid_private_questbook_identity');
   const blocked=createGame3DPrivateQuestbookProjection167({
    pool,authorizeServerOperation:async()=>false});
   assert.equal((await blocked.readSnapshot(A)).reason,
    'private_questbook_projection_unauthorized');
   const empty=await read();
   assert.deepEqual(empty.questbook.entries,[]);
   assert.deepEqual(empty.npcInteractionLeads,[]);
   assert.deepEqual(empty.rivalInvitations,[]);
   assert.equal(empty.browserQuestStoreConnected,false);
   assert.equal(empty.questWritesEnabled,false);
  });
  await t.test('starter accepted/progress/complete are projected from real committed defeats',async()=>{
   assert.equal((await starter.accept({...A,questId:'axe_q_first_patrol'})).ok,true);
   const snap=await read();
   const initial=get(snap,'axe_q_first_patrol');
   assert.equal(initial.title,'Beyond the Capital Gate');
   assert.equal(initial.npcId,'archer_lyra');
   assert.equal(initial.statusLabel,'In Progress');
   assert.equal(initial.objectives[0].current,0);
   assert.equal(initial.objectives[0].count,3);
   assert.deepEqual(snap.questbook.acceptedIds,['axe_q_first_patrol']);
   for(let i=1;i<=3;i++){
    assert.equal((await credits.project({...A,receiptId:await kill(pool)})).ok,true);
    const state=get(await read(),'axe_q_first_patrol');
    assert.equal(state.objectives[0].current,i);
    assert.equal(state.progressPercent,Math.round(i*100/3));
   }
   assert.equal(get(await read(),'axe_q_first_patrol').statusLabel,
    'Ready to turn in');
   assert.equal((await completeStarter.turnIn({
    ...A,questId:'axe_q_first_patrol'})).ok,true);
   const completed=await read();
   assert.equal(get(completed,'axe_q_first_patrol').status,'completed');
   assert.deepEqual(completed.questbook.completedIds,['axe_q_first_patrol']);
   assert.equal(completed.npcInteractionLeads.length,1);
   assert.equal(completed.npcInteractionLeads[0].questId,
    'echo_ch_14_first_echo');
   assert.equal(completed.npcInteractionLeads[0].npcId,'archer_lyra');
   assert.equal(completed.npcInteractionLeads[0].autoAccepted,false);
   assert.equal(completed.npcInteractionLeads[0].claimableReward,false);
  });
  await t.test('Echo Chapter 1.4 and 1.5 use the same visible quest IDs and verified evidence',async()=>{
   assert.equal((await echo.accept({...A,questId:'echo_ch_14_first_echo'})).ok,true);
   let snap=await read();
   assert.equal(snap.npcInteractionLeads.length,0,
    'accepted quest no longer appears as an NPC invitation');
   const first=await echoDefeat('echo_ch_14_first_echo');
   assert.equal(first.ok,true);
   snap=await read();
   assert.equal(get(snap,'echo_ch_14_first_echo').objectives[0].current,1);
   assert.equal(get(snap,'echo_ch_14_first_echo').progressPercent,50);
   assert.equal((await echoDefeat('echo_ch_14_first_echo')).ok,true);
   assert.equal(get(await read(),'echo_ch_14_first_echo').statusLabel,
    'Ready to turn in');
   assert.equal((await echo.turnIn({...A,
    questId:'echo_ch_14_first_echo'})).ok,true);
   assert.equal((await read()).npcInteractionLeads[0].questId,
    'echo_ch_15_world_signs');
   assert.equal((await echo.accept({...A,
    questId:'echo_ch_15_world_signs'})).ok,true);
   assert.equal((await echoDiscover('echo_ch_15_world_signs',
    'ft_spirit_vein')).ok,true);
   assert.equal((await echo.turnIn({...A,
    questId:'echo_ch_15_world_signs'})).ok,true);
   assert.equal((await read()).npcInteractionLeads[0].questId,
    'echo_ch_16_crossroads');
  });
  await t.test('verified Chapter 1.6 unlocks two optional NPC leads alongside next chapter',async()=>{
   assert.equal((await echo.accept({...A,
    questId:'echo_ch_16_crossroads'})).ok,true);
   assert.equal((await echoDefeat('echo_ch_16_crossroads','elite')).ok,true);
   assert.equal((await echo.turnIn({...A,
    questId:'echo_ch_16_crossroads'})).ok,true);
   let snapshot=await read();
   assert.deepEqual(snapshot.npcInteractionLeads.map(x=>x.questId),[
    'echo_ch_17_aftershocks',
    'echo_branch_hidden_echo',
    'echo_branch_broken_road'
   ]);
   assert.equal(snapshot.npcInteractionLeads[1].optional,true);
   assert.equal(snapshot.npcInteractionLeads[1].npcId,'archer_noor');
   assert.equal(snapshot.npcInteractionLeads[2].npcId,'archer_vex');
   assert.equal(snapshot.npcInteractionLeads[0].optional,false);
   assert(snapshot.npcInteractionLeads.every(x=>
    x.requiresExplicitAccept&&x.autoAccepted===false));
   assert.equal((await echo.accept({...A,
    questId:'echo_branch_hidden_echo'})).ok,true);
   snapshot=await read();
   assert.deepEqual(snapshot.npcInteractionLeads.map(x=>x.questId),[
    'echo_ch_17_aftershocks','echo_branch_broken_road'
   ]);
   assert.equal((await echoDiscover('echo_branch_hidden_echo',
    'ft_weathered_tablet')).ok,true);
   assert.equal((await echo.turnIn({...A,
    questId:'echo_branch_hidden_echo'})).ok,true);
   snapshot=await read();
   assert.equal(get(snapshot,'echo_branch_hidden_echo').status,'completed');
   assert.equal(get(snapshot,'echo_ch_16_crossroads').status,'completed');
   assert.equal((await projection.readSnapshot(B)).questbook.entries.length,0,
    'a second character cannot inherit first character quest completions');
  });
  await t.test('Rival status is read-only and never a relationship without both matching votes',async()=>{
   const offered=await rival.offerRival({...A,leadId});
   assert.equal(offered.ok,true);
   let a=await read(),b=await read(B);
   assert.equal(a.rivalInvitations[0].status,'pending');
   assert.equal(a.rivalInvitations[0].requiresExplicitConsent,true);
   assert.equal(b.rivalInvitations[0].actorRole,'counterpart');
   assert.equal(b.rivalInvitations[0].relationship,null);
   assert.equal(b.rivalInvitations[0].otherCharacterId,A.characterId);
   assert.equal((await rival.respond({...B,leadId,choice:'friendly_rival'})).ok,true);
   a=await read();
   assert.equal(a.rivalInvitations[0].status,'pending');
   assert.equal(a.rivalInvitations[0].otherChoice,null,
    'one party cannot read the counterpart private vote');
   assert.equal((await rival.respond({...A,leadId,choice:'friendly_rival'})).ok,true);
   a=await read();
   b=await read(B);
   assert.equal(a.rivalInvitations[0].status,'friendly_rival');
   assert.equal(a.rivalInvitations[0].mutualConsent,true);
   assert.equal(b.rivalInvitations[0].relationship,'friendly_rival');
   assert.equal(a.rivalInvitations[0].meetingScheduled,false);
   assert.equal(a.rivalInvitations[0].rewardsIssued,false);
   assert.equal(a.questbook.entries.length,5,
    'Rival decisions never accept a quest');
  });
  await t.test('all reads are free of XP, currency, quest and social writes',async()=>{
   const before=(await pool.query(`
    SELECT xp_total::text AS xp,revision::text AS revision
    FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2`,
    [A.ownerId,A.characterId])).rows[0];
   for(let i=0;i<3;i++)assert.equal((await read()).ok,true);
   assert.deepEqual((await pool.query(`
    SELECT xp_total::text AS xp,revision::text AS revision
    FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2`,
    [A.ownerId,A.characterId])).rows[0],before);
   assert.equal(before.xp,'0');
  });
  await t.test('a fabricated unbacked Echo objective makes the entire projection fail closed',async()=>{
   await pool.query(`
    INSERT INTO game3d_private_echo_objective_credit_165
    (owner_id,character_id,quest_id,receipt_id,receipt_kind,objective_id)
    VALUES($1,$2,'echo_branch_hidden_echo','fabricated-proof-167',
    'discovery','tablet')`,[A.ownerId,A.characterId]);
   const projected=await projection.readSnapshot(A);
   assert.equal(projected.ok,false);
   assert.equal(projected.reason,'unverified_private_questbook_projection');
   assert.equal(projected.questWritesEnabled,undefined);
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('16.7 presentation IDs match the existing Questbook and Echo dialogue, never mutate browser stores',()=>{
 const source=readFileSync(
  new URL('../privateQuestbookProjection167.mjs',import.meta.url),'utf8');
 const workspace=readFileSync(new URL(
  '../../../src/components/game3d/axe/services/AXEQuestLogbookWorkspace.jsx',
  import.meta.url),'utf8');
 const chapters=readFileSync(new URL(
  '../../../src/components/game3d/axe/quests/AXEEchoChapters.js',
  import.meta.url),'utf8');
 for(const word of ['acceptedIds','completedIds','objective','npcId']){
  assert(source.includes(word));assert(workspace.includes(word));
 }
 for(const quest of ['echo_ch_14_first_echo','echo_ch_15_world_signs',
  'echo_ch_16_crossroads','echo_ch_17_aftershocks','echo_ch_18_traces_remain',
  'echo_branch_hidden_echo','echo_branch_broken_road']){
  assert(source.includes(quest));assert(chapters.includes(quest));
 }
 assert.doesNotMatch(source,
  /localStorage|window\.|addContribution\(|awardXP\(|grantItem\(|createServer\(|UPDATE game3d_private/);
});
