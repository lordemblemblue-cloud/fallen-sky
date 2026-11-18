// A body whose standing clip leans is stood upright.
//
// The female body's own Stand (the idle) and Idle (the long idle) clips slope forward from the ankles: the
// hips sit about 7 cm ahead of the ankles and the head 11 to 15 cm ahead, so she looks as if she is tipping
// forward. This measures a standing clip's first frame on the body it belongs to and, where it slopes,
// returns a copy with three small corrections:
//   legs   the thighs turn until the hips are over the ankles, and the feet turn back so the soles stay flat;
//   back   a torso leaning forward is brought to one degree (nobody stands like a post);
// Everything else in the clip (breathing, sway, arms, head) is kept. Walk, run and the combat stance are
// not touched: those are meant to lean. The clip handed in is never changed.
import * as THREE from 'three';

const MAX_DEGREES = 8;          // more than this is not a posture to fix quietly
const LEGS_FROM_DEGREES = 1.5;  // a smaller slope is left alone
const BACK_KEEPS_DEGREES = 1;
const corrected = new WeakMap(); // clip -> its upright copy (or itself when it needed nothing)

const bone = (model, name) => model.getObjectByName('mixamorig' + name) || model.getObjectByName('mixamorig:' + name);
const trackOf = (clip, node, property) => clip.tracks.find((t) => t.name === node.name + '.' + property) || null;

/**
 * Measure a standing clip's first frame and return { clip, legs, back, before, after }: the upright copy (or
 * the same clip when nothing needed fixing) and what was measured. model: the body the clip is bound to.
 */
export function uprightStandingClip(model, clip) {
  if (!model || !clip?.tracks?.length) return { clip, legs: 0, back: 0 };
  if (corrected.has(clip)) return corrected.get(clip);
  const names = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
  const bones = Object.fromEntries(names.map((name) => [name, bone(model, name)]));
  const done = (value) => { corrected.set(clip, value); return value; };
  if (names.some((name) => !bones[name]) || !bones.Hips.parent) return done({ clip, legs: 0, back: 0 });

  // the clip's first frame, worked out on paper: the live skeleton is not touched
  const turn = new Map();          // bone -> the turn put before its own rotation
  const local = (node) => {
    const q = trackOf(clip, node, 'quaternion'), p = trackOf(clip, node, 'position');
    const quaternion = q ? new THREE.Quaternion().fromArray(q.values, 0).normalize() : node.quaternion.clone();
    if (turn.has(node)) quaternion.premultiply(turn.get(node));
    return new THREE.Matrix4().compose(p ? new THREE.Vector3().fromArray(p.values, 0) : node.position.clone(), quaternion, node.scale);
  };
  model.updateWorldMatrix(true, false);
  bones.Hips.parent.updateWorldMatrix(true, false);
  const world = (node) => (node === bones.Hips.parent ? node.matrixWorld.clone() : world(node.parent).multiply(local(node)));
  const at = (name) => new THREE.Vector3().setFromMatrixPosition(world(bones[name]));
  const worldQuaternion = (node) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(world(node)));

  const up = new THREE.Vector3(0, 1, 0);
  const forward = at('LeftToeBase').sub(at('LeftFoot')).add(at('RightToeBase').sub(at('RightFoot'))).setY(0);
  if (forward.lengthSq() < 1e-10) return done({ clip, legs: 0, back: 0 });
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, up);
  const measure = () => {
    const hips = at('Hips'), neck = at('Neck'), head = at('Head');
    const ankles = at('LeftFoot').add(at('RightFoot')).multiplyScalar(0.5);
    const spine = neck.clone().sub(hips);
    return {
      hipsAhead: hips.clone().sub(ankles).dot(forward), headAhead: head.clone().sub(ankles).dot(forward),
      legLength: Math.max(1e-6, hips.y - ankles.y), torso: THREE.MathUtils.radToDeg(Math.atan2(spine.dot(forward), spine.y)),
    };
  };
  const before = measure();
  const clamp = (degrees) => THREE.MathUtils.clamp(degrees, -MAX_DEGREES, MAX_DEGREES);
  let legs = clamp(THREE.MathUtils.radToDeg(Math.atan2(before.hipsAhead, before.legLength)));
  if (Math.abs(legs) < LEGS_FROM_DEGREES) legs = 0;
  const back = clamp(Math.max(0, before.torso - BACK_KEEPS_DEGREES));
  if (!legs && back < 1) return done({ clip, legs: 0, back: 0, before, after: before });

  // a turn about the body's own right axis, in the world, written as a turn before the bone's own rotation
  const lean = (name, degrees) => {
    if (!degrees) return;
    const node = bones[name], parent = worldQuaternion(node.parent);
    const inWorld = new THREE.Quaternion().setFromAxisAngle(right, THREE.MathUtils.degToRad(degrees));
    turn.set(node, parent.clone().invert().multiply(inWorld).multiply(parent));
  };
  for (const side of ['Left', 'Right']) { lean(side + 'UpLeg', legs); lean(side + 'Foot', -legs); }
  lean('Spine', back / 2); lean('Spine1', back / 2);

  const upright = clip.clone();
  upright.userData = { ...(clip.userData || {}), uprightStanding: { legs, back } };
  for (const [node, before_] of turn) {
    const track = trackOf(upright, node, 'quaternion');
    if (!track) continue;
    const q = new THREE.Quaternion();
    for (let i = 0; i < track.values.length; i += 4) q.fromArray(track.values, i).premultiply(before_).toArray(track.values, i);
  }
  return done({ clip: upright, legs, back, before, after: measure() });
}

/** The same clips, with the standing ones (the idle and the long idle) stood upright on this body. */
export function withUprightStanding(model, clipsByKey = {}) {
  const out = { ...clipsByKey };
  for (const key of ['idle', 'afk']) if (out[key]) out[key] = uprightStandingClip(model, out[key]).clip;
  return out;
}
