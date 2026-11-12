/**
 * X46-Z116 ONLY: pure geometry/instancing handoff for the existing Wolfveil
 * Game 3D renderer. This module does not register scene meshes or colliders.
 * WS15 must explicitly mount it under canonical Play after physical QA.
 */
import {
  WOLFVEIL_SQUARE_X46_Z116 as TILE,
  WOLFVEIL_X46_Z116_STYLE as ART,
} from './WolfveilSquareX46Z116.mjs';

const finite = Number.isFinite;
const TAU = Math.PI * 2;

/**
 * Nine separate, volumetric upright tapered lawn blades with 3 faces each.
 * NOT crossed textured quads. Normalized unit Y is scaled by the existing
 * instance height (0.09–0.18m). Roots remain fixed for existing wind shader.
 * Convert with THREE.BufferGeometry/Float32BufferAttribute/setIndex, then
 * reuse the existing grass material (and its installed Living Sumi-e hook).
 */
export function buildX46Z116UprightBladeBuffers() {
  const positions = [], indices = [];
  for (let blade = 0; blade < ART.bladesPerClump; blade++) {
    const col = blade % 3, row = Math.floor(blade / 3);
    // Three staggered rows, not radiating/plus-sign billboards.
    const x = (col - 1) * .30 + (row % 2 ? .035 : -.015);
    const z = (row - 1) * .27 + (col % 2 ? .025 : -.01);
    const h = .80 + (blade % 4) * .045;
    const dx = ((blade * 3) % 5 - 2) * .009;
    const dz = ((blade * 2) % 5 - 2) * .008;
    const w = .038 + (blade % 3) * .003;
    const midX = x + dx * .48, midZ = z + dz * .48;
    const base = positions.length / 3;
    positions.push(
      x - w, 0, z,
      x + w, 0, z,
      x, 0, z + w * .68,
      midX - w * .54, h * .55, midZ,
      midX + w * .54, h * .55, midZ,
      midX, h * .55, midZ + w * .37,
      x + dx, h, z + dz,
    );
    // Every side must face OUTWARD for correct vertex normals and sun/PBR
    // lighting. The old triangles were predominantly inward-wound despite
    // using DoubleSide, producing inverted per-vertex lighting on real grass.
    const rootX = (positions[base * 3] + positions[(base + 1) * 3] +
      positions[(base + 2) * 3]) / 3;
    const rootZ = (positions[base * 3 + 2] + positions[(base + 1) * 3 + 2] +
      positions[(base + 2) * 3 + 2]) / 3;
    const outwardTriangle = (a, b, c) => {
      const ax = positions[3 * a], ay = positions[3 * a + 1], az = positions[3 * a + 2];
      const bx = positions[3 * b], by = positions[3 * b + 1], bz = positions[3 * b + 2];
      const cx = positions[3 * c], cy = positions[3 * c + 1], cz = positions[3 * c + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
      const outward = nx * ((ax + bx + cx) / 3 - rootX) +
        nz * ((az + bz + cz) / 3 - rootZ);
      if (outward < 0) indices.push(a, c, b);
      else indices.push(a, b, c);
    };
    for (let face = 0; face < 3; face++) {
      const next = (face + 1) % 3;
      outwardTriangle(base + face, base + next, base + face + 3);
      outwardTriangle(base + next, base + next + 3, base + face + 3);
      outwardTriangle(base + face + 3, base + next + 3, base + 6);
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
    bladeCount: ART.bladesPerClump,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
    geometryKind: 'volumetric-3-face-tapered-upright',
    normals: 'computeVertexNormals-in-renderer',
    requiresExistingWolfveilWindMaterial: true,
  };
}

function validatePoint(p, stone) {
  // Actual blade geometry + wind stays within .11m of tuft center; retain
  // the larger radius for the low-stone geometry. Tile ownership is strict.
  const radius = stone ? p?.size + .11 : .11;
  if (!p || ![p.x, p.y, p.z, p.yaw, radius].every(finite) ||
    p.yaw < 0 || p.yaw >= TAU || radius <= 0 ||
    p.x - radius <= TILE.minX || p.x + radius >= TILE.maxX ||
    p.z - radius <= TILE.minZ || p.z + radius >= TILE.maxZ) {
    throw new RangeError('X46-Z116 visual candidate escapes tile or has invalid coordinates');
  }
  if (stone) {
    if (!finite(p.size) || p.size < .11 || p.size > .19 ||
      !Number.isInteger(p.shade) || p.shade < 0 || p.shade >= ART.stoneColors.length)
      throw new RangeError('X46-Z116 stone size/palette invalid');
  } else if (!finite(p.width) || !finite(p.height) ||
      p.width < ART.grassClumpWidthM[0] || p.width >= ART.grassClumpWidthM[1] ||
      p.height < ART.grassHeightM[0] || p.height >= ART.grassHeightM[1] ||
      !Number.isInteger(p.shade) || p.shade < 0 || p.shade >= ART.grassColors.length) {
    throw new RangeError('X46-Z116 lawn height/width/palette invalid');
  }
}

/**
 * Transform instructions in LOCAL Wolfveil coordinates. The actual world
 * root adds +70m Z once: worldZ is AUDIT ONLY, not a second translation.
 * No new tree, material, collider or runtime scene activation is produced.
 */
export function prepareX46Z116VisualBatches(plan) {
  if (!plan || plan.id !== TILE.id || plan.renderOffsetZ !== TILE.renderOffsetZ ||
      !Array.isArray(plan.grass) || !Array.isArray(plan.stones) ||
      !Array.isArray(plan.trees) || plan.trees.length ||
      plan.visualOnly !== true || plan.terrainChanged !== false ||
      plan.collisionChanged !== false || plan.mountedInPlay !== false ||
      plan.grass.length > 1800 || plan.stones.length > 3)
    throw new TypeError('X46-Z116 requires an unmounted, visual-only tile plan');
  const grassGeometry=buildX46Z116UprightBladeBuffers();
  // All blades stay in this one 5m tile even under the existing shared
  // high-gust shader and TWO simultaneous player-contact traces. Displacements
  // are in blade-local units BEFORE instance width scale is applied.
  // This is a geometry envelope, NOT a claim that 3-6 simultaneous traces,
  // GPU lighting, or multiplayer have been independently certified.
  let radial=0;
  for(let i=0;i<grassGeometry.positions.length;i+=3)
    radial=Math.max(radial,Math.hypot(
      grassGeometry.positions[i],grassGeometry.positions[i+2]));
  const twoContactEnvelope=radial+.195+.72;
  const grass = plan.grass.map(p => {
    validatePoint(p, false);
    const edge=Math.min(
      p.x-TILE.minX,TILE.maxX-p.x,p.z-TILE.minZ,TILE.maxZ-p.z);
    const safeWidth=Math.min(p.width,(edge-.005)/twoContactEnvelope);
    if(safeWidth<ART.grassClumpWidthM[0])
      throw new RangeError('X46-Z116 candidate too near edge for animated grass');
    return {x:p.x,y:p.y,z:p.z,worldZ:p.z + TILE.renderOffsetZ,
      yaw:p.yaw,scaleX:safeWidth,scaleY:p.height,scaleZ:safeWidth,
      color:ART.grassColors[p.shade]};
  });
  const stones = plan.stones.map(p => {
    validatePoint(p, true);
    return {x:p.x,y:p.y,z:p.z,worldZ:p.z + TILE.renderOffsetZ,
      yaw:p.yaw,size:p.size,color:ART.stoneColors[p.shade]};
  });
  return {
    tile:TILE.id,grass,stones,
    grassGeometry,
    grassMaterialFamily:'existing-Wolfveil-Sumi-e-grass',
    stoneMaterialFamily:'existing-Wolfveil-mossy-stone',
    woodTexturePolicy:'preserve-existing-authoritative-tree-UV-and-bark',
    renderRootOffsetZ:TILE.renderOffsetZ,
    coordinateSpace:'authored-Wolfveil-local',
    sceneMounted:false, collidersAdded:0, terrainModified:false,
    requiresWS15Integration:true,
  };
}
