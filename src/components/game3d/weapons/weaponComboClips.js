// 3-hit weapon combos, baked onto each character's own skeleton.
//
// Poses are written in body space (forward, up, right of the character) and solved on the actual rig with
// two-bone IK from the rig's rest pose, so the same combo fits the fused female/male (Mixamo) and the v5
// bodies. Each hand is turned so the held weapon points where the key says (the blade's arc for a sword, an
// upright bow with the arrow forward for a bow), using that weapon's own combat grip from the weapon pack.
// Output: ordinary AnimationClips that the player controller binds as one-shot states.
//
//   sword:   swordCombo1 flat slash, swordCombo2 rising diagonal, swordCombo3 forward thrust (owner handoff
//            2026-11-18: 0.50 / 0.54 / 0.48 s, contact at 0.22 / 0.24 / 0.21 s)
//   two-hand: swordTwoHand1-3, both hands on the hilt while the right button is held (owner 2026-11-18)
//   daggers: held in a reverse grip in both hands (owner 2026-11-19: blade down along the forearm, thumb on the
//            pommel): daggerLight1 right hook slash and daggerLight2 left hook slash (left click, the fastest),
//            daggerStab (right click): 0.33 / 0.37 / 0.43 s, contact at 0.12 / 0.15 / 0.18 s
//   bow:     bowCombo1 quick shot, bowCombo2 fast shot with a sidestep lean, bowCombo3 overdrawn power shot (other
//            players' avatars); the player's own shots (owner 2026-11-19): bowDraw draws while the aim is held,
//            bowHold holds at full draw, bowRelease looses from full draw, bowQuick draws and looses at once (a
//            tap, or each further shot of a skill), bowRunCarry the bow arm's pose while running
//   idles:   idleSword, idleSwordTwoHand, idleDaggers, idleBow: looping stances for each weapon in hand
// clip.userData: { combo, index, hit, sweep, cancel } in clip seconds — hit = the strike / arrow release,
// sweep = [start, end] of the blade's cutting arc (trail recording), cancel = when the next hit may start;
// the bow's draws also say when the arrow is nocked (nock) and the string fully drawn (full).
import * as THREE from 'three';
import { solveMountedLimb } from '../player/mountedRiderPose.mjs';

export const WEAPON_COMBO_STATES = Object.freeze({
  swordCombo: Object.freeze(['swordCombo1', 'swordCombo2', 'swordCombo3']),
  bowCombo: Object.freeze(['bowCombo1', 'bowCombo2', 'bowCombo3']),
  // daggers: left click chains the light slashes (the fastest), right click is the normal stab
  daggerLight: Object.freeze(['daggerLight1', 'daggerLight2']),
  daggerStab: Object.freeze(['daggerStab']),
  // a sword held in both hands while the right mouse button is held
  swordTwoHand: Object.freeze(['swordTwoHand1', 'swordTwoHand2', 'swordTwoHand3']),
  swordSingleTier1: Object.freeze(['swordSingleTier1']),
  swordSingleTier2: Object.freeze(['swordSingleTier2']),
  swordSingleTier3: Object.freeze(['swordSingleTier3']),
  swordSingleTier4: Object.freeze(['swordSingleTier4']),
  swordTripleTier1: Object.freeze(['swordTripleTier1Hit1', 'swordTripleTier1Hit2', 'swordTripleTier1Hit3']),
  swordTripleTier2: Object.freeze(['swordTripleTier2Hit1', 'swordTripleTier2Hit2', 'swordTripleTier2Hit3']),
  swordTripleTier3: Object.freeze(['swordTripleTier3Hit1', 'swordTripleTier3Hit2', 'swordTripleTier3Hit3']),
  swordTripleTier4: Object.freeze(['swordTripleTier4Hit1', 'swordTripleTier4Hit2', 'swordTripleTier4Hit3']),
  // the player's own bow shots: loosed from the held draw, or drawn and loosed in one quick motion
  bowRelease: Object.freeze(['bowRelease']),
  bowQuick: Object.freeze(['bowQuick']),
  // a basic swing held into a charge (owner 2026-11-19, combat/HoldChargeRules.mjs): the wind-up slows while held
  swordCharge: Object.freeze(['swordCharge']),
  swordTwoHandCharge: Object.freeze(['swordTwoHandCharge']),
  daggerCharge: Object.freeze(['daggerCharge']),
});
// The charge move a held basic swing of each kind turns into.
export const CHARGE_STATE_FOR_KIND = Object.freeze({
  swordCombo: 'swordCharge', swordTwoHand: 'swordTwoHandCharge', daggerLight: 'daggerCharge', daggerStab: 'daggerCharge',
});
export const WEAPON_COMBO_STATE_NAMES = Object.freeze(
  Object.values(WEAPON_COMBO_STATES).flat(),
);
// Looping stances for the weapon in hand, baked with the combos (same grips) and played while standing.
export const WEAPON_IDLE_STATES = Object.freeze(['idleSword', 'idleSwordTwoHand', 'idleDaggers', 'idleBow']);
// The bow's held poses, baked with the shots: the draw while the aim is held (bowDraw, then the bowHold loop at
// full draw) and the bow arm's pose while running (bowRunCarry, laid over the run by the player controller).
export const BOW_POSE_STATES = Object.freeze(['bowDraw', 'bowHold', 'bowRunCarry']);
// Which idle a standing character plays: family = the held weapon's mastery family; null = the normal idle.
export function weaponIdleState(family, { twoHand = false } = {}) {
  if (family === 'bow') return 'idleBow';
  if (family === 'dual_blades' || family === 'dagger') return 'idleDaggers';
  if (family === 'sword') return twoHand ? 'idleSwordTwoHand' : 'idleSword';
  return null;
}

// The two existing sword skills gain four visual tiers at mastery levels 1, 4, 7 and 10.
export function swordSkillComboKind(skillId, level=1, maxLevel=10) {
  const family=skillId==='sword_triple_slash'?'swordTripleTier'
    :skillId==='sword_heavy_strike'?'swordSingleTier':null;
  if(!family)return null;
  const max=Math.max(1,Number(maxLevel)||10);
  const value=Math.min(max,Math.max(1,Number(level)||1));
  const tier=Math.min(4,1+Math.floor((value-1)*3/Math.max(1,max-1)));
  return family+tier;
}

// Which family of clips a weapon class bakes: 'bow' -> bowCombo; dagger / dual blades -> daggerCombo;
// sword / greatsword / blade -> swordCombo; anything else has no combo.
export function comboKindForWeapon(kindOrClass) {
  const k = String(kindOrClass || '').toLowerCase();
  if (/bow/.test(k)) return 'bowCombo';
  if (/dagger|dual_blades/.test(k)) return 'daggerCombo';
  if (/sword|blade/.test(k)) return 'swordCombo';
  return null;
}

const sanitize = (n) => THREE.PropertyBinding.sanitizeNodeName(n);
const RIG = {
  hips: ['mixamorig:Hips', 'pelvis'],
  spine: ['mixamorig:Spine', 'spine_01'], spine1: ['mixamorig:Spine1', 'spine_02'], spine2: ['mixamorig:Spine2', 'spine_03'],
  neck: ['mixamorig:Neck', 'neck_01'], head: ['mixamorig:Head', 'head'],
  rSh: ['mixamorig:RightShoulder', 'clavicle_r'], lSh: ['mixamorig:LeftShoulder', 'clavicle_l'],
  rArm: ['mixamorig:RightArm', 'upperarm_r'], rFore: ['mixamorig:RightForeArm', 'lowerarm_r'], rHand: ['mixamorig:RightHand', 'hand_r'],
  lArm: ['mixamorig:LeftArm', 'upperarm_l'], lFore: ['mixamorig:LeftForeArm', 'lowerarm_l'], lHand: ['mixamorig:LeftHand', 'hand_l'],
  rUp: ['mixamorig:RightUpLeg', 'thigh_r'], rLeg: ['mixamorig:RightLeg', 'calf_r'], rFoot: ['mixamorig:RightFoot', 'foot_r'],
  lUp: ['mixamorig:LeftUpLeg', 'thigh_l'], lLeg: ['mixamorig:LeftLeg', 'calf_l'], lFoot: ['mixamorig:LeftFoot', 'foot_l'],
};
const DEG = Math.PI / 180;
// Finger joints that close around a hilt (thumbs keep their rest), and how far each one bends.
const FINGER_CURL = /(?:Index|Middle|Ring|Pinky)[123]$/;
const HILT_CURL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.05);

