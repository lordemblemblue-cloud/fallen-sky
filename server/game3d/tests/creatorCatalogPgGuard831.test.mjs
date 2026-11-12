import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const script='server/game3d/verifyCreatorCatalogPg831.mjs';
const baseEnv=Object.fromEntries(
 ['PATH','Path','PATHEXT','SystemRoot','ComSpec','TEMP','TMP','HOME','USERPROFILE']
  .filter(key=>process.env[key]!==undefined)
  .map(key=>[key,process.env[key]]),
);
baseEnv.GAME3D_PRIVATE_STAGING_ENV='production';
baseEnv.GAME3D_CREATOR_PG831_RUN='0';
baseEnv.GAME3D_CREATOR_PG831_CONFIRM='NO';

test('83.1 opt-in PG verifier help does not open a database',()=>{
 const run=spawnSync(process.execPath,[script,'--help'],{
  env:baseEnv,encoding:'utf8',timeout:10000});
 assert.equal(run.status,0,run.stderr);
 assert.match(run.stdout,/PG16/);
 assert.match(run.stdout,/YES_DISPOSABLE_STAGING/);
});

test('83.1 plan lists disposable prerequisites without running SQL',()=>{
 const run=spawnSync(process.execPath,[script,'--plan'],{
  env:baseEnv,encoding:'utf8',timeout:10000});
 assert.equal(run.status,0,run.stderr);
 assert.match(run.stdout,/PLAN ONLY; no database connection/);
 assert.match(run.stdout,/loopback|127.0.0.1/);
});

test('83.1 arbitrary or missing run arguments are blocked',()=>{
 for(const args of [[],['--something'],['--plan','--run']]){
  const result=spawnSync(process.execPath,[script,...args],{
   env:baseEnv,encoding:'utf8',timeout:10000});
  assert.equal(result.status,2);
  assert.match(result.stderr,/BLOCKED/);
 }
});

test('83.1 explicit run without complete opt-in refuses to import pg',()=>{
 const result=spawnSync(process.execPath,[script,'--run'],{
  env:baseEnv,encoding:'utf8',timeout:10000});
 assert.equal(result.status,2);
 assert.match(result.stderr,/BLOCKED/);
 assert.doesNotMatch(result.stderr,/postgresql:\/\//);
});

test('83.1 production environment is rejected even with other flags',()=>{
 const result=spawnSync(process.execPath,[script,'--run'],{
  env:{...baseEnv,GAME3D_CREATOR_PG831_RUN:'1',
    GAME3D_CREATOR_PG831_CONFIRM:'YES_DISPOSABLE_STAGING',
    GAME3D_CREATOR_PG831_SCHEMA:'axe_creator_test_831',
    GAME3D_CREATOR_PG831_URL:'postgresql://user:secret@127.0.0.1:5432/test'},
  encoding:'utf8',timeout:10000});
 assert.equal(result.status,2);
 assert.doesNotMatch(result.stderr,/secret/);
});

test('83.1 non-loopback URL is refused even for disposable staging',()=>{
 const result=spawnSync(process.execPath,[script,'--run'],{
  env:{...baseEnv,GAME3D_PRIVATE_STAGING_ENV:'staging',
    GAME3D_CREATOR_PG831_RUN:'1',
    GAME3D_CREATOR_PG831_CONFIRM:'YES_DISPOSABLE_STAGING',
    GAME3D_CREATOR_PG831_SCHEMA:'axe_creator_test_831',
    GAME3D_CREATOR_PG831_URL:'postgresql://user:secret@example.com:5432/test'},
  encoding:'utf8',timeout:10000});
 assert.equal(result.status,2);
 assert.doesNotMatch(result.stderr,/secret|example\.com/);
});

test('83.1 production-named loopback database is also blocked',()=>{
 const result=spawnSync(process.execPath,[script,'--run'],{
  env:{...baseEnv,GAME3D_PRIVATE_STAGING_ENV:'staging',
    GAME3D_CREATOR_PG831_RUN:'1',
    GAME3D_CREATOR_PG831_CONFIRM:'YES_DISPOSABLE_STAGING',
    GAME3D_CREATOR_PG831_SCHEMA:'axe_creator_test_831',
    GAME3D_CREATOR_PG831_URL:'postgresql://user:secret@127.0.0.1:5432/live_prod'},
  encoding:'utf8',timeout:10000});
 assert.equal(result.status,2);
 assert.match(result.stderr,/BLOCKED/);
 assert.doesNotMatch(result.stderr,/secret|live_prod/);
});

test('83.1 public schema or injected identifier is never accepted',()=>{
 for(const name of ['public','axe_creator_test_x;DROP','axe_creator_test_']){
  const result=spawnSync(process.execPath,[script,'--run'],{
   env:{...baseEnv,GAME3D_PRIVATE_STAGING_ENV:'staging',
     GAME3D_CREATOR_PG831_RUN:'1',
     GAME3D_CREATOR_PG831_CONFIRM:'YES_DISPOSABLE_STAGING',
     GAME3D_CREATOR_PG831_SCHEMA:name,
     GAME3D_CREATOR_PG831_URL:'postgresql://user:secret@127.0.0.1:5432/test'},
   encoding:'utf8',timeout:10000});
  assert.equal(result.status,2);
 }
});

test('83.1 verifier makes no DDL, item issuance, delete or cleanup calls',()=>{
 const content=readFileSync(script,'utf8');
 assert.doesNotMatch(content,/\bCREATE TABLE\b|\bDROP TABLE\b|\bTRUNCATE\b/i);
 assert.doesNotMatch(content,/game3d_item_issuance|game3d_wallet|game3d_inventory_slot/);
 assert.match(content,/allowExitOnIdle:true/);
 assert.match(content,/Promise\.all\(\[submit\(\),submit\(\)\]\)/);
 assert.match(content,/Promise\.all\(\[review\(\),review\(\)\]\)/);
 assert.match(content,/current_user AS role_name/);
 assert.match(content,/statement_timeout:9000/);
});
