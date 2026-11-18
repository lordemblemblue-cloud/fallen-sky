// Server AI pilots for Fleet Assault. They fill the seats humans have not taken (rules MATCH.minPlayers) and fly by
// producing the same commands a human's client sends, so they obey the same flight model, guns, heat and boost.
import { SHIP_CLASSES, enemyOf } from './rules.mjs';
import { add, addScaled, clamp, cross, dist, insideBox, len, norm, qconj, qrot, rightOf, scale, sub } from './vec.mjs';
import { asteroidHitFraction } from './battlefield.mjs';

const live = c => c.state === 'active' || c.state === 'spooling';
const SUB_ORDER = ['shields', 'weapons', 'comms', 'hyperdrive'];

function targetAlive(world, t) {
  if (!t) return false;
  if (t.kind === 'craft') return !!world.m.crafts.get(t.eid)?.alive;
  const c = world.cruiserByEid(t.eid);
  return !!c && live(c);
}

function pickTarget(world, p, craft) {
  const { m } = world;
  const enemy = enemyOf(p.side);
  const homeFleet = world.liveCruisers(p.side);
  let best = null, bestD = Infinity;
  // boarding craft heading for one of our cruisers come first
  for (const c of m.crafts.values()) {
    if (c.side !== enemy || !c.cls.canDock) continue;
    if (!homeFleet.some(h => dist(h.p, c.f.p) < 2500)) continue;
    const d = dist(c.f.p, craft.f.p);
    if (d < bestD) { bestD = d; best = { kind: 'craft', eid: c.eid }; }
  }
  if (best) return best;
  const nearCraft = range => {
    let t = null, td = range;
    for (const c of m.crafts.values()) {
      if (c.side !== enemy) continue;
      const d = dist(c.f.p, craft.f.p);
      if (d < td && asteroidHitFraction(craft.f.p, c.f.p, m.asteroids) < 0) {
        td = d; t = { kind: 'craft', eid: c.eid };
      }
    }
    return t;
  };
  if (p.bot.style === 'dogfight') {
    const t = nearCraft(3000) || nearCraft(7000);
    if (t) return t;
  } else {
    const t = nearCraft(600);
    if (t) return t;
  }
  const targets = world.liveCruisers(enemy);
  if (!targets.length) return null;
  const c = targets.reduce((a, b) => (dist(a.p, craft.f.p) <= dist(b.p, craft.f.p) ? a : b));
  return { kind: 'cruiser', eid: c.eid, sub: SUB_ORDER.find(s => c.subs[s] > 0) || null };
}

function lead(from, tp, tv, speed) {
  const r = sub(tp, from);
  const t = len(r) / speed;
  return addScaled(tp, tv, t);
}

