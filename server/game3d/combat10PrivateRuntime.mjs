// Combat Foundation 10.0 — PRIVATE, INACTIVE server-side integration.
// The actual world game loop / authenticated user gateway must be plugged in
// separately. Do not expose recordServerEvent via a public HTTP/WS route.
// XP, items and market transfers are deliberately NOT exported here.
import {assertGame3DPreBetaSafety} from './combatPreBetaGate.mjs';
import {createGame3DEngineEventPipeline} from './engineEventPipeline.mjs';
import {createGame3DEngineQuestReview} from './engineQuestReview.mjs';
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
import {createAuthenticatedMarketReview} from './authenticatedMarketReview.mjs';
import {inspectCombat9PrivateBetaSchema} from './combat9SchemaAudit.mjs';

const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const blocked=code=>({
 ok:false,code,privateBetaOnly:true,
 playerExperienceAwarded:false,itemsGranted:false,
 competitiveRewardsAuthorized:false,marketTradesAuthorized:false,
 productionReady:false,
});
export function createGame3DCombat10PrivateRuntime({
 pool,resolveAuthenticatedSubject,proveEngineEvent,env={}
}={}){
 assertGame3DPreBetaSafety(env);
 if(!pool?.connect||!pool?.query||
    typeof resolveAuthenticatedSubject!=='function'||
    typeof proveEngineEvent!=='function')
  throw Error('10.0 requires private PG, server session and real engine attester');
 const events=createGame3DEngineEventPipeline({pool,proveEngineEvent});
 const quests=createGame3DEngineQuestReview({pool});
 const scope=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const market=createAuthenticatedMarketReview({pool,resolveAuthenticatedSubject});
 const readiness=async()=>{
  const schema=await inspectCombat9PrivateBetaSchema({pool});
  return {...schema,privateBetaOnly:true,
   serverRuntimeConnected:false, // factory is not live-world deployment
   realGameplayIntegrationTested:false,
   xpPaymentsEnabled:false,itemGrantsEnabled:false,
   rankedCombatEnabled:false,marketTradingEnabled:false,
   productionReady:false};
 };
 // Only a trusted game server should call this. It verifies its own
 // durable simulation facts inside engineOutcomeStore's PG transaction.
 const recordServerEvent=async event=>{
  const recorded=await events.commitAndJournal(event);
  return {...recorded,privateBetaOnly:true,
   productionReady:false};
 };
 const inspectQuest=async({serverRequestContext,characterId,
   instanceId,questId}={})=>{
  if(!who(characterId)||!key(instanceId)||!key(questId))
   return blocked('invalid_quest_review_request');
  const identity=await scope.authorizeRead({
   serverRequestContext,characterId});
  if(!identity.ok)return blocked('invalid_server_account_scope');
  const result=await quests.inspect({
   ownerId:identity.accountId,characterId,instanceId,questId});
  return {...result,accountBound:true,privateBetaOnly:true,
   completedAuthorized:false,xpAuthorized:false,
   itemRewardsAuthorized:false,productionReady:false};
 };
 const inspectMarket=async({serverRequestContext,
  characterId,listingId}={})=>{
  if(!who(characterId)||!key(listingId))
   return blocked('invalid_market_review_request');
  return {...await market.inspect({
   serverRequestContext,characterId,listingId}),
   privateBetaOnly:true,productionReady:false};
 };
 return Object.freeze({
  privateBetaOnly:true,releaseAuthorized:false,
  recordServerEvent,inspectQuest,inspectMarket,readiness,
 });
}
