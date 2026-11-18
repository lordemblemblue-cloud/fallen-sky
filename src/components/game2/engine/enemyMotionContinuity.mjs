// Game 2: performance LOD must never starve an NPC's active movement,
// authored animation, combat recovery or physics state. This module contains
// no renderer/React dependencies so its contract is testable in isolation.
const activeTimer = (time, now) => Number.isFinite(time) && time > now;
const movingInput = command => !!command && (
  Math.abs(command.fwd || 0) > .01 ||
  Math.abs(command.right || 0) > .01 ||
  Math.abs(command.up || 0) > .01 ||
  command.jump || command.jumpPressed || command.crouchPressed ||
  command.attack || command.alt
);

/**
 * Return true whenever skipping a Game 2 enemy simulation step or an Actor
 * animation evaluation could show a frozen, snapping or stale weapon pose.
 *
 * The AI/physics/combat systems remain authoritative. Quiet distant NPCs
 * continue to use the original throttling, while engaged foes remain at the
 * fixed 60 Hz step and have their original animation bank evaluated.
 */
export function enemyNeedsContinuousMotion(fighter, now = 0) {
  const f = fighter;
  if (!f || f.isPlayer || f.remote) return true;
  if (f.status !== 'normal' || !f.onGround ||
      f.hp <= 0 || f.dodge || f.kata || f.kicking || f.wallTraversal ||
      f.thrown || f.nativeRoll || f.critStrike || f.executor ||
      f.experimentalRecovery) return true;
  if (f.saber?.isActiveSwing?.() ||
      (f.saber?.weaponTime || 0) > 0 ||
      (f.saber?.torsoTimer || 0) > 0 ||
      (f.timers?.length || 0) > 0 ||
      f.force?.holding) return true;
  if (activeTimer(f.forceUntil, now) ||
      activeTimer(f.legsLockUntil, now) ||
      activeTimer(f.landUntil, now) ||
      activeTimer(f.swingLegsUntil, now) ||
      activeTimer(f.openUntil, now) ||
      activeTimer(f.critAt, now) ||
      activeTimer(f.critUntil, now) ||
      activeTimer(f.experimentalExchangeRecoveryUntil, now) ||
      activeTimer(f.experimentalInjuryReadyAt, now)) return true;
  const v = f.vel || [0, 0, 0];
  if (Math.hypot(v[0] || 0, v[1] || 0, v[2] || 0) > .12 ||
      Math.hypot(f.shoveV?.[0] || 0, f.shoveV?.[2] || 0) > .08 ||
      movingInput(f.cmd)) return true;
  const mode = f.ai?.mode;
  if (mode && !['dormant', 'post', 'idle'].includes(mode)) return true;
  const state = f.ai?.state;
  if (state && !['post', 'idle'].includes(state)) return true;
  const diff = (f.targetYaw ?? f.yaw ?? 0) - (f.yaw ?? 0);
  if (Number.isFinite(diff) && Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) > .05)
    return true;
  return false;
}
