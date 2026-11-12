// Game 3D 16.3: throwaway PostgreSQL 16 only; never live player data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile as readAsync} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateQuestAcceptance154}
 from '../privateQuestAcceptance154.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestTurnIn156}
 from '../privateQuestTurnIn156.mjs';
import {createGame3DPrivateQuestRewardPlan157}
 from '../privateQuestRewardPlan157.mjs';
import {createGame3DPrivateQuestXPSettlement158}
 from '../privateQuestXPSettlement158.mjs';
import {createGame3DPrivateQuestNonXPReview159}
 from '../privateQuestNonXPReview159.mjs';
import {createGame3DPrivateFactionReputation163}
 from '../privateFactionReputation163.mjs';

const pgURL=process.env.GAME3D_163_DISPOSABLE_PG_URL;
const a={ownerId:'owner163',characterId:'hero163'};
const b={ownerId:'owner163b',characterId:'hero163b'};
let seq=0;
const ops=new Set([
 'accept_private_server_quest','project_committed_quest_kill',
 'turn_in_private_server_quest','plan_verified_private_quest_reward',
 'settle_verified_private_quest_xp','review_private_quest_nonxp',
 'bind_trusted_private_faction','credit_verified_private_faction_quest',
 'read_trusted_private_faction',
]);
const auth=async({operation,ownerId,characterId})=>
 ownerId===a.ownerId&&characterId===a.characterId&&ops.has(operation);
