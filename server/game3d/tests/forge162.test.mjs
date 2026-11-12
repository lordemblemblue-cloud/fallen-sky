import test from 'node:test';import assert from 'node:assert/strict';
import {inspectGame3DForgeTransition} from '../forgeTransitionPreview.mjs';
test('Blacksmith preview exposes only a revisioned next-state proposal',()=>{
 const state={source:'trusted-private-upgrade-state',readTransactionBound:true,
  revision:'2',ascendStage:2,enchantLevel:5,overEnchantLevel:0};
 const out=inspectGame3DForgeTransition({state,mode:'enchant',expectedRevision:2});
 assert.equal(out.next.enchantLevel,6);
 assert.equal(out.proposedRevision,'3');
 assert.equal(out.upgradeAuthorized,false);
});
