// Matches: the five ways to play Duelist Adventure, on top of the arena world. Pure and seeded, so the match
// server (phase 5) runs exactly the rules the browser practises with.
//
//   practice  you and bots; no score, no clock; back on your feet 1.5 s after a fall
//   duel      one on one in rounds (first to 3); a round lasts 90 s, then the better-standing fighter takes it
//   ffa       everyone for themselves; back after 3 s; first to 15 defeats, or the most when 8 minutes end
//   tdm       red against blue; back after 4 s; first team to 30 defeats, or the most at 8 minutes
//   ctf       red against blue with a flag each: carry theirs to your base while yours is home; first to 3
//             captures, or the most at 10 minutes. A carrier who falls, is knocked down or is held in a grip
//             drops the flag; a team mate's touch returns a dropped flag; left alone it goes home in 20 s;
//             carriers cannot sprint.
//
// Seats: every match has a size. Bots fill empty seats and step out when a player takes one (the
// lowest-scoring bot of the team that needs a player); a player who leaves is replaced by a bot.
// Respawned fighters are protected for a moment (it ends early if they attack), so nobody is beaten as
// they arrive.
import { createWorld, addFighter, respawnFighter, removeFighter, step, bodyOf, hostile } from './world.mjs';
import { createBot, think, createRandom } from './bots.mjs';
import { isDown, MOVES } from '../core/index.mjs';
import { awardSpecialCharge, classAtSpawn, requestClassSelection, CLASS_IDS, classById } from '../core/classes.mjs';
import { makeBall, stepFootball } from './football.mjs';
import { CONTROL, makeControlPoints, stepControlPoints, controlPointView } from './control.mjs';

