// Duelist Adventure's announcer: the judge (owner, 2026-11-22: "It would judge and see a critical moment in the battle,
// or somebody's close to death, and an announcer would speak. Also, when victory is achieved, it should be a person
// saying victory ... not computer-like").
//
// It watches the match (its events, and the fight itself each frame) and decides what is worth saying and when:
// the start, first blood, kills in quick succession and in a row, a streak ended, payback, an execution, the player
// one hit from defeat, both fighters on the edge, an enemy one hit from defeat, a close call, a clutch, a comeback,
// match point, the clock, and how a round and the match end. Each moment is weighed: the weightier line wins a moment,
// a line that could not be said in time is let go, no line comes back too soon, it never talks over itself, and the
// end of a round or the match cuts in. Rules, not a model: it decides at once, offline, and the same way every time.
// Pure (no sound, no page); client/announcer.mjs says what it picks, in voices recorded with ElevenLabs
// (tools/duelist/record-announcer.mjs).

// The voices (ElevenLabs premade voices no one else in the game speaks with).
export const ANNOUNCER_VOICES = Object.freeze({
  alice: Object.freeze({ name: 'Alice', voiceId: 'Xb7hH8MSUJpSbSDYk0k2' }), // a clear, calm woman (British)
  daniel: Object.freeze({ name: 'Daniel', voiceId: 'onwK4e9ZLuTAKqWW03F9' }), // a steady broadcaster (British)
});
export const DEFAULT_ANNOUNCER = 'alice';

// The lines: what is said, and how many takes are recorded (one is picked each time).
export const ANNOUNCER_LINES = Object.freeze({
  roundOne: { say: 'Round one.' }, roundTwo: { say: 'Round two.' }, roundThree: { say: 'Round three.' }, roundFour: { say: 'Round four.' },
  finalRound: { say: 'Final round.' },
  fight: { say: 'Fight.' },
  firstBlood: { say: 'First blood.' },
  doubleKill: { say: 'Double kill.' }, tripleKill: { say: 'Triple kill.' }, multiKill: { say: 'Multi kill.' },
  streak3: { say: 'Three in a row.' }, streak5: { say: 'Five in a row.' }, streak8: { say: 'Untouchable.' },
  shutdown: { say: 'Streak ended.' },
  payback: { say: 'Payback.' },
  executed: { say: 'Executed.' },
  nearDeath: { say: 'One hit from defeat.' },
  foeNearDeath: { say: 'One more hit.' },
  bothLow: { say: "Anyone's fight." },
  closeCall: { say: 'Close call.' },
  clutch: { say: 'Clutch.' },
  comeback: { say: 'The tide turns.' },
  matchPoint: { say: 'Match point.' },
  thirtySeconds: { say: 'Thirty seconds.' },
  tenSeconds: { say: 'Ten seconds.' },
  roundWon: { say: 'Round won.' }, roundLost: { say: 'Round lost.' }, roundDraw: { say: 'Round drawn.' },
  victory: { say: 'Victory.', takes: 2 },
  defeat: { say: 'Defeat.', takes: 2 },
  draw: { say: 'Draw.' },
});

