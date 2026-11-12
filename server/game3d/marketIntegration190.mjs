// Marketplace Foundation 19.0 — safe integration of previous dry-run layers.
// This module cannot settle a transaction, publish listings or move items.
import {auditGame3DMarketLedgerDraft179} from './marketEconomy179.mjs';
import {auditGame3DMarketTransfer189} from './marketTransfer189.mjs';

const requiredGates=Object.freeze([
 'trusted_simulation_issuance_not_integrated',
 'current_transferable_title_ledger_not_implemented',
 'funded_agp_wallet_ledger_not_implemented',
 'all_inventory_equipment_forge_writers_not_fenced',
 'atomic_serializable_buyer_seller_settlement_not_implemented',
 'durable_replay_outbox_refund_reconciliation_not_implemented',
 'postgres_concurrency_security_economic_tests_not_run',
 'independent_release_review_not_completed',
]);

export function getGame3DMarketReleaseGate190(){
 return Object.freeze({
  version:'19.0',stage:'source-only-private-beta',
  productionReady:false,publicMarketplaceEnabled:false,
  listingPublicationEnabled:false,tradeEnabled:false,
  auctionSettlementEnabled:false,currencyMovementEnabled:false,
  escrowEnabled:false,itemTransferEnabled:false,
  reasons:[...requiredGates],releaseAuthorized:false,
 });
}
const denied=code=>({
 ok:false,code,dryRunOnly:true,planCompatible:false,
 sellerSourceTrustedForTrading:false,buyerAuthenticated:false,
 balanceVerified:false,replayProtected:false,custodyReserved:false,
 settlementAuthorized:false,paymentAuthorized:false,
 itemTransferred:false,productionReady:false,
 release:getGame3DMarketReleaseGate190(),
});

// This checks *shape and consistency* of previously made snapshots, not
// authenticity. Callers can forge every input; only separately authenticated
// transactions with DB locks and real wallet/title ledgers can authorize sales.
export function reviewGame3DMarketDryRun190({
 sellerPreflight,ledgerDraft,transferScenario
}={}){
 if(!sellerPreflight||sellerPreflight.ok!==true||
    sellerPreflight.preflightOnly!==true||
    sellerPreflight.version!=='17.1'||
    sellerPreflight.sellerSnapshotMatches!==true||
    sellerPreflight.sourceConsistencyObserved!==true||
    sellerPreflight.inventoryAllocationObserved!==true||
    sellerPreflight.unequippedObserved!==true||
    sellerPreflight.noExistingIntentObserved!==true||
    sellerPreflight.custodyReserved!==false||
    sellerPreflight.settlementAuthorized!==false||
    sellerPreflight.paymentAuthorized!==false||
    sellerPreflight.productionReady!==false)
  return denied('seller_preflight_not_eligible_for_dry_run');
 const ledger=auditGame3DMarketLedgerDraft179(ledgerDraft);
 if(!ledger.ok)return denied('unreadable_economic_draft');
 const title=auditGame3DMarketTransfer189({
  scenario:transferScenario,ledgerDraft,
 });
 if(!title.ok)return denied('unreadable_title_draft');
 if(sellerPreflight.snapshotFingerprint!==ledger.expectedSnapshotFingerprint||
    sellerPreflight.itemInstanceId!==ledger.itemInstanceId||
    sellerPreflight.askAGP!==ledger.askAGP||
    sellerPreflight.inventorySlot!==title.expectedSellerSlot||
    title.listingId!==ledger.listingId||
    title.itemInstanceId!==ledger.itemInstanceId||
    title.requestId!==ledger.requestId||
    title.journalFingerprint!==ledger.journalFingerprint)
  return denied('cross_layer_market_identity_mismatch');
 return {ok:true,version:'19.0',dryRunOnly:true,
  planCompatible:true,requestId:ledger.requestId,
  listingId:ledger.listingId,itemInstanceId:ledger.itemInstanceId,
  journalFingerprint:ledger.journalFingerprint,
  blueprintFingerprint:title.blueprintFingerprint,
  expectedSnapshotFingerprint:ledger.expectedSnapshotFingerprint,
  sourceConsistencyObservedInScenario:true,
  sellerSourceTrustedForTrading:false,buyerAuthenticated:false,
  balanceVerified:false,replayProtected:false,custodyReserved:false,
  settlementAuthorized:false,paymentAuthorized:false,
  itemTransferred:false,productionReady:false,
  release:getGame3DMarketReleaseGate190()};
}
