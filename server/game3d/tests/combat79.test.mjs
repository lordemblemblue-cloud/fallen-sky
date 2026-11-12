// Deferred source case for schema audit.
import test from 'node:test';import assert from 'node:assert/strict';
import {inspectGame3DPrivateBetaSchema} from '../combatPreBetaGate.mjs';
test('schema presence never authorizes reward payout',async()=>{
 const r=await inspectGame3DPrivateBetaSchema({pool:{query:async(sql)=>({rows:[sql.includes('to_regclass')?{relation:'public.table'}:{installed:true}]})}});
 assert.equal(r.schemaIntact,true);assert.equal(r.productionReady,false);
});