// Body-space vectors: [forward, up, right] in metres for a 1.7 m body (scaled to the actual rig).
// arm: wrist target relative to that arm's shoulder, third component towards that arm's own side (mirrored);
// blade: where the weapon's +Y (blade tip / upper limb) points, true body right (not mirrored). The roll about
// the blade, and so the edge, follows from the grip and the forearm: the wrist stays as straight as it can.
// spine: [twist about up (+ = turn right), bend about right (+ = forward), lean about forward (+ = right)] degrees.
// hips: [drop m, twist deg (+ = right)].
const STANCE = { l: [0.14, -0.13, 0], r: [-0.12, 0.14, -25] }; // [forward, right, toe-out yaw deg] of each foot
const GUARD = { arm: [0.32, -0.28, -0.05] }; // free hand in front of the chest
const SWORD_READY = { spine: [0, 4, 0], hips: [0.03, 0], r: { arm: [0.36, -0.2, 0.12], blade: [0.55, 0.65, 0.15] }, l: GUARD };

// The original three swings. The sword skills' legacy tier clips below are built from them, unchanged.
const LEGACY_SWORD_COMBO = [
  { name: 'swordCombo1', hit: 0.29, sweep: [0.15, 0.41], cancel: 0.4, keys: [ // forehand: right-back to front-left, flat
    { t: 0.0, ...SWORD_READY },
    { t: 0.15, spine: [34, 2, -3], hips: [0.05, 10], r: { arm: [-0.08, 0.06, 0.34], blade: [-0.6, 0.15, 0.78] }, l: { arm: [0.35, -0.15, -0.2] } },
    { t: 0.29, spine: [-26, 9, 2], hips: [0.06, -12], r: { arm: [0.58, -0.04, -0.2], blade: [0.75, 0.0, -0.66] }, l: { arm: [0.12, -0.4, -0.16] } },
    { t: 0.41, spine: [-44, 8, 3], hips: [0.06, -18], r: { arm: [0.24, -0.08, -0.5], blade: [-0.2, 0.05, -0.98] }, l: { arm: [0.05, -0.45, -0.14] } },
    { t: 0.64, ...SWORD_READY },
  ] },
  { name: 'swordCombo2', hit: 0.27, sweep: [0.14, 0.39], cancel: 0.38, keys: [ // rising backhand: low-left to high-right
    { t: 0.0, ...SWORD_READY },
    { t: 0.14, spine: [-36, 14, 6], hips: [0.08, -14], r: { arm: [0.34, -0.5, -0.36], blade: [0.2, -0.8, -0.55] }, l: { arm: [0.1, -0.42, -0.2] } },
    { t: 0.27, spine: [22, -4, -4], hips: [0.05, 10], r: { arm: [0.5, 0.28, 0.32], blade: [0.42, 0.75, 0.5] }, l: { arm: [0.3, -0.12, -0.28] } },
    { t: 0.39, spine: [36, -8, -5], hips: [0.04, 16], r: { arm: [0.12, 0.42, 0.42], blade: [-0.3, 0.9, 0.3] }, l: { arm: [0.32, -0.18, -0.24] } },
    { t: 0.62, ...SWORD_READY },
  ] },
  { name: 'swordCombo3', hit: 0.37, sweep: [0.2, 0.44], cancel: 0.55, keys: [ // overhead chop: raise behind the head, cleave down in front
    { t: 0.0, ...SWORD_READY },
    { t: 0.2, spine: [8, -14, 0], hips: [0.02, 4], r: { arm: [-0.02, 0.5, 0.04], blade: [-0.75, 0.62, 0.0] }, l: { arm: [0.08, 0.42, 0.24] } },
    { t: 0.37, spine: [-4, 24, 0], hips: [0.11, -4], r: { arm: [0.58, -0.22, -0.06], blade: [0.55, -0.83, -0.06] }, l: { arm: [0.46, -0.3, 0.18] } },
    { t: 0.52, spine: [-4, 26, 0], hips: [0.12, -4], r: { arm: [0.58, -0.26, -0.06], blade: [0.5, -0.86, -0.06] }, l: { arm: [0.44, -0.33, 0.17] } },
    { t: 0.65, spine: [0, 12, 0], hips: [0.07, -2], r: { arm: [0.5, -0.24, 0.04], blade: [0.85, 0.15, 0.1] }, l: { arm: [0.36, -0.3, 0.05] } }, // lift the blade
    { t: 0.82, ...SWORD_READY },
  ] },
];

// The handoff's sword timing (2026-11-18): a flat slash (0.50 s, contact 0.22), a diagonal slash (0.54 s,
// contact 0.24) and a forward thrust (0.48 s, contact 0.21). The two slashes are the original cuts, retimed.
const retime = (move, times, extra) => ({ ...move, ...extra, keys: move.keys.map((key, i) => ({ ...key, t: times[i] })) });
export const SWORD_COMBO = [
  retime(LEGACY_SWORD_COMBO[0], [0, 0.09, 0.22, 0.31, 0.5], { hit: 0.22, sweep: [0.09, 0.31], cancel: 0.34 }),
  retime(LEGACY_SWORD_COMBO[1], [0, 0.11, 0.24, 0.34, 0.54], { hit: 0.24, sweep: [0.11, 0.34], cancel: 0.37 }),
  { name: 'swordCombo3', hit: 0.21, sweep: [0.1, 0.3], cancel: 0.33, keys: [ // thrust: chamber at the hip, drive straight ahead
    { t: 0.0, ...SWORD_READY },
    { t: 0.1, spine: [20, 3, 0], hips: [0.05, 10], r: { arm: [0.02, -0.2, 0.22], blade: [0.96, 0.18, 0.2] }, l: { arm: [0.32, -0.18, -0.12] } },
    { t: 0.21, spine: [-18, 12, 0], hips: [0.1, -14], r: { arm: [0.68, -0.08, 0.02], blade: [0.99, 0.04, -0.06] }, l: { arm: [-0.02, -0.34, 0.2] } },
    { t: 0.3, spine: [-16, 11, 0], hips: [0.09, -13], r: { arm: [0.64, -0.09, 0.02], blade: [0.99, 0.04, -0.06] }, l: { arm: [0.0, -0.34, 0.2] } },
    { t: 0.48, ...SWORD_READY },
  ] },
];

