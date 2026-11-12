// Combat Foundation 6.5 — read-only ingredient provenance check.
// A consistent ingredient chain DOES NOT mean it was spent or a craft happened.
import {verifyItemProvenanceChain} from './itemProvenanceReview.mjs';
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const owner=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const deny=code=>({ok:false,code,
 materialsConsumedVerified:false,craftAuthorized:false,
 itemsGranted:false,rewardsIssued:false});
export function inspectCraftIngredientEvidence({
 ownerId,characterId,recipeId,ingredients,expectedDefinitions
}={}){
 if(!owner(ownerId)||!owner(characterId)||!key(recipeId)||
   !Array.isArray(ingredients)||ingredients.length>20||
   !Array.isArray(expectedDefinitions)||!expectedDefinitions.length||
   expectedDefinitions.length>20||expectedDefinitions.some(x=>!key(x)))
  return deny('invalid_crafting_evidence_scope');
 const definitions=[...expectedDefinitions].sort();
 const observed=[],used=new Set();
 for(const r of ingredients){
  const proof=verifyItemProvenanceChain(r);
  if(!proof.ok)return deny('invalid_ingredient_'+proof.code);
  if(proof.ownerId!==ownerId||proof.characterId!==characterId||
     used.has(proof.itemInstanceId))
   return deny('cross_owner_or_reused_ingredient');
  used.add(proof.itemInstanceId);
  observed.push(proof.definitionId);
 }
 observed.sort();
 if(observed.length!==definitions.length||
    observed.some((value,i)=>value!==definitions[i]))
  return deny('ingredient_recipe_mismatch');
 return {
  ok:true,ownerId,characterId,recipeId,
  ingredientCount:observed.length,ingredientDefinitions:observed,
  ownerProvenanceConsistent:true,
  // A server-managed materials spend ledger is required first.
  materialsConsumedVerified:false,craftAuthorized:false,
  itemsGranted:false,rewardsIssued:false,
 };
}
