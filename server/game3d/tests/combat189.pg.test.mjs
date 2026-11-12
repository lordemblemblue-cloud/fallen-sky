// Explicit opt-in, disposable PostgreSQL 16 ONLY. Not a production test.
// Generates an isolated schema and two NOLOGIN roles, validates real PG
// SELECT FOR SHARE + atomic one-use UPDATE and drops every test resource.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGame3DPrivateReconnectTicketLedger188}
 from '../privateReconnectTicketLedger188.mjs';
import {createGame3DQuestWorldPairing180,signGame3DWorldPairing180}
 from '../privateQuestWorldPairing180.mjs';
import {createGame3DPrivateReconnectBackend189}
 from '../privateReconnectBackend189.mjs';

const url=process.env.GAME3D_189_DISPOSABLE_PG_ADMIN_URL;
const ack=process.env.GAME3D_189_DISPOSABLE_ACK===
 'I_HAVE_A_DISPOSABLE_PG_INSTANCE';
const quote=x=>'"'+x.replaceAll('"','""')+'"';

test('18.9 disposable PG16: actual 18.0 signed Base44 pairing resolves one durable ticket per active world',
 {skip:!url||!ack,timeout:120000},async()=>{
 const {default:pg}=await import('pg');
 const suffix=randomUUID().replaceAll('-','');
 const schema='g3d_189_'+suffix;
 const issuerRole='g3d_188_issuer_'+suffix;
 const consumerRole='g3d_188_consumer_'+suffix;
 const ownerId='owner189',characterId='hero189',
  instanceId='world-instance-189',worldEpoch='world-epoch-189',
  worldSessionId='world-session-189';
 const actionSessionId='qb174-'+'a'.repeat(64);
 const originalNonce=randomUUID();
 const trustedContext=Object.freeze({serverWorld:'original-private-189'});
 const backendAuth=Object.freeze({privateBase44:'issuer-auth-189'});
 const backendReconnect=Object.freeze({privateBase44:'consumer-auth-189'});
 const now=Date.now();
 const lease=Object.freeze({
  ownerId,characterId,worldInstanceId:instanceId,
  worldEpoch,serverSessionId:worldSessionId,actionSessionId,
  leaseNonce:originalNonce,expiresAtMs:now+90000,
 });
 const scope=Object.freeze({
  ownerId,characterId,instanceId,instanceEpoch:worldEpoch,
  mapFingerprint:'a'.repeat(64),
 });
 const worldStage180={
  version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return serverRequestContext===trustedContext?lease:null;
  },
 };
 const admin=new pg.Pool({
  connectionString:url,max:3,connectionTimeoutMillis:5000,
 });
 const table=x=>quote(schema)+'.'+quote(x);
 let setup=null,issuer=null,consumer=null;
 let createdSchema=false,createdIssuer=false,createdConsumer=false;
 const backend={currentTicket:null,revoked:false};
 const provisionRole=role=>{
  const raw=new pg.Pool({
   connectionString:url,max:3,connectionTimeoutMillis:5000,
  });
  return {
   async connect(){
    const db=await raw.connect();
    try{
     await db.query('SET ROLE '+quote(role));
     await db.query('SET search_path TO '+quote(schema));
    }catch(error){db.release(true);throw error}
    return {query:(...args)=>db.query(...args),
     release:()=>db.release(true)};
   },
   end:()=>raw.end(),
  };
 };
 let before;
 try{
  const version=await admin.query('SHOW server_version_num');
  assert(Number(version.rows[0].server_version_num)>=160000,
   'Test database must be disposable PostgreSQL 16+');
  await admin.query('CREATE SCHEMA '+quote(schema));createdSchema=true;
  await admin.query('CREATE ROLE '+quote(issuerRole)+' NOLOGIN');
  createdIssuer=true;
  await admin.query('CREATE ROLE '+quote(consumerRole)+' NOLOGIN');
  createdConsumer=true;
  setup=new pg.Pool({connectionString:url,max:3,
   connectionTimeoutMillis:5000,options:'-c search_path='+schema});
  // Minimal *read-only* sentinels for the scope of the readiness audit.
  // These are test tables, not copied player state or gameplay databases.
  for(const name of [
   'game3d_trusted_character',
   'game3d_private_world_kill_receipt_152',
   'game3d_private_world_kill_lease_binding_185',
   'game3d_private_quest_kill_credit_152',
   'game3d_private_quest_acceptance_154',
   'game3d_private_quest_turnin_156',
  ])await setup.query('CREATE TABLE '+quote(name)+
   ' (id bigint PRIMARY KEY)');
  for(const migration of [
   '048_combat183_private_quest_session_fence.sql',
   '050_combat188_durable_reconnect_ticket.sql',
  ])await setup.query(await readFile(new URL(
   '../sql/'+migration,import.meta.url),'utf8'));
  await setup.query(`
   INSERT INTO game3d_private_quest_session_fence_183
   (owner_id,character_id,world_instance_id,world_epoch,
    world_session_id,action_session_id,lease_nonce,active,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,true,
    to_timestamp($8::numeric/1000.0))`,[
   ownerId,characterId,instanceId,worldEpoch,
   worldSessionId,actionSessionId,originalNonce,lease.expiresAtMs,
  ]);
  for(const role of [issuerRole,consumerRole]){
   await admin.query('GRANT USAGE ON SCHEMA '+
    quote(schema)+' TO '+quote(role));
   // No reconnect role needs SELECT access to player/world/quest tables.
   // The 18.8 readiness audit reads pg_catalog to verify these tables
   // have NO gameplay mutation grants, without leaking player records.
   for(const name of [
    'game3d_private_quest_session_fence_183',
    'game3d_private_reconnect_ticket_188',
   ])await admin.query('GRANT SELECT ON '+table(name)+
    ' TO '+quote(role));
   await admin.query('GRANT UPDATE(action_row_lock_183) ON '+
    table('game3d_private_quest_session_fence_183')+
    ' TO '+quote(role));
  }
  await admin.query('GRANT INSERT ON '+
   table('game3d_private_reconnect_ticket_188')+
   ' TO '+quote(issuerRole));
  await admin.query('GRANT UPDATE(consumed_at) ON '+
   table('game3d_private_reconnect_ticket_188')+
   ' TO '+quote(consumerRole));
  issuer=provisionRole(issuerRole);
  consumer=provisionRole(consumerRole);
  before=process.env.GAME3D_PRIVATE_STAGING_ENV;
  process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
  // The actual existing 18.0 pairing verifies both the independent
  // trusted world principal and the Base44 signed one-use challenge.
  const resolveTrustedWorldPrincipal=async ctx=>{
   if(![trustedContext,backendAuth,backendReconnect].includes(ctx)||
      backend.revoked)return null;
   return Object.freeze({authenticated:true,
    identitySource:'trusted-server-session',
    accountId:ownerId,characterId,
    serverSessionId:worldSessionId,expiresAtMs:now+60000});
  };
  const pairing180=createGame3DQuestWorldPairing180({
   enabled:true,scope,secret:'private-189-disposable-signer-do-not-deploy-2026',
   resolveTrustedWorldPrincipal,
   verifyWorldSessionActive:async claim=>
    !backend.revoked&&claim.ownerId===ownerId&&
    claim.characterId===characterId&&claim.instanceId===instanceId&&
    claim.serverSessionId===worldSessionId,
   verifyBase44SessionActive:async claim=>
    !backend.revoked&&claim.ownerId===ownerId&&
    claim.characterId===characterId&&claim.instanceId===instanceId&&
    claim.serverSessionId===worldSessionId&&
    claim.actionSessionId===actionSessionId,
   now:()=>Date.now(),
  });
  const started=await pairing180.begin({
   serverRequestContext:trustedContext,
  });
  assert.equal(started.ok,true);
  const issuedAtMs=Date.now();
  const proof=Object.freeze({
   v:1,purpose:'base44-auth-me-world-pairing-180',
   ownerId,characterId,challenge:started.challenge,
   actionSessionId,issuedAtMs,
   expiresAtMs:Math.min(issuedAtMs+14000,lease.expiresAtMs),
  });
  const signature=signGame3DWorldPairing180(
   'private-189-disposable-signer-do-not-deploy-2026',proof);
  const paired=await pairing180.complete({
   serverRequestContext:trustedContext,proof,signature,
  });
  assert.equal(paired.ok,true);
  const backend189=await createGame3DPrivateReconnectBackend189({
   enabled:true,pairing180,worldStage180,
   serverRequestContext:trustedContext,scope,
   ticketReaderPool:consumer,now:()=>Date.now(),
  });
  const options={
   enabled:true,worldStage180,serverRequestContext:trustedContext,
   scope,issuerPool:issuer,consumerPool:consumer,schema,
   now:()=>Date.now(),
   resolveTrustedBase44Action188:backend189.resolveTrustedBase44Action188,
   resolveTrustedReconnectTicket188:backend189.resolveTrustedReconnectTicket188,
  };
  const a=await createGame3DPrivateReconnectTicketLedger188(options);
  const b=await createGame3DPrivateReconnectTicketLedger188(options);
  const first=await a.issue({serverAuthContext:backendAuth});
  assert.equal(first.ok,true);
  assert.equal(first.credentialsDeliveredToBrowser,false);
  assert.equal(await backend189.storeIssuedReconnectTicket188({
   serverAuthContext:backendAuth,
   ticketId:first.ticketId,expiresAtMs:first.expiresAtMs,
  }),true);
  const consumed=await b.consume({serverReconnectContext:backendReconnect});
  assert.equal(consumed?.consumed,true);
  assert.equal(consumed.identitySource,
   'base44-server-verified-reconnect-187');
  assert.equal(consumed.leaseNonce,originalNonce);
  assert.equal(await a.consume({
   serverReconnectContext:backendReconnect,
  }),null);
  const row=await setup.query(`
   SELECT count(*)::int AS n,
    count(consumed_at)::int AS used
   FROM game3d_private_reconnect_ticket_188`);
  assert.equal(row.rows[0].n,1);
  assert.equal(row.rows[0].used,1);

  // Two distinct worker connections racing for a second original ticket.
  const second=await a.issue({serverAuthContext:backendAuth});
  assert.equal(second.ok,true);
  assert.equal(await backend189.storeIssuedReconnectTicket188({
   serverAuthContext:backendAuth,
   ticketId:second.ticketId,expiresAtMs:second.expiresAtMs,
  }),true);
  const [left,right]=await Promise.all([
   a.consume({serverReconnectContext:backendReconnect}),
   b.consume({serverReconnectContext:backendReconnect}),
  ]);
  assert.equal([left,right].filter(v=>v?.consumed===true).length,1);
  const once=await setup.query(`
   SELECT COUNT(*)::int AS n FROM game3d_private_reconnect_ticket_188
   WHERE ticket_id=$1 AND consumed_at IS NOT NULL`,[second.ticketId]);
  assert.equal(once.rows[0].n,1);
  // Table guard protects identity and prevents consumed_at reset even if
  // an elevated administrator accidentally attempts a dangerous rewrite.
  await assert.rejects(setup.query(`
   UPDATE game3d_private_reconnect_ticket_188
   SET consumed_at=NULL WHERE ticket_id=$1`,[second.ticketId]));
  await assert.rejects(setup.query(`
   DELETE FROM game3d_private_reconnect_ticket_188
   WHERE ticket_id=$1`,[second.ticketId]));

  const unconsumed=await a.issue({serverAuthContext:backendAuth});
  assert.equal(unconsumed.ok,true);
  assert.equal(await backend189.storeIssuedReconnectTicket188({
   serverAuthContext:backendAuth,
   ticketId:unconsumed.ticketId,expiresAtMs:unconsumed.expiresAtMs,
  }),true);
  await setup.query(`
   UPDATE game3d_private_quest_session_fence_183
   SET active=false,revoked_at=clock_timestamp()
   WHERE owner_id=$1 AND character_id=$2 AND world_instance_id=$3`,
   [ownerId,characterId,instanceId]);
  assert.equal(await a.consume({
   serverReconnectContext:backendReconnect,
  }),null);
  const old=await setup.query(`
   SELECT consumed_at FROM game3d_private_reconnect_ticket_188
   WHERE ticket_id=$1`,[unconsumed.ticketId]);
  assert.equal(old.rows[0].consumed_at,null);
  backend.revoked=true;
  assert.equal((await a.issue({serverAuthContext:backendAuth})).ok,false);
  backend189.shutdown();pairing180.shutdown();
  a.shutdown();b.shutdown();
 }finally{
  if(before===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=before;
  if(issuer)await issuer.end();
  if(consumer)await consumer.end();
  if(setup)await setup.end();
  if(createdSchema)await admin.query('DROP SCHEMA '+quote(schema)+' CASCADE');
  if(createdIssuer)await admin.query('DROP ROLE '+quote(issuerRole));
  if(createdConsumer)await admin.query('DROP ROLE '+quote(consumerRole));
  await admin.end();
 }
});
