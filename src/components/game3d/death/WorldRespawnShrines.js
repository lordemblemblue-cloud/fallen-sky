// Small, original in-world landmark models for registered respawn points.
// These are visual markers; the real landing spot is kept clear beside them.
import * as THREE from 'three';

export function createWorldRespawnShrines({ scene, points = [], sampleGroundY, isInBounds = () => true } = {}) {
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
    const x = point.x + 1.5, z = point.z + 0.8;
    const y = sampleGroundY?.(x, z);
    if (!Number.isFinite(y) || !isInBounds(x, z)) continue;
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
