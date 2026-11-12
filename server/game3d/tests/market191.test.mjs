import test from 'node:test';
import assert from 'node:assert/strict';
import {
 assessGame3DBuyerCapacity191,createGame3DBuyerCapacityReviewer191,
} from '../marketBuyerCapacity191.mjs';
import {createGame3DCharacterServices191}
 from '../characterServices191.mjs';

const authenticated=async()=>({
 authenticated:true,identitySource:'trusted-server-session',accountId:'buyer1',
});
function fakePool({slots=[0,2],missingState=false,
 badOwner=false,throwAtSlots=false,revision='3'}={}){
 const queries=[];let released=0;
 const pool={
  query:async()=>{throw Error('unexpected out-of-transaction read')},
  connect:async()=>({
   query:async(sql,params)=>{
    queries.push({sql,params});
    if(sql.startsWith('SELECT owner_id,character_id,revision')){
     return {rowCount:1,rows:[{
      owner_id:badOwner?'someoneElse':'buyer1',
      character_id:'heroBuyer',revision:1,
     }]};
    }
    if(sql.startsWith('SELECT capacity,revision')){
     return {rowCount:missingState?0:1,
      rows:missingState?[]:[{capacity:200,revision}]};
    }
    if(sql.startsWith('SELECT slot_index')){
     if(throwAtSlots)throw Error('temporary database failure');
     return {rowCount:slots.length,rows:slots.map(slot_index=>({slot_index}))};
    }
    return {rowCount:0,rows:[]};
   },
   release:()=>{released++},
  }),
 };
 return {pool,queries,get released(){return released}};
}

test('19.1 checks 200-slot capacity and finds first vacant position',()=>{
 const r=assessGame3DBuyerCapacity191({
  state:{capacity:200,revision:'3'},slots:[
   {slot_index:0},{slot_index:2},
  ],
 });
 assert.equal(r.ok,true);
 assert.equal(r.proposedSlot,1);
 assert.equal(r.inventoryCount,2);
 assert.equal(r.freeSlots,198);
 for(const k of ['destinationSlotReserved','buyerFundsVerified',
  'itemTransferAuthorized','paymentAuthorized','settlementAuthorized',
  'productionReady'])assert.equal(r[k],false,k);
 assert.equal(assessGame3DBuyerCapacity191({
  state:{capacity:200,revision:0},
  slots:[{slot_index:0}],requestedSlot:0,
 }).code,'buyer_requested_slot_occupied');
 assert.equal(assessGame3DBuyerCapacity191({
  state:{capacity:200,revision:0},
  slots:[{slot_index:0}],requestedSlot:199,
 }).proposedSlot,199);
});
test('19.1 denies full, malformed and duplicated inventory slots',()=>{
 const all=Array.from({length:200},(_,i)=>({slot_index:i}));
 assert.equal(assessGame3DBuyerCapacity191({
  state:{capacity:200,revision:0},slots:all,
 }).code,'buyer_inventory_full');
 for(const slots of [
  [{slot_index:0},{slot_index:0}],
  [{slot_index:'00'}],[{slot_index:-1}],
  [{slot_index:200}],[{slot_index:1.5}],
 ]){
  assert.equal(assessGame3DBuyerCapacity191({
   state:{capacity:200,revision:0},slots,
  }).ok,false);
 }
 for(const state of [
  {capacity:201,revision:0},{capacity:200,revision:-1},
  {capacity:200,revision:'1.2'},null,
 ]){
  assert.equal(assessGame3DBuyerCapacity191({state,slots:[]}).ok,false);
 }
 assert.equal(assessGame3DBuyerCapacity191({
  state:{capacity:200,revision:0},slots:[],requestedSlot:200,
 }).ok,false);
});
test('19.1 authenticates buyer and reads only own slots in one transaction',async()=>{
 const db=fakePool();
 const reviewer=createGame3DBuyerCapacityReviewer191({
  pool:db.pool,resolveAuthenticatedSubject:authenticated,
 });
 const r=await reviewer.inspect({
  characterId:'heroBuyer',requestedSlot:1,
 });
 assert.equal(r.ok,true);
 assert.equal(r.proposedSlot,1);
 assert.equal(r.buyerIdentityVerified,true);
 assert.equal(r.buyerAccountId,'buyer1');
 assert.equal(r.destinationSlotReserved,false);
 assert.equal(db.queries[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
 assert.equal(db.queries.at(-1).sql,'COMMIT');
 assert.equal(db.released,1);
 assert.deepEqual(db.queries.slice(1,4).map(q=>q.params),[
  ['buyer1','heroBuyer'],['buyer1','heroBuyer'],['buyer1','heroBuyer'],
 ]);
 assert.ok(db.queries.every(q=>!/^(UPDATE|INSERT|DELETE)/.test(q.sql)));
});
test('19.1 refuses unauthenticated or wrong-owner requests before reading slots',async()=>{
 const db=fakePool();
 const reviewer=createGame3DBuyerCapacityReviewer191({
  pool:db.pool,resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal((await reviewer.inspect({characterId:'heroBuyer'})).code,
  'unverified_buyer_session');
 assert.equal((await reviewer.inspect({characterId:'__anon__'})).ok,false);
 assert.equal((await reviewer.inspect({
  characterId:'heroBuyer',requestedSlot:-1,
 })).ok,false);
 assert.equal(db.queries.length,0);
 const wrong=fakePool({badOwner:true});
 const blocked=await createGame3DBuyerCapacityReviewer191({
  pool:wrong.pool,resolveAuthenticatedSubject:authenticated,
 }).inspect({characterId:'heroBuyer'});
 assert.equal(blocked.code,'unverified_buyer_character');
 assert.equal(wrong.queries.some(q=>q.sql.startsWith('SELECT slot_index')),false);
 const missing=fakePool({missingState:true});
 assert.equal((await createGame3DBuyerCapacityReviewer191({
  pool:missing.pool,resolveAuthenticatedSubject:authenticated,
 }).inspect({characterId:'heroBuyer'})).code,'buyer_inventory_state_missing');
});
test('19.1 rolls back failures and does not add economic operations',async()=>{
 const db=fakePool({throwAtSlots:true});
 const reviewer=createGame3DBuyerCapacityReviewer191({
  pool:db.pool,resolveAuthenticatedSubject:authenticated,
 });
 await assert.rejects(reviewer.inspect({characterId:'heroBuyer'}),
  /temporary database failure/);
 assert.equal(db.queries.at(-1).sql,'ROLLBACK');
 assert.equal(db.released,1);
 const service=createGame3DCharacterServices191({
  pool:{query:async()=>{},connect:async()=>{}},
  resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal(service.version,'19.1');
 assert.equal(typeof service.inspectBuyerInventoryCapacity,'function');
 assert.equal(service.inspectMarketplaceReleaseGate().releaseAuthorized,false);
 for(const method of ['purchaseItem','postListing','settlePurchase',
  'creditAGP','debitAGP','transferItem','reserveBuyerSlot']){
  assert.equal(method in service,false);
 }
});
