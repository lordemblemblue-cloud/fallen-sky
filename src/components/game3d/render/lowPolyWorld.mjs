// Low-poly world (docs/GAME3D_LOW_POLY_20261122.md): Game 3D draws the low-poly versions of its world models by
// default. `?hiPoly=1` in the page URL loads the earlier high-poly models instead, so the owner can compare the two;
// the switch is read once per world mount and is not remembered.
//
// Each entry names the low-poly file the game loads and the high-poly file it replaced. Budgets for the low-poly
// files are pinned by tests/game3d-low-poly-world-budgets.test.mjs.

export const LOW_POLY_WORLD_MODELS = Object.freeze({
  // owner elm trees (render/forestOwnerElmAssets.js): bark decimated to 20 %, half of the leaf cards kept (scaled up)
  elm: Object.freeze({ low: '/game3d/elm-owner-lowpoly.glb', high: '/game3d/elm-owner-optimized.glb' }),
  // ambient birds (wolfveil/ambient/WolfveilAmbientBirds.mjs): the same rigged bird, texture 4096 -> 512 px
  ambientBird: Object.freeze({ low: '/game3d/lowpoly/ambient-bird-512.glb',
    high: 'https://media.base44.com/files/public/6ab42219a52fd34656a53b37/d9fad7809_tripo_convert_bdd73c28-af44-45e3-b758-1d783314f872.glb' }),
  // owner route-side plants (wolfveil/WolfveilOwnerLandscapeAssets.mjs): same geometry, PNG textures re-encoded as WebP
  plantPack: Object.freeze({ low: '/game3d/lowpoly/plant-pack-webp.glb',
    high: 'https://media.base44.com/files/public/6876751a602125f45f1861b9/42cb63080_stylized_plant_pack_1_.glb' }),
  gardenLeaves: Object.freeze({ low: '/game3d/lowpoly/garden-leaves-webp.glb',
    high: 'https://media.base44.com/files/public/6876751a602125f45f1861b9/3f9132732_wolfveil_garden_leaves_optimized.glb' }),
});

/** True when the page asked for the earlier high-poly world models (`?hiPoly=1`). */
export function game3dHiPolyRequested(search = globalThis.location?.search ?? '') {
  try {
    const value = new URLSearchParams(String(search || '')).get('hiPoly');
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

/** The model URL to load for a LOW_POLY_WORLD_MODELS key: the low-poly file unless `?hiPoly=1`. */
export function worldModelUrl(key, search) {
  const entry = LOW_POLY_WORLD_MODELS[key];
  if (!entry) throw new Error(`unknown low-poly world model: ${key}`);
  return game3dHiPolyRequested(search) ? entry.high : entry.low;
}
