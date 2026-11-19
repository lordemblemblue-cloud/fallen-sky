// Co-op story missions: a crew of 1 to 4 against a level full of people, with objectives that change as the
// story does. Pure and seeded like the matches (sim/match.mjs), so the server can run one for friends.
//
// A mission is data (sim/missions/*.mjs): a level, groups of enemies, things to interact with, and stages.
// Each stage has an objective line, a done() test, and hooks: enter (spawn people, open doors, say lines),
// update (timers), markers (where to go). This engine runs the world, the enemies' AI and alarm, held
// interactions (stand close and hold the interact key), comms lines, defeats and respawns:
//   - a fallen player comes back at the stage's checkpoint after a few seconds while someone still stands;
//   - if the whole crew is down, the stage starts again from its checkpoint.
import { createWorld, addFighter, respawnFighter, removeFighter, step, bodyOf } from './world.mjs';
import { createLevel, setDoor } from './level.mjs';
import { createEnemy, thinkEnemy, alert, spreadAlarm, ENEMY_TYPES } from './enemies.mjs';
import { createRandom } from './bots.mjs';
import { isStunned, isDown } from '../core/index.mjs';
import { CONTRABAND } from './missions/contraband.mjs';

export const MISSIONS = Object.freeze({ contraband: CONTRABAND });
export const CREW = 'crew';
export const RESPAWN_SECONDS = 6;
export const RETRY_SECONDS = 4;
export const INTERACT_RADIUS = 1.9;
// between fights the crew catches its breath: health comes back after a few seconds unhurt
export const REST = Object.freeze({ after: 4.5, hpPerSec: 8 });
// each extra crew member makes the depot's people this much tougher (health and armor)
export const TOUGHER_PER_PLAYER = 0.22;
// how many gunners may be winding up a shot at one moment (plus one for each extra player)
export const SHOOTERS_AT_ONCE = 2;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** players: [{ id, name }] (1 to 4). Drive it with stepMission; show it with missionView. */
export function createMission({ id = 'contraband', players = [{ id: 'you', name: 'You' }], seed = 1 } = {}) {
  const def = MISSIONS[id] || MISSIONS.contraband;
  const level = createLevel(def.level);
  const world = createWorld({ level, arenaRadius: 1e6 });
  const mission = {
    id: def.id, def, world, level, seed, random: createRandom(seed * 7919 + 101),
    phase: 'live', // live | failed | complete
    phaseUntil: 0, stageIndex: -1, stageClock: 0, clock: 0,
    seats: new Map(), enemies: new Map(), interactables: new Map(), flags: {}, counters: {},
    comms: [], events: [], checkpoint: def.start, nextEnemy: 1, capacity: 4,
  };
  for (const it of def.interactables) mission.interactables.set(it.id, { ...it, enabled: false, done: false, progress: 0, by: null });
  for (const p of players.slice(0, 4)) joinMission(mission, p);
  enterStage(mission, 0);
  return mission;
}

function spawnPoint(mission, index) {
  const c = mission.checkpoint;
  const ring = [[0, 0], [-1.6, 0.4], [1.6, 0.4], [0, -1.6]];
  const [dx, dz] = ring[index % ring.length];
  return { x: c.x + dx, z: c.z + dz, yaw: c.yaw || 0 };
}

/** A friend joins the crew (up to four). Returns { ok } or { ok: false, reason: 'full' }. */
export function joinMission(mission, { id, name = id } = {}) {
  if (mission.seats.has(id)) return { ok: true };
  if (mission.seats.size >= mission.capacity) return { ok: false, reason: 'full' };
  const at = spawnPoint(mission, mission.seats.size);
  addFighter(mission.world, { id, team: CREW, weapon: 'sword', ...at });
  mission.seats.set(id, { id, name, kind: 'player', team: CREW, respawnAt: null, hurtAt: -Infinity });
  mission.events.push({ type: 'joined', id, name, at: mission.world.time });
  return { ok: true };
}

export function leaveMission(mission, id) {
  if (!mission.seats.has(id)) return false;
  mission.seats.delete(id);
  removeFighter(mission.world, id);
  mission.events.push({ type: 'left', id, at: mission.world.time });
  return true;
}

