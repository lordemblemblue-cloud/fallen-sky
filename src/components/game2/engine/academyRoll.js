// Jedi Academy MP bg_saber.c PM_WeaponLightsaber / saberMoveData and
// bg_pmove.c BG_AdjustClientSpeed. All distances use 40 Raven units/metre.
export const ACADEMY_ROLL = Object.freeze({ stabWindow: 0.25, forceCost: 25, clearance: 64/40 });

// Keep the shipped Outcast move IDs intact for recordings/network snapshots.
// Native Academy additions live after them; never mutate shared asset data.
export function withAcademyRollMove(moves) {
  if (moves.some(m => m.ls === 'LS_ROLL_STAB')) return moves.slice();
  const ready = moves.find(m => m.ls === 'LS_READY').id;
  return [...moves, { id: moves.length, ls: 'LS_ROLL_STAB', name: 'RollStab',
    anim: 'BOTH_ROLL_STAB', startQuad: 1, endQuad: 1, flag: 'AFLAG_ACTIVE',
    blend: 100, blocking: 'BLK_TIGHT', chainIdle: ready, chainAttack: ready, trail: 200 }];
}

export function academyRollSpeed(anim, remainingSeconds) {
  const timer = Math.max(0, remainingSeconds * 1000);
  const divisor = anim === 'BOTH_ROLL_B' ? (timer > 800 ? 2.5 : 6) : (timer > 800 ? 1.5 : 5);
  return Math.min(600, timer/divisor)/40;
}
