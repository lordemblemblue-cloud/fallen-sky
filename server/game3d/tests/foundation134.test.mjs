import test from 'node:test';import assert from 'node:assert/strict';
import {inspectAscendStage,validateAscendTransition} from '../ascendStageRules.mjs';
test('ascension stops at 5 and rejects stage skipping',()=>{assert.equal(inspectAscendStage({stage:5}).nextStage,null);assert.equal(validateAscendTransition({fromStage:1,toStage:3}).ok,false);assert.equal(validateAscendTransition({fromStage:1,toStage:2}).ok,true)});