// [how much it matters (the weightier line wins a moment; 90 and over cut in on a line being said), how soon it may
// come back (seconds)]
export const LINE_RULES = Object.freeze({
  victory: [100, 0], defeat: [100, 0], draw: [100, 0],
  roundWon: [92, 0], roundLost: [92, 0], roundDraw: [92, 0],
  finalRound: [87, 0], roundOne: [86, 0], roundTwo: [86, 0], roundThree: [86, 0], roundFour: [86, 0], fight: [85, 0],
  clutch: [74, 20], multiKill: [72, 6], executed: [70, 8], tripleKill: [69, 6], bothLow: [67, 30], doubleKill: [66, 6],
  matchPoint: [64, 0], streak8: [63, 30], nearDeath: [62, 25], shutdown: [61, 10], comeback: [60, 90], streak5: [59, 30],
  tenSeconds: [58, 0], closeCall: [57, 30], streak3: [55, 30], thirtySeconds: [53, 0], firstBlood: [52, 0], payback: [50, 20],
  foeNearDeath: [46, 20],
});
// lines that stand for the same moment: a weightier one replaces a lighter one still waiting
const GROUPS = [
  ['doubleKill', 'tripleKill', 'multiKill'], ['streak3', 'streak5', 'streak8'], ['nearDeath', 'bothLow', 'foeNearDeath'],
  ['closeCall', 'clutch'], ['roundWon', 'roundLost', 'roundDraw', 'victory', 'defeat', 'draw'],
];
const GROUP_OF = Object.fromEntries(GROUPS.flatMap((g, i) => g.map((id) => [id, i])));
export const TUNING = Object.freeze({
  wait: 2.5, // seconds a line may wait to be said before it is let go (the end of a round or the match: 10)
  gap: 0.35, // seconds of quiet after a line
  multiWindow: 4.5, // seconds between kills that still count as one run (double, triple ...)
  low: 0.2, // a share of health that is one hit from defeat
  bothLow: 0.3, // both fighters at or under this: anyone's fight
  close: 0.12, // as low as a close call goes ...
  recovered: 0.35, // ... and back up to here
  clutch: 0.15, // a kill made at or under this: clutch
  near: 10, // metres: an enemy this close counts as in the fight
});
const ROUND_LINES = [null, 'roundOne', 'roundTwo', 'roundThree', 'roundFour'];

const ratioOf = (f) => (f && !f.dead ? f.hp / Math.max(1, f.max || 100) : 0);
const hostileTo = (a, b) => (a.team && b.team ? a.team !== b.team : a.id !== b.id);

/**
 * me(): the player's fighter id. Feed it the match's events (event), the world's effects (effect) and, each frame,
 * what it can see (frame); next() says what to say now, and said() is told when the line will end.
 */
