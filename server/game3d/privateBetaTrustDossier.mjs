// Combat Foundation 7.5 — private beta trust-dossier aggregator.
// Internal READ-ONLY diagnostics only. No public API, no client-origin
// owner ID, no reward writer and no authorization to activate ranked combat.
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
import {createGame3DEquipmentSnapshotReader}
  from './characterEquipmentSnapshot.mjs';
import {createGame3DQuestJournalRead}
  from './serverQuestJournalRead.mjs';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const blocked=(code)=>({
  ok:false,code,accountBound:false,
  trustedCombatStats:false,questRewardAuthorized:false,
  itemGrantAuthorized:false,rankedEligible:false,
  productionReady:false,rewardsIssued:false,
});
export function createGame3DPrivateBetaTrustDossier({
  pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.query||!pool?.connect||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('7.5 requires private PostgreSQL and server session resolver');
 const accounts=createGame3DAccountScopeGuard({
   pool,resolveAuthenticatedSubject});
 const equipmentReader=createGame3DEquipmentSnapshotReader({pool});
 const quests=createGame3DQuestJournalRead({pool});
 const inspect=async({serverRequestContext,characterId,instanceId,questId}={})=>{
  if(!id(characterId)||!id(instanceId)||!id(questId))
    return blocked('invalid_beta_review_scope');
  const account=await accounts.authorizeRead({
    serverRequestContext,characterId});
  if(!account.ok)return blocked(account.code);
  const ownerId=account.accountId;
  // Read only an expected revision; the next reader compares it under a
  // repeatable-read snapshot. A concurrent equip change is denied, not
  // silently retried against an untrusted browser loadout.
  const version=await pool.query(
    'SELECT revision FROM game3d_character_equipment_revision '+
    'WHERE owner_id=$1 AND character_id=$2',
    [ownerId,characterId]);
  if(version.rowCount!==1||
     !Number.isSafeInteger(Number(version.rows[0].revision))||
     Number(version.rows[0].revision)<0)
    return blocked('equipment_revision_not_initialized');
  const equipment=await equipmentReader.inspect({
    ownerId,characterId,
    expectedRevision:Number(version.rows[0].revision)});
  if(!equipment.ok)return blocked('equipment_'+(equipment.reason||'invalid'));
  const quest=await quests.inspect({
    ownerId,characterId,instanceId,questId});
  if(!quest.ok)return blocked('quest_'+(quest.code||'invalid'));
  return {
    ok:true,accountBound:true,ownerId,characterId,instanceId,questId,
    equipmentRevision:equipment.revision,
    equipmentDigest:equipment.digest,
    questJournalDigest:quest.journalDigest,
    objectiveCompleteCandidate:quest.complete===true,
    sourceConsistencyObserved:true,
    // Neither reader can independently attest world simulation; preserving
    // this explicit false flag is a non-negotiable product contract.
    simulationAuthenticityVerified:false,
    trustedCombatStats:false,questRewardAuthorized:false,
    itemGrantAuthorized:false,rankedEligible:false,
    productionReady:false,rewardsIssued:false,
  };
 };
 return Object.freeze({inspect});
}
