/**
 * Game 3D 83.0 — PRIVATE PG16 creator proposal staging, source-only.
 * No public route, schema auto-migration, item issuance, wallet, XP or
 * server-approved live catalog publishing. All callers must be trusted.
 */
import {randomUUID} from 'node:crypto';
import {
  CREATOR_CANDIDATE_SCHEMA_829,
  prepareCreatorCatalogCandidate829,
  verifyCreatorCatalogCandidate829,
  createCreatorCatalogReviewService829,
} from './creatorCatalogReview829.mjs';

export const CREATOR_STAGING_SCHEMA_830='axe-game3d-creator-staging-830-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identity=value=>typeof value==='string'&&
  /^[A-Za-z0-9_.:-]{1,128}$/.test(value)&&
  !['__anon__','__default__'].includes(value);
const denied=reason=>Object.freeze({ok:false,reason,stagingOnly:true,
  catalogPublished:false,eligibleForIssuance:false,rewardsIssued:false});

async function transaction(pool,schema,fn){
  const client=await pool.connect();
  if(!client?.query||typeof client.release!=='function')
    throw Error('Private PostgreSQL client unavailable');
  let begun=false;
  try{
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    begun=true;
    // Bind all unqualified staging tables to the reviewed private schema.
    // Never let PostgreSQL search_path fall back to public or a user schema.
    await client.query("SELECT set_config('search_path', $1, true)",[schema]);
    const result=await fn(client);
    await client.query('COMMIT');
    begun=false;
    return result;
  }catch(error){
    if(begun)try{await client.query('ROLLBACK')}catch{}
    throw error;
  }finally{
    client.release();
  }
}
function currentStage(){
  return process.env.GAME3D_PRIVATE_STAGING_ENV==='staging';
}
function summary(row){
  return Object.freeze({
    proposalId:String(row.proposal_id),status:String(row.status),
    proposalDigest:String(row.proposal_digest),
    catalogPublished:false,eligibleForIssuance:false,rewardsIssued:false,
  });
}
function parseStored(row){
  if(!row||!identity(row.creator_id)||
    !UUID.test(String(row.proposal_id))||
    !/^[0-9a-f]{64}$/.test(String(row.proposal_digest))||
    typeof row.payload!=='object'||row.payload===null)
    return null;
  const candidate={
    schema:CREATOR_CANDIDATE_SCHEMA_829,
    creatorId:row.creator_id,proposalDigest:row.proposal_digest,
    payload:row.payload,draftOnly:true,
    eligibleForIssuance:false,serverPublished:false,
  };
  return verifyCreatorCatalogCandidate829(candidate).ok?candidate:null;
}

/**
 * Requires explicit staging mode and *server-supplied* authentication
 * functions. The functions MUST read trusted authenticated session state,
 * never the proposal's embedded role, identity or a browser-provided flag.
 */
