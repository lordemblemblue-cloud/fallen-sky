// Combat Foundation 4.8: deterministic, server-authored STANDARDIZED DUEL
// baseline. Browser-synced Character Vault does NOT prove earned progression.
// We therefore grant NO gear bonuses, no carried mastery, and no rewards.
// This ruleset is not a character build. It is an explicit safe PvP preview.
import {clampAXEDuelStats} from './axePowerBudget.ts';

export const DUEL_BASELINE_VERSION='game3d-standardized-preview-v1';
export const DUEL_BASELINE_STATS=Object.freeze(clampAXEDuelStats({
  level:1,damage:18,maxHP:120,defense:12,
  attackSuccess:50,attackBlock:15,critChance:5,
  attributionAttack:0,attributionDefense:0,
  criticalDamage:0.2,criticalDefense:0,
  avoidPct:0,deflectPct:0,blockPct:0,damageReductionPct:0,
  reflectPct:0,lifeStealPct:0,armorPenPct:0,hitBonusPct:0,
  critChanceReductionPct:0,skillDamagePct:0,
  executeThresholdPct:0,executeDamagePct:0,
}));
const id=v=>typeof v==='string'&&v.length>0&&v.length<=160;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function buildStandardizedDuelManifest({duelId,epoch,
  challengerId,opponentId,characterEvidence}={}){
  if(!id(duelId)||!id(epoch)||!id(challengerId)||!id(opponentId)||
      challengerId===opponentId||
      characterEvidence?.source!=='browser-synced-character-vault'||
      characterEvidence.combatStatsVerified!==false||
      characterEvidence.equipmentProvenanceVerified!==false||
      characterEvidence.rewardsIssued!==false)
    throw Error('Cannot bind unverified or ambiguous duel character evidence');
  const participant=(e,owner)=>{
    if(e?.ok!==true||e.ownerId!==owner||
       !id(e.characterId)||!Number.isSafeInteger(e.revision)||e.revision<1||
       typeof e.fingerprint!=='string'||!e.fingerprint||
       e.fingerprint.length>100||e.ownerBindingVerified!==true||
       e.saveConsistencyVerified!==true||
       e.combatStatsVerified!==false||
       e.equipmentProvenanceVerified!==false||
       e.eligible!==false||e.rewardsIssued!==false)
      throw Error('Invalid standardized duel participant evidence');
    return {ownerId:owner,characterId:e.characterId,
      vaultRevision:e.revision,vaultFingerprint:e.fingerprint};
  };
  return {
    version:1,ruleset:DUEL_BASELINE_VERSION,
    duelId,epoch,
    challenger:participant(characterEvidence.challenger,challengerId),
    opponent:participant(characterEvidence.opponent,opponentId),
    // Never read or include browser equipment IDs, modifiers or attributes.
    // Object keys are canonicalized in database hashing, not here.
    stats:{...DUEL_BASELINE_STATS},equipment:[],
    statsSource:'fixed-worker-reviewed-ruleset',
    earnedProgressionVerified:false,equipmentProvenanceVerified:false,
    rewardEligibility:'unverified_account',rewardsIssued:false,
  };
}
export function verifyStandardizedDuelManifest(ticket){
  const manifest=ticket?.combatLoadout;
  if(!manifest||manifest.version!==1||
     manifest.ruleset!==DUEL_BASELINE_VERSION||
     manifest.duelId!==ticket.duelId||
     manifest.epoch!==ticket.authorityEpoch||
     manifest.statsSource!=='fixed-worker-reviewed-ruleset'||
     manifest.earnedProgressionVerified!==false||
     manifest.equipmentProvenanceVerified!==false||
     manifest.rewardEligibility!=='unverified_account'||
     manifest.rewardsIssued!==false||!Array.isArray(manifest.equipment)||
     manifest.equipment.length!==0)
    return {ok:false,code:'invalid_standardized_loadout'};
  try{
    const expected=buildStandardizedDuelManifest({
      duelId:ticket.duelId,epoch:ticket.authorityEpoch,
      challengerId:ticket.challengerId,opponentId:ticket.opponentId,
      characterEvidence:ticket.characterEvidence,
    });
    if(!same(manifest,expected))
      return {ok:false,code:'standardized_loadout_mismatch'};
    return {ok:true,manifest:expected};
  }catch{return {ok:false,code:'invalid_standardized_evidence'};}
}
