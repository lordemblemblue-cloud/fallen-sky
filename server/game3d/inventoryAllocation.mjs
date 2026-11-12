import {verifyItemProvenanceChain} from './itemProvenanceReview.mjs';
// Foundation 12.7 — private, authoritative first-slot assignment.
// The trusted game-server must verify item provenance inside this transaction.
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const uuid=x=>typeof x==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function createGame3DInventoryAllocation({pool,verifyIssuedItem,enableStorageOverflow=false}={}){
 if(!pool?.connect||typeof verifyIssuedItem!=='function')
  throw Error('Inventory allocation requires PG and trusted item verifier');
 const allocate=async({ownerId,characterId,itemInstanceId}={})=>{
  if(!valid(ownerId)||!valid(characterId)||!uuid(itemInstanceId))
   throw Error('Invalid inventory allocation request');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query('INSERT INTO game3d_inventory_state(owner_id,character_id) '+
    'VALUES($1,$2) ON CONFLICT DO NOTHING',[ownerId,characterId]);
   // Serialize all slot allocation and rearrangement for this character.
   const state=await c.query(
    'SELECT revision FROM game3d_inventory_state '+
    'WHERE owner_id=$1 AND character_id=$2 FOR UPDATE',[ownerId,characterId]);
   if(state.rowCount!==1)throw Error('Missing inventory state');
   const issued=await c.query(
    'SELECT row_to_json(i) AS issued,row_to_json(e) AS event,'+
    'row_to_json(cs) AS completion,row_to_json(sr) AS simulation '+
    'FROM game3d_item_issuance i '+
    'LEFT JOIN game3d_verified_gameplay_event e '+
    'ON e.event_id::text=i.source_event_id '+
    'LEFT JOIN game3d_server_completion_source cs ON cs.completion_id=e.completion_id '+
    'LEFT JOIN game3d_simulation_completion_receipt sr '+
    'ON sr.completion_id=cs.completion_id '+
    'WHERE i.item_instance_id=$1 AND i.owner_id=$2 AND i.character_id=$3 '+
    'FOR SHARE OF i',
    [itemInstanceId,ownerId,characterId]);
   if(issued.rowCount!==1)throw Error('Item was not issued to character');
   const chain=verifyItemProvenanceChain(issued.rows[0]);
   if(!chain.ok||chain.ownerId!==ownerId||
      chain.characterId!==characterId||chain.itemInstanceId!==itemInstanceId)
    throw Error('Committed item chain inconsistent');
   // This external engine predicate must additionally verify real gameplay.
   if(await verifyIssuedItem({client:c,ownerId,characterId,itemInstanceId,
      provenanceDigest:chain.sourceDigest})!==true)
    throw Error('Item source provenance was not verified');
   const existing=await c.query(
    'SELECT slot_index FROM game3d_inventory_slot '+
    'WHERE item_instance_id=$1',[itemInstanceId]);
   if(existing.rowCount){
    const selected=await c.query(
     'SELECT owner_id,character_id FROM game3d_inventory_slot WHERE item_instance_id=$1',
     [itemInstanceId]);
    if(selected.rows[0].owner_id!==ownerId||
       selected.rows[0].character_id!==characterId)
     throw Error('Inventory item already assigned elsewhere');
    await c.query('COMMIT');
    return {created:false,slot:Number(existing.rows[0].slot_index),
     revision:String(state.rows[0].revision),tradingAuthorized:false};
   }
   // Optional private-beta storage path. This check is behind an explicit
   // opt-in: the public Game 3D runtime has not run migration 056.
   if(enableStorageOverflow){
    const held=await c.query(
     'SELECT slot_index FROM game3d_storage_slot '+
     'WHERE owner_id=$1 AND character_id=$2 AND item_instance_id=$3',
     [ownerId,characterId,itemInstanceId]);
    if(held.rowCount){
     await c.query('COMMIT');
     return {created:false,location:'storage',slot:Number(held.rows[0].slot_index),
      revision:String(state.rows[0].revision),tradingAuthorized:false};
    }
   }
   const vacancy=await c.query(
    'SELECT s.slot FROM generate_series(0,199) AS s(slot) '+
    'WHERE NOT EXISTS(SELECT 1 FROM game3d_inventory_slot i '+
    'WHERE i.owner_id=$1 AND i.character_id=$2 AND i.slot_index=s.slot) '+
    'ORDER BY s.slot LIMIT 1',[ownerId,characterId]);
   if(vacancy.rowCount!==1){
    if(!enableStorageOverflow)throw Error('Inventory is full');
    // The inventory-state FOR UPDATE lock serializes both destinations so an
    // issued UUID cannot be assigned to both inventory and storage here.
    await c.query('INSERT INTO game3d_storage_state(owner_id,character_id) '+
     'VALUES($1,$2) ON CONFLICT DO NOTHING',[ownerId,characterId]);
    const vaultState=await c.query(
     'SELECT revision FROM game3d_storage_state '+
     'WHERE owner_id=$1 AND character_id=$2 FOR UPDATE',[ownerId,characterId]);
    if(vaultState.rowCount!==1)throw Error('Missing storage state');
    const free=await c.query(
     'SELECT s.slot FROM generate_series(0,399) AS s(slot) '+
     'WHERE NOT EXISTS (SELECT 1 FROM game3d_storage_slot t '+
     'WHERE t.owner_id=$1 AND t.character_id=$2 AND t.slot_index=s.slot) '+
     'ORDER BY s.slot LIMIT 1',[ownerId,characterId]);
    if(free.rowCount!==1)throw Error('Inventory and storage are full');
    const slot=Number(free.rows[0].slot);
    await c.query('INSERT INTO game3d_storage_slot '+
     '(owner_id,character_id,slot_index,item_instance_id) '+
     'VALUES($1,$2,$3,$4)',[ownerId,characterId,slot,itemInstanceId]);
    const bumped=await c.query('UPDATE game3d_storage_state '+
     'SET revision=revision+1 WHERE owner_id=$1 AND character_id=$2 '+
     'RETURNING revision',[ownerId,characterId]);
    await c.query('COMMIT');
    return {created:true,location:'storage',slot,
     revision:String(bumped.rows[0].revision),tradingAuthorized:false};
   }
   const slot=Number(vacancy.rows[0].slot);
   await c.query('INSERT INTO game3d_inventory_slot '+
    '(owner_id,character_id,slot_index,item_instance_id) '+
    'VALUES($1,$2,$3,$4)',[ownerId,characterId,slot,itemInstanceId]);
   const bump=await c.query('UPDATE game3d_inventory_state '+
    'SET revision=revision+1 WHERE owner_id=$1 AND character_id=$2 '+
    'RETURNING revision',[ownerId,characterId]);
   await c.query('COMMIT');
   return {created:true,slot,revision:String(bump.rows[0].revision),
    tradingAuthorized:false};
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({allocate});
}
