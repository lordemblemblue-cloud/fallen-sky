// Game 3D Combat / Quest 15.2 — private, PostgreSQL-backed KILL credit projection.
// This adapter reads only ALREADY-COMMITTED DB kill receipts. It cannot create
// them; 13.6/15.1 pending simulation candidates are NOT accepted here.
// Existing Game 3D quest UI / local store remain unmodified.
// No public routes, browser-provided quest definitions, XP, loot or AGP.
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const receiptKey=x=>typeof x==='string'&&
 /^[A-Za-z0-9_.:-]{8,160}$/.test(x);
const no=reason=>Object.freeze({ok:false,reason,
 privateServerOnly:true,killCreditCommitted:false,
 rewardAuthorized:false,productionReady:false});

const fetchReceiptSQL=`
 SELECT receipt_id,owner_id,character_id,instance_id,instance_epoch,
        map_fingerprint,event_seq::text AS event_seq,enemy_id,enemy_tier,
        committed_at
 FROM game3d_private_world_kill_receipt_152
 WHERE receipt_id=$1 AND owner_id=$2 AND character_id=$3
   AND server_kill_committed=true
   AND source_kind='server-committed-private-pve-kill'
 -- 15.2 kill receipts have an immutable BEFORE UPDATE/DELETE trigger.
 -- Avoid SELECT FOR SHARE here: the restricted 18.4 writer must not gain
 -- UPDATE privileges on immutable world kill evidence merely to read it.
`;
const getMatchingObjectivesSQL=`
 SELECT quest_id,objective_id,required_count
 FROM game3d_private_quest_objective_binding_152
 WHERE owner_id=$1 AND character_id=$2 AND status='accepted'
   AND accepted_at<=$3::timestamptz
   AND (objective_type='kill' OR
       (objective_type='kill_tier' AND enemy_tier=$4))
   AND (enemy_id IS NULL OR enemy_id=$5)
   AND (enemy_tier IS NULL OR enemy_tier=$4)
 ORDER BY quest_id,objective_id
 FOR UPDATE
`;
const countSQL=`
 SELECT COUNT(*)::integer AS n FROM game3d_private_quest_kill_credit_152
 WHERE owner_id=$1 AND character_id=$2
   AND quest_id=$3 AND objective_id=$4
`;
const creditSQL=`
 INSERT INTO game3d_private_quest_kill_credit_152
 (receipt_id,owner_id,character_id,quest_id,objective_id,
  reward_authorized)
 VALUES ($1,$2,$3,$4,$5,false)
 ON CONFLICT DO NOTHING RETURNING receipt_id
`;
const readSQL=`
 SELECT o.quest_id,o.objective_id,o.objective_type,
        o.enemy_tier,o.enemy_id,o.required_count,o.status,
        LEAST(o.required_count,COALESCE(c.credited,0))::integer AS credited
 FROM game3d_private_quest_objective_binding_152 o
 LEFT JOIN (
   SELECT quest_id,objective_id,COUNT(*)::integer AS credited
   FROM game3d_private_quest_kill_credit_152
   WHERE owner_id=$1 AND character_id=$2
   GROUP BY quest_id,objective_id
 ) c ON c.quest_id=o.quest_id AND c.objective_id=o.objective_id
 WHERE o.owner_id=$1 AND o.character_id=$2
 ORDER BY o.quest_id,o.objective_id
`;

