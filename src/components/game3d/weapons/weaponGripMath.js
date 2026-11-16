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
export const WEAPON_GRIP_RULES = Object.freeze({
  sword: Object.freeze({ combat: Object.freeze({ tilt: 18 }), carry: Object.freeze({ tilt: 34 }) }),
  greatsword: Object.freeze({ combat: Object.freeze({ tilt: 8 }), carry: Object.freeze({ tilt: 12 }) }),
  bow: Object.freeze({ combat: Object.freeze({ tilt: 0 }), carry: Object.freeze({ lean: 25 }) }),
});

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

export function weaponBasis(palm, cls, stance, tune = {}) {
  const rules = WEAPON_GRIP_RULES[cls] || WEAPON_GRIP_RULES.sword;
  const rule = rules[stance] || rules.combat;
  let Y;
  let Z;
  if (cls === 'bow' && stance === 'carry') {
    const lean = (rule.lean + (tune.lean || 0)) * DEG;
    Y = palm.d.clone().multiplyScalar(-Math.cos(lean)).addScaledVector(palm.k, Math.sin(lean)).normalize();
    Z = palm.n.clone().negate();
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
