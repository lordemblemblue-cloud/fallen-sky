import { rayBox, rayCylinder } from './level/space.js';

// Academy MP bg_saber.c PM_CheckEnemyPresence uses a 12-unit half-size
// box, traced 100 units along a cardinal direction. Game 2 uses 40 units/m.
export const ACADEMY_DUAL_PRESENCE = Object.freeze({ reach: 100 / 40, halfSize: 12 / 40, originHeight: 24 / 40 });
export const ACADEMY_DUAL_ATTACKS = Object.freeze({
  LS_DUAL_FB: 'BOTH_A6_FB', LS_DUAL_LR: 'BOTH_A6_LR',
});

// Append source move rows without renumbering the existing Outcast/Academy
// additions. These attacks do not charge Force in PM_SaberAttackForMovement.
export function withAcademyDualMoves(moves) {
  const out = moves.slice(), ready = moves.find(m => m.ls === 'LS_READY').id;
  for (const [ls, anim] of Object.entries(ACADEMY_DUAL_ATTACKS)) {
    if (out.some(move => move.ls === ls)) continue;
    out.push({ id: out.length, ls, anim, name: ls === 'LS_DUAL_FB' ? 'Dual FB Atk' : 'Dual LR Atk',
      startQuad: 1, endQuad: 1, flag: 'AFLAG_ACTIVE', blend: 100,
      blocking: 'BLK_TIGHT', chainIdle: ready, chainAttack: ready, trail: 200, dualAttack: true });
  }
  return out;
}

export function academyDualAttackMove(ids, move, { available, targets, hasAnim }) {
  if (!available || !targets) return move;
  if ([ids.LS_A_R2L, ids.LS_S_R2L, ids.LS_A_L2R, ids.LS_S_L2R].includes(move) &&
      targets.left && targets.right && hasAnim(ACADEMY_DUAL_ATTACKS.LS_DUAL_LR)) return ids.LS_DUAL_LR;
  if ([ids.LS_A_T2B, ids.LS_S_T2B, ids.LS_A_BACK, ids.LS_A_BACK_CR].includes(move) &&
      targets.front && targets.back && hasAnim(ACADEMY_DUAL_ATTACKS.LS_DUAL_FB)) return ids.LS_DUAL_FB;
  return move;
}

function expandedBoxHit(from, delta, min, max) {
  const pad = ACADEMY_DUAL_PRESENCE.halfSize;
  return rayBox(...from, ...delta, min.map(value => value - pad), max.map(value => value + pad));
}

// The original prediction code accepts any player/NPC, including teammates.
// Game 2 passes its existing hostile list, matching its damage/team policy.
export function academyDualTargetPresence(fighter, foes, world) {
  const { reach, halfSize: pad, originHeight } = ACADEMY_DUAL_PRESENCE;
  const from = [fighter.pos[0], fighter.pos[1] + originHeight, fighter.pos[2]];
  const sin = Math.sin(fighter.yaw), cos = Math.cos(fighter.yaw);
  const directions = { front: [sin, cos], back: [-sin, -cos], right: [-cos, sin], left: [cos, -sin] };
  const result = { front: false, back: false, left: false, right: false };
  if (!foes?.length) return result;
  const space = world?.space;
  for (const [name, direction] of Object.entries(directions)) {
    const delta = [direction[0] * reach, 0, direction[1] * reach];
    const to = from.map((value, i) => value + delta[i]);
    let obstruction = 1, enemyHit = null;
    for (const foe of foes) {
      if (foe === fighter || foe.status === 'dead') continue;
      const radius = foe.radius ?? .42, height = foe.ducked ? 1.1 : 1.85, p = foe.pos;
      const hit = expandedBoxHit(from, delta, [p[0] - radius, p[1], p[2] - radius],
        [p[0] + radius, p[1] + height, p[2] + radius]);
      if (hit === null || hit >= 1 || (enemyHit !== null && hit >= enemyHit)) continue;
      // Imported BSPs expose their original wall-triangle sight query. Its
      // narrow segment fallback keeps opponents across a wall ineligible.
      if (!space) {
        const contact = from.map((value, i) => value + delta[i] * hit);
        if (world?.mapCollision?.rayBlocked?.(from, contact) ||
            world?.lineOfSight?.(from, contact) === false) continue;
      }
      enemyHit = hit;
    }
    // Empty directions need no world sweep. This is a selection query, not
    // another collision simulation for every dual fighter on every frame.
    if (enemyHit === null) continue;
    const testObstacle = box => {
      const hit = expandedBoxHit(from, delta, box.min, box.max);
      if (hit !== null) obstruction = Math.min(obstruction, hit);
    };
    for (const box of space?.solids || []) testObstacle(box);
    for (const box of space?.clips || []) testObstacle(box);
    for (const door of space?.doors?.values() || []) {
      if (door.lift < .98) testObstacle(space.doorBox(door));
    }
    const pillars = space?.pillarCylinders || (world?.pillars || []).map(p =>
      ({ cx: p.x, cz: p.z, radius: p.r, y0: -1e6, y1: 1e6 }));
    for (const pillar of pillars) {
      const hit = rayCylinder(from, to, { ...pillar, radius: pillar.radius + pad,
        y0: pillar.y0 - pad, y1: pillar.y1 + pad });
      if (hit !== null) obstruction = Math.min(obstruction, hit);
    }
    result[name] = enemyHit < obstruction;
  }
  return result;
}
