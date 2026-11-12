// Marketplace Foundation 19.3 — server-authenticated, READ-ONLY wallet
// candidate reconciliation. This is not an authoritative funded wallet.
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const MAX=9000000000000000000n;
const toInteger=(value,{signed=false}={})=>{
 const text=typeof value==='string'?value:
  typeof value==='bigint'?value.toString():
  typeof value==='number'&&Number.isSafeInteger(value)?String(value):null;
 if(text===null||
    !(signed?/^(0|[1-9][0-9]*|-[1-9][0-9]*)$/:/^(0|[1-9][0-9]*)$/).test(text)||
    text.length>20)return null;
 const n=BigInt(text);
 return n>=-MAX&&n<=MAX?n:null;
};
const denied=code=>({ok:false,code,reviewOnly:true,
 draftJournalReconciled:false,fundingVerified:false,
 spendableBalanceVerified:false,accountSpendEnabled:false,
 paymentAuthorized:false,currencyReserved:false,
 settlementAuthorized:false,productionReady:false});

// All inputs are **observations** from one private PG read. Zero or positive
// draft totals are not evidence that AGP was earned, funded, or spendable.
export function assessGame3DWalletDraftReconciliation193({
 wallet,rollup,accountId
}={}){
 const balance=toInteger(wallet?.observed_balance_agp);
 const journal=toInteger(rollup?.journal_total_agp,{signed:true});
 const count=toInteger(rollup?.journal_entry_count);
 const revision=toInteger(wallet?.revision);
 if(!key(accountId)||!wallet||wallet.owner_account_id!==accountId||
    rollup?.owner_account_id!==accountId||
    wallet.source_kind!=='unverified_preview'||
    wallet.review_only!==true||
    wallet.funding_verified!==false||
    wallet.spending_enabled!==false||
    balance===null||journal===null||count===null||
    revision===null||count>1000000n)
  return denied('wallet_candidate_invalid_or_untrusted');
 if(journal<0n)return denied('wallet_draft_overdrawn');
 if(balance!==journal)return denied('wallet_draft_reconciliation_mismatch');
 if(count===0n&&balance!==0n)
  return denied('unbacked_wallet_draft_balance');
 return {ok:true,version:'19.3',reviewOnly:true,
  ownerAccountId:accountId,
  observedDraftBalanceAGP:balance.toString(),
  observedDraftEntryCount:count.toString(),
  observedDraftRevision:revision.toString(),
  draftJournalReconciled:true,
  fundingVerified:false,spendableBalanceVerified:false,
  accountSpendEnabled:false,paymentAuthorized:false,
  currencyReserved:false,settlementAuthorized:false,
  productionReady:false};
}

export function createGame3DMarketWalletReviewer193({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.connect||typeof resolveAuthenticatedSubject!=='function')
  throw Error('19.3 wallet review needs private PG and trusted server sessions');
 const inspect=async({serverRequestContext}={})=>{
  const subject=await resolveAuthenticatedSubject(serverRequestContext);
  if(!subject||subject.authenticated!==true||
     subject.identitySource!=='trusted-server-session'||
     !key(subject.accountId))
   return denied('unverified_wallet_account');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
   const wallet=await c.query(
    'SELECT owner_account_id,observed_balance_agp,revision,'+
    'source_kind,review_only,funding_verified,spending_enabled '+
    'FROM game3d_market_agp_wallet_candidate WHERE owner_account_id=$1',
    [subject.accountId]);
   if(wallet.rowCount!==1){
    await c.query('COMMIT');
    return denied('private_wallet_candidate_missing');
   }
   // NUMERIC sum avoids bigint overflow during aggregation; the reviewer
   // rejects any aggregate outside the narrow candidate bounds.
   const rollup=await c.query(
    'SELECT $1::text AS owner_account_id,'+
    'COALESCE(SUM(delta_agp::numeric),0)::text AS journal_total_agp,'+
    'COUNT(*)::text AS journal_entry_count '+
    'FROM game3d_market_agp_wallet_draft_entry '+
    'WHERE owner_account_id=$1',
    [subject.accountId]);
   const verdict=rollup.rowCount===1?
    assessGame3DWalletDraftReconciliation193({
     wallet:wallet.rows[0],rollup:rollup.rows[0],
     accountId:subject.accountId}):
    denied('wallet_draft_rollup_missing');
   await c.query('COMMIT');
   return verdict;
  }catch(error){
   try{await c.query('ROLLBACK')}catch{}
   throw error;
  }finally{c.release()}
 };
 return Object.freeze({inspect,readOnly:true,
  accountSpendEnabled:false,settlementEnabled:false});
}
