// Foundation 13.9 — migration 019 inventory schema introspection.
// Even a complete schema cannot certify gameplay, economic or beta readiness.
import {inspectCombat9PrivateBetaSchema} from './combat9SchemaAudit.mjs';
const names=['game3d_inventory_state','game3d_inventory_slot',
 'game3d_inventory_operation'];
export function inventoryConstraintGaps(rows){
 const defs=Array.isArray(rows)?rows:[];
 const has=(table,kind,fragments)=>defs.some(row=>
  row.table_name===table&&row.kind===kind&&
  fragments.every(fragment=>String(row.definition||'').includes(fragment)));
 const missing=[];
 if(!has('game3d_inventory_slot','f',['(owner_id, character_id)','game3d_inventory_state']))
  missing.push('inventory_slot_state_owner_fk');
 if(!has('game3d_inventory_slot','f',
  ['(item_instance_id, owner_id, character_id)','game3d_item_issuance']))
  missing.push('inventory_slot_issuance_owner_fk');
 if(!has('game3d_inventory_slot','u',['(item_instance_id)']))
  missing.push('inventory_slot_item_unique');
 if(!has('game3d_inventory_slot','c',['slot_index','199']))
  missing.push('inventory_slot_index_bounds');
 if(!has('game3d_inventory_state','c',['capacity','200']))
  missing.push('inventory_state_capacity_200');
 return missing;
}
export async function inspectGame3DInventorySchema({pool}={}){
 if(!pool?.query)throw Error('Private inventory schema check requires PG');
 const baseline=await inspectCombat9PrivateBetaSchema({pool});
 const missing=[...(baseline.missing||[])];
 for(const name of names){
  const r=await pool.query('SELECT to_regclass($1) AS relation',
   ['public.'+name]);
  if(!r.rows[0]?.relation)missing.push(name);
 }
 const trigger=await pool.query(
  "SELECT EXISTS(SELECT 1 FROM pg_trigger t "+
  "JOIN pg_class c ON c.oid=t.tgrelid "+
  "JOIN pg_namespace n ON n.oid=c.relnamespace "+
  "WHERE n.nspname='public' AND c.relname=$1 "+
  "AND t.tgname=$2 AND NOT t.tgisinternal "+
  "AND t.tgenabled<>'D') AS installed",
  ['game3d_inventory_operation','game3d_inventory_operation_immutable']);
 if(trigger.rows[0]?.installed!==true)
  missing.push('game3d_inventory_operation_immutable');
 const constraints=await pool.query(
  'SELECT c.relname AS table_name,con.contype AS kind,'+
  'pg_get_constraintdef(con.oid) AS definition '+
  'FROM pg_constraint con '+
  'JOIN pg_class c ON c.oid=con.conrelid '+
  'JOIN pg_namespace n ON n.oid=c.relnamespace '+
  "WHERE n.nspname='public' AND c.relname=ANY($1::text[])",
  [['game3d_inventory_slot','game3d_inventory_state']]);
 missing.push(...inventoryConstraintGaps(constraints.rows));
 return {schemaIntact:missing.length===0,missing,
  manualMigration:'019_foundation126_inventory_slots.sql',
  verifiedGameItems:false,
  trustedLiveInventoryActivated:false,
  actualTradeAndEscrowAvailable:false,
  privateBetaTestsPassed:false,productionReady:false};
}
