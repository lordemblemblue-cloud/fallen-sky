// Combat 10.0 source-only deferred beta contract tests.
import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DCombat10PrivateRuntime}
 from '../combat10PrivateRuntime.mjs';
test('cannot construct a beta runtime without real engine and session hooks',()=>{
 const pool={connect:async()=>{},query:async()=>{}};
 assert.throws(()=>createGame3DCombat10PrivateRuntime({pool}),
  /real engine attester/);
 assert.throws(()=>createGame3DCombat10PrivateRuntime({
  pool,resolveAuthenticatedSubject:async()=>null,proveEngineEvent:async()=>null,
  env:{GAME3D_MARKET_PUBLIC_TRADING_ENABLED:'true'}}),
  /pre-beta competitive features blocked/);
});
test('available private runtime does not export item/XP/trading write APIs',()=>{
 const runtime=createGame3DCombat10PrivateRuntime({
  pool:{connect:async()=>{},query:async()=>{}},
  resolveAuthenticatedSubject:async()=>({}),
  proveEngineEvent:async()=>({}),
 });
 assert.equal(runtime.privateBetaOnly,true);
 assert.equal(runtime.releaseAuthorized,false);
 assert.equal('creditXP' in runtime,false);
 assert.equal('issueItem' in runtime,false);
 assert.equal('executeTrade' in runtime,false);
});
