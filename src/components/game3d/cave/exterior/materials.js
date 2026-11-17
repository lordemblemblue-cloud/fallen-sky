// One swap point for cave exterior surfaces.
// Agent 2's materials module, when it exists, replaces the placeholders.
// Expected export: createCaveMaterials() -> { cliff, path, timber, bronze, moss, torch, throat }.
import * as THREE from 'three';
import { getWolfveilSumiETextures, cloneRepeatedTexture } from '../../wolfveil/WolfveilSumiETextures.mjs';

function publishedMaterials() {
  try {
    const found = import.meta.glob('../materials/index.js', { eager: true });
    const mod = Object.values(found)[0];
    if (!mod) return null;
    if (typeof mod.createCaveMaterials === 'function') return mod.createCaveMaterials();
    if (mod.caveMaterials) return mod.caveMaterials;
    return null;
  } catch {
    return null;
  }
}

function standard(options) {
  const material = new THREE.MeshStandardMaterial(options);
  material.userData.caveExteriorPlaceholder = true;
  return material;
}

function placeholderMaterials() {
  const tex = getWolfveilSumiETextures();
  const stone = cloneRepeatedTexture(tex.stone.map, 0.22, 0.22);
  const stoneBump = cloneRepeatedTexture(tex.stone.bumpMap, 0.22, 0.22);
  const dirt = cloneRepeatedTexture(tex.dirt?.map ?? tex.stone.map, 0.18, 0.18);
  const dirtBump = cloneRepeatedTexture(tex.dirt?.bumpMap ?? tex.stone.bumpMap, 0.18, 0.18);
  const wood = cloneRepeatedTexture(tex.wood.map, 0.45, 0.45);
  const cliff = standard({
    color: 0xb7b2a8, map: stone, bumpMap: stoneBump, bumpScale: 0.22,
    roughness: 0.94, metalness: 0.04, vertexColors: true, flatShading: true,
  });
  cliff.name = 'AshenCliff_Rock';
  const path = standard({
    color: 0xc2b5a2, map: dirt, bumpMap: dirtBump, bumpScale: 0.05,
    roughness: 0.92, metalness: 0.02, vertexColors: true,
  });
  path.name = 'AshenCliff_Path';
  const timber = standard({
    color: 0x8a5a32, map: wood, roughness: 0.86, metalness: 0.02,
  });
  timber.name = 'AshenCliff_Timber';
  const bronze = standard({
    color: 0x8a6232, roughness: 0.42, metalness: 0.64,
    emissive: 0x3a2410, emissiveIntensity: 0.35,
  });
  bronze.name = 'AshenCliff_Bronze';
  const moss = standard({
    color: 0x4f7a49, roughness: 0.9, metalness: 0,
  });
  moss.name = 'AshenCliff_Moss';
  const torch = standard({
    color: 0xffc27a, emissive: 0xff7a2a, emissiveIntensity: 2.4,
    roughness: 0.4,
  });
  torch.name = 'AshenCliff_Torch';
  const ember = standard({
    color: 0x9fd8ff, emissive: 0x3aa0d8, emissiveIntensity: 1.8,
    roughness: 0.35,
  });
  ember.name = 'AshenCliff_Ember';
  const throat = standard({
    color: 0x10141a, roughness: 1, metalness: 0, side: THREE.DoubleSide,
  });
  throat.name = 'AshenCliff_Throat';
  const sign = standard({
    color: 0xf2e2c4, roughness: 0.78,
  });
  sign.name = 'AshenCliff_Sign';
  return {
    cliff, path, timber, bronze, moss, torch, ember, throat, sign,
    source: 'placeholder',
    ownedTextures: [stone, stoneBump, dirt, dirtBump, wood],
  };
}

/** Materials for the cliff, path and dressing. Prefers agent 2 when present. */
export function createCaveExteriorMaterials() {
  const published = publishedMaterials();
  if (published?.cliff && published?.path) {
    return { ...placeholderMaterials(), ...published, source: published.source || 'cave-materials' };
  }
  return placeholderMaterials();
}
