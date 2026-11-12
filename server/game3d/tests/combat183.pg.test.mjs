// REAL PostgreSQL 16 transaction / privilege check, only on disposable DB.
// No default network connections, schema creation, migration or test rewards.
// GAME3D_183_DISPOSABLE_PG_ADMIN_URL + explicit acknowledgement required.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGame3DQuestTransactionFence183,
 assertGame3DQuestSessionFenceReadiness183}
 from '../privateQuestTransactionFence183.mjs';
import {assertGame3DPrivateQuestLeaseIssuerReadiness183}
 from '../privateQuestLeaseIssuer183.mjs';
const url=process.env.GAME3D_183_DISPOSABLE_PG_ADMIN_URL;
const ack=process.env.GAME3D_183_DISPOSABLE_ACK==='I_HAVE_A_DISPOSABLE_PG_INSTANCE';
const enabled=!!url&&ack;
const quote=x=>'"'+x.replaceAll('"','""')+'"';

test('18.3 disposable PG16: row SHARE lock serializes revoke and restricted writer cannot change active session',
 {skip:!enabled,timeout:90000},async()=>{
 const {default:pg}=await import('pg');
 const pool=new pg.Pool({connectionString:url,max:4,
  connectionTimeoutMillis:4000});
 const owner=await pool.connect(),writer=await pool.connect(),
  revoker=await pool.connect(),issuer=await pool.connect();
 const suffix=randomUUID().replaceAll('-','');
 const schema='g3d_183_'+suffix,role='g3d_183_quest_'+suffix,
  issuerRole='g3d_183_issuer_'+suffix;
 let schemaCreated=false,roleCreated=false,issuerRoleCreated=false;
 const ownerId='owner183',characterId='hero183',
  instanceId='instance-183-private',worldEpoch='epoch-183-private',
  serverSession='world-session-183',actionSession='qb174-'+'a'.repeat(64);
 const nonce=randomUUID(),now=Date.now();
 const lease=Object.freeze({ownerId,characterId,worldInstanceId:instanceId,
  worldEpoch,serverSessionId:serverSession,actionSessionId:actionSession,
  leaseNonce:nonce,expiresAtMs:now+45000});
 const request={ownerId,characterId,questId:'axe_q_first_patrol',
  sessionId:actionSession,operation:'accept_private_server_quest'};
 const fence=createGame3DQuestTransactionFence183({
  enabled:true,resolveTrustedWorldLease:async()=>lease});
 const table=quote(schema)+'.game3d_private_quest_session_fence_183';
 try{
  const version=await owner.query('SHOW server_version_num');
  assert(Number(version.rows[0].server_version_num)>=160000);
  await owner.query('CREATE SCHEMA '+quote(schema));schemaCreated=true;
  await owner.query('CREATE ROLE '+quote(role)+' NOLOGIN');roleCreated=true;
  await owner.query('CREATE ROLE '+quote(issuerRole)+' NOLOGIN');
  issuerRoleCreated=true;
  await owner.query('SET search_path TO '+quote(schema));
  const migration=await readFile(new URL(
   '../sql/048_combat183_private_quest_session_fence.sql',import.meta.url),'utf8');
  await owner.query(migration);
  // The issuer readiness gate also probes for forbidden character/quest
  // writes. Create disposable stand-ins, with absolutely NO issuer grants.
  for(const name of ['game3d_trusted_character',
   'game3d_private_quest_acceptance_154',
   'game3d_private_quest_objective_binding_152']){
   await owner.query('CREATE TABLE '+quote(name)+'(owner_id text)');
  }
  await owner.query('RESET search_path');
  await owner.query('GRANT USAGE ON SCHEMA '+quote(schema)+' TO '+quote(role));
  await owner.query('GRANT SELECT ON '+table+' TO '+quote(role));
  await owner.query('GRANT UPDATE(action_row_lock_183) ON '+table+
   ' TO '+quote(role));
  await owner.query('GRANT USAGE ON SCHEMA '+quote(schema)+
   ' TO '+quote(issuerRole));
  await owner.query('GRANT SELECT,INSERT,UPDATE ON '+table+
   ' TO '+quote(issuerRole));
  // This INSERT is from the independent administrator/issuer, never the
  // restricted quest writer whose privilege is checked below.
  await owner.query(`
   INSERT INTO ${table}(owner_id,character_id,world_instance_id,
    world_epoch,world_session_id,action_session_id,lease_nonce,
    active,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,true,to_timestamp($8::numeric/1000.0))
  `,[ownerId,characterId,instanceId,worldEpoch,serverSession,
    actionSession,nonce,lease.expiresAtMs]);
  await writer.query('BEGIN');
  await writer.query('SET LOCAL ROLE '+quote(role));
  await writer.query('SET LOCAL search_path TO '+quote(schema));
  const restricted={connect:async()=>({
   query:(...args)=>writer.query(...args),release(){} })};
  const ready=await assertGame3DQuestSessionFenceReadiness183({
   pool:restricted,schema});
  assert.equal(ready.ok,true);
  await issuer.query('BEGIN');
  await issuer.query('SET LOCAL ROLE '+quote(issuerRole));
  await issuer.query('SET LOCAL search_path TO '+quote(schema));
  const issuePool={connect:async()=>({
   query:(...args)=>issuer.query(...args),release(){},
  })};
  const privateRoles=await assertGame3DPrivateQuestLeaseIssuerReadiness183({
   issuerPool:issuePool,writerPool:restricted,schema,
  });
  assert.equal(privateRoles.ok,true);
  assert.equal(privateRoles.independentIssuerRole,true);
  await issuer.query('SAVEPOINT issuer_no_gameplay_writes');
  await assert.rejects(issuer.query(
   'UPDATE '+quote(schema)+'.game3d_trusted_character SET owner_id=\'forged\''),
   error=>error?.code==='42501');
  await issuer.query('ROLLBACK TO SAVEPOINT issuer_no_gameplay_writes');
  assert.equal(await fence.verifyInTransaction(writer,request),true);
  await writer.query('SAVEPOINT reject_active_update');
  await assert.rejects(writer.query(
   'UPDATE '+table+' SET active=false'),e=>e.code==='42501');
  await writer.query('ROLLBACK TO SAVEPOINT reject_active_update');
  // Revoker must wait for this SAME-row FOR SHARE lock to release. The
  // transaction is not allowed to commit "after" a finished revocation.
  await revoker.query('BEGIN');
  await revoker.query("SET LOCAL lock_timeout='150ms'");
  await assert.rejects(revoker.query('UPDATE '+table+
   ' SET active=false,revoked_at=clock_timestamp()'),e=>e.code==='55P03');
  await revoker.query('ROLLBACK');
  await writer.query('COMMIT');
  const revoked=await revoker.query('UPDATE '+table+
   ' SET active=false,revoked_at=clock_timestamp()');
  assert.equal(revoked.rowCount,1);
  await writer.query('BEGIN');
  await writer.query('SET LOCAL ROLE '+quote(role));
  await writer.query('SET LOCAL search_path TO '+quote(schema));
  assert.equal(await fence.verifyInTransaction(writer,request),false);
  await writer.query('ROLLBACK');
 }finally{
  try{await writer.query('ROLLBACK')}catch{}
  try{await revoker.query('ROLLBACK')}catch{}
  try{await issuer.query('ROLLBACK')}catch{}
  if(schemaCreated)await owner.query('DROP SCHEMA '+quote(schema)+' CASCADE');
  if(roleCreated)await owner.query('DROP ROLE '+quote(role));
  if(issuerRoleCreated)await owner.query('DROP ROLE '+quote(issuerRole));
  owner.release();writer.release();revoker.release();issuer.release();
  await pool.end();
 }
});
