// Duelist Adventure's own animations: key poses for every move in the rules core, baked onto each body's
// rig by Fallen Sky's pose baker (two-bone IK from the rig's rest pose). Each clip lasts exactly as long as
// its move, with the strike at the move's contact time, so the animator can drive the clip straight from
// the simulation's action time.
//
// Key format (weaponComboClips.js): body-space vectors [forward, up, right] in metres for a 1.7 m body.
//   arm: wrist target from that arm's shoulder (third value towards the arm's own side);
//   blade: where the crystal blade points (true body right); spine: [twist right, bend forward, lean right]
//   degrees; hips: [drop m, twist deg]; feet: { l, r: [forward, right, yaw, lift] } plant the feet.
import * as THREE from 'three';
import { MOVES } from '../core/index.mjs';
import { bakeWeaponComboClips, captureRestPose } from '../../game3d/weapons/weaponComboClips.js';
import { solveFallbackGrip } from '../../game3d/weapons/playerWeaponRuntime.js';

export const CRYSTAL_SWORD = Object.freeze({ hand: 'right', class: 'sword', handleRadius: 0.016, length: 0.98 });

const READY = { spine: [0, 6, 0], hips: [0.06, 6], r: { arm: [0.34, -0.18, 0.1], blade: [0.6, 0.72, 0.2] }, l: { arm: [0.3, -0.22, -0.02] } };
const GUARD = { spine: [0, 4, 0], hips: [0.08, 0], r: { arm: [0.34, 0.06, -0.06], blade: [0.3, 0.62, -0.72] }, l: { arm: [0.28, -0.1, -0.08] } };
const CAST = (l, extra = {}) => ({ spine: [0, 4, 0], hips: [0.06, 4], r: { arm: [0.24, -0.3, 0.16], blade: [0.5, -0.2, 0.84] }, l: { arm: l }, ...extra });
const end = (move) => MOVES[move].duration;

