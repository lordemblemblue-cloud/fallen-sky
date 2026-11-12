// Foundation 12.5 — trusted session-bound inventory overview.
// Never accept account ID from a browser request body as authoritative.
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
import {createGame3DIssuedInventoryRead} from './issuedInventoryRead.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
export function createGame3DAccountInventoryRead({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.connect||!pool?.query||typeof resolveAuthenticatedSubject!=='function')
  throw Error('Inventory requires PG and trusted server authentication');
 const accounts=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const inventory=createGame3DIssuedInventoryRead({pool});
 const inspect=async({serverRequestContext,characterId}={})=>{
  if(!id(characterId))return {ok:false,code:'invalid_inventory_character'};
  const owner=await accounts.authorizeRead({serverRequestContext,characterId});
  if(!owner.ok)return {ok:false,code:'inventory_owner_not_authenticated'};
  const result=await inventory.inspect({ownerId:owner.accountId,characterId});
  return {...result,serverAccountVerified:true,readOnly:true};
 };
 return Object.freeze({inspect});
}
