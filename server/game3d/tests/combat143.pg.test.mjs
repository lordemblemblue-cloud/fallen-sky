// Combat 14.3 — actual 13.6/13.7/13.9/14.0/14.1 integration through a
// private real PostgreSQL 16 fixture, not the production database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createWolfveilMapCollision,WOLFVEIL_MAP_FINGERPRINT}
 from '../mapCollision.mjs';
import {createGame3DPrivateWorldBootstrap143}
 from '../privateWorldBootstrap143.mjs';
import {digestPrivateWorldBearer141}
 from '../trustedWorldSession141.mjs';
import {createPrivateWorldViewStore144}
 from '../../../src/components/game3d/network/privateWorldViewModel144.mjs';
import {createPrivateWorldClient144}
 from '../../../src/components/game3d/network/privateWorldClient144.mjs';

const url=process.env.GAME3D_141_DISPOSABLE_PG_URL;
const bearer=randomBytes(32).toString('base64url');
const origin='http://127.0.0.1:5173';
function startPositions(){
 const map=createWolfveilMapCollision();
 const anchor={x:0,z:0};
 for(let x of [-360,-280,-200,200,280,360])
  for(let z of [-330,-240,-150,150,240,330]){
   const player={x,z},enemy={x:x+2.25,z};
   if(map.valid(player,anchor)&&map.valid(enemy,anchor)&&
      map.canStrike(player,enemy,anchor))
    return {player,enemy,anchor};
  }
 throw Error('14.2 no safe Wolfveil server-owned test spawn found');
}
async function post(port,route,payload,token=bearer,source=origin){
 const response=await fetch('http://127.0.0.1:'+port+
   '/private-game3d/140/'+route,{
  method:'POST',headers:{'content-type':'application/json',
   authorization:'Bearer '+token,origin:source},
  body:JSON.stringify(payload),
 });
 return {status:response.status,body:await response.json()};
}
test('14.3 private actual-PG seed, session, recovery and HTTP gateway',
 {skip:!url,timeout:120000},async()=>{
 const {default:pg}=await import('pg');
 const schema='g3d_seed_143_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url,max:2});
 let pool=null,gateway=null,secondGateway=null;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:url,
   options:'-c search_path='+schema,max:10});
  await pool.query(`CREATE TABLE game3d_trusted_character(
   owner_id text NOT NULL,character_id text NOT NULL,
   revision bigint NOT NULL DEFAULT 4,
   xp_total bigint NOT NULL DEFAULT 100,
   PRIMARY KEY(owner_id,character_id)
  )`);
  await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id) VALUES ('owner143','hero143')`);
  for(const name of [
   '028_combat137_world_instance_leases.sql',
   '029_combat138_checkpoint_digest.sql',
   '030_combat139_world_recovery.sql',
   '031_combat141_private_world_sessions.sql',
   '032_combat142_trusted_world_seeds.sql',
   '033_combat143_character_sheet_binding.sql',
  ]){
   const sql=await readFile(new URL('../sql/'+name,import.meta.url),'utf8');
   await pool.query(sql);
  }
  const instanceId='world-143-authenticated';
  const map=createWolfveilMapCollision();
  assert.equal(map.fingerprint,WOLFVEIL_MAP_FINGERPRINT);
  const {player,enemy,anchor}=startPositions();
  const scope={instanceId,ownerId:'owner143',characterId:'hero143',
   instanceEpoch:'epoch-143-first',holderId:'holder-143-first',
   mapFingerprint:WOLFVEIL_MAP_FINGERPRINT};
  const actors={player:{position:player,hp:100,
   stats:{maxHP:100,damage:40,defense:10}},
   enemies:[{id:'wolf1',position:enemy,home:enemy,hp:30,
    stats:{maxHP:30,damage:6,defense:2},
    tier:'normal',aiProfile:'standard'}]};
  await pool.query(`INSERT INTO game3d_private_world_seed_142
   (instance_id,owner_id,character_id,map_id,map_fingerprint,
    revision,world_origin_x,world_origin_z,actors_json,character_revision)
   VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8::jsonb,4)`,
   [instanceId,scope.ownerId,scope.characterId,map.id,
    scope.mapFingerprint,anchor.x,anchor.z,JSON.stringify(actors)]);
  await assert.rejects(pool.query(`UPDATE game3d_private_world_seed_142
   SET revision=2 WHERE instance_id=$1`,[instanceId]),
   /immutable/);
  await pool.query(`INSERT INTO game3d_private_world_session_141
   (token_sha256,owner_id,character_id,expires_at)
   VALUES ($1,$2,$3,clock_timestamp()+interval '10 minutes')`,
   [digestPrivateWorldBearer141(bearer),scope.ownerId,scope.characterId]);
  const deps={pool,allowedOrigins:[origin],authorizeServerOperation:async()=>true,
   // Shared AXE PvE formula, deterministic private TEST-ONLY RNG.
   randomRoll:()=>.99,leaseMs:10000};
  gateway=await createGame3DPrivateWorldBootstrap143({...deps,scope});
  assert.equal(gateway.version,'14.3');
  assert.equal(gateway.publicGameWorldMounted,false);
  const listening=await gateway.listen({port:0});
  assert.equal(listening.host,'127.0.0.1');
  const denied=await post(listening.port,'connect',{},'wrong');
  assert.equal(denied.status,401);
  const c=await post(listening.port,'connect',{});
  assert.equal(c.body.ok,true);
  assert.equal(c.body.snapshot.player.hp,100);
  assert.equal(c.body.snapshot.enemies[0].hp,30);
  const conn=c.body.connectionId;
  const moved=await post(listening.port,'input',{
   connectionId:conn,input:{seq:1,x:0,z:0,facing:Math.PI/2},
  });
  assert.equal(moved.body.ok,true);
  const submitted=await post(listening.port,'intent',{
   connectionId:conn,
   intent:{action:'basic',intentId:'strike-143-0001',intentSeq:1,
    targetId:'wolf1',weaponPath:'damage'},
  });
  assert.equal(submitted.body.ok,true);
  assert.equal((await gateway.scheduleTick()).ok,true);
  const state=await post(listening.port,'poll',{
   connectionId:conn,afterSeq:c.body.cursor,
  });
  assert.equal(state.body.ok,true);
  assert.ok(state.body.snapshot.enemies[0].hp<30);
  assert.ok(state.body.snapshot.enemies[0].hp>=0);
  assert.equal(state.body.events.some(e=>e.kind==='player_strike'),true);
  assert.equal(state.body.rewardsIssued,false);
  const stored=await pool.query(`SELECT event_seq,checkpoint_json
   FROM game3d_combat_world_recovery_139 WHERE instance_id=$1`,
   [instanceId]);
  assert.equal(stored.rowCount,1);
  assert.equal(stored.rows[0].checkpoint_json.enemies[0].hp,
   state.body.snapshot.enemies[0].hp);
  // 14.4 also consumes the REAL 14.3 session/connection using the same
  // private loopback protocol; it NEVER writes playerHUDStore or XP.
  const v144=createPrivateWorldViewStore144({
   instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
   mapFingerprint:scope.mapFingerprint,
  });
  const client144=createPrivateWorldClient144({
   port:listening.port,view:v144,fetchImpl:fetch,
   tokenProvider:()=>bearer,
   createIntentId:()=> 'uuid-test-14400001',
  });
  const visual=await client144.connect();
  assert.equal(visual.mode,'connected');
  assert.equal(visual.snapshot.enemies[0].hp,
   state.body.snapshot.enemies[0].hp);
  assert.equal(visual.nextIntentSeq,2);
  assert.equal((await client144.input({
   x:0,z:0,facing:Math.PI/2,
  })).nextInputSeq,2);
  const observed=await client144.poll();
  assert.equal(observed.mode,'connected');
  assert.equal(observed.cursor,observed.snapshot.eventSeq);
  assert.equal(observed.snapshot.rewardsIssued,false);
  assert.equal(client144.mutatesPlayerHUD,false);
  await client144.disconnect();
  // A second worker cannot take an unexpired lease on the same instance.
  await assert.rejects(createGame3DPrivateWorldBootstrap143({
   ...deps,scope:{...scope,instanceEpoch:'epoch-143-second',
    holderId:'holder-143-second'},
  }),/world instance owned or unavailable/);
  await gateway.close();gateway=null;
  const scope2={...scope,instanceEpoch:'epoch-143-second',
   holderId:'holder-143-second'};
  secondGateway=await createGame3DPrivateWorldBootstrap143({
   ...deps,scope:scope2,
  });
  const addr=await secondGateway.listen();
  const resume=await post(addr.port,'connect',{});
  assert.equal(resume.body.ok,true);
  assert.equal(resume.body.snapshot.enemies[0].hp,
   state.body.snapshot.enemies[0].hp);
  assert.equal(resume.body.nextIntentSeq,2);
  assert.equal(secondGateway.productionReady,false);
  // An XP revision change must not be quietly applied to an existing
  // sealed world and cached checkpoint.
  await secondGateway.close();secondGateway=null;
  await pool.query(`UPDATE game3d_trusted_character
   SET revision=revision+1 WHERE owner_id=$1 AND character_id=$2`,
   [scope.ownerId,scope.characterId]);
  await assert.rejects(createGame3DPrivateWorldBootstrap143({
   ...deps,scope:{...scope,instanceEpoch:'epoch-143-third',
    holderId:'holder-143-third'},
  }),/combat sheet unavailable/);
  await pool.query(`UPDATE game3d_trusted_character
   SET revision=revision-1 WHERE owner_id=$1 AND character_id=$2`,
   [scope.ownerId,scope.characterId]);
  secondGateway=await createGame3DPrivateWorldBootstrap143({
   ...deps,scope:{...scope,instanceEpoch:'epoch-143-fourth',
    holderId:'holder-143-fourth'},
  });
  const after=await secondGateway.listen();
  await pool.query(`UPDATE game3d_private_world_session_141
   SET revoked_at=clock_timestamp() WHERE token_sha256=$1`,
   [digestPrivateWorldBearer141(bearer)]);
  const revoked=await post(after.port,'connect',{});
  assert.equal(revoked.status,401);
 }finally{
  if(secondGateway)await secondGateway.close();
  if(gateway)await gateway.close();
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
