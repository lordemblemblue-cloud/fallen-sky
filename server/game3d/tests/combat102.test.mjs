// Combat 10.2 tests prepared for isolated beta.
import test from 'node:test';import assert from 'node:assert/strict';
import {createPgItemProvenance} from '../itemProvenance.mjs';
test('unverified source cannot become an item even with a permissive authorization hook',async()=>{
 let touched=false;
 const s=createPgItemProvenance({pool:{query:async()=>{},connect:async()=>({query:async(sql)=>{if(sql==='BEGIN'||sql==='ROLLBACK')return {};return {rowCount:0,rows:[]}},release:()=>{}})},verifySource:async()=>({ok:false}),authorizeIssuance:async()=>{touched=true;return true}});
 await assert.rejects(()=>s.issueItem({ownerId:'o1',characterId:'c1',sourceEventId:'event1',definitionId:'sword',sourceKind:'quest',awardIndex:0}),/No trusted/);
 assert.equal(touched,false);
});
