// Combat Foundation 8.9 — private beta migration 014–016 inventory.
// Checks expected objects, constraints and append-only triggers, not earned
// gameplay or production safety. No SQL executes except SELECT diagnostics.
import {inspectGame3DWorldJournalSchema} from './worldJournalSchemaAudit.mjs';
export const COMBAT_LATE_MIGRATIONS=Object.freeze([
 '014_combat80_quest_completion_candidates.sql',
 '015_combat84_trusted_character_keys.sql',
 '016_combat86_market_preview_records.sql',
]);
const TABLES=Object.freeze([
 'game3d_quest_completion_evidence',
 'game3d_market_listing_candidate',
]);
const TRIGGERS=Object.freeze([
 ['game3d_quest_completion_evidence','game3d_quest_completion_evidence_immutable'],
 ['game3d_market_listing_candidate','game3d_market_listing_candidate_immutable'],
]);
const CONSTRAINTS=Object.freeze([
 'game3d_trusted_character_owner_key',
 'game3d_trusted_character_character_key',
]);
export async function inspectGame3DLateBetaSchema({pool}={}){
 if(!pool?.query)throw Error('8.9 requires private PG');
 const earlier=await inspectGame3DWorldJournalSchema({pool});
 const missing=[...(earlier.missing||[])];
 for(const table of TABLES){
  const r=await pool.query('SELECT to_regclass($1) AS relation',['public.'+table]);
  if(!r.rows[0]?.relation)missing.push(table);
 }
 for(const [table,trigger] of TRIGGERS){
  const r=await pool.query(
   "SELECT EXISTS(SELECT 1 FROM pg_trigger t "+
   "JOIN pg_class c ON c.oid=t.tgrelid "+
   "JOIN pg_namespace n ON n.oid=c.relnamespace "+
   "WHERE n.nspname='public' AND c.relname=$1 AND "+
   "t.tgname=$2 AND NOT t.tgisinternal AND t.tgenabled<>'D') AS installed",
   [table,trigger]);
  if(r.rows[0]?.installed!==true)missing.push(trigger);
 }
 for(const constraint of CONSTRAINTS){
  const r=await pool.query(
   "SELECT EXISTS(SELECT 1 FROM pg_constraint k "+
   "JOIN pg_class c ON c.oid=k.conrelid "+
   "JOIN pg_namespace n ON n.oid=c.relnamespace "+
   "WHERE n.nspname='public' AND "+
   "c.relname='game3d_trusted_character' AND k.conname=$1 "+
   "AND k.convalidated=true) AS installed",[constraint]);
  if(r.rows[0]?.installed!==true)missing.push(constraint);
 }
 return {ok:missing.length===0,missing,
  expectedManualMigrations:[...COMBAT_LATE_MIGRATIONS],
  privateBetaSchemaReviewed:missing.length===0,
  worldSimulationAttestationProven:false,
  authenticatedMarketTradesEnabled:false,
  trustedGearBonusesEnabled:false,
  releaseApproved:false,rewardsIssued:false};
}
