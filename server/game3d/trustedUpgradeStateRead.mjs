// Inventory Foundation 15.5 — private, transaction-bound Blacksmith state reader.
// This is not an item grant, forge writer, or browser-accessible service.
import {parsePrivateInventoryRevision} from './inventorySlotRead.mjs';
import {inspectAscendStage} from './ascendStageRules.mjs';
import {inspectEnchantPath} from './enchantRules.mjs';
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const uuid=x=>typeof x==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function projectGame3DUpgradeState({row,ownerId,characterId,itemInstanceId}={}){
 if(!row||!who(ownerId)||!who(characterId)||!uuid(itemInstanceId)||
    row.owner_id!==ownerId||row.character_id!==characterId||
    String(row.item_instance_id)!==itemInstanceId)
  return null;
 const revision=parsePrivateInventoryRevision(row.revision);
 const ascendStage=Number(row.ascend_stage),enchantLevel=Number(row.enchant_level),
  overEnchantLevel=Number(row.over_enchant_level);
 if(revision===null||!inspectAscendStage({stage:ascendStage}).ok||
    !inspectEnchantPath({enchantLevel,overEnchantLevel}).ok)
  return null;
 return Object.freeze({source:'trusted-private-upgrade-state',
  readTransactionBound:true,ownerId,characterId,itemInstanceId,
  revision:String(revision),ascendStage,enchantLevel,overEnchantLevel,
  mutationAuthorized:false,materialsConsumed:false});
}
export function createGame3DTrustedUpgradeStateReader({pool}={}){
 if(!pool?.connect||!pool?.query)
  throw Error('Trusted Blacksmith reader needs a private PostgreSQL pool');
 const read=async({client,ownerId,characterId,itemInstanceId}={})=>{
  if(!client?.query||!who(ownerId)||!who(characterId)||!uuid(itemInstanceId))
   return null;
  // The caller owns the transaction; do NOT open a new connection.
  const r=await client.query(
   'SELECT item_instance_id,owner_id,character_id,revision,'+
   'ascend_stage,enchant_level,over_enchant_level '+
   'FROM game3d_item_upgrade_state '+
   'WHERE item_instance_id=$1 AND owner_id=$2 AND character_id=$3',
   [itemInstanceId,ownerId,characterId]);
  return r.rowCount===1?projectGame3DUpgradeState({
   row:r.rows[0],ownerId,characterId,itemInstanceId}):null;
 };
 return Object.freeze({read});
}
