// Grip math shared by the weapon-pack build tool (tools/game3d-weapons/calibrate-grips.mjs) and the runtime
// fallback for rigs the manifest does not list. Everything works in a rig's BIND space (inverse bind
// matrices), because that is where the hand mesh is defined relative to its bones.
//
// Palm frame of one hand:
//   d = finger direction (wrist -> middle knuckle)       k = knuckle line (pinky -> index), perpendicular to d
//   n = palm normal, out of the palm (the side the fingers curl towards)            h = wrist -> knuckle length
// Weapon frame (see public/game3d/weapons/manifest.json): origin at the grip, +Y to the tip / upper limb,
// +Z blade edge / arrow flight, +X = Y x Z.
import * as THREE from 'three';

const DEG = Math.PI / 180;

// Stances: "combat" is used while attacking or aiming, "carry" while idle or moving.
// tilt = degrees the handle leans from the knuckle line towards the fingers, so with the arm hanging the tip
// points down along the forearm (carry) or forward for a cut (combat). A bow in combat runs through the fist
// with the arrow along the forearm; carried, it lies along the forearm with the string towards the body.
// A dagger is held in a reverse grip (owner 2026-11-19): the handle's line leaves the fist on the little-finger
// side and runs back along the forearm (tilt = degrees from the knuckle line towards the wrist); the hands are
// posed for that line (weaponComboClips.js). The blade sits in the fist at the owner's seat (2026-11-20, placed by
// hand in the Weapon Animation Studio, the right an exact mirror of the left): out of the little-finger side, turned
// towards the back of the hand, so it stands off the forearm clear of the arm instead of lying in it. blade / edge:
// where the blade's tip and edge point, as [knuckle line k, fingers d, out of the palm n] (the palm frame below).
// The pommel stays under the thumb (solveThumbCap).
export const DAGGER_SEAT = Object.freeze({ blade: Object.freeze([-0.6087, -0.4184, -0.6741]), edge: Object.freeze([0.7931, -0.2959, -0.5324]) });
export const WEAPON_GRIP_RULES = Object.freeze({
  sword: Object.freeze({ combat: Object.freeze({ tilt: 18 }), carry: Object.freeze({ tilt: 34 }) }),
  greatsword: Object.freeze({ combat: Object.freeze({ tilt: 8 }), carry: Object.freeze({ tilt: 12 }) }),
  bow: Object.freeze({ combat: Object.freeze({ tilt: 0 }), carry: Object.freeze({ lean: 25 }) }),
  dagger: Object.freeze({ combat: Object.freeze({ reverse: true, tilt: 55, seat: DAGGER_SEAT }), carry: Object.freeze({ reverse: true, tilt: 58, seat: DAGGER_SEAT }) }),
});
// How far the pommel's end sits from a dagger's grip origin, metres (the pair's model and the modelled blades).
export const DAGGER_POMMEL_DEPTH = 0.072;

// Finger flexion for a closed hand around a ~3 cm handle (MCP, PIP, DIP), degrees.
export const FIST_ANGLES = Object.freeze({
  Index: [62, 78, 45], Middle: [68, 82, 48], Ring: [72, 84, 48], Pinky: [76, 84, 46],
  Thumb: [38, 30, 26],
});

export function palmFromKnuckles({ wrist, index, middle, pinky, thumb }, side) {
  const d = middle.clone().sub(wrist);
  const h = d.length();
  d.normalize();
  const k = index.clone().sub(pinky);
  k.addScaledVector(d, -k.dot(d)).normalize();
  const n = new THREE.Vector3().crossVectors(k, d).multiplyScalar(side === 'left' ? -1 : 1).normalize();
  return { wrist: wrist.clone(), d, k, n, h, side, thumbSide: thumb ? thumb.clone().sub(wrist).dot(n) : null };
}

// Rigs with one finger bone: the palm faces `medial` in the bind pose (arms down at the sides).
export function palmFromHandAxis({ wrist, fingers, medial }, side) {
  const d = fingers.clone().sub(wrist);
  const h = d.length();
  d.normalize();
  const n = medial.clone().addScaledVector(d, -medial.dot(d)).normalize();
  const k = new THREE.Vector3().crossVectors(d, n).multiplyScalar(side === 'left' ? -1 : 1).normalize();
  return { wrist: wrist.clone(), d, k, n, h, side, thumbSide: null };
}

