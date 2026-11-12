import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {safeDisposablePgUrl847} from '../privateDisposablePgGuard847.mjs';

const runner=fileURLToPath(new URL('../tools/verifyCombatQuest847.mjs',import.meta.url));
const safe='postgresql://postgres:postgres@127.0.0.1:5432/game3d_847_disposable';
const call=(args=[],env={})=>spawnSync(process.execPath,[runner,...args],{
 encoding:'utf8',timeout:10000,
 env:{...process.env,
  GAME3D_847_DISPOSABLE_PG_ADMIN_URL:'',
  GAME3D_847_DISPOSABLE_ACK:'',
  ...env},
});

test('84.7 verification runner help never tries to connect to the database',()=>{
 const result=call(['--help']);
 assert.equal(result.status,0);
 assert.match(result.stdout,/disposable PostgreSQL 16/i);
});
test('84.7 offline self-test validates URL safety without opening a PG connection',()=>{
 const result=call(['--self-test']);
 assert.equal(result.status,0);
 assert.match(result.stdout,/no database opened/);
});
test('84.7 refuses missing opt-in even when localhost DB URL is supplied',()=>{
 const result=call([],{GAME3D_847_DISPOSABLE_PG_ADMIN_URL:safe});
 assert.equal(result.status,1);
 assert.match(result.stderr,/denied/);
});
test('84.7 refuses a production-like DB name even with explicit acknowledgement',()=>{
 const result=call([],{
  GAME3D_847_DISPOSABLE_PG_ADMIN_URL:safe.replace(
   'game3d_847_disposable','game3d_production'),
  GAME3D_847_DISPOSABLE_ACK:'I_HAVE_A_DISPOSABLE_PG_INSTANCE',
 });
 assert.equal(result.status,1);
 assert.match(result.stderr,/unsafe database URL/);
});
test('84.7 refuses a remote server, other role, untrusted port and URL parameters',()=>{
 for(const invalid of [
  safe.replace('127.0.0.1','production.example'),
  safe.replace('postgres:postgres','game:postgres'),
  safe.replace(':5432',':6432'),
  safe+'?sslmode=require',
  'https://127.0.0.1:5432/game3d_847_disposable',
 ])assert.equal(safeDisposablePgUrl847(invalid),false);
});
test('84.7 requires exact known disposable database and postgres administrator',()=>{
 assert.equal(safeDisposablePgUrl847(safe),true);
 assert.equal(safeDisposablePgUrl847(''),false);
 assert.equal(safeDisposablePgUrl847(undefined),false);
});
