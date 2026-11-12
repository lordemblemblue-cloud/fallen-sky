// 18.7: explicitly opt-in PostgreSQL 16 authenticated reconnect rehearsal.
// Never point the ADMIN URL at a live database. A random disposable schema
// and NOLOGIN projection role are created and dropped in this test only.
// No gameplay rewards or production auth/session endpoints are enabled.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGame3DPrivateQuestReconnect187}
 from '../privateQuestReconnect187.mjs';

const url=process.env.GAME3D_187_DISPOSABLE_PG_ADMIN_URL;
const ack=process.env.GAME3D_187_DISPOSABLE_ACK===
 'I_HAVE_A_DISPOSABLE_PG_INSTANCE';
const quote=x=>'"'+x.replaceAll('"','""')+'"';

test('18.7 disposable PG16 reconnect: consume auth once and refuse revoked/replaced world',
 {skip:!url||!ack,timeout:120000},async()=>{
 const {default:pg}=await import('pg');
 const suffix=randomUUID().replaceAll('-','');
 const schema='g3d_187_'+suffix,role='g3d_187_projection_'+suffix;
 const scope=Object.freeze({
  ownerId:'owner187',characterId:'hero187',
  instanceId:'world-instance-187',instanceEpoch:'world-epoch-187',
  mapFingerprint:'a'.repeat(64),
 });
 const session='qb174-'+'c'.repeat(64),worldSession='world-session-187';
 const serverRequestContext=Object.freeze({trusted:'private-server-187'});
 const live={active:true,nonce:randomUUID(),expiresAtMs:Date.now()+90000};
 const lease=()=>Object.freeze({
  ownerId:scope.ownerId,characterId:scope.characterId,
  worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
  serverSessionId:worldSession,actionSessionId:session,
  leaseNonce:live.nonce,expiresAtMs:live.expiresAtMs,
 });
 const worldStage180={
  version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext:request}){
   return live.active&&request===serverRequestContext?lease():null;
  },
  async resolveQuestTransactionClaim183(request){
   return live.active&&request.ownerId===scope.ownerId&&
    request.characterId===scope.characterId&&
    request.questId==='axe_q_first_patrol'&&
    request.sessionId===session?lease():null;
  },
 };
 const admin=new pg.Pool({
  connectionString:url,max:3,connectionTimeoutMillis:5000,
 });
 let setup=null,projection=null,createdSchema=false,createdRole=false;
 const table=name=>quote(schema)+'.'+quote(name);
 try{
  const version=await admin.query('SHOW server_version_num');
  assert(Number(version.rows[0].server_version_num)>=160000);
  await admin.query('CREATE SCHEMA '+quote(schema));createdSchema=true;
  await admin.query('CREATE ROLE '+quote(role)+' NOLOGIN');
  createdRole=true;
  setup=new pg.Pool({connectionString:url,max:3,
   options:'-c search_path='+schema,connectionTimeoutMillis:5000});
  await setup.query(`
   CREATE TABLE game3d_trusted_character(
    owner_id text NOT NULL,character_id text NOT NULL,
    xp_total bigint NOT NULL DEFAULT 0,
    action_row_lock_176 smallint GENERATED ALWAYS AS (0::smallint) STORED,
    PRIMARY KEY(owner_id,character_id)
   )`);
  await setup.query(`
   CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'immutable private world proof'; END;
   $$`);
  for(const migration of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '048_combat183_private_quest_session_fence.sql',
   '049_combat185_atomic_kill_lease_bindings.sql',
  ]){
   await setup.query(await readFile(new URL('../sql/'+migration,import.meta.url),
    'utf8'));
  }
  await setup.query(`
   ALTER TABLE game3d_private_quest_acceptance_154
   ADD COLUMN action_row_lock_176 smallint
   GENERATED ALWAYS AS (0::smallint) STORED
  `);
  await setup.query(`
   INSERT INTO game3d_trusted_character(owner_id,character_id,xp_total)
   VALUES($1,$2,0)`,[scope.ownerId,scope.characterId]);
  await setup.query(`
   INSERT INTO game3d_private_quest_acceptance_154
    (owner_id,character_id,quest_id,catalog_revision,
     status,reward_authorized)
   VALUES($1,$2,'axe_q_first_patrol','axe-private-pve-154-v1',
    'accepted',false)`,[scope.ownerId,scope.characterId]);
  await setup.query(`
   INSERT INTO game3d_private_quest_objective_binding_152
    (owner_id,character_id,quest_id,objective_id,objective_type,
     required_count,status,accepted_at)
   SELECT owner_id,character_id,quest_id,
    'patrol_kills','kill',3,'accepted',accepted_at
   FROM game3d_private_quest_acceptance_154
   WHERE owner_id=$1 AND character_id=$2
    AND quest_id='axe_q_first_patrol'`,
   [scope.ownerId,scope.characterId]);
  await setup.query(`
   INSERT INTO game3d_private_quest_session_fence_183
    (owner_id,character_id,world_instance_id,world_epoch,
     world_session_id,action_session_id,lease_nonce,active,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,true,
    to_timestamp($8::numeric/1000.0))`,
   [scope.ownerId,scope.characterId,scope.instanceId,scope.instanceEpoch,
    worldSession,session,live.nonce,live.expiresAtMs]);

  // The test administrator seeds already committed 15.3 receipt+18.5 proof
  // ATOMICALLY. An actual 15.3 writer is separately tested by 18.5;
  // this test exclusively exercises crash-safe 15.2 projection recovery.
  const seed=await setup.connect();
  try{
   await seed.query('BEGIN');
   for(let i=1;i<=3;i++){
    const id='worldkill-'+String(i).repeat(64);
    await seed.query(`
     INSERT INTO game3d_private_world_kill_receipt_152
      (receipt_id,owner_id,character_id,instance_id,instance_epoch,
       map_fingerprint,event_seq,enemy_id,enemy_tier,
       source_kind,server_kill_committed)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'normal',
      'server-committed-private-pve-kill',true)`,
     [id,scope.ownerId,scope.characterId,scope.instanceId,
      scope.instanceEpoch,scope.mapFingerprint,i,'wolf'+i]);
    await seed.query(`
     INSERT INTO game3d_private_world_kill_lease_binding_185
      (receipt_id,owner_id,character_id,instance_id,instance_epoch,
       map_fingerprint,event_seq,server_session_id,
       action_session_id,lease_nonce,reward_authorized)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)`,
     [id,scope.ownerId,scope.characterId,scope.instanceId,
      scope.instanceEpoch,scope.mapFingerprint,i,worldSession,
      session,live.nonce]);
   }
   await seed.query('COMMIT');
  }catch(e){await seed.query('ROLLBACK');throw e}
  finally{seed.release()}

  await admin.query('GRANT USAGE ON SCHEMA '+quote(schema)+' TO '+quote(role));
  for(const name of [
   'game3d_trusted_character','game3d_private_world_kill_receipt_152',
   'game3d_private_quest_objective_binding_152',
   'game3d_private_quest_kill_credit_152',
   'game3d_private_quest_acceptance_154',
   'game3d_private_quest_turnin_156',
   'game3d_private_quest_session_fence_183',
   'game3d_private_world_kill_lease_binding_185',
  ])await admin.query('GRANT SELECT ON '+table(name)+' TO '+quote(role));
  await admin.query('GRANT UPDATE(action_row_lock_176) ON '+
   table('game3d_trusted_character')+' TO '+quote(role));
  await admin.query('GRANT UPDATE(status,updated_at) ON '+
   table('game3d_private_quest_objective_binding_152')+
   ' TO '+quote(role));
  await admin.query('GRANT UPDATE(status,updated_at,action_row_lock_176) ON '+
   table('game3d_private_quest_acceptance_154')+' TO '+quote(role));
  await admin.query('GRANT UPDATE(action_row_lock_183) ON '+
   table('game3d_private_quest_session_fence_183')+
   ' TO '+quote(role));
  await admin.query('GRANT INSERT(receipt_id,owner_id,character_id,'+
   'quest_id,objective_id,reward_authorized) ON '+
   table('game3d_private_quest_kill_credit_152')+' TO '+quote(role));
  await admin.query('GRANT INSERT(owner_id,character_id,quest_id,'+
   'catalog_revision,source_kind,rewards_issued) ON '+
   table('game3d_private_quest_turnin_156')+' TO '+quote(role));

  const raw=new pg.Pool({connectionString:url,max:2,
   connectionTimeoutMillis:5000});
  projection={
   async connect(){
    const db=await raw.connect();
    try{
     await db.query('SET ROLE '+quote(role));
     await db.query('SET search_path TO '+quote(schema));
    }catch(e){db.release(true);throw e}
    return {query:(...args)=>db.query(...args),
     // Close the role-switched connection; never recycle its privileges.
     release:()=>db.release(true)};
   },
   end:()=>raw.end(),
  };
  const consumed=new Set();
  const opts={
   enabled:true,worldStage180,serverRequestContext,scope,
   progressionPool:projection,progressionSchema:schema,
   consumeTrustedBase44Reconnect187:async({serverReconnectContext})=>{
    // Test-only server-authoritative one-time Base44 proof.
    const id=serverReconnectContext?.ticketId;
    if(typeof id!=='string'||consumed.has(id))return null;
    consumed.add(id);
    const verified=lease();
    return Object.freeze({
     identitySource:'base44-server-verified-reconnect-187',
     authenticated:true,consumed:true,reconnectId:id,
     ownerId:verified.ownerId,characterId:verified.characterId,
     worldInstanceId:verified.worldInstanceId,
     worldEpoch:verified.worldEpoch,
     worldSessionId:verified.serverSessionId,
     actionSessionId:verified.actionSessionId,
     leaseNonce:verified.leaseNonce,
     expiresAtMs:Math.min(Date.now()+30000,verified.expiresAtMs),
    });
   },
  };
  const reconnectTicket=id=>({
   serverReconnectContext:Object.freeze({ticketId:id}),
  });
  const first=await createGame3DPrivateQuestReconnect187(opts);
  assert.equal(first.publicReconnectRouteInstalled,false);
  assert.equal(first.transportBindingCreated,false);
  const firstId=randomUUID(),secondId=randomUUID();
  const done=await first.reconnect(reconnectTicket(firstId));
  assert.equal(done.ok,true);
  assert.equal(done.authenticatedReconnect,true);
  assert.equal(done.questProgressSynchronized,true);
  assert.equal(done.receiptsScanned,3);
  assert.equal(done.newlyCreditedObjectives,3);
  assert.equal(done.rewardsIssued,false);
  assert.equal(done.resumeCombatAuthorized,false);
  assert.equal(done.worldLeaseRestored,false);
  assert.equal(done.transportBindingCreated,false);
  const replay=await first.reconnect(reconnectTicket(firstId));
  assert.equal(replay.ok,false);
  assert.equal(replay.authenticatedReconnect,false);
  const repeated=await first.reconnect(reconnectTicket(secondId));
  assert.equal(repeated.ok,true);
  assert.equal(repeated.newlyCreditedObjectives,0);
  const credits=await setup.query(`
   SELECT COUNT(*)::int AS n FROM game3d_private_quest_kill_credit_152
   WHERE owner_id=$1 AND character_id=$2`,
   [scope.ownerId,scope.characterId]);
  assert.equal(credits.rows[0].n,3);
  // In-memory 18.0 admission can look live after the independent PG
  // lease issuer has already completed an explicit revocation.
  await setup.query(`
   UPDATE game3d_private_quest_session_fence_183
   SET active=false,revoked_at=clock_timestamp()
   WHERE owner_id=$1 AND character_id=$2 AND world_instance_id=$3`,
   [scope.ownerId,scope.characterId,scope.instanceId]);
  const revoked=await first.reconnect(reconnectTicket(randomUUID()));
  assert.equal(revoked.ok,false);
  assert.equal(revoked.reason,'independent_database_lease_not_active');
  // New nonce is allowed only INSIDE this disposable test schema to
  // confirm 18.7 cannot attach old receipts to a re-paired world.
  await setup.query(`
   UPDATE game3d_private_quest_session_fence_183
   SET active=true,revoked_at=NULL,lease_nonce=$1,
    issued_at=clock_timestamp(),
    expires_at=clock_timestamp()+interval '2 minutes'
   WHERE owner_id=$2 AND character_id=$3 AND world_instance_id=$4`,
   [randomUUID(),scope.ownerId,scope.characterId,scope.instanceId]);
  live.nonce=randomUUID();
  const replaced=await first.reconnect(reconnectTicket(randomUUID()));
  assert.equal(replaced.ok,false);
  assert.equal(replaced.reason,'original_world_session_replaced_or_expired');
  first.shutdown();
  live.active=false;
  await assert.rejects(createGame3DPrivateQuestReconnect187(opts),
   /original active server world/);
 }finally{
  if(projection)await projection.end();
  if(setup)await setup.end();
  if(createdSchema)await admin.query('DROP SCHEMA '+quote(schema)+' CASCADE');
  if(createdRole)await admin.query('DROP ROLE '+quote(role));
  await admin.end();
 }
});
