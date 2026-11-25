import {ctfBotPath} from './ctfBotNav.mjs';
import {ctfZone} from './importedCtfLayout.mjs';
import { escortBotPath } from './escortBotNav.mjs';
// Practice and fill-in bots: they read the same world a player sees and send the same commands a player
// sends (no shortcuts: the rules core and its cooldowns apply to them too). Difficulty sets reaction time,
// how often they defend and how well they time it, how hard they press, and how cleverly they use the Will.
//
// What a bot does, in order: break free of a grip; leave a fallen foe alone (it cannot be hit); dodge or
// guard a blow it has seen coming (a master raises its guard just as the blow lands: a parry); punish a foe
// that swung and missed; escape when badly hurt; use Telekinesis and the Breach; go after the mode's
// objective (a flag, a thief) when no fight is close; otherwise close in, circle and strike in combos.
import { MOVES, BLOCK, CLASSES, FLOW, SNAP, isStunned, isDown, fighterVeil } from '../core/index.mjs';
import { bodyOf, forwardOf } from './world.mjs';
import { importedBotPath } from './importedControlBotNav.mjs';
import {conduitBotPath} from './conduitLiveLayout.mjs';
import { arenaLineClear, nextArenaGroundWaypoint } from './modeArenaLayout.mjs';

export const BOT_LEVELS = Object.freeze({
  trainee: Object.freeze({ reaction: 0.45, guardChance: 0.25, rollChance: 0.1, powerChance: 0.15, comboLength: 2, aggression: 0.5,
    parry: 0.05, punish: 0.2, breach: 0.1, escape: 0.2, flow: 0 }),
  duelist: Object.freeze({ reaction: 0.28, guardChance: 0.5, rollChance: 0.25, powerChance: 0.3, comboLength: 3, aggression: 0.7,
    parry: 0.25, punish: 0.55, breach: 0.35, escape: 0.45, flow: 0.25 }),
  master: Object.freeze({ reaction: 0.16, guardChance: 0.72, rollChance: 0.4, powerChance: 0.45, comboLength: 4, aggression: 0.85,
    parry: 0.55, punish: 0.85, breach: 0.6, escape: 0.7, flow: 0.45 }),
});

