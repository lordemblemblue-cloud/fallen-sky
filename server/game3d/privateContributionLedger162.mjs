// Game 3D 16.2 — PRIVATE character Contribution Points ledger.
// New private-server credits are isolated from the pre-existing browser
// twelvesky_contribution_v1 balance (10,000 CP on first local load).
// Never auto-import, add a starting 10k, or accept browser-asserted balances.
import {createHash} from 'node:crypto';
import {getPrivateQuestReward157,PRIVATE_QUEST_REWARD_REVISION_157}
 from './privateQuestRewardCatalog157.mjs';
import {getPrivateQuestDefinition154,PRIVATE_QUEST_CATALOG_REVISION_154}
 from './privateQuestCatalog154.mjs';

const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const MAX_BALANCE=9000000000000000n;
const MAX_OPERATION=1000000n;
const fail=reason=>Object.freeze({
 ok:false,version:'16.2',reason,posted:false,
 privateServerOnly:true,legacyBalanceImported:false,
 liveClientWalletMounted:false,productionReady:false,
});
const characterSQL=`
 SELECT owner_id,character_id FROM game3d_trusted_character
 WHERE owner_id=$1 AND character_id=$2 FOR UPDATE
`;
const accountSQL=`
 SELECT balance::text AS balance,lifetime_earned::text AS earned,
 lifetime_spent::text AS spent,lifetime_refunded::text AS refunded,
 revision::text AS revision,migration_status
 FROM game3d_private_contribution_account_162
 WHERE owner_id=$1 AND character_id=$2 FOR UPDATE
`;
const readAccountSQL=accountSQL.replace(' FOR UPDATE','');
const createAccountSQL=`
 INSERT INTO game3d_private_contribution_account_162(owner_id,character_id)
 VALUES($1,$2) ON CONFLICT DO NOTHING
`;
const eventsSQL=`
 SELECT operation_id,kind,source_ref,original_kind,
 amount::text AS amount,balance_after::text AS balance_after,
 wallet_revision::text AS wallet_revision,source_kind
 FROM game3d_private_contribution_event_162
 WHERE owner_id=$1 AND character_id=$2
 ORDER BY wallet_revision
`;
const questSQL=`
 SELECT r.quest_id,r.reward_revision,r.contribution_amount,r.nonspendable,
 r.policy_status,r.contribution_posted,r.points_posted,r.reputation_posted,
 r.item_issued,r.currency_issued,r.xp_grant_event_id,
 p.catalog_revision,p.reward_revision AS plan_revision,
 p.contribution_amount AS planned_contribution,p.plan_only,p.reward_issued,
 h.status AS quest_status,h.reward_authorized,
 t.rewards_issued AS turnin_rewards_issued,
 x.grant_event_id,x.xp_credited,x.reward_revision AS xp_revision,
 e.owner_id AS grant_owner,e.character_id AS grant_character,
 e.event_type,e.provenance
 FROM game3d_private_quest_nonxp_review_159 r
 JOIN game3d_private_quest_reward_plan_157 p USING(owner_id,character_id,quest_id)
 JOIN game3d_private_quest_acceptance_154 h USING(owner_id,character_id,quest_id)
 JOIN game3d_private_quest_turnin_156 t USING(owner_id,character_id,quest_id)
 JOIN game3d_private_quest_xp_settlement_158 x USING(owner_id,character_id,quest_id)
 JOIN game3d_trusted_grant_event e ON e.event_id=x.grant_event_id
 WHERE r.owner_id=$1 AND r.character_id=$2 AND r.quest_id=$3
 FOR SHARE OF r,p,h,t,x,e
`;
const journalSQL=`
 INSERT INTO game3d_private_contribution_event_162
 (owner_id,character_id,operation_id,kind,source_ref,
  original_kind,amount,balance_after,wallet_revision,source_kind)
 VALUES($1,$2,$3,$4,$5,$6,$7::bigint,$8::bigint,$9::bigint,
 'trusted-private-contribution-operation')
 RETURNING operation_id
`;
const updateSQL=`
 UPDATE game3d_private_contribution_account_162
 SET balance=$3::bigint,lifetime_earned=$4::bigint,
 lifetime_spent=$5::bigint,lifetime_refunded=$6::bigint,
 revision=$7::bigint,updated_at=clock_timestamp()
 WHERE owner_id=$1 AND character_id=$2 AND revision=$8::bigint
 RETURNING revision::text AS revision
`;
const canonicalInt=x=>typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x)
 ?BigInt(x):null;
