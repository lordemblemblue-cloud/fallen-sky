// Counted inventory of what a Game 3D scene draws: triangles, draw calls and textures per object, grouped by the
// named object that owns them. A developer tool (docs/GAME3D_LOW_POLY_20261122.md): it counts the scene graph as
// built and draws nothing. No three.js import, so node tests can run it on any scene-like tree.
//
// In the browser (dev server): const m = await import('/src/components/game3d/performance/Game3DSceneInventory.mjs');
// m.inventoryGame3DScene(window.__gw3dScene, { camera: window.__gw3dCamera })
//
// Counting rules (the same ones renderer.info uses for one plain pass):
// - triangles = index count / 3 (or position count / 3), times the instance count of an InstancedMesh;
// - draw calls = one per material group drawn (geometry.groups with a material, or 1), per mesh;
// - a mesh counts only when it and every parent are visible and its layers meet the camera's layers.

const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap',
  'bumpMap', 'displacementMap', 'lightMap', 'specularMap', 'envMap', 'gradientMap', 'clearcoatNormalMap'];

function visibleInScene(object, cameraLayers) {
  for (let node = object; node; node = node.parent) if (node.visible === false) return false;
  if (cameraLayers != null && object.layers && (object.layers.mask & cameraLayers) === 0) return false;
  return true;
}

function meshTriangles(mesh) {
  const g = mesh.geometry;
  if (!g) return 0;
  const drawCount = g.drawRange && Number.isFinite(g.drawRange.count) ? g.drawRange.count : Infinity;
  const base = g.index ? g.index.count : (g.attributes?.position?.count ?? 0);
  let tris = Math.floor(Math.min(base, drawCount) / 3);
  if (mesh.isPoints || mesh.isLine) tris = 0;
  if (mesh.isInstancedMesh) tris *= Math.max(0, mesh.count ?? 0);
  if (mesh.isBatchedMesh) tris = Math.floor((mesh._multiDrawCounts ? [...mesh._multiDrawCounts].slice(0, mesh._multiDrawCount).reduce((a, b) => a + b, 0) : base) / 3);
  return tris;
}

function meshDrawCalls(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = mesh.geometry?.groups;
  if (Array.isArray(mesh.material) && groups?.length) return groups.filter((g) => materials[g.materialIndex ?? 0]).length;
  if (mesh.isInstancedMesh && (mesh.count ?? 0) === 0) return 0;
  return materials.filter(Boolean).length ? 1 : 0;
}

function textureInfo(texture) {
  const image = texture?.image ?? texture?.source?.data;
  const w = image?.width ?? image?.videoWidth ?? 0;
  const h = image?.height ?? image?.videoHeight ?? 0;
  return { uuid: texture.uuid, name: texture.name || '', w, h, bytes: w * h * 4 };
}

/** The first named ancestor below the scene and the next named one: the owner of a mesh for grouping. */
function ownerPath(object, depth) {
  const names = [];
  for (let node = object.parent; node && node.parent; node = node.parent) if (node.name) names.push(node.name);
  names.reverse();
  return names.slice(0, depth).join(' / ') || '(scene)';
}

/**
 * @returns {{totals, groups: Array<{owner, meshes, triangles, drawCalls, textures, textureBytes, names}>}}
 */
