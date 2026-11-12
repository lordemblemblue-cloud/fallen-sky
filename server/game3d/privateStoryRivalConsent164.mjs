// Game 3D 16.4 — private mutual Rival invitations + read-only Echo leads.
// No unilateral PvP relationship, public matchmaking, quest auto-accept,
// cinematic, social pressure, XP, item, faction or wallet payouts.
const PROOF_KIND='trusted-private-pvp-candidate-151';
const ID=/^[A-Za-z0-9_.:-]{8,128}$/;
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_AGE_MS=7*24*60*60*1000;
const choices=new Set(['rival','friendly_rival','decline']);
const validWho=x=>typeof x==='string'&&WHO.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const validId=x=>typeof x==='string'&&ID.test(x);
const fail=reason=>Object.freeze({ok:false,version:'16.4',reason,
 mutualConsent:false,relationshipCreated:false,questAccepted:false,
 rewardsIssued:false,privateServerOnly:true,productionReady:false});
const lockCharactersSQL=`
 SELECT owner_id,character_id FROM game3d_trusted_character
 WHERE (owner_id=$1 AND character_id=$2) OR
       (owner_id=$3 AND character_id=$4)
 ORDER BY owner_id,character_id FOR UPDATE
`;
const insertSQL=`
 INSERT INTO game3d_private_rival_invitation_164
 (lead_id,initiator_owner_id,initiator_character_id,
  counterpart_owner_id,counterpart_character_id,evidence_kind,
  verified_defeats,distinct_matches,evidence_digest)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
 ON CONFLICT (lead_id) DO NOTHING
 RETURNING lead_id
`;
const lockLeadSQL=`
 SELECT lead_id,initiator_owner_id,initiator_character_id,
  counterpart_owner_id,counterpart_character_id,evidence_kind,
  verified_defeats,distinct_matches,evidence_digest,status
 FROM game3d_private_rival_invitation_164 WHERE lead_id=$1 FOR UPDATE
`;
const readLeadSQL=lockLeadSQL.replace(' FOR UPDATE','');
const readChoicesSQL=`
 SELECT actor_role,owner_id,character_id,choice
 FROM game3d_private_rival_choice_164 WHERE lead_id=$1
 ORDER BY actor_role
`;
const insertChoiceSQL=`
 INSERT INTO game3d_private_rival_choice_164
 (lead_id,actor_role,owner_id,character_id,choice)
 VALUES($1,$2,$3,$4,$5)
 RETURNING actor_role
`;
const finishSQL=`
 UPDATE game3d_private_rival_invitation_164
 SET status=$2,updated_at=clock_timestamp()
 WHERE lead_id=$1 AND status='pending'
 RETURNING status
`;
const echoGateSQL=`
 SELECT a.status AS accepted_status,a.catalog_revision AS accepted_revision,
 t.catalog_revision,t.reward_issued AS rewards_issued
 FROM game3d_private_echo_quest_165 a
 JOIN game3d_private_echo_turnin_165 t
 ON t.owner_id=a.owner_id AND t.character_id=a.character_id
 AND t.quest_id=a.quest_id
 WHERE a.owner_id=$1 AND a.character_id=$2
 AND a.quest_id='echo_ch_16_crossroads'
`;
const storyLeads=Object.freeze([
 Object.freeze({questId:'echo_branch_hidden_echo',title:'The Hidden Echo',
  npc:'Noor the Wanderer',optional:true,autoAccepted:false}),
 Object.freeze({questId:'echo_branch_broken_road',title:'The Broken Road',
  npc:'Vex the Hunter',optional:true,autoAccepted:false}),
]);
function proofValid(p,leadId,now){
 return p&&p.status==='candidate'&&p.evidenceKind===PROOF_KIND&&
 p.leadId===leadId&&validId(p.leadId)&&
 validWho(p.initiatorOwnerId)&&validWho(p.initiatorCharacterId)&&
 validWho(p.counterpartOwnerId)&&validWho(p.counterpartCharacterId)&&
 p.initiatorOwnerId!==p.counterpartOwnerId&&
 p.initiatorCharacterId!==p.counterpartCharacterId&&
 Number.isSafeInteger(p.verifiedDefeats)&&p.verifiedDefeats>=3&&
 Number.isSafeInteger(p.distinctMatches)&&p.distinctMatches>=3&&
 p.distinctMatches<=p.verifiedDefeats&&
 typeof p.evidenceDigest==='string'&&HASH.test(p.evidenceDigest)&&
 Number.isSafeInteger(p.issuedAt)&&p.issuedAt<=now&&
 now-p.issuedAt<=MAX_AGE_MS;
}
function leadMatches(row,p){
 return row?.lead_id===p.leadId&&row.initiator_owner_id===p.initiatorOwnerId&&
 row.initiator_character_id===p.initiatorCharacterId&&
 row.counterpart_owner_id===p.counterpartOwnerId&&
 row.counterpart_character_id===p.counterpartCharacterId&&
 row.evidence_kind===PROOF_KIND&&
 Number(row.verified_defeats)===p.verifiedDefeats&&
 Number(row.distinct_matches)===p.distinctMatches&&
 row.evidence_digest===p.evidenceDigest;
}
const roleFor=(row,ownerId,characterId)=>{
 if(row.initiator_owner_id===ownerId&&
 row.initiator_character_id===characterId)return 'initiator';
 if(row.counterpart_owner_id===ownerId&&
 row.counterpart_character_id===characterId)return 'counterpart';
 return null;
};
function responseView(row,votes,actorRole=null){
 const mutual=row.status==='rival'||row.status==='friendly_rival';
 return Object.freeze({ok:true,version:'16.4',leadId:row.lead_id,
  status:row.status,actorRole,
  initiatorCharacterId:row.initiator_character_id,
  counterpartCharacterId:row.counterpart_character_id,
  responsesRecorded:votes.length,mutualConsent:mutual,
  relationshipCreated:mutual,
  relationship:mutual?row.status:null,
  meeting:'neutral_zone_not_scheduled',
  questAccepted:false,rewardsIssued:false,
  privateServerOnly:true,publicEndpointInstalled:false,
  productionReady:false});
}
export function createGame3DPrivateStoryRivalConsent164({
 pool,authorizeServerOperation,resolveTrustedRivalLead,now=Date.now
}={}){
 if(typeof pool?.connect!=='function'||
 typeof authorizeServerOperation!=='function'||
 typeof now!=='function')
  throw Error('16.4 requires private DB, operator and server time');
 const allowed=async(operation,ownerId,characterId,leadId=null)=>{
  if(!validWho(ownerId)||!validWho(characterId))return false;
  try{return await authorizeServerOperation({
   operation,ownerId,characterId,
   ...(leadId===null?{}:{leadId})
  })===true}catch{return false}
 };
 const offerRival=async({ownerId,characterId,leadId}={})=>{
  if(!validId(leadId))return fail('invalid_private_rival_lead');
  if(!await allowed('offer_private_rival_lead',
    ownerId,characterId,leadId))
   return fail('private_rival_offer_unauthorized');
  if(typeof resolveTrustedRivalLead!=='function')
   return fail('trusted_private_pvp_lead_source_not_installed');
  // Resolver MUST independently obtain server-side authoritative PvP
  // evidence, never reflect caller-supplied lead/kill/candidate data.
  let proof;
  try{proof=await resolveTrustedRivalLead({leadId})}
  catch{return fail('trusted_private_pvp_lead_unavailable')}
  if(!proofValid(proof,leadId,now())||
     proof.initiatorOwnerId!==ownerId||
     proof.initiatorCharacterId!==characterId)
   return fail('no_verified_distinct_match_rival_lead');

  const db=await pool.connect();let tx=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');tx=true;
   const actors=await db.query(lockCharactersSQL,[
    ownerId,characterId,proof.counterpartOwnerId,proof.counterpartCharacterId
   ]);
   if(actors.rowCount!==2){
    await db.query('ROLLBACK');tx=false;
    return fail('trusted_rival_counterpart_character_missing');
   }
   const inserted=await db.query(insertSQL,[
    leadId,ownerId,characterId,proof.counterpartOwnerId,
    proof.counterpartCharacterId,PROOF_KIND,proof.verifiedDefeats,
    proof.distinctMatches,proof.evidenceDigest
   ]);
   const row=await db.query(lockLeadSQL,[leadId]);
   if(row.rowCount!==1||!leadMatches(row.rows[0],proof)){
    await db.query('ROLLBACK');tx=false;
    return fail('rival_lead_conflict_or_tampered_evidence');
   }
   const votes=await db.query(readChoicesSQL,[leadId]);
   await db.query('COMMIT');tx=false;
   return Object.freeze({...responseView(row.rows[0],votes.rows,'initiator'),
    invitationCreated:inserted.rowCount===1,
    consentRequiredFromBoth:true});
  }catch{
   if(tx)try{await db.query('ROLLBACK')}catch{}
   return fail('private_rival_offer_failed');
  }finally{db.release()}
 };
 const respond=async({ownerId,characterId,leadId,choice}={})=>{
  if(!validId(leadId)||!choices.has(choice))
   return fail('invalid_private_rival_choice');
  if(!await allowed('respond_private_rival_lead',
    ownerId,characterId,leadId))
   return fail('private_rival_response_unauthorized');
  const db=await pool.connect();let tx=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');tx=true;
   const rows=await db.query(lockLeadSQL,[leadId]);
   if(rows.rowCount!==1){
    await db.query('ROLLBACK');tx=false;
    return fail('private_rival_invitation_missing');
   }
   const row=rows.rows[0],role=roleFor(row,ownerId,characterId);
   if(!role){
    await db.query('ROLLBACK');tx=false;
    return fail('private_rival_actor_not_in_invitation');
   }
   const prior=await db.query(readChoicesSQL,[leadId]);
   const vote=prior.rows.find(v=>v.actor_role===role);
   if(vote){
    if(vote.owner_id!==ownerId||vote.character_id!==characterId||
       vote.choice!==choice){
      await db.query('ROLLBACK');tx=false;
      return fail('conflicting_private_rival_choice_replay');
    }
    await db.query('COMMIT');tx=false;
    return Object.freeze({...responseView(row,prior.rows,role),
     alreadyResponded:true});
   }
   if(row.status!=='pending'){
    await db.query('ROLLBACK');tx=false;
    return fail('private_rival_invitation_closed');
   }
   const written=await db.query(insertChoiceSQL,
    [leadId,role,ownerId,characterId,choice]);
   if(written.rowCount!==1)throw Error('Missing private social choice');
   const next=await db.query(readChoicesSQL,[leadId]);
   let status='pending';
   if(choice==='decline')status='declined';
   else if(next.rowCount===2){
    status=next.rows.every(x=>x.choice===choice)?choice:'disputed';
   }
   if(status!=='pending'){
    const updated=await db.query(finishSQL,[leadId,status]);
    if(updated.rowCount!==1)throw Error('Rival invitation CAS failed');
    row.status=status;
   }
   await db.query('COMMIT');tx=false;
   return Object.freeze({...responseView(row,next.rows,role),
    alreadyResponded:false});
  }catch{
   if(tx)try{await db.query('ROLLBACK')}catch{}
   return fail('private_rival_response_failed');
  }finally{db.release()}
 };
 const readInvitation=async({ownerId,characterId,leadId}={})=>{
  if(!validId(leadId)||
     !await allowed('read_private_rival_invitation',
      ownerId,characterId,leadId))
   return fail('private_rival_read_unauthorized');
  const db=await pool.connect();let tx=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');tx=true;
   const rows=await db.query(readLeadSQL,[leadId]);
   if(rows.rowCount!==1)throw Error('Invitation unavailable');
   const role=roleFor(rows.rows[0],ownerId,characterId);
   if(!role){
    await db.query('ROLLBACK');tx=false;
    return fail('private_rival_actor_not_in_invitation');
   }
   const votes=await db.query(readChoicesSQL,[leadId]);
   await db.query('COMMIT');tx=false;
   return responseView(rows.rows[0],votes.rows,role);
  }catch{
   if(tx)try{await db.query('ROLLBACK')}catch{}
   return fail('private_rival_read_failed');
  }finally{db.release()}
 };
 const readEchoBranchLeads=async({ownerId,characterId}={})=>{
  if(!await allowed('read_private_echo_branch_leads',
   ownerId,characterId))
   return fail('private_echo_branch_read_unauthorized');
  const db=await pool.connect();
  try{
   const root=await db.query(echoGateSQL,[ownerId,characterId]);
   // Only the new 16.5 committed Echo chapter writer can unlock these leads.
   const unlocked=root.rowCount===1&&
    root.rows[0].accepted_status==='completed'&&
    root.rows[0].accepted_revision===root.rows[0].catalog_revision&&
    root.rows[0].rewards_issued===false;
   return Object.freeze({ok:true,version:'16.4',
    eligibility:unlocked?'verified':'chapter_16_server_completion_required',
    leads:unlocked?storyLeads:Object.freeze([]),
    branchChoicesIndependent:true,autoAccepted:false,
    questAccepted:false,rewardsIssued:false,
    privateServerOnly:true,productionReady:false});
  }catch{return fail('private_echo_branch_read_failed')}
  finally{db.release()}
 };
 return Object.freeze({version:'16.4',offerRival,respond,
  readInvitation,readEchoBranchLeads,
  privateServerOnly:true,publicRouteInstalled:false,
  privatePvPProofStoreInstalled:false,
  worldRivalMeetingInstalled:false,questAcceptWriterEnabled:false,
  rewardWriterEnabled:false,productionReady:false});
}
