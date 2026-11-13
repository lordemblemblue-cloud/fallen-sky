// The assembled town was modelled in two different ground heights: the 80
// walkable Tile_* squares sat 0.029 model units BELOW the paving, lawns,
// terraces, house bases (0.720-0.754) and tree trunks (0.722). Scaled by
// 12.44 that is a 36cm step, so every wall and trunk in the town hovered above
// the floor the player actually walks on, and each terrace edge cut a dark
// shadow line across the stone.
//
// This settles every walkable surface of the town onto ONE floor height - the
// level the model's own houses and trees were built for - leaving only the
// canal bed recessed so the water still has a channel to sit in.
import {
  WOLFVEIL_IMPORTED_TOWN,
  WOLFVEIL_IMPORTED_TOWN_CANAL,
} from './WolfveilImportedTownLayout.mjs';

const FLOOR = WOLFVEIL_IMPORTED_TOWN.floorSourceY;
// Ground-level tops only: walls, roofs, lanterns and house interiors are above.
const GROUND_BAND_MIN = 0.6;
const GROUND_BAND_MAX = 0.8;
// Some paving/park landing pieces were authored ABOVE the common town floor,
// outside the legacy 0.6–0.8 band. Their flat upper faces must be seated too,
// or they appear as floating square stages where the bridge meets the park.
const RAISED_TOP_MAX = 1.08;
const RAISED_TOP_MIN_FLATNESS = 0.84;
// Anything at or below this is the canal bed, which must stay below the water.
const CANAL_BED_MAX = 0.7;
// A lawn sits a hair proud of the paving so the two never fight for the same
// pixel where a park strip meets the stone.
const LAWN_LIFT = 0.0015;
// Paving settles fractionally under the tile grid: 1.5cm at world scale, far
// below the eye but enough that the two coplanar surfaces never flicker.
const PAVING_DROP = 0.0012;
const PAVING_MESH = /^(paving$|Expansion_paving$|stone$)/;

const FLOOR_MESH = /^(Tile_|paving$|Expansion_paving$|grass$|Expansion_grass$|stone$)/;
const LAWN_MESH = /^(grass|Expansion_grass)$/;
const TILE_MESH = /^Tile_/i;
const RAISED_TOP_MESH = /^(paving|Expansion_paving|grass|Expansion_grass|stone)$/i;

// Only move genuinely flat, raised ground-plane faces. Roofs, railings,
// stair risers, canal retaining walls and arbitrary high geometry are not floors.
function raisedWalkableFaceVertices(node) {
  const p = node.geometry?.attributes?.position;
  if (!p || !RAISED_TOP_MESH.test(node.name)) return new Set();
  const index = node.geometry.index;
  const count = index?.count ?? index?.array?.length ?? p.count;
  const vertex = (i) => index ? (index.getX ? index.getX(i) : index.array[i]) : i;
  const raised = new Set();
  for (let i = 0; i + 2 < count; i += 3) {
    const a = vertex(i), b = vertex(i + 1), c = vertex(i + 2);
    const ay = p.getY(a), by = p.getY(b), cy = p.getY(c);
    if (Math.min(ay,by,cy) <= GROUND_BAND_MAX ||
        Math.max(ay,by,cy) > RAISED_TOP_MAX) continue;
    const ux=p.getX(b)-p.getX(a),uy=by-ay,uz=p.getZ(b)-p.getZ(a);
    const vx=p.getX(c)-p.getX(a),vy=cy-ay,vz=p.getZ(c)-p.getZ(a);
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const length=Math.hypot(nx,ny,nz);
    if (length > 1e-12 && Math.abs(ny)/length >= RAISED_TOP_MIN_FLATNESS) {
      raised.add(a); raised.add(b); raised.add(c);
    }
  }
  return raised;
}
// Walls that were built one storey-terrace higher than the floor. Dropping the
// whole small piece seats every wall on the ground instead of leaving a gap.
const ARCHITECTURE_MAX_JUMP = 0.06;
const ARCHITECTURE_MAX_HEIGHT = 1.0;
// Only bases that sit clearly above the floor, never upper storeys or canopies.
const ARCHITECTURE_BAND_MIN = 0.755;
const ARCHITECTURE_BAND_MAX = 0.8;

// The old rectangular canal exclusion covers much of the central park, not
// just the real water. Build a mask from the LOADED model's actual water faces:
// dry park tiles inside that rectangle must still be flattened. If there is no
// water geometry available, fail conservatively to the older canal protection.
function vertexWorldXZ(node, position, index) {
  const x=position.getX(index),y=position.getY(index),z=position.getZ(index);
  const m=node.matrixWorld?.elements;
  return m ? {
    x:m[0]*x+m[4]*y+m[8]*z+m[12],
    z:m[2]*x+m[6]*y+m[10]*z+m[14],
  } : {x,z};
}
function actualWaterFootprint(townRoot) {
  const faces=[];
  townRoot?.traverse?.(node=>{
    if (!node.isMesh || !/water/i.test(node.name)) return;
    const p=node.geometry?.attributes?.position,index=node.geometry?.index;
    if (!p) return;
    const count=index?.count??index?.array?.length??p.count;
    const vi=i=>index?(index.getX?index.getX(i):index.array[i]):i;
    for(let i=0;i+2<count;i+=3){
      const a=vertexWorldXZ(node,p,vi(i));
      const b=vertexWorldXZ(node,p,vi(i+1));
      const c=vertexWorldXZ(node,p,vi(i+2));
      const det=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
      if(!Number.isFinite(det)||Math.abs(det)<1e-8)continue;
      faces.push({a,b,c,det,
        minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),
        minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z)});
    }
  });
  if(!faces.length)return null;
  return (node,p,i)=>{
    const q=vertexWorldXZ(node,p,i);
    for(const f of faces){
      if(q.x<f.minX-1e-4||q.x>f.maxX+1e-4||q.z<f.minZ-1e-4||q.z>f.maxZ+1e-4)continue;
      const dx=q.x-f.a.x,dz=q.z-f.a.z;
      const u=(dx*(f.c.z-f.a.z)-dz*(f.c.x-f.a.x))/f.det;
      const v=((f.b.x-f.a.x)*dz-(f.b.z-f.a.z)*dx)/f.det;
      if(u>=-1e-4&&v>=-1e-4&&u+v<=1+1e-4)return true;
    }
    return false;
  };
}
function geometryBounds(position) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { min, max };
}

