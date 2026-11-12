// Combat Foundation 2.6. Server-owned, deliberately conservative duel skill
// timings. No localStorage mastery, client multiplier, charged flag, or claimed
// shield-bypass is accepted as authoritative here.
export const DUEL_CAST_GRACE_MS = 1800;
export const DUEL_CAST_EARLY_MS = 120;
export const DUEL_CAST_MAX_AGE_MS = 4500;
export const MAX_ACTIVE_DUEL_CASTS = 3;
const getOffsets = (count, delayMs = 170) => Array.from({ length: count }, (_, i) => i * delayMs);
const CORE_HITS = Object.freeze([2, 1, 1, 1, 3, 1, 4, 1, 1, 3]);
const CORE_MULT = Object.freeze([0.70, 1.20, 0.95, 1.45, 0.72, 1.70, 0.68, 1.65, 2.15, 1.05]);
const LEGACY = Object.freeze({
  sword_heavy_strike: { weaponPath:'damage', offsets:[120], multiplier:1.30, cooldownMs:4000 },
  sword_triple_slash: { weaponPath:'damage', offsets:[0,500,1000], multiplier:0.90, cooldownMs:8000 },
  guardian_crushing_blow: { weaponPath:'defense', offsets:[120], multiplier:1.20, cooldownMs:4000 },
  guardian_twin_fang: { weaponPath:'defense', offsets:[0,80,500,900], multiplier:0.90, cooldownMs:8000 },
  ranged_double_shot: { weaponPath:'ranged', offsets:[0,200], multiplier:1.10, cooldownMs:4000 },
  ranged_barrage: { weaponPath:'ranged', offsets:[0,300,600,900,1200], multiplier:0.80, cooldownMs:10000 },
});
export function duelSkillProfile(id) {
  if (typeof id !== 'string') return null;
  // Prototype names must never resolve as authorized skills.
  const legacy = Object.prototype.hasOwnProperty.call(LEGACY, id) ? LEGACY[id] : null;
  if (legacy) return { ...legacy, skillId:id, offsets:[...legacy.offsets] };
  const m = /^axe_(offensive|defensive|ranged)_skill_([1-9]|10)$/.exec(id);
  if (m) {
    const role = m[1], n = Number(m[2]), i=n-1;
    const count=CORE_HITS[i];
    const ms = n === 1 ? 180 : n === 5 ? 170 : n === 7 ? 150 : n === 10 ? 220 : 0;
    const cooldownSec = n <= 2 ? 3+n : n <= 7 ? 4+n*0.8 : 10+n;
    return { skillId:id, weaponPath:role==='offensive'?'damage':role==='defensive'?'defense':'ranged',
      offsets: getOffsets(count, ms), multiplier:CORE_MULT[i],
      criticalAllowed: n !== 3, cooldownMs:Math.round(cooldownSec*1000) };
  }
  const a=/^axe_(offensive|defensive|ranged)_a_skill$/.exec(id);
  if (a) return {skillId:id,weaponPath:a[1]==='offensive'?'damage':a[1]==='defensive'?'defense':'ranged',
    offsets:[120],multiplier:1.65,cooldownMs:12000};
  return null;
}
export function validateDuelCastStart({skillId, weaponPath, castId, now, cooldownUntil=0}={}) {
  const profile=duelSkillProfile(skillId);
  if (!profile) return {ok:false,reason:'unsupported_duel_skill'};
  if (profile.weaponPath!==weaponPath) return {ok:false,reason:'wrong_weapon'};
  if (typeof castId!=='string' || !/^axe[a-zA-Z0-9_-]{5,68}$/.test(castId)) return {ok:false,reason:'invalid_cast_id'};
  if (!Number.isFinite(now) || now < cooldownUntil) return {ok:false,reason:'skill_cooldown'};
  return {ok:true,profile,cast:{castId,skillId,createdAt:now,nextIndex:0,
    expiresAt:now+Math.min(DUEL_CAST_MAX_AGE_MS,profile.offsets.at(-1)+DUEL_CAST_GRACE_MS)}};
}
export function validateDuelCastHit(cast, profile, hitIndex, now) {
  if (!cast || !profile || !Number.isInteger(hitIndex) ||
    hitIndex < 0 || hitIndex >= profile.offsets.length || hitIndex!==cast.nextIndex)
    return {ok:false,reason:'invalid_hit_sequence'};
  if (!Number.isFinite(now) || now > cast.expiresAt) return {ok:false,reason:'cast_expired'};
  const earliest=cast.createdAt+profile.offsets[hitIndex]-DUEL_CAST_EARLY_MS;
  if (now<earliest) return {ok:false,reason:'hit_too_early',retryAfterMs:earliest-now};
  return {ok:true,multiplier:profile.multiplier,complete:hitIndex===profile.offsets.length-1};
}
