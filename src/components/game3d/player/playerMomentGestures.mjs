import * as THREE from 'three';

// Short additive gestures on the local hero for gameplay moments: a power surge when a skill is cast, a cheer on
// a level-up. They are layered OVER the normal pose (locomotion, attack, dodge) after the mixers have run and
// restored before the next frame's mixers, like social/echoGestureRuntime.js, so they never lock input, never
// cancel an attack montage and never touch the gameplay root. Rotations are about the hero's own axes (left,
// up, forward), applied in world space, so they read the same on the Mixamo fused bodies and the v5 bodies.
export const PLAYER_MOMENT_GESTURES = Object.freeze({
  skillCast: Object.freeze({ seconds: 0.55 }),
  levelUp: Object.freeze({ seconds: 1.8 }),
});

const key = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const findBone = (root, test) => {
  let found = null;
  root.traverse((node) => { if (!found && node.isBone && test(key(node.name))) found = node; });
  return found;
};
const identifyRig = (root) => ({
  spine: findBone(root, (n) => /spine2$|spine02$|chest$/.test(n)) || findBone(root, (n) => /spine/.test(n)),
  head: findBone(root, (n) => /head$/.test(n) && !/headtop/.test(n)),
  leftArm: findBone(root, (n) => /(^|rig)leftarm$|^upperarml$/.test(n)),
  rightArm: findBone(root, (n) => /(^|rig)rightarm$|^upperarmr$/.test(n)),
  leftForeArm: findBone(root, (n) => /leftforearm$|^lowerarml$/.test(n)),
  rightForeArm: findBone(root, (n) => /rightforearm$|^lowerarmr$/.test(n)),
});

const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const parentQ = new THREE.Quaternion(), worldQ = new THREE.Quaternion(), delta = new THREE.Quaternion();
const left = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3();

export function createPlayerMomentGestures({ getActor, now = () => globalThis.performance.now() } = {}) {
  const prior = new Map();
  let active = null;
  let rig = null, rigActor = null;

  // Before the mixers pose the frame: give every bone its own rotation back.
  const preUpdate = () => {
    for (const [bone, q] of prior) bone.quaternion.copy(q);
    prior.clear();
  };

  const play = (kind, options = {}) => {
    const spec = PLAYER_MOMENT_GESTURES[kind];
    if (!spec) return false;
    active = { kind, startedAt: now(), seconds: Math.max(0.2, Number(options.seconds) || spec.seconds) };
    return true;
  };

  const rotateAbout = (bone, axis, angle) => {
    if (!bone || !bone.parent || !angle) return;
    if (!prior.has(bone)) prior.set(bone, bone.quaternion.clone());
    bone.parent.getWorldQuaternion(parentQ);
    bone.getWorldQuaternion(worldQ);
    delta.setFromAxisAngle(axis, angle);
    worldQ.premultiply(delta);
    bone.quaternion.copy(parentQ.invert().multiply(worldQ)).normalize();
    bone.updateWorldMatrix(false, true);
  };

  // After the mixers (and before rendering): add the gesture on top of the posed skeleton.
  const update = () => {
    if (!active) return false;
    const actor = getActor?.();
    const age = (now() - active.startedAt) / 1000;
    if (age >= active.seconds) { active = null; return false; }
    if (!actor || actor.visible === false) return false;
    if (rigActor !== actor) { rig = identifyRig(actor); rigActor = actor; }
    actor.updateWorldMatrix(true, true);
    // The hero's planar axes: the body faces local +Z (GameWorld3D yaw convention), left is local +X.
    forward.set(0, 0, 1).applyQuaternion(actor.getWorldQuaternion(worldQ)).setY(0).normalize();
    left.crossVectors(up, forward).normalize();
    const u = age / active.seconds;
    const blend = Math.min(smooth(age / 0.14), smooth((active.seconds - age) / 0.28));
    if (active.kind === 'skillCast') {
      const pulse = blend * (0.75 + 0.25 * Math.sin(age * 22));
      rotateAbout(rig.spine, left, -0.16 * blend);
      rotateAbout(rig.head, left, -0.12 * blend);
      rotateAbout(rig.leftArm, forward, 0.55 * pulse);
      rotateAbout(rig.rightArm, forward, -0.55 * pulse);
      rotateAbout(rig.leftForeArm, left, -0.35 * pulse);
      rotateAbout(rig.rightForeArm, left, -0.35 * pulse);
    } else if (active.kind === 'levelUp') {
      const beat = 1 + 0.05 * Math.sin(age * 11);
      const raise = (1.75 + 0.15 * Math.sin(u * Math.PI)) * blend * beat;
      rotateAbout(rig.spine, left, -0.12 * blend);
      rotateAbout(rig.head, left, -0.32 * blend);
      rotateAbout(rig.leftArm, forward, raise);
      rotateAbout(rig.rightArm, forward, -raise);
      rotateAbout(rig.leftForeArm, forward, 0.35 * blend);
      rotateAbout(rig.rightForeArm, forward, -0.35 * blend);
    }
    return true;
  };

  return {
    play, preUpdate, update,
    isActive: () => !!active,
    getActive: () => (active ? { ...active } : null),
    dispose() { preUpdate(); active = null; rig = null; rigActor = null; },
  };
}
