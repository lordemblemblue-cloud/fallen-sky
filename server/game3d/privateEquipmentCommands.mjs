// Combat 9.7 — private, server-authenticated equipment write adapter.
// Updates owner-bound PostgreSQL equipment, NOT live competitive loadouts.
// Neither user-supplied owner ID nor browser inventory may grant ownership.
import {createPgItemProvenance} from './itemProvenance.mjs';
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const slot=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(x);
const op=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const allowSlots=new Set(['main_hand','off_hand','head','chest','legs',
 'hands','feet','accessory_1','accessory_2']);
export function createGame3DPrivateEquipmentCommands({
 pool,resolveAuthenticatedSubject,validateEquipmentRules
}={}){
 if(!pool?.query||!pool?.connect)throw Error('Equipment requires private PG');
 if(typeof resolveAuthenticatedSubject!=='function'||
    typeof validateEquipmentRules!=='function')
  throw Error('Trusted session resolver and equipment rules required');
 const scope=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const change=async({serverRequestContext,characterId,operationId,
  expectedRevision,equipmentSlot,itemInstanceId=null}={})=>{
  if(!id(characterId)||!op(operationId)||!slot(equipmentSlot)||
     !allowSlots.has(equipmentSlot)||!Number.isSafeInteger(expectedRevision)||
     expectedRevision<0)
   throw Error('Invalid server equipment operation');
  const approved=await scope.authorizeRead({
   serverRequestContext,characterId});
  if(!approved.ok)throw Error('Not authorized for this character');
  const ownerId=approved.accountId;
  const store=createPgItemProvenance({
   pool,
   authorizeEquipment:async({client,ownerId:requestedOwner,
    characterId:requestedCharacter,equipmentSlot:requestedSlot,
    itemInstanceId:requestedItem,operationId:requestedOp})=>{
    if(requestedOwner!==ownerId||requestedCharacter!==characterId||
       requestedSlot!==equipmentSlot||requestedOp!==operationId||
       requestedItem!==itemInstanceId)return false;
    const check=await client.query(
     'SELECT 1 FROM game3d_trusted_character '+
     'WHERE owner_id=$1 AND character_id=$2 FOR SHARE',
     [ownerId,characterId]);
    if(check.rowCount!==1)return false;
    if(itemInstanceId!==null){
     // Item must be allocated to THIS character's actual server inventory,
     // and must not be held as a private market listing candidate.
     const eligible=await client.query(
      'SELECT s.item_instance_id FROM game3d_inventory_slot s '+
      'LEFT JOIN game3d_market_listing_candidate l '+
      'ON l.item_instance_id=s.item_instance_id '+
      'WHERE s.item_instance_id=$1 AND s.owner_id=$2 '+
      'AND s.character_id=$3 AND l.listing_id IS NULL FOR SHARE OF s',
      [itemInstanceId,ownerId,characterId]);
     if(eligible.rowCount!==1)return false;
    }
    return await validateEquipmentRules({
     client,ownerId,characterId,equipmentSlot,itemInstanceId})===true;
   },
  });
  const changed=await store.changeEquipment({
   ownerId,characterId,operationId,expectedRevision,
   equipmentSlot,itemInstanceId});
  return {...changed,ownerId,characterId,
   competitiveStatsChanged:false,rankedLoadoutEligible:false,
   marketTransferAuthorized:false};
 };
 return Object.freeze({change});
}
