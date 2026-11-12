import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const script='server/game3d/verifyCreatorCatalogPg835.mjs';
const env=Object.fromEntries(
  ['PATH','Path','PATHEXT','SystemRoot','ComSpec','TEMP','TMP','HOME','USERPROFILE']
    .filter(key=>process.env[key]!==undefined)
    .map(key=>[key,process.env[key]]),
);
env.GAME3D_PRIVATE_STAGING_ENV='production';
env.GAME3D_PG835_RUN='0';
env.GAME3D_PG835_CONFIRM='NO';
const checked=(args=[],extra={})=>spawnSync(process.execPath,[script,...args],{
  env:{...env,...extra},encoding:'utf8',timeout:15000,
});

test('83.5 --plan does not connect and displays three-role requirements',()=>{
 const result=checked(['--plan']);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/PLAN ONLY/);
 assert.match(result.stdout,/GAME3D_PG835_STAGING_URL/);
 assert.match(result.stdout,/GAME3D_PG835_AUDIT_URL/);
 assert.match(result.stdout,/GAME3D_PG835_POLICY_URL/);
 assert.match(result.stdout,/READ ONLY/);
});

test('83.5 --help is harmless without credential environment variables',()=>{
 const result=checked(['--help']);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/disposable/);
 assert.doesNotMatch(result.stdout,/FAILED/);
});

test('83.5 no args, wrong args and --plan plus --run are blocked',()=>{
 for(const args of [[],['--guess'],['--plan','--run']]){
  const result=checked(args);
  assert.equal(result.status,2);
  assert.match(result.stderr,/BLOCKED/);
 }
});

test('83.5 --run without explicit environment is blocked before importing pg',()=>{
 const result=checked(['--run']);
 assert.equal(result.status,2);
 assert.match(result.stderr,/BLOCKED/);
 assert.doesNotMatch(result.stderr,/Cannot find package 'pg'/);
});

const preset={
 GAME3D_PRIVATE_STAGING_ENV:'staging',
 GAME3D_PG835_RUN:'1',
 GAME3D_PG835_CONFIRM:'YES_DISPOSABLE_READONLY',
 GAME3D_PG835_SCHEMA:'axe_creator_test_835',
 GAME3D_PG835_STAGING_URL:
  'postgresql://stage:secret_a@127.0.0.1:5432/disposable_test',
 GAME3D_PG835_AUDIT_URL:
  'postgresql://audit:secret_b@127.0.0.1:5432/disposable_test',
 GAME3D_PG835_POLICY_URL:
  'postgresql://policy:secret_c@127.0.0.1:5432/disposable_test',
};

test('83.5 production flag always blocks even with all three DB URLs',()=>{
 const result=checked(['--run'],{
  ...preset,GAME3D_PRIVATE_STAGING_ENV:'production',
 });
 assert.equal(result.status,2);
 assert.doesNotMatch(result.stderr,/secret_a|secret_b|secret_c/);
});

test('83.5 non-disposable database name is refused',()=>{
 const result=checked(['--run'],{
  ...preset,GAME3D_PG835_STAGING_URL:
   'postgresql://stage:secret_a@127.0.0.1:5432/live',
 });
 assert.equal(result.status,2);
 assert.match(result.stderr,/BLOCKED/);
});

test('83.5 external or injected URL query strings are refused',()=>{
 for(const url of [
  'postgresql://stage:secret_a@mycorp.com:5432/disposable_test',
  'postgresql://stage:secret_a@127.0.0.1:5432/disposable_test?options=-c',
 ]){
  const result=checked(['--run'],{
   ...preset,GAME3D_PG835_STAGING_URL:url,
  });
  assert.equal(result.status,2);
  assert.doesNotMatch(result.stderr,/secret_a|mycorp\.com/);
 }
});

test('83.5 three unique database usernames are mandatory',()=>{
 const result=checked(['--run'],{
  ...preset,GAME3D_PG835_POLICY_URL:
   'postgresql://audit:secret_c@127.0.0.1:5432/disposable_test',
 });
 assert.equal(result.status,2);
});

test('83.5 mismatched database names are blocked',()=>{
 const result=checked(['--run'],{
  ...preset,GAME3D_PG835_AUDIT_URL:
   'postgresql://audit:secret_b@127.0.0.1:5432/another_test',
 });
 assert.equal(result.status,2);
});

test('83.5 staff policy and staging schema injection is rejected',()=>{
 for(const schema of ['public','axe_creator_test_','axe_creator_test_x;DROP']){
  const result=checked(['--run'],{...preset,GAME3D_PG835_SCHEMA:schema});
  assert.equal(result.status,2);
 }
});

test('83.5 verifier never executes migrations or database mutation SQL',()=>{
 const src=readFileSync(script,'utf8');
 assert.doesNotMatch(src,/\bapp\.post\(|\bfetch\(|\bnew WebSocket\(/);
 assert.doesNotMatch(src,/game3d_item_issuance|game3d_wallet|game3d_inventory_slot/);
 assert.match(src,/YES_DISPOSABLE_READONLY/);
 assert.match(src,/migrationsAppliedByScript:false/);
 assert.match(src,/databaseRowsWritten:0/);
});
