// Duelist Adventure arena simulation: bodies in a circular arena, or in a mission's rooms (a level: walls,
// doors and cover, sim/level.mjs), driven by the rules core.
// Headless and deterministic (the caller passes dt): the match server runs it as the authority, the
// browser runs it for practice and for prediction. It decides who each landed move reaches; the core
// decides what happens to them.
import {
  MOVES, BLOCK, MOVE_SPEED, SPRINT, moveById,
  createFighter, press, update, takeEvents, isStunned, strike, insideArc, drainStamina, travelAt, hasClipTravel,
  blockedReason, isInvulnerable, classById, evaluateSpecial, behindTarget, SPECIAL_BALANCE,
  EFFECTS, effectOn, addEffect, endEffect, actionRate, moveRate, rollReach, moveFor, selfMend,
} from '../core/index.mjs';
import { resolveCircle, clearLine, rayDistance } from './level.mjs';

export const BODY_RADIUS = 0.4; // metres, for reach and for keeping bodies apart
// Knockback starts fast and eases off (exponential decay): a hit's knockback distance d starts it at
// d * KNOCKBACK_DECAY m/s and it travels about d metres.
export const KNOCKBACK_DECAY = 8;
export const GRIP_HOLD = Object.freeze({ distance: 2.3, lift: 1.1 }); // where a gripped body hangs
export const PROJECTILE_SPEED = Object.freeze({ bowShot: 60, sniperShot: 140 });
export const PROJECTILE_HEIGHT = 1.35;
// Moves that reach one target (the nearest in their arc); the rest reach everyone in it.
const SINGLE_TARGET = new Set(['grip', 'gripThrow', 'breach', 'pull']);
const GRAVITY = 18;

// zones: places an ability made (a Sanctuary dome: { id, kind, owner, team, x, z, radius, until })
export function createWorld({ arenaRadius = 18, friendlyFire = false, level = null } = {}) {
  return { time: 0, arenaRadius, friendlyFire, level, fighters: new Map(), bodies: new Map(), projectiles: [], nextProjectile: 1,
    zones: [], nextZone: 1 };
}

/**
 * vitals: maximums that differ from a duelist's ({ hp, will, shield, stamina }). A fighter with no Will has
 * no Veil at all (an ordinary person: every blow reaches armor and body, and a grip holds them).
 */
export function addFighter(world, { id, team = null, weapon = 'sword', x = 0, z = 0, yaw = 0, vitals = null, classId = null, level = 1 } = {}) {
  const fighter = createFighter({ id, team, weapon, vitals, classId, level });
  if (fighter.vitals.max.will <= 0) fighter.vitals.collapsed = true;
  world.fighters.set(id, fighter);
  world.bodies.set(id, newBody(x, z, yaw));
  return fighter;
}

/** A fallen (or any) fighter back at a spawn with fresh vitals; nothing reaches it for `protect` seconds. */
export function respawnFighter(world, id, { x = 0, z = 0, yaw = 0, protect = 0, weapon = null, classId = undefined, level = undefined } = {}) {
  const old = world.fighters.get(id);
  if (!old) return null;
  const fighter = createFighter({ id, team: old.team, weapon: weapon ?? old.weapon, classId: classId === undefined ? old.classId : classId,
    level: level === undefined ? old.level : level });
  fighter.meter = old.meter;
  fighter.protectedUntil = world.time + protect;
  world.fighters.set(id, fighter);
  world.bodies.set(id, newBody(x, z, yaw));
  for (const f of world.fighters.values()) if (f.heldBy === id) f.heldBy = null;
  return fighter;
}

/** Take a fighter out of the arena (a player who left, a bot whose seat a player took). */
export function removeFighter(world, id) {
  for (const f of world.fighters.values()) if (f.heldBy === id) f.heldBy = null;
  world.fighters.delete(id);
  world.bodies.delete(id);
  for (let i = world.projectiles.length - 1; i >= 0; i--) if (world.projectiles[i].owner === id) world.projectiles.splice(i, 1);
}

