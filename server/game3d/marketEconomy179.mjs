// Marketplace 17.2–17.9: offline, deterministic AGP journal DRAFT ONLY.
// Neither these entries nor their fingerprint represent balances or settlement.
import {createHash} from 'node:crypto';
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const uuid=x=>typeof x==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const amount=x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x)&&
 x.length<=9&&BigInt(x)<=100000000n;
const fail=code=>({ok:false,code,draftOnly:true,balancesVerified:false,
 idempotencyReserved:false,paymentAuthorized:false,settlementAuthorized:false,
 currencyDebited:false,currencyCredited:false,productionReady:false});
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

export function buildGame3DMarketLedgerDraft179({
 requestId,listingId,itemInstanceId,sellerAccountId,buyerAccountId,
 askAGP,expectedSnapshotFingerprint
}={}){
 if(!uuid(requestId)||!uuid(listingId)||!uuid(itemInstanceId)||
  !key(sellerAccountId)||!key(buyerAccountId)||
  sellerAccountId===buyerAccountId||!amount(askAGP)||
  !hash(expectedSnapshotFingerprint))
  return fail('invalid_draft_ledger_request');
 const immutable={
  version:'17.9',requestId,listingId,itemInstanceId,
  sellerAccountId,buyerAccountId,askAGP,expectedSnapshotFingerprint,
  feeAGP:'0',entries:[
   {role:'buyer-debit',accountId:buyerAccountId,deltaAGP:'-'+askAGP},
   {role:'seller-credit',accountId:sellerAccountId,deltaAGP:askAGP},
  ],
 };
 const journalFingerprint=digest(immutable);
 return {ok:true,...immutable,journalFingerprint,draftOnly:true,
  entriesBalanced:true,balancesVerified:false,
  buyerFundsReserved:false,itemCustodyReserved:false,
  idempotencyReserved:false,zeroFeesAssumed:true,
  paymentAuthorized:false,settlementAuthorized:false,
  currencyDebited:false,currencyCredited:false,productionReady:false};
}

// The reviewer checks the entire canonical envelope, not only its public hash.
// Replays and wallet ownership can ONLY be decided by a future DB writer.
export function auditGame3DMarketLedgerDraft179(draft){
 if(!draft||draft.ok!==true||draft.draftOnly!==true||
    !hash(draft.journalFingerprint)||draft.feeAGP!=='0'||
    draft.paymentAuthorized!==false||draft.settlementAuthorized!==false||
    draft.currencyDebited!==false||draft.currencyCredited!==false||
    draft.balancesVerified!==false||draft.idempotencyReserved!==false||
    draft.buyerFundsReserved!==false||draft.itemCustodyReserved!==false)
  return fail('unsafe_ledger_draft');
 const fresh=buildGame3DMarketLedgerDraft179({
  requestId:draft.requestId,listingId:draft.listingId,
  itemInstanceId:draft.itemInstanceId,
  sellerAccountId:draft.sellerAccountId,buyerAccountId:draft.buyerAccountId,
  askAGP:draft.askAGP,expectedSnapshotFingerprint:draft.expectedSnapshotFingerprint,
 });
 if(!fresh.ok)return fresh;
 // Do not trust caller-supplied 'balanced', entries or checksum assertions.
 if(draft.journalFingerprint!==fresh.journalFingerprint||
    JSON.stringify(draft.entries)!==JSON.stringify(fresh.entries)||
    draft.version!=='17.9'||draft.entriesBalanced!==true)
  return fail('ledger_draft_mismatch');
 const sum=fresh.entries.reduce((n,e)=>n+BigInt(e.deltaAGP),0n);
 if(sum!==0n)return fail('ledger_draft_unbalanced');
 return {...fresh,verifiedDraftStructure:true};
}
