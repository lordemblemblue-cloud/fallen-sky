// Duelist Adventure: independent permanent class mastery 1-25 and ephemeral match combat boosts.
// The class XP is retained between matches; the match boosts reset at every new match and never persist.
// Only server-owned elapsed live match time improves ability/passive ranks and special tiers.
// Permanent mastery now grants server-derived ability and Ultimate ranks at earned XP milestones.
// An independent match boost still resets every match and cannot be client-forged.
export const LEVEL_CAP = 25;
export const RANK_MAX = 4;
export const TIER_MAX = 3;
export const MATCH_BOOST = Object.freeze({ cap: 3, atSeconds: Object.freeze([60, 150, 240]) });
export const cleanBoost = (n) => Number.isFinite(n) ? Math.max(0, Math.min(MATCH_BOOST.cap, Math.floor(n))) : 0;
export const boostAt = (seconds) => Number.isFinite(seconds) && seconds >= 0 ?
  MATCH_BOOST.atSeconds.filter((t) => seconds + 1e-7 >= t).length : 0;

const whole = (level) => Math.max(1, Math.min(LEVEL_CAP, Math.floor(Number.isFinite(level) ? level : 1)));
/** Rank 1-4 is based on the temporary match boost, never saved mastery. */
export const abilityRank = (matchBoost = 0) => 1 + cleanBoost(matchBoost);
/** Tier 1-3 is based on the temporary match boost, never saved mastery. */
export const specialTier = (matchBoost = 0) => cleanBoost(matchBoost) >= 3 ? 3 : cleanBoost(matchBoost) >= 2 ? 2 : 1;
/** Permanent mastery milestones are recognition, not power increases. */
export const MILESTONES = Object.freeze({
  5: 'mastery I', 10: 'mastery II', 15: 'mastery III', 20: 'mastery IV', 25: 'mastery V',
});

// User-approved permanent mastery schedule: levels 2-4 and 6-9 etc earn one
// ability point in round-robin order; every fifth level earns +1 Ultimate rank.
// This is computed from the server-owned class EXP / level, never a client-submitted
// allocation or spendable token. Match-time boosts remain a separate tier system.
export const MASTERY_ABILITY_COUNT = 4;
export const MASTERY_ABILITY_MAX = 6;
export const MASTERY_ULTIMATE_MAX = 6;
const earnedAbilitySteps = level => {
  let steps = 0;
  for (let n = 2; n <= level; n++) if (n % 5 !== 0) steps++;
  return steps;
};
/** Describes the automatically earned upgrade at a single level. */
export function masteryReward(level) {
  const lv = whole(level);
  if (lv === 1) return Object.freeze({ level: 1, kind: 'starting' });
  if (lv % 5 === 0) return Object.freeze({ level: lv, kind: 'ultimate', bonus: 1 });
  return Object.freeze({ level: lv, kind: 'ability',
    abilityIndex: (earnedAbilitySteps(lv) - 1) % MASTERY_ABILITY_COUNT, bonus: 1 });
}
/** The four ability ranks and one ultimate rank after reaching a level (all capped by LEVEL_CAP). */
export function masteryAt(level) {
  const lv = whole(level);
  const abilityPoints = Array(MASTERY_ABILITY_COUNT).fill(0);
  let ultimatePoints = 0;
  for (let n = 2; n <= lv; n++) {
    const reward = masteryReward(n);
    if (reward.kind === 'ultimate') ultimatePoints += 1;
    else abilityPoints[reward.abilityIndex] += 1;
  }
  return {
    level: lv,
    abilityPoints,
    abilityRanks: abilityPoints.map(points => Math.min(MASTERY_ABILITY_MAX, points + 1)),
    ultimatePoints,
    ultimateRank: Math.min(MASTERY_ULTIMATE_MAX, 1 + ultimatePoints),
  };
}

/** EXP needed to go from `level` to the next (nothing past the cap). */
export const xpToNext = (level) => (whole(level) >= LEVEL_CAP ? 0 : 100 + (whole(level) - 1) * 60);
/** The total EXP at which a class reaches `level`. */
export function xpForLevel(level) {
  let total = 0;
  for (let l = 1; l < whole(level); l++) total += xpToNext(l);
  return total;
}
export const XP_CAP = xpForLevel(LEVEL_CAP);

/** { level, into (EXP into this level), need (to the next; 0 at the cap), progress (0..1), capped } from a total. */
export function levelFromXp(total) {
  let left = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  let level = 1;
  while (level < LEVEL_CAP && left >= xpToNext(level)) { left -= xpToNext(level); level += 1; }
  const need = xpToNext(level);
  return { level, into: need ? left : 0, need, progress: need ? left / need : 1, capped: level >= LEVEL_CAP };
}

// what a match's events are worth, to the class being played when they happen
export const XP = Object.freeze({ elimination: 20, assist: 12, capture: 60, flagReturn: 20, point: 15, roundWin: 40,
  win: 120, played: 30, participationPerSecond: 2 });

/**
 * The EXP a match event is worth to one player. ctx: { me, myTeam }. A point is worth its EXP to everyone on the
 * capturing team; a win to everyone on the winning side; everyone who saw the match end has played it.
 */
export function xpForEvent(e, { me = null, myTeam = null } = {}) {
  if (!e || !me) return 0;
  switch (e.type) {
    case 'defeat': return e.by === me && e.who !== me ? XP.elimination : 0;
    case 'assist': return e.by === me ? XP.assist : 0;
    case 'participation': return e.by === me ? Math.max(0, Math.min(10, Math.floor(e.amount) || 0)) : 0;
    case 'captured': return e.by === me ? XP.capture : 0;
    case 'flagReturned': return e.by === me ? XP.flagReturn : 0;
    case 'pointCaptured': return myTeam && e.team === myTeam ? XP.point : 0;
    case 'roundOver': return e.winner === me ? XP.roundWin : 0;
    case 'over': return XP.played + (e.winner === me || (myTeam && e.winner === myTeam) ? XP.win : 0);
    default: return 0;
  }
}

/** A player's EXP per class, made safe: { warrior, duelist, assassin, healer } with whole numbers from 0 to the cap. */
export function cleanProgress(raw, classIds) {
  const out = {};
  for (const id of classIds) {
    const v = raw && typeof raw === 'object' ? raw[id] : 0;
    out[id] = Number.isFinite(v) && v > 0 ? Math.min(XP_CAP, Math.floor(v)) : 0;
  }
  return out;
}

// The specials' three temporary tiers: improved only during this match.
export const SPECIAL_TIERS = Object.freeze({
  rage: Object.freeze({ effectSeconds: Object.freeze([5, 6, 7]) }),
  execution: Object.freeze({ threshold: Object.freeze([0.3, 0.35, 0.4]) }), // the target's HP, as a share of its most (owner: 30% at tier 1)
  shadowExecution: Object.freeze({ rearArc: Object.freeze([120, 150, 180]), reach: Object.freeze([2.3, 2.5, 2.7]) }),
  sanctuary: Object.freeze({ effectSeconds: Object.freeze([5, 6, 7]), radius: Object.freeze([6, 7, 8]), healPerSecond: Object.freeze([5, 6, 7]) }),
});
/** A special's value at a level (e.g. the Execution's threshold), or the fallback where it has no tiers. */
export const tierValue = (specialId, field, matchBoost, fallback = null) => SPECIAL_TIERS[specialId]?.[field]?.[specialTier(matchBoost) - 1] ?? fallback;
