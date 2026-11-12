import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DTrustedWorldSeedReader142}
 from '../trustedWorldSeed142.mjs';
import {createGame3DPrivateWorldBootstrap142}
 from '../privateWorldBootstrap142.mjs';
import {WOLFVEIL_MAP_FINGERPRINT} from '../mapCollision.mjs';

const scope={instanceId:'world-142-test',instanceEpoch:'epoch-142-test',
 holderId:'worker-142-test',ownerId:'owner142',characterId:'hero142',
 mapFingerprint:WOLFVEIL_MAP_FINGERPRINT};
const origin={x:0,z:0};
const map={id:'wolfveil-v1',fingerprint:WOLFVEIL_MAP_FINGERPRINT,
 valid:()=>true};
const player={position:{x:0,z:0},hp:100,stats:{
 maxHP:100,damage:15,defense:5}};
const wolf={id:'wolf1',position:{x:2,z:0},home:{x:2,z:0},
 hp:30,stats:{maxHP:30,damage:5,defense:2},
 tier:'normal',aiProfile:'standard'};
const row=()=>({
 instance_id:scope.instanceId,owner_id:scope.ownerId,
 character_id:scope.characterId,map_id:map.id,
 map_fingerprint:map.fingerprint,revision:'2',
 world_origin_x:origin.x,world_origin_z:origin.z,
 actors_json:{player,enemies:[wolf]},
 source_kind:'trusted_server_world_provisioner',sealed:true,
});
function fixture({record=row(),throwQuery=false}={}){
 const calls=[];let releases=0;
 const pool={connect:async()=>({
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(throwQuery&&sql.startsWith('SELECT'))throw Error('DB offline');
   return sql.startsWith('SELECT')?
    {rowCount:record?1:0,rows:record?[record]:[]}:
    {rowCount:0,rows:[]};
  },release:()=>{releases++},
 })};
 return {pool,calls,get releases(){return releases}};
}
test('14.2 never accepts unscoped or mismatched map seed requests',async()=>{
 const f=fixture(),reader=createGame3DTrustedWorldSeedReader142({pool:f.pool});
 for(const bad of [
  {...scope,ownerId:'__anon__'},
  {...scope,mapFingerprint:'b'.repeat(64)},
  {...scope,instanceId:'unsafe'},
 ]){
  await assert.rejects(reader.read({scope:bad,map}),
   /trusted world seed missing or invalid/);
 }
 assert.equal(f.calls.length,0);
});
test('14.2 reads sealed PG seed in one read-only snapshot',async()=>{
 const f=fixture(),reader=createGame3DTrustedWorldSeedReader142({pool:f.pool});
 const seed=await reader.read({scope,map});
 assert.equal(seed.ok,true);
 assert.equal(seed.instanceId,scope.instanceId);
 assert.equal(seed.provenance,'authoritative-world-simulation');
 assert.equal(seed.trustedSeedRevision,2);
 assert.equal(seed.player.stats.damage,15);
 assert.equal(seed.enemies[0].id,'wolf1');
 assert.equal(seed.xpAuthorized,undefined);
 assert.equal(f.calls[0].sql,
  'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
 assert.deepEqual(f.calls[1].args,[scope.instanceId,scope.ownerId,
  scope.characterId,map.id,map.fingerprint]);
 assert.match(f.calls[1].sql,/INNER JOIN game3d_trusted_character/);
 assert.equal(f.calls.at(-1).sql,'COMMIT');
 assert.equal(f.releases,1);
 assert.equal(reader.readOnly,true);
 assert.equal(reader.seedProvisionerInstalled,false);
});
test('14.2 rejects forged, changed, duplicated or nonfinite actor evidence',async()=>{
 const invalid=[
  {owner_id:'attacker'},
  {map_fingerprint:'b'.repeat(64)},
  {source_kind:'browser'},
  {sealed:false},
  {revision:'0'},
  {world_origin_x:Infinity},
  {actors_json:{player,enemies:[wolf,wolf]}},
  {actors_json:{player:{...player,hp:200},enemies:[wolf]}},
  {actors_json:{player,enemies:[{...wolf,isBoss:true}]}},
  {actors_json:{player,enemies:[{...wolf,stats:{...wolf.stats,
   damage:Infinity}}]}},
  {actors_json:{player,enemies:[{...wolf,id:'evil actor'}]}},
 ];
 for(const changes of invalid){
  const f=fixture({record:{...row(),...changes}});
  await assert.rejects(createGame3DTrustedWorldSeedReader142({
   pool:f.pool}).read({scope,map}),/trusted world seed missing or invalid/);
  assert.equal(f.calls.at(-1).sql,'ROLLBACK');
  assert.equal(f.releases,1);
 }
});
test('14.2 denies missing row and rolls back DB failure',async()=>{
 const absent=fixture({record:null});
 await assert.rejects(createGame3DTrustedWorldSeedReader142({
  pool:absent.pool}).read({scope,map}),/trusted world seed missing or invalid/);
 assert.equal(absent.calls.at(-1).sql,'ROLLBACK');
 const down=fixture({throwQuery:true});
 await assert.rejects(createGame3DTrustedWorldSeedReader142({
  pool:down.pool}).read({scope,map}),/DB offline/);
 assert.equal(down.calls.at(-1).sql,'ROLLBACK');
 assert.equal(down.releases,1);
});
test('14.2 wrapper refuses missing trusted damage resolvers and unknown map',async()=>{
 const f=fixture();
 const base={pool:f.pool,scope,allowedOrigins:['http://127.0.0.1:5173'],
  authorizeServerOperation:async()=>true,
  resolvePlayerStrike:()=>({damage:1}),
  resolveEnemyStrike:()=>({damage:1})};
 await assert.rejects(createGame3DPrivateWorldBootstrap142({
  ...base,resolveEnemyStrike:null,
 }),/requires private DB/);
 await assert.rejects(createGame3DPrivateWorldBootstrap142({
  ...base,mapId:'unverified-client-map',
 }),/requires private DB/);
 await assert.rejects(createGame3DPrivateWorldBootstrap142({
  ...base,scope:{...scope,mapFingerprint:'b'.repeat(64)},
 }),/fingerprint does not match/);
 assert.equal(f.calls.length,0);
});
test('14.2 SQL prevents in-place seed modification and browser grants',()=>{
 const sql=readFileSync(new URL(
  '../sql/032_combat142_trusted_world_seeds.sql',import.meta.url),'utf8');
 assert.match(sql,/instance_id text PRIMARY KEY/);
 assert.match(sql,/FOREIGN KEY\(owner_id,character_id\)/);
 assert.match(sql,/world_seed_142_immutable/);
 assert.match(sql,/RAISE EXCEPTION/);
 assert.doesNotMatch(sql,/GRANT INSERT|GRANT UPDATE|GRANT DELETE/);
});
