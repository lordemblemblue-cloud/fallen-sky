import { ctfSpawn, ctfSupport, ctfSafe, ctfZone, ctfRestricted, ctfEmbedded, ctfRecovery, ctfRay } from './importedCtfLayout.mjs';
import { escortSpawn, escortEnemyZone, escortEmbedded, escortSupport, escortBlockers, escortRecoverySpot } from './importedEscortLayout.mjs';
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
import { isDown, MOVES, SHOP_RULES, purchaseRule, equipItems, shopItem, tierPrice } from '../core/index.mjs';
import { recordKill, resetKillChain } from '../core/killAnnouncements.mjs';
import { awardSpecialCharge, classAtSpawn, requestClassSelection, CLASS_IDS, classById } from '../core/classes.mjs';
import { cleanPracticeSettings, validPracticeOption } from '../core/practiceSettings.mjs';
import { settleSpecialSpend } from './specialMeterSettlement.mjs';
import { levelFromXp, xpForEvent, cleanProgress, XP_CAP, boostAt, XP } from '../core/progression.mjs';
import { makeBall, stepFootball } from './football.mjs';
import { CONTROL, makeControlPoints, stepControlPoints, controlPointView } from './control.mjs';

import { makeEscort, stepEscort, ESCORT_RADIUS, defenderRespawnDelay } from './escort.mjs';
import { importedSpawn } from './importedControlLayout.mjs';
import { getModeArenaLayout, arenaLineClear } from './modeArenaLayout.mjs';
import {createConduitLiveMatch,conduitPickupDefinitions} from './conduitLiveLayout.mjs';

