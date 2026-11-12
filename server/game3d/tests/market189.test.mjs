import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGame3DMarketLedgerDraft179} from '../marketEconomy179.mjs';
import {planGame3DMarketTransfer189,auditGame3DMarketTransfer189}
 from '../marketTransfer189.mjs';
const ledger=()=>buildGame3DMarketLedgerDraft179({
 requestId:'11111111-1111-4111-8111-111111111111',
 listingId:'22222222-2222-4222-8222-222222222222',
 itemInstanceId:'33333333-3333-4333-8333-333333333333',
 sellerAccountId:'seller1',buyerAccountId:'buyer2',
 askAGP:'100',expectedSnapshotFingerprint:'a'.repeat(64),
});
const input=()=>({
 ledgerDraft:ledger(),
 transferId:'44444444-4444-4444-8444-444444444444',
 sellerCharacterId:'hero1',buyerCharacterId:'hero2',
 observedOwnerAccountId:'seller1',observedOwnerCharacterId:'hero1',
 observedSellerSlot:199,proposedBuyerSlot:0,
 observedEquipped:false,observedBuyerSlotVacant:true,
});
test('18.0-18.9 transfer blueprint stays a non-authoritative scenario',()=>{
 const scenario=planGame3DMarketTransfer189(input());
 assert.equal(scenario.ok,true);
 assert.equal(scenario.expectedSellerSlot,199);
 assert.equal(scenario.proposedBuyerSlot,0);
 assert.equal(auditGame3DMarketTransfer189({
  scenario,ledgerDraft:ledger(),
 }).verifiedScenarioStructure,true);
 for(const key of ['sellerOwnershipVerified','buyerIdentityVerified',
  'buyerCapacityVerified','buyerSlotReserved','transferAuthorized',
  'itemTransferred','settlementAuthorized','productionReady'])
  assert.equal(scenario[key],false);
});
test('reject owner substitution, equipped item, occupied buyer slot or bad slot',()=>{
 for(const change of [
  {observedOwnerAccountId:'buyer2'},
  {observedOwnerCharacterId:'notHero'},
  {observedEquipped:true},
  {observedBuyerSlotVacant:false},
  {proposedBuyerSlot:200},
  {observedSellerSlot:'0'},
  {transferId:'bad'},
 ]){
  assert.equal(planGame3DMarketTransfer189({...input(),...change}).ok,false);
 }
});
test('transfer scenario tracks ledger and rejects mismatched / modified proofs',()=>{
 const scenario=planGame3DMarketTransfer189(input());
 const l=ledger();
 const other=buildGame3DMarketLedgerDraft179({
  requestId:l.requestId,listingId:l.listingId,itemInstanceId:l.itemInstanceId,
  sellerAccountId:l.sellerAccountId,buyerAccountId:l.buyerAccountId,
  askAGP:'101',expectedSnapshotFingerprint:l.expectedSnapshotFingerprint,
 });
 assert.equal(auditGame3DMarketTransfer189({scenario,ledgerDraft:other}).ok,false);
 for(const field of [
  {blueprintFingerprint:'b'.repeat(64)},
  {transferAuthorized:true},{itemTransferred:true},
  {sellerOwnershipVerified:true},{buyerSlotReserved:true},
  {titleOperation:'transfer'},
 ]){
  assert.equal(auditGame3DMarketTransfer189({
   scenario:{...scenario,...field},ledgerDraft:l,
  }).ok,false);
 }
});
test('title draft schema binds request, original owner and immutable proposal',()=>{
 const sql=readFileSync(new URL(
  '../sql/023_foundation189_title_transfer_drafts.sql',import.meta.url),'utf8');
 assert.match(sql,/item_instance_id uuid NOT NULL UNIQUE/);
 assert.match(sql,/game3d_market_draft_scoped_parties_189/);
 assert.match(sql,/REFERENCES game3d_item_issuance/);
 assert.match(sql,/CHECK\(item_transferred=false\)/);
 assert.match(sql,/CHECK\(settlement_authorized=false\)/);
 assert.match(sql,/game3d_market_title_transfer_draft_immutable/);
});
