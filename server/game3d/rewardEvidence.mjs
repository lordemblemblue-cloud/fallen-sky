// Combat Foundation 4.4 — auditable outcome proof vs unverified account state.
// A genuine archived outcome is NOT proof of eligible equipment, XP or credit.
export const BLOCKERS=Object.freeze([
  'account_stats_not_verified',
  'equipment_provenance_not_verified',
  'ranked_reward_policy_disabled',
]);
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200;
export function buildRewardReview(archive){
  if(!archive||!id(archive.duelId)||!id(archive.resultId)||
     !id(archive.playerAId)||!id(archive.playerBId)||
     archive.playerAId===archive.playerBId||
     (archive.outcome!=='draw'&&archive.outcome!=='win')||
     archive.rewardEligibility!=='unverified_account'||
     archive.rewardsIssued!==false)
    throw Error('Invalid archived result for reward review');
  return Object.freeze({
    duelId:archive.duelId,resultId:archive.resultId,
    outcomeVerified:true,
    reviewStatus:'blocked_account_unverified',
    blockers:BLOCKERS,
    accountStatsVerified:false,equipmentVerified:false,
    rankedPolicyVerified:false,
    eligible:false,rewardsIssued:false,
  });
}
export function verifyRewardReviewRow(row,archive){
  if(!row)return false;
  let expected;
  try{expected=buildRewardReview(archive);}catch{return false;}
  return row.duel_id===expected.duelId&&row.result_id===expected.resultId&&
    row.review_status===expected.reviewStatus&&
    row.account_stats_verified===false&&row.loadout_verified===false&&
    row.ranked_policy_verified===false&&row.eligible===false&&
    row.rewards_issued===false;
}