// Both hands on the hilt (the left hand `hilt` metres towards the pommel): a squared guard, blade raised in
// front; the swings are a little heavier than the one-handed ones.
const TWO_HAND_HILT = { hilt: 0.09 };
const TWO_HAND_READY = { spine: [-10, 7, 0], hips: [0.08, 12], r: { arm: [0.36, -0.2, -0.1], blade: [0.72, 0.66, -0.2] }, l: TWO_HAND_HILT };
export const SWORD_TWO_HAND_COMBO = [
  { name: 'swordTwoHand1', combo: 'swordTwoHand', index: 0, hit: 0.24, sweep: [0.1, 0.34], cancel: 0.38, keys: [ // flat cleave
    { t: 0.0, ...TWO_HAND_READY },
    { t: 0.1, spine: [36, 3, -4], hips: [0.09, 18], r: { arm: [0.04, 0.06, 0.3], blade: [-0.55, 0.32, 0.77] }, l: TWO_HAND_HILT },
    { t: 0.24, spine: [-20, 10, 3], hips: [0.1, -14], r: { arm: [0.44, -0.06, -0.2], blade: [0.78, 0.02, -0.62] }, l: TWO_HAND_HILT },
    { t: 0.34, spine: [-34, 9, 3], hips: [0.1, -20], r: { arm: [0.3, -0.06, -0.34], blade: [0.05, 0.02, -0.99] }, l: TWO_HAND_HILT },
    { t: 0.52, ...TWO_HAND_READY },
  ] },
  { name: 'swordTwoHand2', combo: 'swordTwoHand', index: 1, hit: 0.26, sweep: [0.12, 0.37], cancel: 0.41, keys: [ // rising diagonal
    { t: 0.0, ...TWO_HAND_READY },
    { t: 0.12, spine: [-26, 14, 6], hips: [0.09, -10], r: { arm: [0.36, -0.34, -0.24], blade: [0.32, -0.7, -0.64] }, l: TWO_HAND_HILT },
    { t: 0.26, spine: [24, 3, -4], hips: [0.08, 14], r: { arm: [0.5, 0.28, 0.26], blade: [0.45, 0.74, 0.5] }, l: TWO_HAND_HILT },
    { t: 0.37, spine: [34, -3, -5], hips: [0.07, 18], r: { arm: [0.16, 0.42, 0.34], blade: [-0.28, 0.9, 0.33] }, l: TWO_HAND_HILT },
    { t: 0.56, ...TWO_HAND_READY },
  ] },
  { name: 'swordTwoHand3', combo: 'swordTwoHand', index: 2, hit: 0.3, sweep: [0.16, 0.42], cancel: 0.47, keys: [ // overhead chop
    { t: 0.0, ...TWO_HAND_READY },
    { t: 0.16, spine: [2, -12, 0], hips: [0.06, 6], r: { arm: [0.08, 0.42, -0.18], blade: [-0.72, 0.68, -0.05] }, l: TWO_HAND_HILT },
    { t: 0.3, spine: [-2, 26, 0], hips: [0.15, -2], r: { arm: [0.56, -0.2, -0.14], blade: [0.56, -0.83, -0.04] }, l: TWO_HAND_HILT },
    { t: 0.42, spine: [-2, 27, 0], hips: [0.16, -2], r: { arm: [0.56, -0.24, -0.14], blade: [0.5, -0.86, -0.04] }, l: TWO_HAND_HILT },
    { t: 0.6, ...TWO_HAND_READY },
  ] },
];

// Daggers in a reverse grip (owner 2026-11-19): each blade leaves the fist on the little-finger side and runs
// back down along the forearm, the thumb on the pommel. Guard: a low centre of gravity, both fists up in front
// of the chest, blades down along the forearms. A hand's `forearm` lays its blade back along that forearm (bent
// off it towards [forward, up, out]); `blade` points it explicitly (body space, true right). The cuts are hooks:
// the fist sweeps across and the blade along the forearm cuts behind it; the stab drives the fist forward and
// down, the blade leading.
const ALONG = [0.04, -0.06, 0.22]; // off the forearm: a little out, clear of the arm
// fists up in front of the chest and chin, elbows down: the forearms stand, the blades hang along them
const DAGGER_GUARD_POLE = [-0.15, -0.6, 0.35];
const DAGGER_READY = { spine: [0, 9, 0], hips: [0.08, 0],
  r: { arm: [0.24, -0.02, -0.02], forearm: ALONG, pole: DAGGER_GUARD_POLE },
  l: { arm: [0.3, 0.06, -0.04], forearm: ALONG, pole: DAGGER_GUARD_POLE } };
const DAGGER_RIGHT_GUARD = { arm: [0.22, -0.04, 0.0], forearm: ALONG, pole: DAGGER_GUARD_POLE };
const DAGGER_LEFT_GUARD = { arm: [0.28, 0.02, -0.02], forearm: ALONG, pole: DAGGER_GUARD_POLE };
export const DAGGER_COMBO = [
  { name: 'daggerLight1', combo: 'daggerLight', index: 0, hit: 0.12, sweep: [0.04, 0.18], cancel: 0.22, keys: [ // right hook slash
    { t: 0.0, ...DAGGER_READY },
    { t: 0.04, spine: [20, 9, -2], hips: [0.09, 8], r: { arm: [0.14, -0.08, 0.3], forearm: ALONG }, l: DAGGER_READY.l },
    { t: 0.12, spine: [-16, 11, 2], hips: [0.1, -8], r: { arm: [0.54, -0.06, -0.06], forearm: [0, -0.1, 0.2] }, l: DAGGER_LEFT_GUARD },
    { t: 0.18, spine: [-26, 11, 2], hips: [0.1, -10], r: { arm: [0.36, -0.1, -0.34], forearm: [0, -0.1, 0.2] }, l: DAGGER_LEFT_GUARD },
    { t: 0.33, ...DAGGER_READY },
  ] },
  { name: 'daggerLight2', combo: 'daggerLight', index: 1, hit: 0.15, sweep: [0.06, 0.22], cancel: 0.26, keys: [ // left hook slash
    { t: 0.0, ...DAGGER_READY },
    { t: 0.06, spine: [-22, 9, 2], hips: [0.09, -8], l: { arm: [0.14, -0.08, 0.3], forearm: ALONG }, r: DAGGER_RIGHT_GUARD },
    { t: 0.15, spine: [18, 11, -2], hips: [0.1, 9], l: { arm: [0.54, -0.08, -0.06], forearm: [0, -0.1, 0.2] }, r: DAGGER_RIGHT_GUARD },
    { t: 0.22, spine: [28, 11, -2], hips: [0.1, 11], l: { arm: [0.36, -0.12, -0.34], forearm: [0, -0.1, 0.2] }, r: DAGGER_RIGHT_GUARD },
    { t: 0.37, ...DAGGER_READY },
  ] },
  // hammer stab: a reverse grip cannot lead with the point ahead of the fist, so the fist rises by the head and
  // drives down and forward, the point down
  { name: 'daggerStab', combo: 'daggerStab', index: 0, hit: 0.18, sweep: [0.1, 0.27], cancel: 0.32, keys: [
    { t: 0.0, ...DAGGER_READY },
    { t: 0.08, spine: [16, -2, 0], hips: [0.1, 10], r: { arm: [0.14, 0.26, 0.08], forearm: ALONG, pole: [-0.1, -0.2, 0.7] }, l: DAGGER_LEFT_GUARD },
    { t: 0.18, spine: [-14, 16, 0], hips: [0.14, -12], r: { arm: [0.64, -0.06, -0.04], blade: [0.25, -0.95, -0.05] }, l: { arm: [0.22, -0.1, 0.06], forearm: ALONG, pole: DAGGER_GUARD_POLE } },
    { t: 0.27, spine: [-12, 15, 0], hips: [0.13, -11], r: { arm: [0.6, -0.1, -0.04], blade: [0.25, -0.95, -0.05] }, l: { arm: [0.22, -0.1, 0.06], forearm: ALONG, pole: DAGGER_GUARD_POLE } },
    { t: 0.43, ...DAGGER_READY },
  ] },
];

// Charged strikes (owner 2026-11-19, combat/HoldChargeRules.mjs): a basic swing still held after its wind-up turns
// into its family's charge move. The controller plays from `chargeFrom`, slows the coil from there to `charge` (the
// deepest wind-up) so it peaks exactly when the charge is full, holds it there while the button stays down, then
// plays the strike faster on release. One-hand: a big diagonal from high behind the shoulder; two-hand: an overhead
// cleave; daggers: both fists raised by the head, then a double hammer strike down and forward.
export const SWORD_CHARGE = { name: 'swordCharge', combo: 'swordCharge', index: 0, hit: 0.5, sweep: [0.43, 0.62], cancel: 0.72,
  chargeFrom: 0.12, charge: 0.42, keys: [
    { t: 0.0, ...SWORD_READY },
    { t: 0.12, spine: [30, 0, -3], hips: [0.05, 12], r: { arm: [-0.05, 0.12, 0.34], blade: [-0.65, 0.5, 0.57] }, l: { arm: [0.36, -0.08, -0.16] } },
    { t: 0.42, spine: [50, -6, -6], hips: [0.1, 20], r: { arm: [-0.14, 0.3, 0.26], blade: [-0.78, 0.55, 0.3] }, l: { arm: [0.42, 0.02, -0.18] } },
    { t: 0.5, spine: [-34, 16, 4], hips: [0.14, -18], r: { arm: [0.6, -0.12, -0.22], blade: [0.7, -0.35, -0.62] }, l: { arm: [0.06, -0.42, -0.14] } },
    { t: 0.62, spine: [-46, 18, 4], hips: [0.14, -22], r: { arm: [0.3, -0.3, -0.5], blade: [-0.1, -0.5, -0.86] }, l: { arm: [0.02, -0.46, -0.1] } },
    { t: 1.0, ...SWORD_READY },
  ] };
