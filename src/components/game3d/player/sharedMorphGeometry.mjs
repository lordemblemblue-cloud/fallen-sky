// three r171 (WebGPU) builds one node shader per render-object cache key, and that key covers a geometry's attribute
// layout and morph count but not the geometry itself (RenderObject.getMaterialCacheKey/getGeometryCacheKey). MorphNode
// bakes the morph texture of the FIRST geometry built into that shared shader (MorphNode.setup -> getEntry(geometry)),
// and the texture is destroyed when that geometry is disposed. So when the player's body is swapped, a live mesh with
// the same layout (a fused-body NPC in town has the old Eve body's exact meshes) can be drawing with the old body's
// morph texture: disposing it got every frame rejected ("Destroyed texture [257x1 px, 14 layer] used in a submit",
// a black world; seen by the WebGPU session on 2026-11-23). A released body therefore keeps the morph geometries whose
// layout a live mesh shares; the GPU memory returns when the world's device is destroyed.

/** The part of three's render cache key a geometry decides, for geometries with morph targets; null otherwise. */
export function morphLayoutKey(geometry) {
  const morphs = geometry?.morphAttributes?.position?.length || geometry?.morphAttributes?.normal?.length || 0;
  if (!morphs) return null;
  const attributes = Object.keys(geometry.attributes || {}).sort().map((name) => {
    const a = geometry.attributes[name];
    return name + ':' + (a.itemSize || 0) + (a.normalized ? 'n' : '') + (a.data ? '/' + a.data.stride + '+' + (a.offset || 0) : '');
  });
  return attributes.join(',') + (geometry.index ? '|index' : '') + '|morph' + morphs;
}

/**
 * A predicate for disposeAvatarModel's keepGeometry: true for a morph geometry whose layout a mesh still in `root`
 * (the live world scene, after the old body has been taken out of it) shares.
 */
export function keepSharedMorphGeometry(root) {
  const live = new Set();
  root?.traverse?.((o) => {
    if (!o.isMesh) return;
    const key = morphLayoutKey(o.geometry);
    if (key) live.add(key);
  });
  return (geometry) => {
    const key = morphLayoutKey(geometry);
    return key !== null && live.has(key);
  };
}
