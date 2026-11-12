// Combat / Quest 16.5: authoritative PRIVATE Echo chapter + branch runner.
// Mirrors authored AXEEchoChapters IDs and objectives, but takes NO quest
// definition, objective count, XP, location report or defeated enemy from UI.
// Private server only. No public route or quest reward writer.
export const PRIVATE_ECHO_CATALOG_REVISION_165='axe-private-echo-165-v1';
const objective=(id,type,count,tier=null,targetId=null)=>
 Object.freeze({id,type,count,tier,targetId});
const quest=(id,requires,kind,o)=>Object.freeze({
 id,requires,kind,repeatable:false,objective:o
});
export const PRIVATE_ECHO_QUESTS_165=Object.freeze({
 echo_ch_14_first_echo:quest('echo_ch_14_first_echo','axe_q_first_patrol','chapter',
  objective('patrol','kill',2)),
 echo_ch_15_world_signs:quest('echo_ch_15_world_signs','echo_ch_14_first_echo','chapter',
  objective('crystal','discover_location',1,null,'ft_spirit_vein')),
 echo_ch_16_crossroads:quest('echo_ch_16_crossroads','echo_ch_15_world_signs','chapter',
  objective('elite','kill_tier',1,'elite')),
 echo_ch_17_aftershocks:quest('echo_ch_17_aftershocks','echo_ch_16_crossroads','chapter',
  objective('aftershock','kill',4)),
 echo_ch_18_traces_remain:quest('echo_ch_18_traces_remain','echo_ch_17_aftershocks','chapter',
  objective('champion','kill_tier',1,'champion')),
 echo_branch_hidden_echo:quest('echo_branch_hidden_echo','echo_ch_16_crossroads','side',
  objective('tablet','discover_location',1,null,'ft_weathered_tablet')),
 echo_branch_broken_road:quest('echo_branch_broken_road','echo_ch_16_crossroads','side',
  objective('road','kill',3))
});
const echo=id=>typeof id==='string'&&Object.hasOwn(PRIVATE_ECHO_QUESTS_165,id)
 ?PRIVATE_ECHO_QUESTS_165[id]:null;
const validWho=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s)&&
 s!=='__anon__'&&s!=='__default__';
const validReceipt=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{8,160}$/.test(s);
const validWorld=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(s);
const validTarget=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(s);
const fail=reason=>Object.freeze({ok:false,version:'16.5',reason,
 progressCommitted:false,questCompleted:false,rewardsIssued:false,
 privateServerOnly:true,productionReady:false});
