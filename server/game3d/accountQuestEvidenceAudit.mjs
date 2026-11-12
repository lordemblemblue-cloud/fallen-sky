// Combat 8.3 — private account-authenticated quest candidate review.
// No browser-selected account ID or public API. Only the trusted session
// identity resolver decides owner ID. Candidate still cannot award anything.
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
import {createQuestEvidenceReader} from './questEvidenceReader.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
export function createAccountQuestEvidenceAudit({pool,resolveAuthenticatedSubject}={}){
 if(!pool?.query||!pool?.connect||typeof resolveAuthenticatedSubject!=='function')
  throw Error('8.3 needs PG and server session identity');
 const guard=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const reader=createQuestEvidenceReader({pool});
 const inspect=async({serverRequestContext,characterId,questId,instanceId}={})=>{
  const blocked=code=>({ok:false,code,rewardsIssued:false,
   prerequisiteAuthorized:false});
  if(!id(characterId)||!id(questId)||!id(instanceId))
   return blocked('invalid_quest_audit_scope');
  const approved=await guard.authorizeRead({serverRequestContext,characterId});
  if(!approved.ok)return blocked('account_'+approved.code);
  const record=await reader.inspect({
   ownerId:approved.accountId,characterId,questId,instanceId});
  return {...record,accountBound:true,
   // Never promote a read-only candidate to a game completion.
   prerequisiteAuthorized:false,rewardsIssued:false};
 };
 return Object.freeze({inspect});
}
