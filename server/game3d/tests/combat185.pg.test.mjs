// Game 3D 18.5: REAL PostgreSQL 16 rehearsal ONLY on disposable test DB.
// Skips unless BOTH disposable URL and exact opt-in acknowledgement exist.
// Creates random schema and random NOLOGIN roles and drops them after test.
// No production migration, public route, XP, inventory or money grants.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGame3DPrivateWorldKillLeaseBinding185}
 from '../privateWorldKillLeaseBinding185.mjs';
import {assertGame3DPrivateKillLeaseReadiness185}
 from '../privateKillLeaseReadiness185.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {createGame3DQuestTransactionFence183}
 from '../privateQuestTransactionFence183.mjs';

const url=process.env.GAME3D_185_DISPOSABLE_PG_ADMIN_URL;
const acknowledged=process.env.GAME3D_185_DISPOSABLE_ACK===
 'I_HAVE_A_DISPOSABLE_PG_INSTANCE';
const quoted=x=>'"'+x.replaceAll('"','""')+'"';
test('18.5 disposable PG16: old receipts cannot create credits; atomic kill binds to original world nonce',
 {skip:!url||!acknowledged,timeout:120000},async()=>{
 const {default:pg}=await import('pg');
 const suffix=randomUUID().replaceAll('-','');
 const schema='g3d_185_'+suffix,
  writerRole='g3d_185_world_'+suffix,
  creditRole='g3d_185_credit_'+suffix;
 const ownerId='owner185',characterId='hero185',
  instanceId='instance-185-private',instanceEpoch='epoch-185-private',
  mapFingerprint='a'.repeat(64),actionSessionId='qb174-'+'a'.repeat(64);
 const context=Object.freeze({trustedWorld:'185-disposable'});
 const start=Date.now();
 const live={active:true,nonce:randomUUID()};
 const lease=()=>Object.freeze({
  ownerId,characterId,worldInstanceId:instanceId,
  worldEpoch:instanceEpoch,
  serverSessionId:'world-session-185',
  actionSessionId,leaseNonce:live.nonce,
  expiresAtMs:start+90000,
 });
 const scope={instanceId,instanceEpoch,ownerId,characterId,
  mapFingerprint};
 const worldStage180={
  version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return serverRequestContext===context&&live.active?lease():null;
  },
 };
 const admin=new pg.Pool({connectionString:url,max:3,
  connectionTimeoutMillis:4000});
 let pool=null,createdSchema=false,createdWriter=false,
  createdCredit=false;
 const table=name=>quoted(schema)+'.'+quoted(name);
 const rolePool=role=>{
  const raw=new pg.Pool({connectionString:url,max:2,
   connectionTimeoutMillis:4000});
  return {
   async connect(){
    const db=await raw.connect();
    try{
     await db.query('SET ROLE '+quoted(role));
     await db.query('SET search_path TO '+quoted(schema));
    }catch(e){db.release(true);throw e}
    return {query:(...args)=>db.query(...args),
     release:()=>db.release(true)};
   },
   end:()=>raw.end(),
  };
 };
 let writer=null,credit=null;
 try{
  const version=await admin.query('SHOW server_version_num');
  assert(Number(version.rows[0].server_version_num)>=160000);
  await admin.query('CREATE SCHEMA '+quoted(schema));
  createdSchema=true;
  await admin.query('CREATE ROLE '+quoted(writerRole)+' NOLOGIN');
  createdWriter=true;
  await admin.query('CREATE ROLE '+quoted(creditRole)+' NOLOGIN');
  createdCredit=true;
  pool=new pg.Pool({connectionString:url,max:4,
   options:'-c search_path='+schema,connectionTimeoutMillis:4000});
  await pool.query(`
   CREATE TABLE game3d_trusted_character(
    owner_id text NOT NULL,character_id text NOT NULL,
    xp_total bigint NOT NULL DEFAULT 0,
    action_row_lock_176 smallint GENERATED ALWAYS AS(0::smallint) STORED,
    PRIMARY KEY(owner_id,character_id)
   )`);
  await pool.query(`
   CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'immutable private receipt'; END;
   $$`);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '048_combat183_private_quest_session_fence.sql',
   '049_combat185_atomic_kill_lease_bindings.sql',
  ]){
   const sql=await readFile(new URL('../sql/'+file,import.meta.url),'utf8');
   await pool.query(sql);
  }
  await pool.query('INSERT INTO game3d_trusted_character(owner_id,character_id) VALUES($1,$2)',
   [ownerId,characterId]);
  await pool.query(`
   INSERT INTO game3d_private_quest_acceptance_154
    (owner_id,character_id,quest_id,catalog_revision,
     status,reward_authorized)
   VALUES($1,$2,'axe_q_first_patrol','axe-private-pve-154-v1',
    'accepted',false)`,[ownerId,characterId]);
  await pool.query(`
   INSERT INTO game3d_private_quest_objective_binding_152
    (owner_id,character_id,quest_id,objective_id,
     objective_type,required_count,status,accepted_at)
   SELECT owner_id,character_id,quest_id,
    'patrol_kills','kill',1,'accepted',accepted_at
   FROM game3d_private_quest_acceptance_154
   WHERE owner_id=$1 AND character_id=$2
    AND quest_id='axe_q_first_patrol'`,[ownerId,characterId]);
  await pool.query(`
   INSERT INTO game3d_private_quest_session_fence_183
    (owner_id,character_id,world_instance_id,world_epoch,
     world_session_id,action_session_id,lease_nonce,active,expires_at)
   VALUES($1,$2,$3,$4,'world-session-185',$5,$6,true,
    to_timestamp($7::numeric/1000.0))`,
   [ownerId,characterId,instanceId,instanceEpoch,
    actionSessionId,live.nonce,lease().expiresAtMs]);

  for(const role of [writerRole,creditRole]){
   await admin.query('GRANT USAGE ON SCHEMA '+quoted(schema)+
    ' TO '+quoted(role));
   for(const name of [
    'game3d_private_world_kill_receipt_152',
    'game3d_private_world_kill_lease_binding_185',
    'game3d_private_quest_kill_credit_152',
    'game3d_private_quest_turnin_156',
    'game3d_trusted_character',
    'game3d_private_quest_objective_binding_152',
    'game3d_private_quest_acceptance_154',
    'game3d_private_quest_session_fence_183',
   ])await admin.query('GRANT SELECT ON '+table(name)+
    ' TO '+quoted(role));
  }
  await admin.query('GRANT INSERT ON '+
   table('game3d_private_world_kill_receipt_152')+
   ' TO '+quoted(writerRole));
  await admin.query('GRANT INSERT ON '+
   table('game3d_private_world_kill_lease_binding_185')+
   ' TO '+quoted(writerRole));
  for(const role of [writerRole,creditRole]){
   await admin.query('GRANT UPDATE(action_row_lock_183) ON '+
    table('game3d_private_quest_session_fence_183')+
    ' TO '+quoted(role));
  }
  await admin.query('GRANT INSERT(receipt_id,owner_id,character_id,'+
   'quest_id,objective_id,reward_authorized) ON '+
   table('game3d_private_quest_kill_credit_152')+
   ' TO '+quoted(creditRole));
  await admin.query('GRANT UPDATE(status) ON '+
   table('game3d_private_quest_objective_binding_152')+
   ' TO '+quoted(creditRole));

  writer=rolePool(writerRole);
  credit=rolePool(creditRole);
  const roles=await assertGame3DPrivateKillLeaseReadiness185({
   worldKillPool:writer,progressionPool:credit,schema,
  });
  assert.equal(roles.ok,true);
  const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
  process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
  try{
   const binding=createGame3DPrivateWorldKillLeaseBinding185({
    worldStage180,scope,serverRequestContext:context,
    now:()=>start,enabled:true,
   });
   const id='worldkill-'+'b'.repeat(64);
   const record={receiptId:id,ownerId,characterId,
    instanceId,instanceEpoch,mapFingerprint,eventSeq:1};
   // A bare 15.2 receipt cannot pass the 18.5 credit FK.
   const direct=await writer.connect();
   try{
    await direct.query('BEGIN');
    await direct.query(`
     INSERT INTO game3d_private_world_kill_receipt_152
      (receipt_id,owner_id,character_id,instance_id,
       instance_epoch,map_fingerprint,event_seq,enemy_id,
       enemy_tier,source_kind,server_kill_committed)
     VALUES($1,$2,$3,$4,$5,$6,1,'wolf_185','normal',
      'server-committed-private-pve-kill',true)`,
     [id,ownerId,characterId,instanceId,instanceEpoch,mapFingerprint]);
    const permission=await binding.bindCommittedKill185(direct,record);
    assert.equal(permission,true);
    await direct.query('COMMIT');
   }catch(error){
    await direct.query('ROLLBACK');throw error;
   }finally{direct.release()}
   const fence=createGame3DQuestTransactionFence183({
    enabled:true,now:()=>start,
    resolveTrustedWorldLease:async()=>live.active?lease():null,
   });
   const ledger=createGame3DPrivateCommittedQuestCredits152({
    pool:credit,authorizeServerOperation:async()=>true,
    verifyCommittedReceipt185:binding.verifyCommittedReceipt185,
    transactionFence:(db,claim)=>fence.verifyInTransaction(db,{
     ...claim,sessionId:lease().actionSessionId,
    }),
   });
   const success=await ledger.project({
    receiptId:id,ownerId,characterId,
   });
   assert.equal(success.ok,true);
   assert.equal(success.killCreditCommitted,true);
   assert.equal(success.rewardAuthorized,false);
   const replay=await ledger.project({receiptId:id,ownerId,characterId});
   assert.equal(replay.ok,true);
   assert.equal(replay.killCreditCommitted,false);
   const count=await pool.query(`
    SELECT count(*)::int AS n FROM game3d_private_quest_kill_credit_152
    WHERE owner_id=$1 AND character_id=$2`,[ownerId,characterId]);
   assert.equal(count.rows[0].n,1);
   // Even an elevated direct SQL attempt cannot credit a legacy receipt
   // unless its original session binding was committed first.
   const orphan='worldkill-'+'d'.repeat(64);
   await pool.query(`
    INSERT INTO game3d_private_world_kill_receipt_152
     (receipt_id,owner_id,character_id,instance_id,
      instance_epoch,map_fingerprint,event_seq,enemy_id,
      enemy_tier,source_kind,server_kill_committed)
    VALUES($1,$2,$3,$4,$5,$6,2,'wolf_185_b','normal',
     'server-committed-private-pve-kill',true)`,
    [orphan,ownerId,characterId,instanceId,instanceEpoch,mapFingerprint]);
   await assert.rejects(pool.query(`
    INSERT INTO game3d_private_quest_kill_credit_152
     (receipt_id,owner_id,character_id,quest_id,
      objective_id,reward_authorized)
    VALUES($1,$2,$3,'axe_q_first_patrol','patrol_kills',false)`,
    [orphan,ownerId,characterId]),error=>error?.code==='23503');
   const afterOrphan=await pool.query(`
    SELECT count(*)::int AS n FROM game3d_private_quest_kill_credit_152
    WHERE owner_id=$1 AND character_id=$2`,[ownerId,characterId]);
   assert.equal(afterOrphan.rows[0].n,1);
   await assert.rejects(pool.query(`
    UPDATE game3d_private_world_kill_lease_binding_185
    SET action_session_id=$1 WHERE receipt_id=$2`,
    ['qb174-'+'d'.repeat(64),id]));
   // The SAME Base44 action ID with a NEW world lease nonce does not
   // retroactively make the historical receipt part of the new session.
   const rotated=randomUUID();
   await pool.query(`
    UPDATE game3d_private_quest_session_fence_183
    SET lease_nonce=$1,issued_at=clock_timestamp(),
     expires_at=clock_timestamp()+interval '2 minutes'
    WHERE owner_id=$2 AND character_id=$3
     AND world_instance_id=$4`,
    [rotated,ownerId,characterId,instanceId]);
   live.nonce=rotated;
   const denied=await ledger.project({receiptId:id,ownerId,characterId});
   assert.equal(denied.ok,false);
   assert.equal(denied.reason,'committed_kill_session_binding_missing');
   binding.shutdown();
  }finally{
   if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
   else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
  }
 }finally{
  if(writer)await writer.end();
  if(credit)await credit.end();
  if(pool)await pool.end();
  if(createdSchema)await admin.query('DROP SCHEMA '+quoted(schema)+' CASCADE');
  if(createdWriter)await admin.query('DROP ROLE '+quoted(writerRole));
  if(createdCredit)await admin.query('DROP ROLE '+quoted(creditRole));
  await admin.end();
 }
});
