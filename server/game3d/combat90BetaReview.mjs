// Combat Foundation 9.0 — central private-beta trust dossier.
// This is a read-only diagnostic entrypoint, not a release service or
// gameplay authority. NEVER expose directly to arbitrary browser callers.
import {assertGame3DPreBetaSafety} from './combatPreBetaGate.mjs';
import {inspectGame3DLateBetaSchema} from './lateBetaSchemaAudit.mjs';
import {createGame3DPrivateBetaTrustDossier}
 from './privateBetaTrustDossier.mjs';
import {createMarketPreviewAudit} from './marketPreviewAudit.mjs';

const DENIED=Object.freeze({
 productionApproved:false,rankedCombatApproved:false,
 trustedGearStatsApproved:false,questRewardsApproved:false,
 marketTradingApproved:false,escrowApproved:false,
 currencyPayoutApproved:false,itemAutoGrantApproved:false,
 rewardsIssued:false,
});
const uuid=x=>typeof x==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);

export function createGame3DCombat90BetaReview({
 pool,resolveAuthenticatedSubject,env={}
}={}){
 if(!pool?.connect||!pool?.query||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('9.0 requires a private PostgreSQL pool and a real server identity resolver');
 const characterReview=createGame3DPrivateBetaTrustDossier({
  pool,resolveAuthenticatedSubject});
 const marketReview=createMarketPreviewAudit({pool});
 const inspect=async({serverRequestContext,characterId,instanceId,
  questId,listingId=null}={})=>{
  // No request-controlled flag can turn on ranked or market activity.
  try {assertGame3DPreBetaSafety(env);}
  catch(error){return {...DENIED,ok:false,code:'unsafe_beta_flags',
   message:String(error.message).slice(0,160)}}
  if(listingId!==null&&!uuid(listingId))
   return {...DENIED,ok:false,code:'invalid_market_listing_id'};
  // The schema audit is read-only and does not initialize migrations.
  const schema=await inspectGame3DLateBetaSchema({pool});
  if(!schema.ok)
   return {...DENIED,ok:false,code:'manual_migrations_missing',
    missingSchema:[...schema.missing]};
  const character=await characterReview.inspect({
   serverRequestContext,characterId,instanceId,questId});
  if(!character.ok)
   return {...DENIED,ok:false,code:'character_or_quest_inconsistent',
    characterReason:character.code};
  // Owner ID for market review is solely the account resolved by the
  // trusted session adapter, never a supplied browser field.
  const market=listingId===null?null:await marketReview.inspect({
   ownerId:character.ownerId,characterId,listingId});
  return {
   ...DENIED,ok:true,source:'private-beta-read-only',
   accountBound:character.accountBound===true,
   schemaObserved:true,
   characterId,worldInstanceId:instanceId,
   questJournalDigest:character.questJournalDigest,
   equipmentDigest:character.equipmentDigest,
   equipmentRevision:character.equipmentRevision,
   marketPreviewConsistent:market?.ok===true,
   ...(market&&!market.ok?{marketReason:'listing_source_not_verified'}:{}),
   requiresRealSimulationAttester:true,
   requiresIndependentBetaTests:true,
   requiresProductionAuthorization:true,
  };
 };
 return Object.freeze({inspect});
}
