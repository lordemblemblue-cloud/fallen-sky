import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGame3DMarketLedgerDraft179}
 from '../marketEconomy179.mjs';
import {
 assessGame3DMarketAGPDraft192,createGame3DMarketAGPDraftInspector192,
} from '../marketAGPDraftAudit192.mjs';
import {createGame3DCharacterServices192}
 from '../characterServices192.mjs';

const draft=()=>buildGame3DMarketLedgerDraft179({
 requestId:'11111111-1111-4111-8111-111111111111',
 listingId:'22222222-2222-4222-8222-222222222222',
 itemInstanceId:'33333333-3333-4333-8333-333333333333',
 sellerAccountId:'seller1',buyerAccountId:'buyer1',
 askAGP:'100',expectedSnapshotFingerprint:'a'.repeat(64),
});
function records(){
 const d=draft();
 return {
  header:{
   request_id:d.requestId,listing_id:d.listingId,
   item_instance_id:d.itemInstanceId,
   seller_account_id:d.sellerAccountId,
   buyer_account_id:d.buyerAccountId,
   ask_agp:d.askAGP,fee_agp:'0',
   expected_snapshot_fingerprint:d.expectedSnapshotFingerprint,
   journal_fingerprint:d.journalFingerprint,
   draft_only:true,payment_authorized:false,
  },
  entries:[
   {request_id:d.requestId,entry_role:'buyer-debit',
    account_id:d.buyerAccountId,amount_agp:d.askAGP,sign:-1},
   {request_id:d.requestId,entry_role:'seller-credit',
    account_id:d.sellerAccountId,amount_agp:d.askAGP,sign:1},
  ],
 };
}
function fakePool({visible=true,throwOnEntries=false,changes={}}={}){
 const calls=[];let released=0;
 const rows=records();
 const pool={
  query:async()=>{throw Error('must use one PG client')},
  connect:async()=>({
   query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT * FROM game3d_market_economic_draft'))
     return {rowCount:visible?1:0,
      rows:visible?[{...rows.header,...changes}]:[]};
    if(sql.startsWith('SELECT request_id,entry_role')){
     if(throwOnEntries)throw Error('PG read failure');
     return {rowCount:rows.entries.length,rows:rows.entries};
    }
    return {rowCount:0,rows:[]};
   },
   release:()=>{released++},
  }),
 };
 return {pool,calls,get released(){return released}};
}
const trusted=async()=>({
 authenticated:true,identitySource:'trusted-server-session',
 accountId:'buyer1',
});
test('19.2 reconstructs AGP draft from canonical PG entries',()=>{
 const r=assessGame3DMarketAGPDraft192(records());
 assert.equal(r.ok,true);
 assert.equal(r.entryCount,2);
 assert.equal(r.draftJournalConsistent,true);
 for(const field of ['fundsVerified','balancesVerified',
  'idempotencyGuaranteed','authenticatedParticipant',
  'paymentAuthorized','settlementAuthorized','currencyDebited',
  'currencyCredited','productionReady'])
  assert.equal(r[field],false,field);
});
test('19.2 denies manipulated header, missing, extra or inverted entries',()=>{
 const source=records();
 for(const headerChange of [
  {ask_agp:'101'},{journal_fingerprint:'b'.repeat(64)},
  {fee_agp:'1'},{draft_only:false},{payment_authorized:true},
  {buyer_account_id:'otherBuyer'},
 ]){
  assert.equal(assessGame3DMarketAGPDraft192({
   header:{...source.header,...headerChange},entries:source.entries,
  }).ok,false);
 }
 for(const entries of [
  [],[source.entries[0]],
  [source.entries[0],source.entries[0]],
  [...source.entries,{...source.entries[0]}],
  [{...source.entries[0],sign:1},source.entries[1]],
  [{...source.entries[0],account_id:'intruder'},source.entries[1]],
  [{...source.entries[0],amount_agp:'101'},source.entries[1]],
  [{...source.entries[0],request_id:'ffffffff-ffff-4fff-8fff-ffffffffffff'},
   source.entries[1]],
 ]){
  assert.equal(assessGame3DMarketAGPDraft192({
   header:source.header,entries,
  }).ok,false);
 }
});
test('19.2 authenticates a journal participant and hides unrelated drafts',async()=>{
 const db=fakePool();
 const service=createGame3DMarketAGPDraftInspector192({
  pool:db.pool,resolveAuthenticatedSubject:trusted,
 });
 const r=await service.inspect({requestId:records().header.request_id});
 assert.equal(r.ok,true);
 assert.equal(r.participantRole,'buyer');
 assert.equal(r.authenticatedParticipant,true);
 assert.equal(r.settlementAuthorized,false);
 assert.equal(db.calls[0].sql,
  'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
 assert.deepEqual(db.calls[1].params,
  [records().header.request_id,'buyer1']);
 assert.deepEqual(db.calls[2].params,[records().header.request_id]);
 assert.equal(db.calls.at(-1).sql,'COMMIT');
 assert.equal(db.released,1);
 assert.ok(db.calls.every(x=>!/^(INSERT|UPDATE|DELETE)/.test(x.sql)));
 const hidden=fakePool({visible:false});
 const denied=await createGame3DMarketAGPDraftInspector192({
  pool:hidden.pool,resolveAuthenticatedSubject:trusted,
 }).inspect({requestId:records().header.request_id});
 assert.equal(denied.code,'market_draft_not_visible');
 assert.equal(hidden.calls.length,3);
});
test('19.2 refuses bogus identity and rolls back PG errors',async()=>{
 const db=fakePool();
 const s=createGame3DMarketAGPDraftInspector192({
  pool:db.pool,resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal((await s.inspect({requestId:records().header.request_id}))
  .code,'unverified_market_participant');
 assert.equal((await s.inspect({requestId:'wrong'})).ok,false);
 assert.equal(db.calls.length,0);
 const broken=fakePool({throwOnEntries:true});
 await assert.rejects(createGame3DMarketAGPDraftInspector192({
  pool:broken.pool,resolveAuthenticatedSubject:trusted,
 }).inspect({requestId:records().header.request_id}),/PG read failure/);
 assert.equal(broken.calls.at(-1).sql,'ROLLBACK');
 assert.equal(broken.released,1);
});
test('19.2 service remains read-only and public trading remains impossible',()=>{
 const s=createGame3DCharacterServices192({
  pool:{connect:async()=>{},query:async()=>{}},
  resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal(s.version,'19.2');
 assert.equal(typeof s.inspectPrivateAGPDraft,'function');
 assert.equal(typeof s.inspectBuyerInventoryCapacity,'function');
 assert.equal(s.inspectMarketplaceReleaseGate().releaseAuthorized,false);
 for(const x of ['debitAGP','creditAGP','transferItem','purchaseItem',
  'postListing','settlePurchase'])
  assert.equal(x in s,false);
});
