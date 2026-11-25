// A match played in the browser (practice, or any mode against bots) as a "source" for the game view: the
// same shape as an online match (net/client.mjs createOnlineSource), so one renderer draws both.
import { createMatch, stepMatch, matchView, queueMatchClass, purchaseMatchItem, MODES } from '../sim/match.mjs';
import { BODY_IDS } from '../net/protocol.mjs';

const STEP = 1 / 60;

// classId: the class the player fights as (core/classes.mjs); chooseClass changes it for the next spawn.
// progress: the player's EXP per class from this browser (client/prefs.mjs): offline, the browser keeps the levels
export function createLocalSource({ mode = 'practice', botLevel = 'duelist', bots = 1, testMode = false, testBots = false, seed = 1, youBody = BODY_IDS[0], foeBody = BODY_IDS[1], classId = null, progress = null } = {}) {
  const def = MODES[mode] || MODES.practice;
  const match = createMatch({ mode: def.id, seed, botLevel, players: [{ id: 'you', name: 'You', classId, progress }], testMode, seats: testMode ? (testBots ? def.seats : 1) : def.id === 'practice' ? 1 + bots : null });
  let classAnswer = null;
  let shopAnswer = null;
  // bodies: yours; the duel or practice opponent's; everyone else in turn from the rest
  const others = BODY_IDS.filter((b) => b !== youBody);
  let k = 0;
  const seats = [...match.seats.values()].map((s) => {
    let body;
    if (s.id === 'you') body = youBody;
    else if ((def.id === 'duel' || def.id === 'practice') && k === 0) { body = foeBody; k += 1; }
    else { body = others[k % others.length]; k += 1; }
    return { id: s.id, name: s.name, team: s.team, kind: s.kind, body };
  });
  let accumulator = 0;
  return {
    match,
    world: match.world,
    meId: 'you',
    mode: def.id,
    status: 'ready',
    seatsVersion: 1,
    seats: () => seats,
    get classAnswer() { return classAnswer; },
    get shopAnswer() { return shopAnswer; },
    buyItem(id, tier, combine = false) { shopAnswer = purchaseMatchItem(match, 'you', id, tier, combine); },
    /** Change class: queued for the next spawn (before the fight, between rounds or while down). */
    chooseClass(id) {
      const res = queueMatchClass(match, 'you', id);
      classAnswer = { ok: res.accepted, pending: res.pendingClass ?? null, reason: res.reason ?? null };
    },
    view: () => matchView(match, 'you'),
    flags: () => match.flags,
    ball: () => match.ball,
    escortDistance: () => match.escort?.distance,
    /** Fixed 60 Hz steps; readInput() gives the player's input (presses only count on the first step). */
    step(dt, readInput) {
      accumulator += dt;
      const out = { effects: [], events: [] };
      let first = true;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        const input = readInput();
        if (!first) input.presses = [];
        first = false;
        const r = stepMatch(match, STEP, { you: input });
        if (r.effects.length) out.effects.push(...r.effects);
        if (r.events.length) out.events.push(...r.events);
      }
      return out;
    },
    leave() {},
    dispose() {},
  };
}
