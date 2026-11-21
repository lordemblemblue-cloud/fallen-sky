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

function staff(color) {
  const upper = createCrystalSword({ color, length: 0.72 });
  const lower = createCrystalSword({ color, length: 0.72 });
  const group = new THREE.Group();
  group.name = 'CrystalStaff';
  const material = new THREE.MeshStandardMaterial({ color: 0x1b2230, metalness: 0.7, roughness: 0.35 });
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.6, 10), material);
  hilt.castShadow = true;
  group.add(hilt);
  upper.group.position.y = 0.3;
  lower.group.position.y = -0.3;
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
  return { kind: 'sword', main: createCrystalSword({ color: tint, length: classId === 'warrior' ? 1.08 : 0.98 }), off: null, color: tint };
}

// the right hand's grip mirrored for the left hand (the rig's left bones mirror the right ones across x)
export const mirrorGrip = (grip) => grip && {
  position: [-grip.position[0], grip.position[1], grip.position[2]],
  quaternion: [grip.quaternion[0], -grip.quaternion[1], -grip.quaternion[2], grip.quaternion[3]],
  scale: grip.scale,
};

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
