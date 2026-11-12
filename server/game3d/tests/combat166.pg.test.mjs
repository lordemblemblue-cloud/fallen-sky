// Game 3D 16.6 — real, isolated PostgreSQL durable PvP proof + 16.4 consent.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile as readAsync} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateRivalEvidence166}
 from '../privateRivalEvidence166.mjs';
import {createGame3DPrivateStoryRivalConsent164}
 from '../privateStoryRivalConsent164.mjs';

const url=process.env.GAME3D_166_DISPOSABLE_PG_URL;
const NOW=Date.UTC(2026,10,2,20);
const A={ownerId:'owner166A',characterId:'hero166A'};
const B={ownerId:'owner166B',characterId:'hero166B'};
const C={ownerId:'owner166C',characterId:'hero166C'};
const D={ownerId:'owner166D',characterId:'hero166D'};
const X={ownerId:'owner166X',characterId:'hero166X'};
const pending=new Map();
let i=0;
function outcome(killer,victim,matchId,options={}){
 const number=++i,receiptId='pvp-receipt-166-'+number;
 const e={kind:'verified_pvp_defeat',
  sourceKind:'trusted-private-pvp-outcome',receiptId,
  killerAccountId:killer.ownerId,killerCharacterId:killer.characterId,
  victimAccountId:victim.ownerId,victimCharacterId:victim.characterId,
  worldInstanceId:'world-pvp-166',
  matchId,encounterId:'encounter-166-'+number,
  occurredAt:NOW-number*1000,
  evidenceDigest:createHash('sha256')
   .update('trusted-pvp-result-'+number).digest('hex'),
  ...options};
 pending.set(receiptId,e);
 return receiptId;
}
const authorizedOps=new Set([
 'commit_trusted_private_pvp_outcome',
 'resolve_trusted_private_rival_lead',
 'offer_private_rival_lead','respond_private_rival_lead',
 'read_private_rival_invitation',
]);
const approved=new Set([A,B,C,D].map(x=>x.ownerId+'/'+x.characterId));
const authorize=async({operation,ownerId,characterId})=>
 authorizedOps.has(operation)&&approved.has(ownerId+'/'+characterId);
const outcomeCount=async pool=>Number((await pool.query(
 'SELECT count(*)::int AS n FROM game3d_private_pvp_outcome_166'
)).rows[0].n);
const proofCount=async pool=>Number((await pool.query(
 'SELECT count(*)::int AS n FROM game3d_private_rival_proof_166'
)).rows[0].n);

