// Solid world geometry the OTS spring arm may collide with: the same terrain and
// architectural surfaces the camera already clips against, plus the town and
// village building meshes (walls). Rebuilt only when the world's mesh count
// changes, so aiming costs one raycast, not a scene walk.
export function createOTSCameraColliders({ groundMeshes = [], roots = () => [] } = {}) {
  const list = [];
  let signature = null;
  return function resolveOTSCameraColliders() {
    const rootNodes = (roots() || []).filter(Boolean);
    const next = `${groundMeshes.length}|${rootNodes
      .map((node) => `${node?.children?.length || 0}`).join(',')}`;
    if (next === signature) return list;
    signature = next;
    list.length = 0;
    list.push(...groundMeshes);
    for (const root of rootNodes) {
      root?.traverse?.((node) => {
        if (node?.isMesh && node.visible !== false && !node.userData?.otsCameraIgnore)
          list.push(node);
      });
    }
    return list;
  };
}