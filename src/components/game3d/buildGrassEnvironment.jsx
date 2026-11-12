// Game 1 / Game 3D's actual forest biome. Game 2 is independent and has been
// restored to its earlier modes. The mesh returned here remains the genuine
// walkable ground for every character, boss, mount and click-to-move raycast.
import {createGame1ForestBiome} from './render/forestBiomeRuntime.js';
import {installGame3DForestLongGrass} from './Game3DForestLongGrass.js';

export function buildGrassEnvironment(scene) {
  const biome=createGame1ForestBiome(scene);
  installGame3DForestLongGrass(scene,biome);
  return biome.ground;
}