function newBody(x, z, yaw) {
  return {
    x, z, y: 0, yaw, vy: 0,
    intent: { x: 0, z: 0 }, run: false, sprint: false, strafe: false,
    kx: 0, kz: 0, // knockback velocity (m/s)
    motion: null, // root motion of the current move: { id, dir: {x,z}, from, to, distance, done }
    moving: false, speed: 0,
  };
}

export const bodyOf = (world, id) => world.bodies.get(id);
export const forwardOf = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

// The way the stick is held as a strike is pressed, relative to the facing: forward | back | side | null (the rules'
// Flow, core/moves.mjs: a light strike takes it). A light touch of the stick counts as none.
export function strikeDirection(body) {
  const f = forwardOf(body.yaw);
  const ahead = body.intent.x * f.x + body.intent.z * f.z;
  const right = body.intent.z * f.x - body.intent.x * f.z;
  if (Math.hypot(ahead, right) < 0.6) return null;
  return Math.abs(ahead) >= Math.abs(right) ? (ahead > 0 ? 'forward' : 'back') : 'side';
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const hostile = (world, a, b) => a !== b && (world.friendlyFire || a.team === null || a.team !== b.team);

/**
 * One step. inputs: { [fighterId]: { move: {x, z} (world direction, length <= 1), run, sprint,
 *   face: yaw | null, presses: [command] } }. Returns the step's effects (strikes, knockbacks, holds,
 *   projectiles, defeats) for presentation and broadcast.
 */
export function step(world, dt, inputs = {}) {
  world.time += dt;
  const now = world.time;
  const effects = [];
  // 1. intent, facing and presses
  for (const [id, fighter] of world.fighters) {
    const body = world.bodies.get(id);
    const input = inputs[id] || {};
    const m = input.move || { x: 0, z: 0 };
    const len = Math.hypot(m.x, m.z);
    body.intent = len > 1 ? { x: m.x / len, z: m.z / len } : { x: m.x || 0, z: m.z || 0 };
    body.run = !!input.run;
    body.sprint = !!input.sprint;
    body.strafe = !!input.strafe; // locked on: rolls keep facing the target (side and back evasions)
    const restrained = fighter.vitals.dead || isStunned(fighter, now) || fighter.heldBy;
    // the body turns to face where the player aims, except while committed to a roll or dash, or to a
    // strike's active part
    const a = fighter.action;
    const committed = !!a && (a.move.kind === 'movement' || (a.move.kind === 'attack' && a.t >= a.move.startup));
    if (!restrained && !committed && Number.isFinite(input.face)) body.yaw = input.face;
    for (const command of input.presses || []) {
      if (command === 'special') { trySpecial(world, fighter, body, now, effects); continue; }
      const before = fighter.action?.id;
      const res = press(fighter, command, now, command === 'light' ? { direction: strikeDirection(body) } : undefined);
      if (res.accepted && res.id && res.id !== before) startMotion(body, fighter, res.id);
    }
  }
  // 2. the rules advance; moves that start from the buffer get their root motion too
  const pending = [];
  for (const [id, fighter] of world.fighters) {
    const body = world.bodies.get(id);
    update(fighter, dt, now, actionRate(fighter, now));
    for (const event of takeEvents(fighter)) {
      if (event.type === 'start' && body.motion?.id !== event.id) startMotion(body, fighter, event.id);
      if (event.type === 'start') {
        const started = moveById(event.id);
        if (started && (started.kind === 'attack' || (started.kind === 'power' && !started.effect)) && effectOn(fighter, 'cloak', now)) {
          endEffect(fighter, 'cloak');
          effects.push({ type: 'uncloak', fighter: fighter.id });
        }
      }
      pending.push({ fighter, body, event });
    }
  }
  // 3. bodies move
  for (const [id, fighter] of world.fighters) moveBody(world, fighter, world.bodies.get(id), dt, now);
  separate(world);
  for (const body of world.bodies.values()) keepInside(world, body);
  // 4. landed moves reach whoever is in range and arc
  for (const { fighter, body, event } of pending) {
    if (event.type === 'hit') {
      if (moveById(event.id)?.effect) applyEffectMove(world, fighter, body, event.id, effects, now);
      else if (isShot(event.id)) spawnProjectile(world, fighter, body, event.id, effects);
      else resolveReach(world, fighter, body, event.id, effects, now);
    } else if (event.type === 'tick') {
      const held = [...world.fighters.values()].find((f) => f.heldBy === fighter.id);
      if (held) collect(effects, strike(fighter, held, 'grip', { now, dt: event.dt, defenderFacesAttacker: true }), fighter, held);
    } else if (event.type === 'end' || event.type === 'dropped' || event.type === 'interrupt') {
      // the grip ends by throwing (gripThrow lands next and lets go) or by dropping its target
      if ((event.id === 'grip' || event.type === 'dropped') && fighter.action?.id !== 'gripThrow') releaseHeld(world, fighter);
    }
  }
  // a holder that was staggered or killed lets go
  for (const fighter of world.fighters.values()) {
    if (!fighter.heldBy) continue;
    const holder = world.fighters.get(fighter.heldBy);
    if (!holder || holder.vitals.dead || !['grip', 'gripThrow'].includes(holder.action?.id)) fighter.heldBy = null;
  }
  // 5. projectiles fly
  stepProjectiles(world, dt, now, effects);
  // 6. Mend and Sanctuary heal; domes fade
  stepHeals(world, dt, now);
  return effects;
}

// ---- the classes' specials and abilities

/**
 * Q: the class special. Allowed by core/classes.mjs evaluateSpecial against the meter the match gave the fighter
 * (and, for an execution, the nearest enemy in front that it may finish); it breaks into the fighter's own action,
 * never out of a stagger, a grip or a fall. Reports { type: 'special', by, special, cost } for the match to charge
 * the seat's meter, or { type: 'specialRefused', by, reason }.
 */
function trySpecial(world, fighter, body, now, effects) {
  const def = classById(fighter.classId);
  if (!def || fighter.vitals.dead) return;
  const special = def.special;
  const move = moveFor(fighter, special.id); // at the tier the fighter's level gives it
  const reach = move.reach ?? special.reach;
  const level = fighter.level;
  const actor = { id: fighter.id, team: fighter.team, hp: fighter.vitals.hp, position: body };
  let verdict = null;
  let target = null;
  if (special.target === 'enemy') {
    const near = [...world.fighters.values()]
      .filter((o) => hostile(world, fighter, o) && !o.vitals.dead)
      .map((o) => ({ o, b: world.bodies.get(o.id) }))
      .filter(({ b }) => distance(b, body) <= reach + BODY_RADIUS && insideArc(body, body.yaw, b, move.arc)
        && (!world.level || clearLine(world.level, body, b)))
      .sort((p, q) => distance(p.b, body) - distance(q.b, body));
    for (const { o, b } of near) {
      verdict = evaluateSpecial({ classId: fighter.classId, meter: fighter.meter, actor, now, level, target: { id: o.id, team: o.team,
        hp: o.vitals.hp, maxHp: o.vitals.max.hp, position: { x: b.x, z: b.z, yaw: b.yaw }, protectedUntil: o.protectedUntil, invulnerable: isInvulnerable(o, now) } });
      if (verdict.allowed) { target = o; break; }
    }
    if (!verdict) verdict = evaluateSpecial({ classId: fighter.classId, meter: fighter.meter, actor, now, level });
  } else verdict = evaluateSpecial({ classId: fighter.classId, meter: fighter.meter, actor, now, level });
  const blocked = verdict.allowed ? blockedReason(fighter, special.id, now) : null;
  if (!verdict.allowed || blocked) { effects.push({ type: 'specialRefused', by: fighter.id, reason: verdict.allowed ? blocked : verdict.reason }); return; }
  if (fighter.action) { fighter.events.push({ type: 'interrupt', id: fighter.action.id, by: special.id, at: now }); fighter.action = null; }
  fighter.buffer = null;
  const res = press(fighter, '#' + special.id, now);
  if (!res.accepted || !res.id) { effects.push({ type: 'specialRefused', by: fighter.id, reason: res.reason || 'busy' }); return; }
  startMotion(body, fighter, special.id);
  fighter.meter = verdict.meterAfter;
  fighter.specialTarget = target?.id || null;
  effects.push({ type: 'special', by: fighter.id, special: special.id, cost: verdict.cost, target: target?.id || null });
}

// allies (never the fighter itself) the move reaches, nearest first
function alliesInReach(world, fighter, body, move) {
  const found = [];
  for (const other of world.fighters.values()) {
    if (other === fighter || other.vitals.dead || hostile(world, fighter, other)) continue;
    const ob = world.bodies.get(other.id);
    const d = distance(body, ob);
    if (d > move.range + BODY_RADIUS || !insideArc(body, body.yaw, ob, move.arc)) continue;
    if (world.level && !clearLine(world.level, body, ob)) continue;
    found.push({ fighter: other, d });
  }
  return found.sort((p, q) => p.d - q.d).map((t) => t.fighter);
}

/** An ability whose work is an effect (core/abilities.mjs), applied as it lands. */
function applyEffectMove(world, fighter, body, id, effects, now) {
  const move = moveFor(fighter, id);
  const until = now + (move.effectSeconds || 0);
  const give = (f, kind, data = {}) => {
    addEffect(f, kind, until, data);
    effects.push({ type: 'effect', effect: kind, by: fighter.id, target: f.id, until });
  };
  switch (move.effect) {
    case 'quick':
      give(fighter, 'quick');
      if (move.aura) {
        for (const other of world.fighters.values()) {
          if (other === fighter || other.vitals.dead || hostile(world, fighter, other)) continue;
          if (distance(world.bodies.get(other.id), body) <= move.aura) give(other, 'quick');
        }
      }
      break;
    case 'cloak': give(fighter, 'cloak'); break;
    case 'empower': give(fighter, 'empower', { charges: move.charges }); break;
    case 'levitate': give(fighter, 'levitate'); body.vy = 0; break;
    case 'rage':
      give(fighter, 'rage');
      fighter.stunnedUntil = Math.min(fighter.stunnedUntil, now);
      if (fighter.heldBy) { fighter.events.push({ type: 'freed', at: now, from: fighter.heldBy }); fighter.heldBy = null; }
      break;
    case 'misdirect': {
      const [target] = targetsInReach(world, fighter, body, move, true);
      if (target) give(target, 'misdirected', { by: fighter.id });
      break;
    }
    case 'mend': {
      const ally = alliesInReach(world, fighter, body, move)[0] || fighter;
      give(ally, 'mend', { perSec: move.heal / move.effectSeconds, by: fighter.id });
      effects.push({ type: 'heal', by: fighter.id, target: ally.id, amount: move.heal });
      break;
    }
    case 'sanctuary': {
      const zone = { id: world.nextZone++, kind: 'sanctuary', owner: fighter.id, team: fighter.team, x: body.x, z: body.z,
        radius: move.radius ?? SPECIAL_BALANCE.sanctuaryRadius, heal: move.healPerSecond ?? SPECIAL_BALANCE.sanctuaryHealPerSecond, until };
      world.zones.push(zone);
      effects.push({ type: 'zone', ...zone });
      break;
    }
    default: break; // counter: the stance is the move itself (core/combat.mjs answers the strike)
  }
}

/** The allied Sanctuary this fighter stands in right now, or null. */
export function shelterOf(world, fighter, now = world.time) {
  const b = world.bodies.get(fighter.id);
  if (!b) return null;
  return world.zones.find((z) => z.kind === 'sanctuary' && z.until > now && Math.hypot(b.x - z.x, b.z - z.z) <= z.radius
    && (z.team !== null && z.team !== undefined ? z.team === fighter.team : z.owner === fighter.id)) || null;
}
/** Does an allied Sanctuary shelter this fighter right now? */
export const shelteredAt = (world, fighter, now = world.time) => !!shelterOf(world, fighter, now);

function stepHeals(world, dt, now) {
  for (const f of world.fighters.values()) {
    if (f.vitals.dead) continue;
    let perSec = effectOn(f, 'mend', now)?.perSec || 0;
    const dome = world.zones.length ? shelterOf(world, f, now) : null;
    if (dome) perSec += dome.heal ?? SPECIAL_BALANCE.sanctuaryHealPerSecond;
    perSec += selfMend(f, now); // the Healer's passive
    if (perSec > 0) f.vitals.hp = Math.min(f.vitals.max.hp, f.vitals.hp + perSec * dt);
  }
  if (world.zones.length) world.zones = world.zones.filter((z) => z.until > now);
}

function startMotion(body, fighter, id) {
  const move = moveFor(fighter, id);
  // strikes and powers whose clip travels: the body follows the clip (the facing of the moment, every step)
  if (hasClipTravel(id)) { body.motion = { id, clip: true, forward: 0, right: 0 }; return; }
  if (!move?.rootMotion && !move?.air) { body.motion = null; return; }
  // rolls and dashes go where the stick points (or straight ahead); strikes lunge forward
  const dir = move.kind === 'movement' && Math.hypot(body.intent.x, body.intent.z) > 0.1
    ? { x: body.intent.x / Math.hypot(body.intent.x, body.intent.z), z: body.intent.z / Math.hypot(body.intent.x, body.intent.z) }
    : forwardOf(body.yaw);
  if (move.kind === 'movement' && !body.strafe) body.yaw = Math.atan2(dir.x, dir.z);
  const from = move.kind === 'movement' ? 0 : move.startup;
  // a jump keeps the speed the body had as it left the ground; a roll or a dash covers its own distance
  const distance = move.air ? (body.speed || 0) * move.active : move.rootMotion * (id === 'roll' ? rollReach(fighter) : 1);
  body.motion = { id, dir, from, to: from + move.active, distance, done: 0 };
}

function moveBody(world, fighter, body, dt, now) {
  let vx = 0;
  let vz = 0;
  const a = fighter.action;
  if (fighter.heldBy) {
    // hanging in the holder's grip
    const holder = world.bodies.get(fighter.heldBy);
    if (holder) {
      const f = forwardOf(holder.yaw);
      body.x = holder.x + f.x * GRIP_HOLD.distance;
      body.z = holder.z + f.z * GRIP_HOLD.distance;
      body.y += (GRIP_HOLD.lift - body.y) * Math.min(1, dt * 10);
      body.vy = 0;
      body.kx = 0; body.kz = 0;
      body.moving = false; body.speed = 0;
      return;
    }
  }
  if (body.motion?.clip && a?.id === body.motion.id) {
    const travel = travelAt(a.id, a.t);
    const df = travel.forward - body.motion.forward;
    const dr = travel.right - body.motion.right;
    body.motion.forward = travel.forward;
    body.motion.right = travel.right;
    const f = forwardOf(body.yaw);
    vx += (f.x * df - f.z * dr) / dt; // right of the facing is (-f.z, f.x)
    vz += (f.z * df + f.x * dr) / dt;
    body.speed = 0;
  } else if (body.motion && !body.motion.clip && a?.id === body.motion.id) {
    const { from, to, distance: d, dir } = body.motion;
    const span = Math.max(1e-6, to - from);
    const progress = Math.max(0, Math.min(1, (a.t - from) / span));
    const target = progress * d;
    const stepDist = target - body.motion.done;
    body.motion.done = target;
    vx += (dir.x * stepDist) / dt;
    vz += (dir.z * stepDist) / dt;
    if (a.move.leap) { body.y = 4 * a.move.leap * progress * (1 - progress); body.vy = 0; }
  } else {
    body.motion = null;
    // feet are planted from a strike's or a power's wind-up until it lands; the recovery may walk away
    const planted = a && a.move.kind !== 'movement' && !a.move.channel && a.t < a.move.startup + a.move.active;
    const free = !fighter.vitals.dead && !isStunned(fighter, now) && !planted;
    const len = Math.hypot(body.intent.x, body.intent.z);
    if (free && len > 0.01) {
      let speed = body.run ? MOVE_SPEED.run : MOVE_SPEED.walk;
      if (body.sprint && !fighter.vitals.winded && len > 0.5) {
        drainStamina(fighter.vitals, SPRINT.staminaPerSec * dt, now);
        speed = SPRINT.speed;
      }
      // a raised guard and a channelled grip slow you to a walk
      if (fighter.guard || a?.move.channel) speed = Math.min(speed, MOVE_SPEED.walk * 0.8);
      speed *= moveRate(fighter, now);
      vx += body.intent.x * speed;
      vz += body.intent.z * speed;
      body.speed = speed * len;
    } else body.speed = 0;
  }
  // knockback, decaying
  vx += body.kx;
  vz += body.kz;
  const decay = Math.exp(-KNOCKBACK_DECAY * dt);
  body.kx *= decay;
  body.kz *= decay;
  if (Math.hypot(body.kx, body.kz) < 0.05) { body.kx = 0; body.kz = 0; }
  if (world.level) {
    // in rooms: short steps, so a dash or a hard push never passes through a wall
    const dx = vx * dt;
    const dz = vz * dt;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.2));
    for (let i = 0; i < n; i++) {
      body.x += dx / n;
      body.z += dz / n;
      if (resolveCircle(world.level, body, BODY_RADIUS)) { body.kx *= 0.5; body.kz *= 0.5; }
    }
  } else {
    body.x += vx * dt;
    body.z += vz * dt;
  }
  body.moving = Math.hypot(vx, vz) > 0.1;
  const leaping = !!(a?.move.leap && body.motion && !body.motion.clip && a.id === body.motion.id);
  if (effectOn(fighter, 'levitate', now)) {
    body.y += (EFFECTS.levitate.height - body.y) * Math.min(1, dt * 4);
    body.vy = 0;
  } else if (leaping) {
    // the arc is drawn by the root motion above
  } else if (body.y > 0 || body.vy > 0) { // falling back down after a throw, a release or a float
    body.vy -= GRAVITY * dt;
    body.y = Math.max(0, body.y + body.vy * dt);
    if (body.y === 0) body.vy = 0;
  }
  keepInside(world, body);
}

