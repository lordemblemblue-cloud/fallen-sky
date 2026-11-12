import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGame3DPrivateQuestLeaseIssuerReadiness183,
 createGame3DPrivateQuestLeaseIssuer183}
 from '../privateQuestLeaseIssuer183.mjs';

const schema='quest_staging';
const issuerRow=()=>({
 role_name:'game3d_quest_lease_issuer_183',db_name:'private_game3d',
 schema_name:schema,server_addr:'127.0.0.1',server_port:5432,
 superuser:'off',bypass_rls:false,can_create_role:false,
 can_create_db:false,replication_role:false,in_recovery:false,
 schema_create:false,db_create:false,lease_insert:true,lease_update:true,lease_select:true,lease_danger:false,
 character_writer:false,quest_writer:false,quest_objective_writer:false,
});
const writerRow=()=>({
 role_name:'game3d_quest_action_writer_174',db_name:'private_game3d',
 schema_name:schema,server_addr:'127.0.0.1',server_port:5432,
});
function fixture({issuerOverrides={},writerOverrides={},issuerFault=false,
 writerFault=false}={}){
 let issuerReleased=0,writerReleased=0;
 const issuerPool={async connect(){
  if(issuerFault)throw Error('issuer connect unavailable');
  return {
   async query(sql,params){
    assert.match(sql,/rolbypassrls/);
    assert.match(sql,/lease_insert/);
    assert.deepEqual(params,[
     schema+'.game3d_private_quest_session_fence_183',
     schema+'.game3d_trusted_character',
     schema+'.game3d_private_quest_acceptance_154',
     schema+'.game3d_private_quest_objective_binding_152',
    ]);
    return {rowCount:1,rows:[{...issuerRow(),...issuerOverrides}]};
   },
   release(){issuerReleased++},
  };
 }};
 const writerPool={async connect(){
  if(writerFault)throw Error('writer connect unavailable');
  return {
   async query(sql){
    assert.match(sql,/current_user AS role_name/);
    return {rowCount:1,rows:[{...writerRow(),...writerOverrides}]};
   },
   release(){writerReleased++},
  };
 }};
 return {issuerPool,writerPool,get issuerReleased(){return issuerReleased},
  get writerReleased(){return writerReleased}};
}
async function readiness(h){
 return assertGame3DPrivateQuestLeaseIssuerReadiness183({
  issuerPool:h.issuerPool,writerPool:h.writerPool,schema,
 });
}
test('18.3 independent issuer and restricted writer roles can pass the staging gate',async()=>{
 const h=fixture();
 const result=await readiness(h);
 assert.equal(result.ok,true);
 assert.equal(result.independentIssuerRole,true);
 assert.equal(result.gameplayWritesDenied,true);
 assert.equal(result.productionReady,false);
 assert.equal(h.issuerReleased,1);assert.equal(h.writerReleased,1);
});
test('18.3 refuses the same pool or a duplicate role name',async()=>{
 const h=fixture();
 await assert.rejects(
  assertGame3DPrivateQuestLeaseIssuerReadiness183({
   issuerPool:h.issuerPool,writerPool:h.issuerPool,schema,
  }),/independent_issuer_and_writer_pools_required/);
 await assert.rejects(readiness(fixture({
  writerOverrides:{role_name:issuerRow().role_name},
 })),/different_database_or_same_role/);
});
test('18.3 refuses unrelated server, database or schema connection',async()=>{
 for(const [issuerOverrides,writerOverrides] of [
  [{db_name:'other_db'},{}],
  [{server_addr:'10.0.0.2'},{}],
  [{server_port:5433},{}],
  [{server_addr:null},{}],
  [{schema_name:'public'},{}],
  [{},{schema_name:'public'}],
 ]){
  const h=fixture({issuerOverrides,writerOverrides});
  await assert.rejects(readiness(h),/different_database_or_same_role/);
  assert.equal(h.issuerReleased,1);assert.equal(h.writerReleased,1);
 }
});
test('18.3 refuses superuser, RLS bypass, schema creators and extra lease privileges',async()=>{
 for(const mutation of [
  {superuser:'on'},{bypass_rls:true},{schema_create:true},
  {db_create:true},{can_create_role:true},{can_create_db:true},
  {replication_role:true},{in_recovery:true},
  {lease_insert:false},{lease_update:false},
  {lease_select:false},{lease_danger:true},
  {character_writer:true},{quest_writer:true},{quest_objective_writer:true},
 ]){
  const h=fixture({issuerOverrides:mutation});
  await assert.rejects(readiness(h),
   /privileged_or_incorrect_session_issuer_grants/);
  assert.equal(h.issuerReleased,1);assert.equal(h.writerReleased,1);
 }
});
test('18.3 issuer and writer connection outages both fail closed and release clients',async()=>{
 const a=fixture({issuerFault:true});
 await assert.rejects(readiness(a),/issuer_database_unavailable/);
 assert.equal(a.issuerReleased,0);assert.equal(a.writerReleased,0);
 const b=fixture({writerFault:true});
 await assert.rejects(readiness(b),/issuer_database_unavailable/);
 assert.equal(b.issuerReleased,1);assert.equal(b.writerReleased,0);
});
test('18.3 issuer introspection examines the same pool used for lease mutation',async()=>{
 const h=fixture();
 const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{
  process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
  const leaseIssuer=createGame3DPrivateQuestLeaseIssuer183({
   enabled:true,pool:h.issuerPool,
   resolveCurrentWorldLease:async()=>null,
  });
  const ready=await leaseIssuer.verifyIssuerReadiness({
   writerPool:h.writerPool,schema,
  });
  assert.equal(ready.ok,true);
  assert.equal(h.issuerReleased,1);assert.equal(h.writerReleased,1);
  await leaseIssuer.shutdown();
 }finally{
  if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
 }
});
