// Game 3D 16.7: PRIVATE read-only Questbook + NPC + Rival projection.
// Read the *existing* trusted 15.4/15.6/16.5/16.4 records in one transaction.
// No writes to the browser's useQuestStore, NPC system, rewards or relationships.
import {PRIVATE_QUEST_CATALOG_154,PRIVATE_QUEST_CATALOG_REVISION_154}
 from './privateQuestCatalog154.mjs';
import {PRIVATE_ECHO_QUESTS_165,PRIVATE_ECHO_CATALOG_REVISION_165}
 from './privateEchoQuest165.mjs';

export const PRIVATE_QUESTBOOK_PROJECTION_VERSION_167='game3d-private-questbook-167-v1';
const validWho=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const starterMeta=Object.freeze({
 axe_q_first_patrol:Object.freeze({title:'Beyond the Capital Gate',
  npcId:'archer_lyra',category:'story'}),
 axe_q_first_elite:Object.freeze({title:'The Road Has Teeth',
  npcId:'archer_lyra',category:'chapter'})
});
const echoMeta=Object.freeze({
 echo_ch_14_first_echo:Object.freeze({title:'Chapter 1.4 — The First Echo',npcId:'archer_lyra'}),
 echo_ch_15_world_signs:Object.freeze({title:'Chapter 1.5 — Signs Along the Road',npcId:'archer_kira'}),
 echo_ch_16_crossroads:Object.freeze({title:'Chapter 1.6 — The Fork in the Road',npcId:'archer_vex'}),
 echo_ch_17_aftershocks:Object.freeze({title:'Chapter 1.7 — Aftershocks',npcId:'archer_zephyr'}),
 echo_ch_18_traces_remain:Object.freeze({title:'Chapter 1.8 — Traces That Remain',npcId:'archer_lyra'}),
 echo_branch_hidden_echo:Object.freeze({title:'The Hidden Echo',npcId:'archer_noor'}),
 echo_branch_broken_road:Object.freeze({title:'The Broken Road',npcId:'archer_vex'})
});
const denied=reason=>Object.freeze({ok:false,version:'16.7',reason,
 readOnly:true,publicEndpointInstalled:false,privateServerOnly:true,
 productionReady:false});
