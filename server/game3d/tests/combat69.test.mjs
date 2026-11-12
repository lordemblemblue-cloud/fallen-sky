// Combat 6.9 source tests, beta-only.
import test from 'node:test';import assert from 'node:assert/strict';
import {inspectGame3DReleaseBlockers} from '../releaseReadinessAudit.mjs';
test('even all self-reported green flags cannot unlock public rewards',()=>{
 const keys=['schemaIntact','gameplayEngineAttestationVerified',
 'serverAccountAuthenticationVerified','itemIssuanceFaultTestsPassed',
 'equipmentStatDerivationVerified','rewardCreditLedgerAudited',
 'worldCollisionVerified','betaGameplayTestsPassed'];
 const result=inspectGame3DReleaseBlockers(
  Object.fromEntries(keys.map(x=>[x,true])));
 assert.equal(result.ok,true);
 assert.equal(result.releaseApproved,false);
 assert.equal(result.competitiveRewardsEnabled,false);
});