// the arena's edge, or the rooms' walls
function keepInside(world, body) {
  if (world.level) { resolveCircle(world.level, body, BODY_RADIUS); return; }
  const r = Math.hypot(body.x, body.z);
  const limit = world.arenaRadius - BODY_RADIUS;
  if (r > limit) { body.x *= limit / r; body.z *= limit / r; }
}

// keep bodies from overlapping (a held body is the holder's business)
function separate(world) {
  const list = [...world.fighters.values()].filter((f) => !f.vitals.dead && !f.heldBy);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = world.bodies.get(list[i].id);
      const b = world.bodies.get(list[j].id);
      const d = distance(a, b);
      const min = BODY_RADIUS * 2;
      if (d >= min) continue;
      const nx = d > 1e-6 ? (b.x - a.x) / d : 1;
      const nz = d > 1e-6 ? (b.z - a.z) / d : 0;
      const push = (min - d) / 2;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
    }
  }
}

// Everyone (or the nearest one) the move reaches from where the attacker stands, facing where it faces.
export function targetsInReach(world, attacker, body, move, single) {
  const found = [];
  for (const other of world.fighters.values()) {
    if (!hostile(world, attacker, other) || other.vitals.dead) continue;
    const ob = world.bodies.get(other.id);
    const d = distance(body, ob);
    if (d > move.range + BODY_RADIUS) continue;
    if (!insideArc(body, body.yaw, ob, move.arc)) continue;
    if (world.level && !clearLine(world.level, body, ob)) continue; // nothing reaches through a wall
    found.push({ fighter: other, d });
  }
  found.sort((p, q) => p.d - q.d);
  return single ? found.slice(0, 1).map((t) => t.fighter) : found.map((t) => t.fighter);
}

