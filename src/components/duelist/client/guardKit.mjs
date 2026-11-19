// What the depot's people wear over Fallen Sky's fused bodies: a dark suit (the body's own skin, recoloured,
// hair put away), a helmet with a lit visor, a cuirass, pauldrons, a belt, bracers and greaves. Original and
// procedural. The pieces are fitted from the skeleton at rest, so they suit either build, and each rides the
// bone it belongs to.
import * as THREE from 'three';

export const KITS = Object.freeze({
  gunner: Object.freeze({ suit: 0x252d3a, plate: 0x7486a3, glow: 0xff7a5a }),
  marksman: Object.freeze({ suit: 0x252d3a, plate: 0x9aa3b2, glow: 0xffd24a }),
  enforcer: Object.freeze({ suit: 0x2b2326, plate: 0x8f5a50, glow: 0xff4a3a }),
  captain: Object.freeze({ suit: 0x2b2326, plate: 0xb04040, glow: 0xff3a2a }),
  boss: Object.freeze({ suit: 0x252d3a, plate: 0xa08a6a, glow: 0xffa040 }),
  // the three who sign the transfers
  dask: Object.freeze({ suit: 0x2c241b, plate: 0xc98a3c, glow: 0xffa040 }),
  perrin: Object.freeze({ suit: 0x272036, plate: 0x8f68d0, glow: 0xd4a8ff }),
  rooke: Object.freeze({ suit: 0x2a1a1c, plate: 0xb83a3a, glow: 0xff3a2a }),
});

let shapes = null;
const getShapes = () => {
  if (!shapes) {
    shapes = {
      ball: new THREE.SphereGeometry(1, 16, 12),
      // a band across the front of a sphere (+Z): the visor
      band: new THREE.SphereGeometry(1, 14, 3, Math.PI / 2 - 1.05, 2.1, 1.2, 0.3),
      box: new THREE.BoxGeometry(1, 1, 1),
      torso: new THREE.CylinderGeometry(1, 0.8, 1, 12),
      ring: new THREE.CylinderGeometry(1, 1, 1, 12),
      limb: new THREE.CylinderGeometry(1, 0.8, 1, 10),
    };
  }
  return shapes;
};
const materials = new Map();
const kitMaterials = (kit) => {
  const key = `${kit.suit}|${kit.plate}|${kit.glow}`;
  if (!materials.has(key)) {
    materials.set(key, {
      suit: new THREE.MeshStandardMaterial({ color: kit.suit, roughness: 0.8, metalness: 0.05 }),
      plate: new THREE.MeshStandardMaterial({ color: kit.plate, roughness: 0.45, metalness: 0.3 }),
      glow: new THREE.MeshBasicMaterial({ color: kit.glow, side: THREE.DoubleSide }),
    });
  }
  return materials.get(key);
};

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Dress a body (at rest: before anything has posed it, and not yet placed in the scene) in a kit
 * ({ suit, plate, glow } colours). The kit's materials are shared between everyone who wears it.
 */
export function dressGuard(model, kit = KITS.gunner) {
  const shape = getShapes();
  const mats = kitMaterials(kit);
  model.updateMatrixWorld(true);
  // the suit: skin becomes cloth, hair goes under the helmet
  model.traverse((n) => {
    if (!n.isSkinnedMesh) return;
    if (/^hair/i.test(n.name) || /hair/i.test(n.material?.name || '')) n.visible = false;
    else n.material = mats.suit;
  });
  const find = (part) => model.getObjectByName(`mixamorig${part}`) || null;
  const at = (part) => { const b = find(part); return b ? b.getWorldPosition(new THREE.Vector3()) : null; };
  const piece = (geometry, material, parent, position, scale, quaternion = null) => {
    if (!parent) return null;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    if (quaternion) mesh.quaternion.copy(quaternion);
    mesh.castShadow = true;
    mesh.updateMatrixWorld(true);
    parent.attach(mesh); // keeps where it is, now in the bone's space
    return mesh;
  };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const head = at('Head');
  const crown = at('HeadTop_End');
  const leftArm = at('LeftArm');
  const rightArm = at('RightArm');
  const spine = at('Spine');
  const chest = at('Spine2');
  const hips = at('Hips');
  if (!head || !leftArm || !rightArm || !spine || !chest || !hips) return;
  const half = Math.abs(leftArm.x - rightArm.x) / 2; // half the shoulders' width
  // helmet and visor
  const tall = crown ? head.distanceTo(crown) : 0.19;
  const skull = (crown ? head.clone().lerp(crown, 0.56) : head.clone().add(v(0, tall * 0.56, 0))).add(v(0, 0, tall * 0.05));
  const radii = v(tall * 0.47, tall * 0.56, tall * 0.54);
  piece(shape.ball, mats.plate, find('Head'), skull, radii);
  piece(shape.band, mats.glow, find('Head'), skull, radii.clone().multiplyScalar(1.035));
  // cuirass, with a light at the collar
  const top = Math.max(leftArm.y, rightArm.y) + 0.03;
  const bottom = spine.y;
  const centre = v((leftArm.x + rightArm.x) / 2, (top + bottom) / 2, chest.z + 0.005);
  piece(shape.torso, mats.plate, find('Spine2'), centre, v(half * 1.04, top - bottom, half * 0.78));
  piece(shape.box, mats.glow, find('Spine2'), v(centre.x, top - 0.09, centre.z + half * 0.74), v(half * 0.5, 0.022, 0.02));
  // pauldrons
  for (const [side, arm] of [['Left', leftArm], ['Right', rightArm]]) {
    piece(shape.ball, mats.plate, find(`${side}Arm`), arm.clone().add(v(Math.sign(arm.x - centre.x) * 0.02, 0.025, 0)), v(half * 0.5, half * 0.4, half * 0.54));
  }
  // belt
  piece(shape.ring, mats.plate, find('Hips'), hips.clone().add(v(0, 0.02, 0)), v(half * 0.98, 0.085, half * 0.74));
  // bracers and greaves, each along its limb
  const along = (from, to, start, radius, share) => {
    const a = at(from);
    const b = at(to);
    if (!a || !b) return;
    const dir = b.clone().sub(a);
    const length = dir.length();
    if (length < 1e-4) return;
    // the limb shape narrows towards -Y: turn that end to the wrist or the ankle
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().multiplyScalar(-1 / length));
    piece(shape.limb, mats.plate, find(from), a.clone().addScaledVector(dir, start + share / 2), v(radius, length * share, radius), q);
  };
  along('LeftForeArm', 'LeftHand', 0.18, 0.047, 0.62);
  along('RightForeArm', 'RightHand', 0.18, 0.047, 0.62);
  along('LeftLeg', 'LeftFoot', 0.12, 0.066, 0.66);
  along('RightLeg', 'RightFoot', 0.12, 0.066, 0.66);
}
