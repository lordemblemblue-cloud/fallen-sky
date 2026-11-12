import test from 'node:test';import assert from 'node:assert/strict';
import {inspectAscendStage} from '../ascendStageRules.mjs';
import {inspectEnchantPath} from '../enchantRules.mjs';
test('15.4 state bounds match existing forge preview rules',()=>{
 assert.equal(inspectAscendStage({stage:5}).ok,true);
 assert.equal(inspectAscendStage({stage:6}).ok,false);
 assert.equal(inspectEnchantPath({enchantLevel:10,overEnchantLevel:5}).ok,true);
 assert.equal(inspectEnchantPath({enchantLevel:9,overEnchantLevel:1}).ok,false);
});
