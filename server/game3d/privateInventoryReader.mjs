// Inventory System 14.3 — private allocated-slot inventory index.
// Issuance alone is not inventory custody or proof of earned rewards.
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const uuid=x=>typeof x==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function validatePrivateInventoryPage({characterId,pageSize,afterItemId}={}){
 if(!valid(characterId)||!Number.isSafeInteger(pageSize)||
    pageSize<1||pageSize>100||(afterItemId!==null&&!uuid(afterItemId)))
  return {ok:false,code:'invalid_inventory_scope'};
 return {ok:true,pageSize,afterItemId};
}
export function createPrivateInventoryReader({pool,resolveAuthenticatedSubject}={}){
 if(!pool?.connect||!pool?.query||typeof resolveAuthenticatedSubject!=='function')
  throw Error('Private inventory requires PG and trusted server authentication');
 const guard=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const list=async({serverRequestContext,characterId,pageSize=25,afterItemId=null}={})=>{
  const page=validatePrivateInventoryPage({characterId,pageSize,afterItemId});
  if(!page.ok)return {ok:false,code:page.code,items:[]};
  const auth=await guard.authorizeRead({serverRequestContext,characterId});
  if(!auth.ok)return {ok:false,code:'unauthorized_inventory',items:[]};
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query(
    'SELECT i.item_instance_id,i.definition_id,i.source_kind,'+
    's.slot_index,eq.equipment_slot,l.listing_id '+
    'FROM game3d_inventory_slot s '+
    'JOIN game3d_item_issuance i ON i.item_instance_id=s.item_instance_id '+
    'AND i.owner_id=s.owner_id AND i.character_id=s.character_id '+
    'LEFT JOIN game3d_character_equipment eq ON eq.item_instance_id=i.item_instance_id '+
    'AND eq.owner_id=s.owner_id AND eq.character_id=s.character_id '+
    'LEFT JOIN game3d_market_listing_candidate l ON l.item_instance_id=i.item_instance_id '+
    'AND l.owner_id=s.owner_id AND l.character_id=s.character_id '+
    'WHERE s.owner_id=$1 AND s.character_id=$2 '+
    'AND ($3::uuid IS NULL OR s.item_instance_id>$3::uuid) '+
    'ORDER BY s.item_instance_id LIMIT $4',
    [auth.accountId,characterId,afterItemId,pageSize+1]);
   await c.query('COMMIT');
   const items=r.rows.slice(0,pageSize).map(row=>({
    itemInstanceId:String(row.item_instance_id),
    definitionId:row.definition_id,sourceKind:row.source_kind,
    inventorySlot:Number(row.slot_index),
    equipmentSlot:row.equipment_slot??null,
    reservedForMarket:row.listing_id!=null,
    transferable:false,tradeEligible:false,statBonusesEnabled:false,
   }));
   return {ok:true,characterId,items,hasMore:r.rows.length>pageSize,
    nextCursor:r.rows.length>pageSize?items.at(-1)?.itemInstanceId:null,
    readOnly:true,earnedGameplayVerified:false,
    transfersEnabled:false,marketplaceEnabled:false};
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({list});
}