export const TEAMS = Object.freeze(['red', 'blue']);
export const MODES = Object.freeze({
  practice: Object.freeze({ id: 'practice', name: 'Practice', teams: false, seats: 2, arena: 18, respawn: 1.5, protect: 1.5, scoreToWin: 0, clock: 0 }),
  duel: Object.freeze({ id: 'duel', name: 'Duel', teams: false, seats: 2, arena: 14, rounds: 3, roundClock: 90, respawn: 0, protect: 0, scoreToWin: 0, clock: 0 }),
  ffa: Object.freeze({ id: 'ffa', name: 'Free for all', teams: false, seats: 6, arena: 44.8, respawn: 3, protect: 1.5, scoreToWin: 15, clock: 480 }),
  tdm: Object.freeze({ id: 'tdm', name: 'Team deathmatch', teams: true, seats: 8, arena: 44.8, respawn: 4, protect: 1.5, scoreToWin: 30, clock: 480 }),
  ctf: Object.freeze({ id: 'ctf', name: 'Capture the flag', teams: true, seats: 8, arena: 60, respawn: 5, protect: 2, scoreToWin: 3, clock: 600, flags: true }),
  escort: Object.freeze({ id: 'escort', name: 'Escort Transport', teams: true, seats: 10, arena: 215, respawn: 4, protect: 1.5, clock: 300 }),
  football: Object.freeze({ id: 'football', name: 'Football', teams: true, seats: 8, arena: 28, respawn: 3, protect: 1, scoreToWin: 5, clock: 480, football: true }),
  control: Object.freeze({ id: 'control', name: 'Control Point', teams: true, seats: 8, arena: 150, respawn: 4, protect: 1.5, scoreToWin: CONTROL.targetScore, clock: 0, control: true }),
});
export const CTF = Object.freeze({ pickup: 1.3, capture: 2.2, autoReturn: 20, baseInset: 4 });
export const COUNTDOWN = 3;
export const ESCORT_PREPARATION_SECONDS=30;
export const ESCORT_START_COUNTDOWN=5;
export function matchCountdownSeconds(mode){return (mode==='escort'||mode==='ctf')?ESCORT_PREPARATION_SECONDS+ESCORT_START_COUNTDOWN:COUNTDOWN;}
export const ROUND_BREAK = 2.5;
const BOT_NAMES = ['Kestrel', 'Vael', 'Oren', 'Sable', 'Tamsin', 'Corvin', 'Maren', 'Quill', 'Rhys', 'Ashby', 'Nyra', 'Talon'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * players: [{ id, name, team? }]. seats: the match size (default: the mode's). Returns the match; drive it
 * with stepMatch, seat people with joinMatch / leaveMatch, show it with matchView.
 */
export function createMatch({ mode = 'practice', seed = 1, botLevel = 'duelist', players = [], seats = null, controlLayout = null, testMode = false, practiceMode = false } = {}) {
  const def = MODES[mode] || MODES.practice;
  const arenaLayout = getModeArenaLayout(def.id,testMode);
  const world = createWorld({ arenaRadius: arenaLayout?.radius ?? def.arena, arenaLayout });
  const match = {
    mode: def.id, def, world, testMode, training: practiceMode === true || testMode === true, seed, botLevel, random: createRandom(seed * 7919 + 13),
    capacity: Math.max(players.length, arenaLayout ? Math.min(seats ?? def.seats, arenaLayout.capacity) : seats ?? def.seats),
    phase: 'countdown', phaseUntil: matchCountdownSeconds(def.id), clock: 0,
    round: 1, roundWins: {}, roundClock: 0, roundWinner: null, boostTier: 0,
    seats: new Map(), order: [], scores: {}, teamScores: { red: 0, blue: 0 }, damageLog: new Map(),
    flags: def.flags ? makeFlags(def,arenaLayout) : null,
    escort: def.id === 'escort' ? makeEscort() : null,
    ball: def.football ? makeBall() : null,
    controlPoints: def.control ? makeControlPoints(arenaLayout?.radius ?? def.arena, controlLayout ?? arenaLayout?.controlPoints) : null,
    feed: [], events: [], winner: null, nextBot: 1,
  };
  if(arenaLayout?.conduitImported){match.conduit=createConduitLiveMatch(def.id,match.random);match.conduitPickups=conduitPickupDefinitions.map(p=>({...p,readyAt:0}));}
  for (const p of players) seat(match, { ...p, kind: 'player' });
  while (match.seats.size < match.capacity) seat(match, { kind: 'bot' });
  return match;
}

function makeFlags(def,layout) {
  const z = def.arena - CTF.baseInset;
  const flag = (team, home) => ({ team, home, x: home.x, y: home.y??0, z: home.z, state: 'home', carrier: null, droppedAt: 0 });
  return { red: flag('red', layout?.flags?.red??{ x: 0, z: -z }), blue: flag('blue', layout?.flags?.blue??{ x: 0, z }) };
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
  if(match.conduit){
    const occupants=[],enemies=[];
    for(const f of world.fighters.values())if(f.id!==id&&!f.vitals.dead){const p=bodyOf(world,f.id);if(!p)continue;occupants.push(p);if(!team||f.team!==team)enemies.push(p);}
    match.conduit.releaseSpawn(id);
    const p=match.conduit.reserveSpawn(id,team,{occupants,enemies,recentIds:match.seats.get(id)?.recentConduitSpawns??[],canSee:(a,b)=>arenaLineClear(world.arenaLayout,a,b)});
    match.conduit.releaseSpawn(id);
    return p;
  }
  if(world.arenaLayout?.ctfImported && team)return ctfSpawn(team,world.bodies,id);
  if(world.arenaLayout?.escortImported && team)return escortSpawn(team,match.escort?.stage??0,world.bodies,id);
  if(world.arenaLayout?.imported && team)return importedSpawn(world.arenaLayout,team,world.bodies,id);
  if (world.arenaLayout?.footprint && team) {
    const side = team === 'red' ? -1 : 1;
    return { x: side * 13.5 + (match.random() - 0.5) * 1.6, z: 18.5, yaw: Math.PI };
  }
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

// The level a seat fights at: a player's is its class's own (from the EXP the match was given for it, plus what it
// has earned here); a bot's is the players' average, so it is a fair fight at any level.
function levelOf(match, s, classId = s.classId) {
  if (s.kind === 'player') return classId ? levelFromXp(s.progress?.[classId]).level : 1;
  const humans = [...match.seats.values()].filter((o) => o.kind === 'player');
  return humans.length ? Math.max(1, Math.round(humans.reduce((sum, o) => sum + (o.level || 1), 0) / humans.length)) : 1;
}

// classId: a player's class from the start (their choice when they join); bots take the four classes in turn.
// progress: a player's EXP per class as the match begins ({ warrior, duelist, assassin, healer }), from whoever keeps
// it (the match server for an online player, the browser for an offline one); never from a client's packet.
function seat(match, { id = null, name = null, kind, team = null, classId = null, progress = null }) {
  const { def } = match;
  const seatTeam = def.teams ? (TEAMS.includes(team) ? team : lighterTeam(match)) : null;
  const n = kind === 'bot' ? match.nextBot++ : 0;
  const seatId = kind === 'bot' ? `bot${n}` : id;
  match.order.push(seatId);
  const bot = kind === 'bot' ? createBot(seatId, { level: match.botLevel, seed: match.seed * 131 + n * 17 }) : null;
  const spot = spawnFor(match, seatId, seatTeam);
  const cls = kind === 'bot' ? CLASS_IDS[(n - 1 + match.seed) % CLASS_IDS.length] : classById(classId) ? classId : null;
  const entry = { id: seatId, name: name || (kind === 'bot' ? BOT_NAMES[(n - 1) % BOT_NAMES.length] : seatId), kind, team: seatTeam, bot, respawnAt: null, respawnStartedAt: null, classId: cls, pendingClass: null, specialMeter: 0, training: match.training && kind === 'player' ? cleanPracticeSettings() : null,
    progress: kind === 'player' ? cleanProgress(progress, CLASS_IDS) : null, level: 1, xpGained: 0,
    matchBoost: boostAt(match.clock), gold: SHOP_RULES.startingGold,
    goldFraction: 0, classXpFraction: 0, items: [] };
  resetKillChain(entry);
  entry.level = levelOf(match, entry);
  const spawn=spot??(match.conduit?(seatTeam?match.conduit.modeSpawnCandidates[seatTeam][0]:match.conduit.modeSpawnCandidates[0]):null);
  const fighter=addFighter(match.world, { id: seatId, team: seatTeam, weapon: cls ? classById(cls).weapon : 'sword', classId: cls, level: entry.level, matchBoost: entry.matchBoost, ...(spawn ? {x:spawn.x,y:spawn.y,z:spawn.z,yaw:spawn.yaw} : {}) });
  if(match.conduit){entry.recentConduitSpawns=spot?[spot.id]:[];entry.conduitSpawn=spot??null;if(!spot){fighter.vitals.hp=0;fighter.vitals.dead=true;entry.respawnAt=match.world.time+.5;entry.respawnStartedAt=match.world.time;}}
  match.seats.set(seatId, entry);
  match.scores[seatId] = { defeats: 0, assists: 0, falls: 0, captures: 0, returns: 0 };
  return entry;
}

function unseat(match, id) {
  dropFlagOf(match, id, null);
  removeFighter(match.world, id);
  match.seats.delete(id);
  match.order = match.order.filter((x) => x !== id);
  delete match.scores[id];
  match.damageLog.delete(id);
  for (const log of match.damageLog.values()) log.delete(id);
}

const event = (match, e) => {
  const full = { ...e, at: match.world.time };
  match.events.push(full);
  if (e.feed !== false) { match.feed.push(full); if (match.feed.length > 12) match.feed.shift(); }
  awardXp(match, full);
  if ((e.type === 'captured' || e.type === 'flagReturned') && e.by)
    grantGold(match, e.by, SHOP_RULES.objectiveGold, e.type);
};
function grantGold(match, playerId, amount, reason) {
  const s = match.seats.get(playerId);
  if (!s || s.kind !== 'player' || !Number.isFinite(amount) || amount <= 0) return 0;
  const earned = Math.max(0, Math.min(Math.floor(amount), SHOP_RULES.goldCap - s.gold));
  if (!earned) return 0;
  s.gold += earned;
  match.events.push({ type: 'gold', id: playerId, amount: earned, reason, at: match.world.time });
  return earned;
}
/**
 * An actual match-only purchase, authoritatively validated by the server/sim.
 * The client requests an item ID, target tier and optional recipe; price, inventory, team, tier and shop
 * eligibility are read from current match state.
 */
export function purchaseMatchItem(match, playerId, itemId, targetTier, combine = false) {
  const seat = match.seats.get(playerId);
  if (!seat || seat.kind !== 'player' || match.phase === 'over') return { ok: false, reason: 'not-available' };
  const fighter = match.world.fighters.get(playerId);
  const body = bodyOf(match.world, playerId);
  const spawn = match.conduit?seat.conduitSpawn:spawnFor(match, playerId, seat.team);
  const atSpawn = body && spawn && Math.hypot(body.x - spawn.x, body.z - spawn.z,match.conduit?body.y-spawn.y:0) <= 3;
  const allowed = match.training || match.phase !== 'live' || !!fighter?.vitals.dead || atSpawn;
  const result = purchaseRule({ gold: seat.training?.unlimitedGold ? SHOP_RULES.goldCap : seat.gold, items: seat.items, id: itemId, allowed, targetTier, combine });
  if (!result.ok) return { ok: false, reason: result.reason, cost: result.cost || 0 };
  if (!seat.training?.unlimitedGold) seat.gold -= result.cost;
  seat.items = result.items;
  if (fighter) equipItems(fighter, seat.items);
  match.events.push({ type: 'itemBought', id: playerId, itemId, tier: result.tier,
    cost: result.cost, at: match.world.time });
  return { ok: true, id: itemId, tier: result.tier, cost: result.cost,
    gold: seat.training?.unlimitedGold ? SHOP_RULES.goldCap : seat.gold, items: seat.items.map((item) => ({ ...item })) };
}

// Practice controls are scoped to the actual match and the caller's human seat.
export function setPracticeOption(match, playerId, option, enabled) {
  const seat = match.seats.get(playerId);
  if (!match.training || !seat?.training || seat.kind !== 'player' ||
      !validPracticeOption(option, enabled)) return false;
  if (seat.training[option] === enabled) return true;
  seat.training[option] = enabled;
  if (option === 'unlimitedUltimate') {
    seat.specialMeter = enabled ? 100 : 0;
    const f = match.world.fighters.get(playerId);
    if (f) f.meter = seat.specialMeter;
  }
  return true;
}
export function sellPracticeItem(match, playerId, itemId) {
  const seat = match.seats.get(playerId);
  if (!match.training || !seat?.training || seat.kind !== 'player' || match.phase === 'over') return { ok: false, reason: 'not-available' };
  const owned = seat.items.find(item => item.id === itemId);
  if (!owned || !shopItem(itemId)) return { ok: false, reason: 'unknown-item' };
  seat.items = seat.items.filter(item => item.id !== itemId);
  const fighter = match.world.fighters.get(playerId);
  if (fighter) equipItems(fighter, seat.items);
  const refund = tierPrice(shopItem(itemId), owned.tier);
  if (!seat.training.unlimitedGold) seat.gold = Math.min(SHOP_RULES.goldCap, seat.gold + refund);
  return { ok: true, sold: true, id: itemId, tier: owned.tier, refund, gold: seat.training.unlimitedGold ? SHOP_RULES.goldCap : seat.gold, items: seat.items.map(item => ({ ...item })) };
}
function refreshPracticeSeat(match, seat) {
  if (!seat.training) return;
  const fighter = match.world.fighters.get(seat.id);
  if (!fighter) return;
  const kit = classById(seat.classId);
  if (!fighter.vitals.dead) {
    if (seat.training.unlimitedWill) { fighter.vitals.will = fighter.vitals.max.will; fighter.vitals.collapsed = false; }
    if (seat.training.unlimitedStamina) { fighter.vitals.stamina = fighter.vitals.max.stamina; fighter.vitals.winded = false; }
    if (seat.training.autoHeal) fighter.vitals.hp = fighter.vitals.max.hp;
  }
  if (seat.training.noCooldowns && kit) for (const ability of kit.abilities) delete fighter.cooldowns[ability.id];
  if (seat.training.unlimitedUltimate && kit) {
    seat.specialMeter = 100;
    fighter.meter = 100;
    delete fighter.cooldowns[kit.special.id];
  }
}

// EXP for what the match itself saw happen (core/progression.mjs), to the class each player is fighting as. An
// `xp` event says what was earned (for whoever keeps the player's progress); a `levelUp` when a level is reached.
// The new level's ranks come with the next spawn.
function awardXp(match, e) {
  if (match.training) return;
  for (const s of match.seats.values()) {
    if (s.kind !== 'player' || !s.classId || !s.progress) continue;
    const amount = xpForEvent(e, { me: s.id, myTeam: s.team });
    if (!amount) continue;
    const before = levelFromXp(s.progress[s.classId]).level;
    s.progress[s.classId] = Math.min(XP_CAP, s.progress[s.classId] + amount);
    s.xpGained += amount;
    const level = levelFromXp(s.progress[s.classId]).level;
    match.events.push({ type: 'xp', id: s.id, classId: s.classId, amount, total: s.progress[s.classId], level, at: match.world.time });
    if (level > before) match.events.push({ type: 'levelUp', id: s.id, classId: s.classId, level, at: match.world.time });
  }
}

/**
 * A player joins: a free seat, or a bot's (the lowest-scoring bot on the team with fewer players).
 * Returns { ok, id, team, replaced } or { ok: false, reason: 'full' } when every seat is a player's.
 */
export function joinMatch(match, { id, name = id, team = null, classId = null, progress = null } = {}) {
  const current = match.seats.get(id);
  if (current) return { ok: true, id, team: current.team, replaced: null };
  if (match.seats.size < match.capacity) {
    const s = seat(match, { id, name, kind: 'player', team, classId, progress });
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
  seat(match, { id, name, kind: 'player', team: seatTeam, classId, progress });
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
  const spot=spawnFor(match,seat.id,seat.team);
  if(!spot){seat.respawnAt=match.world.time+.5;return false;}
  if(match.conduit){seat.recentConduitSpawns=[spot.id,...(seat.recentConduitSpawns??[])].slice(0,3);seat.conduitSpawn=spot;}
  const old = match.world.fighters.get(seat.id);
  const chosen = seat.pendingClass ? classAtSpawn({ currentClass: seat.classId || 'duelist', pendingClass: seat.pendingClass }) : null;
  const weapon = chosen?.weapon ?? old?.weapon ?? 'sword';
  seat.level = levelOf(match, seat, chosen ? chosen.classId : seat.classId); // the class's level, with what it has earned so far
  respawnFighter(match.world, seat.id, {
    ...spot, protect: protectSeconds, weapon, level: seat.level, matchBoost: seat.matchBoost,
    ...(chosen ? { classId: chosen.classId } : {}),
  });
  if (chosen) {
    // Charge is earned for the active class; switching classes cannot bank
    // an old class's special for a different kit. Same-class respawns retain it.
    if (seat.classId !== chosen.classId) seat.specialMeter = 0;
    seat.classId = chosen.classId;
    seat.pendingClass = null;
    event(match, { type: 'classSelected', id: seat.id, classId: chosen.classId, feed: false });
  }
  return true;
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
    if(at&&match.world.arenaLayout?.ctfImported){
      const y=ctfSupport(at.x,at.z,at.y+.15);
      const candidate={x:at.x,y,z:at.z};
      at=Number.isFinite(y)&&ctfSafe(candidate,null)&&!ctfZone('red',candidate)&&!ctfZone('blue',candidate)?candidate:null;
    }
    if (at) { flag.state = 'dropped'; flag.x = at.x; flag.y=at.y??0; flag.z = at.z; flag.droppedAt = match.world.time; event(match, { type: 'flagDropped', team: t, by: id }); }
    else { goHome(flag); event(match,{type:'flagReturned',team:t,by:null}); }
  }
}

function goHome(flag) { flag.state = 'home'; flag.carrier = null; flag.x = flag.home.x; flag.y=flag.home.y??0; flag.z = flag.home.z; }

// What a bot is after besides the nearest fight: the objective of the mode.
function goalFor(match, s) {
  if (match.escort && s.team) {
    const cart = match.escort, body = bodyOf(match.world, s.id);
    const target=cart.pointACaptured?cart:{x:0,y:0,z:-148};return { x: target.x, y:target.y, z: target.z, urgent: !body || dist(body,target)>ESCORT_RADIUS-0.8 };
  }
  if (match.controlPoints && s.team) {
    // Send bots to the objectives which their team does not yet own.
    // Stable assignment spreads teammates over the three points.
    const pending = match.controlPoints.filter(point => point.owner !== s.team);
    const candidates = pending.length ? pending : match.controlPoints;
    const index = Math.max(0, match.order.indexOf(s.id));
    const target = candidates[index % candidates.length];
    return { x: target.x, y: target.y ?? 0, z: target.z, urgent: true };
  }
  if (match.ball && s.team) return { x: match.ball.x, z: match.ball.z, urgent: true };
  if (!match.flags || !s.team) return null;
  const { world } = match;
  const me = bodyOf(world, s.id);
  const own = match.flags[s.team];
  const theirs = match.flags[s.team === 'red' ? 'blue' : 'red'];
  if (theirs.carrier === s.id) return { x: own.home.x, y:own.home.y, z: own.home.z, urgent: true }; // run it home
  if (own.state === 'dropped') return { x: own.x, y:own.y, z: own.z, urgent: true }; // return ours
  if (own.carrier) { const c = bodyOf(world, own.carrier); if (c) return { x: c.x, y:c.y, z: c.z, urgent: true, hunt: own.carrier }; } // chase the thief
  // half the team goes for their flag, the rest guards ours (stable per bot)
  const attacker = match.order.filter(id=>match.seats.get(id)?.team===s.team).indexOf(s.id)%2===0;
  if (attacker || theirs.state !== 'home') {
    if (theirs.carrier) { const c = bodyOf(world, theirs.carrier); if (c) return { x: c.x, y:c.y, z: c.z }; } // escort our carrier
    return { x: theirs.x, y:theirs.y, z: theirs.z, urgent:true };
  }
  const guard = { x: own.home.x + Math.sin(world.time * 0.3 + me.x) * 2, y:own.home.y, z: own.home.z + (s.team === 'red' ? 3 : -3), urgent:true };
  return guard;
}

/**
 * One step. inputs: { [playerId]: input } (bots think for themselves). Returns { effects, events }: the
 * world's effects (hits, knockbacks...) and the match's own events (defeat, flagTaken, captured, round,
 * over...).
 */
function recoverEscortBodies(match,dt){
  if(!match.escort)return;
  const world=match.world,stage=match.escort.stage;
  for(const seat of match.seats.values()){
    const f=world.fighters.get(seat.id),b=bodyOf(world,seat.id);
    if(!f||!b||f.vitals.dead||seat.respawnAt!==null){seat.embeddedFor=0;continue;}
    if(escortEmbedded(b)){
      seat.embeddedFor=(seat.embeddedFor||0)+dt;
      if(seat.embeddedFor>=.15){
        const spot=escortRecoverySpot(b,seat.team,stage,world.bodies,seat.id,seat.lastSafe);
        Object.assign(b,spot,{vy:0,kx:0,kz:0,motion:null,jumped:false,airDashReady:false,airJumpAt:null,moving:false,speed:0});
        f.action=null;f.guard=null;f.buffer=null;f.heldBy=null;f.seizedBy=null;
        // Release anyone held by the displaced fighter. Preserve health,
        // stamina, cooldowns, score, and the existing respawn penalty.
        for(const other of world.fighters.values()){
          if(other.heldBy===seat.id)other.heldBy=null;
          if(other.seizedBy===seat.id)other.seizedBy=null;
        }
        seat.embeddedFor=0;seat.lastSafe={...spot};
        seat.recoveryCount=(seat.recoveryCount||0)+1;
        event(match,{type:'positionRecovered',id:seat.id,feed:false});
      }
    }else{
      seat.embeddedFor=0;
      if(Math.abs(escortSupport(b.x,b.z,b.y+.06,.03)-b.y)<.08&&!escortBlockers({...b,radius:.48}).length&&!escortEnemyZone(seat.team,stage,b))
        seat.lastSafe={x:b.x,y:b.y,z:b.z,yaw:b.yaw};
    }
  }
}

function recoverCtfBodies(match,dt){
  if(!match.world.arenaLayout?.ctfImported)return;
  const w=match.world;
  for(const seat of match.seats.values()){
    const f=w.fighters.get(seat.id),b=bodyOf(w,seat.id);
    if(!f||!b||f.vitals.dead||b.y< -2)continue;
    const carry=carrying(match,seat.id),restricted=ctfRestricted(seat.team,b,carry);
    if(restricted||ctfEmbedded(b)){
      seat.embeddedFor=(seat.embeddedFor||0)+dt;
      if(restricted||seat.embeddedFor>=.15){
        let spot=ctfRecovery(b,seat.team,w.bodies,seat.id,seat.lastSafe,carry);
        if(!spot){dropFlagOf(match,seat.id,null);spot=ctfRecovery(b,seat.team,w.bodies,seat.id,seat.lastSafe,false);}
        Object.assign(b,spot,{vy:0,kx:0,kz:0,motion:null,jumped:false,airDashReady:false,airJumpAt:null,moving:false,speed:0});
        f.action=null;f.guard=null;f.buffer=null;f.heldBy=null;f.seizedBy=null;
        for(const other of w.fighters.values()){if(other.heldBy===seat.id)other.heldBy=null;if(other.seizedBy===seat.id)other.seizedBy=null;}
        seat.embeddedFor=0;seat.lastSafe={...spot};seat.recoveryCount=(seat.recoveryCount||0)+1;
        event(match,{type:'positionRecovered',id:seat.id,feed:false});
      }
    }else{seat.embeddedFor=0;if(ctfSafe(b,seat.team,carry))seat.lastSafe={x:b.x,y:b.y,z:b.z,yaw:b.yaw};}
  }
}
function syncCtfCarriers(match){if(match.flags)match.world.ctfCarriers=new Set(Object.values(match.flags).map(f=>f.carrier).filter(Boolean));}
export function stepMatch(match, dt, inputs = {}) {
  match.events = [];
  const { world } = match;
  syncCtfCarriers(match);
  if(match.flags&&match.phase==='countdown'&&world.time<match.phaseUntil-1e-9&&world.time+dt>match.phaseUntil+1e-9){
    const pre=match.phaseUntil-world.time;
    const a=stepMatch(match,pre,{}),b=stepMatch(match,dt-pre,{});
    match.events=[...a.events,...b.events];return {effects:[...a.effects,...b.effects],events:match.events};
  }
  if (match.phase !== 'live') {
    // nobody fights during a countdown or between rounds; bodies still settle and recover
    const effects = step(world, dt, {});
    if(match.phase==='countdown'){recoverEscortBodies(match,dt);recoverCtfBodies(match,dt);}
    if (match.phase !== 'over' && world.time >= match.phaseUntil-1e-9) {
      if (match.phase === 'roundOver') nextRound(match);
      else {
        // On initial countdown, apply queued class selections before any attacks.
        for (const seat of match.seats.values()) {if (seat.pendingClass) spawnSeat(match, seat, match.def.protect);else if(match.escort||match.flags)protect(match,seat.id);}
        match.phase = 'live';
        event(match, { type: 'fight', round: match.round, feed: false });
      }
    }
    return { effects, events: match.events };
  }
  match.clock += dt;
  match.roundClock += dt;
  for (const seat of match.seats.values()) {
    if (seat.kind !== 'player') continue;
    seat.goldFraction += dt * SHOP_RULES.passiveGoldPerSecond;
    if (seat.goldFraction >= 1) {
      const whole = Math.floor(seat.goldFraction);
      seat.goldFraction -= whole;
      grantGold(match, seat.id, whole, 'time');
    }
    const f = world.fighters.get(seat.id);
    // Permanent class XP accrues to the class actually used over time, independently
    // of shared per-match combat ranks or gold; switching preserves both class totals.
    if (seat.classId && f && !f.vitals.dead) {
      seat.classXpFraction += dt * XP.participationPerSecond;
      if (seat.classXpFraction >= 1) {
        const amount = Math.floor(seat.classXpFraction);
        seat.classXpFraction -= amount;
        awardXp(match, { type: 'participation', by: seat.id, amount });
      }
    }
  }
  // An equal opportunity boost: live match seconds only. Never award combat power from saved XP.
  const nextBoost = boostAt(match.clock);
  if (match.boostTier !== nextBoost) {
    match.boostTier = nextBoost;
    for (const seat of match.seats.values()) {
      seat.matchBoost = nextBoost;
      const fighter = world.fighters.get(seat.id);
      if (fighter) fighter.matchBoost = nextBoost;
    }
    event(match, { type: 'matchBoost', tier: nextBoost, feed: false });
  }
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
        input = { ...input, presses: (input.presses || []).filter(cmd => cmd === 'roll' || cmd === 'dash' || cmd === 'jump') };
      }
    }
    if (carrying(match, s.id)) input = { ...input, sprint: false };
    all[s.id] = input;
  }
  // the seats' meters reach their fighters (a special asks the fighter's copy); what one spent comes back below
  for (const s of match.seats.values()) {
    const f = world.fighters.get(s.id);
    refreshPracticeSeat(match, s);
    if (f) f.meter = s.classId ? s.specialMeter : 0;
  }
  const effects = step(world, dt, all);
  for (const seat of match.seats.values()) refreshPracticeSeat(match, seat);
  recoverEscortBodies(match,dt);recoverCtfBodies(match,dt);
  if(world.arenaLayout?.imported)for(const s of match.seats.values()){
    const b=bodyOf(world,s.id),f=world.fighters.get(s.id);
    if(!b||b.y>=(match.flags?-2:-18)||f?.vitals.dead)continue;
    if(match.escort||match.flags||match.conduit){
      // Falling off the canyon must not bypass a defender's respawn penalty.
      f.vitals.hp=0;f.vitals.dead=true;f.action=null;f.guard=null;f.buffer=null;
      b.vy=0;b.motion=null;effects.push({type:'defeat',defender:s.id,by:null});
    }else spawnSeat(match,s,match.def.protect);
  }
  // Assists are awarded only for server-verified impacts from the last eight seconds.
  for (const e of effects) {
    if (e.type !== 'impact' || !(e.hp > 0 || e.shield > 0 || e.will > 0) || !e.attacker || !e.defender) continue;
    const from = world.fighters.get(e.attacker);
    const to = world.fighters.get(e.defender);
    if (!from || !to || !hostile(world, from, to)) continue;
    if (!match.damageLog.has(e.defender)) match.damageLog.set(e.defender, new Map());
    match.damageLog.get(e.defender).set(e.attacker, world.time);
  }
  chargeSpecials(match, effects);
  if (match.ball) stepFootball(match, dt, all);
  for (const e of effects) if (e.type === 'defeat') onDefeat(match, e);
  if (match.phase === 'live') {
    if(match.conduit)stepConduitPickups(match);
    if(!match.escort)respawns(match);
    if (match.flags){flagsStep(match);syncCtfCarriers(match);}
    if (match.controlPoints) stepControlPoints(match, dt);
    if (match.escort) {
      const winner = stepEscort(match, dt);
      world.escortStage=match.escort.stage;
      // Re-evaluate waiting defenders before any respawn, including on the tick a threshold is reached.
      for(const s of match.seats.values()){
        if(s.team==='blue'&&s.respawnAt!==null&&s.respawnStartedAt!==null)
          s.respawnAt=Math.max(s.respawnAt,s.respawnStartedAt+match.escort.defenderRespawnSeconds);
        const b=bodyOf(world,s.id),f=world.fighters.get(s.id);
        if(b&&f&&!f.vitals.dead&&s.team&&escortEnemyZone(s.team,world.escortStage,b)){
          // A newly active shield may displace a living intruder, but it must
          // never resurrect a corpse or restore vitals/clear the death timer.
          Object.assign(b,spawnFor(match,s.id,s.team),{vy:0,kx:0,kz:0,motion:null,jumped:false,airDashReady:false,airJumpAt:null});
          f.action=null;f.buffer=null;
        }
      }
      if(!winner)respawns(match);
      if (winner) {
        match.escort.moving = false;
        match.teamScores[winner] = 1;
        finish(match, winner);
      }
    } else checkEnd(match);
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
      if (s?.kind === 'player' && s.classId) {
        const remaining = settleSpecialSpend(s.specialMeter, e.cost);
        if (remaining !== null && !s.training?.unlimitedUltimate) s.specialMeter = remaining;
      }
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
  resetKillChain(who);
  const counted = by && by.id !== who.id && hostile(world, world.fighters.get(by.id) || {}, world.fighters.get(who.id) || {});
  const killChain = counted ? recordKill(by, world.time) : null;
  if (counted) {
    match.scores[by.id].defeats += 1;
    grantGold(match, by.id, SHOP_RULES.eliminationGold, 'elimination');
    // Only the authoritative world defeat event can grant elimination charge.
    // A client press, score display or unverified hit claim never awards meter.
    if (by.kind === 'player' && by.classId) {
      by.specialMeter = awardSpecialCharge(by.specialMeter, 'elimination') ?? by.specialMeter;
    }
    if (def.id === 'tdm' && by.team) match.teamScores[by.team] += 1;
  }
  const assists = match.damageLog.get(who.id) || new Map();
  match.damageLog.delete(who.id);
  if (counted) for (const [id, at] of assists) {
    if (id === by.id || world.time - at > 8) continue;
    const helper = match.seats.get(id);
    if (!helper || helper.kind !== 'player' ||
        !hostile(world, world.fighters.get(id) || {}, world.fighters.get(who.id) || {})) continue;
    match.scores[id].assists += 1;
    grantGold(match, id, SHOP_RULES.assistGold, 'assist');
    event(match, { type: 'assist', by: id, who: who.id, feed: false });
  }
  dropFlagOf(match, who.id, bodyOf(world, who.id));
  event(match, { type: 'defeat', by: counted ? by.id : null, who: who.id, ...(killChain || {}) });
  if (def.id === 'duel') {
    const winner = counted ? by.id : match.order.find((id) => id !== who.id);
    endRound(match, winner);
  } else if (def.respawn) {
    who.respawnStartedAt=world.time;
    const delay=match.escort&&who.team==='blue'?defenderRespawnDelay(match.escort):def.respawn;
    who.respawnAt=world.time+(who.training?.instantRespawn && !match.escort ? 0 : delay);
  }
}

function stepConduitPickups(match){
  const {world}=match;
  for(const p of match.conduitPickups){
    if(world.time<p.readyAt)continue;
    const [x,y,z]=p.position,point={x,y,z};
    for(const f of world.fighters.values()){
      if(f.vitals.dead||f.heldBy||f.seizedBy||isDown(f,world.time))continue;
      const b=bodyOf(world,f.id);if(!b||Math.abs(b.y-y)>.65||Math.hypot(b.x-x,b.z-z)>1.25||!arenaLineClear(world.arenaLayout,b,point))continue;
      const v=f.vitals;
      if(p.id==='armory'||p.id==='reactor')v.will=Math.min(v.max.will,v.will+(p.id==='armory'?35:40));
      else if(p.id==='medbay')v.hp=Math.min(v.max.hp,v.hp+40);
      else if(p.id==='barracks')v.shield=Math.min(v.max.shield,v.shield+35);
      else if(p.id==='t0_core'){v.shield=Math.min(v.max.shield,v.shield+50);v.will=v.max.will;}
      else if(p.id==='crown')f.conduitDamageUntil=world.time+15;
      else continue;
      p.readyAt=world.time+p.respawn;event(match,{type:'conduitPickup',id:p.id,by:f.id,feed:false});break;
    }
  }
}

function respawns(match) {
  const { world, def } = match;
  for (const s of match.seats.values()) {
    if (s.respawnAt === null || world.time < s.respawnAt) continue;
    s.respawnAt = null;
    s.respawnStartedAt = null;
    if(!spawnSeat(match, s, def.protect))continue;
    if (s.bot) s.bot.combo = 0;
    event(match, { type: 'respawn', id: s.id, feed: false });
  }
}

function ctfReach(b,p,r){return !!b&&dist(b,p)<=r&&Math.abs(b.y-(p.y??0))<=1.8&&ctfRay({x:b.x,y:b.y+1,z:b.z},{x:p.x,y:(p.y??0)+1,z:p.z})>=.999;}
function flagsStep(match) {
  const { world } = match;
  const now = world.time;
  for (const team of TEAMS) {
    const flag = match.flags[team];
    if (flag.carrier) {
      const f = world.fighters.get(flag.carrier);
      const b = bodyOf(world, flag.carrier);
      if (!f || !b || !match.seats.has(flag.carrier) || f.team===team || !TEAMS.includes(f.team) || f.vitals.dead || isDown(f, now) || f.heldBy || f.seizedBy) { dropFlagOf(match, flag.carrier, b || flag.home); continue; }
      flag.x = b.x;
      flag.y = b.y;
      flag.z = b.z;
      const own = match.flags[f.team];
      if(ctfRestricted(f.team,b,true)){dropFlagOf(match,f.id,null);continue;}
      if(now<(f.activeRelicUntil??-Infinity))continue;
      if (own.state === 'home' && ctfReach(b, own.home, CTF.capture)) {
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
        if(match.overtime||match.teamScores[f.team]>=match.def.scoreToWin){finish(match,f.team);return;}
      }else if(own.state!=='home'&&ctfReach(b,own.home,CTF.capture)){
        const seat=match.seats.get(f.id);if(now>=(seat.captureBlockedUntil??-Infinity)){seat.captureBlockedUntil=now+2;event(match,{type:'captureBlocked',id:f.id,team:f.team,feed:false});}
      }
      continue;
    }
    if (flag.state === 'dropped' && now - flag.droppedAt >= CTF.autoReturn) { goHome(flag); event(match, { type: 'flagReturned', team, by: null }); continue; }
    for (const f of world.fighters.values()) {
      if (f.vitals.dead || isDown(f, now) || f.heldBy || now < (f.activeRelicUntil ?? -Infinity) || !f.team) continue;
      const b = bodyOf(world, f.id);
      if (!ctfReach(b,flag,CTF.pickup)||ctfZone(f.team,b)||f.seizedBy) continue;
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
  for (const s of match.seats.values()) {
    s.multiKill = 0; s.lastKillAt = null; // a new duel round is not a rapid-kill chain
    spawnSeat(match, s);
  }
  match.phase = 'countdown';
  match.phaseUntil = world.time + 2;
  event(match, { type: 'round', round: match.round, feed: false });
}

function checkEnd(match) {
  const { def } = match;
  if(match.phase==='over')return;
  if (match.testMode && def.id === 'duel' && match.order.length < 2) return;
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
    if(match.phase==='over')return;
    if (def.clock && match.clock >= def.clock) {
      const { red, blue } = match.teamScores;
      if(match.flags&&red===blue){if(!match.overtime){match.overtime=true;event(match,{type:'overtime'});}return;}
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
    id: s.id, name: s.name, kind: s.kind, team: s.team, classId: s.classId, level: s.level,
    matchBoost: s.matchBoost, ...match.scores[s.id],
    recoveryCount: s.recoveryCount||0, dead: !!world.fighters.get(s.id)?.vitals.dead, respawnIn: s.respawnAt === null ? 0 : Math.max(0, s.respawnAt - world.time),
    roundWins: match.roundWins[s.id] || 0,
  }));
  people.sort((a, b) => (b.defeats - a.defeats) || (b.captures - a.captures) || (a.falls - b.falls));
  return {
    mode: def.id, name: def.name, phase: match.phase, winner: match.winner, matchBoost: match.boostTier,
    countdown: match.phase === 'countdown' || match.phase === 'roundOver' ? Math.max(0, match.phaseUntil - world.time) : 0,
    ...((match.escort||match.flags)?{preparation:match.phase==='countdown'?Math.max(0,match.phaseUntil-world.time-ESCORT_START_COUNTDOWN):0,startCountdown:ESCORT_START_COUNTDOWN}:{}),
    ...(match.conduit?{conduitPickups:match.conduitPickups.map(p=>({id:p.id,available:world.time>=p.readyAt,remaining:Math.max(0,p.readyAt-world.time)}))}:{}),
    clockLeft: match.escort ? Math.max(0,def.clock+match.escort.bonusTime-match.clock) : def.clock ? Math.max(0, def.clock - match.clock) : def.roundClock ? Math.max(0, def.roundClock - match.roundClock) : null,
    round: match.round, rounds: def.rounds || null, roundWinner: match.roundWinner,
    scoreToWin: def.scoreToWin || null, teamScores: { ...match.teamScores },
    overtime:!!match.overtime,
    flags: match.flags ? Object.fromEntries(TEAMS.map((t) => [t, { state: match.flags[t].state, carrier: match.flags[t].carrier }])) : null,
    ball: match.ball ? { x: match.ball.x, z: match.ball.z } : null,
    ...(match.escort ? { escort: { ...match.escort } } : {}),
    controlPoints: controlPointView(match.controlPoints),
    zones: world.zones.map((z) => ({ id: z.id, kind: z.kind, team: z.team, owner: z.owner, x: z.x, z: z.z, radius: z.radius, until: z.until })),
    people, me: forId && match.seats.has(forId) ? { ...people.find((p) => p.id === forId), pendingClass: match.seats.get(forId).pendingClass,
      specialMeter: match.seats.get(forId).classId ? (match.seats.get(forId).training?.unlimitedUltimate ? 100 : match.seats.get(forId).specialMeter) : null,
      ...(match.seats.get(forId).training ? { training: { ...match.seats.get(forId).training }, unlimitedGold: match.seats.get(forId).training.unlimitedGold } : {}),
      gold: match.seats.get(forId).training?.unlimitedGold ? SHOP_RULES.goldCap : match.seats.get(forId).gold, items: match.seats.get(forId).items.map((item) => ({ ...item })),
      canShop: match.phase !== 'over' && (match.training || match.phase !== 'live' ||
        world.fighters.get(forId)?.vitals.dead ||
        (() => {
          const body = bodyOf(world, forId);
          const seat = match.seats.get(forId);
          const spawn = match.conduit?seat.conduitSpawn:spawnFor(match, forId, seat.team);
          return !!body && !!spawn && Math.hypot(body.x - spawn.x, body.z - spawn.z,match.conduit?body.y-spawn.y:0) <= 3;
        })()),
      // the class's EXP so far (what the match began with plus what was earned in it), and every class's
      xp: match.seats.get(forId).progress?.[match.seats.get(forId).classId] ?? 0,
      progress: match.seats.get(forId).progress ? { ...match.seats.get(forId).progress } : null } : null,
    feed: match.feed.slice(-5),
  };
}
