// Rest-pose rig description built straight from glTF JSON (no mesh loading): node hierarchy, local rest TRS and
// model-space rest matrices. Works in Node and in the browser.
import * as THREE from 'three';

export const MIXAMO = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  'LeftHandIndex1', 'LeftHandPinky1', 'LeftHandMiddle1', 'RightHandIndex1', 'RightHandPinky1', 'RightHandMiddle1'];

export function buildRig(json) {
  const nodes = json.nodes, parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
  const local = nodes.map((n) => {
    if (n.matrix) { const m = new THREE.Matrix4().fromArray(n.matrix), t = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(t, r, s); return { t, r, s }; }
    return { t: new THREE.Vector3(...(n.translation || [0, 0, 0])), r: new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), s: new THREE.Vector3(...(n.scale || [1, 1, 1])) };
  });
  const world = new Array(nodes.length);
  const worldOf = (i) => {
    if (world[i]) return world[i];
    const m = new THREE.Matrix4().compose(local[i].t, local[i].r, local[i].s);
    return (world[i] = parent[i] < 0 ? m : worldOf(parent[i]).clone().multiply(m));
  };
  nodes.forEach((_, i) => worldOf(i));
  const hipsIndex = nodes.findIndex((n) => /(^|:)Hips$/.test(n.name || ''));
  if (hipsIndex < 0) throw new Error('no Hips bone');
  const prefix = nodes[hipsIndex].name.slice(0, -'Hips'.length);
  const index = new Map(nodes.map((n, i) => [n.name, i]));
  const bone = (name) => index.get(prefix + name);
  const pos = (name) => { const i = bone(name); if (i === undefined) throw new Error(`missing bone ${prefix}${name}`); return new THREE.Vector3().setFromMatrixPosition(world[i]); };
  const worldRot = (i) => { const q = new THREE.Quaternion(); world[i].decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
  // the subtree under Hips, parents first
  const order = [];
  (function walk(i) { order.push(i); (nodes[i].children || []).forEach(walk); })(hipsIndex);
  return { json, nodes, parent, local, world, prefix, index, bone, pos, worldRot, hipsIndex, order };
}

// character frame from the rest pose: left (+X for the fused bodies), up, forward
export function restBasis(rig) {
  const left = rig.pos('LeftUpLeg').sub(rig.pos('RightUpLeg')).add(rig.pos('LeftArm').sub(rig.pos('RightArm'))).normalize();
  let up = rig.pos('Neck').sub(rig.pos('Hips'));
  up.sub(left.clone().multiplyScalar(up.dot(left))).normalize();
  const fwd = new THREE.Vector3().crossVectors(left, up).normalize();
  return { left, up, fwd };
}
