// Combat 7.5 deferred source tests. NOT executed until private beta.
import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DPrivateBetaTrustDossier}
 from '../privateBetaTrustDossier.mjs';
test('no server authentication resolver prevents dossier construction',()=>{
 assert.throws(()=>createGame3DPrivateBetaTrustDossier({
  pool:{connect:async()=>{},query:async()=>{}}
 }),/server session resolver/);
});
test('malformed scope fails before database or user lookup',async()=>{
 const dossier=createGame3DPrivateBetaTrustDossier({
  pool:{query:async()=>{throw Error('Unexpected DB')},
   connect:async()=>{throw Error('Unexpected DB')}},
  resolveAuthenticatedSubject:async()=>{throw Error('Unexpected identity lookup')},
 });
 const x=await dossier.inspect({characterId:'__anon__',
  instanceId:'world1',questId:'axe_q_first_patrol'});
 assert.equal(x.ok,false);
 assert.equal(x.productionReady,false);
 assert.equal(x.rewardsIssued,false);
});
