import * as THREE from 'three';

// The glider a hero hangs from (player/playerGlide.mjs): a swept crescent kite of indigo cloth with a jade centre
// stripe on a bamboo bar and two struts, ~44 triangles. It follows the two hands (the bar sits in them), turns with
// the body and banks into the turn; it unfolds when the glide opens and folds away when it ends. Remote players get
// the same prop (RemotePlayersManager). Presentation only: no collider, nothing saved.
const SPAN = 2.5, BAR = 1.1;
const INDIGO = new THREE.Color(0x2b3a67), INDIGO_LIGHT = new THREE.Color(0x4a5d93), JADE = new THREE.Color(0x5fae8e);

function canopyGeometry() {
  // Leading and trailing edges across the span: a crescent, highest in the middle, the tips swept back.
  const lead = [[-SPAN / 2, 0.80, 0.18], [-0.62, 0.94, 0.42], [0, 1.0, 0.5], [0.62, 0.94, 0.42], [SPAN / 2, 0.80, 0.18]];
  const trail = [[-SPAN / 2 + 0.08, 0.82, -0.42], [-0.6, 0.96, -0.34], [0, 1.0, -0.22], [0.6, 0.96, -0.34], [SPAN / 2 - 0.08, 0.82, -0.42]];
  const positions = [], colors = [];
  const push = (p, c) => { positions.push(...p); colors.push(c.r, c.g, c.b); };
  for (let i = 0; i < 4; i++) {
    const stripe = i === 1 || i === 2;
    const front = stripe ? JADE : INDIGO, back = INDIGO_LIGHT;
    // two triangles per panel: lead[i], lead[i+1], trail[i+1] / lead[i], trail[i+1], trail[i]
    push(lead[i], front); push(lead[i + 1], front); push(trail[i + 1], back);
    push(lead[i], front); push(trail[i + 1], back); push(trail[i], back);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** A thin box from a to b (struts and the bar). */
function rod(a, b, thickness, material) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, thickness, from.distanceTo(to)), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().sub(from).normalize());
  return mesh;
}

/** The kite glider: the bar at the origin (between the hands), +Z forward, +Y up. */
export function createGliderMesh() {
  const root = new THREE.Group();
  root.name = 'Game3D_GliderProp';
  root.userData = { decorativeOnly: true, nonCollider: true };
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const bamboo = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.7, metalness: 0 });
  const canopy = new THREE.Mesh(canopyGeometry(), cloth);
  canopy.name = 'GliderCanopy';
  root.add(canopy);
  root.add(rod([-BAR / 2, 0, 0], [BAR / 2, 0, 0], 0.035, bamboo));
  root.add(rod([-BAR / 2, 0, 0], [-0.66, 0.9, 0.08], 0.03, bamboo));
  root.add(rod([BAR / 2, 0, 0], [0.66, 0.9, 0.08], 0.03, bamboo));
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  return root;
}

export const gliderTriangleCount = (root) => {
  let n = 0;
  root.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return n;
};

const hands = new WeakMap();
function handBones(model) {
  if (!hands.has(model)) {
    let left = null, right = null;
    model.traverse((o) => {
      if (!o.isBone) return;
      if (!left && /LeftHand$/.test(o.name)) left = o;
      if (!right && /RightHand$/.test(o.name)) right = o;
    });
    hands.set(model, left && right ? [left, right] : null);
  }
  return hands.get(model);
}

/**
 * A glider for one actor. update({ open, model, bank, dt }) each frame after the actor's animation: it unfolds while
 * open, sits between the actor's hands (or above the head if the rig has none), turns with the actor and banks.
 */
export function createGliderProp(scene, { unfoldSeconds = 0.25 } = {}) {
  const root = createGliderMesh();
  root.visible = false;
  scene?.add(root);
  let unfold = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), yaw = new THREE.Quaternion(), roll = new THREE.Quaternion();
  const forward = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), fwdAxis = new THREE.Vector3(0, 0, 1);
  return {
    root,
    update({ open = false, model = null, bank = 0, dt = 0 } = {}) {
      const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
      unfold = open ? Math.min(1, unfold + step / unfoldSeconds) : Math.max(0, unfold - step / (unfoldSeconds * 0.8));
      root.visible = unfold > 0.001 && !!model;
      if (!root.visible) return;
      model.updateWorldMatrix(true, true);
      const bones = handBones(model);
      if (bones) {
        bones[0].getWorldPosition(a); bones[1].getWorldPosition(b);
        root.position.copy(a).add(b).multiplyScalar(0.5);
      } else {
        root.position.copy(model.getWorldPosition(a)).add(new THREE.Vector3(0, 2.1, 0));
      }
      // The actor's facing on the ground plane, then the bank about the flight direction.
      forward.set(0, 0, 1).applyQuaternion(model.getWorldQuaternion(yaw));
      yaw.setFromAxisAngle(up, Math.atan2(forward.x, forward.z));
      roll.setFromAxisAngle(fwdAxis, bank);
      root.quaternion.copy(yaw).multiply(roll);
      const s = 0.25 + 0.75 * unfold * unfold * (3 - 2 * unfold);
      root.scale.set(s, 0.4 + 0.6 * s, s);
    },
    dispose() {
      scene?.remove(root);
      root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    },
  };
}