// ---- what a stage's hooks may call
const say = (mission, speaker, text, seconds = null) => {
  const line = { speaker, text, seconds: seconds ?? Math.max(3.2, 1.6 + text.length * 0.055) };
  mission.comms.push(line);
  mission.events.push({ type: 'comms', speaker, text, at: mission.world.time });
};
function spawn(mission, groupId) {
  const group = mission.def.groups[groupId] || [];
  const crew = mission.seats.size;
  const made = [];
  for (const spec of group) {
    if ((spec.minPlayers || 1) > crew) continue;
    if (spec.tag && mission.flags['fallen:' + spec.tag]) continue; // someone who already lost does not come back
    const id = `e${mission.nextEnemy++}`;
    const type = ENEMY_TYPES[spec.type] || ENEMY_TYPES.gunner;
    const tough = 1 + TOUGHER_PER_PLAYER * Math.max(0, crew - 1);
    const vitals = { ...type.vitals, hp: Math.round(type.vitals.hp * tough), shield: Math.round(type.vitals.shield * tough) };
    const f = addFighter(mission.world, { id, team: 'depot', weapon: type.weapon, x: spec.x, z: spec.z, yaw: spec.yaw || 0, vitals });
    if (type.willRegenScale) f.vitals.willRegenScale = type.willRegenScale;
    const enemy = createEnemy(id, spec.type, { seed: mission.seed + mission.nextEnemy, name: spec.name || null, group: groupId, named: !!spec.name });
    enemy.tag = spec.tag || null;
    if (spec.alert) alert(enemy, mission.world.time, mission.checkpoint);
    mission.enemies.set(id, enemy);
    made.push(enemy);
  }
  return made;
}
const helpers = (mission) => ({
  say: (speaker, text, seconds) => say(mission, speaker, text, seconds),
  spawn: (group) => spawn(mission, group),
  // after a wipe: a squad comes back only if the crew had not already cleared it
  respawn: (group) => (mission.flags[`cleared:${group}`] ? [] : spawn(mission, group)),
  open: (door) => { if (setDoor(mission.level, door, true)) mission.events.push({ type: 'door', id: door, open: true, at: mission.world.time }); },
  close: (door) => { if (setDoor(mission.level, door, false)) mission.events.push({ type: 'door', id: door, open: false, at: mission.world.time }); },
  enable: (...ids) => { for (const id of ids) { const it = mission.interactables.get(id); if (it) it.enabled = true; } },
  checkpoint: (at) => { mission.checkpoint = at; },
  flag: (name, value = true) => { mission.flags[name] = value; },
  alarm: () => { for (const e of mission.enemies.values()) alert(e, mission.world.time, mission.checkpoint); },
  tagged: (tag) => [...mission.enemies.values()].find((e) => e.tag === tag) || null,
  alive: (group) => [...mission.enemies.values()].filter((e) => e.group === group && !mission.world.fighters.get(e.id)?.vitals.dead).length,
  crewNear: (at, radius) => crewAlive(mission).filter((s) => dist(bodyOf(mission.world, s.id), at) <= radius).length,
  crewAlive: () => crewAlive(mission).length,
});

const crewAlive = (mission) => [...mission.seats.values()].filter((s) => !mission.world.fighters.get(s.id)?.vitals.dead);

function enterStage(mission, index) {
  mission.stageIndex = index;
  mission.stageClock = 0;
  const stage = mission.def.stages[index];
  mission.events.push({ type: 'stage', index, title: stage.title, at: mission.world.time });
  stage.enter?.(mission, helpers(mission));
}

/**
 * One step. inputs: { [playerId]: input } where an input may carry `interact: true` (the key is held).
 * Returns { effects, events }.
 */