function audit(account,rows){
 if(!account||account.migration_status!=='legacy-unreconciled')
  throw Error('Unapproved contribution migration status');
 let balance=0n,earned=0n,spent=0n,refunded=0n,revision=0n;
 const operations=new Map(),spends=new Map(),refunds=new Set();
 for(const row of rows){
  const amount=canonicalInt(row.amount),after=canonicalInt(row.balance_after);
  const rev=canonicalInt(row.wallet_revision);
  if(!id(row.operation_id)||!id(row.source_ref)||
   amount===null||amount<1n||amount>MAX_OPERATION||
   after===null||rev!==revision+1n||
   row.source_kind!=='trusted-private-contribution-operation'||
   operations.has(row.operation_id))
   throw Error('Corrupt contribution event');
  if(row.kind==='quest-credit'&&row.original_kind===null){
   earned+=amount;balance+=amount;
  }else if(row.kind==='approved-spend'&&row.original_kind===null&&
   row.source_ref===row.operation_id){
   if(balance<amount)throw Error('Contribution journal overspend');
   spent+=amount;balance-=amount;
   spends.set(row.operation_id,amount);
  }else if(row.kind==='approved-refund'&&row.original_kind==='approved-spend'){
   if(!spends.has(row.source_ref)||refunds.has(row.source_ref)||
    amount!==spends.get(row.source_ref))
    throw Error('Unpaired or overpaid Contribution refund');
   refunded+=amount;balance+=amount;
   refunds.add(row.source_ref);
  }else throw Error('Unknown contribution journal kind');
  if(after!==balance||balance>MAX_BALANCE)
   throw Error('Contribution event balance mismatch');
  revision=rev;
  operations.set(row.operation_id,row);
 }
 const values=[balance,earned,spent,refunded,revision];
 const stored=[account.balance,account.earned,account.spent,
  account.refunded,account.revision].map(canonicalInt);
 if(stored.some((v,i)=>v===null||v!==values[i]))
  throw Error('Contribution account does not match journal');
 return {balance,earned,spent,refunded,revision,operations,spends,refunds};
}
function view(state,{operationId=null,posted=false,alreadyPosted=false,
 kind=null,amount=null}={}){
 const safe=x=>{if(x>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error('Contribution exceeds safe integer limit');return Number(x)};
 return Object.freeze({ok:true,version:'16.2',operationId,kind,
  amount:amount===null?null:safe(amount),posted,alreadyPosted,
  balance:safe(state.balance),lifetimeEarned:safe(state.earned),
  lifetimeSpent:safe(state.spent),lifetimeRefunded:safe(state.refunded),
  walletRevision:state.revision.toString(),
  legacyBalanceImported:false,legacyMigrationStatus:'unreconciled',
  privateServerOnly:true,liveClientWalletMounted:false,
  productionReady:false});
}
function verifiedQuest(row,questId,ownerId,characterId){
 const definition=getPrivateQuestDefinition154(questId);
 const reward=getPrivateQuestReward157(questId);
 if(!definition||!reward||definition.repeatable!==false||!row)return null;
 if(row.quest_id!==questId||row.reward_revision!==PRIVATE_QUEST_REWARD_REVISION_157||
  row.plan_revision!==PRIVATE_QUEST_REWARD_REVISION_157||
  row.xp_revision!==PRIVATE_QUEST_REWARD_REVISION_157||
  row.catalog_revision!==PRIVATE_QUEST_CATALOG_REVISION_154||
  row.quest_status!=='completed'||row.reward_authorized!==false||
  row.turnin_rewards_issued!==false||row.xp_credited!==true||
  row.plan_only!==true||row.reward_issued!==false||
  row.nonspendable!==true||
  row.policy_status!=='awaiting-separate-authorities'||
  row.contribution_posted!==false||row.points_posted!==false||
  row.reputation_posted!==false||row.item_issued!==false||
  row.currency_issued!==false||row.xp_grant_event_id!==row.grant_event_id||
  row.grant_owner!==ownerId||row.grant_character!==characterId||
  row.event_type!=='xp'||row.provenance!=='verified-gameplay-event'||
  Number(row.contribution_amount)!==reward.contribution||
  Number(row.planned_contribution)!==reward.contribution)
  return null;
 const amount=BigInt(reward.contribution);
 return amount>0n&&amount<=MAX_OPERATION?amount:null;
}
const questOperation=(ownerId,characterId,questId)=>
 'cpquest-'+createHash('sha256').update(JSON.stringify(
  ['quest-contribution-162-v1',ownerId,characterId,questId]))
  .digest('hex');
export function createGame3DPrivateContributionLedger162({
 pool,authorizeServerOperation,resolveApprovedSpend,verifyApprovedRefund
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeServerOperation!=='function')
  throw Error('16.2 requires trusted PostgreSQL and independent authorization');

 const approved=async(operation,ownerId,characterId,reference=null)=>{
  if(!who(ownerId)||!who(characterId))return false;
  try{return await authorizeServerOperation({operation,ownerId,characterId,
   ...(reference===null?{}:{reference})})===true}catch{return false}
 };

 const apply=async({ownerId,characterId,kind,operationId,sourceRef,
   resolveAmount,expectedReplay}={})=>{
  const db=await pool.connect();let started=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');started=true;
   const character=await db.query(characterSQL,[ownerId,characterId]);
   if(character.rowCount!==1){
    await db.query('ROLLBACK');started=false;
    return fail('trusted_contribution_character_missing');
   }
   await db.query(createAccountSQL,[ownerId,characterId]);
   const account=await db.query(accountSQL,[ownerId,characterId]);
   const existing=await db.query(eventsSQL,[ownerId,characterId]);
   const state=audit(account.rows[0],existing.rows);
   // resolveAmount reads its trusted source INSIDE this transaction.
   const amount=await resolveAmount(db,state);
   if(typeof amount!=='bigint'||amount<1n||amount>MAX_OPERATION)
    throw Error('Invalid approved Contribution amount');
   const prior=state.operations.get(operationId);
   if(prior){
    if(prior.kind!==kind||prior.source_ref!==sourceRef||
       BigInt(prior.amount)!==amount||
       !expectedReplay(prior,state)){
      await db.query('ROLLBACK');started=false;
      return fail('conflicting_contribution_operation_replay');
    }
    await db.query('COMMIT');started=false;
    return view(state,{operationId,kind,amount,alreadyPosted:true});
   }
   if(kind==='approved-spend'&&state.balance<amount){
    await db.query('ROLLBACK');started=false;
    return fail('insufficient_private_contribution_balance');
   }
   if(kind==='approved-refund'&&
    (!state.spends.has(sourceRef)||state.refunds.has(sourceRef)||
     state.spends.get(sourceRef)!==amount)){
    await db.query('ROLLBACK');started=false;
    return fail('invalid_private_contribution_refund');
   }
   const after={
    balance:state.balance+(kind==='approved-spend'?-amount:amount),
    earned:state.earned+(kind==='quest-credit'?amount:0n),
    spent:state.spent+(kind==='approved-spend'?amount:0n),
    refunded:state.refunded+(kind==='approved-refund'?amount:0n),
    revision:state.revision+1n
   };
   if(after.balance>MAX_BALANCE||after.revision>BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('Contribution operation limit exceeded');
   const originalKind=kind==='approved-refund'?'approved-spend':null;
   const journal=await db.query(journalSQL,[ownerId,characterId,operationId,
    kind,sourceRef,originalKind,amount.toString(),after.balance.toString(),
    after.revision.toString()]);
   if(journal.rowCount!==1)throw Error('Contribution journal insert failed');
   const written=await db.query(updateSQL,[ownerId,characterId,
    after.balance.toString(),after.earned.toString(),after.spent.toString(),
    after.refunded.toString(),after.revision.toString(),
    state.revision.toString()]);
   if(written.rowCount!==1)throw Error('Contribution wallet CAS failed');
   await db.query('COMMIT');started=false;
   return view(after,{operationId,kind,amount,posted:true});
  }catch{
   if(started)try{await db.query('ROLLBACK')}catch{}
   return fail('private_contribution_transaction_failed');
  }finally{db.release()}
 };

 const creditQuest=async({ownerId,characterId,questId}={})=>{
  if(!id(questId))return fail('invalid_contribution_quest');
  if(!await approved('credit_verified_quest_contribution',
   ownerId,characterId,questId))
   return fail('private_contribution_credit_unauthorized');
  return apply({ownerId,characterId,kind:'quest-credit',
   operationId:questOperation(ownerId,characterId,questId),
   sourceRef:questId,
   resolveAmount:async db=>{
    const r=await db.query(questSQL,[ownerId,characterId,questId]);
    return r.rowCount===1
     ?verifiedQuest(r.rows[0],questId,ownerId,characterId):null;
   },
   expectedReplay:()=>true
  });
 };

 const spend=async({ownerId,characterId,spendId}={})=>{
  if(!id(spendId))return fail('invalid_contribution_spend_id');
  if(!await approved('spend_private_contribution',
     ownerId,characterId,spendId))
   return fail('private_contribution_spend_unauthorized');
  if(typeof resolveApprovedSpend!=='function')
   return fail('trusted_spend_source_not_installed');
  let record;
  try{record=await resolveApprovedSpend({ownerId,characterId,spendId})}
  catch{return fail('trusted_spend_approval_unavailable')}
  if(record?.approved!==true||record.spendId!==spendId||
     !Number.isSafeInteger(record.amount)||record.amount<1||
     record.amount>Number(MAX_OPERATION))
   return fail('trusted_spend_not_approved');
  // Invoice is resolved by a privileged server callback, not by caller
  // provided price. It MUST bind exact character and unspent spendId.
  const amount=BigInt(record.amount);
  return apply({ownerId,characterId,kind:'approved-spend',operationId:spendId,
   sourceRef:spendId,resolveAmount:async()=>amount,
   expectedReplay:()=>true});
 };

 const refund=async({ownerId,characterId,refundId,spendId}={})=>{
  if(!id(refundId)||!id(spendId)||refundId===spendId)
   return fail('invalid_contribution_refund_reference');
  if(!await approved('refund_private_contribution',
   ownerId,characterId,refundId))
   return fail('private_contribution_refund_unauthorized');
  if(typeof verifyApprovedRefund!=='function')
   return fail('trusted_refund_source_not_installed');
  let approvedRefund;
  try{approvedRefund=await verifyApprovedRefund({
   ownerId,characterId,refundId,spendId
  })===true}catch{}
  if(!approvedRefund)return fail('trusted_refund_not_approved');
  return apply({ownerId,characterId,kind:'approved-refund',
   operationId:refundId,sourceRef:spendId,
   resolveAmount:async(db,state)=>state.spends.get(spendId)||null,
   expectedReplay:(prior,state)=>state.refunds.has(spendId)});
 };

 const readAccount=async({ownerId,characterId}={})=>{
  if(!await approved('read_private_contribution',
    ownerId,characterId))
   return fail('private_contribution_read_unauthorized');
  const db=await pool.connect();let started=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   started=true;
   const ch=await db.query(
    'SELECT 1 FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2',
    [ownerId,characterId]);
   if(ch.rowCount!==1){
    await db.query('ROLLBACK');started=false;
    return fail('trusted_contribution_character_missing');
   }
   const account=await db.query(readAccountSQL,[ownerId,characterId]);
   const events=await db.query(eventsSQL,[ownerId,characterId]);
   let result;
   if(!account.rowCount){
    if(events.rowCount!==0)throw Error('Orphan Contribution events');
    result={balance:0n,earned:0n,spent:0n,refunded:0n,
     revision:0n};
   }else if(account.rowCount===1){
    result=audit(account.rows[0],events.rows);
   }else throw Error('Ambiguous Contribution account');
   await db.query('COMMIT');started=false;
   return view(result,{readOnly:true,operationCount:events.rowCount});
  }catch{
   if(started)try{await db.query('ROLLBACK')}catch{}
   return fail('private_contribution_read_failed');
  }finally{db.release()}
 };
 return Object.freeze({version:'16.2',creditQuest,spend,refund,readAccount,
  privateServerOnly:true,publicEndpointInstalled:false,
  liveClientWalletMounted:false,legacyMigrationInstalled:false,
  legacyStartingCPAutoGranted:false,questCreditWriterEnabled:true,
  approvedSpendWriterEnabled:typeof resolveApprovedSpend==='function',
  approvedRefundWriterEnabled:typeof verifyApprovedRefund==='function',
  productionReady:false});
}