export function gripPoint(palm, radiusBind, tune = {}) {
  return palm.wrist.clone()
    .addScaledVector(palm.d, (tune.along ?? 0.8) * palm.h)
    .addScaledVector(palm.n, (tune.palmar ?? 0.16) * palm.h + radiusBind)
    .addScaledVector(palm.k, (tune.across ?? 0) * palm.h);
}

// tune.unseated: a reverse grip's handle line without its seat (what the hands are posed for)
export function weaponBasis(palm, cls, stance, tune = {}) {
  const rules = WEAPON_GRIP_RULES[cls] || WEAPON_GRIP_RULES.sword;
  const rule = rules[stance] || rules.combat;
  let Y;
  let Z;
  const inPalm = (v) => palm.k.clone().multiplyScalar(v[0]).addScaledVector(palm.d, v[1]).addScaledVector(palm.n, v[2]);
  if (rule.seat && !tune.unseated) {
    Y = inPalm(rule.seat.blade).normalize();
    Z = inPalm(rule.seat.edge);
  } else if (cls === 'bow' && stance === 'carry') {
    const lean = (rule.lean + (tune.lean || 0)) * DEG;
    Y = palm.d.clone().multiplyScalar(-Math.cos(lean)).addScaledVector(palm.k, Math.sin(lean)).normalize();
    Z = palm.n.clone().negate();
  } else if (rule.reverse) {
    const t = (rule.tilt + (tune.tilt || 0)) * DEG;
    Y = palm.k.clone().multiplyScalar(-Math.cos(t)).addScaledVector(palm.d, -Math.sin(t)).normalize();
    Z = palm.d.clone().multiplyScalar(Math.cos(t)).addScaledVector(palm.k, -Math.sin(t));
  } else {
    const t = (rule.tilt + (tune.tilt || 0)) * DEG;
    Y = palm.k.clone().multiplyScalar(Math.cos(t)).addScaledVector(palm.d, Math.sin(t)).normalize();
    Z = palm.d.clone();
  }
  Z.addScaledVector(Y, -Z.dot(Y)).normalize();
  if (tune.twist) Z.applyAxisAngle(Y, tune.twist * DEG);
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  return new THREE.Matrix4().makeBasis(X, Y, Z);
}

// The seat as a turn of the weapon frame from the handle's line (both in the hand's space): grip = line x seat.
// The same for every rig, mirrored between the hands (the left palm frame is the right one mirrored).
export function daggerSeatQuaternion(side = 'right') {
  const palm = { wrist: new THREE.Vector3(), d: new THREE.Vector3(0, 1, 0), k: new THREE.Vector3(1, 0, 0),
    n: new THREE.Vector3(0, 0, side === 'left' ? -1 : 1), h: 1, side };
  const q = (m) => new THREE.Quaternion().setFromRotationMatrix(m);
  return q(weaponBasis(palm, 'dagger', 'combat', { unseated: true })).invert().multiply(q(weaponBasis(palm, 'dagger', 'combat'))).normalize();
}

const round = (a, p = 6) => a.map((v) => Number(v.toFixed(p)));

// The weapon root's transform as a child of the hand bone, from the hand's bind matrix.
export function solveGrip({ handBind, palm, cls, stance, radius = 0.015, unitsPerMetre, tune = {} }) {
  const hp = new THREE.Vector3();
  const hq = new THREE.Quaternion();
  const hs = new THREE.Vector3();
  handBind.decompose(hp, hq, hs);
  const P = gripPoint(palm, Math.min(radius, 0.03) * unitsPerMetre, tune);
  const wq = new THREE.Quaternion().setFromRotationMatrix(weaponBasis(palm, cls, stance, tune));
  const inv = hq.clone().invert();
  const position = P.sub(hp).applyQuaternion(inv).divideScalar(hs.x);
  const quaternion = inv.multiply(wq).normalize();
  return { position: round(position.toArray()), quaternion: round(quaternion.toArray()), scale: Number((unitsPerMetre / hs.x).toFixed(6)) };
}

