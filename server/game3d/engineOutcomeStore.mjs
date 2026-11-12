// Combat Foundation 9.1 — INTERNAL, disabled until real game-engine attestations.
// A browser-supplied kill, quest completion or "verified" flag is never proof.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {normalizeWorldEventContext} from './worldEventJournal.mjs';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
  x!=='__anon__'&&x!=='__default__';
const hex=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const digest=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
export const engineOutcomeBody=(raw,evidenceDigest)=>{
 const c=normalizeWorldEventContext(raw);
 if(!c||!id(c.eventId)||!id(c.instanceId)||!who(c.ownerId)||
    !who(c.characterId)||!Number.isSafeInteger(c.serverTick)||
    c.serverTick<0||!hex(evidenceDigest)||
    !['enemy_killed','location_discovered','craft_completed'].includes(c.type)||
    (c.type==='enemy_killed'&&!['normal','elite','boss'].includes(c.tier))||
    (c.type==='location_discovered'&&!id(c.location))||
    (c.type==='craft_completed'&&(c.tier!==null||c.location!==null))||
    (c.type!=='enemy_killed'&&c.tier!==null)||
    (c.type!=='location_discovered'&&c.location!==null))
  throw Error('Invalid authenticated game-engine outcome');
 return {...c,evidenceDigest};
};
export const engineOutcomeDigest=body=>digest(body);

export function createGame3DEngineOutcomeStore({pool,proveEngineEvent}={}){
 if(!pool?.connect||!pool?.query)throw Error('Engine outcome store needs private PG');
 const enabled=typeof proveEngineEvent==='function';
 const commit=async context=>{
  if(!enabled)throw Error('Trusted game-engine attester is not installed');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   // The attester must resolve *committed* authoritative simulation state
   // using this transaction. It must never accept a browser assertion.
   const proof=await proveEngineEvent({client:c,context});
   if(proof?.ok!==true||proof.source!=='game-server-simulation'||
      !hex(proof.evidenceDigest))
    throw Error('Engine did not verify outcome');
   const body=engineOutcomeBody(context,proof.evidenceDigest);
   if(!['eventId','instanceId','ownerId','characterId','type','serverTick',
    'tier','location'].every(k=>(proof[k]??null)===(body[k]??null)))
    throw Error('Game-engine proof does not match event identity');
   const hash=engineOutcomeDigest(body);
   const r=await c.query(
    'INSERT INTO game3d_engine_outcome '+
    '(event_id,instance_id,owner_id,character_id,event_type,server_tick,'+
    'tier,location,evidence_digest,outcome_digest) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) '+
    'ON CONFLICT(event_id) DO NOTHING RETURNING event_id',
    [body.eventId,body.instanceId,body.ownerId,body.characterId,
     body.type,body.serverTick,body.tier,body.location,body.evidenceDigest,hash]);
   if(!r.rowCount){
    const previous=await c.query(
     'SELECT outcome_digest FROM game3d_engine_outcome '+
     'WHERE event_id=$1 FOR SHARE',[body.eventId]);
    if(previous.rowCount!==1||previous.rows[0].outcome_digest!==hash)
     throw Error('Conflicting authoritative engine event replay');
   }
   await c.query('COMMIT');
   return {eventId:body.eventId,created:r.rowCount===1,outcomeDigest:hash,
    rewardsIssued:false};
  }catch(error){try{await c.query('ROLLBACK')}catch{}throw error}
  finally{c.release()}
 };
 return Object.freeze({enabled,commit});
}
