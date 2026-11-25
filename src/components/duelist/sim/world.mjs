// Duelist Adventure arena simulation: bodies in a circular arena, or in a mission's rooms (a level: walls,
// doors and cover, sim/level.mjs), driven by the rules core.
// Headless and deterministic (the caller passes dt): the match server runs it as the authority, the
// browser runs it for practice and for prediction. It decides who each landed move reaches; the core
// decides what happens to them.
import {
  MOVES, BLOCK, MOVE_SPEED, SPRINT, moveById,
  createFighter, press, update, takeEvents, isStunned, strike, insideArc, travelAt, hasClipTravel,
  blockedReason, isInvulnerable, classById, evaluateSpecial, behindTarget, SPECIAL_BALANCE,
  EFFECTS, effectOn, addEffect, endEffect, actionRate, moveRate, rollReach, moveFor, selfMend,
  stagger, controlImmune, hitDominated, targetable, classAbilityMove,
} from '../core/index.mjs';
import { resolveCircle, clearLine, rayDistance } from './level.mjs';
import { arenaGrounded, moveArenaBody, arenaLineClear, arenaRayFraction, arenaBodyBlockers, ARENA_BODY_HEIGHT, recoverArenaFootprint } from './modeArenaLayout.mjs';
import { spendStamina } from '../core/vitals.mjs';
import { stickDirection } from '../core/cuts.mjs';

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
// In the air (owner, 2026-11-22): Dash dashes, once per jump: jump, dash, jump again, dash again. As far as a roll.
export const AIR_DASH = Object.freeze({ minHeight: 0.12, distance: 7 });
// the second jump, in the air: as high as the first, once between the ground and the ground
export const AIR_JUMP = Object.freeze({ minHeight: 0.08 });
// in a mission's rooms the feet go no higher than this (the depot's 4.2 m ceiling less a body)
export const ROOM_HEADROOM = 2.2;
export const ACTIVE_RELIC = Object.freeze({ anchorWindow: 12, teleportCooldown: 28, stasisSeconds: 1.5, stasisCooldown: 35 });

// zones: places an ability made (a Sanctuary dome: { id, kind, owner, team, x, z, radius, until })
export function createWorld({ arenaRadius = 18, friendlyFire = false, level = null, arenaLayout = null } = {}) {
  return { time: 0, arenaRadius, friendlyFire, level, arenaLayout, fighters: new Map(), bodies: new Map(), projectiles: [], nextProjectile: 1,
    zones: [], nextZone: 1 };
}

/**
 * vitals: maximums that differ from a duelist's ({ hp, will, shield, stamina }). A fighter with no Will has
 * no Veil at all (an ordinary person: every blow reaches armor and body, and a grip holds them).
 */
export function addFighter(world, { id, team = null, weapon = 'sword', x = 0, z = 0, yaw = 0, vitals = null, classId = null, level = 1, matchBoost = 0 } = {}) {
  const fighter = createFighter({ id, team, weapon, vitals, classId, level, matchBoost });
  if (fighter.vitals.max.will <= 0) fighter.vitals.collapsed = true;
  world.fighters.set(id, fighter);
  world.bodies.set(id, newBody(x, z, yaw));
  return fighter;
}

/** A fallen (or any) fighter back at a spawn with fresh vitals; nothing reaches it for `protect` seconds. */
export function respawnFighter(world, id, { x = 0, z = 0, yaw = 0, protect = 0, weapon = null, classId = undefined, level = undefined, matchBoost = undefined } = {}) {
  const old = world.fighters.get(id);
  if (!old) return null;
  const fighter = createFighter({ id, team: old.team, weapon: weapon ?? old.weapon, classId: classId === undefined ? old.classId : classId,
    level: level === undefined ? old.level : level,
    matchBoost: matchBoost === undefined ? old.matchBoost : matchBoost, items: old.items || [] });
  fighter.meter = old.meter;
  fighter.protectedUntil = world.time + protect;
  world.fighters.set(id, fighter);
  world.bodies.set(id, newBody(x, z, yaw));
  for (const f of world.fighters.values()) { if (f.heldBy === id) f.heldBy = null; if (f.seizedBy === id) f.seizedBy = null; }
  return fighter;
}

/** Take a fighter out of the arena (a player who left, a bot whose seat a player took). */
export function removeFighter(world, id) {
  for (const f of world.fighters.values()) { if (f.heldBy === id) f.heldBy = null; if (f.seizedBy === id) f.seizedBy = null; }
  world.fighters.delete(id);
  world.bodies.delete(id);
  for (let i = world.projectiles.length - 1; i >= 0; i--) if (world.projectiles[i].owner === id) world.projectiles.splice(i, 1);
}

