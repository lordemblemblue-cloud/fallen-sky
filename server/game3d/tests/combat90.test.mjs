// Combat Foundation 9.0 contract tests. DO NOT RUN until isolated beta.
import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DCombat90BetaReview}
 from '../combat90BetaReview.mjs';
test('9.0 dossier requires private server session resolver',()=>{
 assert.throws(()=>createGame3DCombat90BetaReview({
  pool:{connect:async()=>{},query:async()=>{}}}),
  /real server identity resolver/);
});
test('market flag prevents any beta DB or quest reads',async()=>{
 const runner=createGame3DCombat90BetaReview({
  pool:{connect:async()=>{throw Error('should not connect')},
   query:async()=>{throw Error('should not query')}},
  resolveAuthenticatedSubject:async()=>{throw Error('should not resolve')},
  env:{GAME3D_MARKET_PUBLIC_TRADING_ENABLED:'true'},
 });
 const x=await runner.inspect({
  characterId:'hero1',instanceId:'world1',questId:'axe_q_first_patrol'});
 assert.equal(x.ok,false);assert.equal(x.productionApproved,false);
 assert.equal(x.marketTradingApproved,false);
});