// A small deterministic random source, so a bot plays the same way for the same seed (tests, replays).
export function createRandom(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function createBot(id, { level = 'duelist', seed = 7 } = {}) {
  return { id, level: BOT_LEVELS[level] || BOT_LEVELS.duelist, random: createRandom(seed), targetId: null,
    noticedAt: new Map(), combo: 0, nextThinkAt: 0, strafe: 1, guardUntil: 0, parried: new Set() };
}

const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ENGAGE = 6; // metres: a foe this close is fought before any objective

// The foe to fight: a named one (a flag thief), else the nearest standing hostile (a fallen one only if
// nobody else is around).
function pickTarget(world, bot, prefer = null) {
  const me = world.fighters.get(bot.id);
  const mine = bodyOf(world, bot.id);
  if (prefer) {
    const f = world.fighters.get(prefer);
    if (f && !f.vitals.dead&&!(world.arenaLayout?.ctfImported&&ctfZone(f.team,bodyOf(world,f.id)))) return prefer;
  }
  let best = null;
  for (const other of world.fighters.values()) {
    // someone who stood down is out of the fight
    if (other.id === bot.id || other.vitals.dead || other.yielded || (me.team !== null && other.team === me.team)) continue;
    if(world.arenaLayout?.ctfImported&&ctfZone(other.team,bodyOf(world,other.id)))continue;
    const d = dist(mine, bodyOf(world, other.id)) + (world.arenaLayout?.ctfImported?Math.abs(mine.y-bodyOf(world,other.id).y)*2:0) + (isDown(other, world.time) ? 6 : 0);
    if (!best || d < best.d) best = { id: other.id, d };
  }
  return best?.id || null;
}

/**
 * This step's input for the bot, in the same shape a player's client sends.
 * goal: { x, z, urgent?, hunt? } from the match (the flag to take, the base to run to, the thief to catch).
 */
// Which of its class's abilities a bot uses now, if any: 'ability1'-'ability4' or null.
function classKitPress(me, foe, d, now, rnd, lvl) {
  const ready = (id) => now >= (me.cooldowns[id] ?? 0) && me.vitals.will >= (MOVES[id]?.will ?? 0) && !me.vitals.collapsed;
  const slot = (id) => 'ability' + (CLASSES[me.classId].abilities.findIndex((a) => a.id === id) + 1);
  const hurt = me.vitals.hp / me.vitals.max.hp;
  const chance = (p) => rnd() < p * (lvl.powerChance + 0.25);
  switch (me.classId) {
    case 'warrior':
      if (d > 5 && d < 9 && ready('leapStrike') && chance(0.7)) return slot('leapStrike');
      if (d < 3 && hurt < 0.6 && ready('repulse') && chance(0.6)) return slot('repulse');
      if (d > 7 && d < 15 && ready('bladeThrow') && chance(0.4)) return slot('bladeThrow');
      return null;
    case 'duelist':
      if (d > 3 && d < 8 && ready('quickstep') && chance(0.5)) return slot('quickstep');
      if (d > 7 && d < 15 && ready('bladeThrow') && chance(0.4)) return slot('bladeThrow');
      if (foe.action?.move.kind === 'attack' && foe.action.t < foe.action.move.startup && d < 2.6 && ready('counter') && chance(0.5)) return slot('counter');
      return null;
    case 'assassin':
      if (d > 8 && ready('cloak') && chance(0.4)) return slot('cloak');
      if (d < 4 && ready('empower') && chance(0.5)) return slot('empower');
      if (d < 6 && foe.action?.move.kind === 'attack' && ready('dominate') && chance(0.3)) return slot('dominate');
      return null;
    case 'healer':
      if (hurt < 0.55 && ready('mend') && chance(0.8)) return slot('mend');
      if (d > 3 && d < 8 && ready('quickstepAura') && chance(0.4)) return slot('quickstepAura');
      if (hurt < 0.3 && d < 3 && ready('levitate') && chance(0.5)) return slot('levitate');
      return null;
    default: return null;
  }
}

export function think(world, bot, { goal = null } = {}) {
  const now = world.time;
  const me = world.fighters.get(bot.id);
  if (!me || me.vitals.dead) return {};
  const mine = bodyOf(world, bot.id);
  const lvl = bot.level;
  const rnd = bot.random;
  const presses = [];
  const input = { face: null, move: { x: 0, z: 0 }, run: true, strafe: true, presses };

  // held: struggle free as soon as it may
  if (me.heldBy) { if (me.vitals.will >= MOVES.resist.will) presses.push('resist'); return input; }
  if (isStunned(me, now)) return input;

  bot.targetId = pickTarget(world, bot, goal?.hunt || null);
  const foe = bot.targetId ? world.fighters.get(bot.targetId) : null;
  // a bot is locked on to the one it fights (targeted abilities take it)
input.target = foe?.id || null;
  const theirs = foe ? bodyOf(world, foe.id) : null;
  const d = theirs ? dist(mine, theirs) : Infinity;

  if(world.arenaLayout?.imported){
    const destination=goal && ((world.arenaLayout?.ctfImported&&ctfZone(me.team,mine))||d>ENGAGE || Math.abs(mine.y-(theirs?.y??mine.y))>2 || (goal.urgent && !goal.hunt && d>2.6)) ? goal : theirs;
    if(destination && (dist(mine,destination)>2.6 || Math.abs(mine.y-(destination.y??0))>1.2 || !arenaLineClear(world.arenaLayout,mine,destination))){
      const old=bot.importedPath;
      if(!old||Math.hypot(old.target.x-destination.x,old.target.z-destination.z,(old.target.y??0)-(destination.y??0))>3||((world.arenaLayout.ctfImported||world.arenaLayout.conduitImported||!old.path.length)&&now>=old.until)){
        bot.importedPath={target:{...destination},until:now+1,path:world.arenaLayout.conduitImported?conduitBotPath(mine,destination):world.arenaLayout.ctfImported?ctfBotPath(mine,destination,me.team,world.ctfCarriers?.has(bot.id)):world.arenaLayout.escortImported?escortBotPath(mine,destination,me.team,world.escortStage??0):importedBotPath(world.arenaLayout,mine,destination)};
      }
      const path=bot.importedPath.path;
      while(path.length&&Math.hypot(mine.x-path[0].x,mine.z-path[0].z,mine.y-path[0].y)<.45)path.shift();
      const p=path[0];if(p){const a=angleTo(mine,p);input.move={x:Math.sin(a),z:Math.cos(a)};input.face=a;input.strafe=false;}
      if(me.guard)presses.push('blockUp');return input;
    }
  }else if(world.arenaLayout && mine.y<0.2){
    const destination=goal && (d>ENGAGE || (goal.urgent && !goal.hunt && d>2.6)) ? goal : theirs;
    if(destination && !arenaLineClear(world.arenaLayout,mine,destination)){
      if(!bot.arenaPath || now>=bot.arenaPath.until){bot.arenaPath={until:now+0.6,point:nextArenaGroundWaypoint(world.arenaLayout,mine,destination)};}
      const p=bot.arenaPath.point;
      if(p && dist(mine,p)>0.25){const a=angleTo(mine,p);input.move={x:Math.sin(a),z:Math.cos(a)};input.face=a;input.strafe=false;return input;}
    }
  }
  // the mode's objective, when no fight is close (or it cannot wait)
  if (goal && (d > ENGAGE || (goal.urgent && !goal.hunt && d > 2.6))) {
    const gd = dist(mine, goal);
    if (gd > 0.6) {
      const a = angleTo(mine, goal);
      input.move = { x: Math.sin(a), z: Math.cos(a) };
      input.face = a;
      input.strafe = false;
      input.sprint = gd > 5 && me.vitals.stamina > 40;
    }
    if (me.guard) presses.push('blockUp');
    return input;
  }
  if (!foe) return { ...input, move: { x: 0, z: 0 } };

  const face = angleTo(mine, theirs);
  const toward = { x: Math.sin(face), z: Math.cos(face) };
  input.face = face;

  // a fallen foe cannot be hit: close to striking distance and wait for it to stand
  if (isDown(foe, now)) {
    if (d > 2.6) input.move = { x: toward.x, z: toward.z };
    if (me.guard) presses.push('blockUp');
    return input;
  }

  const foeAction = foe.action;
  const threatened = (move) => d <= move.range + 0.8;
  // A blow coming: the moment the bot notices it (after its reaction time) it decides once whether to roll
  // or guard. A good bot instead waits and raises its guard just before the blow lands: a parry.
  if (foeAction && (foeAction.move.kind === 'attack' || foeAction.id === 'push') && threatened(foeAction.move)) {
    const key = `${foe.id}:${foeAction.id}:${Math.round((now - foeAction.t) * 100)}`;
    const toHit = foeAction.move.startup - foeAction.t;
    if (foeAction.move.blockable !== false && toHit > 0 && toHit <= BLOCK.parryWindow * 0.8 && !me.guard && !bot.parried.has(key) && foeAction.t >= lvl.reaction * 0.6) {
      bot.parried.add(key);
      if (bot.parried.size > 32) bot.parried.delete(bot.parried.values().next().value);
      if (rnd() < lvl.parry && !me.action && !me.vitals.winded) { presses.push('blockDown'); bot.guardUntil = now + 0.35; return input; }
    }
    if (foeAction.t >= lvl.reaction * 0.5 && !bot.noticedAt.has(key)) {
      bot.noticedAt.set(key, now);
      if (bot.noticedAt.size > 32) bot.noticedAt.delete(bot.noticedAt.keys().next().value);
      if (rnd() < lvl.rollChance && !me.vitals.winded) {
        const side = rnd() < 0.5 ? 1 : -1;
        input.move = { x: toward.z * side, z: -toward.x * side };
        presses.push('roll');
        return input;
      }
      if (foeAction.move.blockable !== false && rnd() < lvl.guardChance) bot.guardUntil = now + 0.6;
    }
  }
  if (now < bot.guardUntil && !me.vitals.winded) {
    if (!me.guard) presses.push('blockDown');
    input.move = { x: -toward.x * 0.3, z: -toward.z * 0.3 };
    input.run = false;
    return input;
  }
  if (me.guard) presses.push('blockUp');

  // A second press hard on a cut's start turns it into another move (core/cuts.mjs): a bot waits that moment out,
  // so it never does one by accident (a bot that knows Flow means it now and then, below)
  const early = !!me.action?.move.cut && me.action.t - (me.action.from || 0) <= SNAP + 0.03;
  // A foe that swung and missed is open until it recovers: strike now.
  const reach = me.weapon === 'bow' ? 14 : 2.1;
  if (foeAction && foeAction.move.kind === 'attack' && foeAction.t > foeAction.move.startup + foeAction.move.active && d <= reach + 0.3
      && (!me.action || me.action.move.chain) && !early && rnd() < lvl.punish * 0.25) {
    presses.push('light');
    return input;
  }

  // Badly hurt and pressed: push them off or roll away.
  if (me.vitals.hp < 30 && d < 2.4 && !me.action && now >= bot.nextThinkAt && rnd() < lvl.escape * 0.2) {
    bot.nextThinkAt = now + 0.8;
    if (me.vitals.will >= MOVES.push.will && now >= (me.cooldowns.push ?? 0)) presses.push('push');
    else if (!me.vitals.winded) { input.move = { x: -toward.x, z: -toward.z }; presses.push('roll'); }
    if (presses.length) return input;
  }

  // the class kit: each class's abilities where they fit (core/classes.mjs)
  if (me.classId && now >= (bot.nextKitAt ?? 0) && !me.action) {
    bot.nextKitAt = now + 0.6;
    const kit = classKitPress(me, foe, d, now, rnd, lvl);
    if (kit) { presses.push(kit); return input; }
  }

  // Telekinesis and the Breach, now and then: grip a collapsed Veil, push someone crowding, pull someone
  // hanging back, open a strong Veil with a Breach before a heavy. (A class only has the Telekinesis in its kit.)
  if (now >= bot.nextThinkAt && !me.action) {
    bot.nextThinkAt = now + 1.0;
    const strongVeil = foe.vitals.will > 60 && fighterVeil(foe) === 'stable';
    if (strongVeil && d < 3.6 && me.vitals.will >= MOVES.breach.will + 15 && rnd() < lvl.breach * 0.5) presses.push('breach');
    else if (rnd() < lvl.powerChance) {
      if (foe.vitals.collapsed && d < MOVES.grip.range && me.vitals.will > 40) presses.push('grip');
      else if (d < 2.4 && me.vitals.will >= MOVES.push.will) presses.push('push');
      else if (d > 6 && d < MOVES.pull.range && me.vitals.will >= MOVES.pull.will) presses.push('pull');
    }
    if (presses.length) { bot.combo = presses[0] === 'breach' ? -1 : bot.combo; return input; }
  }
  if (me.action?.id === 'grip' && me.action.t > 0.9) presses.push('release');
  // a breached Veil gets cleared once the attacker is near
  if (Object.keys(me.breaches).length && d < 3 && me.vitals.will >= MOVES.resist.will && rnd() < lvl.escape * 0.1) { presses.push('resist'); return input; }

  // Close in, circle at the edge of reach, strike in short combos (a heavy right after a Breach lands).
  if (d > reach + 0.4) {
    input.move = { x: toward.x, z: toward.z };
    input.sprint = d > 8 && me.vitals.stamina > 50;
    // strikes by direction (flow: how often this level uses them): an advance covers the last of the distance,
    // pressed while moving in
    if (FLOW[me.weapon] && d < reach + 1.4 && !me.action && rnd() < lvl.flow * 0.2) { presses.push('light'); bot.combo = 1; }
  } else {
    if (rnd() < 0.02) bot.strafe = -bot.strafe;
    input.move = { x: toward.z * bot.strafe * 0.5, z: -toward.x * bot.strafe * 0.5 };
    input.run = false;
    if (early) { // the whirl, the cross or the backhand, by the way it is moving: only on purpose
      if (rnd() < lvl.flow * 0.06) presses.push('light');
    } else if (!me.action || me.action.move.chain) {
      if (bot.combo === -1 && !me.action) { presses.push('heavy'); bot.combo = 0; }
      else if (bot.combo >= 0 && bot.combo < lvl.comboLength && rnd() < lvl.aggression * 0.25) {
        presses.push('light');
        bot.combo += 1;
        // now and then with a direction: a sweep as it circles, or a turn stepping back
        if (FLOW[me.weapon] && rnd() < lvl.flow) input.move = rnd() < 0.75 ? { x: toward.z * bot.strafe, z: -toward.x * bot.strafe } : { x: -toward.x, z: -toward.z };
      }
      else if (bot.combo >= lvl.comboLength) {
        bot.combo = 0;
        if (rnd() < 0.35 && !me.vitals.winded) presses.push('heavy');
      }
    }
  }
  return input;
}

export { forwardOf };
