/**
 * 83.3 — PG16 append-only creator intake audit writer.
 * No routes, migrations, delete operations, rewards or local file logging.
 * Must use a dedicated, non-owner, restricted audit-writer pool.
 */
import {randomUUID} from 'node:crypto';

export const CREATOR_AUDIT_SCHEMA_833='axe-game3d-creator-audit-833-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT=/^[A-Za-z0-9_.:-]{1,128}$/;
const EVENTS=new Set(['intake-attempt','intake-result-ok',
  'intake-result-denied','intake-exception','intake-contract-violation',
  'intake-session-expired']);
const OPERATIONS=new Set(['submit','status','review']);
const SCHEMA=/^axe_creator_test_[a-z0-9_]{1,24}$/;
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||
    Object.getPrototypeOf(v)===null);
const stageActive=()=>process.env.GAME3D_PRIVATE_STAGING_ENV==='staging';
function validatedEvent(event){
  if(!isPlain(event)||Object.keys(event).some(k=>![
    'schema','requestId','event','operation','principalId',
    'occurredAtMs','proposalId','code',
  ].includes(k))||
    event.schema!=='axe-game3d-creator-intake-832-v1'||
    typeof event.requestId!=='string'||!UUID.test(event.requestId)||
    !EVENTS.has(event.event)||!OPERATIONS.has(event.operation)||
    typeof event.principalId!=='string'||
    !SUBJECT.test(event.principalId)||
    ['__anon__','__default__'].includes(event.principalId)||
    !Number.isSafeInteger(event.occurredAtMs)||event.occurredAtMs<=0)
    return null;
  const proposalId=event.proposalId??null,code=event.code??null;
  if(proposalId!==null&&
      (typeof proposalId!=='string'||!UUID.test(proposalId))||
      code!==null&&(typeof code!=='string'||code.length>96||
        !/^[a-z][a-z0-9-]*$/.test(code)))
    return null;
  return Object.freeze({
    requestId:event.requestId,event:event.event,operation:event.operation,
    principalId:event.principalId,occurredAtMs:event.occurredAtMs,
    proposalId,code,
  });
}
async function transaction(pool,schema,fn){
  let client,begun=false;
  try{
    client=await pool.connect();
    if(typeof client?.query!=='function'||typeof client?.release!=='function')
      return false;
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    begun=true;
    await client.query("SELECT set_config('search_path', $1, true)",[schema]);
    const result=await fn(client);
    await client.query('COMMIT');
    begun=false;
    return result;
  }catch{
    if(begun)try{await client.query('ROLLBACK')}catch{}
    return false;
  }finally{
    try{client?.release?.()}catch{}
  }
}
export function createCreatorCatalogPgAudit833({
  pool,schema,enabled=false,scope='disabled',
}={}){
  if(enabled!==true||scope!=='private-staging'||!stageActive()||
    typeof schema!=='string'||!SCHEMA.test(schema)||
    typeof pool?.connect!=='function')
    throw Error('83.3 audit requires restricted disposable private PG16 staging');
  const assertSchema=async()=>{
    if(!stageActive())return false;
    return transaction(pool,schema,async client=>{
      const r=await client.query(
        'SELECT audit_id FROM game3d_creator_catalog_intake_audit_833 LIMIT 0');
      return Array.isArray(r?.rows)&&r.rowCount===0;
    });
  };
  const auditEvent=async event=>{
    if(!stageActive())return false;
    const record=validatedEvent(event);
    if(!record)return false;
    return transaction(pool,schema,async client=>{
      // Audit rows contain metadata only, never raw proposals, notes,
      // credentials, authorization tokens, secret URLs or item instances.
      const inserted=await client.query(
        'INSERT INTO game3d_creator_catalog_intake_audit_833 '+
        '(audit_id,request_id,event,operation,principal_id,'+
        'occurred_at_ms,proposal_id,code) '+
        'VALUES($1,$2,$3,$4,$5,$6,$7,$8) '+
        'ON CONFLICT(request_id,event) DO NOTHING RETURNING audit_id',
        [randomUUID(),record.requestId,record.event,record.operation,
          record.principalId,record.occurredAtMs,record.proposalId,record.code]);
      // Duplicate request/event must never be silently accepted as another
      // pre-mutation audit authorization.
      return inserted?.rowCount===1&&Array.isArray(inserted.rows)&&
        inserted.rows.length===1;
    });
  };
  return Object.freeze({
    version:CREATOR_AUDIT_SCHEMA_833,assertSchema,auditEvent,
    privateServerOnly:true,publicRouteInstalled:false,
    autoMigration:false,productionReady:false,
    auditAppendOnly:true,catalogPublished:false,
    eligibleForIssuance:false,rewardsIssued:false,
  });
}