export function createGame3DCreatorCatalogStaging830({
  pool,authorizeCreator,authorizeReviewer,enabled=false,
  scope='disabled',schema=null,
}={}){
  if(enabled!==true||scope!=='private-staging'||!currentStage()||
    typeof schema!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(schema)||
    schema==='public'||
    typeof pool?.connect!=='function'||
    typeof authorizeCreator!=='function'||
    typeof authorizeReviewer!=='function')
    throw Error('83.0 requires explicit private staging and trusted identities');

  const reviewPlanner=createCreatorCatalogReviewService829({authorizeReviewer});
  const creator=async(serverContext,operation)=>{
    try{
      const verified=await authorizeCreator(serverContext,operation);
      if(verified?.authorized===true&&identity(verified.creatorId))
        return verified.creatorId;
    }catch{}
    return null;
  };
  const available=()=>currentStage();
  const assertSchema=async()=>{
    if(!available())return denied('staging-disabled');
    // Manually applied 053 migration required; no DDL or permission writes.
    const result=await transaction(pool,schema,async client=>{
      await client.query('SELECT proposal_id FROM game3d_creator_catalog_proposal_830 LIMIT 0');
      await client.query('SELECT review_id FROM game3d_creator_catalog_review_830 LIMIT 0');
      return true;
    });
    return Object.freeze({ok:result,stagingOnly:true,
      catalogPublished:false,eligibleForIssuance:false});
  };
  const submit=async({proposal,serverContext}={})=>{
    if(!available())return denied('staging-disabled');
    const creatorId=await creator(serverContext,'submit');
    if(!creatorId)return denied('creator-unauthorized');
    const prepared=prepareCreatorCatalogCandidate829({
      proposal,authenticatedCreatorId:creatorId,
    });
    if(!prepared.ok)return denied('invalid-creator-proposal');
    const candidate=prepared.candidate;
    const payload=JSON.stringify(candidate.payload);
    if(payload.length>12000)return denied('proposal-too-large');
    return transaction(pool,schema,async client=>{
      const proposalId=randomUUID();
      const added=await client.query(
        'INSERT INTO game3d_creator_catalog_proposal_830 '+
        '(proposal_id,creator_id,proposal_digest,payload,status,'+
        'draft_only,catalog_published,eligible_for_issuance) '+
        "VALUES($1,$2,$3,$4::jsonb,'pending',true,false,false) "+
        'ON CONFLICT(creator_id,proposal_digest) DO NOTHING '+
        'RETURNING proposal_id,status,proposal_digest',
        [proposalId,creatorId,candidate.proposalDigest,payload]);
      if(added.rowCount===1)
        return Object.freeze({ok:true,created:true,stagingOnly:true,
          ...summary(added.rows[0])});
      const old=await client.query(
        'SELECT proposal_id,creator_id,proposal_digest,payload,status '+
        'FROM game3d_creator_catalog_proposal_830 '+
        'WHERE creator_id=$1 AND proposal_digest=$2 FOR SHARE',
        [creatorId,candidate.proposalDigest]);
      if(old.rowCount!==1||!parseStored(old.rows[0]))
        return denied('stored-proposal-integrity-failed');
      return Object.freeze({ok:true,created:false,stagingOnly:true,
        ...summary(old.rows[0])});
    });
  };
  const status=async({proposalId,serverContext}={})=>{
    if(!available())return denied('staging-disabled');
    const creatorId=await creator(serverContext,'status');
    if(!creatorId)return denied('creator-unauthorized');
    if(typeof proposalId!=='string'||!UUID.test(proposalId))
      return denied('invalid-proposal-id');
    return transaction(pool,schema,async client=>{
      const result=await client.query(
        'SELECT proposal_id,creator_id,proposal_digest,payload,status '+
        'FROM game3d_creator_catalog_proposal_830 '+
        'WHERE proposal_id=$1 AND creator_id=$2 FOR SHARE',
        [proposalId,creatorId]);
      if(result.rowCount!==1)return denied('proposal-not-found');
      if(!parseStored(result.rows[0]))return denied('stored-proposal-integrity-failed');
      return Object.freeze({ok:true,stagingOnly:true,...summary(result.rows[0])});
    });
  };
  const review=async({proposalId,serverContext,disposition,note}={})=>{
    if(!available())return denied('staging-disabled');
    if(typeof proposalId!=='string'||!UUID.test(proposalId))
      return denied('invalid-proposal-id');
    return transaction(pool,schema,async client=>{
      const selected=await client.query(
        'SELECT proposal_id,creator_id,proposal_digest,payload,status '+
        'FROM game3d_creator_catalog_proposal_830 '+
        'WHERE proposal_id=$1 FOR UPDATE',
        [proposalId]);
      if(selected.rowCount!==1)return denied('proposal-not-found');
      const row=selected.rows[0];
      if(row.status!=='pending')return denied('proposal-already-reviewed');
      const candidate=parseStored(row);
      if(!candidate)return denied('stored-proposal-integrity-failed');
      const decision=await reviewPlanner.review({
        candidate,serverContext,disposition,note,
      });
      if(!decision.ok)return denied(decision.code||'review-denied');
      const next={
        'request-changes':'request-changes',
        reject:'rejected',
        'accept-for-curation':'curation-only',
      }[decision.record.disposition];
      if(!next)return denied('invalid-disposition');
      const update=await client.query(
        'UPDATE game3d_creator_catalog_proposal_830 '+
        'SET status=$2,revision=1,reviewed_at=clock_timestamp() '+
        "WHERE proposal_id=$1 AND status='pending' AND revision=0 "+
        'RETURNING proposal_id,proposal_digest,status',
        [proposalId,next]);
      if(update.rowCount!==1)
        throw Error('Proposal state changed during review transaction');
      await client.query(
        'INSERT INTO game3d_creator_catalog_review_830 '+
        '(review_id,proposal_id,proposal_digest,reviewer_id,'+
        'disposition,review_note,status,catalog_published,'+
        'eligible_for_issuance,rewards_issued) '+
        "VALUES($1,$2,$3,$4,$5,$6,'review-record-only',false,false,false)",
        [randomUUID(),proposalId,decision.record.proposalDigest,
          decision.record.reviewerId,decision.record.disposition,
          decision.record.reviewNote]);
      return Object.freeze({ok:true,stagingOnly:true,reviewed:true,
        disposition:decision.record.disposition,reviewerId:decision.record.reviewerId,
        ...summary(update.rows[0])});
    });
  };
  return Object.freeze({
    version:CREATOR_STAGING_SCHEMA_830,
    assertSchema,submit,status,review,
    privateServerOnly:true,publicRouteInstalled:false,
    autoMigration:false,productionReady:false,
    catalogPublished:false,eligibleForIssuance:false,
    rewardsIssued:false,
  });
}
