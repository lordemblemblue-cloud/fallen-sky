// Combat Foundation 2.7: server-timed held charges and one-use finisher links.
// A server-observed one-second hold proves elapsed time, NOT skill mastery.
// Mastery XP/character specialization is currently uploaded from browser
// storage. This policy never awards PvP damage, piercing or critical bonuses.
import { duelSkillProfile } from './duelComboPolicy.mjs';

export const SERVER_CHARGE_MIN_MS = 1000;
export const SERVER_CHARGE_MAX_MS = 7000;
export const SERVER_CHARGE_MAX_PENDING = 2;
export const SERVER_CHAIN_EARLY_MS = 340;
export const SERVER_CHAIN_LATE_MS = 250;

const CORE_ELIGIBLE = new Set([2,4,5,6,9,10]);
const LEGACY_ELIGIBLE = new Set(['sword_heavy_strike','sword_triple_slash','guardian_crushing_blow']);
export function serverChargeFamily(skillId) {
  const p = duelSkillProfile(skillId);
  if (!p) return null;
  const core = /^axe_(offensive|defensive|ranged)_skill_(\d+)$/.exec(skillId);
  if (core && CORE_ELIGIBLE.has(Number(core[2])))
    return p.offsets.length === 3 ? 'three_hit' : p.offsets.length === 1 ? 'single' : null;
  if (LEGACY_ELIGIBLE.has(skillId))
    return p.offsets.length === 3 ? 'three_hit' : 'single';
  return null;
}
export function validateServerChargeBegin({skillId,weaponPath,chargeId,now}={}) {
  const profile = duelSkillProfile(skillId);
  const family = serverChargeFamily(skillId);
  if (!profile || !family) return {ok:false,reason:'charge_not_eligible'};
  if (profile.weaponPath !== weaponPath) return {ok:false,reason:'wrong_weapon'};
  if (typeof chargeId !== 'string' || !/^axech[a-zA-Z0-9_-]{5,65}$/.test(chargeId))
    return {ok:false,reason:'invalid_charge_id'};
  if (!Number.isFinite(now)) return {ok:false,reason:'invalid_time'};
  return {ok:true,hold:{chargeId,skillId,weaponPath,startedAt:now,
    expiresAt:now+SERVER_CHARGE_MAX_MS}};
}
export function verifyServerChargeRelease(hold,{skillId,weaponPath,now}={}) {
  if (!hold || hold.skillId !== skillId || hold.weaponPath !== weaponPath)
    return {valid:false,reason:'missing_charge'};
  if (!Number.isFinite(now) || now > hold.expiresAt)
    return {valid:false,reason:'charge_expired'};
  if (now - hold.startedAt < SERVER_CHARGE_MIN_MS)
    return {valid:false,reason:'charge_too_short'};
  return {valid:true,elapsedMs:now-hold.startedAt};
}
export function verifyServerFinisherChain({source,sourceProfile,nextProfile,now}={}) {
  if (!source || !sourceProfile || !nextProfile ||
    !source.serverTimedCharge || source.chainConsumed) return {ok:false,reason:'no_eligible_finisher'};
  if (serverChargeFamily(source.skillId) !== 'three_hit' ||
      serverChargeFamily(nextProfile.skillId) !== 'single')
    return {ok:false,reason:'wrong_chain_pattern'};
  if (sourceProfile.weaponPath !== nextProfile.weaponPath)
    return {ok:false,reason:'wrong_chain_weapon'};
  // It has to have resolved at least the first TWO hits of the three-hit.
  if (source.nextIndex < sourceProfile.offsets.length - 1)
    return {ok:false,reason:'finisher_not_ready'};
  const lastAt = source.createdAt + sourceProfile.offsets[sourceProfile.offsets.length-1];
  if (!Number.isFinite(now) || now < lastAt - SERVER_CHAIN_EARLY_MS ||
      now > lastAt + SERVER_CHAIN_LATE_MS)
    return {ok:false,reason:'finisher_window_closed'};
  return {ok:true,sourceCastId:source.castId};
}

// Future-proofed bonus gate. Server-only trusted mastery attestation must be
// wired first; a timed hold or a browser-saved XP value is NEVER sufficient.
// No current duel route sets masteryVerified to true.
export function verifiedPvpChargedModifiers(cast, profile, hitIndex) {
  const mastered = cast?.masteryVerified === true;
  const lastHit = Number(hitIndex) === (profile?.offsets?.length || 0) - 1;
  const charge = mastered && cast?.serverTimedCharge === true && lastHit;
  const breakArmor = mastered && cast?.serverTimedChain === true &&
    cast?.sourceMasteryVerified === true && lastHit;
  return {
    powerMultiplier: charge ? 1.20 : 1,
    armorPiercePct: breakArmor ? 0.35 : 0,
    // Shield removal, ignore-block and guaranteed lethal are NEVER implied.
    shieldBypass: false,
  };
}
