// Deferred Combat 6.7 beta regression source.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGame3DSourceIntegrityOverview}
 from '../sourceIntegrityReview.mjs';
test('missing evidence is reported but cannot authorize releases',()=>{
 const x=buildGame3DSourceIntegrityOverview({});
 assert.equal(x.ok,true);assert.equal(x.requiresReview,true);
 assert.equal(x.releaseEligible,false);
});
test('attempt to promote item grants from audit is refused',()=>{
 const x=buildGame3DSourceIntegrityOverview({
  questCandidate:{ok:true,rewardsIssued:true}});
 assert.equal(x.ok,false);
 assert.equal(x.autoGrantAllowed,false);
});
