// The people a mission puts in your way. Ordinary smugglers have no Will: no Veil (every blow reaches armor
// and body, a grip holds them), and they fight with crystal-forged sidearms whose rounds drain a Veil, or
// with batons up close. They play by the same rules as everyone (they only send commands): an aimed shot
// has a wind-up you can see, roll through or guard.
//
//   gunner / marksman   keep their distance, strafe, shoot when they have a line; a pistol-whip if cornered
//   enforcer            closes in and fights hand to hand (the duel bot's brain, at trainee or duelist level)
//   named people        tougher versions with a name (the mission says who)
//   a Will user         a full duelist (the duel bot at master level) with a deep Veil
//   refuge defenders    unbound Will users with Arden's sidearms (a thin Veil); beaten, they stand down
//   House wardens       Will users sworn to the Houses: duelists with crystal blades; their captain stands down
// yields: the share of health at which someone stands down instead of falling (the mission spares them).
// Nobody acts until alerted: by seeing an intruder, being hit, or an alerted ally nearby.
import { isStunned, isDown } from '../core/index.mjs';
import { bodyOf } from './world.mjs';
import { clearLine, nextStep } from './level.mjs';
import { createBot, think as duelThink, createRandom } from './bots.mjs';

export const ENEMY_TYPES = Object.freeze({
  gunner: Object.freeze({ kind: 'gunner', title: 'Depot guard', weapon: 'sidearm', vitals: { hp: 42, will: 0, shield: 10, stamina: 60 },
    sight: 16, keep: [6, 11], aim: 0.09, cadence: [1.4, 2.4], burst: 0 }),
  marksman: Object.freeze({ kind: 'gunner', title: 'House marksman', weapon: 'sidearm', vitals: { hp: 58, will: 0, shield: 22, stamina: 70 },
    sight: 19, keep: [7, 13], aim: 0.05, cadence: [1.1, 1.8], burst: 0.4 }),
  enforcer: Object.freeze({ kind: 'melee', title: 'Enforcer', weapon: 'sword', vitals: { hp: 66, will: 0, shield: 26, stamina: 90 },
    sight: 15, botLevel: 'trainee' }),
  captain: Object.freeze({ kind: 'melee', title: 'Captain', weapon: 'sword', vitals: { hp: 150, will: 0, shield: 60, stamina: 120 },
    sight: 18, botLevel: 'duelist' }),
  boss: Object.freeze({ kind: 'gunner', title: 'Ringleader', weapon: 'sidearm', vitals: { hp: 110, will: 0, shield: 40, stamina: 80 },
    sight: 20, keep: [6, 12], aim: 0.055, cadence: [0.9, 1.5], burst: 0.5 }),
  willUser: Object.freeze({ kind: 'duelist', title: 'Will user', weapon: 'sword', vitals: { hp: 190, will: 170, shield: 50, stamina: 140 },
    sight: 30, botLevel: 'master', willRegenScale: 1.7 }),
  refugee: Object.freeze({ kind: 'gunner', title: 'Refuge defender', weapon: 'sidearm', vitals: { hp: 40, will: 30, shield: 0, stamina: 60 },
    sight: 15, keep: [6, 11], aim: 0.12, cadence: [1.6, 2.6], burst: 0, yields: 0.3 }),
  keeper: Object.freeze({ kind: 'gunner', title: 'Keeper', weapon: 'sidearm', vitals: { hp: 80, will: 60, shield: 10, stamina: 80 },
    sight: 18, keep: [6, 12], aim: 0.08, cadence: [1.3, 2.1], burst: 0.35, yields: 0.3 }),
  warden: Object.freeze({ kind: 'duelist', title: 'House warden', weapon: 'sword', vitals: { hp: 95, will: 60, shield: 30, stamina: 110 },
    sight: 22, botLevel: 'duelist' }),
  wardenCaptain: Object.freeze({ kind: 'duelist', title: 'Warden-Captain', weapon: 'sword', vitals: { hp: 200, will: 140, shield: 60, stamina: 140 },
    sight: 30, botLevel: 'master', willRegenScale: 1.4, yields: 0.2 }),
});

const FOV_COS = Math.cos((75 * Math.PI) / 180); // an unalerted guard sees 75 degrees either side of its facing
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

export function createEnemy(id, typeId, { seed = 1, name = null, group = null, named = false } = {}) {
  const type = ENEMY_TYPES[typeId] || ENEMY_TYPES.gunner;
  return {
    id, typeId, type, name: name || type.title, group, named,
    random: createRandom(seed * 2654435761 + id.length * 97),
    bot: type.kind === 'gunner' ? null : createBot(id, { level: type.botLevel || 'trainee', seed: seed * 31 + 7 }),
    alerted: false, alertedAt: -Infinity, targetId: null, lastSeen: null, lastSeenAt: -Infinity,
    nextShotAt: 0, strafe: 1, strafeUntil: 0, aimError: 0, route: null, routeAt: -Infinity, home: null,
  };
}

/** Wake an enemy (it saw someone, was hit, or a friend raised the alarm). */
export function alert(enemy, now, at = null) {
  if (!enemy.alerted) { enemy.alerted = true; enemy.alertedAt = now; }
  if (at) { enemy.lastSeen = { x: at.x, z: at.z }; enemy.lastSeenAt = now; }
}

