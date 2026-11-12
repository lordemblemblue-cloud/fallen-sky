import test from 'node:test';import assert from 'node:assert/strict';
import {inspectGame3DForgeTransition} from '../forgeTransitionPreview.mjs';
const state={source:'trusted-private-upgrade-state',readTransactionBound:true,
 revision:'0',ascendStage:4,enchantLevel:10,overEnchantLevel:0};
test('stage five is reached once, not upgraded beyond maximum',()=>{
 const r=inspectGame3DForgeTransition({state,mode:'ascend',expectedRevision:0});
 assert.equal(r.next.ascendStage,5);
 assert.equal(inspectGame3DForgeTransition({state:{...state,ascendStage:5},
  mode:'ascend',expectedRevision:0}).ok,false);
});
test('over enchant requires maxed regular enchant',()=>{
 const r=inspectGame3DForgeTransition({state:{...state,enchantLevel:9},
  mode:'over_enchant',expectedRevision:0});
 assert.equal(r.ok,false);
});
