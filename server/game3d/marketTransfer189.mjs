// Marketplace 18.0–18.9: purely hypothetical custody-title transfer plan.
// Original issuance ownership is immutable. This never moves an item.
import {createHash} from 'node:crypto';
import {auditGame3DMarketLedgerDraft179} from './marketEconomy179.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const uuid=x=>typeof x==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const slot=x=>Number.isSafeInteger(x)&&x>=0&&x<200;
const fingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=code=>({ok:false,code,scenarioOnly:true,
 sellerOwnershipVerified:false,buyerIdentityVerified:false,
 buyerCapacityVerified:false,transferAuthorized:false,
 itemTransferred:false,settlementAuthorized:false,productionReady:false});

export function planGame3DMarketTransfer189({
 ledgerDraft,transferId,sellerCharacterId,buyerCharacterId,
 observedOwnerAccountId,observedOwnerCharacterId,
 observedSellerSlot,proposedBuyerSlot,observedEquipped,
 observedBuyerSlotVacant
}={}){
 const ledger=auditGame3DMarketLedgerDraft179(ledgerDraft);
 if(!ledger.ok||!uuid(transferId)||!id(sellerCharacterId)||
  !id(buyerCharacterId)||!id(observedOwnerAccountId)||
  !id(observedOwnerCharacterId)||!slot(observedSellerSlot)||
  !slot(proposedBuyerSlot)||typeof observedEquipped!=='boolean'||
  typeof observedBuyerSlotVacant!=='boolean')
  return fail('invalid_transfer_scenario');
 if(observedOwnerAccountId!==ledger.sellerAccountId||
    observedOwnerCharacterId!==sellerCharacterId||
    observedEquipped||!observedBuyerSlotVacant)
  return fail('hypothetical_custody_conflict');
 // Caller-supplied observations are NOT trusted DB evidence. A private beta
 // writer must re-read both owners, slot occupancy and title under locks.
 const blueprint={
  version:'18.9',transferId,requestId:ledger.requestId,
  listingId:ledger.listingId,itemInstanceId:ledger.itemInstanceId,
  sellerAccountId:ledger.sellerAccountId,
  sellerCharacterId,buyerAccountId:ledger.buyerAccountId,
  buyerCharacterId,
  expectedSellerSlot:observedSellerSlot,
  proposedBuyerSlot,
  expectedSnapshotFingerprint:ledger.expectedSnapshotFingerprint,
  journalFingerprint:ledger.journalFingerprint,
  titleOperation:'proposal_only',
 };
 return {ok:true,...blueprint,
  blueprintFingerprint:fingerprint(blueprint),scenarioOnly:true,
  sellerOwnershipVerified:false,buyerIdentityVerified:false,
  buyerCapacityVerified:false,buyerSlotReserved:false,
  itemEquippedInScenario:false,buyerSlotVacantInScenario:true,
  immutableIssuancePreserved:true,transferAuthorized:false,
  itemTransferred:false,settlementAuthorized:false,
  productionReady:false};
}
export function auditGame3DMarketTransfer189({scenario,ledgerDraft}={}){
 if(!scenario||scenario.ok!==true||scenario.scenarioOnly!==true||
    scenario.transferAuthorized!==false||scenario.itemTransferred!==false||
    scenario.settlementAuthorized!==false||
    scenario.sellerOwnershipVerified!==false||
    scenario.buyerCapacityVerified!==false||
    scenario.buyerIdentityVerified!==false||
    scenario.buyerSlotReserved!==false||
    !digest(scenario.blueprintFingerprint))
  return fail('unsafe_transfer_scenario');
 const rebuilt=planGame3DMarketTransfer189({
  ledgerDraft,transferId:scenario.transferId,
  sellerCharacterId:scenario.sellerCharacterId,
  buyerCharacterId:scenario.buyerCharacterId,
  observedOwnerAccountId:scenario.sellerAccountId,
  observedOwnerCharacterId:scenario.sellerCharacterId,
  observedSellerSlot:scenario.expectedSellerSlot,
  proposedBuyerSlot:scenario.proposedBuyerSlot,
  observedEquipped:false,observedBuyerSlotVacant:true,
 });
 if(!rebuilt.ok||scenario.blueprintFingerprint!==rebuilt.blueprintFingerprint||
  scenario.journalFingerprint!==rebuilt.journalFingerprint||
  scenario.expectedSnapshotFingerprint!==rebuilt.expectedSnapshotFingerprint||
  scenario.titleOperation!=='proposal_only')
  return fail('transfer_blueprint_changed');
 return {...rebuilt,verifiedScenarioStructure:true};
}