function resolveReach(world, attacker, body, id, effects, now) {
  const move = moveFor(attacker, id);
  // the throw reaches the one being held, wherever it hangs
  if (id === 'gripThrow') {
    const held = [...world.fighters.values()].find((f) => f.heldBy === attacker.id);
    if (held) collect(effects, strike(attacker, held, id, { now }), attacker, held, world);
    return;
  }
  if (move.execute) {
    const target = world.fighters.get(attacker.specialTarget);
    attacker.specialTarget = null;
    if (target && !target.vitals.dead && distance(world.bodies.get(target.id), body) <= move.range + BODY_RADIUS + 0.8) {
      collect(effects, strike(attacker, target, id, { now }), attacker, target, world);
    }
    return;
  }
  for (const target of targetsInReach(world, attacker, body, move, SINGLE_TARGET.has(id))) {
    const tb = world.bodies.get(target.id);
    collect(effects, strike(attacker, target, id, { now, defenderFacesAttacker: insideArc(tb, tb.yaw, body, BLOCK.frontArcDeg),
      behind: behindTarget(body, tb), sheltered: shelteredAt(world, target, now) }), attacker, target, world);
  }
}

function collect(effects, outcome, attacker, defender, world) {
  if (!outcome) return;
  for (const effect of outcome.effects) {
    effects.push(effect);
    if (effect.type === 'knockback' && world) {
      const from = world.bodies.get(attacker.id);
      const to = world.bodies.get(defender.id);
      let dx = to.x - from.x;
      let dz = to.z - from.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      to.kx += dx * effect.distance * KNOCKBACK_DECAY;
      to.kz += dz * effect.distance * KNOCKBACK_DECAY;
      if (effect.distance > 3) to.vy = Math.max(to.vy, 3.5); // a hard push lifts the body off its feet
    }
  }
}