export const SWORD_TWO_HAND_CHARGE = { name: 'swordTwoHandCharge', combo: 'swordTwoHandCharge', index: 0, hit: 0.52, sweep: [0.46, 0.64],
  cancel: 0.76, chargeFrom: 0.12, charge: 0.44, keys: [
    { t: 0.0, ...TWO_HAND_READY },
    { t: 0.12, spine: [6, -6, 0], hips: [0.06, 6], r: { arm: [0.12, 0.3, -0.12], blade: [-0.4, 0.9, -0.1] }, l: TWO_HAND_HILT },
    { t: 0.44, spine: [10, -16, 0], hips: [0.1, 4], r: { arm: [-0.02, 0.48, -0.08], blade: [-0.8, 0.58, -0.05] }, l: TWO_HAND_HILT },
    { t: 0.52, spine: [-2, 30, 0], hips: [0.18, -2], r: { arm: [0.56, -0.18, -0.14], blade: [0.56, -0.82, -0.04] }, l: TWO_HAND_HILT },
    { t: 0.64, spine: [-2, 32, 0], hips: [0.19, -2], r: { arm: [0.54, -0.24, -0.14], blade: [0.48, -0.87, -0.04] }, l: TWO_HAND_HILT },
    { t: 1.05, ...TWO_HAND_READY },
  ] };
const DAGGER_RAISED_POLE = [-0.1, -0.15, 0.7];
export const DAGGER_CHARGE = { name: 'daggerCharge', combo: 'daggerCharge', index: 0, hit: 0.47, sweep: [0.41, 0.56], cancel: 0.66,
  chargeFrom: 0.1, charge: 0.4, keys: [
    { t: 0.0, ...DAGGER_READY },
    { t: 0.1, spine: [0, 3, 0], hips: [0.1, 0], r: { arm: [0.14, 0.18, 0.1], forearm: ALONG, pole: DAGGER_RAISED_POLE },
      l: { arm: [0.14, 0.18, 0.1], forearm: ALONG, pole: DAGGER_RAISED_POLE } },
    { t: 0.4, spine: [0, -8, 0], hips: [0.16, 0], r: { arm: [0.08, 0.36, 0.12], forearm: ALONG, pole: DAGGER_RAISED_POLE },
      l: { arm: [0.08, 0.36, 0.12], forearm: ALONG, pole: DAGGER_RAISED_POLE } },
    { t: 0.47, spine: [0, 22, 0], hips: [0.2, 0], r: { arm: [0.6, -0.12, 0.06], blade: [0.25, -0.95, 0.06] }, l: { arm: [0.6, -0.12, 0.06], blade: [0.25, -0.95, -0.06] } },
    { t: 0.56, spine: [0, 22, 0], hips: [0.2, 0], r: { arm: [0.58, -0.16, 0.06], blade: [0.25, -0.95, 0.06] }, l: { arm: [0.58, -0.16, 0.06], blade: [0.25, -0.95, -0.06] } },
    { t: 0.92, ...DAGGER_READY },
  ] };

// Looping idles: the stance, a breath in, the stance again (the ends match, so the loop is seamless).
const breathing = (name, base, seconds, { bend = 1.5, drop = 0.008, lift = 0.01 } = {}) => {
  const raise = (limb) => (limb?.arm ? { ...limb, arm: [limb.arm[0], limb.arm[1] + lift, limb.arm[2]] } : limb);
  const inhale = { ...base, spine: [base.spine[0], base.spine[1] + bend, base.spine[2]],
    hips: [base.hips[0] + drop, ...base.hips.slice(1)], r: raise(base.r), l: raise(base.l) };
  return { name, idle: true, hit: 0, cancel: seconds, keys: [{ t: 0, ...base }, { t: seconds / 2, ...inhale }, { t: seconds, ...base }] };
};
const WIDE_FEET = { l: [0.22, -0.17, 8], r: [-0.18, 0.19, -30] };
export const IDLE_SWORD = breathing('idleSword', { spine: [0, 3, 0], hips: [0.02, 0],
  r: { arm: [0.2, -0.4, 0.14], blade: [0.72, 0.3, 0.3] }, l: { arm: [0.08, -0.5, -0.02] } }, 2.4);
export const IDLE_SWORD_TWO_HAND = breathing('idleSwordTwoHand', { ...TWO_HAND_READY, feet: WIDE_FEET }, 2.0);
export const IDLE_DAGGERS = breathing('idleDaggers', DAGGER_READY, 2.0, { drop: 0.01 });
export const IDLE_BOW = breathing('idleBow', { spine: [3, 3, 0], hips: [0.02, 3],
  l: { arm: [0.14, -0.44, 0.1], blade: [0.42, 0.9, 0.1] }, r: { arm: [0.06, -0.5, 0.04] } }, 2.6, { lift: 0.006 });

// Make higher mastery tiers read as increasingly committed sword forms while keeping
// the original hit timing and hit count. Each tier also gets its own state names so
// the chain can move between the single and three-hit skills at a cancel window.
function makeSwordTierMotion(source,name,style={}){
  const lastTime=source.keys[source.keys.length-1].t||1;
  const phaseAt=t=>Math.sin(Math.PI*Math.max(0,Math.min(1,t/lastTime)));
  const rotateBlade=(blade,yaw)=>{
    if(!blade)return blade;
    const [forward,up,right]=blade;
    const c=Math.cos(yaw),s=Math.sin(yaw);
    return [forward*c-right*s,up,forward*s+right*c];
  };
  const keys=source.keys.map(key=>{
    const effort=phaseAt(key.t);
    const hips=[...(key.hips||[0,0])];
    hips[0]=(hips[0]||0)+(style.drop||0)*effort;
    hips[1]=(hips[1]||0)+(style.twist||0)*(effort-.25);
    const spine=[...(key.spine||[0,0,0])];
    spine[0]=(spine[0]||0)+(style.bodyTurn||0)*(effort-.25);
    spine[2]=(spine[2]||0)+(style.roll||0)*effort;
    const limb=spec=>{
      if(!spec)return spec;
      const out={...spec};
      if(spec.arm){
        out.arm=[spec.arm[0]+(style.reach||0)*effort,
          spec.arm[1]+(style.lift||0)*effort,
          spec.arm[2]+(style.sweep||0)*effort];
      }
      if(spec.blade)out.blade=rotateBlade(spec.blade,(style.bladeYaw||0)*(effort-.25));
      return out;
    };
    return {...key,hips,spine,r:limb(key.r),l:limb(key.l)};
  });
  return {...source,name,keys};
}
const TIER_STYLES=Object.freeze([
  Object.freeze({}),
  Object.freeze({reach:.04,twist:9,bodyTurn:5,bladeYaw:.12,sweep:.08}),
  Object.freeze({reach:.09,twist:18,bodyTurn:10,bladeYaw:.24,sweep:-.12,lift:.04}),
  Object.freeze({reach:.15,drop:.08,twist:30,bodyTurn:15,roll:8,bladeYaw:.38,sweep:.16,lift:.09}),
]);
const SINGLE_SOURCE_BY_TIER=Object.freeze([
  LEGACY_SWORD_COMBO[0], // level 1: clean forehand cut
  LEGACY_SWORD_COMBO[1], // level 2: rising backhand
  LEGACY_SWORD_COMBO[0], // level 3: extended cross cut
  LEGACY_SWORD_COMBO[2], // level 4: committed overhead finisher
]);
export const SWORD_SKILL_SINGLE_COMBOS=Object.freeze(
  SINGLE_SOURCE_BY_TIER.map((source,index)=>Object.freeze(makeSwordTierMotion(
    source,`swordSingleTier${index+1}`,TIER_STYLES[index]))),
);
export const SWORD_SKILL_TRIPLE_COMBOS=Object.freeze(TIER_STYLES.map((style,tierIndex)=>
  Object.freeze(LEGACY_SWORD_COMBO.map((source,hitIndex)=>Object.freeze(makeSwordTierMotion(
    source,`swordTripleTier${tierIndex+1}Hit${hitIndex+1}`,style))))),
);

