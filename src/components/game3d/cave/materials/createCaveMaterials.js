// Placeholder cave materials. One function so a later material pass can
// replace the set without touching the tunnel builder.
//
// Expected swap point for the materials workstream:
//   src/components/game3d/cave/materials/createCaveMaterials.js
// Keep the returned keys (rock, floor, brick, brickSolid, rockSolid, crystal,
// crystalWarm, flame, wood, iron). Shells use vertex colors; boxes and
// instances use the solid clones.

import * as THREE from 'three';

function standard(params) {
  return new THREE.MeshStandardMaterial(params);
}

/**
 * @returns {{
 *   rock: THREE.Material, floor: THREE.Material, brick: THREE.Material,
 *   crystal: THREE.Material, crystalWarm: THREE.Material, flame: THREE.Material,
 *   wood: THREE.Material, iron: THREE.Material, owned: THREE.Material[],
 *   dispose: () => void,
 * }}
 */
export function createCaveMaterials() {
  const rock = standard({
    name: 'BookCave_Rock',
    color: 0x6a6258,
    roughness: 0.94,
    metalness: 0.02,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const floor = standard({
    name: 'BookCave_Floor',
    color: 0x8a8174,
    roughness: 0.9,
    metalness: 0.03,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const brick = standard({
    name: 'BookCave_Brick',
    color: 0x9a6b4a,
    roughness: 0.84,
    metalness: 0.04,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const crystal = standard({
    name: 'BookCave_Crystal',
    color: 0xb7ecff,
    emissive: 0x3ec8ea,
    emissiveIntensity: 1.35,
    roughness: 0.22,
    metalness: 0.12,
  });
  const crystalWarm = standard({
    name: 'BookCave_CrystalWarm',
    color: 0xffd0a2,
    emissive: 0xff8a3c,
    emissiveIntensity: 1.15,
    roughness: 0.28,
    metalness: 0.08,
  });
  const flame = standard({
    name: 'BookCave_Flame',
    color: 0xffe4b8,
    emissive: 0xff7a28,
    emissiveIntensity: 2.1,
    roughness: 0.4,
  });
  const wood = standard({
    name: 'BookCave_Wood',
    color: 0x6d4b32,
    roughness: 0.88,
    metalness: 0.02,
  });
  const iron = standard({
    name: 'BookCave_Iron',
    color: 0x4a5160,
    roughness: 0.46,
    metalness: 0.62,
  });
  // Boxes and instances have no vertex colors. The shell materials do.
  const brickSolid = brick.clone();
  brickSolid.name = 'BookCave_BrickSolid';
  brickSolid.vertexColors = false;
  const rockSolid = rock.clone();
  rockSolid.name = 'BookCave_RockSolid';
  rockSolid.vertexColors = false;
  const owned = [rock, floor, brick, brickSolid, rockSolid, crystal, crystalWarm, flame, wood, iron];
  return {
    rock, floor, brick, brickSolid, rockSolid, crystal, crystalWarm, flame, wood, iron, owned,
    dispose() {
      for (const material of owned) material.dispose();
    },
  };
}
