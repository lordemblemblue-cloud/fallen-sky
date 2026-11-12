// Combat 9.9 — read-only SQL migration inventory for engine and progression.
// A database table's existence cannot certify authenticated gameplay.
import {inspectGame3DLateBetaSchema} from './lateBetaSchemaAudit.mjs';
export const COMBAT9_MANUAL_MIGRATIONS=Object.freeze([
 '017_combat91_engine_outcomes.sql',
 '018_combat95_xp_credit.sql',
]);
const tables=['game3d_engine_outcome','game3d_authoritative_xp_credit'];
const triggers=[
 ['game3d_engine_outcome','game3d_engine_outcome_immutable'],
 ['game3d_authoritative_xp_credit','game3d_authoritative_xp_credit_immutable'],
];
export async function inspectCombat9PrivateBetaSchema({pool}={}){
 if(!pool?.query)throw Error('9.9 requires private PostgreSQL');
 const earlier=await inspectGame3DLateBetaSchema({pool});
 const missing=[...(earlier.missing||[])];
 for(const name of tables){
  const r=await pool.query('SELECT to_regclass($1) AS relation',
   ['public.'+name]);
  if(!r.rows[0]?.relation)missing.push(name);
 }
 for(const [table,trigger] of triggers){
  const r=await pool.query(
   "SELECT EXISTS(SELECT 1 FROM pg_trigger t "+
   "JOIN pg_class c ON c.oid=t.tgrelid "+
   "JOIN pg_namespace n ON n.oid=c.relnamespace "+
   "WHERE n.nspname='public' AND c.relname=$1 "+
   "AND t.tgname=$2 AND NOT t.tgisinternal "+
   "AND t.tgenabled <> 'D') AS installed",
   [table,trigger]);
  if(r.rows[0]?.installed!==true)missing.push(trigger);
 }
 const xp=await pool.query(
  "SELECT EXISTS(SELECT 1 FROM pg_constraint k "+
  "JOIN pg_class c ON c.oid=k.conrelid "+
  "WHERE c.relname='game3d_authoritative_xp_credit' "+
  "AND k.contype='f') AS installed");
 if(xp.rows[0]?.installed!==true)
  missing.push('game3d_authoritative_xp_credit_source_fk');
 return {schemaComplete:missing.length===0,missing,
  manualMigrations:[...COMBAT9_MANUAL_MIGRATIONS],
  simulationEngineConnected:false,
  trustedXPRulesDeployed:false,
  authoritativeInventoryActivated:false,
  marketplaceTransactionsActivated:false,
  testsExecuted:false,productionReady:false,
  rankedRewardsEnabled:false};
}
