// Draw-call budget for the local player's avatar (docs/game3d/AVATAR_DRAW_CALLS.md).
//
// The avatar GLBs carry their skill effects as hundreds of rigid meshes (Getsuga Tensho's flames,
// embers, rocks, cracks and wave; Chidori's lightning) parked at a scale of 0.0001 or 0.001 until an
// effect clip grows them. three.js still draws a mesh that small, and draws its shadow: at rest the
// male avatar's 376 effect meshes (125 of them twice) were 501 of its 519 draw calls.
//
// update(), called once a frame before rendering, takes every rigid avatar mesh whose world size is
// under COLLAPSED_RADIUS_M off the render layers, and puts it back the frame a clip grows it. It reads
// local scales, which the mixers have already set this frame (matrixWorld is only refreshed inside
// render()). `visible` is never touched: the game loop, the appearance code (hood, weapon) and the
// creator layers own it. Skinned meshes are left alone.
//
// It also draws the effect meshes' materials in one pass (forceSinglePass). three.js otherwise draws a
// transparent double-sided material twice, back faces then front faces. Same-frame renders of the
// Getsuga Tensho and Chidori clips differ by at most 13/255 in one pass, so the effects keep their look
// for about 100 fewer draw calls at the peak of a cast. Skinned meshes keep both passes: the energy
// blade, drawn in one pass, shows its inner faces as stripes. Creator layers and surface overlays
// (customizationRuntime.js) are skipped whenever they load. setEnabled(false) and dispose() put every
// mask and flag back.

// A bounding sphere 4 mm across is about 2 pixels at 1080p from 2 m away, and under one from the usual
// 4 m or more. Parked effects rest at 0.001 to 1.7 mm (Artemis's Husky impact ring is the largest).
export const COLLAPSED_RADIUS_M = 0.002;

// An upper bound on the mesh's world-space bounding radius: the product of each ancestor's largest scale.
export function worldRadius(mesh) {
  const geometry = mesh.geometry;
  if (!geometry) return Infinity;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  let scale = 1;
  for (let node = mesh; node; node = node.parent) {
    const s = node.scale;
    scale *= Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
  }
  return geometry.boundingSphere.radius * scale;
}

const materialsOf = (mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean);
const isCreatorPart = (node) => !!(node.userData?.creatorLayerRoot || node.userData?.creatorLayer || node.userData?.customizationSurface);

export function createAvatarDrawCalls(model, { enabled = true } = {}) {
  const rigid = [];
  const skinnedMaterials = new Set();
  const visit = (node) => {
    if (isCreatorPart(node)) return;
    if (node.isSkinnedMesh) materialsOf(node).forEach((material) => skinnedMaterials.add(material));
    else if (node.isMesh) rigid.push({ mesh: node, mask: 0, culled: false });
    node.children.forEach(visit);
  };
  visit(model);
  const ownSinglePass = new Map();
  rigid.forEach(({ mesh }) => materialsOf(mesh).forEach((material) => {
    if (!skinnedMaterials.has(material) && !ownSinglePass.has(material)) ownSinglePass.set(material, material.forceSinglePass);
  }));
  let on = false;
  let culledCount = 0;

  const show = (entry) => {
    // Someone else may have set the layers while it was hidden; theirs wins.
    if (entry.mesh.layers.mask === 0) entry.mesh.layers.mask = entry.mask;
    entry.culled = false;
    culledCount -= 1;
  };

  const update = () => {
    if (!on) return;
    for (const entry of rigid) {
      const collapsed = worldRadius(entry.mesh) < COLLAPSED_RADIUS_M;
      if (collapsed && !entry.culled) {
        entry.mask = entry.mesh.layers.mask;
        entry.mesh.layers.mask = 0;
        entry.culled = true;
        culledCount += 1;
      } else if (!collapsed && entry.culled) show(entry);
    }
  };

  const setEnabled = (value) => {
    const next = !!value;
    if (next === on) { update(); return; }
    on = next;
    if (on) {
      ownSinglePass.forEach((_, material) => { material.forceSinglePass = true; });
      update();
    } else {
      rigid.forEach((entry) => { if (entry.culled) show(entry); });
      ownSinglePass.forEach((own, material) => { material.forceSinglePass = own; });
    }
  };

  setEnabled(enabled);
  return {
    model,
    update,
    setEnabled,
    isEnabled: () => on,
    stats: () => ({ enabled: on, rigidMeshes: rigid.length, culled: culledCount, materials: ownSinglePass.size }),
    dispose: () => setEnabled(false),
  };
}