function newBody(x, z, yaw) {
  return {
    x, z, y: 0, yaw, vy: 0,
    // Client prediction and the match server share this transient state. It resets on landing.
    // jumped: in the air from a jump; airJumpAt: when the second jump was made; airDashReady: a dash is left for
    // this jump (each jump gives one)
    jumped: false, airJumpAt: null, airDashReady: false,
    intent: { x: 0, z: 0 }, run: false, sprint: false, strafe: false,
    kx: 0, kz: 0, // knockback velocity (m/s)
    motion: null, // root motion of the current move: { id, dir: {x,z}, from, to, distance, done }
    moving: false, speed: 0,
  };
}

export const bodyOf = (world, id) => world.bodies.get(id);
export const forwardOf = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

// The way the stick is held as a strike is pressed, relative to the facing: one of eight ways (forward, forwardRight,
// right, ...) or null for a light touch. A light strike takes it: the sword's cuts by direction (core/cuts.mjs); the
// other forms read it as forward, side or back (core/moves.mjs FLOW).
export function strikeDirection(body) {
  const f = forwardOf(body.yaw);
  const ahead = body.intent.x * f.x + body.intent.z * f.z;
  const right = body.intent.z * f.x - body.intent.x * f.z;
  return stickDirection(ahead, right);
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const airborne = (world, body, min = 0.01) => world.arenaLayout ? !arenaGrounded(world.arenaLayout, body, BODY_RADIUS) : body.y > min;
const visible = (world, a, b) => (!world.level || clearLine(world.level,a,b)) && (!world.arenaLayout || arenaLineClear(world.arenaLayout,a,b));
// a move whose arc is not centred on the facing (the backhand reaches the sword side and behind): radians to the left
const arcTurn = (move) => (move.arcTurn || 0) * Math.PI / 180;
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
  // Expired anchors cannot be retrieved for free after their twelve-second window.
  for (const f of world.fighters.values()) if (f.activeAnchorAt && f.activeAnchorAt.until <= now) {
    f.activeAnchorAt = null;
    f.activeRelicCooldownUntil = now + ACTIVE_RELIC.teleportCooldown;
  }
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
    // the fighter the player is locked on to (an id): targeted abilities take it when it qualifies (chosenTarget).
    // A client says it every frame (null: no lock); an input without the field leaves the last one as it was.
    if (Object.hasOwn(input, 'target')) fighter.lock = typeof input.target === 'string' && input.target !== id ? input.target : null;
    // a taunt is cut short by moving off
    if (fighter.action?.move.kind === 'emote' && len > 0.2) {
      fighter.events.push({ type: 'interrupt', id: fighter.action.id, by: 'move', at: now });
      fighter.action = null;
    }
    const restrained = fighter.vitals.dead || isStunned(fighter, now) || fighter.heldBy;
    // Rolls and dashes keep their chosen travel heading. Blade attacks must keep
    // tracking the camera/lock-on aim while W/A/S/D controls movement independently.
    // Rate-limit turns *during* a swing so a forged packet cannot teleport the hit
    // arc 180 degrees in one simulation frame. Before the strike starts, normal
    // facing input is applied immediately.
    const a = fighter.action;
    const committed = !!a && a.move.kind === 'movement';
    if (!restrained && !committed && Number.isFinite(input.face)) {
      if (a?.move.kind === 'attack') {
        const delta = Math.atan2(Math.sin(input.face - body.yaw), Math.cos(input.face - body.yaw));
        const limit = 12 * dt; // radians per second, shared by server and local prediction
        body.yaw += Math.max(-limit, Math.min(limit, delta));
      } else body.yaw = input.face;
    }
    for (const command of input.presses || []) {
      if (command === 'itemActive') {
        activateItemRelic(world, fighter, body, now, effects);
        continue;
      }
      if (now < (fighter.activeRelicUntil ?? -Infinity)) continue; // Stasis cannot attack, dodge or capture
      // In the air, Dash is the air dash: one for each jump (the jump's own, then the second jump's). Packets cannot
      // ask for '#airDash' directly; the world checks the jump and the height.
      if (command === 'dash' && (body.jumped || airborne(world, body, AIR_DASH.minHeight))) {
        if (!restrained && body.jumped && body.airDashReady && airborne(world, body, AIR_DASH.minHeight) && airborneAction(fighter)) {
          if (fighter.action?.id === 'airDash') { fighter.events.push({ type: 'interrupt', id: 'airDash', by: 'airDash', at: now }); fighter.action = null; }
          const result = press(fighter, '#airDash', now);
          if (result.accepted) {
            body.airDashReady = false;
            body.vy = 0; // it hangs at its height through the burst; gravity takes over again after it
            startMotion(body, fighter, 'airDash', world);
            effects.push({ type: 'airDash', by: id, distance: AIR_DASH.distance });
          }
        }
        continue; // never turn an airborne press into a ground dash
      }
      // In the air, Jump is the second jump: as high as the first, once, and it gives another dash.
      if (command === 'jump' && (body.jumped || airborne(world, body))) {
        if (body.jumped && airborne(world, body, AIR_JUMP.minHeight) && body.airJumpAt == null && !restrained &&
            now >= fighter.riseUntil && airborneAction(fighter) &&
            !effectOn(fighter, 'levitate', now) && spendStamina(fighter.vitals, MOVES.jump.stamina, now)) {
          if (fighter.action?.id === 'airDash') { fighter.events.push({ type: 'interrupt', id: 'airDash', by: 'jump', at: now }); fighter.action = null; }
          body.vy = Math.sqrt(2 * GRAVITY * MOVES.jump.leap);
          body.airJumpAt = now;
          body.airDashReady = true;
          body.motion = null;
          effects.push({ type: 'airJump', by: id });
        }
        continue;
      }
      if (command === 'special') { trySpecial(world, fighter, body, now, effects); continue; }
      // an ability that works on one enemy (Levitate, Mind Dominance) is refused, not wasted, with nobody to take it
      const slot = /^ability([1-4])$/.exec(command);
      const abilityId = slot && fighter.classId ? classAbilityMove(fighter.classId, Number(slot[1]) - 1) : null;
      if (abilityId && MOVES[abilityId]?.needsTarget && !blockedReason(fighter, abilityId, now) &&
          !chosenTarget(world, fighter, body, moveFor(fighter, abilityId), 'enemy', now)) {
        effects.push({ type: 'abilityRefused', by: id, ability: abilityId, reason: 'no-target' });
        continue;
      }
      const before = fighter.action?.id;
      const res = press(fighter, command, now, command === 'light' ? { direction: strikeDirection(body) } : undefined);
      if (res.accepted && res.id && res.id !== before) startMotion(body, fighter, res.id, world);
    }
  }
  // 2. the rules advance; moves that start from the buffer get their root motion too
  const pending = [];
  for (const [id, fighter] of world.fighters) {
    const body = world.bodies.get(id);
    update(fighter, dt, now, actionRate(fighter, now));
    for (const event of takeEvents(fighter)) {
      if (event.type === 'start' && body.motion?.id !== event.id) startMotion(body, fighter, event.id, world);
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
  for (const [id, fighter] of world.fighters) {
    const body=world.bodies.get(id);
    if (!world.arenaLayout) { moveBody(world,fighter,body,dt,now); continue; }
    const before={x:body.x,y:body.y,z:body.z};
    moveBody(world,fighter,body,dt,now);
    const delta={x:body.x-before.x,y:body.y-before.y,z:body.z-before.z};
    Object.assign(body,before);
    const result=moveArenaBody(world.arenaLayout,body,delta.x,delta.z,delta.y,BODY_RADIUS,!fighter.heldBy && !fighter.seizedBy && !body.jumped);
    if(result.ceiling || result.landed && body.vy<0)body.vy=0;
    if(arenaGrounded(world.arenaLayout,body,BODY_RADIUS) && body.vy<=0 && fighter.action?.id!=='jump'){
      body.jumped=false;body.airJumpAt=null;body.airDashReady=false;
    }
  }
  const beforeSeparate=world.arenaLayout ? new Map([...world.bodies].map(([id,b])=>[id,{x:b.x,z:b.z}])) : null;
  separate(world);
  for (const [id,body] of world.bodies) {
    if(beforeSeparate){
      const before=beforeSeparate.get(id),dx=body.x-before.x,dz=body.z-before.z;
      Object.assign(body,before);
      moveArenaBody(world.arenaLayout,body,dx,dz,0,BODY_RADIUS,false);
    }
    keepInside(world,body);
  }
  // 4. landed moves reach whoever is in range and arc
  for (const { fighter, body, event } of pending) {
    if (event.type === 'hit') {
      if (moveById(event.id)?.effect) applyEffectMove(world, fighter, body, event.id, effects, now);
      else if (isShot(event.id)) spawnProjectile(world, fighter, body, event.id, effects);
      else resolveReach(world, fighter, body, event.id, effects, now, event.index || 0);
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
  const move = moveFor(fighter, special.id); // applies trusted class mastery and current match boost
  const reach = move.reach ?? move.range ?? special.reach;
  const matchBoost = fighter.matchBoost;
  const actor = { id: fighter.id, team: fighter.team, hp: fighter.vitals.hp, position: body };
  let verdict = null;
  let target = null;
  // cloaked, the Shadow Execution reaches farther (it steps to the target's back first: move.blink)
  const cloaked = !!(move.blink && effectOn(fighter, 'cloak', now));
  const seekReach = cloaked ? move.blink.reach : reach;
  const seekArc = cloaked ? move.blink.arc : move.arc;
  if (special.target === 'enemy') {
    const near = [...world.fighters.values()]
      .filter((o) => hostile(world, fighter, o) && !o.vitals.dead && targetable(o, world.bodies.get(o.id), fighter, body, now))
      .map((o) => ({ o, b: world.bodies.get(o.id) }))
      .filter(({ o, b }) => distance(b, body) <= seekReach + BODY_RADIUS
        && (o.id === fighter.lock || insideArc(body, body.yaw + arcTurn(move), b, seekArc))
        && visible(world,body,b) && (!world.arenaLayout || Math.abs(body.y-b.y)<2))
      // the one the fighter is locked on to first, then the nearest
      .sort((p, q) => (q.o.id === fighter.lock) - (p.o.id === fighter.lock) || distance(p.b, body) - distance(q.b, body));
    for (const { o, b } of near) {
      verdict = evaluateSpecial({ classId: fighter.classId, meter: fighter.meter, actor, now, matchBoost, level: fighter.level, cloaked, target: { id: o.id, team: o.team,
        hp: o.vitals.hp, maxHp: o.vitals.max.hp, position: { x: b.x, z: b.z, yaw: b.yaw }, protectedUntil: o.protectedUntil, invulnerable: isInvulnerable(o, now) } });
      if (verdict.allowed) { target = o; break; }
    }
    if (!verdict) verdict = evaluateSpecial({ classId: fighter.classId, meter: fighter.meter, actor, now, matchBoost, level: fighter.level, cloaked });
  } else verdict = evaluateSpecial({ classId: fighter.classId, meter: fighter.meter, actor, now, matchBoost, level: fighter.level });
  const blocked = verdict.allowed ? blockedReason(fighter, special.id, now) : null;
  if (!verdict.allowed || blocked) { effects.push({ type: 'specialRefused', by: fighter.id, reason: verdict.allowed ? blocked : verdict.reason }); return; }
  if (fighter.action) { fighter.events.push({ type: 'interrupt', id: fighter.action.id, by: special.id, at: now }); fighter.action = null; }
  fighter.buffer = null;
  const res = press(fighter, '#' + special.id, now);
  if (!res.accepted || !res.id) { effects.push({ type: 'specialRefused', by: fighter.id, reason: res.reason || 'busy' }); return; }
  fighter.meter = verdict.meterAfter;
  fighter.specialTarget = target?.id || null;
  effects.push({ type: 'special', by: fighter.id, special: special.id, cost: verdict.cost, target: target?.id || null });
  if (target && verdict.blink) blinkBehind(world, fighter, body, target, move, now, effects);
  if (target) face(body, world.bodies.get(target.id));
  startMotion(body, fighter, special.id, world);
  // the Execution seizes its target: it is drawn in and held, helpless, until the blade goes in
  if (target && move.seize) {
    target.seizedBy = fighter.id;
    target.seizedUntil = now + move.startup + move.active;
    stagger(target, move.startup + move.active + 0.05, now);
    if (target.heldBy) target.heldBy = null;
    effects.push({ type: 'seized', by: fighter.id, target: target.id, until: target.seizedUntil });
  }
}

// turn a body to look at another
function face(body, other) {
  if (!other) return;
  const dx = other.x - body.x;
  const dz = other.z - body.z;
  if (Math.hypot(dx, dz) > 1e-6) body.yaw = Math.atan2(dx, dz);
}

/** Cloaked, the Shadow Execution steps through the veil to its target's back (and the cloak falls away). */
function blinkBehind(world, fighter, body, target, move, now, effects) {
  const tb = world.bodies.get(target.id);
  const back = forwardOf(tb.yaw);
  const from = { x: body.x, z: body.z }, previousY=body.y;
  body.x = tb.x - back.x * move.blink.behind;
  body.z = tb.z - back.z * move.blink.behind;
  body.y = world.arenaLayout ? tb.y : 0; body.vy = 0; body.kx = 0; body.kz = 0; body.motion = null;
  if(world.arenaLayout && arenaBodyBlockers(world.arenaLayout,{...body,radius:BODY_RADIUS,height:ARENA_BODY_HEIGHT}).length){body.x=from.x;body.z=from.z;body.y=previousY;}
  keepInside(world, body);
  endEffect(fighter, 'cloak');
  effects.push({ type: 'uncloak', fighter: fighter.id });
  effects.push({ type: 'blink', by: fighter.id, target: target.id, from, to: { x: body.x, z: body.z } });
  // the target cannot turn round in the moment before the blade
  stagger(target, move.startup + 0.1, now);
}

/**
 * The one an ability works on: the fighter the player is locked on to when it qualifies (the right side, alive,
 * within reach, in sight, not hidden by a cloak); with no lock, an enemy ability takes the nearest enemy in its arc
 * and an ally ability nobody (Mend then heals the healer). move: the ability at its rank; side: 'enemy' | 'ally'.
 */
export function chosenTarget(world, fighter, body, move, side, now = world.time) {
  const reach = (move.seek ?? move.range) + BODY_RADIUS;
  const qualifies = (o) => {
    if (!o || o === fighter || o.vitals.dead) return false;
    if (side === 'enemy' ? !hostile(world, fighter, o) : hostile(world, fighter, o)) return false;
    const ob = world.bodies.get(o.id);
    if (!ob || distance(body, ob) > reach) return false;
    if (!visible(world, body, ob) || (world.arenaLayout && Math.abs(body.y-ob.y)>1.8)) return false;
    return side === 'ally' || targetable(o, ob, fighter, body, now);
  };
  const locked = fighter.lock ? world.fighters.get(fighter.lock) : null;
  if (qualifies(locked)) return locked;
  if (side === 'ally') return null;
  const arc = move.seekArc ?? move.arc;
  let best = null;
  for (const o of world.fighters.values()) {
    if (!qualifies(o)) continue;
    const ob = world.bodies.get(o.id);
    if (!insideArc(body, body.yaw + arcTurn(move), ob, arc)) continue;
    const d = distance(body, ob);
    if (!best || d < best.d) best = { o, d };
  }
  return best?.o || null;
}

// a fighter in the air whose action lets it jump or dash again
const airborneAction = (fighter) => !fighter.action || fighter.action.id === 'jump' || fighter.action.id === 'airDash';

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
    case 'levitate': case 'dominate': {
      // Levitate lifts the enemy off its feet, Mind Dominance holds it where it stands: helpless either way
      const target = chosenTarget(world, fighter, body, move, 'enemy', now);
      if (!target) { effects.push({ type: 'abilityMissed', by: fighter.id, ability: id }); break; }
      if (isInvulnerable(target, now) || controlImmune(target, now)) {
        effects.push({ type: 'resisted', attacker: fighter.id, defender: target.id });
        break;
      }
      if (move.effect === 'levitate') {
        give(target, 'levitate', { by: fighter.id });
        const tb = world.bodies.get(target.id);
        tb.vy = 0; tb.kx = 0; tb.kz = 0; tb.motion = null;
      } else give(target, 'dominated', { by: fighter.id, hits: 0, breakHits: move.breakHits || EFFECTS.dominate.breakHits });
      stagger(target, move.effectSeconds, now);
      if (target.heldBy) target.heldBy = null;
      break;
    }
    case 'rage':
      give(fighter, 'rage');
      fighter.stunnedUntil = Math.min(fighter.stunnedUntil, now);
      if (fighter.heldBy) { fighter.events.push({ type: 'freed', at: now, from: fighter.heldBy }); fighter.heldBy = null; }
      break;
    case 'mend': {
      // the ally the healer is locked on to, or the healer herself (owner, 2026-11-22: it is up to her)
      const ally = chosenTarget(world, fighter, body, move, 'ally', now) || fighter;
      const passives = fighter.shopStats?.passive || {};
      const healAmount = move.heal * (1 + (passives.healAmp || 0));
      give(ally, 'mend', { perSec: healAmount / move.effectSeconds, by: fighter.id });
      effects.push({ type: 'heal', by: fighter.id, target: ally.id, amount: healAmount });
      // Support procs only for an ally who actually needs healing.
      if (ally !== fighter && ally.vitals.hp < ally.vitals.max.hp) {
        if (passives.onAllyHealHaste) fighter.shopSpeedUntil = Math.max(fighter.shopSpeedUntil, now + 3);
        if ((fighter.shopHealProcAt ?? -Infinity) + 8 <= now) {
          fighter.shopHealProcAt = now;
          if (passives.onAllyHealShield) ally.vitals.shield = Math.min(ally.vitals.max.shield, ally.vitals.shield + passives.onAllyHealShield);
          if (passives.onAllyHealWill) fighter.vitals.will = Math.min(fighter.vitals.max.will, fighter.vitals.will + passives.onAllyHealWill);
          if (passives.onAllyHealPulse) fighter.vitals.hp = Math.min(fighter.vitals.max.hp, fighter.vitals.hp + passives.onAllyHealPulse *
            (fighter.healReducedUntil > now ? 1 - fighter.healReduction : 1));
        }
      }
      break;
    }
    case 'sanctuary': {
      const zone = { id: world.nextZone++, kind: 'sanctuary', owner: fighter.id, team: fighter.team, x: body.x, z: body.z, ...(world.arenaLayout ? {y:body.y} : {}),
        radius: move.radius ?? SPECIAL_BALANCE.sanctuaryRadius, heal: move.healPerSecond ?? SPECIAL_BALANCE.sanctuaryHealPerSecond, until };
      world.zones.push(zone);
      effects.push({ type: 'zone', ...zone, seconds: move.effectSeconds });
      break;
    }
    default: break; // counter: the stance is the move itself (core/combat.mjs answers the strike)
  }
}

/** The allied Sanctuary this fighter stands in right now, or null. */
export function shelterOf(world, fighter, now = world.time) {
  const b = world.bodies.get(fighter.id);
  if (!b) return null;
  return world.zones.find((z) => z.kind === 'sanctuary' && z.until > now && Math.hypot(b.x - z.x, b.z - z.z) <= z.radius && (!world.arenaLayout || Math.abs(b.y-(z.y??0))<1.8 && arenaLineClear(world.arenaLayout,b,z))
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
    if (perSec > 0) f.vitals.hp = Math.min(f.vitals.max.hp, f.vitals.hp + perSec * dt * (f.healReducedUntil > now ? 1 - f.healReduction : 1));
  }
  if (world.zones.length) world.zones = world.zones.filter((z) => z.until > now);
}

/** In-match only, item-gated, shared by the authoritative server and client prediction. */
export function activateItemRelic(world, fighter, body, now, effects = []) {
  if (!fighter || !body || fighter.vitals.dead || isStunned(fighter, now) || fighter.heldBy ||
      now < (fighter.activeRelicUntil ?? -Infinity)) return { ok: false, reason: 'unavailable' };
  const passive = fighter.shopStats?.passive || {};
  if (passive.activeAnchor) {
    if (fighter.activeAnchorAt && fighter.activeAnchorAt.until > now) {
      const mark = fighter.activeAnchorAt;
      body.x = mark.x; body.z = mark.z; body.y = world.arenaLayout ? (mark.y ?? 0) : 0; body.vy = 0; body.motion = null;
      fighter.action = null; fighter.buffer = null;
      fighter.activeAnchorAt = null;
      fighter.activeRelicCooldownUntil = now + ACTIVE_RELIC.teleportCooldown;
      effects.push({ type: 'relicTeleport', by: fighter.id, x: body.x, z: body.z });
      return { ok: true, effect: 'teleport' };
    }
    if (now < (fighter.activeRelicCooldownUntil ?? -Infinity)) return { ok: false, reason: 'cooldown' };
    if (fighter.action) return { ok: false, reason: 'busy' };
    fighter.activeAnchorAt = { x: body.x, z: body.z, ...(world.arenaLayout ? {y:body.y} : {}), until: now + ACTIVE_RELIC.anchorWindow };
    effects.push({ type: 'relicAnchor', by: fighter.id, until: fighter.activeAnchorAt.until });
    return { ok: true, effect: 'anchor' };
  }
  if (passive.activeStasis) {
    if (now < (fighter.activeRelicCooldownUntil ?? -Infinity)) return { ok: false, reason: 'cooldown' };
    if (fighter.action) return { ok: false, reason: 'busy' };
    fighter.guard = null;
    fighter.activeRelicUntil = now + ACTIVE_RELIC.stasisSeconds;
    fighter.activeRelicCooldownUntil = now + ACTIVE_RELIC.stasisCooldown;
    effects.push({ type: 'relicStasis', by: fighter.id, until: fighter.activeRelicUntil });
    return { ok: true, effect: 'stasis' };
  }
  return { ok: false, reason: 'no-active-relic' };
}

function startMotion(body, fighter, id, world = null) {
  const move = moveFor(fighter, id);
  if (id === 'jump') { body.vy = Math.sqrt(2 * GRAVITY * move.leap); body.jumped = true; body.airDashReady = true; body.airJumpAt = null; }
  // Repulse: a hop over the wind-up, landing as it slams (moveBody draws the arc)
  if (move?.hop) { body.motion = { id, dir: forwardOf(body.yaw), from: 0, to: move.startup, distance: 0, done: 0 }; return; }
  // Leap Strike: at the enemy locked on to (or the nearest ahead), landing just short of it
  if (move?.seek && world) {
    const target = chosenTarget(world, fighter, body, move, 'enemy');
    if (target) {
      const tb = world.bodies.get(target.id);
      const d = Math.hypot(tb.x - body.x, tb.z - body.z); // (startMotion has a local named distance)
      face(body, tb);
      const dir = forwardOf(body.yaw);
      body.motion = { id, dir, from: move.startup, to: move.startup + move.active, distance: Math.max(0, Math.min(move.seek, d - move.landShort)), done: 0, baseY: body.y };
      return;
    }
  }
  // strikes and powers whose clip travels: the body follows the clip (the facing of the moment, every step)
  if (hasClipTravel(id) && !move?.mobile) { body.motion = { id, clip: true, forward: 0, right: 0 }; return; }
  if (!move?.rootMotion && !move?.air) { body.motion = null; return; }
  // rolls and dashes go where the stick points (or straight ahead); strikes lunge forward
  const dir = move.kind === 'movement' && Math.hypot(body.intent.x, body.intent.z) > 0.1
    ? { x: body.intent.x / Math.hypot(body.intent.x, body.intent.z), z: body.intent.z / Math.hypot(body.intent.x, body.intent.z) }
    : forwardOf(body.yaw);
  if (move.kind === 'movement' && (!body.strafe || id === 'roll')) body.yaw = Math.atan2(dir.x, dir.z);
  const from = move.kind === 'movement' ? 0 : move.startup;
  // a jump keeps the speed the body had as it left the ground; a roll or a dash covers its own distance
  const distance = move.air ? (body.speed || 0) * move.active : move.rootMotion * (id === 'roll' ? rollReach(fighter) : 1);
  body.motion = { id, dir, from, to: from + move.active, distance, done: 0, baseY: body.y };
}

function moveBody(world, fighter, body, dt, now) {
  if (now < (fighter.activeRelicUntil ?? -Infinity)) {
    body.speed = 0; body.moving = false; body.motion = null;
    body.kx = 0; body.kz = 0; body.vy = 0;
    return; // rooted and invulnerable until the relic ends
  }
  let vx = 0;
  let vz = 0;
  const a = fighter.action;
  if (fighter.seizedBy) {
    // seized by an Execution: drawn in to stand in front of the one who seized it, until the blade goes in
    const holderF = world.fighters.get(fighter.seizedBy);
    const holder = world.bodies.get(fighter.seizedBy);
    if (!holderF || holderF.vitals.dead || !holder || now >= fighter.seizedUntil || fighter.vitals.dead) fighter.seizedBy = null;
    else {
      const f = forwardOf(holder.yaw);
      const seize = moveFor(holderF, 'execution').seize || { distance: 1.05, pull: 0.4 };
      const k = Math.min(1, dt * (3 / Math.max(0.05, seize.pull)));
      body.x += (holder.x + f.x * seize.distance - body.x) * k;
      body.z += (holder.z + f.z * seize.distance - body.z) * k;
      body.y += ((world.arenaLayout ? holder.y : 0) - body.y) * k;
      body.vy = 0; body.kx = 0; body.kz = 0; body.motion = null;
      body.yaw = Math.atan2(holder.x - body.x, holder.z - body.z);
      body.moving = false; body.speed = 0;
      return;
    }
  }
  if (fighter.heldBy) {
    // hanging in the holder's grip
    const holder = world.bodies.get(fighter.heldBy);
    if (holder) {
      const f = forwardOf(holder.yaw);
      body.x = holder.x + f.x * GRIP_HOLD.distance;
      body.z = holder.z + f.z * GRIP_HOLD.distance;
      body.y += ((world.arenaLayout ? holder.y : 0) + GRIP_HOLD.lift - body.y) * Math.min(1, dt * 10);
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
    if (a.move.leap && !a.move.air) { body.y = (world.arenaLayout ? (body.motion.baseY ?? 0) : 0) + 4 * a.move.leap * progress * (1 - progress); body.vy = 0; }
    if (a.move.hop && progress >= 1) body.motion = null; // landed: the slam
  } else {
    body.motion = null;
    // feet are planted from a strike's or a power's wind-up until it lands; the recovery may walk away
    // (a cut by direction does not plant them: the legs keep going under it, at a share of the running speed)
    const planted = a && a.move.kind !== 'movement' && !a.move.channel && !a.move.mobile && a.t < a.move.startup + a.move.active;
    const free = !fighter.vitals.dead && !isStunned(fighter, now) && !planted;
    const len = Math.hypot(body.intent.x, body.intent.z);
    if (free && len > 0.01) {
      let speed = body.run ? MOVE_SPEED.run : MOVE_SPEED.walk;
      // Sprinting is free, including when a fighter has zero stamina or is winded.
      // (not under a cut by direction: the legs keep going at the cut's own pace)
      if (body.sprint && !a?.move.mobile && len > 0.5) speed = SPRINT.speed;
      // a raised guard and a channelled grip slow you to a walk
      if (fighter.guard || a?.move.channel) speed = Math.min(speed, MOVE_SPEED.walk * 0.8);
      if (a?.move.mobile) speed = Math.min(speed, MOVE_SPEED.run * a.move.mobile);
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
  const leaping = !!(a?.move.leap && !a.move.air && body.motion && !body.motion.clip && a.id === body.motion.id);
  if (effectOn(fighter, 'levitate', now)) {
    body.y += ((world.arenaLayout ? Math.max(0, body.y - EFFECTS.levitate.height) : 0) + EFFECTS.levitate.height - body.y) * Math.min(1, dt * 4);
    body.vy = 0;
  } else if (leaping) {
    // the arc is drawn by the root motion above
  } else if (a?.id === 'airDash' && a.t <= a.move.active && body.y > 0) {
    // Pause vertical movement during the short horizontal burst, then resume normal gravity.
    body.vy = 0;
  } else if (body.y > 0 || body.vy > 0) { // falling back down after a throw, a release or a float
    body.vy -= GRAVITY * dt;
    body.y = Math.max(0, body.y + body.vy * dt);
    if (body.y === 0) body.vy = 0;
  }
  if (world.level && body.y > ROOM_HEADROOM) { body.y = ROOM_HEADROOM; body.vy = Math.min(body.vy, 0); }
  if (!world.arenaLayout && body.jumped && body.y <= 0.001 && a?.id !== 'jump') {
    body.jumped = false;
    body.airJumpAt = null;
    body.airDashReady = false;
  }
  keepInside(world, body);
}

// the arena's edge, or the rooms' walls
function keepInside(world, body) {
  if (world.level) { resolveCircle(world.level, body, BODY_RADIUS); return; }
  if(world.arenaLayout?.footprint){recoverArenaFootprint(world.arenaLayout,body,BODY_RADIUS);return;}
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
      if(world.arenaLayout && Math.abs(a.y-b.y)>=ARENA_BODY_HEIGHT)continue;
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
    if (!insideArc(body, body.yaw + arcTurn(move), ob, move.arc)) continue;
    if (!visible(world, body, ob) || (world.arenaLayout && Math.abs(body.y-ob.y)>1.8)) continue; // nothing reaches through a wall
    found.push({ fighter: other, d });
  }
  found.sort((p, q) => p.d - q.d);
  return single ? found.slice(0, 1).map((t) => t.fighter) : found.map((t) => t.fighter);
}

function resolveReach(world, attacker, body, id, effects, now, index = 0) {
  const move = moveFor(attacker, id);
  // the throw reaches the one being held, wherever it hangs
  if (id === 'gripThrow') {
    const held = [...world.fighters.values()].find((f) => f.heldBy === attacker.id);
    if (held) collect(effects, strike(attacker, held, id, { now }), attacker, held, world);
    return;
  }
  if (move.execute) {
    const target = world.fighters.get(attacker.specialTarget);
    // the Execution's second hit: the blade is out, the body is pushed away
    if (index > 0) {
      attacker.specialTarget = null;
      if (target && move.shove) {
        const tb = world.bodies.get(target.id);
        const f = forwardOf(body.yaw);
        tb.kx += f.x * move.shove * KNOCKBACK_DECAY;
        tb.kz += f.z * move.shove * KNOCKBACK_DECAY;
        tb.vy = Math.max(tb.vy, 3);
        effects.push({ type: 'shove', by: attacker.id, target: target.id, distance: move.shove });
      }
      return;
    }
    if (!move.shove) attacker.specialTarget = null;
    if (target && !target.vitals.dead && distance(world.bodies.get(target.id), body) <= move.range + BODY_RADIUS + 0.8) {
      collect(effects, strike(attacker, target, id, { now }), attacker, target, world);
      target.seizedBy = null;
    }
    return;
  }
  for (const target of targetsInReach(world, attacker, body, move, SINGLE_TARGET.has(id))) {
    const tb = world.bodies.get(target.id);
    const outcome = strike(attacker, target, id, { now, defenderFacesAttacker: insideArc(tb, tb.yaw, body, BLOCK.frontArcDeg),
      behind: behindTarget(body, tb), sheltered: shelteredAt(world, target, now) });
    collect(effects, outcome, attacker, target, world);
    // Repulse: thrown up off its feet and drawn in toward the slam, landing on its feet
    if (move.launch && outcome?.result?.outcome === 'hit' && !target.vitals.dead && !controlImmune(target, now)) {
      tb.vy = Math.max(tb.vy, move.launch);
      const d = distance(body, tb);
      const draw = Math.max(0, d - (move.drawTo ?? 1.8));
      if (d > 1e-6 && draw > 0) {
        tb.kx += ((body.x - tb.x) / d) * draw * KNOCKBACK_DECAY;
        tb.kz += ((body.z - tb.z) / d) * draw * KNOCKBACK_DECAY;
      }
      effects.push({ type: 'launched', by: attacker.id, target: target.id, height: move.launch * move.launch / (2 * GRAVITY) });
    }
  }
}

function collect(effects, outcome, attacker, defender, world) {
  if (!outcome) return;
  for (const effect of outcome.effects) {
    effects.push(effect);
    if (effect.type === 'impact' && effect.outcome === 'hit' && world && hitDominated(defender, world.time)) {
      effects.push({ type: 'dominanceBroken', target: defender.id, by: attacker.id });
    }
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
    y: (world.arenaLayout ? body.y : 0) + PROJECTILE_HEIGHT, dir, speed: move.projectileSpeed || PROJECTILE_SPEED[id] || 60, left: move.range };
  world.projectiles.push(p);
  effects.push({ type: 'projectile', id: p.id, owner: fighter.id, move: id, x: p.x, z: p.z, ...(world.arenaLayout ? {y:p.y} : {}), dir, speed: p.speed });
}

function stepProjectiles(world, dt, now, effects) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    let travel = Math.min(p.left, p.speed * dt);
    const owner = world.fighters.get(p.owner);
    // a wall, a crate or a closed door stops it
    let wall = false;
    if(world.arenaLayout){
      const t=arenaRayFraction(world.arenaLayout,p,{x:p.x+p.dir.x*travel,y:p.y,z:p.z+p.dir.z*travel});
      if(t<1){travel*=t;wall=true;}
    }
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
      if(world.arenaLayout && (p.y<b.y || p.y>b.y+ARENA_BODY_HEIGHT))continue;
      const rx = b.x - p.x;
      const rz = b.z - p.z;
      const along = rx * p.dir.x + rz * p.dir.z;
      if (along < -BODY_RADIUS || along > travel + (wall && world.arenaLayout ? 0 : BODY_RADIUS)) continue;
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
