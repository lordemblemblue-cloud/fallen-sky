import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../../base44/shared/duelJournalProof.mjs';
import {fingerprintGame3DItemBoundSellerPreview} from '../marketSnapshot170.mjs';
import {
 assessGame3DCustodyPreflight171,createGame3DMarketCustodyPreflight171,
} from '../marketCustodyPreflight171.mjs';
import {createGame3DCharacterServices171} from '../characterServices171.mjs';

const listingId='11111111-1111-4111-8111-111111111111';
const itemInstanceId='22222222-2222-4222-8222-222222222222';
const quote=()=>({
 ok:true,previewOnly:true,ownerId:'owner1',characterId:'hero1',
 listingId,itemInstanceId,sourceIntegrityDigest:'a'.repeat(64),
 inventorySlot:0,askAGP:'100',isAuction:false,durationHours:null,
 provenanceConsistent:true,originalInventoryAssigned:true,
 originalItemUnequipped:true,listingAuthorized:false,
 paymentAuthorized:false,escrowAuthorized:false,
 marketplaceTradingEnabled:false,currencyDebited:false,
});
const hash=value=>createHash('sha256').update(stableJournalJSON(value))
 .digest('hex');

test('17.1 preflight detects changed seller snapshots and existing intents',()=>{
 const q=quote();
 const expectedFingerprint=fingerprintGame3DItemBoundSellerPreview(q)
  .snapshotFingerprint;
 const ok=assessGame3DCustodyPreflight171({quote:q,expectedFingerprint});
 assert.equal(ok.ok,true);
 assert.equal(ok.sellerSnapshotMatches,true);
 for(const name of ['custodyReserved','listingAuthorized','tradeAuthorized',
  'paymentAuthorized','transferAuthorized','escrowAuthorized',
  'settlementAuthorized','productionReady','verifiedGameplayEarned'])
  assert.equal(ok[name],false,name);
 assert.equal(assessGame3DCustodyPreflight171({
  quote:{...q,inventorySlot:1},expectedFingerprint,
 }).code,'seller_snapshot_changed');
 assert.equal(assessGame3DCustodyPreflight171({
  quote:q,expectedFingerprint,existingIntentId:listingId,
 }).code,'item_has_existing_custody_intent');
 assert.equal(assessGame3DCustodyPreflight171({
  quote:q,expectedFingerprint:'bad',
 }).ok,false);
 assert.equal(assessGame3DCustodyPreflight171({
  quote:{...q,listingAuthorized:true},expectedFingerprint,
 }).ok,false);
});

function evidence(){
 const owner_id='owner1',character_id='hero1',source_kind='quest',
  definition_id='blade1',completion_id='completion1',simulation_id='sim1',
  source_event_id='33333333-3333-4333-8333-333333333333';
 const awards=[{awardIndex:0,definitionId:definition_id}];
 const simulation={
  completion_id,simulation_id,simulation_tick:1,owner_id,character_id,
  source_kind,awards,evidence_digest:'e'.repeat(64),
 };
 simulation.receipt_digest=hash({
  completionId:completion_id,simulationId:simulation_id,
  simulationTick:1,ownerId:owner_id,characterId:character_id,
  sourceKind:source_kind,awards,evidenceDigest:simulation.evidence_digest,
 });
 const completion={
  completion_id,owner_id,character_id,source_kind,awards,
  receipt_digest:simulation.receipt_digest,
 };
 completion.source_digest=hash({
  ownerId:owner_id,characterId:character_id,completionId:completion_id,
  sourceKind:source_kind,receiptDigest:completion.receipt_digest,awards,
 });
 const event={
  event_id:source_event_id,owner_id,character_id,source_kind,
  definition_id,award_index:0,completion_id,
  proof_digest:completion.source_digest,
 };
 event.event_digest=hash({
  ownerId:owner_id,characterId:character_id,completionId:completion_id,
  sourceKind:source_kind,definitionId:definition_id,awardIndex:0,
  proofDigest:event.proof_digest,
 });
 const issued={
  item_instance_id:itemInstanceId,owner_id,character_id,source_kind,
  definition_id,award_index:0,source_event_id,
  source_digest:event.event_digest,
 };
 issued.claim_digest=hash({
  ownerId:owner_id,characterId:character_id,sourceEventId:source_event_id,
  definitionId:definition_id,sourceKind:source_kind,awardIndex:0,
  sourceDigest:issued.source_digest,
 });
 return {issued,event,completion,simulation};
}

function fakePg({rowCount=1,existingIntentId=null,throwOnRead=false}={}){
 const calls=[];
 let released=0;
 const source=evidence();
 const listing={
  listing_id:listingId,owner_id:'owner1',character_id:'hero1',
  item_instance_id:itemInstanceId,record_kind:'private_preview',
  payment_enabled:false,transfer_enabled:false,
 };
 const pool={
  query:async()=>{throw Error('read must use same transaction client')},
  connect:async()=>({
   query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT owner_id,character_id,revision'))
     return {rowCount:1,rows:[{owner_id:'owner1',
      character_id:'hero1',revision:0}]};
    if(sql.startsWith('SELECT row_to_json')){
     if(throwOnRead)throw Error('database unavailable');
     return {rowCount,rows:rowCount===1?[{
      listing,...source,inventory_slot:0,equipped_id:null,
      existing_intent_id:existingIntentId,
     }]:[]};
    }
    return {rowCount:0,rows:[]};
   },
   release:()=>{released++},
  }),
 };
 return {pool,calls,get released(){return released},
  sourceIntegrityDigest:source.issued.source_digest};
}

