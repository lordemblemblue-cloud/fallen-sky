// Combat Foundation 5.1 — PRIVATE BETA, internal-only event -> item bridge.
// This module intentionally exposes NO browser route or default event verifier.
// A trusted game server must supply proveCompletion() which checks a COMMITTED
// quest/encounter/craft outcome inside this same PostgreSQL transaction.
// A browser save, upgrade row or signed user request is never source proof.
import {createHash,randomUUID} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {createPgItemProvenance} from './itemProvenance.mjs';

const identity = s => typeof s==='string' &&
  /^[A-Za-z0-9_-]{1,128}$/.test(s) &&
  s!=='__anon__' && s!=='__default__';
const key = s => typeof s==='string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(s);
const hash = x => createHash('sha256').update(stableJournalJSON(x)).digest('hex');
const sha = s => typeof s==='string' && /^[a-f0-9]{64}$/.test(s);
const uuid = s => typeof s==='string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const kinds = new Set(['quest','encounter','craft']);
const validClaim = x => x && identity(x.ownerId) && identity(x.characterId) &&
  key(x.completionId) && key(x.definitionId) &&
  kinds.has(x.sourceKind) && Number.isSafeInteger(x.awardIndex) &&
  x.awardIndex>=0 && x.awardIndex<=32;
const fields = x => ({
  ownerId:x.ownerId,characterId:x.characterId,completionId:x.completionId,
  sourceKind:x.sourceKind,definitionId:x.definitionId,awardIndex:x.awardIndex,
  proofDigest:x.proofDigest,
});
const eventHash = x => hash(fields(x));

export function validateVerifiedCompletion({claim,proof}={}) {
  if (!validClaim(claim) || !proof || proof.ok!==true ||
      proof.provenance!=='server-committed-gameplay' ||
      !sha(proof.proofDigest)) return false;
  return ['ownerId','characterId','completionId','sourceKind',
    'definitionId','awardIndex'].every(k => proof[k]===claim[k]);
}

function parseEvent(row) {
  if (!row || !uuid(row.event_id)) throw Error('Invalid committed gameplay event');
  const x={
    eventId:row.event_id,ownerId:row.owner_id,
    characterId:row.character_id,completionId:row.completion_id,
    sourceKind:row.source_kind,definitionId:row.definition_id,
    awardIndex:Number(row.award_index),proofDigest:row.proof_digest,
  };
  if (!validClaim(x) || !sha(x.proofDigest) ||
      row.event_digest!==eventHash(x))
    throw Error('Committed gameplay event digest mismatch');
  return x;
}

