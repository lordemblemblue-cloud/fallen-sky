// Exterior visual-only detail layer. IMPORTANT: this never adds terrain,
// player-collision geometry, a cave gate, or walkable surfaces. The cave team
// owns those in WolfveilCaveAccessGeometry / CaveSystem / CaveLayout.
import * as THREE from 'three';
import { WOLFVEIL_CAVE_APPROACHES, isWolfveilCaveApproachReserved }
  from './WolfveilCaveAccessPlan.mjs';
import { wolfveilHeight, wolfveilDistanceToRiver, wolfveilRouteClearance }
  from './WolfveilLayout.js';
import { clearOf, wolfveilForestTrunkColliders } from './WolfveilForestLayout.js';
import { planWolfveilCaveEntranceLandscaping }
  from './WolfveilCaveLandscapePlan.mjs';

const types = Object.freeze({
  stone: () => new THREE.DodecahedronGeometry(0.68, 0),
  fern: () => new THREE.ConeGeometry(0.62, 1.65, 5),
  root: () => new THREE.CylinderGeometry(0.09, 0.35, 1.85, 5),
  reed: () => new THREE.ConeGeometry(0.17, 1.52, 5),
  crystal: () => new THREE.OctahedronGeometry(0.78, 0),
  waystone: () => new THREE.DodecahedronGeometry(0.95, 0),
  lantern: () => new THREE.SphereGeometry(0.40, 8, 6),
});
const vertical = Object.freeze({
  stone: 0.27, fern: 0.61, root: 0.64, reed: 0.54,
  crystal: 0.52, waystone: 0.63, lantern: 1.02,
});

export function installWolfveilCaveEntranceLandscaping(world, parent, {
  approaches = WOLFVEIL_CAVE_APPROACHES,
} = {}) {
  if (!world?.ownedMaterials || !parent?.add)
    throw new TypeError('The existing cave scene and material owner are required');
  const existingTrunks = wolfveilForestTrunkColliders();
  const placements = planWolfveilCaveEntranceLandscaping(approaches, {
    heightAt: wolfveilHeight,
    reservedAt: isWolfveilCaveApproachReserved,
    routeClearance: wolfveilRouteClearance,
    riverDistance: wolfveilDistanceToRiver,
    clearAt: (x, z) => clearOf({ x, z }, 1.15) &&
      !existingTrunks.some(tree => Math.hypot(tree.x-x,tree.z-z) < tree.radius+1.8),
  });
  const byKind = new Map();
  for (const item of placements) {
    if (!byKind.has(item.kind)) byKind.set(item.kind, []);
    byKind.get(item.kind).push(item);
  }

  const dummy = new THREE.Object3D();
  const created = [];
  for (const [kind, items] of byKind) {
    if (!items.length || !types[kind]) continue;
    const geometry = types[kind]();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: kind === 'crystal' || kind === 'lantern' ? .3 : .91,
      metalness: kind === 'crystal' ? .16 : 0,
      emissive: kind === 'crystal' ? 0x173a59
        : kind === 'lantern' ? 0x5d5143 : 0x000000,
      emissiveIntensity: kind === 'crystal' || kind === 'lantern' ? .5 : 0,
      flatShading: true,
    });
    world.ownedMaterials.push(material);
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = 'SWV_CaveApproach_Landscape_' + kind;
    mesh.userData = {
      caveApproachLandscape: true, decorativeOnly: true, notServerAuthority: true,
      noCollision: true, doesNotModifyCaveFloor: true,
    };
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    // Never let the raycast controller land atop a decorative fern/stone.
    mesh.raycast = () => {};
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const size = item.scale;
      const height = kind === 'waystone' ? size * 1.72 : size;
      dummy.position.set(item.x, item.y + (vertical[kind] || .5) * height, item.z);
      dummy.rotation.set(kind === 'root' ? .28 : kind === 'fern' ? .12 : 0,
        item.yaw, kind === 'crystal' ? .12 : 0);
      dummy.scale.set(kind === 'waystone' ? size * .75 : size, height,
        kind === 'waystone' ? size * .68 : size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(item.color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    parent.add(mesh);
    created.push(mesh);
  }
  // One instanced draw per kind. No animated flames, dynamic lights,
  // fake paving, path blockers, extra collision BVHs or reward triggers.
  return {
    approaches: new Set(placements.map(p => p.caveId)).size,
    placements: placements.length,
    drawGroups: created.length,
    meshes: created,
  };
}