test('16.6 private PvP receipts form auditable, consent-only Rival proof',
 {skip:!url,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_pvp_166_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:url,
   options:'-c search_path='+schema,max:16});
  await pool.query(await readAsync(new URL(
   '../sql/008_combat50_verified_event_provenance.sql',import.meta.url),'utf8'));
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'immutable private PvP evidence'; END;$$`);
  for(const name of [
   '044_combat164_private_rival_consent.sql',
   '045_combat165_private_echo_story.sql',
   '046_combat166_private_pvp_evidence.sql',
  ])await pool.query(await readAsync(
   new URL('../sql/'+name,import.meta.url),'utf8'));
  for(const actor of [A,B,C,D,X]){
   await pool.query(`INSERT INTO game3d_trusted_character
    (owner_id,character_id) VALUES($1,$2)`,
    [actor.ownerId,actor.characterId]);
  }
  const evidence=createGame3DPrivateRivalEvidence166({
   pool,authorizeServerOperation:authorize,now:()=>NOW,
   resolveTrustedPvPOutcome:async({receiptId})=>pending.get(receiptId)||null
  });
  const consent=createGame3DPrivateStoryRivalConsent164({
   pool,authorizeServerOperation:authorize,now:()=>NOW,
   resolveTrustedRivalLead:evidence.resolveLead
  });
  const post=async(killer,victim,match,options={})=>{
   const receiptId=outcome(killer,victim,match,options);
   return {receiptId,result:await evidence.commitDefeat({
    ...killer,receiptId
   })};
  };
  await t.test('deny unauthenticated, unverified or browser-provided outcome',async()=>{
   assert.equal((await evidence.commitDefeat({
    ...A,receiptId:'missing-pvp-166',claimedKills:1000})).reason,
    'unverified_private_pvp_outcome');
   const ref=outcome(A,B,'match-166-attack');
   assert.equal((await evidence.commitDefeat({...X,receiptId:ref})).reason,
    'private_pvp_outcome_unauthorized');
   assert.equal((await evidence.commitDefeat({...B,receiptId:ref})).reason,
    'unverified_private_pvp_outcome');
   const malformed=outcome(A,B,'match-166-fake',
    {sourceKind:'browser-pvp-report'});
   assert.equal((await evidence.commitDefeat({...A,receiptId:malformed})).reason,
    'unverified_private_pvp_outcome');
   assert.equal((await evidence.resolveLead({leadId:'fake-rival-166'})),null);
   assert.equal(await outcomeCount(pool),0);
   assert.equal(evidence.livePvPAuthorityInstalled,false);
  });
  await t.test('same match repeated kills never count as distinct PvP matches',async()=>{
   const a=await post(A,B,'match-166-one');
   const b=await post(A,B,'match-166-one');
   assert.equal(a.result.ok,true);
   assert.equal(b.result.ok,true);
   assert.equal(a.result.proofAvailable,false);
   assert.equal(b.result.proofAvailable,false);
   assert.equal(await outcomeCount(pool),2);
   assert.equal(await proofCount(pool),0);
   const replay=await evidence.commitDefeat({...A,receiptId:a.receiptId});
   assert.equal(replay.ok,true);
   assert.equal(replay.outcomeCommitted,false);
   assert.equal(await outcomeCount(pool),2);
  });
  await t.test('three independently attested matches generate one immutable Rival lead',async()=>{
   const x=await post(A,B,'match-166-two');
   assert.equal(x.result.proofAvailable,false);
   const y=await post(A,B,'match-166-three');
   assert.equal(y.result.ok,true);
   assert.equal(y.result.proofIssued,true);
   assert.equal(y.result.proofAvailable,true);
   assert.equal(await proofCount(pool),1);
   const lead=await evidence.resolveLead({leadId:y.result.leadId});
   assert.equal(lead.status,'candidate');
   assert.equal(lead.verifiedDefeats,3);
   assert.equal(lead.distinctMatches,3);
   assert.equal(lead.initiatorOwnerId,A.ownerId);
   assert.equal(lead.counterpartCharacterId,B.characterId);
   assert.match(lead.evidenceDigest,/^[a-f0-9]{64}$/);
   const receipts=await pool.query(`
    SELECT l.receipt_id,e.match_id FROM game3d_private_rival_proof_receipt_166 l
    JOIN game3d_private_pvp_outcome_166 e USING(receipt_id)
    WHERE l.lead_id=$1 ORDER BY l.proof_order`,[lead.leadId]);
   assert.equal(receipts.rowCount,3);
   assert.equal(new Set(receipts.rows.map(row=>row.match_id)).size,3);
   const replay=await evidence.commitDefeat({...A,receiptId:y.receiptId});
   assert.equal(replay.proofIssued,false);
   assert.equal(replay.proofAvailable,true);
   const extra=await post(A,B,'match-166-four');
   assert.equal(extra.result.proofIssued,false);
   assert.equal(extra.result.leadId,lead.leadId);
   assert.equal((await evidence.resolveLead({leadId:lead.leadId})).evidenceDigest,
    lead.evidenceDigest,'first approved proof cannot silently shift');
   assert.equal(await proofCount(pool),1);
  });
  await t.test('16.4 consumes durable 16.6 resolver but still requires two opt-ins',async()=>{
   const lead=(await evidence.resolveLead({leadId:(
    await pool.query(`SELECT lead_id FROM game3d_private_rival_proof_166`)
   ).rows[0].lead_id}));
   const offered=await consent.offerRival({...A,leadId:lead.leadId,
    victimAccountId:'client-chosen',claimVictimWins:9000});
   assert.equal(offered.ok,true);
   assert.equal(offered.status,'pending');
   assert.equal(offered.relationshipCreated,false);
   const first=await consent.respond({...B,leadId:lead.leadId,
    choice:'friendly_rival'});
   assert.equal(first.status,'pending');
   const second=await consent.respond({...A,leadId:lead.leadId,
    choice:'friendly_rival'});
   assert.equal(second.status,'friendly_rival');
   assert.equal(second.mutualConsent,true);
   assert.equal(second.rewardsIssued,false);
   assert.equal(second.questAccepted,false);
   const replay=await consent.offerRival({...A,leadId:lead.leadId});
   assert.equal(replay.invitationCreated,false);
  });
  await t.test('different directed pair may decline, without recreating unwanted invitation',async()=>{
   const a=await post(C,D,'match-166-cd1');
   const b=await post(C,D,'match-166-cd2');
   const c=await post(C,D,'match-166-cd3');
   assert.equal(a.result.proofAvailable,false);
   assert.equal(b.result.proofAvailable,false);
   const leadId=c.result.leadId;
   assert.equal(c.result.proofIssued,true);
   assert.equal((await consent.offerRival({...C,leadId})).ok,true);
   assert.equal((await consent.respond({...D,leadId,choice:'decline'})).status,
    'declined');
   const next=await post(C,D,'match-166-cd4');
   assert.equal(next.result.proofIssued,false);
   assert.equal(next.result.leadId,leadId);
   assert.equal((await consent.offerRival({...C,leadId})).status,'declined');
   assert.equal(await proofCount(pool),2);
  });
  await t.test('tampered source, duplicates and replayed encounter ID are rejected',async()=>{
   const good=outcome(B,C,'match-166-good');
   assert.equal((await evidence.commitDefeat({...B,receiptId:good})).ok,true);
   pending.set(good,{...pending.get(good),matchId:'match-166-changed'});
   assert.equal((await evidence.commitDefeat({...B,receiptId:good})).reason,
    'conflicting_private_pvp_evidence');
   const other=outcome(B,C,'match-166-clone',
    {worldInstanceId:'world-pvp-166',
     encounterId:pending.get(good).encounterId});
   assert.equal((await evidence.commitDefeat({...B,receiptId:other})).reason,
    'conflicting_private_pvp_evidence');
   assert.equal(await proofCount(pool),2);
  });
  await t.test('stale and forged outcomes never create relationship or Rival proof',async()=>{
   const old=outcome(B,C,'match-166-old',
    {occurredAt:NOW-8*24*60*60*1000});
   assert.equal((await evidence.commitDefeat({...B,receiptId:old})).reason,
    'unverified_private_pvp_outcome');
   const sameAccount=outcome(B,C,'match-166-same',{
    victimAccountId:B.ownerId
   });
   assert.equal((await evidence.commitDefeat({...B,receiptId:sameAccount})).reason,
    'unverified_private_pvp_outcome');
   assert.equal((await consent.offerRival({...B,leadId:'invented-lead-166'})).reason,
    'no_verified_distinct_match_rival_lead');
  });
  await t.test('expired proof cannot open new invitations after seven days',async()=>{
   const late=createGame3DPrivateRivalEvidence166({
    pool,authorizeServerOperation:authorize,
    now:()=>NOW+8*24*60*60*1000,
    resolveTrustedPvPOutcome:async({receiptId})=>pending.get(receiptId)||null
   });
   const lead=(await pool.query(`SELECT lead_id FROM
    game3d_private_rival_proof_166
    WHERE owner_id=$1 AND character_id=$2`,
    [C.ownerId,C.characterId])).rows[0].lead_id;
   assert.equal(await late.resolveLead({leadId:lead}),null);
   assert.equal((await consent.readInvitation({...D,leadId:lead})).status,
    'declined','expiry must not erase a previously declined choice');
  });
  await t.test('append-only evidence and proof linkage reject edits or deletion',async()=>{
   for(const table of [
    'game3d_private_pvp_outcome_166',
    'game3d_private_rival_proof_166',
    'game3d_private_rival_proof_receipt_166'
   ]){
    await assert.rejects(pool.query('DELETE FROM '+table));
   }
   await assert.rejects(pool.query(`
    UPDATE game3d_private_pvp_outcome_166 SET match_id='forged-166'`));
   assert.equal(await proofCount(pool),2);
  });
  await t.test('parallel authoritative encounters issue exactly one proof per pair',async()=>{
   const ids=[
    outcome(A,C,'match-166-concurrent-one'),
    outcome(A,C,'match-166-concurrent-two'),
    outcome(A,C,'match-166-concurrent-three')
   ];
   const results=await Promise.all(ids.map(receiptId=>
    evidence.commitDefeat({...A,receiptId})));
   assert(results.every(r=>r.ok),JSON.stringify(results));
   assert.equal(results.filter(r=>r.proofIssued).length,1);
   assert.equal(await proofCount(pool),3);
   const lead=await evidence.resolveLead({
    leadId:results.find(r=>r.proofAvailable).leadId
   });
   assert.equal(lead.distinctMatches,3);
   assert.equal(lead.counterpartOwnerId,C.ownerId);
   assert.equal((await consent.offerRival({...A,leadId:lead.leadId})).status,
    'pending');
   assert.equal((await consent.readInvitation({...C,leadId:lead.leadId})).status,
    'pending','proof alone cannot create a relationship');
  });
  await t.test('missing adjudicator and denied proof resolver never expose data',async()=>{
   const noIssuer=createGame3DPrivateRivalEvidence166({
    pool,authorizeServerOperation:authorize,now:()=>NOW});
   assert.equal((await noIssuer.commitDefeat({...A,
    receiptId:'missing-outcome-166'})).reason,
    'trusted_private_pvp_adjudicator_not_installed');
   const unauthorized=createGame3DPrivateRivalEvidence166({
    pool,authorizeServerOperation:async()=>false,now:()=>NOW});
   const lead=(await pool.query(`SELECT lead_id FROM
    game3d_private_rival_proof_166 LIMIT 1`)).rows[0].lead_id;
   assert.equal(await unauthorized.resolveLead({leadId:lead}),null);
   assert.equal((await unauthorized.commitDefeat({...A,
    receiptId:'some-outcome-166'})).reason,
    'private_pvp_outcome_unauthorized');
   assert.equal(unauthorized.livePvPAuthorityInstalled,false);
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('16.6 does not create public PvP combat, payouts, or automatic relationships',()=>{
 const source=readFileSync(
  new URL('../privateRivalEvidence166.mjs',import.meta.url),'utf8');
 assert.match(source,/resolveTrustedPvPOutcome/);
 assert.match(source,/distinctThree/);
 assert.match(source,/game3d_private_rival_proof_receipt_166/);
 assert.doesNotMatch(source,
  /createServer\(|window\.|localStorage|awardXP\(|grantQuestReward\(|addContribution\(/);
});
