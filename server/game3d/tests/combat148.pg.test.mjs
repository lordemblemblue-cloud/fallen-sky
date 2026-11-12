// Combat 14.8 trusted seed creation against disposable PostgreSQL 16 only.
// The existing 14.3 private world bootstrap consumes the same created seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGame3DWorldSeedProvisioner148}
 from '../trustedWorldSeedProvisioner148.mjs';
import {createGame3DPrivateWorldBootstrap143}
 from '../privateWorldBootstrap143.mjs';
import {createGame3DTrustedWorldSeedReader142}
 from '../trustedWorldSeed142.mjs';
import {createGame3DTrustedCombatSheetReader143}
 from '../trustedCombatSheet143.mjs';
import {createWolfveilMapCollision,WOLFVEIL_MAP_FINGERPRINT}
 from '../mapCollision.mjs';
import {digestPrivateWorldBearer141}
 from '../trustedWorldSession141.mjs';

const url=process.env.GAME3D_141_DISPOSABLE_PG_URL;
test('14.8 privileged PG seed is immutable, unique, revision-bound and boots 14.3',
 {skip:!url,timeout:120000},async()=>{
 const {default:pg}=await import('pg');
 const schema='g3d_prov148_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url,max:2});
 let pool=null,gateway=null;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:url,max:8,
   options:'-c search_path='+schema});
  await pool.query(`CREATE TABLE game3d_trusted_character(
   owner_id text NOT NULL,character_id text NOT NULL,
   revision bigint NOT NULL DEFAULT 4,
   xp_total bigint NOT NULL DEFAULT 100,
   PRIMARY KEY(owner_id,character_id))`);
  await pool.query(`INSERT INTO game3d_trusted_character(
   owner_id,character_id) VALUES ('owner148','hero148')`);
  for(const name of [
   '028_combat137_world_instance_leases.sql',
   '029_combat138_checkpoint_digest.sql',
   '030_combat139_world_recovery.sql',
   '031_combat141_private_world_sessions.sql',
   '032_combat142_trusted_world_seeds.sql',
   '033_combat143_character_sheet_binding.sql',
  ])await pool.query(await readFile(new URL(
   '../sql/'+name,import.meta.url),'utf8'));
  let serial=0;
  const create=(makeInstanceId=()=> 'world-148-pg-'+(++serial))=>
   createGame3DWorldSeedProvisioner148({
    pool,makeInstanceId,
    authorizeTrustedProvision:async action=>
     action.ownerId==='owner148'&&action.characterId==='hero148',
   });
  const provisioner=create();
  const p=await provisioner.provision({
   ownerId:'owner148',characterId:'hero148'});
  assert.equal(p.level,2);
  assert.equal(p.characterRevision,4);
  assert.equal(p.rewardsIssued,false);
  const r=await pool.query(`SELECT instance_id,actors_json,character_revision,
   source_kind,sealed FROM game3d_private_world_seed_142
   WHERE instance_id=$1`,[p.instanceId]);
  assert.equal(r.rowCount,1);
  assert.equal(r.rows[0].sealed,true);
  assert.equal(r.rows[0].source_kind,'trusted_server_world_provisioner');
  assert.equal(String(r.rows[0].character_revision),'4');
  assert.equal(r.rows[0].actors_json.player.hp,
   r.rows[0].actors_json.player.stats.maxHP);
  await assert.rejects(pool.query(`UPDATE game3d_private_world_seed_142
   SET character_revision=123 WHERE instance_id=$1`,[p.instanceId]),
   /immutable/);
  await assert.rejects(pool.query(`DELETE FROM game3d_private_world_seed_142
   WHERE instance_id=$1`,[p.instanceId]),/immutable/);
  const competing=create(()=>p.instanceId);
  const attempts=await Promise.allSettled([
   competing.provision({ownerId:'owner148',characterId:'hero148'}),
   competing.provision({ownerId:'owner148',characterId:'hero148'}),
  ]);
  assert.ok(attempts.every(x=>x.status==='rejected'));
  assert.equal((await pool.query(`SELECT count(*)::int AS n
   FROM game3d_private_world_seed_142`)).rows[0].n,1);
  const seed=await createGame3DTrustedWorldSeedReader142({pool})
   .read({scope:p,map:createWolfveilMapCollision()});
  assert.equal(seed.enemies.length,1);
  assert.equal(seed.trustedSeedRevision,1);
  const progress=await createGame3DTrustedCombatSheetReader143({pool})
   .read({scope:p,seedRevision:1});
  assert.equal(progress.level,p.level);
  assert.equal(progress.characterRevision,p.characterRevision);
  const bearer=randomBytes(32).toString('base64url');
  await pool.query(`INSERT INTO game3d_private_world_session_141
   (token_sha256,owner_id,character_id,expires_at)
   VALUES ($1,$2,$3,clock_timestamp()+interval '10 minutes')`,
   [digestPrivateWorldBearer141(bearer),'owner148','hero148']);
  const scope={...p,instanceEpoch:'epoch-148-first',
   holderId:'holder-148-first'};
  gateway=await createGame3DPrivateWorldBootstrap143({
   pool,scope,authorizeServerOperation:async()=>true,
   allowedOrigins:['http://127.0.0.1:5173'],
   randomRoll:()=>.99,leaseMs:10000,
  });
  assert.equal(gateway.version,'14.3');
  const address=await gateway.listen({port:0});
  const response=await fetch(`http://127.0.0.1:${address.port}/private-game3d/140/connect`,{
   method:'POST',headers:{
    'content-type':'application/json',
    origin:'http://127.0.0.1:5173',
    authorization:'Bearer '+bearer,
   },body:'{}',
  });
  assert.equal(response.status,200);
  const connected=await response.json();
  assert.equal(connected.ok,true);
  assert.equal(connected.snapshot.player.hp,seed.player.hp);
  assert.equal(connected.snapshot.enemies[0].hp,seed.enemies[0].hp);
  assert.equal(connected.rewardsIssued,false);
  await gateway.close();gateway=null;
  await pool.query(`UPDATE game3d_trusted_character SET revision=5,
   xp_total=1000 WHERE owner_id='owner148' AND character_id='hero148'`);
  await assert.rejects(
   createGame3DTrustedCombatSheetReader143({pool}).read({
    scope:p,seedRevision:1,
   }),/combat sheet unavailable/);
  const renewed=await provisioner.provision({
   ownerId:'owner148',characterId:'hero148',
   blueprintId:'wolfveil-elite-v1'});
  assert.notEqual(renewed.instanceId,p.instanceId);
  assert.equal(renewed.characterRevision,5);
  assert.equal(renewed.blueprintId,'wolfveil-elite-v1');
  const latest=await createGame3DTrustedWorldSeedReader142({pool})
   .read({scope:renewed,map:createWolfveilMapCollision()});
  assert.equal(latest.enemies[0].tier,'elite');
  assert.equal(renewed.mapFingerprint,WOLFVEIL_MAP_FINGERPRINT);
 }finally{
  if(gateway)await gateway.close();
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