// The thumb laid on a reverse-gripped pommel: its tip on `target` (bind space). A small search over the thumb's
// swing across the palm, its turn in the palm's plane and the bend of its two outer joints, each joint turned
// in its own frame on top of its rest rotation (the same convention as solveFist). bones / chain as in
// solveFist (chain: [Thumb1, Thumb2, Thumb3]). Returns { pose: { [bone]: quaternion array }, miss } (miss: how
// far the tip ends from the target, bind units) or null.
export function solveThumbCap({ bones, chain, palm, target }) {
  if (!chain?.length || !chain.every((b) => bones[b]) || !target) return null;
  const pos = (name) => new THREE.Vector3().setFromMatrixPosition(bones[name].bind);
  const rot = (name) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(bones[name].bind));
  const sigma = palm.side === 'left' ? -1 : 1;
  const [b1, b2, b3] = chain;
  const p1 = pos(b1), p2 = pos(b2), p3 = pos(b3);
  const tip = p3.clone().add(p3.clone().sub(p2).multiplyScalar(0.85)); // the last bone has no end joint
  const swing = palm.d.clone().multiplyScalar(-sigma);
  const turn = palm.n.clone();
  const flex = new THREE.Vector3().crossVectors(p3.clone().sub(p2).normalize(), palm.n).normalize();
  const about = (pivot, rotation, point) => point.clone().sub(pivot).applyQuaternion(rotation).add(pivot);
  const scale = p1.distanceTo(p2) + p2.distanceTo(p3) || 1; // angle penalty in the rig's own units
  let best = null;
  for (let a = -60; a <= 60; a += 5) {
    for (let b = -60; b <= 60; b += 5) {
      const r1 = new THREE.Quaternion().setFromAxisAngle(swing, a * DEG).multiply(new THREE.Quaternion().setFromAxisAngle(turn, b * DEG));
      const j2 = about(p1, r1, p2), j3 = about(p1, r1, p3), t1 = about(p1, r1, tip);
      const f1 = flex.clone().applyQuaternion(r1);
      for (let f = 0; f <= 60; f += 6) {
        const r2 = new THREE.Quaternion().setFromAxisAngle(f1, f * DEG);
        const j3b = about(j2, r2, j3), t2 = about(j2, r2, t1);
        const t3 = about(j3b, new THREE.Quaternion().setFromAxisAngle(f1.clone().applyQuaternion(r2), f * DEG), t2);
        const cost = t3.distanceTo(target) + scale * 0.0004 * (Math.abs(a) + Math.abs(b) + f);
        if (!best || cost < best.cost) best = { cost, miss: t3.distanceTo(target), a, b, f };
      }
    }
  }
  const local = (name, axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis.clone().applyQuaternion(rot(name).invert()).normalize(), deg * DEG);
  return {
    miss: best.miss,
    pose: {
      [b1]: round(bones[b1].rest.clone().multiply(local(b1, swing, best.a)).multiply(local(b1, turn, best.b)).toArray()),
      [b2]: round(bones[b2].rest.clone().multiply(local(b2, flex, best.f)).toArray()),
      [b3]: round(bones[b3].rest.clone().multiply(local(b3, flex, best.f)).toArray()),
    },
  };
}

// Closed hand for rigs with Mixamo finger chains: each joint bends about the finger's hinge axis
// (finger direction x palm normal) in that bone's own frame, on top of its rest rotation.
// bones: { name -> { bind: Matrix4, rest: Quaternion } }, chains: { Index: [b1, b2, b3], ..., Thumb: [t1, t2, t3] }
export function solveFist({ bones, chains, palm, angles = FIST_ANGLES, scale = 1 }) {
  const out = {};
  const pos = (name) => new THREE.Vector3().setFromMatrixPosition(bones[name].bind);
  const rot = (name) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(bones[name].bind));
  const sigma = palm.side === 'left' ? -1 : 1;
  for (const [finger, chain] of Object.entries(chains)) {
    if (!chain.every((b) => bones[b])) continue;
    const a = angles[finger];
    let axis;
    if (finger === 'Thumb') {
      // the thumb swings across the palm about the hand's long axis, then its joints flex
      const tdir = pos(chain[2]).sub(pos(chain[1])).normalize();
      const flex = new THREE.Vector3().crossVectors(tdir, palm.n).normalize();
      chain.forEach((b, i) => {
        const worldAxis = i === 0 ? palm.d.clone().multiplyScalar(-sigma) : flex;
        const local = worldAxis.clone().applyQuaternion(rot(b).invert()).normalize();
        const q = bones[b].rest.clone().multiply(new THREE.Quaternion().setFromAxisAngle(local, a[i] * DEG * scale));
        out[b] = round(q.toArray());
      });
      continue;
    }
    const fdir = pos(chain[1]).sub(pos(chain[0])).normalize();
    axis = new THREE.Vector3().crossVectors(fdir, palm.n).normalize();
    chain.forEach((b, i) => {
      const local = axis.clone().applyQuaternion(rot(b).invert()).normalize();
      const q = bones[b].rest.clone().multiply(new THREE.Quaternion().setFromAxisAngle(local, a[i] * DEG * scale));
      out[b] = round(q.toArray());
    });
  }
  return out;
}
