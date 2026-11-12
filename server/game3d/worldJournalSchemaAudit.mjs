// Combat 6.8: INTERNAL read-only private-beta schema inventory.
// Schema presence does not certify honest players, real world events, or rewards.
import {inspectGame3DPrivateBetaSchema} from './combatPreBetaGate.mjs';
export async function inspectGame3DWorldJournalSchema({pool}={}) {
  if(!pool?.query)throw Error('Private beta schema inspection requires PG');
  const baseline=await inspectGame3DPrivateBetaSchema({pool});
  const relation=await pool.query('SELECT to_regclass($1) AS relation',
    ['public.game3d_world_event_journal']);
  const trigger=await pool.query(
    "SELECT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid "+
    "JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='public' AND c.relname=$1 AND t.tgname=$2 "+
    "AND NOT t.tgisinternal AND t.tgenabled <> 'D') AS installed",
    ['game3d_world_event_journal','game3d_world_event_journal_immutable']);
  const columns=await pool.query(
    'SELECT column_name FROM information_schema.columns '+
    'WHERE table_schema=$1 AND table_name=$2',
    ['public','game3d_world_event_journal']);
  const present=new Set(columns.rows.map(x=>x.column_name));
  const required=['event_id','instance_id','owner_id','character_id',
    'event_type','server_tick','evidence_digest','event_digest'];
  const missing=[...(baseline.missing||[]),
    ...(!relation.rows[0]?.relation?['game3d_world_event_journal']:[]),
    ...(trigger.rows[0]?.installed!==true?
      ['game3d_world_event_journal_immutable']:[]),
    ...required.filter(x=>!present.has(x)).map(x=>'world_event.'+x)];
  return {schemaIntact:missing.length===0,missing,
    worldJournalPresent:!!relation.rows[0]?.relation,
    worldJournalTriggerPresent:trigger.rows[0]?.installed===true,
    gameplayAttestationVerified:false,testsExecuted:false,
    rewardIssuerApproved:false,productionReady:false};
}