const actorSQL=`
 SELECT owner_id,character_id FROM game3d_trusted_character
 WHERE owner_id=$1 AND character_id=$2
`;
const starterHeadsSQL=`
 SELECT h.quest_id,h.status,h.catalog_revision,h.accepted_at,
 h.reward_authorized,t.catalog_revision AS turnin_revision,
 t.completed_at,t.rewards_issued
 FROM game3d_private_quest_acceptance_154 h
 LEFT JOIN game3d_private_quest_turnin_156 t
 ON t.owner_id=h.owner_id AND t.character_id=h.character_id
 AND t.quest_id=h.quest_id
 WHERE h.owner_id=$1 AND h.character_id=$2 ORDER BY h.quest_id
`;
const starterObjectiveSQL=`
 SELECT o.quest_id,o.objective_id,o.objective_type,o.enemy_tier,
 o.enemy_id,o.required_count,o.status,o.accepted_at,
 (SELECT count(*)::int FROM game3d_private_quest_kill_credit_152 c
  WHERE c.owner_id=o.owner_id AND c.character_id=o.character_id
  AND c.quest_id=o.quest_id AND c.objective_id=o.objective_id
 ) AS credited
 FROM game3d_private_quest_objective_binding_152 o
 WHERE o.owner_id=$1 AND o.character_id=$2
 ORDER BY o.quest_id,o.objective_id
`;
const echoHeadsSQL=`
 SELECT q.quest_id,q.status,q.catalog_revision,q.accepted_at,
 q.completed_at AS head_completed_at,q.reward_issued,
 t.catalog_revision AS turnin_revision,t.completed_at,
 t.reward_issued AS turnin_reward_issued
 FROM game3d_private_echo_quest_165 q
 LEFT JOIN game3d_private_echo_turnin_165 t
 ON t.owner_id=q.owner_id AND t.character_id=q.character_id
 AND t.quest_id=q.quest_id
 WHERE q.owner_id=$1 AND q.character_id=$2 ORDER BY q.quest_id
`;
const echoCreditsSQL=`
 SELECT c.quest_id,c.objective_id,c.receipt_id,c.receipt_kind,
 k.enemy_tier,k.committed_at AS kill_at,k.source_kind AS kill_source,
 k.server_kill_committed,
 d.target_id,d.observed_at AS discovery_at,d.source_kind AS discovery_source
 FROM game3d_private_echo_objective_credit_165 c
 LEFT JOIN game3d_private_world_kill_receipt_152 k
 ON c.receipt_kind='kill' AND k.receipt_id=c.receipt_id
 AND k.owner_id=c.owner_id AND k.character_id=c.character_id
 LEFT JOIN game3d_private_world_discovery_receipt_165 d
 ON c.receipt_kind='discovery' AND d.receipt_id=c.receipt_id
 AND d.owner_id=c.owner_id AND d.character_id=c.character_id
 WHERE c.owner_id=$1 AND c.character_id=$2
 ORDER BY c.quest_id,c.recorded_at,c.receipt_id
`;
const rivalInvitationsSQL=`
 SELECT lead_id,initiator_owner_id,initiator_character_id,
 counterpart_owner_id,counterpart_character_id,status,evidence_kind,
 verified_defeats,distinct_matches,evidence_digest
 FROM game3d_private_rival_invitation_164
 WHERE (initiator_owner_id=$1 AND initiator_character_id=$2)
 OR (counterpart_owner_id=$1 AND counterpart_character_id=$2)
 ORDER BY created_at,lead_id
`;
const rivalChoicesSQL=`
 SELECT v.lead_id,v.actor_role,v.owner_id,v.character_id,v.choice
 FROM game3d_private_rival_choice_164 v
 JOIN game3d_private_rival_invitation_164 i ON i.lead_id=v.lead_id
 WHERE (i.initiator_owner_id=$1 AND i.initiator_character_id=$2)
 OR (i.counterpart_owner_id=$1 AND i.counterpart_character_id=$2)
 ORDER BY v.lead_id,v.actor_role
`;
const asTime=x=>{
 const n=x==null?NaN:new Date(x).getTime();
 if(!Number.isFinite(n))throw Error('Corrupt trusted timestamp');
 return n;
};
const count=x=>Number.isSafeInteger(Number(x))?Number(x):NaN;
const group=(rows,key)=>{
 const out=new Map();
 for(const row of rows){
  const id=row[key],list=out.get(id)||[];
  list.push(row);out.set(id,list);
 }
 return out;
};
const resultRow=(id,def,meta,status,credits,acceptedAt,completedAt)=>{
 const objective=def.objectives?.[0]??def.objective;
 const required=objective.count;
 const current=credits;
 return Object.freeze({
  id,questId:id,title:meta.title,npcId:meta.npcId,
  category:meta.category??def.kind,
  requires:def.requires??null,status,
  statusLabel:status==='completed'?'Completed':
   current===required?'Ready to turn in':'In Progress',
  acceptedAt,completedAt,
  objectives:Object.freeze([Object.freeze({
   id:objective.id,type:objective.type,tier:objective.tier??null,
   targetId:objective.targetId??null,count:required,
   current,done:current===required,optional:false
  })]),
  progressPercent:Math.round(100*current/required),
  serverVerified:true,readOnly:true,
  hasUnissuedRewards:false,rewardState:'not_authorized_in_projection',
  canTrackFromServer:false,canAbandonFromServer:false,
  requiresServerTurnIn:status==='accepted'&&current===required
 });
};
function assertCount(n,cap){
 if(!Number.isSafeInteger(n)||n<0||n>cap)throw Error('Invalid trusted quest count');
}
function projectStarter(heads,bindings){
 const rows=[];
 const objectives=group(bindings,'quest_id'),headsSeen=new Set();
 for(const h of heads){
  const def=PRIVATE_QUEST_CATALOG_154[h.quest_id];
  if(!def||headsSeen.has(h.quest_id)||h.catalog_revision!==
      PRIVATE_QUEST_CATALOG_REVISION_154||h.reward_authorized!==false)
   throw Error('Unsupported starter quest head');
  headsSeen.add(h.quest_id);
  const obs=objectives.get(h.quest_id)||[];
  if(obs.length!==def.objectives.length||!['accepted','completed'].includes(h.status))
   throw Error('Starter objective bindings do not match catalog');
  let sum=0,cap=0;
  const completed=h.status==='completed';
  if(completed!==!!h.completed_at||
     (completed&&(h.turnin_revision!==h.catalog_revision||
       h.rewards_issued!==false)))
   throw Error('Unverified starter quest completion');
  for(const expect of def.objectives){
   const o=obs.find(x=>x.objective_id===expect.id);
   if(!o||o.objective_type!==expect.type||
      o.enemy_tier!==(expect.tier??null)||
      o.enemy_id!==(expect.targetId??null)||
      count(o.required_count)!==expect.count||
      o.status!==(completed?'completed':'accepted')||
      asTime(o.accepted_at)!==asTime(h.accepted_at))
    throw Error('Starter objective catalog mismatch');
   const n=count(o.credited);
   assertCount(n,expect.count);
   sum+=n;cap+=expect.count;
  }
  if(completed&&sum!==cap)throw Error('False starter completion');
  const meta=starterMeta[h.quest_id];
  rows.push(resultRow(h.quest_id,def,meta,h.status,sum,
   h.accepted_at,h.completed_at??null));
  objectives.delete(h.quest_id);
 }
 if(objectives.size)throw Error('Orphan starter objective binding');
 return rows;
}
function validateEchoCredit(c,expected,acceptedAt){
 if(c.objective_id!==expected.id)throw Error('Corrupt Echo objective ID');
 const time=expected.type==='discover_location'?
  c.discovery_at:c.kill_at;
 if(asTime(time)<asTime(acceptedAt))
  throw Error('Echo evidence predates acceptance');
 if(expected.type==='discover_location'){
  if(c.receipt_kind!=='discovery'||
   c.discovery_source!=='trusted-private-world-discovery'||
   c.target_id!==expected.targetId)
   throw Error('Unverified Echo discovery credit');
 }else if(c.receipt_kind!=='kill'||
  c.kill_source!=='server-committed-private-pve-kill'||
  c.server_kill_committed!==true||
  (expected.type==='kill_tier'&&c.enemy_tier!==expected.tier))
  throw Error('Unverified Echo kill credit');
}
function projectEcho(heads,credits){
 const rows=[],seen=new Set(),byQuest=group(credits,'quest_id');
 for(const h of heads){
  const def=PRIVATE_ECHO_QUESTS_165[h.quest_id];
  if(!def||seen.has(h.quest_id)||
    h.catalog_revision!==PRIVATE_ECHO_CATALOG_REVISION_165||
    h.reward_issued!==false||
    !['accepted','completed'].includes(h.status))
   throw Error('Unsupported Echo quest head');
  seen.add(h.quest_id);
  const completed=h.status==='completed';
  if(completed!==!!h.completed_at||
    completed!==!!h.head_completed_at||
    (completed&&(h.turnin_revision!==h.catalog_revision||
       h.turnin_reward_issued!==false)))
   throw Error('Invalid Echo turn-in state');
  const items=byQuest.get(h.quest_id)||[];
  const objective=def.objective;
  assertCount(items.length,objective.count);
  for(const c of items)validateEchoCredit(c,objective,h.accepted_at);
  if(completed&&items.length!==objective.count)
   throw Error('False Echo completion');
  rows.push(resultRow(h.quest_id,def,echoMeta[h.quest_id],
   h.status,items.length,h.accepted_at,h.completed_at??null));
  byQuest.delete(h.quest_id);
 }
 if(byQuest.size)throw Error('Orphan Echo objective credit');
 return rows;
}
function projectInvitations(invitations,votes,ownerId,characterId){
 const result=[],byLead=group(votes,'lead_id');
 for(const i of invitations){
  const initiator=i.initiator_owner_id===ownerId&&
   i.initiator_character_id===characterId;
  const counterpart=i.counterpart_owner_id===ownerId&&
   i.counterpart_character_id===characterId;
  if(initiator===counterpart||
   i.evidence_kind!=='trusted-private-pvp-candidate-151'||
   count(i.verified_defeats)<3||count(i.distinct_matches)<3||
   count(i.distinct_matches)>count(i.verified_defeats))
   throw Error('Invalid private Rival invitation');
  const v=byLead.get(i.lead_id)||[];
  if(v.length>2||new Set(v.map(x=>x.actor_role)).size!==v.length)
   throw Error('Conflicting Rival votes');
  for(const x of v){
   const expected=x.actor_role==='initiator'
    ?[i.initiator_owner_id,i.initiator_character_id]
    :x.actor_role==='counterpart'
     ?[i.counterpart_owner_id,i.counterpart_character_id]:[];
   if(expected[0]!==x.owner_id||expected[1]!==x.character_id||
      !['rival','friendly_rival','decline'].includes(x.choice))
    throw Error('Unverified Rival choice');
  }
  const ownRole=initiator?'initiator':'counterpart';
  const choice=v.find(x=>x.actor_role===ownRole)?.choice??null;
  let expectedStatus='pending';
  if(v.some(x=>x.choice==='decline'))expectedStatus='declined';
  else if(v.length===2)expectedStatus=
   v[0].choice===v[1].choice?v[0].choice:'disputed';
  if(i.status!==expectedStatus)throw Error('Rival status/votes mismatch');
  result.push(Object.freeze({
   leadId:i.lead_id,status:i.status,
   otherCharacterId:initiator?i.counterpart_character_id:
    i.initiator_character_id,
   actorRole:ownRole,ownChoice:choice,
   otherChoice:null, // privacy: never show the other player's vote
   requiresExplicitConsent:i.status==='pending'&&choice===null,
   mutualConsent:['rival','friendly_rival'].includes(i.status),
   relationship:i.status==='rival'||i.status==='friendly_rival'
    ?i.status:null,
   questAccepted:false,meetingScheduled:false,rewardsIssued:false,
   readOnly:true
  }));
  byLead.delete(i.lead_id);
 }
 if(byLead.size)throw Error('Orphan Rival response');
 return result;
}
const orderedEchoIds=Object.keys(PRIVATE_ECHO_QUESTS_165);
function npcLeads(completed,existing){
 const leads=[];
 for(const questId of orderedEchoIds){
  const def=PRIVATE_ECHO_QUESTS_165[questId];
  if(!completed.has(def.requires)||existing.has(questId))continue;
  const meta=echoMeta[questId];
  leads.push(Object.freeze({
   questId,npcId:meta.npcId,title:meta.title,
   optional:def.kind==='side',
   prerequisiteId:def.requires,
   action:'request_private_server_quest_acceptance',
   requiresExplicitAccept:true,autoAccepted:false,
   claimableReward:false,readOnly:true
  }));
 }
 return Object.freeze(leads);
}
export function createGame3DPrivateQuestbookProjection167({
 pool,authorizeServerOperation
}={}){
 if(typeof pool?.connect!=='function'||
 typeof authorizeServerOperation!=='function')
  throw Error('16.7 needs private DB and independently authorized reader');
 const readSnapshot=async({ownerId,characterId}={})=>{
  if(!validWho(ownerId)||!validWho(characterId))
   return denied('invalid_private_questbook_identity');
  let authorized=false;
  try{authorized=await authorizeServerOperation({
   operation:'read_private_questbook_projection',
   ownerId,characterId
  })===true}catch{}
  if(!authorized)return denied('private_questbook_projection_unauthorized');
  const db=await pool.connect();let txn=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   txn=true;
   if((await db.query(actorSQL,[ownerId,characterId])).rowCount!==1){
    await db.query('ROLLBACK');txn=false;
    return denied('trusted_private_questbook_character_missing');
   }
   const [heads,binding,echoHeads,echoCredits,invites,votes]=
    await Promise.all([
     db.query(starterHeadsSQL,[ownerId,characterId]),
     db.query(starterObjectiveSQL,[ownerId,characterId]),
     db.query(echoHeadsSQL,[ownerId,characterId]),
     db.query(echoCreditsSQL,[ownerId,characterId]),
     db.query(rivalInvitationsSQL,[ownerId,characterId]),
     db.query(rivalChoicesSQL,[ownerId,characterId])
    ]);
   if(heads.rowCount>2||binding.rowCount>16||
    echoHeads.rowCount>7||echoCredits.rowCount>50||
    invites.rowCount>128||votes.rowCount>256)
    throw Error('Private Questbook projection bounds exceeded');
   const quests=[...projectStarter(heads.rows,binding.rows),
    ...projectEcho(echoHeads.rows,echoCredits.rows)];
   const existing=new Set(quests.map(q=>q.id));
   const completed=new Set(quests.filter(q=>q.status==='completed')
    .map(q=>q.id));
   const relationships=projectInvitations(invites.rows,votes.rows,
    ownerId,characterId);
   const leads=npcLeads(completed,existing);
   await db.query('COMMIT');txn=false;
   return Object.freeze({
    ok:true,version:'16.7',
    projectionVersion:PRIVATE_QUESTBOOK_PROJECTION_VERSION_167,
    ownerId,characterId,
    questbook:Object.freeze({
     acceptedIds:Object.freeze(quests.filter(q=>q.status==='accepted')
      .map(q=>q.id)),
     completedIds:Object.freeze([...completed]),
     entries:Object.freeze(quests),
     readOnly:true
    }),
    npcInteractionLeads:leads,
    rivalInvitations:Object.freeze(relationships),
    requiresExplicitNpcAcceptance:true,
    privateServerOnly:true,
    browserQuestStoreConnected:false,clientEventBridgeInstalled:false,
    publicEndpointInstalled:false,questWritesEnabled:false,
    socialWritesEnabled:false,rewardsIssued:false,
    productionReady:false
   });
  }catch{
   if(txn)try{await db.query('ROLLBACK')}catch{}
   return denied('unverified_private_questbook_projection');
  }finally{db.release()}
 };
 return Object.freeze({version:'16.7',readSnapshot,privateServerOnly:true,
  publicEndpointInstalled:false,browserQuestStoreConnected:false,
  npcDialogueBridgeInstalled:false,questWritesEnabled:false,
  socialWritesEnabled:false,rewardWriterEnabled:false,
  productionReady:false});
}
