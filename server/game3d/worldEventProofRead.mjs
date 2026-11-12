// Combat Foundation 7.0 — immutable server event proof read contract.
// Hash consistency is not proof the world engine truly simulated the event.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
const sha=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const digest=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
export function verifyStoredWorldEvent({row,ownerId,characterId,instanceId}={}){
 if(!row||!who(ownerId)||!who(characterId)||!id(instanceId)||
    row.owner_id!==ownerId||row.character_id!==characterId||
    row.instance_id!==instanceId||!id(row.event_id)||
    !sha(row.evidence_digest)||!sha(row.event_digest))
  return {ok:false,code:'invalid_world_event_identity',trusted:false};
 const raw=row.server_tick;
 // PostgreSQL BIGINT is normally a string; reject ambiguous or rounded
 // values before digest verification, matching worldEventOrder.mjs.
 const tick=typeof raw==='string'
   ?(/^(0|[1-9][0-9]*)$/.test(raw)?Number(raw):NaN)
   :(typeof raw==='number'?raw:NaN);
 const packet={
  eventId:row.event_id,instanceId:row.instance_id,
  ownerId:row.owner_id,characterId:row.character_id,
  type:row.event_type,serverTick:tick,
  tier:row.tier??null,location:row.location??null,
  evidenceDigest:row.evidence_digest,
 };
 const kindValid=packet.type==='enemy_killed'
   ?['normal','elite','boss'].includes(packet.tier)&&packet.location===null
   :packet.type==='location_discovered'
     ?id(packet.location)&&packet.tier===null
     :packet.type==='craft_completed'&&packet.tier===null&&packet.location===null;
 if(!Number.isSafeInteger(tick)||tick<0||!kindValid||
    digest(packet)!==row.event_digest)
  return {ok:false,code:'invalid_world_event_digest',trusted:false};
 return {ok:true,eventId:packet.eventId,worldInstance:instanceId,
  eventDigest:row.event_digest,ownerId,characterId,serverTick:tick,
  // A verified DB digest proves integrity only.
  consistent:true,simulationAuthenticityVerified:false,
  rewardEligibility:false,itemsIssued:false};
}
export function createWorldEventProofReader({pool}={}){
 if(!pool?.query)throw Error('World proof reader requires private PG');
 const inspect=async({eventId,ownerId,characterId,instanceId}={})=>{
  if(!id(eventId)||!who(ownerId)||!who(characterId)||!id(instanceId))
   throw Error('Invalid server world proof request');
  const r=await pool.query(
   'SELECT * FROM game3d_world_event_journal '+
   'WHERE event_id=$1 AND owner_id=$2 AND character_id=$3 AND instance_id=$4',
   [eventId,ownerId,characterId,instanceId]);
  if(r.rowCount!==1)return {ok:false,code:'event_not_found',trusted:false};
  return verifyStoredWorldEvent({row:r.rows[0],ownerId,characterId,instanceId});
 };
 return Object.freeze({inspect});
}
