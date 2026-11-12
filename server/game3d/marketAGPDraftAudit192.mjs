// Marketplace 19.2 — private, authenticated inspection of AGP DRAFT records.
// This audits record consistency only; no balances, commitments or payments.
import {buildGame3DMarketLedgerDraft179} from './marketEconomy179.mjs';

const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const uuid=x=>typeof x==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const positive=x=>{
 const s=typeof x==='bigint'?x.toString():
  typeof x==='number'&&Number.isSafeInteger(x)?String(x):x;
 return typeof s==='string'&&/^[1-9][0-9]*$/.test(s)&&
  BigInt(s)<=100000000n?s:null;
};
const deny=code=>({ok:false,code,draftInspectionOnly:true,
 fundsVerified:false,balancesVerified:false,idempotencyGuaranteed:false,
 paymentAuthorized:false,settlementAuthorized:false,
 currencyDebited:false,currencyCredited:false,productionReady:false});

// Only private DB rows may be passed here by the caller. Pure comparison
// does not authenticate a statement or prove funding/settlement.
export function assessGame3DMarketAGPDraft192({header,entries}={}){
 const askAGP=positive(header?.ask_agp);
 if(!header||!askAGP||header.draft_only!==true||
    header.payment_authorized!==false||
    header.fee_agp==null||String(header.fee_agp)!=='0'||
    !Array.isArray(entries)||entries.length!==2)
  return deny('invalid_agp_draft_record');
 const expected=buildGame3DMarketLedgerDraft179({
  requestId:String(header.request_id??''),
  listingId:String(header.listing_id??''),
  itemInstanceId:String(header.item_instance_id??''),
  sellerAccountId:header.seller_account_id,
  buyerAccountId:header.buyer_account_id,
  askAGP,expectedSnapshotFingerprint:header.expected_snapshot_fingerprint,
 });
 if(!expected.ok||header.journal_fingerprint!==expected.journalFingerprint)
  return deny('agp_draft_fingerprint_mismatch');
 const observedRoles=new Set();
 for(const e of entries){
  if(!e||String(e.request_id)!==expected.requestId||
     (e.entry_role!=='buyer-debit'&&e.entry_role!=='seller-credit')||
     observedRoles.has(e.entry_role))
   return deny('invalid_agp_draft_entry');
  observedRoles.add(e.entry_role);
  const buyer=e.entry_role==='buyer-debit';
  const accountId=buyer?expected.buyerAccountId:expected.sellerAccountId;
  const sign=buyer?-1:1;
  if(e.account_id!==accountId||positive(e.amount_agp)!==askAGP||
     Number(e.sign)!==sign)
   return deny('agp_draft_entry_mismatch');
 }
 if(observedRoles.size!==2)return deny('missing_agp_draft_entry');
 return {ok:true,version:'19.2',draftInspectionOnly:true,
  requestId:expected.requestId,listingId:expected.listingId,
  itemInstanceId:expected.itemInstanceId,
  journalFingerprint:expected.journalFingerprint,
  entryCount:2,draftJournalConsistent:true,
  fundsVerified:false,balancesVerified:false,
  idempotencyGuaranteed:false,authenticatedParticipant:false,
  paymentAuthorized:false,settlementAuthorized:false,
  currencyDebited:false,currencyCredited:false,productionReady:false};
}

export function createGame3DMarketAGPDraftInspector192({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.connect||typeof resolveAuthenticatedSubject!=='function')
  throw Error('19.2 draft audit needs private PG and trusted session resolver');
 const inspect=async({serverRequestContext,requestId}={})=>{
  if(!uuid(requestId))return deny('invalid_draft_request_id');
  const subject=await resolveAuthenticatedSubject(serverRequestContext);
  if(!subject||subject.authenticated!==true||
     subject.identitySource!=='trusted-server-session'||
     !key(subject.accountId))
   return deny('unverified_market_participant');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
   const record=await c.query(
    'SELECT * FROM game3d_market_economic_draft '+
    'WHERE request_id=$1 AND '+
    '(seller_account_id=$2 OR buyer_account_id=$2)',
    [requestId,subject.accountId]);
   if(record.rowCount!==1){
    await c.query('COMMIT');
    // No existence oracle for unrelated accounts.
    return deny('market_draft_not_visible');
   }
   const entries=await c.query(
    'SELECT request_id,entry_role,account_id,amount_agp,sign '+
    'FROM game3d_market_economic_draft_entry WHERE request_id=$1',
    [requestId]);
   const result=assessGame3DMarketAGPDraft192({
    header:record.rows[0],entries:entries.rows,
   });
   await c.query('COMMIT');
   if(!result.ok)return result;
   return {...result,authenticatedParticipant:true,
    participantRole:record.rows[0].seller_account_id===subject.accountId?
     'seller':'buyer'};
  }catch(error){
   try{await c.query('ROLLBACK')}catch{}
   throw error;
  }finally{c.release()}
 };
 return Object.freeze({inspect,readOnly:true,settlementEnabled:false});
}
