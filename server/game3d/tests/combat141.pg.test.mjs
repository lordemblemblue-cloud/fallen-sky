// Tests run ONLY against the isolated GitHub Actions PostgreSQL service.
// Existing migration 028-031 SQL is applied verbatim in an ephemeral schema.
// The pre-existing trusted_character foreign-key dependency is supplied as a
// minimal fixture; this does NOT assert the complete 001-027 migration chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGame3DWorldLeaseWriter138}
 from '../worldLeaseWriter138.mjs';
import {createGame3DWorldLeaseReader137}
 from '../worldLeaseRead137.mjs';
import {createGame3DRecoveryStore139,checksumPrivateCheckpoint139}
 from '../privateWorldRecoveryStore139.mjs';
import {createGame3DTrustedSessionAdapter141,digestPrivateWorldBearer141}
 from '../trustedWorldSession141.mjs';

const url=process.env.GAME3D_141_DISPOSABLE_PG_URL;
const scope=(instanceId,epoch='epoch-141-first',holder='holder-141-first')=>({
 instanceId,instanceEpoch:epoch,holderId:holder,
 ownerId:'owner141',characterId:'hero141',mapFingerprint:'a'.repeat(64)
});
const authorizeServerOperation=async()=>true;
const newCheckpoint=s=>({
 schemaVersion:1,instanceId:s.instanceId,ownerId:s.ownerId,
 characterId:s.characterId,mapId:'map-141',
 mapFingerprint:s.mapFingerprint,worldOrigin:{x:0,z:0},
 eventSeq:7,player:{position:{x:0,z:0},hp:80,stamina:90,
  facing:0,lastIntentSeq:0,recent:[]},
 enemies:[],xpAuthorized:false,lootAuthorized:false,
 currencyAuthorized:false,productionReady:false
});