function releaseHeld(world, holder) {
  for (const f of world.fighters.values()) if (f.heldBy === holder.id) f.heldBy = null;
}

function spawnProjectile(world, fighter, body, id, effects) {
  const move = moveFor(fighter, id);
  const dir = forwardOf(body.yaw);
  const p = { id: world.nextProjectile++, owner: fighter.id, move: id, x: body.x + dir.x * 0.6, z: body.z + dir.z * 0.6,
    dir, speed: move.projectileSpeed || PROJECTILE_SPEED[id] || 60, left: move.range };
  world.projectiles.push(p);
  effects.push({ type: 'projectile', id: p.id, owner: fighter.id, move: id, x: p.x, z: p.z, dir, speed: p.speed });
}

function stepProjectiles(world, dt, now, effects) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    let travel = Math.min(p.left, p.speed * dt);
    const owner = world.fighters.get(p.owner);
    // a wall, a crate or a closed door stops it
    let wall = false;
    if (world.level) {
      const toWall = rayDistance(world.level, p, p.dir, travel);
      if (toWall < travel) { travel = toWall; wall = true; }
    }
    // the first hostile body along this step's segment
    let hit = null;
    let best = Infinity;
    for (const other of world.fighters.values()) {
      if (!owner || !hostile(world, owner, other) || other.vitals.dead) continue;
      const b = world.bodies.get(other.id);
      const rx = b.x - p.x;
      const rz = b.z - p.z;
      const along = rx * p.dir.x + rz * p.dir.z;
      if (along < -BODY_RADIUS || along > travel + BODY_RADIUS) continue;
      const side = Math.abs(rx * p.dir.z - rz * p.dir.x);
      if (side <= BODY_RADIUS + 0.05 && along < best) { best = along; hit = other; }
    }
    if (hit && owner) {
      const hb = world.bodies.get(hit.id);
      const ob = { x: p.x, z: p.z };
      collect(effects, strike(owner, hit, p.move, { now, defenderFacesAttacker: insideArc(hb, hb.yaw, ob, BLOCK.frontArcDeg),
        sheltered: shelteredAt(world, hit, now) }), owner, hit, world);
      effects.push({ type: 'projectileEnd', id: p.id, hit: hit.id });
      world.projectiles.splice(i, 1);
      continue;
    }
    p.x += p.dir.x * travel;
    p.z += p.dir.z * travel;
    p.left -= travel;
    if (wall || p.left <= 1e-6 || (!world.level && Math.hypot(p.x, p.z) > world.arenaRadius)) {
      effects.push({ type: 'projectileEnd', id: p.id, hit: null });
      world.projectiles.splice(i, 1);
    }
  }
}

// a move whose hit is a shot that flies (an arrow, a sidearm's bolt)
function isShot(id) {
  const move = moveById(id);
  return move?.damageKind === 'projectile';
}

export { MOVES };
