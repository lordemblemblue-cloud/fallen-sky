// Combat Foundation 5.8 beta-only test contracts; tests NOT executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertGame3DPreBetaSafety,inspectGame3DPrivateBetaSchema
} from '../combatPreBetaGate.mjs';
test('known public ranked, rewards, XP and gear switches are blocked',()=>{
  for(const name of [
   'GAME3D_COMBAT_PUBLIC_RANKED_ENABLED',
   'GAME3D_COMBAT_PUBLIC_REWARDS_ENABLED',
   'GAME3D_COMBAT_EQUIPMENT_BONUSES_ENABLED',
   'GAME3D_COMBAT_AUTOMATIC_ITEM_GRANTS_ENABLED',
   'GAME3D_COMBAT_CHARACTER_XP_PAYOUTS_ENABLED',
  ]){
    assert.throws(()=>assertGame3DPreBetaSafety({[name]:'true'}),
      /pre-beta competitive features blocked/);
    assert.throws(()=>assertGame3DPreBetaSafety({[name]:'1'}),
      /pre-beta competitive features blocked/);
  }
  const result=assertGame3DPreBetaSafety({
    GAME3D_COMBAT_PUBLIC_RANKED_ENABLED:'false'});
  assert.equal(result.safeToStartIsolatedWorker,true);
  assert.equal(result.publicCompetitiveApproved,false);
});
test('private schema diagnostics never claim reward authorization',async()=>{
 const found=await inspectGame3DPrivateBetaSchema({
  pool:{query:async(sql,args)=>({rows:[sql.includes('to_regclass')
   ?{relation:'present'}:{installed:true}]})},
 });
 assert.equal(found.schemaIntact,true);
 assert.equal(found.productionReady,false);
 assert.equal(found.rewardsEligible,false);
 assert.equal(found.gameplayAttestationVerified,false);
});
test('schema check fails closed on missing migration objects',async()=>{
 const status=await inspectGame3DPrivateBetaSchema({
  pool:{query:async(sql,args)=>({rows:[sql.includes('to_regclass')
   ?{relation:null}:{installed:false}]})},
 });
 assert.equal(status.schemaIntact,false);
 assert.ok(status.missing.length>0);
 assert.equal(status.productionReady,false);
});