export function inventoryGame3DScene(scene, { camera = null, depth = 2, onlyVisible = true, groupBy = null } = {}) {
  const cameraLayers = camera?.layers?.mask ?? null;
  const groups = new Map();
  const allTextures = new Map();
  const totals = { meshes: 0, triangles: 0, drawCalls: 0, textures: 0, textureBytes: 0 };
  scene.traverse((object) => {
    if (!(object.isMesh || object.isInstancedMesh || object.isBatchedMesh || object.isSkinnedMesh)) return;
    if (onlyVisible && !visibleInScene(object, cameraLayers)) return;
    const owner = groupBy ? groupBy(object) : ownerPath(object, depth);
    let entry = groups.get(owner);
    if (!entry) { entry = { owner, meshes: 0, triangles: 0, drawCalls: 0, textures: new Map(), names: new Map() }; groups.set(owner, entry); }
    const tris = meshTriangles(object);
    const calls = meshDrawCalls(object);
    entry.meshes += 1; entry.triangles += tris; entry.drawCalls += calls;
    totals.meshes += 1; totals.triangles += tris; totals.drawCalls += calls;
    const key = object.name || '(unnamed)';
    const named = entry.names.get(key) || { name: key, meshes: 0, triangles: 0, drawCalls: 0, instanced: Boolean(object.isInstancedMesh) };
    named.meshes += 1; named.triangles += tris; named.drawCalls += calls;
    entry.names.set(key, named);
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material) continue;
      for (const k of TEXTURE_KEYS) {
        const t = material[k];
        if (!t?.isTexture) continue;
        const info = textureInfo(t);
        entry.textures.set(info.uuid, info);
        allTextures.set(info.uuid, info);
      }
    }
  });
  for (const t of allTextures.values()) { totals.textures += 1; totals.textureBytes += t.bytes; }
  const list = [...groups.values()].map((g) => ({
    owner: g.owner, meshes: g.meshes, triangles: g.triangles, drawCalls: g.drawCalls,
    textures: [...g.textures.values()].map((t) => `${t.name || t.uuid.slice(0, 8)} ${t.w}x${t.h}`),
    textureBytes: [...g.textures.values()].reduce((a, t) => a + t.bytes, 0),
    names: [...g.names.values()].sort((a, b) => b.triangles - a.triangles),
  })).sort((a, b) => b.triangles - a.triangles);
  return { totals, groups: list };
}

/**
 * Materials a WebGPURenderer cannot draw as the classic renderer does:
 * - 'glsl-only': a ShaderMaterial / RawShaderMaterial with no registered node twin (lib/webgpuMaterialTwins.js);
 * - 'glsl-hook-only': a custom onBeforeCompile (own property) and no TSL nodes attached (lib/webgpuNodeKit.js
 *   attachNodes sets __sceneNodeKey), so WebGPU draws the plain material without the hook's effect.
 * Pass the page's own hasNodeTwin: import('/src/lib/webgpuMaterialTwins.js').
 */
export function auditWebGPUMaterials(scene, { camera = null, hasNodeTwin = () => false, onlyVisible = true } = {}) {
  const cameraLayers = camera?.layers?.mask ?? null;
  const found = new Map();
  scene.traverse((object) => {
    if (!object.material) return;
    if (onlyVisible && !visibleInScene(object, cameraLayers)) return;
    for (const m of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!m) continue;
      let issue = null;
      if ((m.isShaderMaterial || m.isRawShaderMaterial) && !hasNodeTwin(m)) issue = 'glsl-only';
      else if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') && !m.__sceneNodeKey && !m.isNodeMaterial && !hasNodeTwin(m)) issue = 'glsl-hook-only';
      if (!issue) continue;
      const key = `${issue}|${m.type}|${m.name || ''}`;
      const entry = found.get(key) || { issue, type: m.type, material: m.name || '', meshes: 0, examples: [] };
      entry.meshes += 1;
      if (entry.examples.length < 4) entry.examples.push(object.name || object.parent?.name || '(unnamed)');
      found.set(key, entry);
    }
  });
  return [...found.values()].sort((a, b) => b.meshes - a.meshes);
}

/** Compact rows for printing: owner, meshes, triangles, draw calls, texture MB, top names. */
export function inventoryRows(inventory, { top = 40, names = 3 } = {}) {
  return inventory.groups.slice(0, top).map((g) => ({
    owner: g.owner.slice(0, 90), meshes: g.meshes, tris: g.triangles, calls: g.drawCalls,
    texMB: Math.round(g.textureBytes / 1048576 * 10) / 10,
    top: g.names.slice(0, names).map((n) => `${n.name}${n.instanced ? '[i]' : ''}:${n.triangles}`).join(', '),
  }));
}
