import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../../base44/shared/duelJournalProof.mjs';
import {
 assessGame3DFundingCandidate199,createGame3DFundingCandidateReviewer199,
} from '../marketFundingReview199.mjs';
import {createGame3DCharacterServices199}
 from '../characterServices199.mjs';

const hash=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
const claimId='11111111-1111-4111-8111-111111111111';
const who='owner1',hero='hero1';
function source(){
 const awards=[{awardIndex:0,definitionId:'sword1'}];
 const simulation={
  completion_id:'quest-42',simulation_id:'sim-1',simulation_tick:'12',
  owner_id:who,character_id:hero,source_kind:'quest',
  evidence_digest:'a'.repeat(64),awards,
 };
 simulation.receipt_digest=hash({
  completionId:simulation.completion_id,simulationId:simulation.simulation_id,
  simulationTick:12,ownerId:who,characterId:hero,sourceKind:'quest',
  awards,evidenceDigest:simulation.evidence_digest,
 });
 const completion={
  completion_id:simulation.completion_id,owner_id:who,character_id:hero,
  source_kind:'quest',awards,receipt_digest:simulation.receipt_digest,
 };
 completion.source_digest=hash({
  ownerId:who,characterId:hero,completionId:simulation.completion_id,
  sourceKind:'quest',receiptDigest:simulation.receipt_digest,awards,
 });
 const candidate={
  claim_id:claimId,completion_id:'quest-42',owner_id:who,character_id:hero,
  proposed_agp:'500',record_kind:'unverified_funding_candidate',
  ruleset_verification_attached:false,
  agp_mint_enabled:false,wallet_credit_enabled:false,
  expected_receipt_digest:simulation.receipt_digest,
  expected_completion_digest:completion.source_digest,
 };
 return {candidate,simulation,completion,ownerId:who,characterId:hero};
}
const denyArgs=[{proposed_agp:'0'},{proposed_agp:'500.0'},
 {proposed_agp:'100000001'},{agp_mint_enabled:true},
 {wallet_credit_enabled:true},{ruleset_verification_attached:true},
 {owner_id:'intruder'},{record_kind:'funded'},
 {expected_receipt_digest:'b'.repeat(64)}];

test('19.4–19.9 joins simulation and completion hashes but never mints AGP',()=>{
 const r=assessGame3DFundingCandidate199(source());
 assert.equal(r.ok,true);
 assert.equal(r.proposedAGP,'500');
 assert.equal(r.simulationReceiptConsistent,true);
 assert.equal(r.completionSourceConsistent,true);
 for(const name of ['agpRulesetVerified','earnedCurrencyVerified','fundsMinted',
  'walletCredited','paymentAuthorized','settlementAuthorized','productionReady'])
  assert.equal(r[name],false,name);
});
test('19.4–19.9 rejects forged or inconsistent funding proposals',()=>{
 for(const change of denyArgs){
  const d=source();
  const result=assessGame3DFundingCandidate199({
   ...d,candidate:{...d.candidate,...change},
  });
  assert.equal(result.ok,false,JSON.stringify(change));
  assert.equal(result.fundsMinted,false);
 }
 for(const change of [
  {owner_id:'other'},
  {evidence_digest:'c'.repeat(64)},
  {receipt_digest:'d'.repeat(64)},
 ]){
  const d=source();
  assert.equal(assessGame3DFundingCandidate199({
   ...d,simulation:{...d.simulation,...change},
  }).ok,false);
 }
 for(const change of [
  {owner_id:'other'},{source_kind:'craft'},
  {receipt_digest:'e'.repeat(64)},
  {source_digest:'f'.repeat(64)},
  {awards:[{awardIndex:0,definitionId:'stolen'}]},
 ]){
  const d=source();
  assert.equal(assessGame3DFundingCandidate199({
   ...d,completion:{...d.completion,...change},
  }).ok,false);
 }
});

