// Combat Foundation 6.1 — read-only quest objective progress from
// server-owned world journal events; no browser state, reward or XP writes.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {evaluateServerQuestObjectives} from './trustedQuestRules.mjs';
import {verifyWorldEventOrder} from './worldEventOrder.mjs';
import {verifyStoredWorldEvent} from './worldEventProofRead.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const sum=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
const asEvent=r=>({
 eventId:r.event_id,instanceId:r.instance_id,ownerId:r.owner_id,
 characterId:r.character_id,type:r.event_type,serverTick:Number(r.server_tick),
 tier:r.tier??null,location:r.location??null,evidenceDigest:r.evidence_digest,
});
export function classifyServerQuestEvents({ownerId,characterId,instanceId,questId,
 rows,priorCompleted=[]}={}){
 if(!who(ownerId)||!who(characterId)||!id(instanceId)||
    !Array.isArray(rows)||rows.length>250)
   return {ok:false,code:'quest_read_identity_or_window_invalid'};
 const ordered=verifyWorldEventOrder(rows);
 if(!ordered.ok)return {ok:false,code:ordered.code};
 const events=[],seen=new Set();
 for(const row of rows){
  const e=asEvent(row);
  if(!verifyStoredWorldEvent({row,ownerId,characterId,instanceId}).ok||
     seen.has(e.eventId))
   return {ok:false,code:'server_journal_identity_or_digest_mismatch'};
  seen.add(e.eventId);
  // Unrelated server event types are valid journal evidence but do not
  // advance quest objectives; a craft event must not break kill quests.
  if(['enemy_killed','location_discovered'].includes(e.type))
   events.push({eventId:e.eventId,type:e.type,tier:e.tier,
    location:e.location,serverTick:e.serverTick});
 }
 const evaluation=evaluateServerQuestObjectives({questId,events,priorCompleted});
 return {...evaluation,ownerId,characterId,instanceId,
  journalDigest:sum(rows.map(r=>r.event_digest)),
  verifiedReadFromJournal:evaluation.ok,
  // Server writer's world simulation attester has yet to be installed.
  serverEventAuthenticityVerified:false,awardEligible:false,
  xpGranted:false,itemsGranted:false};
}
export function createGame3DQuestJournalRead({pool}={}){
 if(!pool?.connect)throw Error('Quest journal read requires PostgreSQL');
 const inspect=async({ownerId,characterId,instanceId,questId,
   priorCompleted=[]}={})=>{
  if(!who(ownerId)||!who(characterId)||!id(instanceId)||!id(questId))
   throw Error('Invalid server quest journal scope');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query('SELECT * FROM game3d_world_event_journal '+
     'WHERE owner_id=$1 AND character_id=$2 AND instance_id=$3 '+
     'ORDER BY server_tick,event_id LIMIT 251',
     [ownerId,characterId,instanceId]);
   // Combat 7.4: this public-facing adapter's priorCompleted argument is
   // not backed by a trusted completed-quest ledger. NEVER let the caller
   // bypass prerequisite quests merely by supplying an ID list. Until a
   // server-owned completion ledger is installed, gated quests fail closed.
   const value=classifyServerQuestEvents({
     ownerId,characterId,instanceId,questId,priorCompleted:[],rows:r.rows});
   await c.query('COMMIT');
   return value;
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
