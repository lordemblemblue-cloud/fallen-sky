// Game 2: short-window eight-way saber guard. Pure direction logic, no
// animation or network changes. Sectors are clock positions starting at right:
// R, UR, U, UL, L, DL, D, DR. The combat engine still enforces unparryable
// attacks, facing, saber readiness and player-owned multiplayer defense.
export const GUARD_SECTORS = Object.freeze(['R', 'UR', 'U', 'UL', 'L', 'DL', 'D', 'DR']);
export const GUARD_WINDOW = 0.32;
export const GUARD_NEUTRAL_CHANCE = 0.35;
export const GUARD_MISMATCH_CHANCE = 0.08;
export const GUARD_GESTURE_PX = 5;

export function guardSector(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.0001) return null;
  const index = (Math.round(Math.atan2(-dy, dx) * 4 / Math.PI) + 8) % 8;
  return GUARD_SECTORS[index];
}

export function guardSectorFromHit(defender, point) {
  // Convert the 3D contact point to the defender's screen-relative left/right
  // and vertical guard zones. This is contact direction, not the attacking
  // animation's incoming swing vector (the latter is not stored by this engine).
  const yaw = defender.yaw || 0;
  const dx = point[0] - defender.pos[0], dz = point[2] - defender.pos[2];
  const lateral = dx * (-Math.cos(yaw)) + dz * Math.sin(yaw);
  const vertical = point[1] - defender.pos[1] - (defender.ducked ? 0.58 : 0.95);
  return guardSector(lateral, -vertical);
}

export function updateDirectionalGuard(previous, { held, dx = 0, dy = 0, now = 0 } = {}) {
  if (!held) return { held: false, sector: null, until: 0 };
  const old = previous?.held ? previous : { held: true, sector: null, until: 0 };
  if (Math.hypot(dx, dy) >= GUARD_GESTURE_PX) {
    return { held: true, sector: guardSector(dx, dy), until: now + GUARD_WINDOW };
  }
  return { ...old, held: true };
}

export function directionalGuardChance(state, hitSector, now) {
  if (!state?.held) return null; // retain original parry rules unless guarding
  if (state.sector && now <= state.until) {
    return state.sector === hitSector ? 1 : GUARD_MISMATCH_CHANCE;
  }
  return GUARD_NEUTRAL_CHANCE; // holding still never becomes a perfect shield
}
