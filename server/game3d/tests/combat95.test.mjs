// Deferred private beta XP ledger tests, not run.
import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DXPCreditLedger} from '../xpCreditLedger.mjs';
test('untrusted XP input is not a credit',async()=>{
 const ledger=createGame3DXPCreditLedger({pool:{
  connect:async()=>{throw Error('unexpected PG')}}});
 assert.equal(ledger.enabled,false);
 await assert.rejects(()=>ledger.credit('quest-receipt'),
  /not installed/);
 await assert.rejects(()=>ledger.credit('../../bad'),
  /Invalid XP completion/);
});
