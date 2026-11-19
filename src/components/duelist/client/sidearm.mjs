// The smugglers' contraband: a crystal-forged sidearm (original, procedural). A blocky grip and frame with a
// sliver of crystal for a barrel core; it glows hotter while a shot winds up, so you can see it coming.
// Weapon frame (the same as the crystal sword's): the grip at the origin along Y, the barrel along +Z.
import * as THREE from 'three';

export function createSidearm({ color = 0xff7a5a } = {}) {
  const group = new THREE.Group();
  group.name = 'Sidearm';
  const tint = new THREE.Color(color);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1f2a, metalness: 0.75, roughness: 0.35 });
  const core = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.5), emissive: tint, emissiveIntensity: 0.8, roughness: 0.2, flatShading: true });
  const geometries = [];
  const add = (geometry, material, x, y, z) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(0.032, 0.12, 0.045), dark, 0, 0, 0); // grip
  add(new THREE.BoxGeometry(0.04, 0.05, 0.2), dark, 0, 0.08, 0.075); // frame
  add(new THREE.BoxGeometry(0.018, 0.02, 0.24), core, 0, 0.085, 0.1); // the crystal core down the barrel
  const tip = add(new THREE.OctahedronGeometry(0.02), core, 0, 0.085, 0.235);
  const muzzle = new THREE.Vector3();
  let heat = 0;
  let target = 0;
  return {
    group,
    kind: 'sidearm',
    // called like the sword's: a smuggler has no Will, the glow is the weapon's own
    setWill() {},
    /** 0..1: how far a shot's wind-up has come (the tell). */
    charge(v) { target = Math.max(0, Math.min(1, v)); },
    muzzle() { return tip.getWorldPosition(muzzle); },
    update(dt) {
      heat += (target - heat) * Math.min(1, dt * 18);
      core.emissiveIntensity = 0.8 + heat * 4.5;
      tip.scale.setScalar(1 + heat * 1.6);
    },
    dispose() { geometries.forEach((g) => g.dispose()); dark.dispose(); core.dispose(); },
  };
}

let aimGeometry = null;

/** The line a shot will take, shown while it winds up (it brightens until the round leaves). */
export function createAimLine(scene, { color = 0xff7a5a } = {}) {
  if (!aimGeometry) aimGeometry = new THREE.BoxGeometry(0.012, 0.012, 1).translate(0, 0, 0.5); // from its origin along +Z
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(aimGeometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    /** from: where it starts ({x, y, z}); yaw: the shot's heading; length: metres; strength: 0..1 */
    show(from, yaw, length, strength) {
      mesh.visible = true;
      mesh.position.set(from.x, from.y, from.z);
      mesh.rotation.y = yaw;
      mesh.scale.set(1 + strength * 1.5, 1 + strength * 1.5, length);
      material.opacity = 0.1 + 0.65 * strength;
    },
    hide() { mesh.visible = false; },
    dispose() { material.dispose(); mesh.removeFromParent(); },
  };
}
