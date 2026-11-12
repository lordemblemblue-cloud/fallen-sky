// Inventory Foundation 15.7 — read-only validation of migration 020.
import {inspectGame3DInventorySchema} from './inventorySchemaAudit.mjs';
export function upgradeConstraintGaps(rows){
 const defs=Array.isArray(rows)?rows:[];
 const has=(table,kind,terms)=>defs.some(x=>
  x.table_name===table&&x.kind===kind&&
  terms.every(term=>String(x.definition||'').includes(term)));
 const gaps=[];
 if(!has('game3d_item_upgrade_state','f',
  ['item_instance_id','owner_id','character_id','game3d_item_issuance']))
  gaps.push('upgrade_state_source_item_owner_fk');
 for(const field of ['ascend_stage','enchant_level','over_enchant_level']){
  if(!has('game3d_item_upgrade_state','c',[field]))
   gaps.push('upgrade_state_'+field+'_bounds');
 }
 if(!has('game3d_item_upgrade_state','u',
  ['item_instance_id','owner_id','character_id']))
  gaps.push('upgrade_state_identity_unique');
 if(!has('game3d_item_upgrade_operation','f',
  ['(item_instance_id, owner_id, character_id)','game3d_item_upgrade_state']))
  gaps.push('upgrade_operation_state_owner_fk');
 return gaps;
}
export async function inspectGame3DUpgradeSchema({pool}={}){
 if(!pool?.query)throw Error('Upgrade schema inspection needs private PostgreSQL');
 const earlier=await inspectGame3DInventorySchema({pool});
 const missing=[...(earlier.missing||[])];
 for(const name of ['game3d_item_upgrade_state','game3d_item_upgrade_operation']){
  const r=await pool.query('SELECT to_regclass($1) AS relation',['public.'+name]);
  if(!r.rows[0]?.relation)missing.push(name);
 }
 const t=await pool.query(
  "SELECT EXISTS(SELECT 1 FROM pg_trigger t "+
  "JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace "+
  "WHERE n.nspname='public' AND c.relname=$1 AND t.tgname=$2 "+
  "AND NOT t.tgisinternal AND t.tgenabled<>'D') AS active",
  ['game3d_item_upgrade_operation','game3d_item_upgrade_operation_immutable']);
 if(t.rows[0]?.active!==true)
  missing.push('game3d_item_upgrade_operation_immutable');
 const q=await pool.query(
  'SELECT c.relname AS table_name,con.contype AS kind,'+
  'pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con '+
  'JOIN pg_class c ON c.oid=con.conrelid '+
  'JOIN pg_namespace n ON n.oid=c.relnamespace '+
  "WHERE n.nspname='public' AND c.relname=ANY($1::text[])",
  [['game3d_item_upgrade_state','game3d_item_upgrade_operation']]);
 missing.push(...upgradeConstraintGaps(q.rows));
 return {schemaIntact:missing.length===0,missing,
  requiredUpgradeMigration:'020_foundation154_item_upgrades.sql',
  sourceAuthenticityCertified:false,upgradeWritesEnabled:false,
  serverMaterialsLedgerConnected:false,productionReady:false};
}