const lockCharacter=`
 SELECT 1 FROM game3d_trusted_character
 WHERE owner_id=$1 AND character_id=$2 FOR UPDATE
`;
const prerequisiteStarter=`
 SELECT t.quest_id FROM game3d_private_quest_turnin_156 t
 JOIN game3d_private_quest_acceptance_154 a
 ON a.owner_id=t.owner_id AND a.character_id=t.character_id AND a.quest_id=t.quest_id
 WHERE t.owner_id=$1 AND t.character_id=$2
 AND t.quest_id='axe_q_first_patrol'
 AND a.status='completed' AND a.reward_authorized=false
 AND t.rewards_issued=false AND a.catalog_revision=t.catalog_revision
`;
const prerequisiteEcho=`
 SELECT t.quest_id FROM game3d_private_echo_turnin_165 t
 JOIN game3d_private_echo_quest_165 q
 ON q.owner_id=t.owner_id AND q.character_id=t.character_id AND q.quest_id=t.quest_id
 WHERE t.owner_id=$1 AND t.character_id=$2 AND t.quest_id=$3
 AND q.status='completed'
 AND q.catalog_revision='axe-private-echo-165-v1'
 AND t.catalog_revision=q.catalog_revision AND t.reward_issued=false
 AND q.reward_issued=false
`;
const fetchQuest=`
 SELECT quest_id,status,catalog_revision,accepted_at,reward_issued,completed_at
 FROM game3d_private_echo_quest_165
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3 FOR UPDATE
`;
const acceptedList=`
 SELECT q.quest_id,q.status,q.catalog_revision,q.accepted_at,
 q.completed_at,q.reward_issued,
 (SELECT count(*)::int FROM game3d_private_echo_objective_credit_165 c
  WHERE c.owner_id=q.owner_id AND c.character_id=q.character_id
  AND c.quest_id=q.quest_id) AS credited
 FROM game3d_private_echo_quest_165 q
 WHERE q.owner_id=$1 AND q.character_id=$2
 ORDER BY q.accepted_at,q.quest_id
`;
const insertQuest=`
 INSERT INTO game3d_private_echo_quest_165
 (owner_id,character_id,quest_id,catalog_revision)
 VALUES($1,$2,$3,'axe-private-echo-165-v1') RETURNING quest_id
`;
const killReceipt=`
 SELECT receipt_id,enemy_id,enemy_tier,committed_at AS observed_at
 FROM game3d_private_world_kill_receipt_152
 WHERE receipt_id=$1 AND owner_id=$2 AND character_id=$3
 AND server_kill_committed=true AND source_kind='server-committed-private-pve-kill'
 FOR SHARE
`;
const discoveryReceipt=`
 SELECT receipt_id,target_id,observed_at
 FROM game3d_private_world_discovery_receipt_165
 WHERE receipt_id=$1 AND owner_id=$2 AND character_id=$3
 AND source_kind='trusted-private-world-discovery'
 FOR SHARE
`;
const insertDiscovery=`
 INSERT INTO game3d_private_world_discovery_receipt_165
 (receipt_id,owner_id,character_id,world_id,target_id,evidence_digest,source_kind,observed_at)
 VALUES($1,$2,$3,$4,$5,$6,'trusted-private-world-discovery',to_timestamp($7::bigint/1000.0))
 ON CONFLICT DO NOTHING RETURNING receipt_id
`;
const existingDiscovery=`
 SELECT owner_id,character_id,world_id,target_id,evidence_digest
 FROM game3d_private_world_discovery_receipt_165 WHERE receipt_id=$1 FOR SHARE
`;
const countProgress=`
 SELECT count(*)::int AS credited FROM game3d_private_echo_objective_credit_165
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3
`;
const writeProgress=`
 INSERT INTO game3d_private_echo_objective_credit_165
 (owner_id,character_id,quest_id,receipt_id,receipt_kind,objective_id)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING receipt_id
`;
const finishQuest=`
 UPDATE game3d_private_echo_quest_165
 SET status='completed',completed_at=clock_timestamp()
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3
 AND status='accepted' AND reward_issued=false
 RETURNING quest_id,completed_at
`;
const finishJournal=`
 INSERT INTO game3d_private_echo_turnin_165
 (owner_id,character_id,quest_id,catalog_revision,source_kind)
 VALUES($1,$2,$3,'axe-private-echo-165-v1','verified-private-echo-turnin')
 RETURNING quest_id
`;
const branchLeads=Object.freeze([
 Object.freeze({questId:'echo_branch_hidden_echo',title:'The Hidden Echo',
  npc:'Noor the Wanderer',optional:true,autoAccepted:false}),
 Object.freeze({questId:'echo_branch_broken_road',title:'The Broken Road',
  npc:'Vex the Hunter',optional:true,autoAccepted:false})
]);
const validatedHead=(row,definition)=>row?.quest_id===definition?.id&&
 row.catalog_revision===PRIVATE_ECHO_CATALOG_REVISION_165&&
 row.reward_issued===false;
