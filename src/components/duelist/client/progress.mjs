// The player's Duelist level and EXP, shown under the portrait (client/DuelistHud.jsx). Earned in matches from what
// the match reports (eliminations, flags, points, rounds, wins) and kept in this browser's preferences (prefs `xp`).
// It is a record of play, not a power: it changes nothing in a fight, and the match server does not keep it (an
// account-wide level would need the server to; this is the stand-in until then). Pure.

export const XP = Object.freeze({ elimination: 20, capture: 60, flagReturn: 20, point: 15, roundWin: 40, win: 120, played: 30 });

/** EXP needed to go from `level` to the next. */
export const xpToNext = (level) => 100 + (Math.max(1, Math.floor(level)) - 1) * 50;

/** { level, into (EXP into this level), need (to the next), progress (0..1) } from a total EXP. */
export function levelFrom(total) {
  let left = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  let level = 1;
  while (left >= xpToNext(level) && level < 999) { left -= xpToNext(level); level += 1; }
  const need = xpToNext(level);
  return { level, into: left, need, progress: left / need };
}

/**
 * The EXP a match event is worth to this player. ctx: { me, myTeam }. A point is worth its EXP to everyone on
 * the capturing team; a win to everyone on the winning side; everyone who saw the match end has played it.
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
