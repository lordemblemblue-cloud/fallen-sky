// EXPLICITLY OPT-IN: disposable localhost PostgreSQL 16 only.
// Creates and drops its own dedicated schema and NOLOGIN read role.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createPrivatePgLeaseGuard303} from '../privatePgLeaseGuard303.mjs';

const url=process.env.GAME3D_312_DISPOSABLE_PG_ADMIN_URL;
const ack=process.env.GAME3D_312_DISPOSABLE_ACK==='I_HAVE_A_DISPOSABLE_PG16';
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const permitted=()=>{
 if(!url||!ack)return false;
 let parsed;try{parsed=new URL(url)}catch{return false}
 return parsed.protocol==='postgresql:'&&
   ['localhost','127.0.0.1'].includes(parsed.hostname)&&
   parsed.pathname==='/game3d_312_disposable';
};
test('31.2 real disposable PG16 read-only lease, revocation and lock timeouts',
 {skip:!url&&!ack,timeout:120000},async()=>{
 assert.equal(permitted(),true,'refuse non-loopback, non-disposable PostgreSQL URL');
 process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
 const {default:pg}=await import('pg');
 const suffix=randomUUID().replaceAll('-','');
 const schema='g3d_312_'+suffix;
 const readerRole='g3d_312_reader_'+suffix;
 const table=quote(schema)+'.'+quote('game3d_private_quest_session_fence_183');
 const admin=new pg.Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
 let schemaCreated=false,roleCreated=false;
 let setup=null,reader=null,guard=null;
 const now=Date.now();
 const scope={ownerId:'owner312pg',characterId:'hero312pg',
  instanceId:'world-instance-312pg',instanceEpoch:'world-epoch-312pg',
  mapFingerprint:'d'.repeat(64)};
 const nonce=randomUUID(),action='qb174-'+'a'.repeat(64);
 const original={original:'world-312pg'};
 const lease=()=>({ownerId:scope.ownerId,characterId:scope.characterId,
  worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
  serverSessionId:'world-session-312pg',actionSessionId:action,
  leaseNonce:nonce,expiresAtMs:now+90000});
 const stage={version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return serverRequestContext===original?lease():null}};
 const pairing={version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveTrustedWorldPrincipal(){return null},
  async resolveVerifiedBase44ActionSession(){return null},
  async verifySessionActive(){return false}};
 const connectRestricted=()=>{
  const raw=new pg.Pool({connectionString:url,max:3,connectionTimeoutMillis:3000});
  return {async connect(){const db=await raw.connect();
   try{
    await db.query('SET ROLE '+quote(readerRole));
    await db.query('SET search_path TO '+quote(schema));
   }catch(error){db.release(true);throw error}
   return {query:(...args)=>db.query(...args),release:()=>db.release(true)};
  },end:()=>raw.end()};
 };
 try{
  const version=await admin.query('SHOW server_version_num');
  assert(Number(version.rows[0].server_version_num)>=160000,'PG16 required');
  await admin.query('CREATE SCHEMA '+quote(schema));schemaCreated=true;
  await admin.query('CREATE ROLE '+quote(readerRole)+' NOLOGIN');roleCreated=true;
  setup=new pg.Pool({connectionString:url,max:2,connectionTimeoutMillis:3000,
   options:'-c search_path='+schema});
  const ddl=await readFile(new URL('../sql/048_combat183_private_quest_session_fence.sql',import.meta.url),'utf8');
  await setup.query(ddl);
  const l=lease();
  await setup.query('INSERT INTO game3d_private_quest_session_fence_183 '+
   '(owner_id,character_id,world_instance_id,world_epoch,world_session_id, '+
   'action_session_id,lease_nonce,active,expires_at) '+
   'VALUES ($1,$2,$3,$4,$5,$6,$7,true,to_timestamp($8::numeric/1000.0))',[
    l.ownerId,l.characterId,l.worldInstanceId,l.worldEpoch,l.serverSessionId,
    l.actionSessionId,l.leaseNonce,l.expiresAtMs,
   ]);
  await admin.query('GRANT USAGE ON SCHEMA '+quote(schema)+' TO '+quote(readerRole));
  await admin.query('GRANT SELECT ON '+table+' TO '+quote(readerRole));
  await admin.query('GRANT UPDATE(action_row_lock_183) ON '+table+' TO '+quote(readerRole));
  reader=connectRestricted();
  guard=await createPrivatePgLeaseGuard303({enabled:true,pool:reader,schema,
   scope,serverRequestContext:original,worldStage180:stage,pairing180:pairing,
   now:Date.now,lockTimeoutMs:100,statementTimeoutMs:1500});
  assert.equal(await guard.verify(),true);
  // Original role cannot change active, expiry, original world nonce, etc.
  const c=await reader.connect();
  try{await assert.rejects(c.query('UPDATE '+table+' SET active=false'))}
  finally{c.release()}
  // SELECT FOR SHARE must be blocked by a concurrent revocation lock.
  const writer=await setup.connect();
  try{
   await writer.query('BEGIN');
   await writer.query('UPDATE game3d_private_quest_session_fence_183 SET active=false,revoked_at=clock_timestamp()');
   assert.equal(await guard.verify(),false,'READ should time out on locked revocation');
   await writer.query('COMMIT');
  }catch(e){try{await writer.query('ROLLBACK')}catch{}throw e}
  finally{writer.release()}
  assert.equal(await guard.verify(),false,'revoked PG row must be rejected');
  guard.shutdown();guard=null;
 }finally{
  try{guard?.shutdown()}catch{}
  try{await reader?.end()}catch{}
  try{await setup?.end()}catch{}
  if(schemaCreated)try{await admin.query('DROP SCHEMA '+quote(schema)+' CASCADE')}catch{}
  if(roleCreated)try{await admin.query('DROP ROLE '+quote(readerRole))}catch{}
  await admin.end();
 }
});