function pg({rowCount=1,wrongOwner=false,throwRead=false}={}){
 const calls=[];let released=0;
 const data=source();
 return {
  pool:{connect:async()=>({
   query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT owner_id,character_id,revision')){
     return {rowCount:1,rows:[{
      owner_id:wrongOwner?'anotherAccount':who,
      character_id:hero,revision:1,
     }]};
    }
    if(sql.startsWith('SELECT row_to_json(f)')){
     if(throwRead)throw Error('PG offline');
     return {rowCount,rows:rowCount===1?[{
      candidate:data.candidate,simulation:data.simulation,
      completion:data.completion,
     }]:[]};
    }
    return {rowCount:0,rows:[]};
   },
   release:()=>{released++},
  }),query:async()=>{throw Error('unexpected pool.query')}},
  calls,get released(){return released},
 };
}
const authenticated=async()=>({
 authenticated:true,identitySource:'trusted-server-session',accountId:who,
});

test('19.9 private reviewer binds seller character and uses one serializable read',async()=>{
 const db=pg();
 const reviewer=createGame3DFundingCandidateReviewer199({
  pool:db.pool,resolveAuthenticatedSubject:authenticated,
 });
 const result=await reviewer.inspect({characterId:hero,claimId});
 assert.equal(result.ok,true);
 assert.equal(result.walletCredited,false);
 assert.equal(db.calls[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
 assert.deepEqual(db.calls[1].params,[who,hero]);
 assert.deepEqual(db.calls[2].params,[claimId,who,hero]);
 assert.equal(db.calls.at(-1).sql,'COMMIT');
 assert.equal(db.released,1);
 assert.equal(db.calls.some(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql)),false);
});
test('19.9 denies impersonation, missing/ambiguous rows and rolls back',async()=>{
 const db=pg();
 const reviewer=createGame3DFundingCandidateReviewer199({
  pool:db.pool,resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal((await reviewer.inspect({characterId:hero,claimId})).ok,false);
 assert.equal((await reviewer.inspect({characterId:hero,claimId:'bad'})).ok,false);
 assert.equal(db.calls.length,0);
 const wrong=pg({wrongOwner:true});
 const wrongAnswer=await createGame3DFundingCandidateReviewer199({
  pool:wrong.pool,resolveAuthenticatedSubject:authenticated,
 }).inspect({characterId:hero,claimId});
 assert.equal(wrongAnswer.code,'funding_character_scope_denied');
 assert.equal(wrong.calls.length,3);
 for(const count of [0,2]){
  const db2=pg({rowCount:count});
  const denied=await createGame3DFundingCandidateReviewer199({
   pool:db2.pool,resolveAuthenticatedSubject:authenticated,
  }).inspect({characterId:hero,claimId});
  assert.equal(denied.code,'funding_candidate_not_found_or_ambiguous');
 }
 const broken=pg({throwRead:true});
 await assert.rejects(createGame3DFundingCandidateReviewer199({
  pool:broken.pool,resolveAuthenticatedSubject:authenticated,
 }).inspect({characterId:hero,claimId}),/PG offline/);
 assert.equal(broken.calls.at(-1).sql,'ROLLBACK');
 assert.equal(broken.released,1);
});

test('19.9 manual migration prevents duplicate claims and keeps credit disabled',()=>{
 const sql=readFileSync(new URL(
  '../sql/025_foundation199_agp_funding_candidates.sql',
  import.meta.url),'utf8');
 assert.match(sql,/completion_id text NOT NULL UNIQUE/);
 assert.match(sql,/CHECK\(agp_mint_enabled=false\)/);
 assert.match(sql,/CHECK\(wallet_credit_enabled=false\)/);
 assert.match(sql,/game3d_market_agp_funding_candidate_immutable/);
});
test('19.9 services remain privately read-only with release denied',()=>{
 const service=createGame3DCharacterServices199({
  pool:{query:async()=>{},connect:async()=>{}},
  resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal(service.version,'19.9');
 assert.equal(typeof service.inspectPrivateFundingCandidate,'function');
 assert.equal(service.inspectMarketplaceReleaseGate().releaseAuthorized,false);
 for(const method of ['mintAGP','creditAGP','debitAGP','postListing','purchaseItem'])
  assert.equal(method in service,false);
});
