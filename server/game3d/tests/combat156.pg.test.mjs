// Game 3D Quest 15.6: isolated PostgreSQL real transactions only.
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

const pgUrl=process.env.GAME3D_156_DISPOSABLE_PG_URL;
const a={ownerId:'owner156',characterId:'hero156'};
const b={ownerId:'owner156b',characterId:'hero156b'};
const nsql=`SELECT COUNT(*)::int AS n FROM game3d_private_quest_turnin_156`;
let n=0;
const insertReceipt=async(pool,scope=a,tier='normal')=>{
 const seq=++n,id='receipt-156-'+seq;
 await pool.query(`
  INSERT INTO game3d_private_world_kill_receipt_152
  (receipt_id,owner_id,character_id,instance_id,instance_epoch,
   map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
   server_kill_committed)
  VALUES($1,$2,$3,'world-156','epoch-156',$4,$5,$6,$7,
   'server-committed-private-pve-kill',true)`,
  [id,scope.ownerId,scope.characterId,'b'.repeat(64),seq,'wolf_'+seq,tier]);
 return id;
};
test('15.6 trusted PostgreSQL quest turn-in, exactly once, no rewards',
 {skip:!pgUrl,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_turnin_156_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:pgUrl,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:pgUrl,
   options:'-c search_path='+schema,max:12});
  await pool.query(`CREATE TABLE game3d_trusted_character (
   owner_id text NOT NULL,character_id text NOT NULL,
   xp_total bigint NOT NULL DEFAULT 0,
   revision bigint NOT NULL DEFAULT 0,
   PRIMARY KEY(owner_id,character_id))`);
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'immutable private journal'; END;$$`);
  await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id,xp_total) VALUES
   ($1,$2,0),($3,$4,0)`,
   [a.ownerId,a.characterId,b.ownerId,b.characterId]);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
  ])await pool.query(await readAsync(
   new URL('../sql/'+file,import.meta.url),'utf8'));
  const allow=async({ownerId,characterId,operation})=>
   ownerId===a.ownerId&&characterId===a.characterId&&
   ['accept_private_server_quest','read_private_server_quests',
    'project_committed_quest_kill','read_committed_quest_progress',
    'turn_in_private_server_quest','read_private_quest_turnins'].includes(operation);
  const acceptance=createGame3DPrivateQuestAcceptance154({
   pool,authorizeServerOperation:allow});
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:allow});
  const turnin=createGame3DPrivateQuestTurnIn156({
   pool,authorizeServerOperation:allow});
  const credit=async(tier='normal')=>{
   const receiptId=await insertReceipt(pool,a,tier);
   return ledger.project({...a,receiptId});
  };
  await t.test('unknown/foreign/unaccepted quests cannot be completed',async()=>{
   assert.equal((await turnin.turnIn({...a,questId:'made_up_quest'})).reason,
    'quest_not_eligible_for_private_turnin');
   assert.equal((await turnin.turnIn({...b,questId:'axe_q_first_patrol'})).reason,
    'private_quest_turnin_unauthorized');
   assert.equal((await turnin.readCompleted(b)).ok,false);
   assert.equal((await turnin.turnIn({...a,questId:'axe_q_first_patrol'})).reason,
    'quest_not_accepted');
   assert.equal((await pool.query(nsql)).rows[0].n,0);
   assert.equal(typeof turnin.grantXP,'undefined');
  });
  await t.test('accepted but incomplete objective cannot turn in or unlock next quest',async()=>{
   const accepted=await acceptance.accept({...a,questId:'axe_q_first_patrol'});
   assert.equal(accepted.ok,true);
   assert.equal((await turnin.turnIn({...a,questId:'axe_q_first_patrol',
    count:999,questReady:true,claimXP:999999})).reason,
    'quest_objectives_incomplete');
   await credit();
   await credit();
   assert.equal((await turnin.turnIn({...a,questId:'axe_q_first_patrol'})).reason,
    'quest_objectives_incomplete');
   assert.equal((await acceptance.accept({...a,questId:'axe_q_first_elite'})).reason,
    'quest_prerequisite_unfinished');
   assert.equal((await pool.query(nsql)).rows[0].n,0);
  });
  await t.test('third committed receipt enables one permanent, reward-free completion',async()=>{
   const result=await credit();
   assert.equal(result.ok,true);
   assert.equal(result.credited[0].readyForTurnIn,true);
   const [first,second]=await Promise.all([
    turnin.turnIn({...a,questId:'axe_q_first_patrol'}),
    turnin.turnIn({...a,questId:'axe_q_first_patrol',claimGold:999999})
   ]);
   assert.equal([first,second].filter(x=>x.ok).length,1,
    'only one of two simultaneous turn-ins can complete');
   const complete=[first,second].find(x=>x.ok);
   assert.equal(complete.questTurnInCommitted,true);
   assert.equal(complete.rewardsIssued,false);
   assert.equal(complete.rewardSettlementAuthorized,false);
   assert.equal(complete.creditedDefeats,3);
   const duplicate=[first,second].find(x=>!x.ok);
   assert.equal(duplicate.reason,'quest_already_closed');
   assert.equal(duplicate.alreadyCompleted,true);
   assert.equal((await pool.query(nsql)).rows[0].n,1);
   const completed=(await turnin.readCompleted(a)).completed;
   assert.deepEqual(completed.map(x=>x.questId),['axe_q_first_patrol']);
   const rows=await pool.query(`SELECT o.status AS objective_status,
    a.status AS quest_status,a.reward_authorized
    FROM game3d_private_quest_objective_binding_152 o JOIN
    game3d_private_quest_acceptance_154 a
    USING(owner_id,character_id,quest_id)
    WHERE a.quest_id='axe_q_first_patrol'`);
   assert.equal(rows.rows[0].quest_status,'completed');
   assert.equal(rows.rows[0].objective_status,'completed');
   assert.equal(rows.rows[0].reward_authorized,false);
   const repeat=await turnin.turnIn({...a,questId:'axe_q_first_patrol'});
   assert.equal(repeat.ok,false);
   assert.equal(repeat.alreadyCompleted,true);
  });
  await t.test('verified patrol completion unlocks elite, requiring real elite defeat',async()=>{
   assert.equal((await acceptance.accept({...a,questId:'axe_q_first_elite'})).ok,true);
   assert.equal((await credit('normal')).credited.length,0);
   assert.equal((await turnin.turnIn({...a,questId:'axe_q_first_elite'})).reason,
    'quest_objectives_incomplete');
   const projection=await credit('elite');
   assert.deepEqual(projection.credited.map(x=>x.questId),['axe_q_first_elite']);
   const done=await turnin.turnIn({...a,questId:'axe_q_first_elite'});
   assert.equal(done.ok,true);
   assert.equal(done.creditedDefeats,1);
   assert.equal((await turnin.readCompleted(a)).completed.length,2);
   assert.equal((await pool.query(nsql)).rows[0].n,2);
  });
  await t.test('mismatched server objective binding is rejected even with sufficient credit',async()=>{
   const foreign=createGame3DPrivateQuestAcceptance154({
    pool,authorizeServerOperation:async({ownerId,characterId,operation})=>
     ownerId===b.ownerId&&characterId===b.characterId&&
     operation==='accept_private_server_quest'
   });
   assert.equal((await foreign.accept({...b,questId:'axe_q_first_patrol'})).ok,true);
   const legitimateOwner=createGame3DPrivateQuestTurnIn156({
    pool,authorizeServerOperation:async({ownerId,characterId,operation})=>
     ownerId===b.ownerId&&characterId===b.characterId&&
     operation==='turn_in_private_server_quest'
   });
   await pool.query(`UPDATE game3d_private_quest_objective_binding_152
    SET required_count=1 WHERE owner_id=$1 AND character_id=$2
     AND quest_id='axe_q_first_patrol'`,[b.ownerId,b.characterId]);
   const proof=await legitimateOwner.turnIn({...b,questId:'axe_q_first_patrol'});
   assert.equal(proof.reason,'untrusted_quest_objective_binding');
   assert.equal((await pool.query(nsql)).rows[0].n,2);
  });
  await t.test('completion rows are immutable and FK protected',async()=>{
   await assert.rejects(pool.query(`UPDATE game3d_private_quest_turnin_156
    SET rewards_issued=true WHERE quest_id='axe_q_first_patrol'`));
   await assert.rejects(pool.query(`DELETE FROM game3d_private_quest_turnin_156
    WHERE quest_id='axe_q_first_patrol'`));
   await assert.rejects(pool.query(`INSERT INTO game3d_private_quest_turnin_156
    (owner_id,character_id,quest_id,catalog_revision,source_kind)
    VALUES($1,$2,'forged','axe-private-pve-154-v1',
    'server-verified-private-quest-turnin')`,[a.ownerId,a.characterId]));
   assert.equal((await pool.query(nsql)).rows[0].n,2);
  });
  await t.test('private authorization failures never yield completion',async()=>{
   const denied=createGame3DPrivateQuestTurnIn156({
    pool,authorizeServerOperation:async()=>false});
   assert.equal((await denied.turnIn({...a,questId:'axe_q_first_elite'})).reason,
    'private_quest_turnin_unauthorized');
   assert.equal((await denied.readCompleted(a)).reason,
    'private_quest_turnin_read_unauthorized');
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('15.6 remains server-only and does not expose XP/loot/AGP/reward settlement',()=>{
 const source=readFileSync(new URL('../privateQuestTurnIn156.mjs',import.meta.url),'utf8');
 assert.match(source,/FOR UPDATE/);
 assert.match(source,/readCreditSQL/);
 assert.match(source,/getPrivateQuestDefinition154/);
 assert.doesNotMatch(source,/awardXP\(|grantQuestReward\(|grantItem\(|addGold\(|createServer\(|window\.|localStorage/);
});
