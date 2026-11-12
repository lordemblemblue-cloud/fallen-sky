// Combat 6.4 — read-only server encounter elimination review.
// Never infers a kill from a browser animation or client hit report.
import {verifyWorldEventOrder} from './worldEventOrder.mjs';
import {verifyStoredWorldEvent} from './worldEventProofRead.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
export function inspectEncounterEliminations({ownerId,characterId,
 instanceId,rows,requiredTier=null}={}){
 if(!who(ownerId)||!who(characterId)||!id(instanceId)||
    ![null,'normal','elite','boss'].includes(requiredTier))
  return {ok:false,code:'invalid_encounter_scope'};
 const order=verifyWorldEventOrder(rows);
 if(!order.ok)return {ok:false,code:order.code};
 const kills=[];
 for(const row of rows){
  const event={eventId:row.event_id,instanceId:row.instance_id,
   ownerId:row.owner_id,characterId:row.character_id,
   type:row.event_type,serverTick:Number(row.server_tick),
   tier:row.tier??null,location:row.location??null,
   evidenceDigest:row.evidence_digest};
  if(!verifyStoredWorldEvent({row,ownerId,characterId,instanceId}).ok)
    return {ok:false,code:'mismatched_encounter_journal'};
  if(event.type==='enemy_killed'&&
     (!requiredTier||event.tier===requiredTier))
    kills.push({eventId:event.eventId,serverTick:event.serverTick,
     tier:event.tier});
 }
 return {ok:true,killCount:kills.length,kills,
  gameSimulationVerified:false,itemDropAuthorized:false,
  rewardsEligible:false,rewardsIssued:false};
}
export function createGame3DEncounterEvidenceRead({pool}={}){
 if(!pool?.connect)throw Error('Encounter review needs private PG');
 const inspect=async({ownerId,characterId,instanceId,tier=null}={})=>{
  if(!who(ownerId)||!who(characterId)||!id(instanceId))
    throw Error('Invalid encounter owner scope');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query(
    'SELECT * FROM game3d_world_event_journal '+
    'WHERE owner_id=$1 AND character_id=$2 AND instance_id=$3 '+
    'ORDER BY server_tick,event_id LIMIT 251',
    [ownerId,characterId,instanceId]);
   const result=inspectEncounterEliminations({ownerId,characterId,
    instanceId,rows:r.rows,requiredTier:tier});
   await c.query('COMMIT');
   return result;
  }catch(error){try{await c.query('ROLLBACK')}catch{}throw error}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