// Bow: the left hand holds the bow out in front, upright, arrow forward; the right hand draws to the face.
const BOW_READY = { spine: [12, 3, 0], hips: [0.03, 6], l: { arm: [0.42, -0.28, 0.06], blade: [0.25, 0.97, 0] }, r: { arm: [0.32, -0.3, -0.12] } };
const AIM = (draw, extra = {}) => ({
  spine: extra.spine || [24, 0, extra.lean || 0], hips: extra.hips || [0.04, 10],
  l: { arm: [0.6, extra.raise || 0.02, 0.06], blade: [0, 1, 0] },
  r: { arm: draw, pole: [-0.4, 0.2, 0.5] },
});
export const BOW_COMBO = [
  { name: 'bowCombo1', hit: 0.31, cancel: 0.37, keys: [ // quick shot
    { t: 0.0, ...BOW_READY },
    { t: 0.13, ...AIM([0.42, 0.05, -0.18]) },
    { t: 0.29, ...AIM([0.06, 0.1, -0.14]) },
    { t: 0.33, ...AIM([-0.02, 0.1, 0.0]) }, // release: the drawing hand flicks back
    { t: 0.56, ...BOW_READY },
  ] },
  { name: 'bowCombo2', hit: 0.25, cancel: 0.31, keys: [ // fast follow-up with a sidestep lean
    { t: 0.0, ...BOW_READY },
    { t: 0.1, ...AIM([0.4, 0.05, -0.18], { lean: -8, hips: [0.06, 18] }) },
    { t: 0.23, ...AIM([0.08, 0.1, -0.14], { lean: -10, hips: [0.07, 20] }) },
    { t: 0.27, ...AIM([0.0, 0.1, 0.02], { lean: -10, hips: [0.07, 20] }) },
    { t: 0.48, ...BOW_READY },
  ] },
  { name: 'bowCombo3', hit: 0.56, cancel: 0.66, keys: [ // power shot: deep overdraw, lean back, recoil
    { t: 0.0, ...BOW_READY },
    { t: 0.16, ...AIM([0.42, 0.05, -0.18], { spine: [30, -4, 0], hips: [0.08, 14] }) },
    { t: 0.42, ...AIM([-0.06, 0.12, -0.06], { spine: [34, -8, 0], hips: [0.1, 16], raise: 0.06 }) },
    { t: 0.54, ...AIM([-0.1, 0.13, -0.04], { spine: [36, -9, 0], hips: [0.11, 16], raise: 0.07 }) },
    { t: 0.6, ...AIM([-0.22, 0.16, 0.12], { spine: [30, -12, 0], hips: [0.08, 14], raise: 0.16 }) }, // recoil
    { t: 0.88, ...BOW_READY },
  ] },
];

// The player's own bow (owner 2026-11-19): holding the aim draws (bowDraw) and then holds at full draw (bowHold,
// a seamless loop); letting go looses from there (bowRelease: the arrow leaves on its first frame, the string
// hand flicks back past the jaw, the bow arm follows through, then lowers). A shot without a held draw (a tap,
// or each further shot of a skill) draws and looses in one quick motion (bowQuick). `nock` / `full`: when the
// arrow is on the string and when it is fully drawn, so a draw let go early carries on in the quick shot from
// the same point, and a shot that follows a shot starts from the nock instead of lowering the bow in between.
const BOW_NOCK = [0.42, 0.05, -0.18];
const BOW_FULL_DRAW = [0.05, 0.1, -0.14];
const BOW_FLICK = [-0.08, 0.12, 0.04];
const BOW_HOLD_BREATH = AIM([0.045, 0.104, -0.142], { spine: [24, 1.2, 0], raise: 0.026 });
// Running with the bow (owner 2026-11-19): the bow arm hangs a little out from the hip, the bow pointing forward
// and down away from the legs, and stays there while the legs run (the controller lays this arm over the run).
export const BOW_RUN_CARRY_ARM = Object.freeze({ arm: Object.freeze([0.12, -0.42, 0.25]), blade: Object.freeze([0.84, -0.3, -0.45]) });
const BOW_RUN_CARRY_POSE = { spine: [0, 4, 0], hips: [0.02, 0], l: BOW_RUN_CARRY_ARM, r: { arm: [0.08, -0.5, 0.06] } };
export const BOW_SHOTS = [
  { name: 'bowDraw', pose: true, hit: 0.45, cancel: 0.45, nock: 0.16, full: 0.45, keys: [
    { t: 0.0, ...BOW_READY },
    { t: 0.16, ...AIM(BOW_NOCK) },
    { t: 0.45, ...AIM(BOW_FULL_DRAW) },
  ] },
  { name: 'bowHold', idle: true, hit: 0, cancel: 1.6, keys: [
    { t: 0.0, ...AIM(BOW_FULL_DRAW) },
    { t: 0.8, ...BOW_HOLD_BREATH },
    { t: 1.6, ...AIM(BOW_FULL_DRAW) },
  ] },
  { name: 'bowRelease', combo: 'bowRelease', index: 0, hit: 0, cancel: 0.16, keys: [
    { t: 0.0, ...AIM(BOW_FULL_DRAW) },
    { t: 0.06, ...AIM(BOW_FLICK) },
    { t: 0.2, ...AIM([-0.1, 0.1, 0.06], { raise: 0.01 }) },
    { t: 0.5, ...BOW_READY },
  ] },
  { name: 'bowQuick', combo: 'bowQuick', index: 0, hit: 0.2, cancel: 0.22, nock: 0.07, full: 0.18, keys: [
    { t: 0.0, ...BOW_READY },
    { t: 0.07, ...AIM(BOW_NOCK) },
    { t: 0.18, ...AIM(BOW_FULL_DRAW) },
    { t: 0.2, ...AIM(BOW_FULL_DRAW) },
    { t: 0.25, ...AIM(BOW_FLICK) },
    { t: 0.42, ...BOW_READY },
  ] },
  { name: 'bowRunCarry', idle: true, hit: 0, cancel: 1, keys: [{ t: 0, ...BOW_RUN_CARRY_POSE }, { t: 1, ...BOW_RUN_CARRY_POSE }] },
];

// What a family bakes when the caller passes no moves of its own (the binder passes its own for swords).
export function defaultMovesFor(comboKind) {
  if (comboKind === 'bowCombo') return [...BOW_COMBO, IDLE_BOW, ...BOW_SHOTS];
  if (comboKind === 'daggerCombo') return [...DAGGER_COMBO, IDLE_DAGGERS, DAGGER_CHARGE];
  return [...SWORD_COMBO, ...SWORD_TWO_HAND_COMBO, IDLE_SWORD, IDLE_SWORD_TWO_HAND,
    ...SWORD_SKILL_SINGLE_COMBOS, ...SWORD_SKILL_TRIPLE_COMBOS.flat(), SWORD_CHARGE, SWORD_TWO_HAND_CHARGE];
}

// The bones the combos pose, by role (hips, spine, spine1, spine2, neck, head, rSh / lSh, rArm / rFore / rHand,
// lArm / lFore / lHand, rUp / rLeg / rFoot, lUp / lLeg / lFoot); a role the rig lacks is null.
export function findComboBones(model) {
  const out = {};
  for (const [k, names] of Object.entries(RIG)) out[k] = names.map((n) => model?.getObjectByName(sanitize(n))).find(Boolean) || null;
  return out;
}
const findBones = findComboBones;

// The rig's rest pose (local position / rotation of every bone under the model). Capture it before any
// clip has played: the combos are solved from it. Not the inverse bind matrices: the fused bodies keep
// those outside their node_0 (-90 degree yaw, and the male's offset armature), so the "bind pose" read from
// them faces sideways (see onboarding/retargetAvatarClip.js restoreBindPose); every other bone's rest
// equals its bind anyway. Every bone, not one skin's skeleton: an FBX with several skinned meshes (the
// remote players' archer) gets a duplicate of each bone per mesh, nested under the bone that
// getObjectByName finds, and that bone may belong to any one of the meshes' skeletons.
export function captureRestPose(model) {
  const rest = new Map();
  model?.traverse((n) => { if (n.isBone) rest.set(n, { position: n.position.clone(), quaternion: n.quaternion.clone() }); });
  return rest;
}

