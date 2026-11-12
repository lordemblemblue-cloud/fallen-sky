// Combat Foundation 5.2 — server completion receipt store (private beta only).
// Internal-only. A trusted simulation must provide confirmSimulation BEFORE any
// gameplay completion can be recorded. A browser message, upgrade roll,
// Character Vault save or arbitrary user token is never simulation proof.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {createGame3DVerifiedEventBridge} from './verifiedGameplayEvents.mjs';

const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)&&
  v!=='__anon__'&&v!=='__default__';
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const digest=v=>createHash('sha256').update(stableJournalJSON(v)).digest('hex');
const KINDS=new Set(['quest','encounter','craft']);
const awardOK=x=>x&&Number.isSafeInteger(x.awardIndex)&&
  x.awardIndex>=0&&x.awardIndex<=32&&key(x.definitionId);
const contextOK=x=>x&&id(x.ownerId)&&id(x.characterId)&&
  key(x.completionId)&&KINDS.has(x.sourceKind);
const canonical=x=>({
  ownerId:x.ownerId,characterId:x.characterId,completionId:x.completionId,
  sourceKind:x.sourceKind,receiptDigest:x.receiptDigest,
  awards:x.awards,
});
function normalizeAwards(awards){
  if(!Array.isArray(awards)||!awards.length||awards.length>33)
    throw Error('Completion has no bounded server-defined item awards');
  const mapped=awards.map(x=>({awardIndex:x?.awardIndex,
    definitionId:x?.definitionId}));
  if(!mapped.every(awardOK)||
     new Set(mapped.map(a=>a.awardIndex)).size!==mapped.length)
    throw Error('Invalid or duplicate item awards');
  return mapped.sort((a,b)=>a.awardIndex-b.awardIndex);
}
function fromRow(row) {
  if(!row||!contextOK({ownerId:row.owner_id,
     characterId:row.character_id,completionId:row.completion_id,
     sourceKind:row.source_kind})||!sha(row.receipt_digest))
    throw Error('Invalid trusted completion record');
  const awards=normalizeAwards(row.awards);
  const record={
    ownerId:row.owner_id,characterId:row.character_id,
    completionId:row.completion_id,sourceKind:row.source_kind,
    receiptDigest:row.receipt_digest,awards,
  };
  if(row.source_digest!==digest(canonical(record)))
    throw Error('Trusted completion record digest mismatch');
  return {...record,sourceDigest:row.source_digest};
}
const within=async(pool,fn)=>{
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const result=await fn(client);
    await client.query('COMMIT');
    return result;
  }catch(error){
    try {await client.query('ROLLBACK');}catch{}
    throw error;
  }finally{client.release();}
};

export function createGame3DCompletionSource({pool,confirmSimulation,authorizeIssuance}={}) {
  if(!pool?.connect||!pool?.query)throw Error('5.2 requires PostgreSQL pool');
  const enabled=typeof confirmSimulation==='function';
  const initialize=async()=>{
    await pool.query('SELECT completion_id FROM game3d_server_completion_source LIMIT 0');
  };
  // A simulator-side call, NOT a user-facing API. The production source must
  // inspect a committed, authoritative event using the supplied DB client.
  // Callback must return all identity fields and the server-determined loot.
  const commitCompletion=async context=>{
    if(!contextOK(context))throw Error('Invalid completion context');
    if(!enabled)throw Error('Trusted simulation completion verifier missing');
    return within(pool,async client=>{
      const verified=await confirmSimulation({client,context:{
        completionId:context.completionId,sourceKind:context.sourceKind,
        ownerId:context.ownerId,characterId:context.characterId,
      }});
      if(verified?.ok!==true ||
         verified.provenance!=='committed-simulation-receipt' ||
         !sha(verified.receiptDigest) ||
         !['completionId','sourceKind','ownerId','characterId']
          .every(name=>verified[name]===context[name]))
        throw Error('Simulation did not confirm this completion identity');
      const awards=normalizeAwards(verified.awards);
      const source={...context,receiptDigest:verified.receiptDigest,awards};
      const sourceDigest=digest(canonical(source));
      const inserted=await client.query(
        'INSERT INTO game3d_server_completion_source '+
        '(completion_id,owner_id,character_id,source_kind,'+
        'receipt_digest,awards,source_digest) '+
        'VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) '+
        'ON CONFLICT(completion_id) DO NOTHING RETURNING completion_id',
        [context.completionId,context.ownerId,context.characterId,
          context.sourceKind,verified.receiptDigest,
          JSON.stringify(awards),sourceDigest]);
      if(inserted.rowCount===1)
        return {...source,sourceDigest,created:true};
      const old=await client.query(
        'SELECT * FROM game3d_server_completion_source '+
        'WHERE completion_id=$1 FOR SHARE',[context.completionId]);
      if(old.rowCount!==1)throw Error('Completion replay not committed');
      const stored=fromRow(old.rows[0]);
      if(stored.sourceDigest!==sourceDigest)
        throw Error('Conflicting completion receipt replay');
      return {...stored,created:false};
    });
  };
  // Used as the exact proveCompletion implementation for Combat 5.1.
  // Must be executed with its caller's SAME transaction for snapshot
  // consistency; never opens a new pool connection for proof.
  const proveCompletion=async({client,claim}={})=>{
    if(!client?.query||!contextOK(claim)||
       !awardOK(claim)||!Number.isSafeInteger(claim.awardIndex))
      throw Error('Invalid completion evidence request');
    const r=await client.query(
      'SELECT * FROM game3d_server_completion_source '+
      'WHERE completion_id=$1 FOR SHARE',[claim.completionId]);
    if(r.rowCount!==1)throw Error('No committed server completion');
    const record=fromRow(r.rows[0]);
    if(record.ownerId!==claim.ownerId||
       record.characterId!==claim.characterId||
       record.sourceKind!==claim.sourceKind||
       !record.awards.some(a=>a.awardIndex===claim.awardIndex&&
         a.definitionId===claim.definitionId))
      throw Error('Completion cannot authorize the requested item');
    return {
      ok:true,provenance:'server-committed-gameplay',
      ownerId:record.ownerId,characterId:record.characterId,
      completionId:record.completionId,sourceKind:record.sourceKind,
      definitionId:claim.definitionId,awardIndex:claim.awardIndex,
      proofDigest:record.sourceDigest,
    };
  };
  // Compose with 5.1; no HTTP / WS / production route is installed.
  const bridge=createGame3DVerifiedEventBridge({pool,proveCompletion,authorizeIssuance});
  const issueCommittedAward=async({completionId,awardIndex}={})=>{
    if(!key(completionId)||!Number.isSafeInteger(awardIndex)||
       awardIndex<0||awardIndex>32)throw Error('Invalid committed award');
    const r=await pool.query(
      'SELECT * FROM game3d_server_completion_source WHERE completion_id=$1',
      [completionId]);
    if(r.rowCount!==1)throw Error('Completion not found');
    const source=fromRow(r.rows[0]);
    const award=source.awards.find(a=>a.awardIndex===awardIndex);
    if(!award)throw Error('Award index absent from server completion');
    const event=await bridge.recordCompleted({
      ownerId:source.ownerId,characterId:source.characterId,
      completionId:source.completionId,sourceKind:source.sourceKind,
      definitionId:award.definitionId,awardIndex,
    });
    return {eventId:event.eventId,...await bridge.issueFromEvent(event.eventId)};
  };
  return Object.freeze({enabled,initialize,commitCompletion,
    proveCompletion,issueCommittedAward});
}
