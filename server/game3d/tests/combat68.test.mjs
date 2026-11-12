// Source-only tests prepared for beta; DO NOT run before beta.
import test from 'node:test';import assert from 'node:assert/strict';
import {inspectGame3DWorldJournalSchema} from '../worldJournalSchemaAudit.mjs';
test('complete schema never implies deployed trusted gameplay',async()=>{
 const required=['event_id','instance_id','owner_id','character_id',
  'event_type','server_tick','evidence_digest','event_digest'];
 const s=await inspectGame3DWorldJournalSchema({pool:{query:async(sql)=>{
  if(sql.includes('information_schema.columns'))
   return {rows:required.map(column_name=>({column_name}))};
  if(sql.includes('to_regclass'))return {rows:[{relation:'public.dummy'}]};
  return {rows:[{installed:true}]};
 }}});
 assert.equal(s.schemaIntact,true);
 assert.equal(s.productionReady,false);
 assert.equal(s.rewardIssuerApproved,false);
});
