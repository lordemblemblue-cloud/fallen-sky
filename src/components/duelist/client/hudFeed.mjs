// What the match HUD announces (client/DuelistHud.jsx): the kill feed at the top right and the banners under the
// scoreboard (flag and point events, kill streaks, match point, round results), from the match's own events and
// view (sim/match.mjs; online they arrive from the server). Presentation only: nothing here decides the game.
// Pure: the caller passes the time (seconds on any steady clock).

export const BANNER_SECONDS = 3.4;
export const KILL_ROW_SECONDS = 7;
export const KILL_ROWS = 5;
export const STREAKS = Object.freeze([3, 5, 7, 10]); // the player's own streaks; others' are announced from 5
export const OTHERS_STREAKS = Object.freeze([5, 10]);
export const FLAG_STATE_TEXT = Object.freeze({ home: 'At base', taken: 'Taken', dropped: 'Dropped', returned: 'Returned', captured: 'Captured' });
// the match calls a flag in someone's hands 'carried'
const FLAG_STATES = Object.freeze({ home: 'home', carried: 'taken', taken: 'taken', dropped: 'dropped' });

const upper = (s) => String(s || '').toUpperCase();
const other = (team) => (team === 'red' ? 'blue' : team === 'blue' ? 'red' : null);

/** Is a side one score from winning (or, in Control, at 90%)? Returns 'red' | 'blue' | a player id | null. */
export function matchPointOf(view) {
  if (!view || view.phase === 'over') return null;
  const need = view.scoreToWin;
  if (view.mode === 'control') {
    const side = ['blue', 'red'].find((t) => (view.teamScores?.[t] ?? 0) >= 90);
    return side || null;
  }
  if (view.mode === 'ctf' || view.mode === 'tdm' || view.mode === 'football') {
    if (!need) return null;
    return ['blue', 'red'].find((t) => (view.teamScores?.[t] ?? 0) === need - 1) || null;
  }
  if (view.mode === 'duel' && view.rounds) {
    const toWin = Math.ceil(view.rounds / 2);
    return view.people?.find((p) => p.roundWins === toWin - 1 && toWin > 1)?.id || null;
  }
  if (view.mode === 'ffa' && need) return view.people?.find((p) => p.defeats === need - 1)?.id || null;
  return null;
}

/**
 * ctx (given with every call): { me, myTeam, nameOf(id), teamOf(id), classOf(id) }.
 * Banners: { id, slot: 'objective' | 'event', tone: 'good' | 'bad' | 'neutral' | 'gold', text, at, until }.
 * Kill rows: { id, by, who, byName, whoName, byTeam, whoTeam, byClass, whoClass, mine, at, until }.
 */
