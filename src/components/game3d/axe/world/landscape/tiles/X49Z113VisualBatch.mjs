/**
 * Optional visual-only adapter for the claimed Wolfveil Play tile X49-Z113.
 * WS15 must explicitly call this from the existing +70m scene; this module
 * deliberately does not activate itself or import/modify shared render code.
 * The original terrain collider, trees, weather material and owner textures
 * are completely unaffected. One InstancedMesh per decorative material.
 */
export const X49_Z113_VISUAL_BATCH_ID = 'X49-Z113';
const LIMITS = Object.freeze({minX: -305, maxX: -300, minZ: 15, maxZ: 20});
const finite = Number.isFinite;
// Each Play world may mount this claimed square at most once. Avoid stacked
// grass/rock batches when a UI or hot reload calls the integration twice.
const mountedWorlds = new WeakSet();
// WolfveilGroundCover.js's EXISTING grass shader moves tips in local space:
// wind: (0.035 + 0.16 * clamp(gust, 0, 1)); up to six footstep
// contacts: 0.36 * clamp(pressure, 0, 1) EACH. Since shaders offset
// vertices before instancing, scale their maximum combined movement too.
// This worst-case envelope prevents animated grass spilling into an adjacent
// agent-owned square. Revalidate when the shared shader constants change.
export const X49_Z113_MAX_TIP_SWAY_LOCAL = .035 + .16 + 6 * .36;

function vertexRadius(geometryRecipe) {
  const positions = geometryRecipe?.positions;
  if (!Array.isArray(positions) || !positions.length || positions.length % 3 !== 0 ||
    !Array.isArray(geometryRecipe?.indices) ||
    geometryRecipe.indices.length === 0 || geometryRecipe.indices.length % 3 !== 0)
    throw new TypeError('Invalid triangle mesh recipe');
  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (![x, y, z].every(finite)) throw new RangeError('Nonfinite geometry');
    radius = Math.max(radius, Math.hypot(x, z));
  }
  if (!(radius > 0)) throw new RangeError('Degenerate mesh recipe');
  for (const index of geometryRecipe.indices) {
    if (!Number.isInteger(index) || index < 0 || index >= positions.length / 3)
      throw new RangeError('Out-of-bounds triangle index');
  }
  return radius;
}

// Metadata alone does not guarantee real 3D lawn blades: an asset exporter
// could label nine overlapping '+' cards as volumetric and still pass counts.
// Verify each authored seven-vertex blade has three noncollinear ground roots,
// three noncollinear elevated shoulders, and one higher tip. This is purely
// tile-local recipe validation and does not touch any shared vegetation mesh.
function assertVolumetricRoots(recipe) {
  const vertices = recipe.positions;
  const at = (i, component) => vertices[i * 3 + component];
  const areaXZ = start =>
    Math.abs((at(start + 1, 0) - at(start, 0)) *
      (at(start + 2, 2) - at(start, 2)) -
      (at(start + 1, 2) - at(start, 2)) *
      (at(start + 2, 0) - at(start, 0)));
  for (let blade = 0; blade < 9; blade++) {
    const i = blade * 7;
    const mid = at(i + 3, 1);
    if (Math.abs(at(i, 1)) > 1e-5 ||
        Math.abs(at(i + 1, 1)) > 1e-5 ||
        Math.abs(at(i + 2, 1)) > 1e-5 ||
        areaXZ(i) < 1e-5 || areaXZ(i + 3) < 1e-5 ||
        !(mid > .1 && mid < 1) ||
        Math.abs(at(i + 4, 1) - mid) > 1e-5 ||
        Math.abs(at(i + 5, 1) - mid) > 1e-5 ||
        !(at(i + 6, 1) > mid && at(i + 6, 1) <= 1.1))
      throw new RangeError('Crossed/flat or unrooted grass cannot replace 3D blades');
  }
}

