// Combat 9.3 — internal game-server pipeline, not an HTTP or WS API.
// Each write is replay-idempotent. The engine outcome is committed first;
// failure between commits leaves a recoverable journal gap, NOT a paid reward.
import {createGame3DEngineOutcomeStore} from './engineOutcomeStore.mjs';
import {createEngineOutcomeJournalBridge} from './engineOutcomeJournalBridge.mjs';
export function createGame3DEngineEventPipeline({pool,proveEngineEvent}={}){
 if(!pool?.connect||!pool?.query)
  throw Error('Engine event pipeline requires private PostgreSQL');
 const outcomes=createGame3DEngineOutcomeStore({pool,proveEngineEvent});
 const world=createEngineOutcomeJournalBridge({pool});
 const commitAndJournal=async event=>{
  if(!outcomes.enabled)throw Error('Server simulation attester is required');
  const first=await outcomes.commit(event);
  const second=await world.appendVerified(event);
  if(second.eventId!==first.eventId)
   throw Error('Committed event / world journal identity diverged');
  return {eventId:first.eventId,outcomeDigest:first.outcomeDigest,
   journalDigest:second.eventDigest,
   engineCommitted:true,worldJournalCommitted:true,
   xpCredited:false,itemsGranted:false,rewardsIssued:false};
 };
 const resumeJournal=async context=>{
  // Recovery from engine-committed/journal-missing source event.
  // An arbitrary client ID alone is never sufficient: 9.2 revalidates
  // the full context against the committed source on every retry.
  const report=await world.appendVerified(context);
  return {eventId:report.eventId,journalDigest:report.eventDigest,
   resumed:true,xpCredited:false,itemsGranted:false};
 };
 return Object.freeze({enabled:outcomes.enabled,commitAndJournal,resumeJournal});
}