export const DUEL_MOVES = [
  // ---- crystal sword
  { name: 'swordLight1', hit: MOVES.swordLight1.startup, sweep: [0.06, 0.2], cancel: MOVES.swordLight1.cancelFrom, keys: [ // rising diagonal
    { t: 0, ...READY },
    { t: 0.04, spine: [22, 6, -2], hips: [0.08, 10], r: { arm: [0.16, -0.34, 0.3], blade: [0.35, -0.6, 0.72] }, l: { arm: [0.3, -0.2, -0.06] } },
    { t: 0.13, spine: [-10, 4, 2], hips: [0.07, -4], r: { arm: [0.52, 0.06, -0.06], blade: [0.72, 0.5, -0.48] }, l: { arm: [0.24, -0.24, 0.04] } },
    { t: 0.2, spine: [-24, 2, 3], hips: [0.06, -12], r: { arm: [0.3, 0.32, -0.28], blade: [-0.1, 0.9, -0.42] }, l: { arm: [0.2, -0.28, 0.08] } },
    { t: end('swordLight1'), ...READY },
  ] },
  { name: 'swordLight2', hit: MOVES.swordLight2.startup, sweep: [0.05, 0.19], cancel: MOVES.swordLight2.cancelFrom, keys: [ // flat backhand
    { t: 0, ...READY },
    { t: 0.05, spine: [-22, 6, 2], hips: [0.07, -10], r: { arm: [0.24, 0.04, -0.28], blade: [0.35, 0.55, -0.75] }, l: { arm: [0.24, -0.26, 0.06] } },
    { t: 0.12, spine: [8, 6, -1], hips: [0.07, 4], r: { arm: [0.56, -0.02, 0.1], blade: [0.8, 0.05, 0.6] }, l: { arm: [0.26, -0.24, -0.04] } },
    { t: 0.2, spine: [24, 5, -3], hips: [0.06, 12], r: { arm: [0.3, -0.04, 0.38], blade: [0.25, 0.02, 0.97] }, l: { arm: [0.3, -0.2, -0.1] } },
    { t: end('swordLight2'), ...READY },
  ] },
  { name: 'swordLight3', hit: MOVES.swordLight3.startup, sweep: [0.08, 0.26], cancel: MOVES.swordLight3.cancelFrom, keys: [ // overhead cleave
    { t: 0, ...READY },
    { t: 0.05, spine: [6, -10, 0], hips: [0.04, 2], r: { arm: [0.08, 0.46, 0.06], blade: [-0.4, 0.9, 0.05] }, l: { arm: [0.1, 0.32, 0.2] } },
    { t: 0.16, spine: [-2, 22, 0], hips: [0.12, -2], r: { arm: [0.58, -0.14, 0.0], blade: [0.75, -0.6, 0.0] }, l: { arm: [0.4, -0.3, 0.16] } },
    { t: 0.26, spine: [-2, 24, 0], hips: [0.13, -2], r: { arm: [0.56, -0.2, 0.0], blade: [0.7, -0.68, 0.0] }, l: { arm: [0.38, -0.34, 0.14] } },
    { t: end('swordLight3'), ...READY },
  ] },
  { name: 'swordHeavy', hit: MOVES.swordHeavy.startup, sweep: [0.2, 0.4], cancel: MOVES.swordHeavy.cancelFrom, keys: [ // coiled sweeping cut
    { t: 0, ...READY },
    { t: 0.2, spine: [34, 4, -4], hips: [0.1, 18], r: { arm: [-0.06, -0.08, 0.36], blade: [-0.7, 0.2, 0.68] }, l: { arm: [0.36, -0.12, -0.18] } },
    { t: 0.3, spine: [-28, 12, 3], hips: [0.12, -16], r: { arm: [0.62, -0.06, -0.14], blade: [0.8, 0.0, -0.6] }, l: { arm: [0.08, -0.34, 0.24] } },
    { t: 0.4, spine: [-40, 10, 3], hips: [0.11, -22], r: { arm: [0.34, -0.1, -0.42], blade: [0.0, 0.0, -1.0] }, l: { arm: [0.02, -0.36, 0.28] } },
    { t: end('swordHeavy'), ...READY },
  ] },
  // ---- Telekinesis: the free hand works the space in front of it
  { name: 'push', hit: MOVES.push.startup, cancel: MOVES.push.cancelFrom, keys: [
    { t: 0, ...READY },
    { t: 0.05, ...CAST([0.04, 0.02, 0.22], { spine: [12, 2, 0] }) },
    { t: 0.13, ...CAST([0.64, 0.04, -0.04], { spine: [-14, 8, 0], hips: [0.09, -8] }) },
    { t: 0.24, ...CAST([0.62, 0.02, -0.04], { spine: [-12, 8, 0], hips: [0.09, -8] }) },
    { t: end('push'), ...READY },
  ] },
  { name: 'pull', hit: MOVES.pull.startup, cancel: MOVES.pull.cancelFrom, keys: [
    { t: 0, ...READY },
    { t: 0.07, ...CAST([0.62, 0.08, 0.0], { spine: [-10, 6, 0] }) },
    { t: 0.13, ...CAST([0.06, -0.06, 0.18], { spine: [16, 0, 0], hips: [0.05, 8] }) },
    { t: end('pull'), ...READY },
  ] },
  { name: 'grip', hit: MOVES.grip.startup, keys: [ // the clip ends on the hold; the animator keeps it while channelling
    { t: 0, ...READY },
    { t: MOVES.grip.startup, ...CAST([0.52, 0.28, -0.04], { spine: [-6, 2, 0] }) },
    { t: MOVES.grip.startup + 0.25, ...CAST([0.5, 0.34, -0.02], { spine: [-8, 1, 0] }) },
  ] },
  { name: 'gripThrow', hit: 0.04, keys: [
    { t: 0, ...CAST([0.5, 0.34, -0.02], { spine: [-8, 1, 0] }) },
    { t: 0.08, ...CAST([0.56, 0.12, -0.34], { spine: [-22, 6, 0], hips: [0.08, -10] }) },
    { t: end('gripThrow'), ...READY },
  ] },
  { name: 'breach', hit: MOVES.breach.startup, cancel: MOVES.breach.cancelFrom, keys: [
    { t: 0, ...READY },
    { t: 0.08, ...CAST([0.1, -0.04, 0.2], { spine: [10, 4, 0] }) },
    { t: 0.15, ...CAST([0.62, -0.02, -0.04], { spine: [-8, 12, 0], hips: [0.13, -6] }) },
    { t: end('breach'), ...READY },
  ] },
  { name: 'resist', hit: 0, keys: [
    { t: 0, ...READY },
    { t: 0.06, spine: [0, -8, 0], hips: [0.04, 0], r: { arm: [0.16, 0.02, 0.4], blade: [0.2, 0.9, 0.38] }, l: { arm: [0.16, 0.02, 0.42] } },
    { t: end('resist'), ...READY },
  ] },
  { name: 'dash', hit: 0, keys: [
    { t: 0, ...READY },
    { t: 0.08, spine: [0, 22, 0], hips: [0.15, 0], r: { arm: [0.1, -0.32, 0.24], blade: [0.4, -0.5, 0.75] }, l: { arm: [0.0, -0.3, 0.2] } },
    { t: end('dash') - 0.06, spine: [0, 20, 0], hips: [0.14, 0], r: { arm: [0.1, -0.32, 0.24], blade: [0.4, -0.5, 0.75] }, l: { arm: [0.0, -0.3, 0.2] } },
    { t: end('dash'), ...READY },
  ] },
  // ---- held poses and reactions (looped or clamped by the animator)
  { name: 'guard', hit: 0, keys: [{ t: 0, ...GUARD }, { t: 1, ...GUARD, spine: [0, 5, 0] }, { t: 2, ...GUARD }] },
  { name: 'ready', hit: 0, keys: [{ t: 0, ...READY }, { t: 1.2, ...READY, spine: [0, 7.5, 0], hips: [0.07, 6] }, { t: 2.4, ...READY }] },
  { name: 'stagger', hit: 0, keys: [
    { t: 0, ...READY },
    { t: 0.1, spine: [0, -18, 4], hips: [0.02, 6], r: { arm: [0.0, -0.2, 0.3], blade: [-0.3, 0.9, 0.3] }, l: { arm: [-0.04, -0.2, 0.3] } },
    { t: 0.45, ...READY },
  ] },
  { name: 'held', hit: 0, keys: [
    { t: 0, spine: [0, -10, 0], hips: [0, 0], r: { arm: [0.08, -0.34, 0.3], blade: [0.2, -0.9, 0.3] }, l: { arm: [0.08, -0.34, 0.3] } },
    { t: 0.6, spine: [0, -14, 3], hips: [0, 0], r: { arm: [0.12, -0.28, 0.34], blade: [0.25, -0.85, 0.4] }, l: { arm: [0.04, -0.4, 0.26] } },
    { t: 1.2, spine: [0, -10, 0], hips: [0, 0], r: { arm: [0.08, -0.34, 0.3], blade: [0.2, -0.9, 0.3] }, l: { arm: [0.08, -0.34, 0.3] } },
  ] },
];
export const LOOPED = Object.freeze(new Set(['guard', 'ready', 'held']));

/**
 * Bake every Duelist move onto `model` (call before any animation has played: the rest pose matters).
 * Returns { clips: { name: AnimationClip }, grip: { position, quaternion, scale } } (the crystal sword's
 * combat grip in the right hand bone's space, for attaching the weapon).
 */
export function bakeDuelMoves(model) {
  const rest = captureRestPose(model);
  const solved = solveFallbackGrip(model, CRYSTAL_SWORD, ['combat'], 1.7);
  const grip = solved?.grips?.combat || null;
  const quaternion = grip ? grip.quaternion : null;
  const clips = bakeWeaponComboClips(model, 'sword', quaternion ? { right: new THREE.Quaternion().fromArray(quaternion) } : {},
    { rest, reach: CRYSTAL_SWORD.length, moves: DUEL_MOVES });
  return { clips, grip, handBone: solved?.bone || null };
}
