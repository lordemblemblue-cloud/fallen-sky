// Clone-only assembled-town interior clearance. This edits only the loaded
// Blender town; the surrounding Wolfveil terrain and main game remain untouched.
// Retain all walking floors and the model's perimeter ring. The separate
// Wolfveil_Town_Plaza_Ancient_Tree and its planter are NOT children of the GLB.
import {
  WOLFVEIL_IMPORTED_TOWN,
  WOLFVEIL_IMPORTED_TOWN_FLOOR_Y,
} from './WolfveilImportedTownLayout.mjs';

export const WOLFVEIL_TOWN_INTERIOR_CLEARANCE = Object.freeze({
  // Protect the outer square without shaving its edge/corner structures.
  perimeterBandMeters: 4.5,
  // Preserve genuine shallow, horizontal inlaid floor art, not wall/roof skins.
  floorArtMaxAboveMeters: 0.24,
  floorArtMaxBelowMeters: 0.12,
  floorArtMinFlatness: 0.84,
});

const WALKABLE_FLOOR = /^(?:Tile_.+|(?:Expansion_)?(?:paving|grass)|stone)$/i;
const WATER = /water|foam/i;
const FLOOR_ART = /gold|gilt|bronze|inlay|engraving|mosaic|pattern|ring|rune|mark/i;
const BRIDGE = /bridge|railing|balustrade|span|arch/i;

const v3 = (attribute, index, matrix) => {
  const x = attribute.getX(index), y = attribute.getY(index), z = attribute.getZ(index);
  const m = matrix?.elements;
  if (!m) return { x, y, z };
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return {
    x: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    z: (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  };
};

function isFlatFloorArtwork(a, b, c, floorY, config) {
  const ys = [a.y, b.y, c.y];
  if (Math.max(...ys) > floorY + config.floorArtMaxAboveMeters ||
      Math.min(...ys) < floorY - config.floorArtMaxBelowMeters) return false;
  const ux = b.x-a.x, uy = b.y-a.y, uz = b.z-a.z;
  const vx = c.x-a.x, vy = c.y-a.y, vz = c.z-a.z;
  const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
  const length = Math.hypot(nx, ny, nz);
  return length > 1e-9 && Math.abs(ny)/length >= config.floorArtMinFlatness;
}

/** Mutate only render geometry; collision is baked afterward from these faces. */
export function clearWolfveilImportedTownInterior(townRoot, {
  floorY = WOLFVEIL_IMPORTED_TOWN_FLOOR_Y + WOLFVEIL_IMPORTED_TOWN.floorLiftMeters,
  perimeterBandMeters = WOLFVEIL_TOWN_INTERIOR_CLEARANCE.perimeterBandMeters,
} = {}) {
  if (!townRoot?.traverse) return { removedFaces:0, changedMeshes:0, protectedFloorMeshes:0 };
  if (!(perimeterBandMeters > 0 && perimeterBandMeters < WOLFVEIL_IMPORTED_TOWN.width / 4))
    throw Error('Invalid clone town perimeter protection');

  const town = WOLFVEIL_IMPORTED_TOWN;
  const centerX = town.x, centerZ = town.z + 70; // Render-space town center.
  const innerHalfX = town.width / 2 - perimeterBandMeters;
  const innerHalfZ = town.depth / 2 - perimeterBandMeters;
  const config = WOLFVEIL_TOWN_INTERIOR_CLEARANCE;
  const report = {removedFaces:0, changedMeshes:0, protectedFloorMeshes:0,
    preservedPerimeterFaces:0, preservedFloorArtFaces:0};

  townRoot.updateMatrixWorld?.(true);
  townRoot.traverse(node => {
    if (!node?.isMesh || !node.geometry?.attributes?.position) return;
    if (WALKABLE_FLOOR.test(node.name) || WATER.test(node.name)) {
      report.protectedFloorMeshes++;
      return;
    }

    const geometry = node.geometry;
    const position = geometry.attributes.position;
    const sourceIndex = geometry.index;
    const indexCount = sourceIndex?.count ?? sourceIndex?.array?.length ?? position.count;
    const at = i => sourceIndex
      ? (typeof sourceIndex.getX === 'function' ? sourceIndex.getX(i) : sourceIndex.array[i])
      : i;
    const oldGroups = geometry.groups?.length
      ? geometry.groups.map(g => ({start:g.start, count:g.count, materialIndex:g.materialIndex}))
      : [{start:0, count:indexCount, materialIndex:0}];
    const kept = [], groups = [];
    let removed = 0, changed = false;

    // Keep whole perimeter-crossing faces intact rather than slicing the border.
    for (const group of oldGroups) {
      const groupStart = kept.length;
      for (let i = group.start; i + 2 < Math.min(indexCount,group.start+group.count); i += 3) {
        const ia=at(i), ib=at(i+1), ic=at(i+2);
        if (![ia,ib,ic].every(n => Number.isInteger(n) && n>=0 && n<position.count)) continue;
        const a=v3(position,ia,node.matrixWorld), b=v3(position,ib,node.matrixWorld),
          c=v3(position,ic,node.matrixWorld);
        const whollyInterior = [a,b,c].every(v =>
          Math.abs(v.x-centerX) < innerHalfX && Math.abs(v.z-centerZ) < innerHalfZ);
        const preserveArt = !BRIDGE.test(node.name) && FLOOR_ART.test(node.name) &&
          isFlatFloorArtwork(a,b,c,floorY,config);
        if (whollyInterior && !preserveArt) {
          removed++; changed=true; continue;
        }
        if (!whollyInterior) report.preservedPerimeterFaces++;
        else report.preservedFloorArtFaces++;
        kept.push(ia,ib,ic);
      }
      if (kept.length>groupStart)
        groups.push({start:groupStart,count:kept.length-groupStart,materialIndex:group.materialIndex});
    }
    if (!changed) return;
    // Use the geometry index for rendering AND the downstream triangle-based
    // collision bake. Merely toggling mesh.visible leaves invisible walls.
    geometry.setIndex(kept);
    geometry.clearGroups?.();
    for (const group of groups)
      geometry.addGroup?.(group.start,group.count,group.materialIndex);
    geometry.setDrawRange?.(0,kept.length);
    geometry.computeBoundingBox?.();
    geometry.computeBoundingSphere?.();
    node.userData ??= {};
    node.userData.cloneTownInteriorCleared = true;
    node.userData.cloneTownRemovedFaces = removed;
    report.removedFaces += removed;
    report.changedMeshes++;
  });
  townRoot.userData ??= {};
  townRoot.userData.cloneTownInteriorClearance = report;
  return report;
}