export function botCommand(world, p, craft, dtMs) {
  const { m, rng, now } = world;
  const B = p.bot, f = craft.f, T = now();
  const L = craft.cls.lasers || SHIP_CLASSES.fighter.lasers;
  if (!targetAlive(world, B.target) || T >= B.retargetAt) {
    B.target = pickTarget(world, p, craft);
    B.retargetAt = T + 1500 + rng() * 1500;
    B.err = [(rng() - 0.5) * 2, (rng() - 0.5) * 2, (rng() - 0.5) * 2];
  }
  let aim = world.fleetCenter(enemyOf(p.side)), targetEid = 0, isCraft = false;
  const t = B.target;
  if (t?.kind === 'craft') {
    const c = m.crafts.get(t.eid);
    aim = lead(f.p, c.f.p, sub(c.f.v, f.v), L.speed);
    targetEid = c.eid; isCraft = true;
  } else if (t?.kind === 'cruiser') {
    const c = world.cruiserByEid(t.eid);
    aim = t.sub && c.subs[t.sub] > 0 ? world.hardpointOf(c, t.sub) : c.p;
    targetEid = c.eid;
  }
  const range = dist(f.p, aim);
  aim = addScaled(aim, B.err, Math.min(40, range * 0.012)); // a pilot, not an aimbot
  const toAim = qrot(qconj(f.q), norm(sub(aim, f.p)));
  const onNose = -toAim[2];
  let goal = aim, breaking = false, extend = false;
  if (!isCraft && t) { // strafing run on a cruiser: break away when close, come round again
    if (range < 380) { B.breakUntil = T + 3500; B.breakDir = norm([(rng() - 0.5), 0.6, (rng() - 0.5)]); }
    if (T < (B.breakUntil || 0)) { goal = addScaled(f.p, B.breakDir, 1500); breaking = true; }
  }
  // two pilots with the same turn rate circle forever: after 6 s without a firing solution, extend toward the battle
  // and come back for a head-on pass
  if (isCraft) {
    if (onNose > 0.9) B.offNoseSince = 0;
    else if (!B.offNoseSince) B.offNoseSince = T;
    if (B.offNoseSince && T - B.offNoseSince > 6000) { B.extendUntil = T + 2500 + rng() * 1000; B.offNoseSince = 0; B.retargetAt = B.extendUntil; }
  }
  if (T < (B.extendUntil || 0)) { goal = scale(add(world.fleetCenter(p.side), world.fleetCenter(enemyOf(p.side))), 0.5); breaking = true; extend = true; }
  // Cover-aware AI: plan a flank around the nearest intervening rock, rather
  // than flying straight into it or repeatedly shooting through solid stone.
  const approach = addScaled(f.p, norm(len(f.v) > 5 ? f.v : sub(goal, f.p)), 550);
  const blocking = m.asteroids.find(rock => asteroidHitFraction(f.p, approach, [rock], craft.cls.radius + 80) >= 0);
  if (blocking) {
    const away = norm(sub(f.p, blocking.p));
    const tangent = norm(cross(away, Math.abs(away[1]) > 0.85 ? [1, 0, 0] : [0, 1, 0]));
    const s = (blocking.seed & 1) ? 1 : -1;
    goal = addScaled(addScaled(blocking.p, away, blocking.r + 280), tangent, s * (blocking.r + 240));
    breaking = true;
  }
  for (const c of m.cruisers) { // never fly into a cruiser
    if (!live(c)) continue;
    if (insideBox(addScaled(f.p, f.v, 2), c.p, c.yaw, c.half, 80)) {
      goal = add(f.p, add(scale(norm(sub(f.p, c.p)), 600), [0, 600, 0]));
      breaking = true;
      break;
    }
  }
  if (len(f.p) > world.cfg.battlefieldRadius * 0.85) { goal = [0, 0, 0]; breaking = true; extend = true; }

  const local = qrot(qconj(f.q), norm(sub(goal, f.p))); // x right, y up, -z ahead
  const ahead = -local[2];
  let pitch, yaw, roll;
  if (ahead > 0.96) { // fine aim, wings level
    pitch = clamp(local[1] * 6, -1, 1); yaw = clamp(local[0] * 6, -1, 1);
    roll = clamp(rightOf(f.q)[1] * 2, -1, 1);
  } else { // bank toward the goal and pull: pitch turns faster than yaw
    const bank = Math.atan2(local[0], local[1]);
    roll = clamp(bank * 2, -1, 1);
    pitch = Math.abs(bank) < 1.2 ? 1 : 0.3;
    yaw = clamp(local[0] * 2, -1, 1);
  }
  const d = dist(f.p, goal);
  const lockOk = targetEid && !breaking && onNose > Math.cos(0.2) && range < 1500;
  const missileReady = craft.cls.missiles && craft.lock.target === targetEid && craft.lock.t >= craft.cls.missiles.lockTime;
  return {
    ms: Math.round(dtMs), pitch, yaw, roll,
    throttle: extend ? 1 : isCraft ? (range > 700 ? 1 : onNose < 0.5 ? 0.15 : 0.6) : 1,
    boost: (extend || d > 1300) && ahead > 0.85 && f.energy > 40,
    fire: !!L && !breaking && targetEid > 0 && onNose > Math.cos(isCraft ? 0.07 : 0.12) && range < (isCraft ? 900 : 1200) && f.lockout <= 0 && f.heat < 85,
    missile: !!missileReady && rng() < (isCraft ? 0.03 : 0.08),
    lock: lockOk ? targetEid : 0,
  };
}

export const _test = { pickTarget };
