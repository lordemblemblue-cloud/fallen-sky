// Combat Foundation 5.8 — fail-closed guard for known *new* competitive
// switches and read-only schema diagnostics. This is NOT a release approval.
// Existing external services must separately enforce their own reward gates.
const OFF=new Set(['','false','0','off','disabled']);
const HIGH_RISK=Object.freeze([
 'GAME3D_COMBAT_PUBLIC_RANKED_ENABLED',
 'GAME3D_COMBAT_PUBLIC_REWARDS_ENABLED',
 'GAME3D_COMBAT_EQUIPMENT_BONUSES_ENABLED',
 'GAME3D_COMBAT_AUTOMATIC_ITEM_GRANTS_ENABLED',
 'GAME3D_COMBAT_CHARACTER_XP_PAYOUTS_ENABLED',
 // 8.8: hold the AXE Trading Post behind explicit server-side beta review.
 'GAME3D_MARKET_PUBLIC_TRADING_ENABLED',
 'GAME3D_MARKET_ESCROW_ENABLED',
 'GAME3D_MARKET_REAL_CURRENCY_ENABLED',
 'GAME3D_MARKET_AUTOMATED_LISTINGS_ENABLED',
 'GAME3D_COMBAT_RUNTIME10_PUBLIC_ENABLED',
 'GAME3D_COMBAT_RUNTIME10_REWARDS_ENABLED',
]);
export function assertGame3DPreBetaSafety(env={}){
  const enabled=HIGH_RISK.filter(name=>
    !OFF.has(String(env[name]??'').trim().toLowerCase()));
  if(enabled.length)
    throw Error('Game 3D pre-beta competitive features blocked: '+
      enabled.join(', '));
  return {safeToStartIsolatedWorker:true,
    publicCompetitiveApproved:false,competitiveRewardsEnabled:false};
}
const TABLES=Object.freeze([
 'game3d_trusted_character',
 'game3d_trusted_grant_event',
 'game3d_item_issuance',
 'game3d_character_equipment_revision',
 'game3d_character_equipment',
 'game3d_equipment_operation',
 'game3d_verified_gameplay_event',
 'game3d_server_completion_source',
 'game3d_simulation_completion_receipt',
]);
const TRIGGERS=Object.freeze([
 'game3d_item_issuance_immutable',
 'game3d_equipment_operation_immutable',
 'game3d_verified_gameplay_event_immutable',
 'game3d_server_completion_source_immutable',
 'game3d_simulation_receipt_immutable',
]);
// Passive, read-only diagnostic for a disposable beta database. Even complete
// schema evidence is NOT proof of real earned stats, rewards or tests.
export async function inspectGame3DPrivateBetaSchema({pool}={}){
 if(!pool?.query)throw Error('Beta schema audit requires private PG pool');
 const tables=[];
 for(const name of TABLES){
   const r=await pool.query('SELECT to_regclass($1) AS relation',
     ['public.'+name]);
   tables.push({table:name,exists:!!r.rows[0]?.relation});
 }
 const triggers=[];
 for(const name of TRIGGERS){
   const r=await pool.query(
     'SELECT EXISTS (SELECT 1 FROM pg_trigger t '+
     'JOIN pg_class c ON c.oid=t.tgrelid '+
     'JOIN pg_namespace n ON n.oid=c.relnamespace '+
     "WHERE n.nspname='public' AND t.tgname=$1 AND NOT t.tgisinternal "+
     'AND t.tgenabled<>$2) AS installed',
     [name,'D']);
   triggers.push({trigger:name,installed:r.rows[0]?.installed===true});
 }
 const missing=[...tables.filter(t=>!t.exists).map(t=>t.table),
   ...triggers.filter(t=>!t.installed).map(t=>t.trigger)];
 return {
   schemaIntact:missing.length===0,
   missing,checkedTables:tables.length,checkedTriggers:triggers.length,
   // No local check can certify authenticity until an actual server
   // simulator, authenticated player adapter and beta test pass are present.
   gameplayAttestationVerified:false,
   authenticatedWorldCompletionEnabled:false,
   itemAwardAuthorizationEnabled:false,
   equipmentStatBonusesEnabled:false,
   productionReady:false,rewardsEligible:false,
 };
}