// The canonical meshes are not arbitrary sets of triangles. A replacement
// with 81 nominal triangles can still be invisible if every index references
// one vertex, or if winding is reversed. Require the original face wiring.
function assertCanonicalFaces(grassRecipe, stoneRecipe) {
  const grassExpected = [];
  for (let blade = 0; blade < 9; blade++) {
    const base = blade * 7;
    for (let side = 0; side < 3; side++) {
      const next = (side + 1) % 3;
      grassExpected.push(
        base + side, base + next, base + 3 + side,
        base + next, base + 3 + next, base + 3 + side,
        base + 3 + side, base + 3 + next, base + 6,
      );
    }
  }
  const stoneExpected = [];
  for (let i = 0; i < 9; i++) {
    const j = (i + 1) % 9;
    stoneExpected.push(
      i, i + 9, j, j, i + 9, j + 9, i + 9, 18, j + 9,
    );
  }
  const same = (actual, expected) =>
    actual.length === expected.length &&
    expected.every((index, position) => actual[position] === index);
  if (!same(grassRecipe.indices, grassExpected) ||
      !same(stoneRecipe.indices, stoneExpected))
    throw new RangeError('Wrong X49-Z113 grass or stone triangle topology');
}

const within = p => finite(p?.x) && finite(p?.y) && finite(p?.z) &&
  p.x >= LIMITS.minX && p.x < LIMITS.maxX &&
  p.z >= LIMITS.minZ && p.z < LIMITS.maxZ &&
  p.worldZ === p.z + 70 && p.collision === false;

function meshGeometry(THREE, recipe) {
  const g = new THREE.BufferGeometry();
  try {
    g.setAttribute('position', new THREE.Float32BufferAttribute(recipe.positions, 3));
    g.setIndex(recipe.indices);
    g.computeVertexNormals();
    return g;
  } catch (error) {
    g.dispose?.();
    throw error;
  }
}

/**
 * Call only from the Game 3D +70m Wolfveil ground-cover integration lane.
 * Existing owned grass/rock PBR materials are injected and reused, never
 * renamed or replaced; they retain their original wind and weather shader.
 * Geometry is local Z: the parent world.group translates it exactly once.
 * Returns null unless explicitly enabled (Game 1 / editor remain untouched).
 */
