// Small, original in-world landmark models for registered respawn points.
// These are visual markers; the real landing spot is kept clear beside them.
import * as THREE from 'three';

// Ground patches beside a landing spot, nearest first. The marker never stands
// on the exact landing position and never inside a wall.
const SHRINE_OFFSETS = Object.freeze([
  [1.7, 0], [1.2, 1.2], [0, 1.7], [-1.2, 1.2], [-1.7, 0], [-1.2, -1.2], [0, -1.7], [1.2, -1.2],
  [2.3, 0], [1.7, 1.7], [0, 2.3], [-1.7, 1.7], [-2.3, 0], [-1.7, -1.7], [0, -2.3], [1.7, -1.7],
]);

export function createWorldRespawnShrines({ scene, points = [], sampleGroundY, isInBounds = () => true, isBlocked = () => false } = {}) {
  const root = new THREE.Group();
  root.name = 'AXE World Respawn Shrines';
  const stone = new THREE.MeshStandardMaterial({ color: 0x273441, roughness: 0.78, metalness: 0.24 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x89b8c6, metalness: 0.7, roughness: 0.28 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x58dcff, emissive: 0x24b8e1, emissiveIntensity: 1.4, metalness: 0.1 });
  const baseGeo = new THREE.CylinderGeometry(0.48, 0.57, 0.24, 8);
  const pillarGeo = new THREE.CylinderGeometry(0.11, 0.19, 0.9, 6);
  const crystalGeo = new THREE.OctahedronGeometry(0.21, 0);
  const ringGeo = new THREE.TorusGeometry(0.52, 0.035, 6, 24);

  const occupied = [];
  for (const point of points) {
    // Keep the visual away from the exact feet landing position and avoid
    // a forest of nearly overlapping beacons around the town plaza.
    if (occupied.some(p => Math.hypot(p.x - point.x, p.z - point.z) < 7)) continue;
    // A fixed offset put four of these markers inside town walls, so the
    // marker now takes the first open patch of ground around the landing.
    const landingY = sampleGroundY?.(point.x, point.z);
    let spot = null;
    for (const [offsetX, offsetZ] of SHRINE_OFFSETS) {
      const x = point.x + offsetX, z = point.z + offsetZ;
      if (!isInBounds(x, z) || isBlocked(x, z)) continue;
      const y = sampleGroundY?.(x, z);
      if (!Number.isFinite(y)) continue;
      // A wall or a rooftop is metres above the landing ground; only a patch
      // on the same walkable level can carry the marker.
      if (Number.isFinite(landingY) && Math.abs(y - landingY) > 1.2) continue;
      spot = { x, y, z };
      break;
    }
    if (!spot) continue;
    const { x, y, z } = spot;
    const shrine = new THREE.Group();
    shrine.name = 'Respawn Shrine: ' + point.label;
    shrine.position.set(x, y, z);
    shrine.userData = { respawnPointId: point.id, interactionType: 'respawn-marker' };
    const base = new THREE.Mesh(baseGeo, stone);
    base.position.y = 0.12;
    base.castShadow = true; base.receiveShadow = true;
    const pillar = new THREE.Mesh(pillarGeo, trim);
    pillar.position.y = 0.65;
    pillar.castShadow = true;
    const crystal = new THREE.Mesh(crystalGeo, glow);
    crystal.position.y = 1.22;
    crystal.rotation.z = Math.PI / 4;
    const ring = new THREE.Mesh(ringGeo, glow);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    shrine.add(base, pillar, crystal, ring);
    root.add(shrine);
    occupied.push(point);
  }
  scene?.add(root);
  return {
    group: root,
    dispose() {
      root.parent?.remove(root);
      baseGeo.dispose(); pillarGeo.dispose(); crystalGeo.dispose(); ringGeo.dispose();
      stone.dispose(); trim.dispose(); glow.dispose();
    },
  };
}