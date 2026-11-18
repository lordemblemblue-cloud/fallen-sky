// Part 7: optional offline Experimental Force combos. Never activated for
// network puppets, Classic combat, mission scripts or cinematic boss phases.
export const EXPERIMENTAL_PUSH_CHARGE_MULT = 0.65; // 35% shorter
export const EXPERIMENTAL_PUSH_DISTANCE_MULT = 1.2; // 20% more throw distance
export const GRIP_PUSH_COST = 30; // one combined attack (not two free casts)
export const WALL_PIN_DURATION = 1.4;
export const WALL_PIN_MIN_DISTANCE = 0.7;
export const WALL_PIN_MAX_DISTANCE = 4.5;

export function experimentalForceEnabled(force) {
  const g = force?.g;
  return !!(g?.experimentalCombatActive?.() && !g.net &&
    !g.director && !g.bossWay && !g.attract && !g.boardingMode &&
    !force.p.remote && (force.p?.isPlayer ||
      (g.tutorialMode && g.tutorial?.phase === 'demo' &&
       force.npc && force.p === g.tutorialTrainer)));
}

export function pushChargeDuration(force, classicMax = 3) {
  return Math.round(classicMax * (experimentalForceEnabled(force) ? EXPERIMENTAL_PUSH_CHARGE_MULT : 1) * 1000) / 1000;
}

export function pushImpulseMultiplier(force) {
  return experimentalForceEnabled(force) ? EXPERIMENTAL_PUSH_DISTANCE_MULT : 1;
}

export function gripPushEligible(force) {
  const g = force?.g, p = force?.p, t = force?.target;
  const v = t?.type === 'npc' ? t.ref : null;
  if (!experimentalForceEnabled(force) || force.holding !== 'grip' ||
      !v || v === p || v.remote || v.isRancorBoss || v.status !== 'gripped' ||
      v.hp <= 0 || v.spawnShield > g.t || p.status !== 'normal' ||
      !g.foesOf(p)?.includes(v) || (force.cool?.throw || 0) > g.t ||
      force.fp < GRIP_PUSH_COST || !Number.isFinite(force.gripT)) return false;
  const d = Math.hypot(v.pos[0] - p.pos[0], v.pos[2] - p.pos[2]);
  return d > 0.3 && d <= 14;
}

// Probe the actual map's collision interface, not screen distance or a
// pretend nearby wall. If no actual obstacle clips the victim's collision
// capsule, the normal Force launch can be used instead.
export function findWallPin(world, victim, direction) {
  if (!world?.collide || !world?.floorAt || !victim?.pos || !direction) return null;
  const len = Math.hypot(direction[0], direction[2]);
  if (!Number.isFinite(len) || len < 0.01) return null;
  const ux = direction[0] / len, uz = direction[2] / len;
  const start = victim.pos, r = Math.max(0.2, victim.radius || 0.35);
  for (let d = 0.2; d <= WALL_PIN_MAX_DISTANCE; d += 0.2) {
    const intended = [start[0] + ux * d, start[1], start[2] + uz * d];
    const resolved = intended.slice();
    world.collide(resolved, r);
    const correction = Math.hypot(resolved[0] - intended[0], resolved[2] - intended[2]);
    if (correction < 0.08) continue;
    const actual = Math.hypot(resolved[0] - start[0], resolved[2] - start[2]);
    if (actual < WALL_PIN_MIN_DISTANCE || actual > WALL_PIN_MAX_DISTANCE) return null;
    const floor = world.floorAt(resolved[0], resolved[2], start[1] + 1.5);
    if (floor === null || !Number.isFinite(floor)) return null;
    return { pos: [resolved[0], floor, resolved[2]], direction: [ux, 0, uz], distance: actual };
  }
  return null;
}
