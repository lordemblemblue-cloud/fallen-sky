// Real PostgreSQL 16-only rehearsal; NEVER use a production database.
// Creates a random disposable schema + NOLOGIN role, applies existing
// private migrations only there, and drops them. Skips without opt-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {assertGame3DPrivateQuestProgressionReadiness184}
 from '../privateQuestProgressionReadiness184.mjs';
import {createGame3DQuestTransactionFence183}
 from '../privateQuestTransactionFence183.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestTurnIn156}
 from '../privateQuestTurnIn156.mjs';

const url=process.env.GAME3D_184_DISPOSABLE_PG_ADMIN_URL;
const ack=process.env.GAME3D_184_DISPOSABLE_ACK===
 'I_HAVE_A_DISPOSABLE_PG_INSTANCE';
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const ownerId='owner184',characterId='hero184';
const questId='axe_q_first_patrol';
const claim={
 ownerId,characterId,worldInstanceId:'world-instance-184',
 worldEpoch:'world-epoch-184',serverSessionId:'world-session-184',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'18418418-1841-4184-8184-184184184184',
 expiresAtMs:Date.now()+120000,
};
test('18.4 disposable PG16: restricted ledger, exact 3 kills, turn-in once, revoke',
 {skip:!url||!ack,timeout:120000},async()=>{
 const {default:pg}=await import('pg');
 const suffix=randomUUID().replaceAll('-','');
 const schema='g3d_184_'+suffix,role='g3d_184_progress_'+suffix;
 const admin=new pg.Pool({connectionString:url,max:3,
  connectionTimeoutMillis:4000});
 let db,writerConnections=null,createdSchema=false,createdRole=false;
 const table=name=>quote(schema)+'.'+quote(name);
 try{
  const serverVersion=await admin.query('SHOW server_version_num');
  assert(Number(serverVersion.rows[0].server_version_num)>=160000,
   'disposable PostgreSQL must be version 16 or newer');
  await admin.query('CREATE SCHEMA '+quote(schema));createdSchema=true;
  await admin.query('CREATE ROLE '+quote(role)+' NOLOGIN');
  createdRole=true;
  db=new pg.Pool({connectionString:url,max:4,
   options:'-c search_path='+schema,
   connectionTimeoutMillis:4000});
  await db.query(`CREATE TABLE game3d_trusted_character(
   owner_id text NOT NULL,character_id text NOT NULL,
   xp_total bigint NOT NULL DEFAULT 0,
   PRIMARY KEY(owner_id,character_id))`);
  await db.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'immutable private receipt'; END;
   $$`);
  for(const migration of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '048_combat183_private_quest_session_fence.sql',
  ]){
   const sql=await readFile(new URL('../sql/'+migration,import.meta.url),'utf8');
   await db.query(sql);
  }
  await db.query(`ALTER TABLE game3d_trusted_character
   ADD COLUMN action_row_lock_176 smallint
   GENERATED ALWAYS AS (0::smallint) STORED`);
  await db.query(`ALTER TABLE game3d_private_quest_acceptance_154
   ADD COLUMN action_row_lock_176 smallint
   GENERATED ALWAYS AS (0::smallint) STORED`);

  await db.query('INSERT INTO game3d_trusted_character(owner_id,character_id,xp_total) VALUES($1,$2,0)',
   [ownerId,characterId]);
  await db.query(`INSERT INTO game3d_private_quest_acceptance_154
   (owner_id,character_id,quest_id,catalog_revision,status,reward_authorized)
   VALUES($1,$2,$3,'axe-private-pve-154-v1','accepted',false)`,
   [ownerId,characterId,questId]);
  await db.query(`INSERT INTO game3d_private_quest_objective_binding_152
   (owner_id,character_id,quest_id,objective_id,objective_type,
    required_count,status,accepted_at)
   SELECT owner_id,character_id,quest_id,'patrol_kills','kill',3,
    'accepted',accepted_at
   FROM game3d_private_quest_acceptance_154
   WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3`,
   [ownerId,characterId,questId]);
  for(let i=1;i<=3;i++){
   await db.query(`INSERT INTO game3d_private_world_kill_receipt_152
    (receipt_id,owner_id,character_id,instance_id,instance_epoch,
     map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
     server_kill_committed)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'normal',
      'server-committed-private-pve-kill',true)`,
    ['kill-184-0'+i,ownerId,characterId,claim.worldInstanceId,
     claim.worldEpoch,'a'.repeat(64),i,'wolf_'+i]);
  }
  await db.query(`INSERT INTO game3d_private_quest_session_fence_183
    (owner_id,character_id,world_instance_id,world_epoch,
     world_session_id,action_session_id,lease_nonce,active,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,true,
     to_timestamp($8::numeric/1000.0))`,
    [ownerId,characterId,claim.worldInstanceId,claim.worldEpoch,
     claim.serverSessionId,claim.actionSessionId,claim.leaseNonce,
     claim.expiresAtMs]);

  // The random NOLOGIN writer is NOT the issuer/admin. Its only UPDATE
  // privileges are on status/timestamp and immutable row-lock markers.
  await admin.query('GRANT USAGE ON SCHEMA '+quote(schema)+' TO '+quote(role));
  for(const name of [
   'game3d_trusted_character','game3d_private_world_kill_receipt_152',
   'game3d_private_quest_objective_binding_152',
   'game3d_private_quest_kill_credit_152',
   'game3d_private_quest_acceptance_154',
   'game3d_private_quest_turnin_156',
   'game3d_private_quest_session_fence_183',
  ])await admin.query('GRANT SELECT ON '+table(name)+' TO '+quote(role));
  await admin.query('GRANT UPDATE(action_row_lock_176) ON '+
   table('game3d_trusted_character')+' TO '+quote(role));
  await admin.query('GRANT UPDATE(status,updated_at) ON '+
   table('game3d_private_quest_objective_binding_152')+
   ' TO '+quote(role));
  await admin.query('GRANT UPDATE(status,updated_at,action_row_lock_176) ON '+
   table('game3d_private_quest_acceptance_154')+' TO '+quote(role));
  await admin.query('GRANT UPDATE(action_row_lock_183) ON '+
   table('game3d_private_quest_session_fence_183')+' TO '+quote(role));
  await admin.query('GRANT INSERT(receipt_id,owner_id,character_id,quest_id,'+
   'objective_id,reward_authorized) ON '+
   table('game3d_private_quest_kill_credit_152')+' TO '+quote(role));
  await admin.query('GRANT INSERT(owner_id,character_id,quest_id,'+
   'catalog_revision,source_kind,rewards_issued) ON '+
   table('game3d_private_quest_turnin_156')+' TO '+quote(role));

  writerConnections=new pg.Pool({connectionString:url,max:2,
   connectionTimeoutMillis:4000});
  const restricted={async connect(){
   const client=await writerConnections.connect();
   try{
    await client.query('SET ROLE '+quote(role));
    await client.query('SET search_path TO '+quote(schema));
   }catch(e){client.release(true);throw e}
   return {
    query:(...args)=>client.query(...args),
    release(){
     // Do not release a role-switched connection back into the pool
     // until both resets complete. A dedicated client per test call
     // also avoids accidental privilege carry-over.
     void client.query('RESET ROLE').then(()=>
      client.query('RESET search_path')).then(()=>
      client.release()).catch(()=>client.release(true));
    },
   };
  }};
  const ready=await assertGame3DPrivateQuestProgressionReadiness184({
   pool:restricted,schema});
  assert.equal(ready.ok,true);
  const fence=createGame3DQuestTransactionFence183({
   enabled:true,resolveTrustedWorldLease:async()=>claim,
  });
  const transactionFence=(db,q)=>fence.verifyInTransaction(db,{
   ...q,sessionId:claim.actionSessionId,
  });
  const allow=async()=>true;
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool:restricted,authorizeServerOperation:allow,transactionFence,
   sessionFenceMode:'per-quest',
  });
  const turnin=createGame3DPrivateQuestTurnIn156({
   pool:restricted,authorizeServerOperation:allow,transactionFence,
   sessionFenceMode:'per-quest',
  });
  for(let i=1;i<=3;i++){
   const projected=await ledger.project({
    receiptId:'kill-184-0'+i,ownerId,characterId,
   });
   assert.equal(projected.ok,true);
   assert.equal(projected.killCreditCommitted,true);
   assert.equal(projected.rewardAuthorized,false);
  }
  const replay=await ledger.project({
   receiptId:'kill-184-01',ownerId,characterId,
  });
  assert.equal(replay.ok,true);
  assert.equal(replay.killCreditCommitted,false);
  const completed=await turnin.turnIn({ownerId,characterId,questId});
  assert.equal(completed.ok,true);
  assert.equal(completed.creditedDefeats,3);
  assert.equal(completed.rewardsIssued,false);
  assert.equal(completed.rewardSettlementAuthorized,false);
  const again=await turnin.turnIn({ownerId,characterId,questId});
  assert.equal(again.ok,false);
  assert.equal(again.alreadyCompleted,true);
  const dbResult=await db.query(`
   SELECT a.status,a.reward_authorized,t.rewards_issued,
    (SELECT COUNT(*) FROM game3d_private_quest_kill_credit_152 c
     WHERE c.owner_id=a.owner_id AND c.character_id=a.character_id
      AND c.quest_id=a.quest_id) AS credited
   FROM game3d_private_quest_acceptance_154 a
   JOIN game3d_private_quest_turnin_156 t
   USING(owner_id,character_id,quest_id)
   WHERE a.owner_id=$1 AND a.character_id=$2 AND a.quest_id=$3`,
   [ownerId,characterId,questId]);
  assert.equal(dbResult.rowCount,1);
  assert.equal(dbResult.rows[0].credited,'3');
  assert.equal(dbResult.rows[0].status,'completed');
  assert.equal(dbResult.rows[0].reward_authorized,false);
  assert.equal(dbResult.rows[0].rewards_issued,false);

  await db.query(`UPDATE game3d_private_quest_session_fence_183
   SET active=false,revoked_at=clock_timestamp()
   WHERE owner_id=$1 AND character_id=$2 AND world_instance_id=$3`,
   [ownerId,characterId,claim.worldInstanceId]);
  // This is the SAME world lease, now independently revoked.
  const blocked=await ledger.project({
   receiptId:'kill-184-01',ownerId,characterId,
  });
  assert.equal(blocked.ok,false);
  assert.equal(blocked.reason,'transaction_world_session_unverified');
 }finally{
  if(writerConnections)await writerConnections.end();
  if(db)await db.end();
  if(createdSchema)await admin.query('DROP SCHEMA '+quote(schema)+' CASCADE');
  if(createdRole)await admin.query('DROP ROLE '+quote(role));
  await admin.end();
 }
});