export function createGame3DVerifiedEventBridge({pool,proveCompletion,authorizeIssuance}={}) {
  if (!pool?.connect || !pool?.query) throw Error('5.1 requires PostgreSQL pool');
  // Fail closed instead of allowing a client-authenticated caller to select
  // "verified": the server game loop adapter is a separate trusted dependency.
  const available = typeof proveCompletion==='function';
  const tx=async fn=>{
    const c=await pool.connect();
    try {
      await c.query('BEGIN');
      const out=await fn(c);
      await c.query('COMMIT');
      return out;
    } catch(error) {
      try {await c.query('ROLLBACK');} catch {}
      throw error;
    } finally {c.release();}
  };
  const initialize=async()=>{
    await pool.query('SELECT event_id FROM game3d_verified_gameplay_event LIMIT 0');
    await pool.query('SELECT item_instance_id FROM game3d_item_issuance LIMIT 0');
  };
  // Caller must be the trusted simulation backend; no raw browser transport.
  const recordCompleted=async claim=>{
    if (!validClaim(claim))throw Error('Invalid completed gameplay claim');
    if (!available)throw Error('Committed gameplay verifier is not installed');
    return tx(async client=>{
      // Must prove *this exact* completion against gameplay authority using
      // the same DB transaction, not just accept a caller-supplied digest.
      const proof=await proveCompletion({client,claim:{
        ownerId:claim.ownerId,characterId:claim.characterId,
        completionId:claim.completionId,sourceKind:claim.sourceKind,
        definitionId:claim.definitionId,awardIndex:claim.awardIndex,
      }});
      if (!validateVerifiedCompletion({claim,proof}))
        throw Error('Gameplay completion was not proven by server');
      const event = {...claim,proofDigest:proof.proofDigest};
      const expectedDigest=eventHash(event);
      const eventId=randomUUID();
      const stored=await client.query(
        'INSERT INTO game3d_verified_gameplay_event '+
        '(event_id,owner_id,character_id,completion_id,source_kind,'+
        'definition_id,award_index,proof_digest,event_digest) '+
        'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) '+
        'ON CONFLICT(completion_id,award_index) DO NOTHING '+
        'RETURNING *',
        [eventId,claim.ownerId,claim.characterId,claim.completionId,
         claim.sourceKind,claim.definitionId,claim.awardIndex,
         proof.proofDigest,expectedDigest]);
      if(stored.rowCount===1)
        return {eventId,created:true,proofDigest:proof.proofDigest};
      const prior=await client.query(
        'SELECT * FROM game3d_verified_gameplay_event '+
        'WHERE completion_id=$1 AND award_index=$2 FOR SHARE',
        [claim.completionId,claim.awardIndex]);
      if(prior.rowCount!==1)throw Error('Gameplay completion replay unavailable');
      const verified=parseEvent(prior.rows[0]);
      if (prior.rows[0].event_digest!==expectedDigest)
        throw Error('Conflicting gameplay completion replay');
      return {eventId:verified.eventId,created:false,
        proofDigest:verified.proofDigest};
    });
  };
  // Verify using *the same client transaction* as itemProvenance.issueItem.
  // The event's original signed completion is not reconstructed from client
  // payloads, and ownership/kind/blueprint/award must all match.
  const verifySource=async({client,claim}={})=>{
    if(!client?.query || !claim || !uuid(claim.sourceEventId))
      throw Error('Invalid trusted event source reference');
    const rows=await client.query(
      'SELECT * FROM game3d_verified_gameplay_event '+
      'WHERE event_id=$1 FOR SHARE',[claim.sourceEventId]);
    if(rows.rowCount!==1)throw Error('Unknown committed gameplay event');
    const event=parseEvent(rows.rows[0]);
    if(event.ownerId!==claim.ownerId ||
       event.characterId!==claim.characterId ||
       event.definitionId!==claim.definitionId ||
       event.sourceKind!==claim.sourceKind ||
       event.awardIndex!==claim.awardIndex)
      throw Error('Gameplay event does not authorize this item');
    return {ok:true,ownerId:event.ownerId,characterId:event.characterId,
      sourceDigest:rows.rows[0].event_digest};
  };
  const readEvent=async eventId=>{
    if(!uuid(eventId))throw Error('Invalid server gameplay event identity');
    const r=await pool.query(
      'SELECT * FROM game3d_verified_gameplay_event WHERE event_id=$1',
      [eventId]);
    if(r.rowCount!==1)throw Error('Gameplay event is not committed');
    return parseEvent(r.rows[0]);
  };
  // Compose the existing 5.0 issuance API with this committed event source.
  // The item UUID is minted only after its transaction verifies the source.
  const items=createPgItemProvenance({pool,verifySource,authorizeIssuance});
  const issueFromEvent=async eventId=>{
    const e=await readEvent(eventId);
    return items.issueItem({
      ownerId:e.ownerId,characterId:e.characterId,
      sourceEventId:e.eventId,definitionId:e.definitionId,
      sourceKind:e.sourceKind,awardIndex:e.awardIndex,
    });
  };
  return Object.freeze({initialize,recordCompleted,verifySource,
    readEvent,issueFromEvent,enabled:available});
}
