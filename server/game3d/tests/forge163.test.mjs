import test from 'node:test';import assert from 'node:assert/strict';
import {fingerprintGame3DForgePreview} from '../forgePreviewFingerprint.mjs';
test('forge preview fingerprint refuses unverified and mutated previews',()=>{
 assert.equal(fingerprintGame3DForgePreview({ok:false}).ok,false);
 assert.equal(fingerprintGame3DForgePreview({ok:true,previewAvailable:true,
  ownerId:'o1',characterId:'c1',itemInstanceId:'11111111-1111-4111-8111-111111111111',
  itemRevision:'1',mode:'ascend',ascend:{currentStage:1},
  enchant:{enchantLevel:0,overEnchantLevel:0},
  proposedState:{ascendStage:5,enchantLevel:0,overEnchantLevel:0},
  proposedRevision:'2'}).ok,false);
});
