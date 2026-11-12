import test from 'node:test';import assert from 'node:assert/strict';
import {combatFoundationHealthDisclosure,COMBAT_FOUNDATION_RELEASE_GATES} from '../combatFoundationManifest.mjs';
test('source version never certifies beta or production launch',()=>{
 const status=combatFoundationHealthDisclosure();
 assert.equal(status.sourceMilestone,'12.0');
 assert.equal(status.productionReleaseApproved,false);
 assert.equal(status.progressionRewardsActivated,false);
 assert.ok(COMBAT_FOUNDATION_RELEASE_GATES.length>=8);
});
