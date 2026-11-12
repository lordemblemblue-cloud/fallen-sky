import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGame3DMarketLedgerDraft179,auditGame3DMarketLedgerDraft179}
 from '../marketEconomy179.mjs';
const q=()=>({
 requestId:'11111111-1111-4111-8111-111111111111',
 listingId:'22222222-2222-4222-8222-222222222222',
 itemInstanceId:'33333333-3333-4333-8333-333333333333',
 sellerAccountId:'seller1',buyerAccountId:'buyer2',
 askAGP:'100',expectedSnapshotFingerprint:'a'.repeat(64),
});
test('17.2-17.9 canonical balanced drafts never claim economic authorization',()=>{
 const a=buildGame3DMarketLedgerDraft179(q());
 assert.equal(a.ok,true);
 assert.deepEqual(a.entries.map(e=>e.deltaAGP),['-100','100']);
 assert.equal(auditGame3DMarketLedgerDraft179(a).verifiedDraftStructure,true);
 for(const flag of ['balancesVerified','buyerFundsReserved',
  'itemCustodyReserved','idempotencyReserved','paymentAuthorized',
  'settlementAuthorized','currencyDebited','currencyCredited','productionReady'])
  assert.equal(a[flag],false,flag);
 assert.equal(a.journalFingerprint,buildGame3DMarketLedgerDraft179(q()).journalFingerprint);
 for(const change of [{askAGP:'101'},{buyerAccountId:'buyer3'},
  {requestId:'44444444-4444-4444-8444-444444444444'},
  {itemInstanceId:'55555555-5555-4555-8555-555555555555'}]){
  const b=buildGame3DMarketLedgerDraft179({...q(),...change});
  assert.equal(b.ok,true);
  assert.notEqual(a.journalFingerprint,b.journalFingerprint);
 }
});
test('no malformed/overflow/zero price, invalid identity or self-buy',()=>{
 for(const change of [
  {askAGP:'0'},{askAGP:'01'},{askAGP:'1.01'},
  {askAGP:'100000001'},{askAGP:1},{askAGP:'-1'},
  {buyerAccountId:'seller1'},{buyerAccountId:'__anon__'},
  {requestId:'not-a-uuid'},{expectedSnapshotFingerprint:'abc'},
 ]){
  const d=buildGame3DMarketLedgerDraft179({...q(),...change});
  assert.equal(d.ok,false);
  assert.equal(d.paymentAuthorized,false);
 }
});
test('tampering with entries, balance claims and public hash fails audit',()=>{
 const d=buildGame3DMarketLedgerDraft179(q());
 for(const changes of [
  {entries:[d.entries[0],d.entries[0]]},
  {entries:[...d.entries,{role:'extra',accountId:'x',deltaAGP:'1'}]},
  {journalFingerprint:'b'.repeat(64)},
  {balancesVerified:true},{idempotencyReserved:true},
  {currencyDebited:true},{settlementAuthorized:true},
 ]){
  assert.equal(auditGame3DMarketLedgerDraft179({...d,...changes}).ok,false);
 }
});
test('manual migration has two-entry deferred check, no wallet balance writes',()=>{
 const sql=readFileSync(new URL(
  '../sql/022_foundation179_economic_drafts.sql',import.meta.url),'utf8');
 assert.match(sql,/game3d_market_economic_header_balanced/);
 assert.match(sql,/game3d_market_economic_draft_balanced/);
 assert.match(sql,/e\.n<>2 OR e\.net<>0/);
 assert.match(sql,/payment_authorized=false/);
 assert.match(sql,/game3d_market_economic_draft_entry_immutable/);
});
