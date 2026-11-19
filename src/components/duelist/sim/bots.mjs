// Practice and fill-in bots: they read the same world a player sees and send the same commands a player
// sends (no shortcuts: the rules core and its cooldowns apply to them too). Difficulty sets reaction time,
// how often they defend, and how hard they press.
import { MOVES, isStunned } from '../core/index.mjs';
import { bodyOf, forwardOf } from './world.mjs';

export const BOT_LEVELS = Object.freeze({
  trainee: Object.freeze({ reaction: 0.45, guardChance: 0.25, rollChance: 0.1, powerChance: 0.15, comboLength: 2, aggression: 0.5 }),
  duelist: Object.freeze({ reaction: 0.28, guardChance: 0.5, rollChance: 0.25, powerChance: 0.3, comboLength: 3, aggression: 0.7 }),
  master: Object.freeze({ reaction: 0.16, guardChance: 0.72, rollChance: 0.4, powerChance: 0.45, comboLength: 4, aggression: 0.85 }),
});

// A small deterministic random source, so a bot plays the same way for the same seed (tests, replays).
export function createRandom(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function createBot(id, { level = 'duelist', seed = 7 } = {}) {
  return { id, level: BOT_LEVELS[level] || BOT_LEVELS.duelist, random: createRandom(seed), targetId: null,
    noticedAt: new Map(), combo: 0, nextThinkAt: 0, strafe: 1, guardUntil: 0 };
}

const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The nearest hostile fighter that is still standing.
function pickTarget(world, bot) {
  const me = world.fighters.get(bot.id);
  const mine = bodyOf(world, bot.id);
  let best = null;
  for (const other of world.fighters.values()) {
    if (other.id === bot.id || other.vitals.dead || (me.team !== null && other.team === me.team)) continue;
    const d = dist(mine, bodyOf(world, other.id));
    if (!best || d < best.d) best = { id: other.id, d };
  }
  return best?.id || null;
}

/** This step's input for the bot, in the same shape a player's client sends. */
export function think(world, bot) {
  const now = world.time;
  const me = world.fighters.get(bot.id);
  if (!me || me.vitals.dead) return {};
  bot.targetId = pickTarget(world, bot);
  if (!bot.targetId) return { move: { x: 0, z: 0 } };
  const foe = world.fighters.get(bot.targetId);
  const mine = bodyOf(world, bot.id);
  const theirs = bodyOf(world, bot.targetId);
  const d = dist(mine, theirs);
  const face = angleTo(mine, theirs);
  const toward = { x: Math.sin(face), z: Math.cos(face) };
  const lvl = bot.level;
  const rnd = bot.random;
  const presses = [];
  const input = { face, move: { x: 0, z: 0 }, run: true, strafe: true, presses };

  // held: struggle free as soon as it may
  if (me.heldBy) { if (me.vitals.will >= MOVES.resist.will) presses.push('resist'); return input; }
  if (isStunned(me, now)) return input;

  // React to the foe's strike after the bot's reaction time: guard, or roll away.
  const foeAction = foe.action;
  if (foeAction && (foeAction.move.kind === 'attack' || foeAction.id === 'push') && foeAction.t >= lvl.reaction * 0.5) {
    const key = `${foe.id}:${foeAction.id}:${Math.round((now - foeAction.t) * 100)}`;
    if (!bot.noticedAt.has(key)) {
      bot.noticedAt.set(key, now);
      if (bot.noticedAt.size > 32) bot.noticedAt.delete(bot.noticedAt.keys().next().value);
      const threatened = d <= foeAction.move.range + 0.8;
      if (threatened && rnd() < lvl.rollChance && !me.vitals.winded) {
        const side = rnd() < 0.5 ? 1 : -1;
        input.move = { x: toward.z * side, z: -toward.x * side };
        presses.push('roll');
        return input;
      }
      if (threatened && foeAction.move.blockable !== false && rnd() < lvl.guardChance) bot.guardUntil = now + 0.6;
    }
  }
  if (now < bot.guardUntil && !me.vitals.winded) {
    if (!me.guard) presses.push('blockDown');
    input.move = { x: -toward.x * 0.3, z: -toward.z * 0.3 };
    input.run = false;
    return input;
  }
  if (me.guard) presses.push('blockUp');

  // Telekinesis now and then: push someone crowding it, pull someone hanging back, grip a collapsed Veil.
  if (now >= bot.nextThinkAt && rnd() < lvl.powerChance && !me.action) {
    bot.nextThinkAt = now + 1.2;
    if (foe.vitals.collapsed && d < MOVES.grip.range && me.vitals.will > 40) presses.push('grip');
    else if (d < 2.4 && me.vitals.will >= MOVES.push.will) presses.push('push');
    else if (d > 6 && d < MOVES.pull.range && me.vitals.will >= MOVES.pull.will) presses.push('pull');
    if (presses.length) return input;
  }
  if (me.action?.id === 'grip' && me.action.t > 0.9) presses.push('release');

  // Close in, circle at the edge of reach, strike in short combos.
  const reach = me.weapon === 'bow' ? 14 : 2.0;
  if (d > reach + 0.4) {
    input.move = { x: toward.x, z: toward.z };
    input.sprint = d > 8 && me.vitals.stamina > 50;
  } else {
    if (rnd() < 0.02) bot.strafe = -bot.strafe;
    input.move = { x: toward.z * bot.strafe * 0.5, z: -toward.x * bot.strafe * 0.5 };
    input.run = false;
    if (!me.action || me.action.move.chain) {
      if (bot.combo < lvl.comboLength && rnd() < lvl.aggression * 0.25) { presses.push('light'); bot.combo += 1; }
      else if (bot.combo >= lvl.comboLength) {
        bot.combo = 0;
        if (rnd() < 0.35 && !me.vitals.winded) presses.push('heavy');
      }
    }
  }
  return input;
}

export { forwardOf };