/**
 * Bake the combo clips for `model`. kind: 'sword' | 'bow' (or a combo kind / weapon class).
 * grips: { right?: Quaternion, left?: Quaternion } — the held weapon's combat grip (weapon root rotation in
 * the hand bone's space); without one that hand keeps the IK result.
 * rest: captureRestPose(model) taken before any animation played (default: the current pose).
 * reach: the held blade's length in metres (default 1): a low cut lifts the blade so its tip clears the ground.
 * moves: other moves to bake instead of the built-in three, in the same key format (katanaTechniques.mjs).
 *   A hand given as { hilt: metres } instead of { arm } holds the hilt that far below the other hand.
 *   Captured moves (katanaCapturedMoves.mjs) also key hips[2..3] (shift), feet, look and each elbow's pole.
 * Returns { [clipName]: AnimationClip } or {} when the rig lacks the bones.
 */
export function bakeWeaponComboClips(model, kind = 'sword', grips = {}, { rest = null, reach = null, moves = null } = {}) {
  if (!model) return {};
  const b = findBones(model);
  const needed = ['hips', 'spine', 'rArm', 'rFore', 'rHand', 'lArm', 'lFore', 'lHand'];
  if (needed.some((k) => !b[k])) return {};
  const restPose = rest?.size ? rest : captureRestPose(model);
  if (!restPose.has(b.hips) || !restPose.has(b.rHand) || !restPose.has(b.lHand)) return {};
  const animated = [...new Set(Object.values(b).filter(Boolean))];
  const curlBones = new Map(); // finger bone -> 'l' | 'r', for a hand that holds the hilt
  const saved = [...restPose.keys()].map((bone) => [bone, bone.position.clone(), bone.quaternion.clone()]);
  const restore = () => { for (const [bone, p, q] of saved) { bone.position.copy(p); bone.quaternion.copy(q); } model.updateMatrixWorld(true); };
  const toRest = () => { for (const [bone, v] of restPose) { bone.position.copy(v.position); bone.quaternion.copy(v.quaternion); } model.updateMatrixWorld(true); };
  const comboKind = comboKindForWeapon(kind) || 'swordCombo';
  const bladeReach = Number(reach) > 0 ? Number(reach) : 1;
  const out = {};
  try {
    toRest();
    // body frame in world space at bake time; bone rotations are recorded locally, so it cancels out
    const rootQ = model.getWorldQuaternion(new THREE.Quaternion());
    const F = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ).setY(0).normalize();
    const U = new THREE.Vector3(0, 1, 0);
    const R = new THREE.Vector3().crossVectors(F, U).normalize(); // the character's right
    const body = (v) => new THREE.Vector3().addScaledVector(F, v[0]).addScaledVector(U, v[1]).addScaledVector(R, v[2]);
    // metres for a 1.7 m body -> this rig: head height above the ground in the rest pose
    const feet = [b.lFoot, b.rFoot].filter(Boolean).map((f) => f.getWorldPosition(new THREE.Vector3()).y);
    const groundY = model.getWorldPosition(new THREE.Vector3()).y;
    const headY = (b.head || b.neck || b.spine2 || b.spine).getWorldPosition(new THREE.Vector3()).y;
    const k = Math.max(0.3, (headY - Math.min(groundY, ...feet)) / 1.55);
    const ankleY = feet.length ? Math.min(...feet) : groundY + 0.08 * k;
    const footRestWorld = new Map([b.lFoot, b.rFoot].filter(Boolean).map((f) => [f, f.getWorldQuaternion(new THREE.Quaternion())]));
    const spineBones = [b.spine, b.spine1, b.spine2].filter(Boolean);
    const setWorldQ = (bone, q) => {
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(pq.invert().multiply(q));
      bone.updateWorldMatrix(false, true);
    };
    const rotateWorld = (bone, axis, angle) => {
      if (!bone || !angle) return;
      setWorldQ(bone, new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
    };
    // The hand's long axis (wrist -> middle knuckle) in its own frame, and seen from the held weapon's frame.
    const handInfo = new Map();
    for (const [side, hand, grip] of [['r', b.rHand, grips.right], ['l', b.lHand, grips.left]]) {
      const S = side === 'r' ? 'Right' : 'Left';
      const knuckle = [`mixamorig:${S}HandMiddle1`, `fingers_${side}`].map((n) => model.getObjectByName(sanitize(n))).find((c) => c?.parent === hand)
        || hand.children.find((c) => c.isBone && c.position.lengthSq() > 1e-12);
      const axis = knuckle ? knuckle.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const inWeapon = grip ? axis.clone().applyQuaternion(grip.clone().invert()) : null;
      handInfo.set(hand, { axis, grip, ay: inWeapon ? THREE.MathUtils.clamp(inWeapon.y, -1, 1) : 0, beta: inWeapon ? Math.atan2(inWeapon.x, inWeapon.z) : 0 });
    }
    // Wrist bend (degrees) with the best roll about the blade, for a forearm pointing along f.
    const bestBend = (info, B, f) => {
      const x = THREE.MathUtils.clamp(B.dot(f), -1, 1);
      return Math.acos(THREE.MathUtils.clamp(info.ay * x + Math.sqrt(1 - info.ay * info.ay) * Math.sqrt(1 - x * x), -1, 1));
    };
    // Arm frames in the rest pose (world): the upper arm's long axis, the way its elbow points when the arm
    // bends (backwards), and the forearm / hand rotations relative to their parents.
    const frame = (a, p) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, p, new THREE.Vector3().crossVectors(a, p)));
    const armRest = new Map();
    for (const [arm, fore, hand] of [[b.rArm, b.rFore, b.rHand], [b.lArm, b.lFore, b.lHand]]) {
      const S = arm.getWorldPosition(new THREE.Vector3());
      const E = fore.getWorldPosition(new THREE.Vector3());
      const W = hand.getWorldPosition(new THREE.Vector3());
      const qU = arm.getWorldQuaternion(new THREE.Quaternion());
      const qF = fore.getWorldQuaternion(new THREE.Quaternion());
      const qH = hand.getWorldQuaternion(new THREE.Quaternion());
      const aU = E.clone().sub(S).normalize();
      const back = F.clone().negate().addScaledVector(aU, F.dot(aU)).normalize();
      armRest.set(arm, { qU, relF: qU.clone().invert().multiply(qF), relH: qF.clone().invert().multiply(qH),
        aU, back, foreAxis: hand.position.clone().normalize(), up: S.distanceTo(E), lo: E.distanceTo(W) });
    }
    // Analytic arm. The elbow sits on its swing circle where the held blade can point along B with the
    // straightest wrist (staying near the default elbow otherwise); the upper arm turns so the elbow points
    // that way, the forearm carries the pronation and the wrist only bends. A blade the wrist cannot reach
    // within 50 degrees gives way instead of the wrist.
    // A captured move is keyed many times a second, so its arms are solved with the key before in mind:
    // the elbow stays near where it was, and the forearm's turn fades out before it would flip over.
    let flowing = null;
    // keepElbow: the elbow stays where the pole puts it and the wrist alone turns the blade (a reverse grip
    // laying its blade along the forearm placed first)
    const placeArm = (arm, fore, hand, target, pole, B, sideAxis, keepElbow = false) => {
      const ab = armRest.get(arm);
      const info = handInfo.get(hand);
      const held = !!(B && info?.grip);
      const S = arm.getWorldPosition(new THREE.Vector3());
      const toTarget = target.clone().sub(S);
      const d = THREE.MathUtils.clamp(toTarget.length(), Math.abs(ab.up - ab.lo) + 1e-4, ab.up + ab.lo - 1e-4);
      const dir = toTarget.lengthSq() > 1e-10 ? toTarget.normalize() : F.clone();
      const W = S.clone().addScaledVector(dir, d);
      const along = (ab.up * ab.up - ab.lo * ab.lo + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, ab.up * ab.up - along * along));
      const C = S.clone().addScaledVector(dir, along);
      const u0 = pole.clone().sub(S);
      u0.addScaledVector(dir, -u0.dot(dir));
      if (u0.lengthSq() < 1e-10) u0.copy(sideAxis).addScaledVector(dir, -sideAxis.dot(dir));
      u0.normalize();
      const v0 = new THREE.Vector3().crossVectors(dir, u0);
      const outAt = (phi) => u0.clone().multiplyScalar(Math.cos(phi)).addScaledVector(v0, Math.sin(phi));
      let phiBest = 0;
      if (held && !keepElbow) {
        let best = Infinity;
        for (let deg = -90; deg <= 90; deg += 5) {
          const phi = deg * DEG;
          const E = C.clone().addScaledVector(outAt(phi), h);
          const f = W.clone().sub(E).normalize();
          const inside = Math.max(0, -E.clone().sub(S).dot(sideAxis)); // elbow tucked into the chest
          const before = flowing?.get(arm);
          const cost = bestBend(info, B, f) + 0.45 * Math.abs(phi) + 6 * inside + (before === undefined ? 0 : 0.5 * Math.abs(phi - before));
          if (cost < best) { best = cost; phiBest = phi; }
        }
      }
      if (flowing && held) flowing.set(arm, phiBest);
      const out = outAt(phiBest);
      const E = C.clone().addScaledVector(out, h);
      const dirU = E.clone().sub(S).normalize();
      const dirF = W.clone().sub(E).normalize();
      const elbowOut = out.addScaledVector(dirU, -out.dot(dirU)).normalize();
      const qU = frame(dirU, elbowOut).multiply(frame(ab.aU, ab.back).invert()).multiply(ab.qU);
      setWorldQ(arm, qU);
      // forearm: its rest relation to the upper arm, bent at the elbow
      const qF0 = qU.clone().multiply(ab.relF);
      qF0.premultiply(new THREE.Quaternion().setFromUnitVectors(ab.foreAxis.clone().applyQuaternion(qF0).normalize(), dirF));
      let qH = null;
      let pronation = 0;
      if (held) {
        // the blade along B, rolled about it so the hand's long axis lines up with the forearm
        const u = dirF.clone().addScaledVector(B, -dirF.dot(B));
        if (u.lengthSq() < 1e-8) u.copy(F).addScaledVector(B, -F.dot(B));
        u.normalize().applyAxisAngle(B, -info.beta);
        const X = new THREE.Vector3().crossVectors(B, u).normalize();
        qH = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, B, u)).multiply(info.grip.clone().invert());
        const L = info.axis.clone().applyQuaternion(qH);
        const bend = Math.acos(THREE.MathUtils.clamp(L.dot(dirF), -1, 1));
        const limit = 50 * DEG;
        if (bend > limit) qH.premultiply(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(L, dirF), (bend - limit) / bend));
        // most of the hand's roll away from the neutral wrist is the forearm's pronation
        const D = qH.clone().multiply(qF0.clone().multiply(ab.relH).invert());
        const twist = 2 * Math.atan2(D.x * dirF.x + D.y * dirF.y + D.z * dirF.z, D.w);
        const turn = Math.atan2(Math.sin(twist), Math.cos(twist));
        const fade = flowing ? THREE.MathUtils.clamp((180 * DEG - Math.abs(turn)) / (60 * DEG), 0, 1) : 1;
        pronation = THREE.MathUtils.clamp(turn * 0.8 * fade, -150 * DEG, 150 * DEG);
      }
      const qF = new THREE.Quaternion().setFromAxisAngle(dirF, pronation).multiply(qF0);
      setWorldQ(fore, qF);
      setWorldQ(hand, qH || qF.clone().multiply(ab.relH));
    };

    // Second hand of a two-handed grip: on the hilt, `hilt` metres towards the pommel from the hand that
    // carries the blade (placed first: the right hand is solved before the left).
    const placeHilt = (side, spec, leadSpec) => {
      const [arm, fore, hand] = side === 'l' ? [b.lArm, b.lFore, b.lHand] : [b.rArm, b.rFore, b.rHand];
      const sideSign = side === 'r' ? 1 : -1;
      const lead = side === 'l' ? b.rHand : b.lHand;
      const leadInfo = handInfo.get(lead);
      const leadQ = lead.getWorldQuaternion(new THREE.Quaternion());
      const along = leadInfo?.grip ? new THREE.Vector3(0, 1, 0).applyQuaternion(leadQ.clone().multiply(leadInfo.grip))
        : leadSpec?.blade ? body(leadSpec.blade).normalize() : U.clone();
      const shoulder = arm.getWorldPosition(new THREE.Vector3());
      const target = lead.getWorldPosition(new THREE.Vector3()).addScaledVector(along, -spec.hilt * k);
      const p = spec.pole || [-0.2, -0.5, 0.5];
      const pole = shoulder.clone().add(body([p[0] * k, p[1] * k, p[2] * sideSign * k]));
      placeArm(arm, fore, hand, target, pole, null, R.clone().multiplyScalar(sideSign));
    };
    const pose = (key, move = {}) => {
      toRest();
      // hips: lower by `drop` metres and turn by `twist` (+ = right; the right is -X when facing +Z); a
      // captured move also shifts them [forward, right] over feet that stay where they were planted
      const [drop, twist, shiftF = 0, shiftR = 0] = key.hips || [0, 0];
      const hipsWorld = b.hips.getWorldPosition(new THREE.Vector3());
      const standing = hipsWorld.clone();
      hipsWorld.add(new THREE.Vector3(0, -drop * k, 0)).add(body([shiftF * k, 0, shiftR * k]));
      b.hips.position.copy(b.hips.parent.worldToLocal(hipsWorld));
      b.hips.updateWorldMatrix(false, true);
      rotateWorld(b.hips, U, -twist * DEG);
      // spine: spread twist / bend / lean over the spine bones; the head keeps looking ahead
      const [st, sb, sl] = key.spine || [0, 0, 0];
      for (const bone of spineBones) {
        rotateWorld(bone, U, (-st * DEG) / spineBones.length);
        rotateWorld(bone, R, (-sb * DEG) / spineBones.length);
        rotateWorld(bone, F, (sl * DEG) / spineBones.length);
      }
      // a key may say where the head looks (degrees right of the chest) instead of "straight ahead"
      const look = Number.isFinite(key.look) ? -key.look * DEG : (st + twist) * 0.75 * DEG;
      if (b.neck && b.head) rotateWorld(b.neck, U, look * 0.4);
      rotateWorld(b.head || b.neck, U, b.head && b.neck ? look * 0.6 : look);
      if (sb) rotateWorld(b.head || b.neck, R, sb * 0.5 * DEG);
      // legs: planted stance (feet relative to the hips, flat on the ground). A key with its own `feet`
      // ([forward, right, yaw, lift, knee] per foot) places them from where the body stands at rest instead,
      // so a step, a lunge or a knee on the ground stays put while the hips travel over it.
      const hipsP = b.hips.getWorldPosition(new THREE.Vector3());
      for (const [side, up, leg, foot] of [['l', b.lUp, b.lLeg, b.lFoot], ['r', b.rUp, b.rLeg, b.rFoot]]) {
        if (!up || !leg || !foot) continue;
        const own = Array.isArray(key.feet?.[side]) ? key.feet[side] : null;
        const [fwd, right, yaw, lift = 0, knee = null] = own || STANCE[side];
        const target = (own ? standing : hipsP).clone().add(body([fwd * k, 0, right * k])).setY(ankleY + Math.max(0, lift) * k);
        const pole = Array.isArray(knee) ? hipsP.clone().add(body([knee[0] * k, knee[1] * k, knee[2] * k]))
          : hipsP.clone().add(body([0.6 * k, -0.4 * k, right * 2 * k]));
        solveMountedLimb(up, leg, foot, target, pole);
        const flat = footRestWorld.get(foot);
        if (flat) setWorldQ(foot, new THREE.Quaternion().setFromAxisAngle(U, -yaw * DEG).multiply(flat));
      }
      // arms: wrist targets relative to each shoulder, then the weapon direction through the grip
      for (const [side, arm, fore, hand] of [['r', b.rArm, b.rFore, b.rHand], ['l', b.lArm, b.lFore, b.lHand]]) {
        const spec = key[side];
        const sideSign = side === 'r' ? 1 : -1;
        if (spec && !spec.arm && Number.isFinite(spec.hilt)) {
          placeHilt(side, spec, key[side === 'l' ? 'r' : 'l']);
          continue;
        }
        if (!spec?.arm) continue;
        const shoulder = arm.getWorldPosition(new THREE.Vector3());
        // a captured move says how long the arm it was measured on is: reach as far along this body's own arm
        const ab = armRest.get(arm);
        const fit = Number(move.armLength) > 0 && ab ? THREE.MathUtils.clamp((ab.up + ab.lo) / k / Number(move.armLength), 0.7, 1.3) : 1;
        const v = spec.arm;
        const target = shoulder.clone().add(body([v[0] * k * fit, v[1] * k * fit, v[2] * sideSign * k * fit]));
        const p = spec.pole || [-0.3, -0.3, 0.6];
        const pole = shoulder.clone().add(body([p[0] * k, p[1] * k, p[2] * sideSign * k]));
        let B = spec.blade ? body(spec.blade).normalize() : null;
        const alongForearm = !!(spec.forearm && handInfo.get(hand)?.grip);
        if (alongForearm) {
          // a reverse grip: the blade runs back along the forearm as the arm is placed on this body, bent off it
          // towards `forearm` ([forward, up, out to this arm's side]) so it clears the arm
          placeArm(arm, fore, hand, target, pole, null, R.clone().multiplyScalar(sideSign));
          B = fore.getWorldPosition(new THREE.Vector3()).sub(hand.getWorldPosition(new THREE.Vector3())).normalize();
          if (Array.isArray(spec.forearm)) B.add(body([spec.forearm[0], spec.forearm[1], spec.forearm[2] * sideSign])).normalize();
        }
        placeArm(arm, fore, hand, target, pole, B, R.clone().multiplyScalar(sideSign), alongForearm);
        const info = handInfo.get(hand);
        if (B && comboKind === 'swordCombo' && info?.grip) {
          // A long blade (the odachi) would cut into the ground: the hands stop higher instead, keeping the
          // blade's angle, until the tip of the blade as actually held (grip a hand's breadth past the wrist)
          // clears the floor.
          const floor = groundY + 0.16 * k;
          for (let pass = 0; pass < 4; pass++) {
            const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
            const blade = new THREE.Vector3(0, 1, 0).applyQuaternion(handQ.clone().multiply(info.grip));
            const gripY = hand.getWorldPosition(new THREE.Vector3()).addScaledVector(info.axis.clone().applyQuaternion(handQ), 0.09 * k).y;
            const tipY = gripY + blade.y * bladeReach;
            if (tipY >= floor) break;
            target.y += floor - tipY;
            placeArm(arm, fore, hand, target, pole, B, R.clone().multiplyScalar(sideSign));
          }
        }
      }
      for (const [bone, side] of curlBones) if (Number.isFinite(key[side]?.hilt)) bone.quaternion.multiply(HILT_CURL);
      model.updateMatrixWorld(true);
      return { q: animated.map((bone) => bone.quaternion.clone()), hips: b.hips.position.clone() };
    };

    // The sword bakes its three hits and the two sword skills' four mastery tiers. Moves passed in replace
    // that whole list, so a caller that passes moves includes the tier clips it wants kept (see the binder).
    const combos = Array.isArray(moves) && moves.length ? moves : defaultMovesFor(comboKind);
    // The second hand of a two-handed grip closes around the hilt: its fingers are keyed in every clip of
    // this bake (at rest unless that key holds the hilt). The hand holding the weapon is closed by the runtime.
    const hiltSides = new Set();
    for (const combo of combos) for (const key of combo.keys) for (const side of ['l', 'r']) if (Number.isFinite(key[side]?.hilt)) hiltSides.add(side);
    for (const side of hiltSides) {
      const hand = side === 'l' ? b.lHand : b.rHand;
      hand.traverse((n) => { if (n !== hand && n.isBone && restPose.has(n) && FINGER_CURL.test(n.name) && !curlBones.has(n)) { curlBones.set(n, side); animated.push(n); } });
    }
    for (const [index, combo] of combos.entries()) {
      flowing = combo.ease === 'linear' ? new Map() : null;
      const poses = combo.keys.map((key) => pose(key, combo));
      flowing = null;
      // densify with eased in-betweens so each strike reads sharp and its recovery settles; a captured move
      // (ease: 'linear', its own `steps`) already carries its timing in closely spaced keys
      const steps = Number(combo.steps) >= 1 ? Math.round(Number(combo.steps)) : 6;
      const linear = combo.ease === 'linear';
      const times = [];
      const values = animated.map(() => []);
      const hipValues = [];
      for (let i = 0; i < combo.keys.length - 1; i++) {
        const a = combo.keys[i].t;
        const bt = combo.keys[i + 1].t;
        for (let s = 0; s < steps; s++) {
          const u = s / steps;
          const e = linear ? u : u * u * (3 - 2 * u); // smoothstep
          times.push(a + (bt - a) * u);
          const blended = animated.map((bone, j) => poses[i].q[j].clone().slerp(poses[i + 1].q[j], e));
          const hipsAt = poses[i].hips.clone().lerp(poses[i + 1].hips, e);
          // Each arm blends on its own, so in a fast swing the hand on the hilt would drift off it: solve
          // that hand onto the hilt again from the blended pose of the hand carrying the blade.
          const hilt = s > 0 && ['l', 'r'].find((side) => Number.isFinite(combo.keys[i][side]?.hilt) && Number.isFinite(combo.keys[i + 1][side]?.hilt));
          if (hilt) {
            animated.forEach((bone, j) => bone.quaternion.copy(blended[j]));
            b.hips.position.copy(hipsAt);
            model.updateMatrixWorld(true);
            placeHilt(hilt, combo.keys[i + 1][hilt], combo.keys[i + 1][hilt === 'l' ? 'r' : 'l']);
            animated.forEach((bone, j) => blended[j].copy(bone.quaternion));
          }
          animated.forEach((bone, j) => values[j].push(...blended[j].toArray()));
          hipValues.push(...hipsAt.toArray());
        }
      }
      const last = combo.keys.length - 1;
      times.push(combo.keys[last].t);
      animated.forEach((bone, j) => values[j].push(...poses[last].q[j].toArray()));
      hipValues.push(...poses[last].hips.toArray());
      const tracks = animated.map((bone, j) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values[j]));
      tracks.push(new THREE.VectorKeyframeTrack(`${b.hips.name}.position`, times, hipValues));
      const clip = new THREE.AnimationClip(combo.name, combo.keys[last].t, tracks);
      // a skill's clip says which hit of its skill it is; a combo clip is its place in the list
      clip.userData = { combo: combo.idle || combo.pose ? null : combo.combo || comboKind, index: Number.isInteger(combo.index) ? combo.index : index, hit: combo.hit, sweep: combo.sweep || null, cancel: combo.cancel, generated: 'weaponComboClips',
        ...(combo.idle ? { idle: true, loop: true } : {}), ...(combo.pose ? { pose: true } : {}), ...(combo.technique ? { technique: combo.technique } : {}),
        ...(Number.isFinite(combo.nock) ? { nock: combo.nock } : {}), ...(Number.isFinite(combo.full) ? { full: combo.full } : {}),
        // a charge move's slow wind-up [chargeFrom, charge]; a keyed swing's wind-up (its second key), where a held
        // press waits to become a charge (a captured move, keyed many times a second, has none)
        ...(Number.isFinite(combo.chargeFrom) ? { chargeFrom: combo.chargeFrom } : {}), ...(Number.isFinite(combo.charge) ? { charge: combo.charge } : {}),
        ...(!combo.idle && !combo.pose && combo.ease !== 'linear' && combo.keys.length >= 4 && combo.keys[1].t < combo.hit ? { windUp: combo.keys[1].t } : {}) };
      out[combo.name] = clip;
    }
  } finally {
    restore();
  }
  return out;
}