function nearestSeen(world, enemy, mine, playerIds) {
  const { level } = world;
  let best = null;
  for (const id of playerIds) {
    const f = world.fighters.get(id);
    if (!f || f.vitals.dead) continue;
    const b = bodyOf(world, id);
    const d = dist(mine, b);
    if (d > enemy.type.sight || (level && !clearLine(level, mine, b))) continue;
    // not yet alerted: only what is in front of it (or right on top of it)
    if (!enemy.alerted && d > 3.5) {
      const off = Math.atan2(b.x - mine.x, b.z - mine.z) - mine.yaw;
      if (Math.cos(off) < FOV_COS) continue;
    }
    if (!best || d < best.d) best = { id, d, b };
  }
  return best;
}

// walk towards a point through the rooms (the route is looked up a few times a second, not every step)
function walkTo(world, enemy, mine, to, now) {
  if (!world.level) return to;
  if (!enemy.route || now - enemy.routeAt > 0.3) { enemy.route = nextStep(world.level, mine, to); enemy.routeAt = now; }
  return enemy.route;
}

/**
 * This step's input for an enemy (the same shape a player's client sends). playerIds: who it is after.
 * ctx.grant(): asked before winding up a shot; false means too many are shooting already (wait a moment).
 */
export function thinkEnemy(world, enemy, playerIds, ctx = {}) {
  const now = world.time;
  const me = world.fighters.get(enemy.id);
  if (!me || me.vitals.dead) return {};
  const mine = bodyOf(world, enemy.id);
  if (!enemy.home) enemy.home = { x: mine.x, z: mine.z, yaw: mine.yaw };
  const seen = nearestSeen(world, enemy, mine, playerIds);
  if (seen) { alert(enemy, now, seen.b); enemy.targetId = seen.id; }
  if (!enemy.alerted) return { move: { x: 0, z: 0 }, face: enemy.home.yaw };
  const input = { move: { x: 0, z: 0 }, run: true, strafe: true, face: null, presses: [] };
  if (me.heldBy || isStunned(me, now) || isDown(me, now)) return input;

  // a full duelist or an enforcer: the duel brain once it has a line to someone, else walk to where it last saw them
  if (enemy.bot) {
    if (seen || !world.level) return duelThink(world, enemy.bot);
    const target = enemy.lastSeen;
    if (!target) return input;
    const step = walkTo(world, enemy, mine, target, now);
    if (step && dist(mine, step) > 0.5) {
      const a = angleTo(mine, step);
      input.move = { x: Math.sin(a), z: Math.cos(a) };
      input.face = a;
      input.strafe = false;
    }
    return input;
  }

  // a gunner
  if (!seen) {
    // lost them: go to where they were last seen (a few seconds), then hold
    if (enemy.lastSeen && now - enemy.lastSeenAt < 12) {
      const step = walkTo(world, enemy, mine, enemy.lastSeen, now);
      if (step && dist(mine, step) > 0.8) {
        const a = angleTo(mine, step);
        input.move = { x: Math.sin(a), z: Math.cos(a) };
        input.face = a;
        input.strafe = false;
      }
    }
    return input;
  }
  const { d, b } = seen;
  const aim = angleTo(mine, b);
  const toward = { x: Math.sin(aim), z: Math.cos(aim) };
  const rnd = enemy.random;
  const [near, far] = enemy.type.keep;
  // cornered: a pistol-whip, then back off
  if (d < 1.9 && !me.action && rnd() < 0.08) { input.face = aim; input.presses.push('#sidearmWhip'); return input; }
  if (now >= enemy.strafeUntil) { enemy.strafe = rnd() < 0.5 ? 1 : -1; enemy.strafeUntil = now + 1 + rnd() * 1.6; }
  const side = { x: toward.z * enemy.strafe, z: -toward.x * enemy.strafe };
  if (d < near) input.move = { x: -toward.x * 0.9 + side.x * 0.4, z: -toward.z * 0.9 + side.z * 0.4 };
  else if (d > far) input.move = { x: toward.x, z: toward.z };
  else input.move = { x: side.x * 0.55, z: side.z * 0.55 };
  input.run = d > far;
  // shoot when the weapon is free: the aim wanders a little, and is fixed once the shot winds up
  if (!me.action && now >= enemy.nextShotAt && now - enemy.alertedAt > 0.5 && ctx.grant && !ctx.grant()) enemy.nextShotAt = now + 0.3;
  if (!me.action && now >= enemy.nextShotAt && now - enemy.alertedAt > 0.5) {
    enemy.aimError = (rnd() * 2 - 1) * enemy.type.aim * (1 + d / 20);
    const [lo, hi] = enemy.type.cadence;
    enemy.nextShotAt = now + lo + rnd() * (hi - lo);
    input.presses.push(enemy.type.burst && rnd() < enemy.type.burst && now >= (me.cooldowns.sidearmBurst ?? 0) ? 'heavy' : 'light');
  }
  input.face = aim + enemy.aimError;
  return input;
}

/**
 * Alerted enemies wake their friends (called by the mission each step): their own squad wherever it stands,
 * anyone else only within a few metres and in plain sight.
 */
export function spreadAlarm(world, enemies, now, radius = 8) {
  const awake = [...enemies.values()].filter((e) => e.alerted && !e.yielded && !world.fighters.get(e.id)?.vitals.dead && now - e.alertedAt > 0.6);
  if (!awake.length) return;
  for (const e of enemies.values()) {
    if (e.alerted) continue;
    const mine = bodyOf(world, e.id);
    if (!mine) continue;
    for (const a of awake) {
      const other = bodyOf(world, a.id);
      if (!other) continue;
      const squad = e.group && e.group === a.group;
      if (squad || (dist(mine, other) <= radius && (!world.level || clearLine(world.level, mine, other)))) { alert(e, now, a.lastSeen); break; }
    }
  }
}