export function createHudFeed() {
  let nextId = 1;
  let kills = [];
  let banners = [];
  let streaks = new Map(); // fighter id -> eliminations since it last fell
  let owners = {}; // control point id -> owner, as last seen
  let contested = new Set();
  let allThree = null;
  let matchPoint = null;
  let flagFlash = {}; // team -> { state: 'returned' | 'captured', until }
  let hinted = null; // the match (mode + round) whose opening hint was shown
  let lastPhase = null;

  const banner = (slot, tone, text, now, seconds = BANNER_SECONDS) => {
    banners = banners.filter((b) => b.slot !== slot || b.until <= now); // one at a time in each slot: the newest
    banners.push({ id: nextId++, slot, tone, text, at: now, until: now + seconds });
  };
  const sideTone = (team, ctx) => (ctx.myTeam ? (team === ctx.myTeam ? 'good' : 'bad') : 'neutral');

  function reset() {
    kills = []; banners = []; streaks = new Map(); owners = {}; contested = new Set(); allThree = null; matchPoint = null; flagFlash = {}; hinted = null;
    lastPhase = null;
  }

  /** A match event (sim/match.mjs events; control's pointCaptured). */
  function event(e, now, ctx) {
    const name = (id) => upper(ctx.nameOf?.(id) || 'A player');
    switch (e.type) {
      case 'defeat': {
        if (e.who) streaks.set(e.who, 0);
        if (!e.by) break;
        const n = (streaks.get(e.by) || 0) + 1;
        streaks.set(e.by, n);
        kills.push({ id: nextId++, by: e.by, who: e.who, byName: ctx.nameOf?.(e.by) || '?', whoName: ctx.nameOf?.(e.who) || '?',
          byTeam: ctx.teamOf?.(e.by) || null, whoTeam: ctx.teamOf?.(e.who) || null, byClass: ctx.classOf?.(e.by) || null, whoClass: ctx.classOf?.(e.who) || null,
          mine: e.by === ctx.me || e.who === ctx.me, at: now, until: now + KILL_ROW_SECONDS });
        if (kills.length > KILL_ROWS) kills = kills.slice(-KILL_ROWS);
        if (e.by === ctx.me) { if (STREAKS.includes(n)) banner('event', 'gold', `${n} PLAYER KILL STREAK!`, now, BANNER_SECONDS + 0.6); }
        else if (OTHERS_STREAKS.includes(n)) banner('event', ctx.myTeam && ctx.teamOf?.(e.by) === ctx.myTeam ? 'good' : 'bad', `${name(e.by)}: ${n} KILL STREAK`, now);
        break;
      }
      case 'flagTaken': // team: whose flag
        if (e.by === ctx.me) banner('objective', 'gold', 'YOU HAVE THE FLAG: TAKE IT HOME', now);
        else if (e.team === ctx.myTeam) banner('objective', 'bad', 'YOUR FLAG HAS BEEN TAKEN', now);
        else banner('objective', 'good', 'ENEMY FLAG TAKEN', now);
        break;
      case 'flagDropped':
        banner('objective', e.team === ctx.myTeam ? 'neutral' : 'bad', e.team === ctx.myTeam ? 'YOUR FLAG HAS BEEN DROPPED' : 'ENEMY FLAG DROPPED', now);
        break;
      case 'flagReturned':
        flagFlash[e.team] = { state: 'returned', until: now + BANNER_SECONDS };
        banner('objective', e.team === ctx.myTeam ? 'good' : 'neutral', e.team === ctx.myTeam ? 'FLAG RETURNED' : 'ENEMY FLAG RETURNED', now);
        break;
      case 'captured': { // team: the side that scored
        const flag = other(e.team);
        if (flag) flagFlash[flag] = { state: 'captured', until: now + BANNER_SECONDS };
        banner('event', sideTone(e.team, ctx), `${name(e.by)} SCORED!`, now);
        break;
      }
      case 'pointCaptured': {
        const before = owners[e.point] || null;
        owners[e.point] = e.team;
        if (!ctx.myTeam) banner('objective', 'neutral', `POINT ${e.point} CAPTURED`, now);
        else if (e.team === ctx.myTeam) banner('objective', 'good', `POINT ${e.point} CAPTURED`, now);
        else banner('objective', 'bad', before === ctx.myTeam ? `POINT ${e.point} LOST` : `ENEMY CAPTURED POINT ${e.point}`, now);
        break;
      }
      case 'roundOver':
        if (e.winner === 'draw' || !e.winner) banner('event', 'neutral', 'ROUND DRAWN', now);
        else {
          const mine = e.winner === ctx.me || (ctx.myTeam && e.winner === ctx.myTeam);
          banner('event', mine ? 'gold' : 'bad', mine ? 'ROUND WON' : 'ROUND LOST', now);
        }
        break;
      case 'round': matchPoint = null; break;
      case 'levelUp': // the class reached a level; every fifth one improves its abilities, 10 and 20 its special
        if (e.id === ctx.me) {
          const what = e.level % 10 === 0 ? 'ABILITIES AND SPECIAL IMPROVE' : e.level % 5 === 0 ? 'ABILITIES IMPROVE' : null;
          banner('event', 'gold', what ? `LEVEL ${e.level}: ${what} AT YOUR NEXT SPAWN` : `LEVEL ${e.level}`, now, what ? BANNER_SECONDS + 1.2 : BANNER_SECONDS);
        }
        break;
      default: break;
    }
  }

  /** The match view, each HUD tick: what changed without an event of its own. */
  function view(v, now, ctx) {
    if (!v) return;
    // the same room plays again: a fresh match, a fresh feed
    if (lastPhase === 'over' && v.phase !== 'over') reset();
    lastPhase = v.phase;
    // the mode's standing order, as the fight starts
    const key = `${v.mode}:${v.round || 1}`;
    if (v.phase === 'live' && hinted !== key) {
      hinted = key;
      const hint = v.mode === 'ctf' ? 'CAPTURE THE ENEMY FLAG' : v.mode === 'control' ? 'HOLD TWO POINTS TO SCORE'
        : v.mode === 'tdm' ? 'ELIMINATE THE ENEMY TEAM' : v.mode === 'football' ? 'SCORE IN THE ENEMY GOAL' : null;
      if (hint && !banners.some((b) => b.slot === 'objective' && b.until > now)) banner('objective', 'neutral', hint, now, 4);
    }
    if (v.controlPoints) {
      for (const p of v.controlPoints) {
        if (p.contested && !contested.has(p.id)) { contested.add(p.id); banner('objective', 'gold', v.controlPoints.length === 1 ? 'CONTESTING POINT' : `POINT ${p.id} CONTESTED`, now); }
        else if (!p.contested) contested.delete(p.id);
      }
      const first = v.controlPoints[0]?.owner || null;
      const all = v.controlPoints.length === 3 && first && v.controlPoints.every((p) => p.owner === first) ? first : null;
      if (all && all !== allThree) banner('event', sideTone(all, ctx), !ctx.myTeam || all === ctx.myTeam ? 'ALL THREE POINTS CONTROLLED' : 'ENEMY CONTROLS ALL THREE POINTS', now);
      allThree = all;
      for (const p of v.controlPoints) owners[p.id] = p.owner || null;
    }
    const point = matchPointOf(v);
    if (point && point !== matchPoint) {
      const mine = point === ctx.me || (ctx.myTeam && point === ctx.myTeam);
      banner('event', mine ? 'gold' : 'bad', point === 'red' || point === 'blue' ? `MATCH POINT: ${upper(point)}` : `MATCH POINT: ${upper(ctx.nameOf?.(point) || '')}`.replace(/: $/, ''), now);
    }
    matchPoint = point;
  }

  return {
    event,
    view,
    reset,
    /** The kill feed's rows still showing, oldest first. */
    kills: (now) => { kills = kills.filter((k) => k.until > now); return kills; },
    /** The banner showing in each slot (or null). */
    banners: (now) => {
      banners = banners.filter((b) => b.until > now);
      return { objective: banners.findLast((b) => b.slot === 'objective') || null, event: banners.findLast((b) => b.slot === 'event') || null };
    },
    /** A flag's state for the indicator: the match's own (home, taken, dropped), or for a moment 'returned' / 'captured'. */
    flagState: (team, state, now) => (flagFlash[team]?.until > now ? flagFlash[team].state : FLAG_STATES[state] || 'home'),
    streakOf: (id) => streaks.get(id) || 0,
  };
}
