// What a mission's people wear over Fallen Sky's fused bodies: a dark suit (the body's own skin, recoloured,
// hair put away), a helmet with a lit visor, a cuirass, pauldrons, a belt, bracers and greaves; or, for people
// who are not soldiers (hood, light), a cloth hood and only a belt and bracers. Original and procedural. The pieces are fitted from the skeleton at rest, so they suit either build, and each rides the
// bone it belongs to.
import * as THREE from 'three';
import { armorPolicy } from './armorQuality.mjs';

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
  // Saltmarch: the refuge's people (unbound, in what they could make) and the Houses' wardens
  refugee: Object.freeze({ suit: 0x4a3b2c, plate: 0x7a6a52, glow: 0xffc06a, hood: true, light: true }),
  keeper: Object.freeze({ suit: 0x3b3326, plate: 0x8a7350, glow: 0xffd27a, hood: true, light: true }),
  warden: Object.freeze({ suit: 0x2a2f3a, plate: 0xd5d8e0, glow: 0xffd36a }),
  wardenCaptain: Object.freeze({ suit: 0x1e2230, plate: 0xece4cc, glow: 0xffe08a }),
  hask: Object.freeze({ suit: 0x3b3326, plate: 0x8a7350, glow: 0xffd27a, hood: true, light: true }),
  crane: Object.freeze({ suit: 0x1e2230, plate: 0xf0ead8, glow: 0xfff0b0 }),
});

const shapeCache = new Map();
const getShapes = (low) => {
  if (!shapeCache.has(low)) {
    shapeCache.set(low, {
      ball: new THREE.SphereGeometry(1, low ? 6 : 16, low ? 4 : 12),
      // a band across the front of a sphere (+Z): the visor
      band: new THREE.SphereGeometry(1, low ? 4 : 14, low ? 2 : 3, Math.PI / 2 - 1.05, 2.1, 1.2, 0.3),
      // a hood: a sphere open at the face (+Z) and below the chin
      hood: new THREE.SphereGeometry(1, low ? 6 : 18, low ? 4 : 12, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.74),
      // a cloak: an open cone, wider at the hem
      cloak: new THREE.CylinderGeometry(1, 1.45, 1, low ? 6 : 18, 1, true),
      box: new THREE.BoxGeometry(1, 1, 1),
      torso: new THREE.CylinderGeometry(1, 0.8, 1, low ? 5 : 12),
      ring: new THREE.CylinderGeometry(1, 1, 1, low ? 5 : 12),
      limb: new THREE.CylinderGeometry(1, 0.8, 1, low ? 5 : 10),
    });
  }
  return shapeCache.get(low);
};
const materials = new Map();
const kitMaterials = (kit) => {
  const key = `${kit.suit}|${kit.plate}|${kit.glow}`;
  if (!materials.has(key)) {
    materials.set(key, {
      suit: new THREE.MeshStandardMaterial({ color: kit.suit, roughness: 0.8, metalness: 0.05 }),
      plate: new THREE.MeshStandardMaterial({ color: kit.plate, roughness: 0.45, metalness: 0.3 }),
      glow: new THREE.MeshBasicMaterial({ color: kit.glow, side: THREE.DoubleSide }),
      cloth: new THREE.MeshStandardMaterial({ color: kit.plate, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }),
    });
  }
  return materials.get(key);
};

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Dress a body (at rest: before anything has posed it, and not yet placed in the scene) in a kit
 * ({ suit, plate, glow } colours). The kit's materials are shared between everyone who wears it.
 */
export function dressGuard(model, kit = KITS.gunner, quality = 'full') {
  const policy = armorPolicy(quality);
  const mats = kitMaterials(kit);
  model.updateMatrixWorld(true);
  // the suit: skin becomes cloth, hair goes under the helmet
  model.traverse((n) => {
    if (!n.isSkinnedMesh) return;
    if (/^hair/i.test(n.name) || /hair/i.test(n.material?.name || '')) { if (policy.attachedArmor) n.visible = false; }
    else { n.material = mats.suit; n.userData.ownMaterial = false; }
  });
  // Skip allocation and attachment entirely, not merely mesh.visible = false.
  if (!policy.attachedArmor) return;
  const shape = getShapes(policy.simplified);
  const find = (part) => model.getObjectByName(`mixamorig${part}`) || null;
  const at = (part) => { const b = find(part); return b ? b.getWorldPosition(new THREE.Vector3()) : null; };
  const piece = (geometry, material, parent, position, scale, quaternion = null) => {
    if (!parent) return null;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    if (quaternion) mesh.quaternion.copy(quaternion);
    mesh.castShadow = policy.armorShadows;
    mesh.userData.duelistArmorPiece = true;
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
  // helmet and visor, or a hood
  const tall = crown ? head.distanceTo(crown) : 0.19;
  const skull = (crown ? head.clone().lerp(crown, kit.hood ? 0.5 : 0.56) : head.clone().add(v(0, tall * 0.56, 0))).add(v(0, 0, tall * (kit.hood ? -0.06 : 0.05)));
  const radii = kit.hood ? v(tall * 0.5, tall * 0.6, tall * 0.56) : v(tall * 0.47, tall * 0.56, tall * 0.54);
  piece(kit.hood ? shape.hood : shape.ball, kit.hood ? mats.cloth : mats.plate, find('Head'), skull, radii);
  if (!kit.hood) piece(shape.band, mats.glow, find('Head'), skull, radii.clone().multiplyScalar(1.035));
  const centre = v((leftArm.x + rightArm.x) / 2, 0, chest.z + 0.005);
  const knee = at('LeftLeg');
  if (kit.light && knee) {
    // a cloak from the shoulders to the knees, riding the lower back
    const top = Math.max(leftArm.y, rightArm.y) + 0.02;
    const hem = knee.y - 0.04;
    piece(shape.cloak, mats.cloth, find('Spine'), v(centre.x, (top + hem) / 2, hips.z - 0.01), v(half * 0.95, top - hem, half * 0.62));
  }
  if (!kit.light) {
    // cuirass, with a light at the collar
    const top = Math.max(leftArm.y, rightArm.y) + 0.03;
    const bottom = spine.y;
    centre.y = (top + bottom) / 2;
    piece(shape.torso, mats.plate, find('Spine2'), centre, v(half * 1.04, top - bottom, half * 0.78));
    piece(shape.box, mats.glow, find('Spine2'), v(centre.x, top - 0.09, centre.z + half * 0.74), v(half * 0.5, 0.022, 0.02));
    // pauldrons
    for (const [side, arm] of [['Left', leftArm], ['Right', rightArm]]) {
      piece(shape.ball, mats.plate, find(`${side}Arm`), arm.clone().add(v(Math.sign(arm.x - centre.x) * 0.02, 0.025, 0)), v(half * 0.5, half * 0.4, half * 0.54));
    }
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
  if (!kit.light) {
    along('LeftLeg', 'LeftFoot', 0.12, 0.066, 0.66);
    along('RightLeg', 'RightFoot', 0.12, 0.066, 0.66);
  }
}
