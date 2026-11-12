// Combat 6.5 deferred beta-only source test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCraftIngredientEvidence} from '../craftIngredientEvidence.mjs';
test('empty and forged craft ingredient claims never authorize grants',()=>{
 const x=inspectCraftIngredientEvidence({ownerId:'o1',characterId:'c1',
  recipeId:'craft_preview',ingredients:[],
  expectedDefinitions:['steel_piece']});
 assert.equal(x.ok,false);assert.equal(x.craftAuthorized,false);
 const y=inspectCraftIngredientEvidence({ownerId:'o1',characterId:'c1',
  recipeId:'craft_preview',ingredients:[{}],
  expectedDefinitions:['steel_piece']});
 assert.equal(y.ok,false);assert.equal(y.itemsGranted,false);
});
