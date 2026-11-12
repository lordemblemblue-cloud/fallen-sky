// 18.4: ACTUAL PostgreSQL 16 only, disposable schema, explicit admin ACK.
// Never configure with a production database or automatic migration runner.
// Skipped by default. No browser route, XP, drops, AGP or reward writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGame3DPrivateWorldObjectiveFence184}
 from '../privateWorldObjectiveFence184.mjs';
import {createGame3DPrivateQuestAcceptance154}
 from '../privateQuestAcceptance154.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestTurnIn156}
 from '../privateQuestTurnIn156.mjs';

const pgUrl=process.env.GAME3D_184_DISPOSABLE_PG_ADMIN_URL;
const acknowledge=process.env.GAME3D_184_DISPOSABLE_ACK===
 'I_HAVE_A_DISPOSABLE_PG_INSTANCE';
const enabled=!!pgUrl&&acknowledge;
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const actor={ownerId:'owner184pg',characterId:'hero184pg'};
const other={ownerId:'owner184pgother',characterId:'hero184pgother'};
const scope={...actor,instanceId:'instance-184-private',
 instanceEpoch:'epoch-184-private'};
const context=Object.freeze({authenticated:'private-world-test-184'});
const questId='axe_q_first_patrol';

test('18.4 disposable PG16: trusted kills count once, session-fenced turn-in commits no rewards',
 {skip:!enabled,timeout:120000},async()=>{
 const {default:pg}=await import('pg');
 const schema='g3d_184_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:pgUrl,max:2,
  connectionTimeoutMillis:5000});
 let pool,created=false;
 try{
  const version=await admin.query('SHOW server_version_num');
  assert(Number(version.rows[0].server_version_num)>=160000);
  await admin.query('CREATE SCHEMA '+quote(schema));created=true;
  pool=new pg.Pool({connectionString:pgUrl,max:8,
   options:'-c search_path='+schema,connectionTimeoutMillis:5000});
  await pool.query(`CREATE TABLE game3d_trusted_character (
   owner_id text NOT NULL,character_id text NOT NULL,
   xp_total bigint NOT NULL DEFAULT 0,revision bigint NOT NULL DEFAULT 0,
   PRIMARY KEY(owner_id,character_id))`);
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'immutable private journal'; END;$$`);
  await pool.query('INSERT INTO game3d_trusted_character(owner_id,character_id,xp_total) VALUES($1,$2,0),($3,$4,0)',
   [actor.ownerId,actor.characterId,other.ownerId,other.characterId]);
  for(const filename of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '048_combat183_private_quest_session_fence.sql',
  ]){
   const sql=await readFile(new URL('../sql/'+filename,import.meta.url),'utf8');
   await pool.query(sql);
  }
  const now=Date.now();
  const lease={
   ownerId:actor.ownerId,characterId:actor.characterId,
   worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
   serverSessionId:'server-world-session-184pg',
   actionSessionId:'qb174-'+'a'.repeat(64),
   leaseNonce:randomUUID(),expiresAtMs:now+60000,
  };
  let worldActive=true;
  const worldStage180={version:'18.0',privateServerOnly:true,
   async resolveCurrentWorldLease183({serverRequestContext}){
    return serverRequestContext===context&&worldActive?{...lease}:null;
   }};
  await pool.query(`
   INSERT INTO game3d_private_quest_session_fence_183
    (owner_id,character_id,world_instance_id,world_epoch,
     world_session_id,action_session_id,lease_nonce,active,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,true,to_timestamp($8::numeric/1000.0))
  `,[actor.ownerId,actor.characterId,scope.instanceId,scope.instanceEpoch,
   lease.serverSessionId,lease.actionSessionId,lease.leaseNonce,lease.expiresAtMs]);
  const gate=createGame3DPrivateWorldObjectiveFence184({
   worldStage180,serverRequestContext:context,scope,enabled:true,
  });
  const auth=async({ownerId,characterId})=>
   ownerId===actor.ownerId&&characterId===actor.characterId;
  const acceptance=createGame3DPrivateQuestAcceptance154({
   pool,authorizeServerOperation:auth,
   transactionFence:gate.verifyInTransaction,
  });
  const credit=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:auth,
   transactionFence:gate.verifyInTransaction,
  });
  const turnin=createGame3DPrivateQuestTurnIn156({
   pool,authorizeServerOperation:auth,
   transactionFence:gate.verifyInTransaction,
  });
  const accepted=await acceptance.accept({...actor,questId});
  assert.equal(accepted.ok,true);assert.equal(accepted.rewardAuthorized,false);
  const insertReceipt=async seq=>{
   const receiptId='worldkill-184-pg-'+seq;
   await pool.query(`
    INSERT INTO game3d_private_world_kill_receipt_152
    (receipt_id,owner_id,character_id,instance_id,instance_epoch,
     map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
     server_kill_committed)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'normal',
     'server-committed-private-pve-kill',true)
   `,[receiptId,actor.ownerId,actor.characterId,scope.instanceId,
    scope.instanceEpoch,'a'.repeat(64),seq,'wolf184_'+seq]);
   return receiptId;
  };
  const first=await insertReceipt(1);
  const projection=await credit.project({...actor,receiptId:first});
  assert.equal(projection.ok,true);
  assert.equal(projection.credited.length,1);
  const replay=await credit.project({...actor,receiptId:first});
  assert.equal(replay.ok,true);
  assert.equal(replay.credited.length,0);
  assert.equal((await turnin.turnIn({...actor,questId})).reason,
   'quest_objectives_incomplete');
  const second=await insertReceipt(2);
  worldActive=false;
  const blocked=await credit.project({...actor,receiptId:second});
  assert.equal(blocked.ok,false);
  assert.equal(blocked.reason,'private_world_objective_session_unverified');
  worldActive=true;
  assert.equal((await credit.project({...actor,receiptId:second})).ok,true);
  const third=await insertReceipt(3);
  assert.equal((await credit.project({...actor,receiptId:third})).ok,true);
  const [a,b]=await Promise.all([
   turnin.turnIn({...actor,questId}),
   turnin.turnIn({...actor,questId,clientReward:999999}),
  ]);
  assert.equal([a,b].filter(x=>x.ok).length,1);
  assert.equal([a,b].filter(x=>x.ok)[0].rewardsIssued,false);
  assert.equal([a,b].filter(x=>!x.ok)[0].alreadyCompleted,true);
  const count=(await pool.query(`
   SELECT COUNT(*)::int AS n FROM game3d_private_quest_turnin_156
   WHERE owner_id=$1 AND character_id=$2`,
   [actor.ownerId,actor.characterId])).rows[0].n;
  assert.equal(count,1);
  assert.equal((await pool.query(`
   SELECT xp_total::text AS xp FROM game3d_trusted_character
   WHERE owner_id=$1 AND character_id=$2`,
   [actor.ownerId,actor.characterId])).rows[0].xp,'0');
  const status=await pool.query(`
   SELECT a.status,a.reward_authorized,t.rewards_issued
   FROM game3d_private_quest_acceptance_154 a
   JOIN game3d_private_quest_turnin_156 t
   USING(owner_id,character_id,quest_id)
   WHERE a.owner_id=$1 AND a.character_id=$2`,
   [actor.ownerId,actor.characterId]);
  assert.equal(status.rows[0].status,'completed');
  assert.equal(status.rows[0].reward_authorized,false);
  assert.equal(status.rows[0].rewards_issued,false);
  await pool.query(`
   UPDATE game3d_private_quest_session_fence_183
   SET active=false,revoked_at=clock_timestamp()
   WHERE owner_id=$1 AND character_id=$2`,
   [actor.ownerId,actor.characterId]);
  assert.equal((await credit.project({...actor,receiptId:third})).ok,false);
  assert.equal((await turnin.turnIn({...actor,questId})).ok,false);
  assert.equal((await credit.project({...other,receiptId:first})).ok,false);
 }finally{
  if(pool)await pool.end();
  if(created)await admin.query('DROP SCHEMA '+quote(schema)+' CASCADE');
  await admin.end();
 }
});
