/**
 * Game 3D 83.2 — PRIVATE in-process catalog intake adapter only.
 *
 * This is not an HTTP, WebSocket, Base44, browser or gameplay endpoint.
 * No item publication, inventory issuance, XP, currency or skill unlock.
 * The host must provide trusted server-session attestation and an audit sink.
 */
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

export const CREATOR_INTAKE_SCHEMA_832='axe-game3d-creator-intake-832-v1';
const OPERATIONS=new Set(['submit','status','review']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT=/^[A-Za-z0-9_.:-]{1,128}$/;
const DISPOSITIONS=new Set(['request-changes','reject','accept-for-curation']);
const RESULT_CODES=new Set(['proposal-not-found','proposal-already-reviewed',
  'invalid-creator-proposal','stored-proposal-integrity-failed',
  'reviewer-not-authorized','self-review-not-allowed','creator-unauthorized',
  'invalid-proposal-id','invalid-disposition','review-note-required',
  'invalid-review-note','proposal-too-large','staging-disabled']);
const isPlain=value=>value!==null&&typeof value==='object'&&
  !Array.isArray(value)&&
  (Object.getPrototypeOf(value)===Object.prototype ||
   Object.getPrototypeOf(value)===null);
const denied=code=>Object.freeze({ok:false,code,
  stagingOnly:true,catalogPublished:false,
  eligibleForIssuance:false,rewardsIssued:false});
function exactKeys(value,allowed){
  return isPlain(value)&&Object.keys(value).length===allowed.length&&
    allowed.every(key=>Object.hasOwn(value,key));
}
export function parseCreatorIntakeBody832(operation,rawBody){
  if(!OPERATIONS.has(operation))return denied('unsupported-operation');
  if(typeof rawBody!=='string'||!rawBody.length||
    Buffer.byteLength(rawBody,'utf8')>16384)
    return denied('body-invalid-or-too-large');
  let object;
  try{object=JSON.parse(rawBody)}catch{return denied('body-invalid-json')}
  const fields=operation==='submit'?['schema','proposal']:
    operation==='status'?['schema','proposalId']:
    ['schema','proposalId','disposition','note'];
  if(!exactKeys(object,fields)||
    object.schema!==CREATOR_INTAKE_SCHEMA_832)
    return denied('body-schema-invalid');
  if(operation==='submit'){
    if(!isPlain(object.proposal))return denied('proposal-invalid');
  }else{
    if(typeof object.proposalId!=='string'||!UUID.test(object.proposalId))
      return denied('proposal-id-invalid');
  }
  if(operation==='review'){
    if(!DISPOSITIONS.has(object.disposition)||
      typeof object.note!=='string'||object.note.length<1||
      object.note.length>500||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(object.note))
      return denied('review-body-invalid');
  }
  return Object.freeze({ok:true,body:object});
}
function safeStageResult(result){
  return isPlain(result)&&typeof result.ok==='boolean'&&
    result.stagingOnly===true&&result.catalogPublished===false&&
    result.eligibleForIssuance===false&&result.rewardsIssued===false;
}
/**
 * Limits are deliberately PER PROCESS; an edge/server-wide shared limiter
 * and CSRF/session protections are still required before adding a route.
 */
export function createGame3DCreatorPrivateIntake832({
  staging,authenticateServerSession,auditEvent,
  enabled=false,scope='disabled',now=Date.now,
  windowMs=60000,principalLimit=8,globalLimit=120,maxPrincipals=500,
}={}){
  if(enabled!==true||scope!=='private-staging'||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    staging?.version!=='axe-game3d-creator-staging-830-v1'||
    staging.privateServerOnly!==true||
    staging.publicRouteInstalled!==false||
    staging.productionReady!==false||
    staging.catalogPublished!==false||
    staging.eligibleForIssuance!==false||
    staging.rewardsIssued!==false||
    ['submit','status','review'].some(name=>typeof staging[name]!=='function')||
    typeof authenticateServerSession!=='function'||
    typeof auditEvent!=='function'||typeof now!=='function'||
    !Number.isSafeInteger(windowMs)||windowMs<1000||windowMs>3600000||
    !Number.isSafeInteger(principalLimit)||principalLimit<1||principalLimit>100||
    !Number.isSafeInteger(globalLimit)||globalLimit<principalLimit||
    globalLimit>10000||
    !Number.isSafeInteger(maxPrincipals)||maxPrincipals<1||
    maxPrincipals>5000)
    throw Error('83.2 requires explicitly private staging, trusted auth, audit and bounded limits');

  const attempts=new Map();
  let globalTimes=[];
  let lastTime=-1;
  const safeNow=()=>{
    const value=now();
    if(!Number.isSafeInteger(value)||value<lastTime)return null;
    lastTime=value;
    return value;
  };
  const globalQuota=time=>{
    globalTimes=globalTimes.filter(t=>time-t<windowMs);
    if(globalTimes.length>=globalLimit)return false;
    globalTimes.push(time);
    return true;
  };
  const principalQuota=(id,operation,time)=>{
    for(const [key,entry] of attempts){
      if(time-entry.lastSeen>=windowMs)attempts.delete(key);
    }
    const key=id+':'+operation;
    const entry=attempts.get(key);
    if(!entry&&attempts.size>=maxPrincipals)return false;
    const times=(entry?.times||[]).filter(t=>time-t<windowMs);
    if(times.length>=principalLimit)return false;
    times.push(time);
    attempts.set(key,{times,lastSeen:time});
    return true;
  };
  const log=async event=>{
    try{return await auditEvent(Object.freeze(event))===true}catch{return false}
  };
  const execute=async({operation,rawBody,serverContext}={})=>{
    if(process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging')
      return denied('staging-disabled');
    const stamp=safeNow();
    if(stamp===null)return denied('clock-invalid');
    if(!OPERATIONS.has(operation))return denied('unsupported-operation');
    if(!globalQuota(stamp))return denied('global-rate-limited');
    if(!isPlain(serverContext))return denied('trusted-context-required');

    let actor;
    try{
      actor=await authenticateServerSession(serverContext,operation);
    }catch{return denied('session-attestation-failed')}
    if(actor?.authorized!==true||
      actor.identitySource!=='trusted-server-session'||
      actor.capability!=='creator-catalog:'+operation||
      typeof actor.principalId!=='string'||!SUBJECT.test(actor.principalId)||
      ['__anon__','__default__'].includes(actor.principalId)||
      !Number.isSafeInteger(actor.expiresAtMs)||
      actor.expiresAtMs<=stamp||actor.expiresAtMs>stamp+900000)
      return denied('session-not-authorized');

    if(!principalQuota(actor.principalId,operation,stamp))
      return denied('principal-rate-limited');
    const parsed=parseCreatorIntakeBody832(operation,rawBody);
    if(!parsed.ok)return parsed;
    const requestId=randomUUID();
    const auditBase={schema:CREATOR_INTAKE_SCHEMA_832,requestId,
      operation,principalId:actor.principalId,occurredAtMs:stamp};
    // Require an accepted pre-mutation audit event. The durable DB staging
    // transaction remains the final authority for proposals/reviews.
    if(!await log({...auditBase,event:'intake-attempt'}))
      return denied('audit-unavailable');
    // Recheck expiry after the potentially asynchronous audit acknowledgment.
    // Staging will independently reauthorize the real server session.
    const beforeStage=safeNow();
    if(beforeStage===null||actor.expiresAtMs<=beforeStage){
      await log({...auditBase,event:'intake-session-expired'});
      return denied('session-expired-before-stage');
    }
    let stage;
    try{
      if(operation==='submit'){
        stage=await staging.submit({
          proposal:parsed.body.proposal,serverContext,
        });
      }else if(operation==='status'){
        stage=await staging.status({
          proposalId:parsed.body.proposalId,serverContext,
        });
      }else{
        stage=await staging.review({
          proposalId:parsed.body.proposalId,
          disposition:parsed.body.disposition,
          note:parsed.body.note,serverContext,
        });
      }
    }catch{
      await log({...auditBase,event:'intake-exception'});
      // The DB transaction MAY have committed before the connection failed.
      // Never report a certain rollback or suggest an unsafe blind retry.
      return Object.freeze({...denied('staging-operation-failed'),
        outcomeUnknown:true,requiresAuditReconciliation:true});
    }
    if(!safeStageResult(stage)){
      await log({...auditBase,event:'intake-contract-violation'});
      return denied('staging-contract-violation');
    }
    const success=stage.ok===true;
    const audited=await log({...auditBase,
      event:success?'intake-result-ok':'intake-result-denied',
      proposalId:typeof stage.proposalId==='string'&&UUID.test(stage.proposalId)
        ?stage.proposalId:null,
      code:success?'ok':RESULT_CODES.has(stage.reason)?stage.reason:
        'staging-denied'});
    if(!success)return denied(RESULT_CODES.has(stage.reason)
      ?stage.reason:'staging-denied');
    // A post-commit audit callback failure cannot undo the committed DB
    // transaction; expose the uncertainty rather than implying a rollback.
    const result={ok:true,stagingOnly:true,
      catalogPublished:false,eligibleForIssuance:false,rewardsIssued:false,
      auditRecorded:audited,requiresAuditReconciliation:!audited,
      status:stage.status,
      ...(typeof stage.proposalId==='string'&&UUID.test(stage.proposalId)
        ?{proposalId:stage.proposalId}:{}),
      ...(operation==='submit'?{created:stage.created===true}:{}),
      ...(operation==='review'?{reviewed:stage.reviewed===true,
        disposition:stage.disposition}:{}),
    };
    return Object.freeze(result);
  };
  return Object.freeze({
    version:CREATOR_INTAKE_SCHEMA_832,
    execute,privateServerOnly:true,publicRouteInstalled:false,
    productionReady:false,autoMigration:false,
    catalogPublished:false,eligibleForIssuance:false,rewardsIssued:false,
  });
}
