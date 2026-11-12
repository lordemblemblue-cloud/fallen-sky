import test from 'node:test';import assert from 'node:assert/strict';
import {deriveGame3DBaseStats} from '../combatStatsPreview.mjs';
test('base stats are bounded and have no ranked authority',()=>{
 const x=deriveGame3DBaseStats(100);assert.ok(x.stats.maxHP>x.stats.strength);
 assert.equal(x.competitiveApproved,false);
 assert.throws(()=>deriveGame3DBaseStats(0));
});
