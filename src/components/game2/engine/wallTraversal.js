// Academy wall traversal, in the engine's 40 Raven units/metre convention.
// bg_pmove PM_CheckJump and bg_pangles PM_AdjustAngleForWallRun own the
// input, clip windows, wall adhesion and tangent; animation.cfg owns duration.
export const WALL_TRAVERSAL = Object.freeze({
  reach: 0.82, durationSide: 1.85, durationUp: 1.35,
  sideSpeed: 250 / 40, neutralSpeed: 175 / 40, backSpeed: 100 / 40,
  adhesion: 128 / 40, upSpeed: 300 / 40, launchVertical: 590 / 2 / 40,
  kickHorizontal: 150 / 40, upKickVertical: 200 / 40,
  kickStart: 0.4, kickEnd: 0.4, releaseTail: 0.5, cooldown: 0.42, forceCost: 10,
  kickSteerDelay: 0.18,
});

// Carry travel along the wall into the exit instead of halving it and
// allowing the inward adhesion velocity to cancel the outward impulse.
// The owner's requested exit is diagonal in the direction of travel.
export function wallKickVelocity(run, velocity) {
  if (run.mode !== 'side') return [
    velocity[0] * 0.5 + run.normal[0] * WALL_TRAVERSAL.kickHorizontal,
    velocity[2] * 0.5 + run.normal[1] * WALL_TRAVERSAL.kickHorizontal,
  ];
  const along = velocity[0] * run.tangent[0] + velocity[2] * run.tangent[1];
  const outward = Math.max(WALL_TRAVERSAL.kickHorizontal, Math.abs(along));
  return [run.tangent[0] * along + run.normal[0] * outward,
    run.tangent[1] * along + run.normal[1] * outward];
}

export function wallAnimationDuration(animations, name, fallback = 0.8) {
  const a = animations?.[name];
  return a?.n > 0 && Math.abs(a.fps) > 0 ? a.n / Math.abs(a.fps) : fallback;
}

// Keep tracking an active run independently of the movement keys. Academy
// forces the wall-facing strafe during a run; W/S then adjust forward speed.
export function findWallForTraversal(space, position, yaw, input, active = null) {
  if (!space || typeof space.raycast !== 'function') return null;
  const forward = [Math.sin(yaw), Math.cos(yaw)];
  const right = [-Math.cos(yaw), Math.sin(yaw)];
  const ray = (dir, mode, side) => {
    let normal = null;
    for (const height of [0.8, 1.45]) {
      const from = [position[0], position[1] + height, position[2]];
      const to = [from[0] + dir[0] * WALL_TRAVERSAL.reach, from[1],
        from[2] + dir[1] * WALL_TRAVERSAL.reach];
      const hasContact = typeof space.raycastContact === 'function';
      const hit = hasContact ? space.raycastContact(from, to, { ignoreDoors: true }) : null;
      const fraction = hasContact ? hit?.fraction ?? null : space.raycast(from, to, { ignoreDoors: true });
      if (fraction === null || fraction < 0 || fraction > 1) return null;
      const n = hit?.normal || [-dir[0], 0, -dir[1]];
      // Top surfaces and sloping caps are not runnable wall faces.
      if (n[1] < 0 || n[1] > 0.4) return null;
      const len = Math.hypot(n[0], n[2]);
      if (len < 0.9) return null;
      const flat = [n[0] / len, n[2] / len];
      if (normal && normal[0] * flat[0] + normal[1] * flat[1] < 0.9) return null;
      normal = flat;
    }
    if (normal[0] * -dir[0] + normal[1] * -dir[1] < 0.7) return null;
    const tangent = mode === 'up' ? [0, 0] : [-side * normal[1], side * normal[0]];
    // End a run into a perpendicular wall instead of sliding indefinitely
    // at a corner. This is the native forward clearance trace.
    if (mode === 'side') {
      const from = [position[0], position[1] + 0.8, position[2]];
      const to = [from[0] + tangent[0] * 0.8, from[1], from[2] + tangent[1] * 0.8];
      const block = space.raycastContact?.(from, to, { ignoreDoors: true });
      if (block && block.normal[0] * tangent[0] + block.normal[2] * tangent[1] < -0.999) return null;
    }
    return { mode, side, normal, tangent };
  };
  if (active) return ray([-active.normal[0], -active.normal[1]], active.mode, active.side);
  if (input.fwd > 0.25 && Math.abs(input.right) > 0.25 && !input.walk) {
    const side = input.right < 0 ? -1 : 1;
    return ray([right[0] * side, right[1] * side], 'side', side);
  }
  if (input.fwd > 0.3 && Math.abs(input.right) <= 0.25) return ray(forward, 'up', 0);
  return null;
}

export function chooseWallAnimation(animations, mode, side, phase = 'run') {
  const candidates = phase === 'kick'
    ? side < 0 ? ['BOTH_WALL_RUN_LEFT_FLIP', 'BOTH_WALL_FLIP_LEFT'] :
      side > 0 ? ['BOTH_WALL_RUN_RIGHT_FLIP', 'BOTH_WALL_FLIP_RIGHT'] :
        ['BOTH_FORCEWALLRUNFLIP_END', 'BOTH_WALL_FLIP_BACK1', 'BOTH_WALL_FLIP_BACK2']
    : phase === 'stop' ? side < 0 ? ['BOTH_WALL_RUN_LEFT_STOP'] : ['BOTH_WALL_RUN_RIGHT_STOP']
      : mode === 'up' ? ['BOTH_FORCEWALLRUNFLIP_START', 'BOTH_FORCEJUMP1', 'BOTH_JUMP1'] :
        side < 0 ? ['BOTH_WALL_RUN_LEFT', 'BOTH_FORCEINAIR1'] : ['BOTH_WALL_RUN_RIGHT', 'BOTH_FORCEINAIR1'];
  return candidates.find(name => animations?.[name]?.n > 0) ||
    (phase === 'kick' ? 'BOTH_JUMPBACK1' : 'BOTH_INAIR1');
}