export const TEAMS = Object.freeze(['red', 'blue']);
export const MODES = Object.freeze({
  practice: Object.freeze({ id: 'practice', name: 'Practice', teams: false, seats: 2, arena: 18, respawn: 1.5, protect: 1.5, scoreToWin: 0, clock: 0 }),
  duel: Object.freeze({ id: 'duel', name: 'Duel', teams: false, seats: 2, arena: 14, rounds: 3, roundClock: 90, respawn: 0, protect: 0, scoreToWin: 0, clock: 0 }),
  ffa: Object.freeze({ id: 'ffa', name: 'Free for all', teams: false, seats: 6, arena: 22, respawn: 3, protect: 1.5, scoreToWin: 15, clock: 480 }),
  tdm: Object.freeze({ id: 'tdm', name: 'Team deathmatch', teams: true, seats: 8, arena: 22, respawn: 4, protect: 1.5, scoreToWin: 30, clock: 480 }),
  ctf: Object.freeze({ id: 'ctf', name: 'Capture the flag', teams: true, seats: 8, arena: 26, respawn: 5, protect: 2, scoreToWin: 3, clock: 600, flags: true }),
  football: Object.freeze({ id: 'football', name: 'Football', teams: true, seats: 8, arena: 28, respawn: 3, protect: 1, scoreToWin: 5, clock: 480, football: true }),
  control: Object.freeze({ id: 'control', name: 'Three-Point Control', teams: true, seats: 8, arena: 28, respawn: 4, protect: 1.5, scoreToWin: CONTROL.targetScore, clock: 0, control: true }),
});
export const CTF = Object.freeze({ pickup: 1.3, capture: 2.2, autoReturn: 20, baseInset: 4 });
export const COUNTDOWN = 3;
export const ROUND_BREAK = 2.5;
const BOT_NAMES = ['Kestrel', 'Vael', 'Oren', 'Sable', 'Tamsin', 'Corvin', 'Maren', 'Quill', 'Rhys', 'Ashby', 'Nyra', 'Talon'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * players: [{ id, name, team? }]. seats: the match size (default: the mode's). Returns the match; drive it
 * with stepMatch, seat people with joinMatch / leaveMatch, show it with matchView.
 */
export function createMatch({ mode = 'practice', seed = 1, botLevel = 'duelist', players = [], seats = null, controlLayout = null } = {}) {
  const def = MODES[mode] || MODES.practice;
  const world = createWorld({ arenaRadius: def.arena });
  const match = {
    mode: def.id, def, world, seed, botLevel, random: createRandom(seed * 7919 + 13),
    capacity: Math.max(players.length, seats ?? def.seats),
    phase: 'countdown', phaseUntil: COUNTDOWN, clock: 0,
    round: 1, roundWins: {}, roundClock: 0, roundWinner: null,
    seats: new Map(), order: [], scores: {}, teamScores: { red: 0, blue: 0 },
    flags: def.flags ? makeFlags(def) : null,
    ball: def.football ? makeBall() : null,
    controlPoints: def.control ? makeControlPoints(def.arena, controlLayout) : null,
    feed: [], events: [], winner: null, nextBot: 1,
  };
  for (const p of players) seat(match, { ...p, kind: 'player' });
  while (match.seats.size < match.capacity) seat(match, { kind: 'bot' });
  return match;
}

function makeFlags(def) {
  const z = def.arena - CTF.baseInset;
  const flag = (team, home) => ({ team, home, x: home.x, z: home.z, state: 'home', carrier: null, droppedAt: 0 });
  return { red: flag('red', { x: 0, z: -z }), blue: flag('blue', { x: 0, z }) };
}

function lighterTeam(match) {
  const count = { red: 0, blue: 0 };
  for (const s of match.seats.values()) if (s.team) count[s.team] += 1;
  if (count.red !== count.blue) return count.red < count.blue ? 'red' : 'blue';
  return match.seats.size % 2 === 0 ? 'red' : 'blue';
}

// Where a fighter enters: the duel's two marks, a team's own end, or (everyone for themselves) the point
// on the ring farthest from anyone hostile.
function spawnFor(match, id, team) {
  const { def, world } = match;
  const R = def.arena;
  if (def.id === 'duel') {
    const first = match.order.indexOf(id) % 2 === 0;
    return { x: 0, z: first ? -4 : 4, yaw: first ? 0 : Math.PI };
  }
  if (team) {
    const side = team === 'red' ? -1 : 1;
    const x = (match.random() * 2 - 1) * Math.min(6, R * 0.3);
    const z = side * (R - CTF.baseInset - 1.5 - match.random() * 2);
    return { x, z, yaw: side < 0 ? 0 : Math.PI };
  }
  let best = null;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + match.random() * 0.3;
    const p = { x: Math.sin(a) * R * 0.7, z: Math.cos(a) * R * 0.7 };
    let nearest = Infinity;
    for (const f of world.fighters.values()) {
      if (f.id === id || f.vitals.dead) continue;
      nearest = Math.min(nearest, dist(p, bodyOf(world, f.id)));
    }
    if (!best || nearest > best.nearest) best = { ...p, nearest };
  }
  return { x: best.x, z: best.z, yaw: Math.atan2(-best.x, -best.z) };
}

// classId: a player's class from the start (their choice when they join); bots take the four classes in turn
function seat(match, { id = null, name = null, kind, team = null, classId = null }) {
  const { def } = match;
  const seatTeam = def.teams ? (TEAMS.includes(team) ? team : lighterTeam(match)) : null;
  const n = kind === 'bot' ? match.nextBot++ : 0;
  const seatId = kind === 'bot' ? `bot${n}` : id;
  match.order.push(seatId);
  const bot = kind === 'bot' ? createBot(seatId, { level: match.botLevel, seed: match.seed * 131 + n * 17 }) : null;
  const spot = spawnFor(match, seatId, seatTeam);
  const cls = kind === 'bot' ? CLASS_IDS[(n - 1 + match.seed) % CLASS_IDS.length] : classById(classId) ? classId : null;
  addFighter(match.world, { id: seatId, team: seatTeam, weapon: cls ? classById(cls).weapon : 'sword', classId: cls, ...spot });
  const entry = { id: seatId, name: name || (kind === 'bot' ? BOT_NAMES[(n - 1) % BOT_NAMES.length] : seatId), kind, team: seatTeam, bot, respawnAt: null, classId: cls, pendingClass: null, specialMeter: 0 };
  match.seats.set(seatId, entry);
  match.scores[seatId] = { defeats: 0, falls: 0, captures: 0, returns: 0 };
  return entry;
}

function unseat(match, id) {
  dropFlagOf(match, id, null);
  removeFighter(match.world, id);
  match.seats.delete(id);
  match.order = match.order.filter((x) => x !== id);
  delete match.scores[id];
}

const event = (match, e) => { const full = { ...e, at: match.world.time }; match.events.push(full); if (e.feed !== false) { match.feed.push(full); if (match.feed.length > 12) match.feed.shift(); } };

/**
 * A player joins: a free seat, or a bot's (the lowest-scoring bot on the team with fewer players).
 * Returns { ok, id, team, replaced } or { ok: false, reason: 'full' } when every seat is a player's.
 */
export function joinMatch(match, { id, name = id, team = null, classId = null } = {}) {
  const current = match.seats.get(id);
  if (current) return { ok: true, id, team: current.team, replaced: null };
  if (match.seats.size < match.capacity) {
    const s = seat(match, { id, name, kind: 'player', team, classId });
    protect(match, id);
    event(match, { type: 'joined', id, name });
    return { ok: true, id, team: s.team, replaced: null };
  }
  const bots = [...match.seats.values()].filter((s) => s.kind === 'bot');
  if (!bots.length) return { ok: false, reason: 'full' };
  let pool = bots;
  if (match.def.teams) {
    const humans = { red: 0, blue: 0 };
    for (const s of match.seats.values()) if (s.kind === 'player') humans[s.team] += 1;
    const wanted = TEAMS.includes(team) && bots.some((b) => b.team === team) ? team : (humans.red <= humans.blue ? 'red' : 'blue');
    const onTeam = bots.filter((b) => b.team === wanted);
    if (onTeam.length) pool = onTeam;
  }
  const out = pool.slice().sort((a, b) => (match.scores[a.id].defeats - match.scores[b.id].defeats) || a.id.localeCompare(b.id))[0];
  const seatTeam = out.team;
  unseat(match, out.id);
  match.capacity = Math.max(match.capacity, match.seats.size + 1);
  seat(match, { id, name, kind: 'player', team: seatTeam, classId });
  protect(match, id);
  event(match, { type: 'joined', id, name, replaced: out.id });
  return { ok: true, id, team: seatTeam, replaced: out.id };
}

/** A player leaves; a bot takes the seat so the match keeps its size. */
export function leaveMatch(match, id) {
  const s = match.seats.get(id);
  if (!s || s.kind !== 'player') return false;
  const team = s.team;
  unseat(match, id);
  event(match, { type: 'left', id, name: s.name });
  if (match.phase !== 'over') seat(match, { kind: 'bot', team });
  return true;
}

/**
 * A player whose connection dropped keeps the seat for a while (the match server waits for them to come
 * back); meanwhile a bot plays it. This step's input for that seat.
 */
export function standInInput(match, id) {
  const s = match.seats.get(id);
  const f = match.world.fighters.get(id);
  if (!s || s.kind !== 'player' || !f || f.vitals.dead || match.phase !== 'live') return {};
  if (!s.standIn) s.standIn = createBot(id, { level: match.botLevel, seed: match.seed * 977 + match.order.indexOf(id) * 31 + 5 });
  return think(match.world, s.standIn, { goal: goalFor(match, s) });
}

/** A line in the match's feed from outside the rules (the server: a player lost their connection, or is back). */
export const noteEvent = (match, e) => event(match, e);

/** Server authority must call this using its authenticated player's seat ID.
 * The packet must never supply phase/dead; those come from this match world. */
export function queueMatchClass(match, playerId, requestedClass) {
  const seat = match.seats.get(playerId);
  if (!seat || seat.kind !== 'player') return { accepted: false, reason: 'not-a-player' };
  const fighter = match.world.fighters.get(playerId);
  const choice = requestClassSelection({
    currentClass: seat.classId || 'duelist',
    pendingClass: seat.pendingClass,
    requestedClass,
    phase: match.phase,
    dead: !!fighter?.vitals.dead,
  });
  if (choice.accepted) seat.pendingClass = choice.pendingClass;
  return choice;
}

/** Applied by rules at spawn/round start only, not by an input command. */
function spawnSeat(match, seat, protectSeconds = 0) {
  const old = match.world.fighters.get(seat.id);
  const chosen = seat.pendingClass ? classAtSpawn({ currentClass: seat.classId || 'duelist', pendingClass: seat.pendingClass }) : null;
  const weapon = chosen?.weapon ?? old?.weapon ?? 'sword';
  respawnFighter(match.world, seat.id, {
    ...spawnFor(match, seat.id, seat.team), protect: protectSeconds, weapon, ...(chosen ? { classId: chosen.classId } : {}),
  });
  if (chosen) {
    // Charge is earned for the active class; switching classes cannot bank
    // an old class's special for a different kit. Same-class respawns retain it.
    if (seat.classId !== chosen.classId) seat.specialMeter = 0;
    seat.classId = chosen.classId;
    seat.pendingClass = null;
    event(match, { type: 'classSelected', id: seat.id, classId: chosen.classId, feed: false });
  }
}

function protect(match, id) {
  const f = match.world.fighters.get(id);
  if (f && match.def.protect) f.protectedUntil = match.world.time + match.def.protect;
}

const carrying = (match, id) => !!match.flags && TEAMS.some((t) => match.flags[t].carrier === id);

function dropFlagOf(match, id, at) {
  if (!match.flags) return;
  for (const t of TEAMS) {
    const flag = match.flags[t];
    if (flag.carrier !== id) continue;
    flag.carrier = null;
    if (at) { flag.state = 'dropped'; flag.x = at.x; flag.z = at.z; flag.droppedAt = match.world.time; event(match, { type: 'flagDropped', team: t, by: id }); }
    else { goHome(flag); }
  }
}

function goHome(flag) { flag.state = 'home'; flag.carrier = null; flag.x = flag.home.x; flag.z = flag.home.z; }

// What a bot is after besides the nearest fight: the objective of the mode.
function goalFor(match, s) {
  if (match.controlPoints && s.team) {
    // Send bots to the objectives which their team does not yet own.
    // Stable assignment spreads teammates over the three points.
    const pending = match.controlPoints.filter(point => point.owner !== s.team);
    const candidates = pending.length ? pending : match.controlPoints;
    const index = Math.max(0, match.order.indexOf(s.id));
    const target = candidates[index % candidates.length];
    return { x: target.x, z: target.z, urgent: true };
  }
  if (match.ball && s.team) return { x: match.ball.x, z: match.ball.z, urgent: true };
  if (!match.flags || !s.team) return null;
  const { world } = match;
  const me = bodyOf(world, s.id);
  const own = match.flags[s.team];
  const theirs = match.flags[s.team === 'red' ? 'blue' : 'red'];
  if (theirs.carrier === s.id) return { x: own.home.x, z: own.home.z, urgent: true }; // run it home
  if (own.state === 'dropped') return { x: own.x, z: own.z, urgent: true }; // return ours
  if (own.carrier) { const c = bodyOf(world, own.carrier); if (c) return { x: c.x, z: c.z, urgent: true, hunt: own.carrier }; } // chase the thief
  // half the team goes for their flag, the rest guards ours (stable per bot)
  const attacker = (Number(s.id.replace(/\D/g, '')) || 0) % 2 === 0;
  if (attacker || theirs.state !== 'home') {
    if (theirs.carrier) { const c = bodyOf(world, theirs.carrier); if (c) return { x: c.x, z: c.z }; } // escort our carrier
    return { x: theirs.x, z: theirs.z };
  }
  const guard = { x: own.home.x + Math.sin(world.time * 0.3 + me.x) * 3, z: own.home.z + (s.team === 'red' ? 4 : -4) };
  return guard;
}

/**
 * One step. inputs: { [playerId]: input } (bots think for themselves). Returns { effects, events }: the
 * world's effects (hits, knockbacks...) and the match's own events (defeat, flagTaken, captured, round,
 * over...).
 */
export function stepMatch(match, dt, inputs = {}) {
  match.events = [];
  const { world } = match;
  if (match.phase !== 'live') {
    // nobody fights during a countdown or between rounds; bodies still settle and recover
    const effects = step(world, dt, {});
    if (match.phase !== 'over' && world.time >= match.phaseUntil) {
      if (match.phase === 'roundOver') nextRound(match);
      else {
        // On initial countdown, apply queued class selections before any attacks.
        for (const seat of match.seats.values()) if (seat.pendingClass) spawnSeat(match, seat, match.def.protect);
        match.phase = 'live';
        event(match, { type: 'fight', round: match.round, feed: false });
      }
    }
    return { effects, events: match.events };
  }
  match.clock += dt;
  match.roundClock += dt;
  const all = {};
  for (const s of match.seats.values()) {
    const f = world.fighters.get(s.id);
    if (!f || f.vitals.dead) continue;
    // a bot thinks for itself unless the caller drives it (a test, a replay)
    let input = s.kind === 'player' ? inputs[s.id] || {} : inputs[s.id] || think(world, s.bot, { goal: goalFor(match, s) });
    if (match.ball) {
      // No attacks or damage in Football. Bots chase the ball using ordinary
      // movement inputs; humans can dribble or press interact (F) to kick.
      if (s.kind === 'bot' && !inputs[s.id]) {
        const me = bodyOf(world, s.id);
        const dx = match.ball.x - me.x;
        const dz = match.ball.z - me.z;
        const length = Math.hypot(dx, dz) || 1;
        input = { move: { x: dx / length, z: dz / length }, face: Math.atan2(dx, dz), run: true,
          sprint: length > 5, interact: length < 2.2, presses: [] };
      } else {
        input = { ...input, presses: (input.presses || []).filter(cmd => cmd === 'roll' || cmd === 'dash') };
      }
    }
    if (carrying(match, s.id)) input = { ...input, sprint: false };
    all[s.id] = input;
  }
  // the seats' meters reach their fighters (a special asks the fighter's copy); what one spent comes back below
  for (const s of match.seats.values()) {
    const f = world.fighters.get(s.id);
    if (f) f.meter = s.classId ? s.specialMeter : 0;
  }
  const effects = step(world, dt, all);
  chargeSpecials(match, effects);
  if (match.ball) stepFootball(match, dt, all);
  for (const e of effects) if (e.type === 'defeat') onDefeat(match, e);
  if (match.phase === 'live') {
    respawns(match);
    if (match.flags) flagsStep(match);
    if (match.controlPoints) stepControlPoints(match, dt);
    checkEnd(match);
  }
  return { effects, events: match.events };
}

// The seats' special meters, server-side: what a special spent, and what a player's landed hits and heals on allies
// earned (a grip's crush ticks and the specials themselves earn nothing; bots never charge).
function chargeSpecials(match, effects) {
  const award = (s, kind) => { s.specialMeter = awardSpecialCharge(s.specialMeter, kind) ?? s.specialMeter; };
  for (const e of effects) {
    if (e.type === 'special') {
      const s = match.seats.get(e.by);
      if (s) s.specialMeter = Math.max(0, s.specialMeter - e.cost);
      continue;
    }
    const by = e.type === 'impact' ? e.attacker : e.type === 'heal' ? e.by : null;
    const s = by ? match.seats.get(by) : null;
    if (!s || s.kind !== 'player' || !s.classId) continue;
    if (e.type === 'impact' && (e.outcome === 'hit' || e.outcome === 'guardBreak') && e.move !== 'grip' && !MOVES[e.move]?.special) award(s, 'landedHit');
    else if (e.type === 'heal' && e.target !== e.by) award(s, 'allyHeal');
  }
}

function onDefeat(match, e) {
  const { world, def } = match;
  const who = match.seats.get(e.defender);
  if (!who) return;
  const by = match.seats.get(e.by);
  match.scores[who.id].falls += 1;
  const counted = by && by.id !== who.id && hostile(world, world.fighters.get(by.id) || {}, world.fighters.get(who.id) || {});
  if (counted) {
    match.scores[by.id].defeats += 1;
    // Only the authoritative world defeat event can grant elimination charge.
    // A client press, score display or unverified hit claim never awards meter.
    if (by.kind === 'player' && by.classId) {
      by.specialMeter = awardSpecialCharge(by.specialMeter, 'elimination') ?? by.specialMeter;
    }
    if (def.id === 'tdm' && by.team) match.teamScores[by.team] += 1;
  }
  dropFlagOf(match, who.id, bodyOf(world, who.id));
  event(match, { type: 'defeat', by: counted ? by.id : null, who: who.id });
  if (def.id === 'duel') {
    const winner = counted ? by.id : match.order.find((id) => id !== who.id);
    endRound(match, winner);
  } else if (def.respawn) who.respawnAt = world.time + def.respawn;
}

function respawns(match) {
  const { world, def } = match;
  for (const s of match.seats.values()) {
    if (s.respawnAt === null || world.time < s.respawnAt) continue;
    s.respawnAt = null;
    spawnSeat(match, s, def.protect);
    if (s.bot) s.bot.combo = 0;
    event(match, { type: 'respawn', id: s.id, feed: false });
  }
}

function flagsStep(match) {
  const { world } = match;
  const now = world.time;
  for (const team of TEAMS) {
    const flag = match.flags[team];
    if (flag.carrier) {
      const f = world.fighters.get(flag.carrier);
      const b = bodyOf(world, flag.carrier);
      if (!f || f.vitals.dead || isDown(f, now) || f.heldBy) { dropFlagOf(match, flag.carrier, b || flag.home); continue; }
      flag.x = b.x;
      flag.z = b.z;
      const own = match.flags[f.team];
      if (own.state === 'home' && dist(b, own.home) < CTF.capture) {
        match.teamScores[f.team] += 1;
        match.scores[f.id].captures += 1;
        // Award only for a server-confirmed enemy flag capture, never for
        // client-provided interaction, proximity, or a claimed objective.
        const capturingSeat = match.seats.get(f.id);
        if (capturingSeat?.kind === 'player' && capturingSeat.classId) {
          capturingSeat.specialMeter = awardSpecialCharge(capturingSeat.specialMeter, 'objective') ?? capturingSeat.specialMeter;
        }
        goHome(flag);
        event(match, { type: 'captured', team: f.team, by: f.id });
      }
      continue;
    }
    if (flag.state === 'dropped' && now - flag.droppedAt > CTF.autoReturn) { goHome(flag); event(match, { type: 'flagReturned', team, by: null }); continue; }
    for (const f of world.fighters.values()) {
      if (f.vitals.dead || isDown(f, now) || f.heldBy || !f.team) continue;
      const b = bodyOf(world, f.id);
      if (dist(b, flag) > CTF.pickup) continue;
      if (f.team !== team && !carrying(match, f.id)) {
        flag.state = 'carried';
        flag.carrier = f.id;
        f.protectedUntil = -Infinity; // a thief is fair game
        event(match, { type: 'flagTaken', team, by: f.id });
        break;
      }
      if (f.team === team && flag.state === 'dropped') {
        goHome(flag);
        match.scores[f.id].returns += 1;
        event(match, { type: 'flagReturned', team, by: f.id });
        break;
      }
    }
  }
}

function standing(f) {
  if (!f || f.vitals.dead) return -1;
  const v = f.vitals;
  return v.hp + v.will * 0.5 + v.shield * 0.3;
}

function endRound(match, winner) {
  match.phase = 'roundOver';
  match.phaseUntil = match.world.time + ROUND_BREAK;
  match.roundWinner = winner;
  if (winner) match.roundWins[winner] = (match.roundWins[winner] || 0) + 1;
  event(match, { type: 'roundOver', round: match.round, winner });
  if (winner && match.roundWins[winner] >= match.def.rounds) finish(match, winner);
}

function nextRound(match) {
  const { world } = match;
  match.round += 1;
  match.roundClock = 0;
  match.roundWinner = null;
  world.projectiles.length = 0;
  for (const s of match.seats.values()) spawnSeat(match, s);
  match.phase = 'countdown';
  match.phaseUntil = world.time + 2;
  event(match, { type: 'round', round: match.round, feed: false });
}

function checkEnd(match) {
  const { def } = match;
  if (def.id === 'duel') {
    if (match.roundClock >= def.roundClock) {
      // time: the fighter standing better takes the round (a dead heat replays it)
      const [a, b] = match.order.map((id) => match.world.fighters.get(id));
      const sa = standing(a);
      const sb = standing(b);
      endRound(match, Math.abs(sa - sb) < 1 ? null : sa > sb ? a.id : b.id);
    }
    return;
  }
  if (def.id === 'practice') return;
  if (def.teams) {
    const top = TEAMS.find((t) => match.teamScores[t] >= def.scoreToWin);
    if (top) { finish(match, top); return; }
    if (def.clock && match.clock >= def.clock) {
      const { red, blue } = match.teamScores;
      finish(match, red === blue ? 'draw' : red > blue ? 'red' : 'blue');
    }
    return;
  }
  const leader = Object.entries(match.scores).sort((p, q) => q[1].defeats - p[1].defeats)[0];
  if (leader && leader[1].defeats >= def.scoreToWin) { finish(match, leader[0]); return; }
  if (def.clock && match.clock >= def.clock) {
    const tied = Object.values(match.scores).filter((s) => s.defeats === leader[1].defeats).length > 1;
    finish(match, tied ? 'draw' : leader[0]);
  }
}

function finish(match, winner) {
  match.phase = 'over';
  match.winner = winner;
  event(match, { type: 'over', winner });
}

/** Everything a HUD needs, in plain data. */
export function matchView(match, forId = null) {
  const { def, world } = match;
  const people = [...match.seats.values()].map((s) => ({
    id: s.id, name: s.name, kind: s.kind, team: s.team, classId: s.classId, ...match.scores[s.id],
    dead: !!world.fighters.get(s.id)?.vitals.dead, respawnIn: s.respawnAt === null ? 0 : Math.max(0, s.respawnAt - world.time),
    roundWins: match.roundWins[s.id] || 0,
  }));
  people.sort((a, b) => (b.defeats - a.defeats) || (b.captures - a.captures) || (a.falls - b.falls));
  return {
    mode: def.id, name: def.name, phase: match.phase, winner: match.winner,
    countdown: match.phase === 'countdown' || match.phase === 'roundOver' ? Math.max(0, match.phaseUntil - world.time) : 0,
    clockLeft: def.clock ? Math.max(0, def.clock - match.clock) : def.roundClock ? Math.max(0, def.roundClock - match.roundClock) : null,
    round: match.round, rounds: def.rounds || null, roundWinner: match.roundWinner,
    scoreToWin: def.scoreToWin || null, teamScores: { ...match.teamScores },
    flags: match.flags ? Object.fromEntries(TEAMS.map((t) => [t, { state: match.flags[t].state, carrier: match.flags[t].carrier }])) : null,
    ball: match.ball ? { x: match.ball.x, z: match.ball.z } : null,
    controlPoints: controlPointView(match.controlPoints),
    zones: world.zones.map((z) => ({ id: z.id, kind: z.kind, team: z.team, owner: z.owner, x: z.x, z: z.z, radius: z.radius, until: z.until })),
    people, me: forId && match.seats.has(forId) ? { ...people.find((p) => p.id === forId), pendingClass: match.seats.get(forId).pendingClass,
      specialMeter: match.seats.get(forId).classId ? match.seats.get(forId).specialMeter : null } : null,
    feed: match.feed.slice(-5),
  };
}
