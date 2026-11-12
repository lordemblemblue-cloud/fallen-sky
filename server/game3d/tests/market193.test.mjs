import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 assessGame3DWalletDraftReconciliation193,
 createGame3DMarketWalletReviewer193,
} from '../marketWalletReview193.mjs';
import {createGame3DCharacterServices193}
 from '../characterServices193.mjs';

const account='buyer1';
const wallet=()=>({
 owner_account_id:account,
 observed_balance_agp:'150',revision:'2',
 source_kind:'unverified_preview',review_only:true,
 funding_verified:false,spending_enabled:false,
});
const rollup=()=>({
 owner_account_id:account,
 journal_total_agp:'150',journal_entry_count:'2',
});
test('19.3 verifies arithmetic only, never funded or spendable AGP',()=>{
 const r=assessGame3DWalletDraftReconciliation193({
  wallet:wallet(),rollup:rollup(),accountId:account,
 });
 assert.equal(r.ok,true);
 assert.equal(r.observedDraftBalanceAGP,'150');
 assert.equal(r.draftJournalReconciled,true);
 for(const k of ['fundingVerified','spendableBalanceVerified',
  'accountSpendEnabled','paymentAuthorized','currencyReserved',
  'settlementAuthorized','productionReady'])
  assert.equal(r[k],false,k);
 assert.equal(assessGame3DWalletDraftReconciliation193({
  wallet:{...wallet(),observed_balance_agp:'0'},
  rollup:{...rollup(),journal_total_agp:'0',journal_entry_count:'0'},
  accountId:account,
 }).ok,true);
});
test('19.3 denies forged funding flags, amounts, negative totals and scope',()=>{
 for(const change of [
  {wallet:{...wallet(),funding_verified:true}},
  {wallet:{...wallet(),spending_enabled:true}},
  {wallet:{...wallet(),review_only:false}},
  {wallet:{...wallet(),owner_account_id:'other'}},
  {wallet:{...wallet(),source_kind:'real_funds'}},
  {wallet:{...wallet(),observed_balance_agp:'-1'}},
  {wallet:{...wallet(),observed_balance_agp:'1.5'}},
  {wallet:{...wallet(),observed_balance_agp:'9000000000000000001'}},
  {wallet:{...wallet(),revision:'-1'}},
  {rollup:{...rollup(),owner_account_id:'intruder'}},
  {rollup:{...rollup(),journal_total_agp:'-1'}},
  {rollup:{...rollup(),journal_total_agp:'149'}},
  {rollup:{...rollup(),journal_entry_count:'1000001'}},
  {rollup:{...rollup(),journal_entry_count:'1.3'}},
 ]){
  const r=assessGame3DWalletDraftReconciliation193({
   wallet:change.wallet??wallet(),rollup:change.rollup??rollup(),
   accountId:account,
  });
  assert.equal(r.ok,false,JSON.stringify(change));
  assert.equal(r.paymentAuthorized,false);
 }
});
function fakeDb({
 absent=false,wrongState=false,throwAt='',
}={}){
 const queries=[];let released=0;
 return {
  pool:{
   connect:async()=>({
    query:async(sql,params)=>{
     queries.push({sql,params});
     if(throwAt&&sql.startsWith(throwAt))
      throw Error('simulated PG failure');
     if(sql.startsWith('SELECT owner_account_id,observed_balance_agp'))
      return {rowCount:absent?0:1,
       rows:absent?[]:[{
        ...wallet(),...(wrongState?{spending_enabled:true}:{}),
       }]};
     if(sql.startsWith('SELECT $1::text AS owner_account_id'))
      return {rowCount:1,rows:[rollup()]};
     return {rowCount:0,rows:[]};
    },
    release:()=>{released++},
   }),
   query:async()=>{throw Error('not a transaction-scoped read')},
  },
  queries,
  get released(){return released},
 };
}
const trusted=async()=>({
 authenticated:true,identitySource:'trusted-server-session',
 accountId:account,
});
test('19.3 uses a single serializable read-only PG transaction per account',async()=>{
 const db=fakeDb();
 const review=createGame3DMarketWalletReviewer193({
  pool:db.pool,resolveAuthenticatedSubject:trusted,
 });
 const r=await review.inspect({});
 assert.equal(r.ok,true);
 assert.equal(r.ownerAccountId,account);
 assert.equal(r.spendableBalanceVerified,false);
 assert.equal(db.queries[0].sql,
  'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
 assert.deepEqual(db.queries[1].params,[account]);
 assert.deepEqual(db.queries[2].params,[account]);
 assert.equal(db.queries.at(-1).sql,'COMMIT');
 assert.equal(db.released,1);
 assert.equal(db.queries.some(q=>/^(INSERT|DELETE|UPDATE)/.test(q.sql)),false);
});
test('19.3 protects anonymous and absent wallets, rolls back on failure',async()=>{
 const db=fakeDb();
 const anonymous=createGame3DMarketWalletReviewer193({
  pool:db.pool,resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal((await anonymous.inspect()).code,'unverified_wallet_account');
 assert.equal(db.queries.length,0);
 const absent=fakeDb({absent:true});
 const missing=await createGame3DMarketWalletReviewer193({
  pool:absent.pool,resolveAuthenticatedSubject:trusted,
 }).inspect();
 assert.equal(missing.code,'private_wallet_candidate_missing');
 assert.equal(absent.queries.length,3);
 const broken=fakeDb({throwAt:'SELECT $1::text AS owner_account_id'});
 await assert.rejects(createGame3DMarketWalletReviewer193({
  pool:broken.pool,resolveAuthenticatedSubject:trusted,
 }).inspect(),/simulated PG failure/);
 assert.equal(broken.queries.at(-1).sql,'ROLLBACK');
 assert.equal(broken.released,1);
 const bad=fakeDb({wrongState:true});
 assert.equal((await createGame3DMarketWalletReviewer193({
  pool:bad.pool,resolveAuthenticatedSubject:trusted,
 }).inspect()).ok,false);
});
test('19.3 schema is draft only; fixed 022 requires complete header',()=>{
 const migration024=readFileSync(new URL(
  '../sql/024_foundation193_agp_wallet_candidates.sql',import.meta.url),'utf8');
 assert.match(migration024,/CHECK\(funding_verified=false\)/);
 assert.match(migration024,/CHECK\(spending_enabled=false\)/);
 assert.match(migration024,/game3d_market_agp_wallet_draft_entry_immutable/);
 const migration022=readFileSync(new URL(
  '../sql/022_foundation179_economic_drafts.sql',import.meta.url),'utf8');
 assert.match(migration022,/CREATE CONSTRAINT TRIGGER game3d_market_economic_header_balanced/);
 assert.match(migration022,/CREATE CONSTRAINT TRIGGER game3d_market_economic_draft_balanced/);
 assert.equal(migration022.includes('\\nCREATE TABLE'),false);
});
test('19.3 facade remains closed to all live economic mutations',()=>{
 const facade=createGame3DCharacterServices193({
  pool:{connect:async()=>{},query:async()=>{}},
  resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal(facade.version,'19.3');
 assert.equal(typeof facade.inspectPrivateWalletDraft,'function');
 assert.equal(typeof facade.inspectPrivateAGPDraft,'function');
 assert.equal(facade.inspectMarketplaceReleaseGate().releaseAuthorized,false);
 assert.equal(facade.productionReleaseAuthorized,false);
 for(const x of ['fundAGP','debitAGP','creditAGP','postListing',
  'purchaseItem','transferItem','settlePurchase'])
  assert.equal(x in facade,false);
});