test('17.1 authenticated DB preflight observes a single serializable snapshot',async()=>{
 const db=fakePg();
 const resolver=async()=>({
  authenticated:true,identitySource:'trusted-server-session',
  accountId:'owner1',
 });
 const service=createGame3DMarketCustodyPreflight171({
  pool:db.pool,resolveAuthenticatedSubject:resolver,
 });
 const q={...quote(),sourceIntegrityDigest:db.sourceIntegrityDigest};
 const expectedFingerprint=fingerprintGame3DItemBoundSellerPreview(q)
  .snapshotFingerprint;
 const r=await service.inspect({
  characterId:'hero1',listingId,askAGP:'100',expectedFingerprint,
 });
 assert.equal(r.ok,true);
 assert.equal(r.settlementAuthorized,false);
 assert.equal(r.custodyReserved,false);
 assert.equal(db.calls[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
 assert.equal(db.calls.at(-1).sql,'COMMIT');
 assert.equal(db.released,1);
 assert.equal(db.calls.filter(x=>x.sql.startsWith('SELECT row_to_json')).length,1);
 assert.equal(db.calls.some(x=>/^(INSERT|UPDATE|DELETE)/.test(x.sql)),false);
 assert.deepEqual(db.calls[2].params,[listingId,'owner1','hero1']);
 const withIntent=fakePg({existingIntentId:listingId});
 const blocked=await createGame3DMarketCustodyPreflight171({
  pool:withIntent.pool,resolveAuthenticatedSubject:resolver,
 }).inspect({characterId:'hero1',listingId,askAGP:'100',
  expectedFingerprint});
 assert.equal(blocked.code,'item_has_existing_custody_intent');
});

test('17.1 is fail-closed for missing auth, invalid identities and ambiguous joins',async()=>{
 const db=fakePg();
 let resolved=0;
 const service=createGame3DMarketCustodyPreflight171({
  pool:db.pool,
  resolveAuthenticatedSubject:async()=>{
   resolved++;return null;
  },
 });
 assert.equal((await service.inspect({
  characterId:'hero1',listingId,askAGP:'100',
  expectedFingerprint:'a'.repeat(64),
 })).code,'unverified_authentication');
 assert.equal((await service.inspect({
  characterId:'hero1',listingId,askAGP:'0',
  expectedFingerprint:'a'.repeat(64),
 })).code,'invalid_market_price');
 assert.equal((await service.inspect({
  characterId:'hero1',listingId:'bad',askAGP:'100',
  expectedFingerprint:'a'.repeat(64),
 })).ok,false);
 assert.equal(resolved,1);
 assert.equal(db.calls.length,0);
 const duplicate=fakePg({rowCount:2});
 const r=await createGame3DMarketCustodyPreflight171({
  pool:duplicate.pool,
  resolveAuthenticatedSubject:async()=>({
   authenticated:true,identitySource:'trusted-server-session',
   accountId:'owner1',
  }),
 }).inspect({characterId:'hero1',listingId,askAGP:'100',
  expectedFingerprint:'a'.repeat(64)});
 assert.equal(r.code,'non_unique_or_missing_seller_source');
 assert.equal(duplicate.calls.at(-1).sql,'COMMIT');
});

test('17.1 database failures roll back and never open a transfer path',async()=>{
 const db=fakePg({throwOnRead:true});
 const inspect=createGame3DMarketCustodyPreflight171({
  pool:db.pool,
  resolveAuthenticatedSubject:async()=>({
   authenticated:true,identitySource:'trusted-server-session',
   accountId:'owner1',
  }),
 });
 await assert.rejects(inspect.inspect({
  characterId:'hero1',listingId,askAGP:'100',
  expectedFingerprint:'a'.repeat(64),
 }),/database unavailable/);
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');
 assert.equal(db.released,1);
 const service=createGame3DCharacterServices171({
  pool:db.pool,resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal(service.version,'17.1');
 assert.equal(typeof service.inspectSellerSnapshot,'function');
 assert.equal(typeof service.inspectSellerCustodyPreflight,'function');
 assert.equal(service.readOnly,true);
 for(const method of ['purchaseItem','postListing','reserveItem',
  'settlePurchase','debitAGP','transferItem'])
  assert.equal(method in service,false);
});

test('21st private schema requires unique per-item intent and disallows payment',()=>{
 const sql=readFileSync(
  new URL('../sql/021_foundation171_market_custody_intents.sql',
   import.meta.url),'utf8');
 assert.match(sql,/item_instance_id uuid NOT NULL UNIQUE/);
 assert.match(sql,/request_id uuid NOT NULL UNIQUE/);
 assert.match(sql,/currency_debited=false/);
 assert.match(sql,/item_transferred=false/);
 assert.match(sql,/game3d_market_custody_intent_immutable/);
});
