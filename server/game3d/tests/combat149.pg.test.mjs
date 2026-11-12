import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGame3DWorldSeedProvisioner148}
 from '../trustedWorldSeedProvisioner148.mjs';
import {createGame3DPrivateSessionAuthority149,
 createGame3DTrustedSessionAdapter149,
 createGame3DPrivateWorldBootstrap149}
 from '../trustedWorldSessions149.mjs';
import {digestPrivateWorldBearer141}
 from '../trustedWorldSession141.mjs';

const url=process.env.GAME3D_141_DISPOSABLE_PG_URL;
const origin='http://127.0.0.1:5173';
const ownerId='owner149',characterId='hero149';
const request=async(port,route,bearer,payload={})=>{
 const res=await fetch(`http://127.0.0.1:${port}/private-game3d/140/${route}`,{
  method:'POST',
  headers:{'content-type':'application/json',origin,
   authorization:'Bearer '+bearer},
  body:JSON.stringify(payload),
 });
 return {status:res.status,body:await res.json()};
};
test('14.9 real PostgreSQL: issue, rotate, cross-world denial, expiry, revoke and gateway',
 {skip:!url,timeout:120000},async()=>{
 const {default:pg}=await import('pg');
 const schema='g3d_sess_149_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url,max:2});
 let pool=null,gateA=null,gateB=null;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:url,max:8,
   options:'-c search_path='+schema});
  await pool.query(`CREATE TABLE game3d_trusted_character(
   owner_id text NOT NULL,character_id text NOT NULL,
   revision bigint NOT NULL DEFAULT 4,
   xp_total bigint NOT NULL DEFAULT 100,
   PRIMARY KEY(owner_id,character_id))`);
  await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id) VALUES ($1,$2)`,[ownerId,characterId]);
  for(const name of [
   '028_combat137_world_instance_leases.sql',
   '029_combat138_checkpoint_digest.sql',
   '030_combat139_world_recovery.sql',
   '031_combat141_private_world_sessions.sql',
   '032_combat142_trusted_world_seeds.sql',
   '033_combat143_character_sheet_binding.sql',
   '034_combat149_instance_bound_sessions.sql',
  ])await pool.query(await readFile(new URL(
   '../sql/'+name,import.meta.url),'utf8'));
  let serial=0;
  const provisioner=createGame3DWorldSeedProvisioner148({
   pool,makeInstanceId:()=> 'world-149-pg-'+(++serial),
   authorizeTrustedProvision:async action=>
    action.ownerId===ownerId&&action.characterId===characterId,
  });
  const first=await provisioner.provision({ownerId,characterId});
  const second=await provisioner.provision({
   ownerId,characterId,blueprintId:'wolfveil-elite-v1'});
  assert.notEqual(first.instanceId,second.instanceId);
  const allowed=new Set([first.instanceId,second.instanceId]);
  const issuer=createGame3DPrivateSessionAuthority149({
   pool,authorizeTrustedSession:async action=>
    action.ownerId===ownerId&&action.characterId===characterId&&
    allowed.has(action.instanceId),
  });
  const authFor=scope=>createGame3DTrustedSessionAdapter149({pool,scope});
  const scopeA={...first,instanceEpoch:'epoch-149-first',
   holderId:'holder-149-first'};
  const scopeB={...second,instanceEpoch:'epoch-149-other',
   holderId:'holder-149-other'};
  const legacy=randomBytes(32).toString('base64url');
  await pool.query(`INSERT INTO game3d_private_world_session_141
   (token_sha256,owner_id,character_id,expires_at)
   VALUES ($1,$2,$3,clock_timestamp()+interval '5 minutes')`,
   [digestPrivateWorldBearer141(legacy),ownerId,characterId]);
  assert.equal(await authFor(scopeA).authenticateRequest({
   headers:{authorization:'Bearer '+legacy}}),null);
  const firstIssued=await issuer.issue({
   ownerId,characterId,instanceId:first.instanceId,ttlSeconds:180});
  assert.equal(firstIssued.ok,true);
  assert.equal(firstIssued.token.length,43);
  assert.equal(firstIssued.rewardsIssued,false);
  const row=await pool.query(`SELECT token_sha256,world_instance_id,
   owner_id,character_id,revoked_at
   FROM game3d_private_world_session_141
   WHERE token_sha256=$1`,[firstIssued.tokenSha256]);
  assert.equal(row.rowCount,1);
  assert.equal(row.rows[0].world_instance_id,first.instanceId);
  assert.equal(row.rows[0].owner_id,ownerId);
  assert.equal(row.rows[0].revoked_at,null);
  assert.equal(await authFor(scopeB).authenticateRequest({
   headers:{authorization:'Bearer '+firstIssued.token}}),null);
  gateA=await createGame3DPrivateWorldBootstrap149({
   pool,scope:scopeA,allowedOrigins:[origin],
   authorizeServerOperation:async()=>true,
   randomRoll:()=>.99,leaseMs:10000,
  });
  assert.equal(gateA.version,'14.9');
  assert.equal(gateA.loopbackOnly,true);
  assert.equal(gateA.instanceBoundBearerRequired,true);
  assert.equal(gateA.publicHTTPInstalled,false);
  const addrA=await gateA.listen({port:0});
  assert.equal(addrA.host,'127.0.0.1');
  assert.equal((await request(addrA.port,'connect',legacy)).status,401);
  assert.equal((await request(addrA.port,'connect',
   'untrusted'.repeat(8))).status,401);
  const connected=await request(addrA.port,'connect',firstIssued.token);
  assert.equal(connected.status,200);
  assert.equal(connected.body.ok,true);
  assert.equal(connected.body.rewardsIssued,false);
  const connectionId=connected.body.connectionId;
  assert.equal(typeof connectionId,'string');
  const input=await request(addrA.port,'input',firstIssued.token,{
   connectionId,input:{seq:1,x:0,z:0,facing:0}});
  assert.equal(input.status,200);
  const other=await issuer.issue({
   ownerId,characterId,instanceId:second.instanceId,ttlSeconds:180});
  assert.equal(await authFor(scopeA).authenticateRequest({
   headers:{authorization:'Bearer '+other.token}}),null);
  // Issuing for a different world does not revoke the first world's token.
  assert.equal((await request(addrA.port,'poll',firstIssued.token,{
   connectionId,afterSeq:connected.body.cursor})).status,200);
  gateB=await createGame3DPrivateWorldBootstrap149({
   pool,scope:scopeB,allowedOrigins:[origin],
   authorizeServerOperation:async()=>true,
   randomRoll:()=>.99,leaseMs:10000,
  });
  const addrB=await gateB.listen({port:0});
  assert.equal((await request(addrB.port,'connect',firstIssued.token)).status,401);
  assert.equal((await request(addrB.port,'connect',other.token)).status,200);
  const replacement=await issuer.issue({
   ownerId,characterId,instanceId:first.instanceId,ttlSeconds:180});
  assert.notEqual(replacement.token,firstIssued.token);
  assert.equal((await request(addrA.port,'connect',firstIssued.token)).status,401);
  assert.equal((await request(addrA.port,'connect',replacement.token)).status,200);
  assert.equal((await request(addrB.port,'connect',other.token)).status,200);
  await pool.query(`UPDATE game3d_private_world_session_141
   SET expires_at=clock_timestamp()-interval '1 second'
   WHERE token_sha256=$1`,[replacement.tokenSha256]);
  assert.equal((await request(addrA.port,'connect',replacement.token)).status,401);
  const fresh=await issuer.issue({
   ownerId,characterId,instanceId:first.instanceId});
  assert.equal((await request(addrA.port,'connect',fresh.token)).status,200);
  const revoked=await issuer.revoke({
   ownerId,characterId,instanceId:first.instanceId,
   tokenSha256:fresh.tokenSha256});
  assert.equal(revoked.ok,true);
  assert.equal(revoked.revokedCount,1);
  assert.equal((await request(addrA.port,'connect',fresh.token)).status,401);
  const stillB=await request(addrB.port,'connect',other.token);
  assert.equal(stillB.status,200);
  // A server-side character revision change invalidates every old world token.
  await pool.query(`UPDATE game3d_trusted_character SET
   revision=revision+1 WHERE owner_id=$1 AND character_id=$2`,
   [ownerId,characterId]);
  assert.equal((await request(addrB.port,'connect',other.token)).status,401);
  await assert.rejects(issuer.issue({
   ownerId,characterId,instanceId:first.instanceId}),
   /sealed_world_or_character_unavailable/);
  assert.equal((await pool.query(`SELECT count(*)::int AS n
   FROM game3d_private_world_session_141
   WHERE world_instance_id=$1 AND revoked_at IS NULL`,
   [first.instanceId])).rows[0].n,0);
 }finally{
  if(gateB)await gateB.close();
  if(gateA)await gateA.close();
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