export function mountX49Z113VisualBatch({
  enabled = false, THREE, world, plan, grassRecipe, stoneRecipe,
  grassMaterial, stoneMaterial, parentWorldZOffset,
} = {}) {
  if (!enabled) return null;
  if (!THREE?.BufferGeometry || !THREE?.Float32BufferAttribute ||
      !THREE?.InstancedMesh || !THREE?.Object3D || !THREE?.Color ||
      typeof world?.mesh !== 'function' || !Array.isArray(world.ownedMaterials) ||
      !world.group || !Array.isArray(world.meshes))
    throw new TypeError('Explicit existing Three.js world is required');
  // Actual scene identity and transform must match the authoritative
  // unscaled Wolfveil local layout. A rotated/scaled parent invalidates the
  // strict five-metre footprint even if its Z translation is exactly +70.
  const group = world.group;
  const identityTransform =
    group?.userData?.environment === 'wolfveil' &&
    group.position?.x === 0 && group.position?.y === 0 &&
    group.position?.z === 70 &&
    group.rotation?.x === 0 && group.rotation?.y === 0 &&
    group.rotation?.z === 0 &&
    group.scale?.x === 1 && group.scale?.y === 1 && group.scale?.z === 1;
  if (!identityTransform || parentWorldZOffset !== 70 ||
      plan?.tileId !== X49_Z113_VISUAL_BATCH_ID ||
      plan?.mounted !== false || plan?.decorativeOnly !== true ||
      plan?.altersTerrainHeight !== false ||
      !Array.isArray(plan.grass) || !Array.isArray(plan.rocks) ||
      !plan.style?.grass?.albedoHex || !plan.style?.stone?.albedoHex ||
      plan.bounds?.minX !== LIMITS.minX || plan.bounds?.maxX !== LIMITS.maxX ||
      plan.bounds?.minZ !== LIMITS.minZ || plan.bounds?.maxZ !== LIMITS.maxZ)
    throw new RangeError('Wrong tile, world offset or unsafe visual plan');
  // WeakSet alone resets during Vite hot-module reload while the real
  // WolfveilBuilder meshes array survives. Inspect the authoritative world
  // registry so remounting cannot stack duplicate grass or stone geometry.
  if (mountedWorlds.has(world) || world.meshes.some(mesh =>
      mesh?.userData?.tileId === X49_Z113_VISUAL_BATCH_ID))
    throw new Error('X49-Z113 already mounted in this world');
  if (plan.grass.length > 576 || plan.rocks.length > 3)
    throw new RangeError('Exceeded X49-Z113 tile vegetation limits');
  if (!world.ownedMaterials.includes(grassMaterial) ||
      !world.ownedMaterials.includes(stoneMaterial) ||
      grassMaterial?.name !== 'Wolfveil_IndividualCurvedGrassBladeClusters' ||
      stoneMaterial?.name !== 'Wolfveil_WeatheredPathEdgeStone' ||
      typeof grassMaterial?.onBeforeCompile !== 'function' ||
      typeof grassMaterial?.customProgramCacheKey !== 'function' ||
      grassMaterial.customProgramCacheKey() !== 'wolfveil-sumie-tip-sway-contact-recovery-v2')
    throw new TypeError('Exact existing Wolfveil Sumi-e PBR shader and materials are required');
  // Fail closed if an integration caller substitutes flat '+' billboard
  // cards, excessive triangles, or a non-canonical giant stone recipe.
  // The exact owned geometry limits are nine rooted 3-sided blades and
  // the existing low nine-segment irregular stone shell, respectively.
  if (grassRecipe?.bladeCount !== 9 || grassRecipe?.verticesPerBlade !== 7 ||
      grassRecipe?.facesPerBlade !== 9 || grassRecipe?.noCrossCards !== true ||
      grassRecipe?.rootAnchored !== true ||
      grassRecipe?.purelyDecorative !== true ||
      grassRecipe?.positions?.length !== 9 * 7 * 3 ||
      grassRecipe?.indices?.length !== 9 * 9 * 3 ||
      stoneRecipe?.segments !== 9 || stoneRecipe?.normalized !== true ||
      stoneRecipe?.positions?.length !== 19 * 3 ||
      stoneRecipe?.indices?.length !== 9 * 9)
    throw new RangeError('Non-canonical X49-Z113 grass/stone geometry or GPU triangle budget');
  const grassRadius = vertexRadius(grassRecipe);
  const stoneRadius = vertexRadius(stoneRecipe);
  // Canonical raw recipes are normalized to small root-near-zero shapes.
  // A malicious/accidentally un-normalized import can otherwise declare the
  // correct topology but scale everything down to invisible subpixel grass.
  // These bounds encompass the real original geometry (.307m / 1.000m).
  if (grassRadius < .25 || grassRadius > .40 ||
      stoneRadius < .90 || stoneRadius > 1.10 ||
      grassRecipe.positions.some((v, i) => i % 3 === 1 && (v < 0 || v > 1.05)) ||
      stoneRecipe.positions.some((v, i) => i % 3 === 1 && (v < -.10 || v > 1.05)))
    throw new RangeError('X49-Z113 grass/stone mesh normalization drift');
  assertVolumetricRoots(grassRecipe);
  assertCanonicalFaces(grassRecipe, stoneRecipe);
  for (const p of [...plan.grass, ...plan.rocks]) if (!within(p))
    throw new RangeError('Placement crosses exclusive tile or duplicates +70m offset');
  for (const p of plan.grass) if (!finite(p.yaw) || !finite(p.opacity) ||
      p.opacity <= 0 || p.opacity > 1 || !finite(p.height) || p.height < .075 ||
      p.height > .13 || !Number.isInteger(p.shade) || p.shade < 0 ||
      p.shade >= plan.style.grass.albedoHex.length)
    throw new RangeError('Unsafe grass size or palette index');
  for (const p of plan.rocks) if (!finite(p.yaw) || !finite(p.height) || p.height <= 0 ||
      !finite(p.radius) || p.radius <= 0 || !Number.isInteger(p.shade) ||
      p.shade < 0 || p.shade >= plan.style.stone.albedoHex.length)
    throw new RangeError('Unsafe stone size or palette index');
  const dummy = new THREE.Object3D();
  const meshes = [];
  const build = (items, recipe, material, family, colors) => {
    if (!items.length) return null;
    const geometry = meshGeometry(THREE, recipe);
    let mesh;
    try {
      mesh = new THREE.InstancedMesh(geometry, material, items.length);
    } catch (error) {
      geometry.dispose?.();
      throw error;
    }
    // Record the mesh before per-instance work so any upload/attribute error
    // also rolls back all buffers, not just objects already in world.mesh().
    meshes.push(mesh);
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      // Limit the ENTIRE transformed geometry, including the shared shader's
      // maximum wind + six footstep pushes, to the owned five metres. Wind
      // displacements precede instanceMatrix in the existing shader.
      const edge = Math.min(p.x - LIMITS.minX, LIMITS.maxX - p.x,
        p.z - LIMITS.minZ, LIMITS.maxZ - p.z);
      const isGrass = family === 'Grass';
      const radius = (isGrass ? grassRadius : stoneRadius) +
        (isGrass ? X49_Z113_MAX_TIP_SWAY_LOCAL : 0);
      // Alpha is not an instance attribute on standard PBR; physically thin
      // feathered edge clumps instead of silently ignoring edgeBlend opacity.
      const intendedRadius = isGrass ? Math.sqrt(p.opacity) : p.radius;
      const horizontalScale = Math.min(intendedRadius,
        Math.max(0, edge - .0001) / radius);
      if (!(horizontalScale > 0)) throw new RangeError('No tile-local footprint');
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(horizontalScale, p.height, horizontalScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(colors[p.shade]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    // The original grass material animates vertices in the GPU shader.
    // InstancedMesh's CPU bounding sphere cannot account for that motion:
    // prevent one-square grass from popping out at the camera frustum edge.
    // Two instanced draw calls maximum, no global renderer changes.
    mesh.frustumCulled = false;
    mesh.name = `SWV_X49Z113_LivingSumiE_${family}`;
    mesh.userData = {decorativeOnly: true, nonCollider: true,
      tileId: X49_Z113_VISUAL_BATCH_ID, worldOffsetAlreadyApplied: false};
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.raycast = () => {};
    return mesh;
  };
  // Treat geometry creation, instancing, and scene registration as ONE
  // transaction. Failure before world.mesh() must also release geometries.
  let grass, stones;
  try {
    grass = build(plan.grass, grassRecipe, grassMaterial,
      'Grass', plan.style.grass.albedoHex);
    stones = build(plan.rocks, stoneRecipe, stoneMaterial,
      'Stone', plan.style.stone.albedoHex);
    for (const mesh of meshes) world.mesh(mesh);
  } catch (error) {
    for (const mesh of meshes) {
      try { world.group.remove?.(mesh); } catch { /* preserve original error */ }
      const index = world.meshes.indexOf(mesh);
      if (index >= 0) world.meshes.splice(index, 1);
      try { mesh.geometry.dispose?.(); } catch { /* preserve original error */ }
    }
    throw error;
  }
  // A temporarily unavailable canonical surface can produce an empty plan.
  // Do not permanently consume this world's one permitted mount until actual
  // tile geometry exists; a later, valid sampler must be able to retry.
  if (meshes.length) mountedWorlds.add(world);
  return Object.freeze({
    tileId: X49_Z113_VISUAL_BATCH_ID,
    grassClumps: plan.grass.length,
    stones: plan.rocks.length,
    meshes: Object.freeze(meshes),
    grass, stoneMesh: stones,
    decorativeOnly: true, collisionChanged: false, terrainChanged: false,
    originAtMarketOnly: true,
  });
}