test('14.1 real PostgreSQL: 028-031 lease contention, fence and bearer lifecycle',
 {skip:!url},async(t)=>{
 const {default:pg}=await import('pg');
 const suffix=randomUUID().replaceAll('-','');
 const schema='g3d_private_141_'+suffix;
 const admin=new pg.Pool({connectionString:url,max:2});
 let pool=null;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:url,
   options:'-c search_path='+schema,max:10});
  await pool.query(`
   CREATE TABLE game3d_trusted_character (
    owner_id text NOT NULL,character_id text NOT NULL,
    PRIMARY KEY(owner_id,character_id)
   )
  `);
  await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id) VALUES ('owner141','hero141')`);
  for(const path of [
   '../sql/028_combat137_world_instance_leases.sql',
   '../sql/029_combat138_checkpoint_digest.sql',
   '../sql/030_combat139_world_recovery.sql',
   '../sql/031_combat141_private_world_sessions.sql'
  ]){
   const ddl=await readFile(new URL(path,import.meta.url),'utf8');
   await pool.query(ddl);
  }
  const writer=createGame3DWorldLeaseWriter138({
   pool,authorizeServerOperation});
  const reader=createGame3DWorldLeaseReader137({pool});
  const store=createGame3DRecoveryStore139({pool,authorizeServerOperation});

  await t.test('same-instance simultaneous acquire admits exactly one worker',
   async()=>{
    const instanceId='world-141-concurrent';
    const a=scope(instanceId),b=scope(instanceId,
     'epoch-141-second','holder-141-second');
    const results=await Promise.all([
     writer.acquire({scope:a}),writer.acquire({scope:b})
    ]);
    assert.equal(results.filter(Boolean).length,1);
    const winner=results[0]?a:b;
    const loser=results[0]?b:a;
    assert.equal((await reader.verify(winner)).fencingToken,1);
    assert.equal(await writer.acquire({scope:loser}),null);
   });

  await t.test('real lease renewal, release, new token and stale fencing',
   async()=>{
    const instanceId='world-141-restart';
    const before=scope(instanceId);
    const first=await writer.acquire({scope:before,ttlMs:5000});
    assert.equal(first.fencingToken,1);
    assert.equal((await writer.renew({
     scope:before,fencingToken:1,ttlMs:5000})).fencingToken,1);
    const original=newCheckpoint(before);
    assert.equal(await store.persist({
     scope:before,fencingToken:1,checkpoint:original}),true);
    assert.deepEqual(await store.load({scope:before,fencingToken:1}),
     JSON.parse(checksumPrivateCheckpoint139(original).json));
    assert.equal(await writer.recordCheckpointDigest({
     scope:before,fencingToken:1,eventSeq:7,
     snapshotSha256:checksumPrivateCheckpoint139(original).sha256
    }),true);
    assert.equal(await writer.release({scope:before,fencingToken:1}),true);
    const after=scope(instanceId,
     'epoch-141-restarted','holder-141-restarted');
    const next=await writer.acquire({scope:after});
    assert.equal(next.fencingToken,2);
    assert.equal((await store.load({scope:after,fencingToken:2})).player.hp,80);
    assert.equal(await store.persist({
     scope:before,fencingToken:1,checkpoint:original}),false);
    assert.equal(await writer.recordCheckpointDigest({
     scope:before,fencingToken:1,eventSeq:8,
     snapshotSha256:'b'.repeat(64)
    }),false);
    assert.equal(await writer.renew({scope:before,fencingToken:1}),null);
    assert.equal(await writer.release({scope:before,fencingToken:1}),false);
    const changed={...original,eventSeq:8,
     player:{...original.player,hp:33}};
    assert.equal(await store.persist({
     scope:after,fencingToken:2,checkpoint:changed}),true);
    assert.equal((await store.load({
     scope:after,fencingToken:2})).player.hp,33);
    assert.equal(await writer.recordCheckpointDigest({
     scope:after,fencingToken:2,eventSeq:8,
     snapshotSha256:checksumPrivateCheckpoint139(changed).sha256
    }),true);
   });

  await t.test('real DB disallows scope transfer, corrupt hash and epoch reuse',
   async()=>{
    const id='world-141-identity';
    const firstScope=scope(id),first=await writer.acquire({
     scope:firstScope});
    assert.equal(first.fencingToken,1);
    await assert.rejects(pool.query(`UPDATE game3d_combat_world_instance_lease
     SET owner_id='random-user' WHERE instance_id=$1`,[id]));
    assert.equal(await writer.release({
     scope:firstScope,fencingToken:1}),true);
    assert.equal(await writer.acquire({scope:scope(id,
     'epoch-141-first','holder-141-second')}),null);
   });

  await t.test('opaque bearer is SHA-256 matched with revocation and expiration',
   async()=>{
    const issued=randomBytes(32).toString('base64url');
    const digest=digestPrivateWorldBearer141(issued);
    assert.match(digest,/^[a-f0-9]{64}$/);
    assert.equal(digest,createHash('sha256').update(issued).digest('hex'));
    await pool.query(`INSERT INTO game3d_private_world_session_141
     (token_sha256,owner_id,character_id,expires_at)
     VALUES ($1,$2,$3,clock_timestamp()+interval '2 minutes')`,
     [digest,'owner141','hero141']);
    const resolver=createGame3DTrustedSessionAdapter141({pool});
    const header={headers:{authorization:'Bearer '+issued}};
    const authorized=await resolver.authenticateRequest(header);
    assert.equal(authorized?.accountId,'owner141');
    assert.equal(authorized?.characterId,'hero141');
    assert.equal(await resolver.authenticateRequest({headers:{
     authorization:'Bearer '+randomBytes(32).toString('base64url')
    }}),null);
    assert.equal(await resolver.authenticateRequest({headers:{
     authorization:'Bearer '+issued+'?owner_id=owner2'
    }}),null);
    await pool.query(`UPDATE game3d_private_world_session_141
     SET revoked_at=clock_timestamp() WHERE token_sha256=$1`,[digest]);
    assert.equal(await resolver.authenticateRequest(header),null);
    await pool.query(`UPDATE game3d_private_world_session_141
     SET revoked_at=NULL,expires_at=clock_timestamp()-interval '1 second'
     WHERE token_sha256=$1`,[digest]);
    assert.equal(await resolver.authenticateRequest(header),null);
   });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
