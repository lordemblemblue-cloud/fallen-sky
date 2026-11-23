// Low-poly world (docs/GAME3D_LOW_POLY_20261122.md): the plaza's town buildings are low in triangles but were drawn
// as ~350 separate meshes (boxes, cylinders and trims nested in sub-groups, which AXETownPlaza.js's per-group
// batcher leaves alone when a group has fewer than four meshes of one material). This pass merges every unchanging
// mesh into one mesh per material inside its nearest "boundary": the town group itself, or any object the town moves,
// hides or animates after it is built (rooms and their distance proxies, roofs, ceilings, the blacksmith facade, the
// stall gates, lanterns, noren pivots, mounts, the augment core, the barding hoist, and every animated mesh).
// Merging never crosses a boundary, so each one keeps moving, swaying and switching as before with its contents.
//
// Only plain meshes merge: one opaque material, no instancing / skinning / morph targets, visible, no user data other
// than otsCameraIgnore, no own onBeforeRender or raycast override, and not mirrored. Meshes merge only with meshes
// that share the material and every per-mesh draw setting (shadows, render order, layers, culling, camera flag).
// No three.js import: the caller passes THREE and mergeGeometries (node tests use the same function).

const ALLOWED_USERDATA = new Set(['otsCameraIgnore']);

function plainUserData(object) {
  return Object.keys(object.userData || {}).every((key) => ALLOWED_USERDATA.has(key));
}

function attributeSignature(geometry) {
  return Object.keys(geometry.attributes).sort().map((name) => {
    const a = geometry.attributes[name];
    return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array?.constructor?.name}`;
  }).join(',');
}

/**
 * @param {object} root the town group
 * @param {{THREE, mergeGeometries, boundaries: Iterable<object>, skip?: Set<object>, sharedGeometries?: Set<object>,
 *   name?: string}} options
 * @returns {{meshesBefore: number, meshesAfter: number, merged: number, batches: number}}
 */
export function mergeStaticTownTree(root, { THREE, mergeGeometries, boundaries = [], skip = new Set(), sharedGeometries = new Set(), name = 'AXE_StaticTownMerge' } = {}) {
  const boundary = new Set([...boundaries].filter(Boolean));
  boundary.add(root);
  root.updateMatrixWorld(true);
  const defaultRaycast = THREE.Mesh.prototype.raycast;
  let meshesBefore = 0;
  root.traverse((o) => { if (o.isMesh) meshesBefore++; });

  const containerOf = (object) => {
    for (let node = object.parent; node; node = node.parent) {
      if (boundary.has(node)) return node;
      if (node.visible === false) return null; // inside something hidden: it may be switched on, leave it alone
    }
    return null;
  };

  const buckets = new Map();
  const inverse = new THREE.Matrix4();
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.isBatchedMesh) return;
    if (boundary.has(mesh) || skip.has(mesh) || !mesh.visible) return;
    const material = mesh.material;
    const geometry = mesh.geometry;
    if (!material || Array.isArray(material) || material.transparent || !geometry?.attributes?.position) return;
    if (Object.keys(geometry.morphAttributes || {}).length) return;
    if (!plainUserData(mesh) || Object.prototype.hasOwnProperty.call(mesh, 'onBeforeRender')) return;
    if (mesh.raycast !== defaultRaycast) return;
    const container = containerOf(mesh);
    if (!container) return;
    inverse.copy(container.matrixWorld).invert();
    const relative = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
    if (relative.determinant() <= 0) return; // mirrored: merged triangles would face the wrong way
    const key = [container.uuid, material.uuid, geometry.index ? 'i' : 'n', attributeSignature(geometry),
      mesh.castShadow ? 1 : 0, mesh.receiveShadow ? 1 : 0, mesh.userData?.otsCameraIgnore ? 1 : 0,
      mesh.renderOrder, mesh.layers.mask, mesh.frustumCulled ? 1 : 0].join('|');
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { container, material, mesh, items: [] }; buckets.set(key, bucket); }
    bucket.items.push({ mesh, relative });
  });

  let merged = 0; let batches = 0;
  const released = new Set();
  for (const bucket of buckets.values()) {
    if (bucket.items.length < 2) continue;
    const parts = bucket.items.map(({ mesh, relative }) => {
      const g = mesh.geometry.clone();
      g.clearGroups();
      g.applyMatrix4(relative);
      return g;
    });
    const joined = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!joined) continue;
    const first = bucket.mesh;
    const out = new THREE.Mesh(joined, bucket.material);
    out.name = name;
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.renderOrder = first.renderOrder;
    out.layers.mask = first.layers.mask;
    out.frustumCulled = first.frustumCulled;
    if (first.userData?.otsCameraIgnore) out.userData.otsCameraIgnore = true;
    bucket.container.add(out);
    for (const { mesh } of bucket.items) {
      mesh.parent?.remove(mesh);
      released.add(mesh.geometry);
    }
    merged += bucket.items.length; batches += 1;
  }
  // free merged-away geometries nothing else draws (shared cached boxes stay)
  const live = new Set();
  root.traverse((o) => { if (o.geometry) live.add(o.geometry); });
  for (const g of released) if (!live.has(g) && !sharedGeometries.has(g)) g.dispose();

  let meshesAfter = 0;
  root.traverse((o) => { if (o.isMesh) meshesAfter++; });
  return { meshesBefore, meshesAfter, merged, batches };
}
