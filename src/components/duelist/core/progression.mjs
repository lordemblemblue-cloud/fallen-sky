// Duelist Adventure: class levels. Each class has a level of its own, 1 to 20, earned with EXP from matches.
//   Abilities have ranks 1 to 5. Every fifth level adds a rank to all four of the class's abilities (levels 5, 10,
//   15 and 20), so a class is maxed out at level 20. The passive grows with the same rank.
//   The special has three tiers: as learned, improved at level 10, and final at level 20.
// What a rank or a tier changes is in core/ranks.mjs. Pure, and shared by the browser and the match server: the
// server decides the level an online fighter has (server/duelist/progress.mjs); the browser never does.
export const LEVEL_CAP = 20;
export const RANK_MAX = 5;
export const TIER_MAX = 3;

const whole = (level) => Math.max(1, Math.min(LEVEL_CAP, Math.floor(Number.isFinite(level) ? level : 1)));
/** The rank (1-5) of every ability of a class at this level. */
export const abilityRank = (level) => 1 + Math.floor(whole(level) / 5);
/** The tier (1-3) of the class's special at this level. */
export const specialTier = (level) => (whole(level) >= 20 ? 3 : whole(level) >= 10 ? 2 : 1);
/** The levels at which something improves, and what: { 5: 'abilities', 10: 'abilities and special', ... }. */
export const MILESTONES = Object.freeze({ 5: 'abilities', 10: 'abilities and special', 15: 'abilities', 20: 'abilities and special' });

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
export const XP = Object.freeze({ elimination: 20, capture: 60, flagReturn: 20, point: 15, roundWin: 40, win: 120, played: 30 });

/**
 * The EXP a match event is worth to one player. ctx: { me, myTeam }. A point is worth its EXP to everyone on the
 * capturing team; a win to everyone on the winning side; everyone who saw the match end has played it.
 */
export function xpForEvent(e, { me = null, myTeam = null } = {}) {
  if (!e || !me) return 0;
  switch (e.type) {
    case 'defeat': return e.by === me && e.who !== me ? XP.elimination : 0;
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

// The specials' three tiers (tier 1 is as learned): what improves at level 10 and again at level 20.
export const SPECIAL_TIERS = Object.freeze({
  rage: Object.freeze({ effectSeconds: Object.freeze([5, 6, 7]) }),
  execution: Object.freeze({ threshold: Object.freeze([0.25, 0.3, 0.35]) }), // the target's HP, as a share of its most
  shadowExecution: Object.freeze({ rearArc: Object.freeze([120, 150, 180]), reach: Object.freeze([2.3, 2.5, 2.7]) }),
  sanctuary: Object.freeze({ effectSeconds: Object.freeze([5, 6, 7]), radius: Object.freeze([6, 7, 8]), healPerSecond: Object.freeze([5, 6, 7]) }),
});
/** A special's value at a level (e.g. the Execution's threshold), or the fallback where it has no tiers. */
export const tierValue = (specialId, field, level, fallback = null) => SPECIAL_TIERS[specialId]?.[field]?.[specialTier(level) - 1] ?? fallback;
