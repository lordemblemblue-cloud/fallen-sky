// The four classes' crystal forms (core/classes.mjs), each a shape of its own (owner, 2026-11-22: "more creative"),
// all faceted crystal with an inner glow (client/crystalWeapon.mjs createClassBlade): the Warrior's Emberbrand (broad,
// notched, a molten core), the Healer's Lumen (slender, a white core, a halo for a guard), the Duelist's twin fangs
// (curved, one in each hand) and the Assassin's Veilstaff (hooked blades at both ends of a shaft banded with runes).
// Each returns the same shape as a crystal sword (group, setWill, update, dispose) for the main hand, plus `off`
// for a blade in the left hand.
import * as THREE from 'three';
import { createCrystalSword, createClassBlade, attachToHand } from './crystalWeapon.mjs';
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
  const upper = createClassBlade('hooked', { color, length: STAFF_BLADE, hilt: false });
  const lower = createClassBlade('hooked', { color, length: STAFF_BLADE, hilt: false });
  const group = new THREE.Group();
  group.name = 'CrystalStaff';
  const material = new THREE.MeshStandardMaterial({ color: 0x1b2230, metalness: 0.7, roughness: 0.35 });
  const tint = new THREE.Color(color);
  const runeMaterial = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.4), emissive: tint, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.3 });
  const geometries = [];
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, STAFF_HILT, 10), material);
  geometries.push(hilt.geometry);
  hilt.position.y = STAFF_MIDDLE;
  hilt.castShadow = true;
  group.add(hilt);
  // bands of runes along the shaft, glowing in the class's colour, and collars where the blades sit
  for (const y of [-0.3, -0.16, 0.16, 0.3, -0.4, 0.4]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0195, Math.abs(y) > 0.35 ? 0.007 : 0.0035, 6, 16), Math.abs(y) > 0.35 ? material : runeMaterial);
    geometries.push(band.geometry);
    band.rotation.x = Math.PI / 2;
    band.position.y = STAFF_MIDDLE + y;
    group.add(band);
  }
  upper.group.position.y = STAFF_MIDDLE + STAFF_HILT / 2;
  lower.group.position.y = STAFF_MIDDLE - STAFF_HILT / 2;
  lower.group.rotation.x = Math.PI; // the second blade points the other way
  group.add(upper.group, lower.group);
  let time = 0;
  const both = together([upper, lower]);
  return {
    group,
    setWill(will, veil) { both.setWill(will, veil); runeMaterial.emissiveIntensity = veil === 'collapsed' ? 0.1 : 0.5 + 1.1 * Math.max(0, Math.min(1, will)); },
    update(dt) { both.update(dt); time += dt; runeMaterial.emissive.copy(tint).multiplyScalar(0.85 + 0.15 * Math.sin(time * 2.4)); },
    dispose() { upper.dispose(); lower.dispose(); geometries.forEach((g) => g.dispose()); material.dispose(); runeMaterial.dispose(); },
  };
}

/** { kind, main, off, color }: main goes in the right hand, off (twin blades) in the left. */
export function createClassWeapon(classId, { color = null } = {}) {
  const def = classById(classId);
  const tint = color ?? def?.color ?? 0x9fe8ff;
  if (def?.weapon === 'staff') return { kind: 'staff', main: staff(tint), off: null, color: tint };
  if (def?.weapon === 'dualBlades') {
    return { kind: 'dualBlades', main: createClassBlade('fang', { color: tint, length: 0.8 }), off: createClassBlade('fang', { color: tint, length: 0.8 }), color: tint };
  }
  if (classId === 'warrior') return { kind: 'sword', main: createClassBlade('ember', { color: tint, length: 1.1 }), off: null, color: tint, length: 1.1 };
  if (classId === 'healer') return { kind: 'sword', main: createClassBlade('lumen', { color: tint, length: 0.98 }), off: null, color: tint, length: 0.98 };
  // a classless fighter (the story crews' guards): the plain crystal sword
  return { kind: 'sword', main: createCrystalSword({ color: tint, length: 0.98 }), off: null, color: tint, length: 0.98 };
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
  if (weapon.kind === 'dualBlades') return [weapon.main, weapon.off].map((w) => ({ group: w.group, base: 0.4, tip: 0.8 }));
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
