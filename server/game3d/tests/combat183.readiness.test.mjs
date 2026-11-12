import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGame3DQuestSessionFenceReadiness183}
 from '../privateQuestTransactionFence183.mjs';
import {createGame3DPrivateSignedQuestWorldStaging183}
 from '../privateSignedQuestWorldStaging183.mjs';

const columns=['owner_id','character_id','world_instance_id','world_epoch',
 'world_session_id','action_session_id','lease_nonce','active',
 'expires_at','revoked_at','action_row_lock_183'];
const validColumns=()=>columns.map(column_name=>({
 column_name,can_update:column_name==='action_row_lock_183',
 is_generated:column_name==='action_row_lock_183'?'ALWAYS':'NEVER',
 data_type:column_name==='action_row_lock_183'?'smallint':'text',
}));
const validGrants=()=>({schema_name:'quest_staging',superuser:'off',
 can_select:true,dangerous:false,table_update:false});
function poolWith({rows=validColumns(),grants=validGrants(),failure=false}={}){
 let released=0,queries=0;
 const pool={connect:async()=>({
  async query(sql,params){
   queries++;
   if(failure)throw Error('database offline');
   if(sql.includes('information_schema.columns')){
    assert.deepEqual(params,['quest_staging']);
    return {rowCount:rows.length,rows};
   }
   if(sql.includes('has_table_privilege')){
    assert.deepEqual(params,['quest_staging.game3d_private_quest_session_fence_183']);
    return {rowCount:1,rows:[grants]};
   }
   throw Error('unexpected PG readiness query');
  },release(){released++}
 })};
 return {pool,get queries(){return queries},get released(){return released}};
}
test('18.3 restricted writer readiness succeeds only for immutable lock column',async()=>{
 const h=poolWith();
 const result=await assertGame3DQuestSessionFenceReadiness183({
  pool:h.pool,schema:'quest_staging'});
 assert.equal(result.ok,true);assert.equal(result.productionReady,false);
 assert.equal(h.queries,2);assert.equal(h.released,1);
});
test('18.3 missing table or unsafe UPDATE access fails closed',async()=>{
 for(const params of [
  {rows:validColumns().filter(x=>x.column_name!=='lease_nonce')},
  {rows:validColumns().map(x=>x.column_name==='active'?{...x,can_update:true}:x)},
  {rows:validColumns().map(x=>x.column_name==='action_row_lock_183'?
   {...x,is_generated:'NEVER'}:x)},
  {grants:{...validGrants(),dangerous:true}},
  {grants:{...validGrants(),can_select:false}},
  {failure:true}
 ]){
  const h=poolWith(params);
  await assert.rejects(assertGame3DQuestSessionFenceReadiness183({
   pool:h.pool,schema:'quest_staging'}),/18\.3 private quest session fence readiness denied/);
  assert.equal(h.released,1);
 }
});
test('18.3 cannot bind an unsafe staging writer or an unpaired issuer',async()=>{
 await assert.rejects(createGame3DPrivateSignedQuestWorldStaging183(),
  /18\.3 requires/);
});