export function createGame3DPrivateCommittedQuestCredits152({
 pool,authorizeServerOperation,transactionFence=null,
 verifyCommittedReceipt185=null,sessionFenceMode='legacy',
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeServerOperation!=='function'||
    (transactionFence!==null&&typeof transactionFence!=='function')||
    (verifyCommittedReceipt185!==null&&
     typeof verifyCommittedReceipt185!=='function')||
    !['legacy','per-quest'].includes(sessionFenceMode))
  throw Error('15.2 requires a private PostgreSQL pool and trusted server authorization');

 const approved=async(operation,ownerId,characterId)=>{
  if(!who(ownerId)||!who(characterId))return false;
  try{return await authorizeServerOperation({
   operation,ownerId,characterId
  })===true}catch{return false}
 };
 const project=async({receiptId,ownerId,characterId}={})=>{
  if(!receiptKey(receiptId)||!await approved(
     'project_committed_quest_kill',ownerId,characterId))
   return no('unverified_private_quest_projection');

  const client=await pool.connect();
  let inTransaction=false;
  try{
   // Lock matching objective rows before checking counts. Concurrent receipt
   // writers cannot exceed an objective cap, and the unique journal primary key
   // prevents replaying the same receipt. This is separate from XP settlement.
   await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   inTransaction=true;
   // Distinct 18.4 PG fence contracts: existing world objective writers
   // require a null quest ID; 18.4/18.5 committed-kill progression
   // opts into the per-quest authorization below. Both fail closed.
   const legacyFenceRequest=Object.freeze({ownerId,characterId,questId:null,
    operation:'project_committed_quest_kill'});
   if(sessionFenceMode==='legacy'&&transactionFence!==null&&
      await transactionFence(client,legacyFenceRequest)!==true){
    await client.query('ROLLBACK');inTransaction=false;
    return no('private_world_objective_session_unverified');
   }
   const receipt=await client.query(fetchReceiptSQL,
    [receiptId,ownerId,characterId]);
   if(receipt.rowCount!==1){
    await client.query('ROLLBACK');inTransaction=false;
    return no('committed_server_kill_receipt_missing');
   }
   const r=receipt.rows[0];
   const receiptRecord=Object.freeze({
    receiptId,ownerId,characterId,instanceId:r.instance_id,
    instanceEpoch:r.instance_epoch,mapFingerprint:r.map_fingerprint,
    eventSeq:r.event_seq,
   });
   // 18.5 opt-in: before projecting a single credit, compare this
   // immutable 15.2 receipt to the SEPARATELY persisted 18.5 binding row.
   // This runs inside the same transaction; the resolver's suggested nonce
   // cannot make an old kill count toward a newly re-paired world.
   const trustedReceipt=async()=>verifyCommittedReceipt185===null||
    await verifyCommittedReceipt185(client,receiptRecord)===true;
   if(!await trustedReceipt()){
    await client.query('ROLLBACK');inTransaction=false;
    return no('committed_kill_session_binding_missing');
   }
   const matches=await client.query(getMatchingObjectivesSQL,
    [ownerId,characterId,r.committed_at,r.enemy_tier,r.enemy_id]);
   // Session-fence EACH matched quest from committed server-owned bindings,
   // never a browser-supplied quest ID. All checks use the SAME client as
   // the credit INSERT and hold PG FOR SHARE until transaction completion.
   const matchedQuestIds=[...new Set(matches.rows.map(row=>row.quest_id))];
   const fenced=async()=>{
    if(transactionFence===null)return true;
    if(sessionFenceMode==='legacy')
     return await transactionFence(client,legacyFenceRequest)===true;
    for(const questId of matchedQuestIds){
     if(typeof questId!=='string'||await transactionFence(client,
       Object.freeze({ownerId,characterId,questId,
        operation:'project_committed_quest_kill'}))!==true)return false;
    }
    return true;
   };
   if(!await fenced()){
    await client.query('ROLLBACK');inTransaction=false;
    return no(sessionFenceMode==='legacy'
     ?'private_world_objective_session_unverified'
     :'transaction_world_session_unverified');
   }
   const credited=[];
   for(const objective of matches.rows){
    const required=Number(objective.required_count);
    if(!Number.isSafeInteger(required)||required<1||required>10000)
     throw Error('invalid trusted objective requirement');
    const qid=objective.quest_id,oid=objective.objective_id;
    const current=await client.query(countSQL,[ownerId,characterId,qid,oid]);
    if(current.rowCount!==1)throw Error('incomplete private quest projection');
    const existing=Number(current.rows[0].n);
    if(!Number.isSafeInteger(existing)||existing<0)
     throw Error('corrupt private quest credit count');
    if(existing>=required)continue;
    const insert=await client.query(creditSQL,
     [receiptId,ownerId,characterId,qid,oid]);
    if(insert.rowCount===1)
     credited.push(Object.freeze({
      questId:qid,objectiveId:oid,count:existing+1,required,
      readyForTurnIn:existing+1>=required
     }));
   }
   // 18.5 binding and 18.3 world lease must STILL match after credit
   // INSERTs. A rotated original nonce, stale binding or lease expiry
   // rolls back the entire receipt projection transaction.
   if(!await trustedReceipt()||!await fenced()){
    await client.query('ROLLBACK');inTransaction=false;
    return no(sessionFenceMode==='legacy'
     ?'private_world_objective_session_changed'
     :'transaction_world_session_changed');
   }
   await client.query('COMMIT');inTransaction=false;
   return Object.freeze({
    ok:true,version:'15.2',receiptId,
    credited:Object.freeze(credited),
    killCreditCommitted:credited.length>0,
    // This does not complete quests, authorize XP/loot or save the browser HUD.
    questTurnInCommitted:false,rewardAuthorized:false,
    privateServerOnly:true,productionReady:false,
   });
  }catch{
   if(inTransaction)try{await client.query('ROLLBACK')}catch{}
   return no('private_quest_projection_failed');
  }finally{client.release()}
 };
 const readProgress=async({ownerId,characterId}={})=>{
  if(!await approved('read_committed_quest_progress',ownerId,characterId))
   return no('unverified_private_quest_reader');
  const client=await pool.connect();
  try{
   const r=await client.query(readSQL,[ownerId,characterId]);
   return Object.freeze({ok:true,version:'15.2',
    objectives:Object.freeze(r.rows.map(row=>Object.freeze({
     questId:row.quest_id,objectiveId:row.objective_id,
     type:row.objective_type,status:row.status,
     current:Number(row.credited),required:Number(row.required_count),
    }))),
    privateServerOnly:true,rewardAuthorized:false,productionReady:false});
  }catch{return no('private_quest_read_failed')}
  finally{client.release()}
 };
 return Object.freeze({version:'15.2',project,readProgress,
  privateServerOnly:true,committedReceiptWriterInstalled:false,
  trustedQuestAcceptanceWriterInstalled:false,
  clientWorldConnected:false,publicEndpointInstalled:false,
  questTurnInWriterEnabled:false,rewardWriterEnabled:false,
  productionReady:false});
}