export function createJudge({ me }) {
  const myId = typeof me === 'function' ? me : () => me;
  let queue = []; // { line, priority, at, wait }
  const lastSaid = new Map(); // line -> when it was said
  const once = new Set(); // keys of things said once (a match point per side, the clock per round ...)
  let quietUntil = -Infinity;
  let speaking = 0; // the priority of the line being said
  let kills = new Map(); // id -> the times of its kills in the current run
  let streaks = new Map(); // id -> kills since it last fell
  let killedMeLast = null;
  let firstBlood = false;
  let life = { nearDeath: false, low: 1, close: false };
  let lastClock = null;
  let lastRound = null;
  let worstDeficit = 0;
  let foesLow = new Set(); // enemies called one hit from defeat (until they fall)
  let lastObs = null;

  function propose(line, now, wait = TUNING.wait) {
    const rule = LINE_RULES[line];
    if (!rule) return false;
    const [priority, cooldown] = rule;
    const before = lastSaid.get(line);
    if (cooldown > 0 && before != null && now - before < cooldown) return false;
    if (queue.some((c) => c.line === line)) return false;
    const group = GROUP_OF[line];
    if (group != null) {
      if (queue.some((c) => GROUP_OF[c.line] === group && c.priority >= priority)) return false;
      queue = queue.filter((c) => GROUP_OF[c.line] !== group);
    }
    queue.push({ line, priority, at: now, wait });
    return true;
  }
  const sayOnce = (key, line, now, wait) => { if (once.has(key)) return false; const ok = propose(line, now, wait); if (ok) once.add(key); return ok; };
  const mine = (view) => view?.people?.find((p) => p.id === myId()) || null;
  const won = (winner, view) => !!winner && (winner === myId() || (mine(view)?.team && winner === mine(view).team));

  function onDefeat(e, view, now) {
    const me = myId();
    const { by, who } = e;
    if (by && by !== who && !firstBlood && view?.mode !== 'practice') { firstBlood = true; propose('firstBlood', now); }
    firstBlood = firstBlood || !!by;
    const victimStreak = streaks.get(who) || 0;
    streaks.set(who, 0);
    kills.delete(who);
    foesLow.delete(who);
    if (by && by !== who) {
      const run = (kills.get(by) || []).filter((t) => now - t <= TUNING.multiWindow);
      run.push(now);
      kills.set(by, run);
      streaks.set(by, (streaks.get(by) || 0) + 1);
    }
    if (by === me && who !== me) {
      const run = kills.get(me).length;
      if (run >= 4) propose('multiKill', now); else if (run === 3) propose('tripleKill', now); else if (run === 2) propose('doubleKill', now);
      const streak = streaks.get(me);
      if (streak === 8) propose('streak8', now); else if (streak === 5) propose('streak5', now); else if (streak === 3) propose('streak3', now);
      if (victimStreak >= 3) propose('shutdown', now);
      if (killedMeLast === who) { propose('payback', now); killedMeLast = null; }
      const self = lastObs?.fighters?.find((f) => f.id === me);
      if (self && !self.dead && ratioOf(self) <= TUNING.clutch) { propose('clutch', now); life.close = true; }
    } else if (who === me) {
      killedMeLast = by && by !== me ? by : killedMeLast;
      life = { nearDeath: false, low: 1, close: false };
    } else if (lastObs) {
      // someone else took down the enemy that had me on the edge: a close call
      const self = lastObs.fighters?.find((f) => f.id === me);
      const victim = lastObs.fighters?.find((f) => f.id === who);
      if (self && victim && !self.dead && hostileTo(self, victim) && ratioOf(self) <= TUNING.clutch &&
          Math.hypot(victim.x - self.x, victim.z - self.z) <= TUNING.near && !life.close) {
        life.close = propose('closeCall', now);
      }
    }
  }

  return {
    /** A match event: defeat, fight, round, roundOver, over. */
    event(e, view, now) {
      if (!e) return;
      if (e.type === 'defeat') onDefeat(e, view, now);
      else if (e.type === 'fight') propose('fight', now);
      else if (e.type === 'round') {
        // a new round of a duel: which one it is, or the last if either side can take the match with it
        const people = view?.people || [];
        const need = (view?.rounds || 0) - 1;
        const atPoint = need > 0 ? people.filter((p) => p.roundWins >= need).length : 0;
        if (atPoint >= 2) propose('finalRound', now);
        else {
          if (ROUND_LINES[e.round]) propose(ROUND_LINES[e.round], now);
          if (atPoint === 1) propose('matchPoint', now);
        }
        lastRound = e.round;
      } else if (e.type === 'roundOver') {
        queue = queue.filter((c) => c.priority >= 85);
        propose(e.winner == null ? 'roundDraw' : won(e.winner, view) ? 'roundWon' : 'roundLost', now, 10);
      } else if (e.type === 'over') {
        queue = [];
        propose(e.winner === 'draw' ? 'draw' : won(e.winner, view) ? 'victory' : 'defeat', now, 10);
      }
    },
    /** A world effect: an execution. */
    effect(e, now) {
      if ((e?.type === 'execution' || e?.type === 'shadowExecution') && e.attacker === myId()) propose('executed', now);
    },
    /**
     * Each frame: obs = { view (the match view), fighters: [{ id, team, hp, max, dead, x, z }] }. Judges the moments
     * no event marks: health, the clock, match point, a comeback.
     */
    frame(now, obs) {
      lastObs = obs;
      const view = obs?.view;
      const me = myId();
      if (view?.mode === 'duel' && view.phase === 'countdown' && view.round === 1 && lastRound == null) { lastRound = 1; propose('roundOne', now); }
      if (view && view.phase !== 'live') return;
      const fighters = obs?.fighters || [];
      const self = fighters.find((f) => f.id === me);
      if (self && !self.dead) {
        const mineNow = ratioOf(self);
        life.low = Math.min(life.low, mineNow);
        const foes = fighters.filter((f) => !f.dead && f.id !== me && hostileTo(self, f))
          .map((f) => ({ f, d: Math.hypot(f.x - self.x, f.z - self.z) })).sort((a, b) => a.d - b.d);
        const near = foes[0] && foes[0].d <= TUNING.near ? foes[0] : null;
        const theirs = near ? ratioOf(near.f) : 1;
        if (near && mineNow <= TUNING.bothLow && theirs <= TUNING.bothLow) propose('bothLow', now);
        else if (near && mineNow <= TUNING.low && !life.nearDeath) life.nearDeath = propose('nearDeath', now);
        else if (near && near.d <= 8 && theirs <= TUNING.low && mineNow > TUNING.bothLow && !foesLow.has(near.f.id)) {
          if (propose('foeNearDeath', now)) foesLow.add(near.f.id);
        }
        // back from the edge
        if (!life.close && life.low <= TUNING.close && mineNow >= TUNING.recovered) life.close = propose('closeCall', now);
      }
      if (!view) return;
      // the clock
      const left = view.clockLeft;
      if (left != null && lastClock != null) {
        const key = `${view.round || 0}`;
        if (lastClock > 30 && left <= 30 && (view.mode !== 'duel')) sayOnce(`30:${key}`, 'thirtySeconds', now);
        if (lastClock > 10 && left <= 10) sayOnce(`10:${key}`, 'tenSeconds', now);
      }
      lastClock = left;
      // match point: one away from winning (a point-scoring mode: nine tenths of the way)
      const goal = view.scoreToWin;
      if (goal > 1) {
        const near = view.mode === 'control' ? goal * 0.9 : goal - 1;
        const sides = view.teamScores && Object.keys(view.teamScores).length && view.people?.some((p) => p.team)
          ? Object.entries(view.teamScores) : (view.people || []).map((p) => [p.id, p.defeats || 0]);
        for (const [side, score] of sides) if (score >= near && score < goal) sayOnce(`point:${side}`, 'matchPoint', now);
        // a comeback: from well behind to ahead
        const team = mine(view)?.team;
        if (team && view.teamScores) {
          const ours = view.teamScores[team] || 0;
          const theirs = Math.max(0, ...Object.entries(view.teamScores).filter(([t]) => t !== team).map(([, s]) => s));
          worstDeficit = Math.max(worstDeficit, theirs - ours);
          if (worstDeficit >= Math.max(3, goal * 0.15) && ours > theirs) sayOnce('comeback', 'comeback', now);
        }
      }
    },
    /** What to say now (null: nothing): { line, cut } (cut: stop the line being said first). */
    next(now) {
      queue = queue.filter((c) => now - c.at <= c.wait);
      if (!queue.length) return null;
      queue.sort((a, b) => (b.priority - a.priority) || (a.at - b.at));
      const top = queue[0];
      const busy = now < quietUntil;
      const cut = busy && top.priority >= 90 && top.priority > speaking;
      if (busy && !cut) return null;
      queue.shift();
      return { line: top.line, cut };
    },
    /** The line picked is being said and lasts `seconds`. */
    said(line, now, seconds = 0) {
      lastSaid.set(line, now);
      quietUntil = now + seconds + TUNING.gap;
      speaking = LINE_RULES[line]?.[0] ?? 0;
    },
    reset() {
      queue = []; lastSaid.clear(); once.clear(); quietUntil = -Infinity; speaking = 0;
      kills = new Map(); streaks = new Map(); killedMeLast = null; firstBlood = false;
      life = { nearDeath: false, low: 1, close: false }; lastClock = null; lastRound = null; worstDeficit = 0;
      foesLow = new Set(); lastObs = null;
    },
    get waiting() { return queue.map((c) => c.line); },
  };
}
