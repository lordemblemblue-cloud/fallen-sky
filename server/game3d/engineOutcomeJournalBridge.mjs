// Combat 9.2 — use ONLY the committed engine outcome table as the trusted
// server-world journal verification source. No client-provided verifier flags.
import {createGame3DWorldEventJournal} from './worldEventJournal.mjs';
import {engineOutcomeBody,engineOutcomeDigest} from './engineOutcomeStore.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
export function createEngineOutcomeJournalBridge({pool}={}){
 if(!pool?.connect||!pool?.query)throw Error('9.2 requires private PostgreSQL');
 const verifyWorldEvent=async({client,context}={})=>{
  if(!client?.query||!id(context?.eventId))throw Error('Invalid outcome proof request');
  const r=await client.query(
   'SELECT * FROM game3d_engine_outcome WHERE event_id=$1 FOR SHARE',
   [context.eventId]);
  if(r.rowCount!==1)throw Error('No committed engine outcome');
  const row=r.rows[0],tick=Number(row.server_tick);
  if(!Number.isSafeInteger(tick)||tick<0)throw Error('Invalid engine tick');
  const original=engineOutcomeBody({
   eventId:row.event_id,instanceId:row.instance_id,ownerId:row.owner_id,
   characterId:row.character_id,type:row.event_type,serverTick:tick,
   tier:row.tier,location:row.location,
  },row.evidence_digest);
  if(row.outcome_digest!==engineOutcomeDigest(original))
   throw Error('Corrupt committed engine outcome');
  if(!['eventId','instanceId','ownerId','characterId','type',
       'serverTick','tier','location'].every(k=>
       (original[k]??null)===(context[k]??null)))
   throw Error('Engine outcome cannot authorize this world event');
  return {...original,ok:true,provenance:'authoritative-world-event'};
 };
 const worldJournal=createGame3DWorldEventJournal({pool,verifyWorldEvent});
 const appendVerified=async context=>worldJournal.append(context);
 return Object.freeze({verifyWorldEvent,appendVerified});
}