export function stepMission(mission, dt, inputs = {}) {
  mission.events = [];
  const { world } = mission;
  const now = world.time;
  if (mission.phase === 'failed') {
    const effects = step(world, dt, {});
    if (world.time >= mission.phaseUntil) retryStage(mission);
    return { effects, events: mission.events };
  }
  if (mission.phase === 'complete') return { effects: step(world, dt, {}), events: mission.events };
  mission.clock += dt;
  mission.stageClock += dt;
  const playerIds = [...mission.seats.keys()];
  const all = {};
  for (const s of mission.seats.values()) {
    const f = world.fighters.get(s.id);
    if (f && !f.vitals.dead) all[s.id] = inputs[s.id] || {};
  }
  // only a few may wind up a shot at once, so a room full of guns can still be read and answered
  let shooting = 0;
  for (const e of mission.enemies.values()) {
    const a = world.fighters.get(e.id)?.action;
    if (a && a.move.damageKind === 'projectile' && a.t < a.move.startup + a.move.active) shooting += 1;
  }
  const limit = SHOOTERS_AT_ONCE + Math.max(0, mission.seats.size - 1);
  const ctx = { grant: () => (shooting < limit ? ((shooting += 1), true) : false) };
  for (const e of mission.enemies.values()) {
    const f = world.fighters.get(e.id);
    if (f && !f.vitals.dead && !e.yielded) all[e.id] = thinkEnemy(world, e, playerIds, ctx);
  }
  const effects = step(world, dt, all);
  // hits wake whoever they land on; the fallen are counted
  for (const fx of effects) {
    if (fx.type === 'impact') {
      const enemy = mission.enemies.get(fx.defender);
      if (enemy) alert(enemy, now);
      const seat = mission.seats.get(fx.defender);
      if (seat && (fx.hp > 0 || fx.will > 0 || fx.shield > 0)) seat.hurtAt = now;
    } else if (fx.type === 'defeat') onDefeat(mission, fx);
  }
  for (const s of mission.seats.values()) {
    const v = world.fighters.get(s.id)?.vitals;
    if (v && !v.dead && now - s.hurtAt >= REST.after && v.hp < v.max.hp) v.hp = Math.min(v.max.hp, v.hp + REST.hpPerSec * dt);
  }
  // a squad with nobody left standing is cleared for good (a wipe does not bring it back)
  for (const g of new Set([...mission.enemies.values()].map((e) => e.group))) {
    if (!mission.flags[`cleared:${g}`] && ![...mission.enemies.values()].some((e) => e.group === g && !world.fighters.get(e.id)?.vitals.dead)) mission.flags[`cleared:${g}`] = true;
  }
  spreadAlarm(world, mission.enemies, now);
  interactions(mission, dt, inputs);
  respawns(mission);
  const stage = mission.def.stages[mission.stageIndex];
  stage.update?.(mission, helpers(mission), dt);
  if (mission.phase === 'live' && stage.done(mission, helpers(mission))) {
    stage.leave?.(mission, helpers(mission));
    if (mission.stageIndex + 1 < mission.def.stages.length) enterStage(mission, mission.stageIndex + 1);
    else { mission.phase = 'complete'; mission.events.push({ type: 'complete', at: world.time }); }
  }
  // comms: one line at a time, each for its own length
  const line = mission.comms[0];
  if (line) {
    if (line.startedAt === undefined) line.startedAt = world.time;
    if (world.time - line.startedAt >= line.seconds) mission.comms.shift();
  }
  return { effects, events: mission.events };
}

function onDefeat(mission, fx) {
  const { world } = mission;
  const seat = mission.seats.get(fx.defender);
  if (seat) {
    seat.respawnAt = world.time + RESPAWN_SECONDS;
    mission.events.push({ type: 'down', id: seat.id, at: world.time });
    if (!crewAlive(mission).length) {
      mission.phase = 'failed';
      mission.phaseUntil = world.time + RETRY_SECONDS;
      mission.events.push({ type: 'failed', at: world.time });
    }
    return;
  }
  const enemy = mission.enemies.get(fx.defender);
  if (enemy) {
    mission.counters[`fallen:${enemy.group}`] = (mission.counters[`fallen:${enemy.group}`] || 0) + 1;
    if (enemy.tag) mission.flags[`fallen:${enemy.tag}`] = true;
    mission.events.push({ type: 'enemyDown', id: enemy.id, name: enemy.name, named: enemy.named, by: fx.by, at: world.time });
  }
}

function respawns(mission) {
  const { world } = mission;
  let i = 0;
  for (const s of mission.seats.values()) {
    if (s.respawnAt !== null && world.time >= s.respawnAt && mission.phase === 'live') {
      s.respawnAt = null;
      respawnFighter(world, s.id, { ...spawnPoint(mission, i), protect: 2 });
      mission.events.push({ type: 'respawn', id: s.id, at: world.time });
    }
    i += 1;
  }
}

