// Foundation 13.3 — drag/drop or double-click forged-item selection
// resolves a server-owned inventory item, not an arbitrary client object.
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
import {verifyItemProvenanceChain} from './itemProvenanceReview.mjs';
const uuid=x=>typeof x==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
export function createGame3DBlacksmithSelection({pool,resolveAuthenticatedSubject}={}){
 if(!pool?.connect||!pool?.query||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('Blacksmith selection requires trusted account resolver');
 const guard=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const inspect=async({serverRequestContext,characterId,itemInstanceId,
  readUpgradeState=null}={})=>{
  if(!uuid(itemInstanceId))
   return {ok:false,code:'invalid_blacksmith_item'};
  const account=await guard.authorizeRead({
   serverRequestContext,characterId});
  if(!account.ok)return {ok:false,code:'unverified_blacksmith_character'};
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query(
    'SELECT i.item_instance_id,i.definition_id,s.slot_index,'+
    'eq.equipment_slot,l.listing_id,'+
    'row_to_json(i) AS issued,row_to_json(ve) AS event,'+
    'row_to_json(cs) AS completion,row_to_json(sr) AS simulation '+
    'FROM game3d_inventory_slot s '+
    'JOIN game3d_item_issuance i ON i.item_instance_id=s.item_instance_id '+
    'AND i.owner_id=s.owner_id AND i.character_id=s.character_id '+
    'LEFT JOIN game3d_character_equipment eq ON eq.item_instance_id=i.item_instance_id '+
    'AND eq.owner_id=s.owner_id AND eq.character_id=s.character_id '+
    'LEFT JOIN game3d_market_listing_candidate l ON l.item_instance_id=i.item_instance_id '+
    'AND l.owner_id=s.owner_id AND l.character_id=s.character_id '+
    'LEFT JOIN game3d_verified_gameplay_event ve ON ve.event_id::text=i.source_event_id '+
    'LEFT JOIN game3d_server_completion_source cs ON cs.completion_id=ve.completion_id '+
    'LEFT JOIN game3d_simulation_completion_receipt sr ON sr.completion_id=cs.completion_id '+
    'WHERE s.owner_id=$1 AND s.character_id=$2 AND s.item_instance_id=$3',
    [account.accountId,characterId,itemInstanceId]);
   // Preserve the same repeatable-read snapshot while inspecting item
   // provenance AND a trusted Blacksmith upgrade record.
   let result;
   if(r.rowCount!==1)result={ok:false,code:'item_not_owned_in_inventory'};
   else if(r.rows[0].listing_id!==null)
    result={ok:false,code:'item_reserved_for_trading'};
   else{
   const proof=verifyItemProvenanceChain({
    issued:r.rows[0].issued,event:r.rows[0].event,
    completion:r.rows[0].completion,simulation:r.rows[0].simulation});
   if(!proof.ok||proof.ownerId!==account.accountId||
      proof.characterId!==characterId||
      proof.itemInstanceId!==itemInstanceId)
    result={ok:false,code:'source_provenance_inconsistent'};
   else{
    const upgradeState=typeof readUpgradeState==='function'
      ?await readUpgradeState({client:c,ownerId:account.accountId,
       characterId,itemInstanceId}):null;
    result={ok:true,ownerId:account.accountId,characterId,
    itemInstanceId,definitionId:r.rows[0].definition_id,
    inventorySlot:Number(r.rows[0].slot_index),
    equippedSlot:r.rows[0].equipment_slot??null,
    provenanceConsistent:true,gameplayAuthenticityVerified:false,
    forgeAuthorized:false,materialsConsumed:false,
    previewOnly:true,...(readUpgradeState?{upgradeState}: {})};
   }
   }
   await c.query('COMMIT');
   return result;
  }catch(error){try{await c.query('ROLLBACK')}catch{}throw error}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
