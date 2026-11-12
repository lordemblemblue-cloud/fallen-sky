// Combat 10.6 — authenticated player progression view, private only.
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
import {createGame3DProgressionSnapshotReader} from './progressionSnapshotRead.mjs';
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
export function createAuthenticatedProgressionRead({pool,resolveAuthenticatedSubject}={}){
 if(!pool?.query||!pool?.connect||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('Trusted server identity and PostgreSQL are required');
 const accounts=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const reader=createGame3DProgressionSnapshotReader({pool});
 const inspect=async({serverRequestContext,characterId}={})=>{
  if(!key(characterId))return {ok:false,code:'invalid_character'};
  const owner=await accounts.authorizeRead({serverRequestContext,characterId});
  if(!owner.ok)return {ok:false,code:owner.code};
  const data=await reader.inspect({ownerId:owner.accountId,characterId});
  return {...data,ok:true,accountBound:true,readOnly:true,
   rankedStatsVerified:false};
 };
 return Object.freeze({inspect});
}