// the whole crew fell: the stage again, from its checkpoint, with its people back
function retryStage(mission) {
  const { world } = mission;
  const stage = mission.def.stages[mission.stageIndex];
  for (const id of [...mission.enemies.keys()]) {
    const e = mission.enemies.get(id);
    if (stage.groups?.includes(e.group)) { removeFighter(world, id); mission.enemies.delete(id); }
  }
  world.projectiles.length = 0;
  let i = 0;
  for (const s of mission.seats.values()) { s.respawnAt = null; s.hurtAt = -Infinity; respawnFighter(world, s.id, { ...spawnPoint(mission, i++), protect: 2 }); }
  mission.phase = 'live';
  mission.stageClock = 0;
  mission.comms.length = 0;
  for (const g of stage.groups || []) mission.counters[`fallen:${g}`] = 0;
  stage.retry?.(mission, helpers(mission));
  mission.events.push({ type: 'retry', index: mission.stageIndex, at: world.time });
}

function interactions(mission, dt, inputs) {
  const { world } = mission;
  const now = world.time;
  for (const it of mission.interactables.values()) {
    if (!it.enabled || it.done) continue;
    let worker = null;
    for (const s of mission.seats.values()) {
      const f = world.fighters.get(s.id);
      if (!f || f.vitals.dead || f.heldBy || f.action || isStunned(f, now) || isDown(f, now)) continue;
      if (!inputs[s.id]?.interact) continue;
      if (dist(bodyOf(world, s.id), it) <= INTERACT_RADIUS) { worker = s.id; break; }
    }
    if (worker) {
      // whoever is at it turns to it
      const b = bodyOf(world, worker);
      if (dist(b, it) > 0.05) b.yaw = Math.atan2(it.x - b.x, it.z - b.z);
      it.progress += dt;
      it.by = worker;
      if (it.progress >= it.seconds) {
        it.done = true;
        it.enabled = false;
        mission.flags[`done:${it.id}`] = true;
        mission.counters[it.counter || 'interactions'] = (mission.counters[it.counter || 'interactions'] || 0) + 1;
        mission.events.push({ type: 'interacted', id: it.id, by: worker, at: now });
        it.onDone?.(mission, helpers(mission));
      }
    } else {
      it.progress = Math.max(0, it.progress - dt * 2);
      it.by = null;
    }
  }
}

/** Everything the HUD needs, in plain data. */
export function missionView(mission, forId = null) {
  const { world, def } = mission;
  const stage = def.stages[mission.stageIndex];
  const h = helpers(mission);
  const text = typeof stage.text === 'function' ? stage.text(mission, h) : stage.text;
  const me = forId ? bodyOf(world, forId) : null;
  let prompt = null;
  if (me) {
    for (const it of mission.interactables.values()) {
      if (!it.enabled || it.done) continue;
      if (dist(me, it) <= INTERACT_RADIUS) { prompt = { id: it.id, label: it.label, progress: Math.min(1, it.progress / it.seconds) }; break; }
    }
  }
  return {
    mission: def.id, name: def.title, phase: mission.phase,
    stage: { index: mission.stageIndex, count: def.stages.length, id: stage.id, title: stage.title, text },
    alarm: !!stage.alarm, // the depot is locked down (red lights, sirens)
    // follow: the marker is a person on the move (the client shows their name, not a beacon)
    markers: (stage.markers?.(mission, h) || []).map((m) => ({ x: m.x, z: m.z, label: m.label || '', follow: !!m.follow })),
    timer: stage.timer ? Math.max(0, stage.timer(mission, h)) : null,
    prompt,
    comms: mission.comms[0] ? { speaker: mission.comms[0].speaker, text: mission.comms[0].text } : null,
    retryIn: mission.phase === 'failed' ? Math.max(0, mission.phaseUntil - world.time) : 0,
    ending: mission.phase === 'complete' ? def.ending : null,
    people: [...mission.seats.values()].map((s) => ({ id: s.id, name: s.name, dead: !!world.fighters.get(s.id)?.vitals.dead,
      respawnIn: s.respawnAt === null ? 0 : Math.max(0, s.respawnAt - world.time) })),
    me: forId ? { id: forId } : null,
    interactables: [...mission.interactables.values()].filter((it) => it.enabled && !it.done).map((it) => ({ id: it.id, x: it.x, z: it.z, label: it.label,
      kind: it.kind || 'use', progress: Math.min(1, it.progress / it.seconds), by: it.by })),
    done: [...mission.interactables.values()].filter((it) => it.done).map((it) => it.id),
    doors: [...mission.level.doors.values()].map((d) => ({ id: d.id, open: d.open })),
  };
}
