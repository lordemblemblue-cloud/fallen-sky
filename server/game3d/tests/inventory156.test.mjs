import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DCharacterServicesUpgradeReview} from '../characterServices156.mjs';
test('15.6 review needs real PG and server authentication',()=>{
 assert.throws(()=>createGame3DCharacterServicesUpgradeReview({
  pool:{query:async()=>{},connect:async()=>{}}}),/trusted session/);
});
test('private preview exposes no purchase or forging write methods',()=>{
 const x=createGame3DCharacterServicesUpgradeReview({
  pool:{query:async()=>{},connect:async()=>{}},
  resolveAuthenticatedSubject:async()=>({authenticated:false})});
 assert.equal(x.readOnly,true);
 assert.equal('performUpgrade' in x,false);
 assert.equal('executeTrade' in x,false);
});