function matchedReceipt(definition,kind,row,acceptedAt){
 if(!row?.observed_at||!(new Date(row.observed_at).getTime()>=
    new Date(acceptedAt).getTime()))return false;
 const o=definition.objective;
 if(o.type==='discover_location')
  return kind==='discovery'&&row.target_id===o.targetId;
 if(kind!=='kill')return false;
 if(o.type==='kill_tier'&&row.enemy_tier!==o.tier)return false;
 return o.type==='kill'||o.type==='kill_tier';
}
export function createGame3DPrivateEchoQuest165({
 pool,authorizeServerOperation,resolveTrustedWorldDiscovery,now=Date.now,
 transactionFence=null,
}={}){
 if(typeof pool?.connect!=='function'||
 typeof authorizeServerOperation!=='function'||typeof now!=='function'||
 (transactionFence!==null&&typeof transactionFence!=='function'))
  throw Error('16.5 requires private DB, operator and clock');
 const allowed=async(operation,ownerId,characterId,questId=null)=>{
  if(!validWho(ownerId)||!validWho(characterId))return false;
  try{return await authorizeServerOperation({operation,ownerId,characterId,
   ...(questId===null?{}:{questId})})===true}catch{return false}
 };
 const transact=async(fn)=>{
  const db=await pool.connect();let tx=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');tx=true;
   const result=await fn(db);
   await db.query('COMMIT');tx=false;
   return result;
  }catch{
   if(tx)try{await db.query('ROLLBACK')}catch{}
   return fail('private_echo_transaction_failed');
  }finally{db.release()}
 };
 const lock=async(db,ownerId,characterId)=>
  (await db.query(lockCharacter,[ownerId,characterId])).rowCount===1;
 const accept=async({ownerId,characterId,questId}={})=>{
  const def=echo(questId);
  if(!def)return fail('echo_quest_not_in_server_catalog');
  if(!await allowed('accept_private_echo_quest',ownerId,characterId,questId))
   return fail('private_echo_accept_unauthorized');
  return transact(async db=>{
   if(!await lock(db,ownerId,characterId))return fail('echo_character_missing');
   const fenceRequest=Object.freeze({ownerId,characterId,questId,
    operation:'accept_private_echo_quest'});
   if(transactionFence!==null&&
      await transactionFence(db,fenceRequest)!==true)
    throw Error('18.3 world session lease inactive');
   const prerequisite=def.requires==='axe_q_first_patrol'
    ?await db.query(prerequisiteStarter,[ownerId,characterId])
    :await db.query(prerequisiteEcho,[ownerId,characterId,def.requires]);
   if(prerequisite.rowCount!==1)return fail('echo_prerequisite_unfinished');
   if((await db.query(fetchQuest,[ownerId,characterId,questId])).rowCount)
    return fail('echo_nonrepeatable_already_registered');
   const inserted=await db.query(insertQuest,[ownerId,characterId,questId]);
   if(inserted.rowCount!==1)throw Error('Cannot bind Echo quest');
   if(transactionFence!==null&&
      await transactionFence(db,fenceRequest)!==true)
    throw Error('18.3 world session changed before Echo commit');
   return Object.freeze({ok:true,version:'16.5',questId,
    accepted:true,questCompleted:false,rewardsIssued:false,
    privateServerOnly:true,productionReady:false});
  });
 };
 const recordDiscovery=async({ownerId,characterId,receiptId}={})=>{
  if(!validReceipt(receiptId))return fail('invalid_private_discovery_receipt');
  if(!await allowed('record_private_world_discovery',ownerId,characterId))
   return fail('private_discovery_unauthorized');
  if(typeof resolveTrustedWorldDiscovery!=='function')
   return fail('private_discovery_authority_not_installed');
  let p;
  try{p=await resolveTrustedWorldDiscovery({receiptId,ownerId,characterId})}
  catch{return fail('private_discovery_authority_unavailable')}
  if(p?.sourceKind!=='trusted-private-world-discovery'||
   p.receiptId!==receiptId||p.ownerId!==ownerId||
   p.characterId!==characterId||!validWorld(p.worldId)||
   !validTarget(p.targetId)||!/^[a-f0-9]{64}$/.test(p.evidenceDigest)||
   !Number.isSafeInteger(p.occurredAt)||p.occurredAt>now()||
   now()-p.occurredAt>7*86400000)
   return fail('unverified_private_world_discovery');
  return transact(async db=>{
   if(!await lock(db,ownerId,characterId))return fail('echo_character_missing');
   const inserted=await db.query(insertDiscovery,[receiptId,ownerId,
    characterId,p.worldId,p.targetId,p.evidenceDigest,p.occurredAt]);
   const source=await db.query(existingDiscovery,[receiptId]);
   const r=source.rows[0];
   if(source.rowCount!==1||r.owner_id!==ownerId||
    r.character_id!==characterId||r.world_id!==p.worldId||
    r.target_id!==p.targetId||r.evidence_digest!==p.evidenceDigest)
    return fail('conflicting_private_discovery_receipt');
   return Object.freeze({ok:true,version:'16.5',
    receiptId,recorded:inserted.rowCount===1,
    privateServerOnly:true,questCompleted:false,rewardsIssued:false,
    productionReady:false});
  });
 };
 const credit=async({ownerId,characterId,questId,receiptId,kind}={})=>{
  const def=echo(questId);
  if(!def||!validReceipt(receiptId)||!['kill','discovery'].includes(kind))
   return fail('invalid_private_echo_objective');
  if(!await allowed('credit_private_echo_objective',ownerId,characterId,questId))
   return fail('private_echo_credit_unauthorized');
  return transact(async db=>{
   if(!await lock(db,ownerId,characterId))return fail('echo_character_missing');
   const fenceRequest=Object.freeze({ownerId,characterId,questId,
    operation:'credit_private_echo_objective'});
   if(transactionFence!==null&&
      await transactionFence(db,fenceRequest)!==true)
    throw Error('18.4 Echo credit world session unverified');
   const head=await db.query(fetchQuest,[ownerId,characterId,questId]);
   if(head.rowCount!==1||!validatedHead(head.rows[0],def)||
      head.rows[0].status!=='accepted')
    return fail('echo_quest_not_accepted');
   const receipt=await db.query(kind==='kill'?killReceipt:discoveryReceipt,
    [receiptId,ownerId,characterId]);
   if(receipt.rowCount!==1||
      !matchedReceipt(def,kind,receipt.rows[0],head.rows[0].accepted_at))
    return fail('echo_objective_receipt_not_verified');
   const n=await db.query(countProgress,[ownerId,characterId,questId]);
   if(n.rowCount!==1||!Number.isSafeInteger(Number(n.rows[0].credited)))
    throw Error('Invalid Echo progress');
   if(Number(n.rows[0].credited)>=def.objective.count){
    if(transactionFence!==null&&
       await transactionFence(db,fenceRequest)!==true)
     throw Error('18.4 Echo credit session expired before commit');
    return Object.freeze({ok:true,version:'16.5',questId,
     credited:Number(n.rows[0].credited),required:def.objective.count,
     progressCommitted:false,readyToTurnIn:true,rewardsIssued:false,
     privateServerOnly:true,productionReady:false});
   }
   const wrote=await db.query(writeProgress,[ownerId,characterId,questId,
    receiptId,kind,def.objective.id]);
   const refreshed=await db.query(countProgress,[ownerId,characterId,questId]);
   const credited=Number(refreshed.rows[0].credited);
   if(transactionFence!==null&&
      await transactionFence(db,fenceRequest)!==true)
    throw Error('18.4 Echo credit session changed before commit');
   return Object.freeze({ok:true,version:'16.5',questId,
    credited,required:def.objective.count,
    progressCommitted:wrote.rowCount===1,
    readyToTurnIn:credited>=def.objective.count,
    rewardsIssued:false,privateServerOnly:true,productionReady:false});
  });
 };
 const turnIn=async({ownerId,characterId,questId}={})=>{
  const def=echo(questId);
  if(!def)return fail('echo_quest_not_in_server_catalog');
  if(!await allowed('turn_in_private_echo_quest',ownerId,characterId,questId))
   return fail('private_echo_turnin_unauthorized');
  return transact(async db=>{
   if(!await lock(db,ownerId,characterId))return fail('echo_character_missing');
   const fenceRequest=Object.freeze({ownerId,characterId,questId,
    operation:'turn_in_private_echo_quest'});
   if(transactionFence!==null&&
      await transactionFence(db,fenceRequest)!==true)
    throw Error('18.4 Echo turn-in world session unverified');
   const head=await db.query(fetchQuest,[ownerId,characterId,questId]);
   if(head.rowCount!==1||!validatedHead(head.rows[0],def))
    return fail('echo_quest_not_accepted');
   if(head.rows[0].status!=='accepted')
    return fail('echo_quest_already_closed');
   const n=await db.query(countProgress,[ownerId,characterId,questId]);
   if(n.rowCount!==1||Number(n.rows[0].credited)!==def.objective.count)
    return fail('echo_objective_incomplete');
   const ended=await db.query(finishQuest,[ownerId,characterId,questId]);
   const journal=await db.query(finishJournal,[ownerId,characterId,questId]);
   if(ended.rowCount!==1||journal.rowCount!==1)
    throw Error('Echo turn-in journal mismatch');
   if(transactionFence!==null&&
      await transactionFence(db,fenceRequest)!==true)
    throw Error('18.4 Echo turn-in session changed before commit');
   return Object.freeze({ok:true,version:'16.5',questId,
    questCompleted:true,completedAt:ended.rows[0].completed_at,
    rewardsIssued:false,privateServerOnly:true,productionReady:false});
  });
 };
 const readQuestbook=async({ownerId,characterId}={})=>{
  if(!await allowed('read_private_echo_questbook',ownerId,characterId))
   return fail('private_echo_read_unauthorized');
  const db=await pool.connect();
  try{
   const results=await db.query(acceptedList,[ownerId,characterId]);
   if(results.rows.some(r=>!echo(r.quest_id)||
      r.catalog_revision!==PRIVATE_ECHO_CATALOG_REVISION_165||
      r.reward_issued!==false))return fail('invalid_echo_questbook_state');
   return Object.freeze({ok:true,version:'16.5',
    quests:Object.freeze(results.rows.map(r=>{
     const def=echo(r.quest_id);
     return Object.freeze({questId:r.quest_id,kind:def.kind,
      status:r.status,acceptedAt:r.accepted_at,
      completedAt:r.completed_at,credited:Number(r.credited),
      required:def.objective.count,objective:def.objective,
      rewardsIssued:false});
    })),privateServerOnly:true,rewardsIssued:false,
    productionReady:false});
  }catch{return fail('private_echo_read_failed')}
  finally{db.release()}
 };
 const readBranchLeads=async({ownerId,characterId}={})=>{
  if(!await allowed('read_private_echo_branch_leads',ownerId,characterId))
   return fail('private_echo_branch_read_unauthorized');
  const db=await pool.connect();
  try{
   const gate=await db.query(prerequisiteEcho,[
    ownerId,characterId,'echo_ch_16_crossroads']);
   if(gate.rowCount!==1)return Object.freeze({ok:true,version:'16.5',
    eligibility:'chapter_16_server_completion_required',
    leads:Object.freeze([]),autoAccepted:false,
    rewardsIssued:false,productionReady:false});
   const r=await db.query(acceptedList,[ownerId,characterId]);
   const registered=new Set(r.rows.map(x=>x.quest_id));
   return Object.freeze({ok:true,version:'16.5',
    eligibility:'verified',
    leads:Object.freeze(branchLeads.filter(x=>!registered.has(x.questId))),
    branchChoicesIndependent:true,autoAccepted:false,
    rewardsIssued:false,privateServerOnly:true,productionReady:false});
  }catch{return fail('private_echo_branch_read_failed')}
  finally{db.release()}
 };
 return Object.freeze({version:'16.5',accept,recordDiscovery,credit,turnIn,
  readQuestbook,readBranchLeads,privateServerOnly:true,
  publicEndpointInstalled:false,worldDiscoveryProofSourceInstalled:
   typeof resolveTrustedWorldDiscovery==='function',
  encounterHookInstalled:false,questRewardWriterEnabled:false,
  browserQuestbookConnected:false,productionReady:false});
}
