// Foundation 12.9 — server-authenticated, revisioned 200-slot inventory view.
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
import {createGame3DInventorySlotReader} from './inventorySlotRead.mjs';
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
export function createAuthenticatedGame3DInventory({pool,resolveAuthenticatedSubject}={}){
 if(!pool?.query||!pool?.connect||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('Inventory requires private DB and authenticated session resolver');
 const owner=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const inventory=createGame3DInventorySlotReader({pool});
 const inspect=async({serverRequestContext,characterId}={})=>{
  if(!key(characterId))
   return {ok:false,code:'invalid_inventory_character'};
  const approved=await owner.authorizeRead({serverRequestContext,characterId});
  if(!approved.ok)
   return {ok:false,code:'unverified_inventory_owner'};
  const snapshot=await inventory.inspect({
   ownerId:approved.accountId,characterId});
  return {...snapshot,accountBound:true,readOnly:true,
   tradingEnabled:false};
 };
 return Object.freeze({inspect});
}
