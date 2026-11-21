// The four classes' crystal forms (core/classes.mjs), built from the crystal sword so they share its faceted
// crystal and inner glow: the Warrior's red blade, the Healer's blue one, the Duelist's twin blades (one in each
// hand) and the Assassin's double-bladed staff (two blades on one long hilt, held at its middle).
// Each returns the same shape as a crystal sword (group, setWill, update, dispose) for the main hand, plus `off`
// for a blade in the left hand.
import * as THREE from 'three';
import { createCrystalSword, attachToHand } from './crystalWeapon.mjs';
import { classById } from '../core/classes.mjs';

const together = (parts) => ({
  setWill(will, veil) { for (const p of parts) p.setWill(will, veil); },
  update(dt) { for (const p of parts) p.update(dt); },
});

// The staff: 2.04 m, a long hilt between two blades. The right hand holds it STAFF_MIDDLE below its middle and the
// left hand as far above (tools/duelist/blender/weapon_clips.py poses both hands on it), so the weapon's own frame
// (the right hand's grip) is not its middle.
export const STAFF_MIDDLE = 0.19;
export const STAFF_HANDS = STAFF_MIDDLE * 2; // metres between the hands on the shaft
const STAFF_HILT = 0.84;
const STAFF_BLADE = 0.6;

function staff(color) {
  const upper = createCrystalSword({ color, length: STAFF_BLADE });
  const lower = createCrystalSword({ color, length: STAFF_BLADE });
  const group = new THREE.Group();
  group.name = 'CrystalStaff';
  const material = new THREE.MeshStandardMaterial({ color: 0x1b2230, metalness: 0.7, roughness: 0.35 });
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, STAFF_HILT, 10), material);
  hilt.position.y = STAFF_MIDDLE;
  hilt.castShadow = true;
  group.add(hilt);
  upper.group.position.y = STAFF_MIDDLE + STAFF_HILT / 2;
  lower.group.position.y = STAFF_MIDDLE - STAFF_HILT / 2;
  lower.group.rotation.x = Math.PI; // the second blade points the other way
  group.add(upper.group, lower.group);
  return { group, ...together([upper, lower]), dispose() { upper.dispose(); lower.dispose(); hilt.geometry.dispose(); material.dispose(); } };
}

/** { kind, main, off, color }: main goes in the right hand, off (twin blades) in the left. */
export function createClassWeapon(classId, { color = null } = {}) {
  const def = classById(classId);
  const tint = color ?? def?.color ?? 0x9fe8ff;
  if (def?.weapon === 'staff') return { kind: 'staff', main: staff(tint), off: null, color: tint };
  if (def?.weapon === 'dualBlades') {
    return { kind: 'dualBlades', main: createCrystalSword({ color: tint, length: 0.78 }), off: createCrystalSword({ color: tint, length: 0.78 }), color: tint };
  }
  const length = classId === 'warrior' ? 1.08 : 0.98;
  return { kind: 'sword', main: createCrystalSword({ color: tint, length }), off: null, color: tint, length };
}

// the right hand's grip mirrored for the left hand (the rig's left bones mirror the right ones across x)
export const mirrorGrip = (grip) => grip && {
  position: [-grip.position[0], grip.position[1], grip.position[2]],
  quaternion: [grip.quaternion[0], -grip.quaternion[1], -grip.quaternion[2], grip.quaternion[3]],
  scale: grip.scale,
};

/** Where a class weapon's blades run, each in its own group's frame (blade along +Y): [{ group, base, tip }]. */
export function weaponBlades(weapon) {
  if (weapon.kind === 'staff') {
    const reach = STAFF_HILT / 2 + STAFF_BLADE;
    return [1, -1].map((end) => ({ group: weapon.main.group, base: STAFF_MIDDLE + end * (reach - STAFF_BLADE * 0.55), tip: STAFF_MIDDLE + end * reach }));
  }
  if (weapon.kind === 'dualBlades') return [weapon.main, weapon.off].map((w) => ({ group: w.group, base: 0.4, tip: 0.78 }));
  return [{ group: weapon.main.group, base: 0.5, tip: weapon.length ?? 0.98 }];
}

/** Put a class weapon in the hands: the main at the solved grip, an off-hand blade at its mirror. */
export function equipClassWeapon(weapon, { rightHand, leftHand, grip }) {
  attachToHand(weapon.main, rightHand, grip);
  if (weapon.off && leftHand) attachToHand(weapon.off, leftHand, mirrorGrip(grip));
}

/** The main hand's weapon plus the off hand's, working as one (light with the Will, glow over time). */
export function wholeWeapon(weapon) {
  const parts = [weapon.main, weapon.off].filter(Boolean);
  return {
    group: weapon.main.group,
    ...together(parts),
    dispose() {
      for (const p of parts) { p.group.removeFromParent(); p.dispose(); }
    },
  };
}
