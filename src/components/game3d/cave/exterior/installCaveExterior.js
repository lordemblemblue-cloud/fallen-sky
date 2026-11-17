// Mounts the Ashen Cliff path, mouth and dressing on the live Wolfveil group.
import { buildCaveExterior } from './buildExterior.js';
import { resolveAshenCliffCollision } from './collision.js';
import { ensureCaveExteriorGrade } from './terrainGrade.js';

export function installCaveExterior(world) {
  if (!world?.mesh || !world?.group) throw new TypeError('Wolfveil world builder required');
  ensureCaveExteriorGrade();
  const built = buildCaveExterior();
  world.mesh(built.group);
  world.walkableSurfaces ??= [];
  world.walkableSurfaces.push(built.walkable);
  world.ownedMaterials ??= [];
  for (const material of built.ownedMaterials) {
    if (material?.isMaterial) world.ownedMaterials.push(material);
  }
  return {
    group: built.group,
    walkable: built.walkable,
    entrance: built.entrance,
    approach: built.approach,
    resolveCollision(position, previous, radius = 0.62) {
      return resolveAshenCliffCollision(
        position, previous, radius, world.group.position.z || 0, built.approach.solids);
    },
    update(dt) { built.update(dt); },
    dispose() { built.dispose(); },
  };
}