const receipt=async(pool,tier='normal')=>{
 const id='receipt-163-'+(++seq);
 await pool.query(`
 INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
  map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
  server_kill_committed)
 VALUES($1,$2,$3,'world-163','epoch-163',$4,$5,$6,$7,
  'server-committed-private-pve-kill',true)`,
 [id,a.ownerId,a.characterId,'c'.repeat(64),seq,'enemy_'+seq,tier]);
 return id;
};
test('16.3 actual private faction membership + ledger, no browser identity',
 {skip:!pgURL,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_faction_163_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:pgURL,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:pgURL,max:16,
   options:'-c search_path='+schema});
  await pool.query(await readAsync(new URL(
   '../sql/008_combat50_verified_event_provenance.sql',import.meta.url),'utf8'));
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'private immutable row'; END;$$`);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '038_combat157_private_reward_plans.sql',
   '039_combat158_private_quest_xp_settlement.sql',
   '040_combat159_private_nonxp_reward_review.sql',
   '041_combat161_private_stat_allocations.sql',
   '042_combat162_private_contribution_ledger.sql',
   '043_combat163_private_faction_reputation.sql'
  ])await pool.query(await readAsync(
   new URL('../sql/'+file,import.meta.url),'utf8'));
  await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id) VALUES($1,$2),($3,$4)`,
   [a.ownerId,a.characterId,b.ownerId,b.characterId]);
  const acceptance=createGame3DPrivateQuestAcceptance154({
   pool,authorizeServerOperation:auth});
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:auth});
  const turnIn=createGame3DPrivateQuestTurnIn156({
   pool,authorizeServerOperation:auth});
  const plans=createGame3DPrivateQuestRewardPlan157({
   pool,authorizeServerOperation:auth});
  const xp=createGame3DPrivateQuestXPSettlement158({
   pool,authorizeServerOperation:auth});
  const reviews=createGame3DPrivateQuestNonXPReview159({
   pool,authorizeServerOperation:auth});
  let assigned='AXE_Faction_2';
  let authorizedAssignment=true;
  const factions=createGame3DPrivateFactionReputation163({
   pool,authorizeServerOperation:auth,
   resolveTrustedFactionAssignment:async({ownerId,characterId})=>({
    approved:authorizedAssignment,ownerId,characterId,
    factionId:assigned,sourceKind:'trusted-server-faction-assignment'
   })
  });
  const entries=async()=>Number((await pool.query(`
   SELECT COUNT(*)::int AS n FROM game3d_private_faction_reputation_event_163
  `)).rows[0].n);
  const finish=async questId=>{
   assert.equal((await turnIn.turnIn({...a,questId})).ok,true);
   assert.equal((await plans.plan({...a,questId})).ok,true);
   assert.equal((await xp.settleXP({...a,questId})).ok,true);
   assert.equal((await reviews.review({...a,questId})).ok,true);
  };
  const defeat=async tier=>ledger.project({...a,
   receiptId:await receipt(pool,tier)});
  await t.test('unassigned and foreign characters cannot fabricate faction credit',async()=>{
   const open=await factions.readFaction(a);
   assert.equal(open.ok,true);
   assert.equal(open.factionId,null);
   assert.equal(open.reputation,0);
   assert.equal((await factions.creditQuest({...a,
    questId:'axe_q_first_patrol',factionId:'AXE_Faction_3'})).reason,
    'trusted_faction_membership_missing');
   assert.equal((await factions.bindFaction({...b,
    factionId:'AXE_Faction_1'})).reason,
    'private_faction_binding_unauthorized');
   assert.equal((await factions.readFaction(b)).reason,
    'private_faction_read_unauthorized');
   assert.equal(await entries(),0);
  });
  await t.test('rejected, unassigned and mismatched assignments never establish membership',async()=>{
   authorizedAssignment=false;
   assert.equal((await factions.bindFaction({...a,
    factionId:'AXE_Faction_3'})).reason,
    'invalid_trusted_faction_assignment');
   authorizedAssignment=true;
   assigned='AXE_Faction_Unassigned';
   assert.equal((await factions.bindFaction(a)).reason,
    'invalid_trusted_faction_assignment');
   assigned='AXE_Faction_2';
   const missing=createGame3DPrivateFactionReputation163({
    pool,authorizeServerOperation:auth});
   assert.equal((await missing.bindFaction(a)).reason,
    'trusted_faction_authority_not_installed');
   assert.equal(await entries(),0);
  });
  await t.test('trusted server binds exactly one faction; browser faction parameter is ignored',async()=>{
   const first=await factions.bindFaction({...a,
    factionId:'AXE_Faction_1',claimedFactionId:'AXE_Faction_3'});
   assert.equal(first.ok,true);
   assert.equal(first.factionId,'AXE_Faction_2');
   assert.equal(first.newlyBound,true);
   assert.equal(first.reputation,0);
   const retry=await factions.bindFaction(a);
   assert.equal(retry.ok,true);
   assert.equal(retry.newlyBound,false);
   assigned='AXE_Faction_3';
   assert.equal((await factions.bindFaction(a)).reason,
    'private_faction_assignment_conflict');
   const state=await factions.readFaction(a);
   assert.equal(state.factionId,'AXE_Faction_2');
   assert.equal(state.rank,'outsider');
   assert.equal(state.legacyFactionImported,false);
   assigned='AXE_Faction_2';
  });
  await t.test('reputation only follows verified 15.9 review, not local quest progress',async()=>{
   assert.equal((await factions.creditQuest({...a,
    questId:'axe_q_first_patrol'})).reason,
    'verified_faction_quest_reward_missing');
   assert.equal((await acceptance.accept({...a,
    questId:'axe_q_first_patrol'})).ok,true);
   for(let i=0;i<3;i++)assert.equal((await defeat('normal')).ok,true);
   assert.equal((await factions.creditQuest({...a,
    questId:'axe_q_first_patrol'})).reason,
    'verified_faction_quest_reward_missing');
   await finish('axe_q_first_patrol');
   const first=await factions.creditQuest({...a,questId:'axe_q_first_patrol',
    factionId:'AXE_Faction_3',reputation:99999});
   assert.equal(first.ok,true,JSON.stringify(first));
   assert.equal(first.posted,true);
   assert.equal(first.factionId,'AXE_Faction_2');
   assert.equal(first.amount,5);
   assert.equal(first.reputation,5);
   assert.equal(first.rank,'outsider');
   const again=await factions.creditQuest({...a,questId:'axe_q_first_patrol'});
   assert.equal(again.ok,true);
   assert.equal(again.alreadyPosted,true);
   assert.equal(again.reputation,5);
   assert.equal(await entries(),1);
  });
  await t.test('concurrent elite quest reputation posts once to immutable faction',async()=>{
   assert.equal((await acceptance.accept({...a,
    questId:'axe_q_first_elite'})).ok,true);
   assert.equal((await defeat('normal')).credited.length,0);
   assert.equal((await defeat('elite')).credited.length,1);
   await finish('axe_q_first_elite');
   const results=await Promise.all([
    factions.creditQuest({...a,questId:'axe_q_first_elite',
     factionId:'AXE_Faction_1',reputationAmount:10000}),
    factions.creditQuest({...a,questId:'axe_q_first_elite'}),
    factions.creditQuest({...a,questId:'axe_q_first_elite'})
   ]);
   assert(results.every(x=>x.ok),JSON.stringify(results));
   assert.equal(results.filter(x=>x.posted).length,1);
   assert.equal(results.filter(x=>x.alreadyPosted).length,2);
   assert.equal(results[0].reputation,15);
   assert.equal(results[0].factionId,'AXE_Faction_2');
   assert.equal(await entries(),2);
   const read=await factions.readFaction(a);
   assert.equal(read.reputation,15);
   assert.equal(read.rank,'outsider');
   assert.equal(read.revision,'2');
  });
  await t.test('memberships and reputation journal are immutable; tampered account fails audit',async()=>{
   await assert.rejects(pool.query(`
    UPDATE game3d_private_faction_membership_163 SET faction_id='AXE_Faction_3'`));
   await assert.rejects(pool.query(`
    DELETE FROM game3d_private_faction_membership_163`));
   await assert.rejects(pool.query(`
    UPDATE game3d_private_faction_reputation_event_163 SET amount=999`));
   await assert.rejects(pool.query(`
    DELETE FROM game3d_private_faction_reputation_event_163`));
   await pool.query(`UPDATE game3d_private_faction_reputation_account_163
    SET reputation=reputation+1 WHERE owner_id=$1 AND character_id=$2`,
    [a.ownerId,a.characterId]);
   assert.equal((await factions.readFaction(a)).reason,
    'private_faction_read_failed');
   await pool.query(`UPDATE game3d_private_faction_reputation_account_163
    SET reputation=reputation-1 WHERE owner_id=$1 AND character_id=$2`,
    [a.ownerId,a.characterId]);
   assert.equal((await factions.readFaction(a)).reputation,15);
  });
  await t.test('DB revision failure rolls back quest reputation event',async()=>{
   // For one remaining new, source-independent event, use a test-only clone
   // of an already committed journal after deleting nothing: trigger proves
   // no trusted account can be advanced by unauthorized direct writes.
   await pool.query(`CREATE FUNCTION game3d_163_test_fail_rep_update()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'reject account revision'; END;$$`);
   await pool.query(`CREATE TRIGGER test_163_reject_rep_revision
    BEFORE UPDATE OF revision ON game3d_private_faction_reputation_account_163
    FOR EACH ROW EXECUTE FUNCTION game3d_163_test_fail_rep_update()`);
   const before=await entries();
   assert.equal((await factions.creditQuest({...a,
    questId:'axe_q_first_elite'})).alreadyPosted,true);
   assert.equal(await entries(),before);
   await pool.query(`DROP TRIGGER test_163_reject_rep_revision
    ON game3d_private_faction_reputation_account_163`);
  });
  await t.test('privileged operator rejection blocks membership and reputation',async()=>{
   const denied=createGame3DPrivateFactionReputation163({
    pool,authorizeServerOperation:async()=>false,
    resolveTrustedFactionAssignment:async()=>({
     approved:true,...a,factionId:'AXE_Faction_1',
     sourceKind:'trusted-server-faction-assignment'
    })
   });
   assert.equal((await denied.bindFaction(a)).reason,
    'private_faction_binding_unauthorized');
   assert.equal((await denied.creditQuest({...a,
    questId:'axe_q_first_elite'})).reason,
    'private_faction_reputation_unauthorized');
   assert.equal((await denied.readFaction(a)).reason,
    'private_faction_read_unauthorized');
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('16.3 mirrors existing three AXE faction IDs/ranks without browser writes',()=>{
 const src=readFileSync(new URL('../privateFactionReputation163.mjs',import.meta.url),'utf8');
 const config=readFileSync(new URL(
  '../../../src/components/game3d/axe/factions/AXEFactionWeaponConfig.js',
  import.meta.url),'utf8');
 const reputation=readFileSync(new URL(
  '../../../src/components/game3d/axe/factions/AXEFactionReputationStore.js',
  import.meta.url),'utf8');
 assert.match(config,/makeFaction\(1\)/);
 assert.match(config,/makeFaction\(2\)/);
 assert.match(config,/makeFaction\(3\)/);
 for(const id of ['outsider','known','trusted','honored','exalted']){
  assert.match(reputation,new RegExp("id: '"+id+"'"));
  assert.match(src,new RegExp("id:'"+id+"'"));
 }
 assert.match(src,/trusted-server-faction-assignment/);
 assert.doesNotMatch(src,/localStorage|window\.|addAXEFactionReputation\(|setAXEFactionReputation\(|createServer\(/);
});