/** Drops an architecture piece that floats above the floor by a small step. */
function seatFloatingArchitecture(node) {
  const position = node.geometry?.attributes?.position;
  if (!position) return 0;
  const { min, max } = geometryBounds(position);
  if (!(min > FLOOR + 0.004 && min <= FLOOR + ARCHITECTURE_MAX_JUMP)) return 0;
  // Tall merged meshes (gilt trim, canopies) share one base with roof details
  // far above it, so they must never be moved as a block.
  if (max > FLOOR + ARCHITECTURE_MAX_HEIGHT) return 0;
  const drop = min - FLOOR;
  for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) - drop);
  position.needsUpdate = true;
  node.geometry.computeVertexNormals();
  return 1;
}

/**
 * Pulls the very bottom ring of a wall or a gilt base ring down onto the floor.
 * Merged meshes that also carry roof finials cannot move as a whole, but their
 * lowest band can, which is the part that shows a gap under it.
 */
function settleLowestBand(node) {
  const position = node.geometry?.attributes?.position;
  if (!position) return 0;
  let moved = 0;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < ARCHITECTURE_BAND_MIN || y > ARCHITECTURE_BAND_MAX) continue;
    position.setY(i, FLOOR);
    moved++;
  }
  if (moved) {
    position.needsUpdate = true;
    node.geometry.computeVertexNormals();
  }
  return moved;
}

/**
 * Snaps the town's walkable tops onto the single town floor height.
 * Returns the number of vertices settled, for tests and diagnostics.
 */
export function flattenWolfveilTownFloorLevels(townRoot) {
  let settled = 0;
  let canalBed = 0;
  let seated = 0;
  let tileVertices = 0;
  let raisedSurfaceVertices = 0;
  let protectedWaterTileVertices = 0;
  const coversActualWater = actualWaterFootprint(townRoot);
  townRoot?.traverse?.((node) => {
    if (!node.isMesh) return;
    if (/water|foam/i.test(node.name)) return;
    if (!FLOOR_MESH.test(node.name)) {
      seated += seatFloatingArchitecture(node) || (settleLowestBand(node) > 0 ? 1 : 0);
      return;
    }
    const position = node.geometry?.attributes?.position;
    if (!position) return;
    // All Tile_* solids have already been stripped to their REAL upper face.
    // Previous flattening only covered Y 0.6–0.8; three raised park squares
    // above this range therefore survived unchanged. Every remaining tile
    // vertex is now walkable and must sit at the town's single floor datum.
    // Other paving retains its separate material and only moves genuinely
    // horizontal elevated landing faces, not high architectural surfaces.
    const isTile = TILE_MESH.test(node.name);
    const raisedFaces = isTile ? new Set() : raisedWalkableFaceVertices(node);
    const target = FLOOR + (LAWN_MESH.test(node.name) ? LAWN_LIFT
      : PAVING_MESH.test(node.name) ? -PAVING_DROP : 0);
    let changedThisMesh = 0;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const raisedFace = raisedFaces.has(i);
      if (!isTile && !raisedFace && (y < GROUND_BAND_MIN || y > GROUND_BAND_MAX)) continue;
      const x = position.getX(i), z = position.getZ(i);
      const inCanal = x > WOLFVEIL_IMPORTED_TOWN_CANAL.minX && x < WOLFVEIL_IMPORTED_TOWN_CANAL.maxX
        && z > WOLFVEIL_IMPORTED_TOWN_CANAL.minZ && z < WOLFVEIL_IMPORTED_TOWN_CANAL.maxZ;
      if (inCanal && y <= CANAL_BED_MAX &&
          (!isTile || !coversActualWater || coversActualWater(node,position,i))) {
        canalBed++;
        if(isTile)protectedWaterTileVertices++;
        continue;
      }
      if (Math.abs(y - target) > 1e-6) {
        position.setY(i, target);
        settled++; changedThisMesh++;
        if (isTile) tileVertices++;
        if (raisedFace) raisedSurfaceVertices++;
      }
    }
    if (changedThisMesh) position.needsUpdate = true;
    node.geometry.computeVertexNormals();
    node.geometry.computeBoundingBox();
    node.geometry.computeBoundingSphere();
    node.userData.wolfveilFloorLevel = FLOOR;
  });
  return { floor: FLOOR, settled, canalBed, seated, tileVertices,
    raisedSurfaceVertices, protectedWaterTileVertices,
    verifiedWaterFootprint: Boolean(coversActualWater) };
}