// One-shot "summon" gesture: the holding arm reaches out with the hand shaped around an empty grip, holds
// while the weapon pours together in it (weaponConstructFx), then returns to whatever the base clip is
// doing (idle, walk or run). It never loops and never takes over locomotion: offsets are applied after the
// mixer and the bones are restored before the next mixer pass, like the echo gestures.
import * as THREE from 'three';

export const WEAPON_SUMMON_SECONDS = Object.freeze({ raise: 0.24, hold: 0.95, lower: 0.4 });

const BONES = {
  right: { arm: ['mixamorig:RightArm', 'upperarm_r'], fore: ['mixamorig:RightForeArm', 'lowerarm_r'], hand: ['mixamorig:RightHand', 'hand_r'] },
  left: { arm: ['mixamorig:LeftArm', 'upperarm_l'], fore: ['mixamorig:LeftForeArm', 'lowerarm_l'], hand: ['mixamorig:LeftHand', 'hand_l'] },
};
const sanitize = (n) => THREE.PropertyBinding.sanitizeNodeName(n);

// Arm directions in the character frame (F forward, U up, S = towards that arm's side).
const POSES = {
  blade: { arm: [0.42, -0.58, 0.34], fore: [0.9, 0.3, -0.14], weaponUp: [0.62, 0.78, 0] },
  bow: { arm: [0.86, -0.3, 0.2], fore: [0.97, -0.06, 0.03], weaponUp: [0.08, 1, 0] },
  dagger: { arm: [0.45, -0.62, 0.26], fore: [0.92, 0.24, -0.2], weaponUp: [0.7, 0.7, 0] },
};

export function summonGestureWeight(t, hold = WEAPON_SUMMON_SECONDS.hold) {
  const { raise, lower } = WEAPON_SUMMON_SECONDS;
  if (t <= 0) return 0;
  if (t < raise) return 1 - (1 - t / raise) ** 3;
  if (t < raise + hold) return 1;
  const k = (t - raise - hold) / lower;
  if (k >= 1) return 0;
  return 1 - (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
}

export function createWeaponSummonGesture({ model }) {
  const find = (names) => names.map((n) => model?.getObjectByName(sanitize(n))).find(Boolean) || null;
  const sides = Object.fromEntries(Object.entries(BONES).map(([side, b]) => [side, { arm: find(b.arm), fore: find(b.fore), hand: find(b.hand) }]));
  const saved = new Map();
  let active = null;
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const F = new THREE.Vector3();
  const U = new THREE.Vector3(0, 1, 0);
  const R = new THREE.Vector3();

  const save = (bone) => { if (bone && !saved.has(bone)) saved.set(bone, bone.quaternion.clone()); };
  const setWorldQuat = (bone, worldQuat) => {
    bone.parent.getWorldQuaternion(q2);
    bone.quaternion.copy(q2.invert().multiply(worldQuat));
    bone.updateWorldMatrix(false, true);
  };
  // Rotate `bone` so the direction to `child` turns towards `dir` (world), by weight w.
  const aim = (bone, child, dir, w) => {
    if (!bone || !child || w <= 0) return;
    bone.getWorldPosition(v);
    child.getWorldPosition(v2);
    const current = v2.sub(v).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(current, dir);
    const weighted = new THREE.Quaternion().slerp(delta, w);
    bone.getWorldQuaternion(q);
    setWorldQuat(bone, weighted.multiply(q));
  };
  const dirIn = (frame, sideSign) => new THREE.Vector3()
    .addScaledVector(F, frame[0]).addScaledVector(U, frame[1]).addScaledVector(R, frame[2] * sideSign).normalize();

  /**
   * hands: [{ side: 'right'|'left', gripQuaternion?: THREE.Quaternion }] — gripQuaternion is the weapon
   * root's rotation in that hand bone's space; with it the hand turns so the weapon forms in a show pose.
   */
  function play({ hands = [{ side: 'right' }], kind = 'blade', hold = WEAPON_SUMMON_SECONDS.hold } = {}) {
    const usable = hands.filter((h) => sides[h.side]?.arm && sides[h.side]?.fore && sides[h.side]?.hand);
    if (!usable.length) { active = null; return false; }
    active = { hands: usable, kind: POSES[kind] ? kind : 'blade', t: 0, hold };
    return true;
  }

  // Before the mixer: undo last frame's offsets so clips without these tracks are not compounded.
  function preUpdate() {
    for (const [bone, quat] of saved) bone.quaternion.copy(quat);
    saved.clear();
  }

  // After the mixer.
  function update(delta) {
    if (!active) return 0;
    active.t += Math.max(0, Math.min(0.1, Number(delta) || 0));
    const w = summonGestureWeight(active.t, active.hold);
    const total = WEAPON_SUMMON_SECONDS.raise + active.hold + WEAPON_SUMMON_SECONDS.lower;
    if (active.t >= total) { active = null; return 0; }
    if (w <= 0) return 0;
    model.updateWorldMatrix(true, true);
    model.getWorldQuaternion(q);
    F.set(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    R.crossVectors(F, U).normalize(); // the character's right
    const pose = POSES[active.kind];
    for (const h of active.hands) {
      const b = sides[h.side];
      const sideSign = h.side === 'right' ? 1 : -1;
      save(b.arm); save(b.fore); save(b.hand);
      aim(b.arm, b.fore, dirIn(pose.arm, sideSign), w);
      aim(b.fore, b.hand, dirIn(pose.fore, sideSign), w);
      if (h.gripQuaternion) {
        // weapon up = the blade / upper limb, weapon forward (+Z) = edge / arrow towards the target
        const up = dirIn(pose.weaponUp, sideSign);
        const fwd = F.clone().addScaledVector(up, -F.dot(up)).normalize();
        const x = new THREE.Vector3().crossVectors(up, fwd).normalize();
        const weaponWorld = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, fwd));
        const handTarget = weaponWorld.multiply(h.gripQuaternion.clone().invert());
        b.hand.getWorldQuaternion(q);
        setWorldQuat(b.hand, q.clone().slerp(handTarget, w));
      }
    }
    return w;
  }

  return {
    play,
    preUpdate,
    update,
    isActive: () => !!active,
    cancel: () => { active = null; },
    supported: !!(sides.right.arm || sides.left.arm),
  };
}
