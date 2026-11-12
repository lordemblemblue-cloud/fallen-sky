// Game 3D 16.4 — real disposable PostgreSQL and verified 15.1 PvP leads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile as readAsync} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createRivalQuestCandidateTracker151}
 from '../rivalQuestCandidate151.mjs';
import {createGame3DPrivateStoryRivalConsent164}
 from '../privateStoryRivalConsent164.mjs';

const url=process.env.GAME3D_164_DISPOSABLE_PG_URL;
const NOW=Date.UTC(2026,10,2,18);
const A={ownerId:'owner164A',characterId:'hero164A'};
const B={ownerId:'owner164B',characterId:'hero164B'};
const C={ownerId:'owner164C',characterId:'hero164C'};
const D={ownerId:'owner164D',characterId:'hero164D'};
const E={ownerId:'owner164E',characterId:'hero164E'};
const pair=(x,y)=>[x.ownerId,x.characterId,y.ownerId,y.characterId];
const permitted=new Set([A,B,C,D].map(x=>x.ownerId+'/'+x.characterId));
const trustedOutcomes=new Map(),leads=new Map();
const tracker=createRivalQuestCandidateTracker151({
 clock:()=>NOW,
 resolveTrustedOutcome:ref=>trustedOutcomes.get(ref?.id)||null
});
function attestLead(leadId,initiator,counterpart){
 let result;
 for(let i=1;i<=3;i++){
  const id=leadId+'-defeat-'+i;
  trustedOutcomes.set(id,{
   kind:'verified_pvp_defeat',encounterId:id,
   matchId:leadId+'-match-'+i,
   worldInstanceId:'world_164_pvp',
   killerAccountId:initiator.ownerId,
   killerCharacterId:initiator.characterId,
   victimAccountId:counterpart.ownerId,
   victimCharacterId:counterpart.characterId,
   occurredAt:NOW-i*1000
  });
  result=tracker.observe({id});
 }
 assert.equal(result.status,'candidate');
 assert.equal(result.lead.distinctMatches,3);
 const evidenceDigest=createHash('sha256').update(JSON.stringify([
  leadId,initiator.ownerId,counterpart.ownerId,
  result.lead.verifiedDefeats,result.lead.distinctMatches
 ])).digest('hex');
 const proof={status:'candidate',leadId,
  evidenceKind:'trusted-private-pvp-candidate-151',
  initiatorOwnerId:initiator.ownerId,
  initiatorCharacterId:initiator.characterId,
  counterpartOwnerId:counterpart.ownerId,
  counterpartCharacterId:counterpart.characterId,
  verifiedDefeats:result.lead.verifiedDefeats,
  distinctMatches:result.lead.distinctMatches,
  evidenceDigest,issuedAt:NOW};
 leads.set(leadId,proof);
 return proof;
}
test('16.4 private Rival invitations require independently attested PvP and both choices',
 {skip:!url,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_social_164_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:url,max:14,
   options:'-c search_path='+schema});
  await pool.query(await readAsync(new URL(
   '../sql/008_combat50_verified_event_provenance.sql',import.meta.url),'utf8'));
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'immutable private choice'; END;$$`);
  for(const name of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '044_combat164_private_rival_consent.sql',
   '045_combat165_private_echo_story.sql'
  ])await pool.query(await readAsync(
   new URL('../sql/'+name,import.meta.url),'utf8'));
  for(const person of [A,B,C,D,E]){
   await pool.query(`INSERT INTO game3d_trusted_character
    (owner_id,character_id) VALUES($1,$2)`,
    [person.ownerId,person.characterId]);
  }
  const authorization=async({ownerId,characterId,operation})=>
   permitted.has(ownerId+'/'+characterId)&&[
    'offer_private_rival_lead','respond_private_rival_lead',
    'read_private_rival_invitation','read_private_echo_branch_leads'
   ].includes(operation);
  const adapter=createGame3DPrivateStoryRivalConsent164({
   pool,now:()=>NOW,authorizeServerOperation:authorization,
   resolveTrustedRivalLead:async({leadId})=>leads.get(leadId)||null
  });
  const invitationCount=async()=>Number((await pool.query(`
   SELECT count(*)::int AS n FROM game3d_private_rival_invitation_164
  `)).rows[0].n);
  const choiceCount=async()=>Number((await pool.query(`
   SELECT count(*)::int AS n FROM game3d_private_rival_choice_164
  `)).rows[0].n);
  await t.test('untrusted client report, missing attester and outsider cannot offer',async()=>{
   assert.equal((await adapter.offerRival({...A,
    leadId:'untrusted-lead-164',verifiedDefeats:9000})).reason,
    'no_verified_distinct_match_rival_lead');
   const absent=createGame3DPrivateStoryRivalConsent164({
    pool,now:()=>NOW,authorizeServerOperation:authorization
   });
   assert.equal((await absent.offerRival({...A,
    leadId:'missing-pvp-source-164'})).reason,
    'trusted_private_pvp_lead_source_not_installed');
   assert.equal((await adapter.offerRival({...E,leadId:'missing-pvp-source-164'})).reason,
    'private_rival_offer_unauthorized');
   assert.equal((await adapter.respond({...E,
    leadId:'untrusted-lead-164',choice:'friendly_rival'})).reason,
    'private_rival_response_unauthorized');
   assert.equal(await invitationCount(),0);
  });
  await t.test('two parties explicitly choose friendly_rival, no quest or rewards',async()=>{
   const leadId='lead-friendly-164';
   attestLead(leadId,A,B);
   const offered=await adapter.offerRival({...A,leadId,
    counterpartId:'attacker-chosen',autoAccept:true});
   assert.equal(offered.ok,true);
   assert.equal(offered.invitationCreated,true);
   assert.equal(offered.status,'pending');
   assert.equal(offered.mutualConsent,false);
   const repeated=await adapter.offerRival({...A,leadId});
   assert.equal(repeated.invitationCreated,false);
   const invite=await adapter.readInvitation({...B,leadId});
   assert.equal(invite.ok,true);
   assert.equal(invite.actorRole,'counterpart');
   assert.equal(invite.relationshipCreated,false);
   const first=await adapter.respond({...B,leadId,choice:'friendly_rival'});
   assert.equal(first.status,'pending');
   assert.equal(first.relationshipCreated,false);
   const second=await adapter.respond({...A,leadId,choice:'friendly_rival'});
   assert.equal(second.ok,true);
   assert.equal(second.status,'friendly_rival');
   assert.equal(second.mutualConsent,true);
   assert.equal(second.responsesRecorded,2);
   assert.equal(second.meeting,'neutral_zone_not_scheduled');
   assert.equal(second.questAccepted,false);
   assert.equal(second.rewardsIssued,false);
   const replay=await adapter.respond({...A,leadId,choice:'friendly_rival'});
   assert.equal(replay.alreadyResponded,true);
   assert.equal(replay.status,'friendly_rival');
   assert.equal((await adapter.respond({...B,leadId,choice:'rival'})).reason,
    'conflicting_private_rival_choice_replay');
   assert.equal(await invitationCount(),1);
   assert.equal(await choiceCount(),2);
  });
  await t.test('one decline closes invitation without creating a relationship',async()=>{
   const leadId='lead-declined-164';
   attestLead(leadId,C,D);
   assert.equal((await adapter.offerRival({...C,leadId})).ok,true);
   const declined=await adapter.respond({...D,leadId,choice:'decline'});
   assert.equal(declined.status,'declined');
   assert.equal(declined.mutualConsent,false);
   assert.equal((await adapter.respond({...C,leadId,choice:'rival'})).reason,
    'private_rival_invitation_closed');
   assert.equal(await choiceCount(),3);
  });
  await t.test('conflicting choices cannot turn into Rival or Friendly Rival',async()=>{
   const leadId='lead-disputed-164';
   attestLead(leadId,A,C);
   assert.equal((await adapter.offerRival({...A,leadId})).ok,true);
   assert.equal((await adapter.respond({...A,leadId,choice:'rival'})).status,
    'pending');
   const disputed=await adapter.respond({...C,leadId,choice:'friendly_rival'});
   assert.equal(disputed.status,'disputed');
   assert.equal(disputed.relationshipCreated,false);
   assert.equal(disputed.mutualConsent,false);
   assert.equal((await adapter.readInvitation({...B,leadId})).reason,
    'private_rival_actor_not_in_invitation');
  });
  await t.test('simultaneous matching choices serialize under PostgreSQL row lock',async()=>{
   const leadId='lead-rival-164';
   attestLead(leadId,B,D);
   assert.equal((await adapter.offerRival({...B,leadId})).ok,true);
   const [one,two]=await Promise.all([
    adapter.respond({...B,leadId,choice:'rival'}),
    adapter.respond({...D,leadId,choice:'rival'})
   ]);
   assert(one.ok&&two.ok);
   const read=await adapter.readInvitation({...B,leadId});
   assert.equal(read.status,'rival');
   assert.equal(read.relationshipCreated,true);
   assert.equal(read.responsesRecorded,2);
   assert.equal((await adapter.respond({...D,leadId,choice:'rival'})).alreadyResponded,true);
   assert.equal(await invitationCount(),4);
   assert.equal(await choiceCount(),7);
  });
  await t.test('tampered server lead evidence and stale proof are rejected',async()=>{
   const leadId='lead-changed-164';
   const valid=attestLead(leadId,A,D);
   leads.set(leadId,{...valid,distinctMatches:2});
   assert.equal((await adapter.offerRival({...A,leadId})).reason,
    'no_verified_distinct_match_rival_lead');
   leads.set(leadId,{...valid,issuedAt:NOW-8*24*60*60*1000});
   assert.equal((await adapter.offerRival({...A,leadId})).reason,
    'no_verified_distinct_match_rival_lead');
   leads.set(leadId,{...valid,counterpartOwnerId:A.ownerId});
   assert.equal((await adapter.offerRival({...A,leadId})).reason,
    'no_verified_distinct_match_rival_lead');
   assert.equal(await invitationCount(),4);
  });
  await t.test('Echo branches are optional and stay locked without trusted chapter completion',async()=>{
   const before=await adapter.readEchoBranchLeads(A);
   assert.equal(before.ok,true);
   assert.equal(before.eligibility,'chapter_16_server_completion_required');
   assert.deepEqual(before.leads,[]);
   // Simulate the 16.5 server-verified chapter turn-in in a disposable
   // schema. This fixture bypasses NO live server or gameplay authority.
   await pool.query(`INSERT INTO game3d_private_echo_quest_165
    (owner_id,character_id,quest_id,catalog_revision,status,completed_at)
    VALUES($1,$2,'echo_ch_16_crossroads','axe-private-echo-165-v1',
    'completed',clock_timestamp())`,[A.ownerId,A.characterId]);
   await pool.query(`INSERT INTO game3d_private_echo_turnin_165
    (owner_id,character_id,quest_id,catalog_revision,source_kind)
    VALUES($1,$2,'echo_ch_16_crossroads','axe-private-echo-165-v1',
    'verified-private-echo-turnin')`,[A.ownerId,A.characterId]);
   const result=await adapter.readEchoBranchLeads(A);
   assert.equal(result.ok,true);
   assert.equal(result.eligibility,'verified');
   assert.deepEqual(result.leads.map(x=>x.questId),[
    'echo_branch_hidden_echo','echo_branch_broken_road'
   ]);
   assert(result.leads.every(x=>x.optional===true&&x.autoAccepted===false));
   assert.equal(result.branchChoicesIndependent,true);
   assert.equal(result.questAccepted,false);
   assert.equal(result.rewardsIssued,false);
   assert.equal((await adapter.readEchoBranchLeads(B)).leads.length,0);
  });
  await t.test('immutable choices and owner restrictions survive replay',async()=>{
   await assert.rejects(pool.query(`
    UPDATE game3d_private_rival_choice_164 SET choice='rival'`));
   await assert.rejects(pool.query(`
    DELETE FROM game3d_private_rival_choice_164`));
   assert.equal((await adapter.readInvitation({...E,
    leadId:'lead-friendly-164'})).reason,'private_rival_read_unauthorized');
   const blocked=createGame3DPrivateStoryRivalConsent164({
    pool,now:()=>NOW,authorizeServerOperation:async()=>false,
    resolveTrustedRivalLead:async({leadId})=>leads.get(leadId)
   });
   assert.equal((await blocked.readEchoBranchLeads(A)).reason,
    'private_echo_branch_read_unauthorized');
   assert.equal((await blocked.respond({...A,leadId:'lead-friendly-164',
    choice:'rival'})).reason,'private_rival_response_unauthorized');
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('16.4 mirrors existing authored Echo branch IDs and 15.1 Rival modes',()=>{
 const source=readFileSync(
  new URL('../privateStoryRivalConsent164.mjs',import.meta.url),'utf8');
 const echo=readFileSync(new URL(
  '../../../src/components/game3d/axe/quests/AXEEchoChapters.js',
  import.meta.url),'utf8');
 const rival=readFileSync(new URL('../rivalQuestCandidate151.mjs',import.meta.url),'utf8');
 for(const id of ['echo_branch_hidden_echo','echo_branch_broken_road',
  'echo_ch_16_crossroads']) {
  assert(source.includes(id));assert(echo.includes(id));
 }
 for(const choice of ['rival','friendly_rival','decline']){
  assert(source.includes(choice));assert(rival.includes(choice));
 }
 assert.doesNotMatch(source,
  /addContribution\(|awardXP\(|grantQuestReward\(|grantItem\(|localStorage|window\.|createServer\(/);
});
