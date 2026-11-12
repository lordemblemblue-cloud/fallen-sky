// Combat Foundation 6.0 — internal-only, append-only trusted world event journal.
// No REST endpoint. A client may never report a server kill/discovery by itself.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const types=new Set(['enemy_killed','location_discovered','craft_completed']);
const sum=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
// Enforce the exact payload that the committed world-event ledger stores.
// A missing optional field is null, not a different signature from the row.
export function normalizeWorldEventContext(x){
 if(!x||typeof x!=='object'||Array.isArray(x))return null;
 return {eventId:x.eventId,instanceId:x.instanceId,ownerId:x.ownerId,
  characterId:x.characterId,type:x.type,serverTick:x.serverTick,
  tier:x.tier??null,location:x.location??null};
}
const valid=x=>x&&id(x.eventId)&&id(x.instanceId)&&who(x.ownerId)&&
 who(x.characterId)&&types.has(x.type)&&
 Number.isSafeInteger(x.serverTick)&&x.serverTick>=0&&
 (x.tier===null||['normal','elite','boss'].includes(x.tier))&&
 (x.location===null||id(x.location))&&
 (x.type==='enemy_killed'?x.tier!==null&&x.location===null:
  x.type==='location_discovered'?x.location!==null&&x.tier===null:
  x.tier===null&&x.location===null);
const payload=x=>({
 eventId:x.eventId,instanceId:x.instanceId,ownerId:x.ownerId,
 characterId:x.characterId,type:x.type,serverTick:x.serverTick,
 tier:x.tier??null,location:x.location??null,evidenceDigest:x.evidenceDigest
});
export function createGame3DWorldEventJournal({pool,verifyWorldEvent}={}){
 if(!pool?.connect)throw Error('World event journal requires PostgreSQL');
 const append=async input=>{
   const context=normalizeWorldEventContext(input);
   if(!valid(context))throw Error('Invalid world event context');
   if(typeof verifyWorldEvent!=='function')
     throw Error('Trusted world event attester missing');
   const c=await pool.connect();
   try{
    await c.query('BEGIN');
    const proof=await verifyWorldEvent({client:c,context:{
     eventId:context.eventId,instanceId:context.instanceId,
     ownerId:context.ownerId,characterId:context.characterId,
     type:context.type,serverTick:context.serverTick,
     tier:context.tier??null,location:context.location??null}});
    if(proof?.ok!==true||proof.provenance!=='authoritative-world-event'||
       !sha(proof.evidenceDigest)||
       !['eventId','instanceId','ownerId','characterId','type','serverTick']
        .every(k=>proof[k]===context[k])||
       (proof.tier??null)!==(context.tier??null)||
       (proof.location??null)!==(context.location??null))
      throw Error('World engine did not verify event');
    const entry=payload({...context,evidenceDigest:proof.evidenceDigest});
    const signature=sum(entry);
    const r=await c.query(
      'INSERT INTO game3d_world_event_journal '+
      '(event_id,instance_id,owner_id,character_id,event_type,'+
      'server_tick,tier,location,evidence_digest,event_digest) '+
      'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) '+
      'ON CONFLICT(event_id) DO NOTHING RETURNING event_id',
      [entry.eventId,entry.instanceId,entry.ownerId,entry.characterId,
       entry.type,entry.serverTick,entry.tier,entry.location,
       entry.evidenceDigest,signature]);
    if(!r.rowCount){
      const old=await c.query(
        'SELECT event_digest FROM game3d_world_event_journal '+
        'WHERE event_id=$1 FOR SHARE',[entry.eventId]);
      if(old.rowCount!==1||old.rows[0].event_digest!==signature)
        throw Error('Conflicting server event replay');
    }
    await c.query('COMMIT');
    return {eventId:entry.eventId,created:r.rowCount===1,
      eventDigest:signature,awardEligible:false};
   }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
   finally{c.release()}
 };
 return Object.freeze({append,enabled:typeof verifyWorldEvent==='function'});
}
