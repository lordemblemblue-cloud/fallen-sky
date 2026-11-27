// Parked effect meshes in authored character GLBs (docs/GAME3D_LOW_POLY_20261122.md, part 3). The Artemis and Getsuga
// character files used as quest givers carry their ability effects (Lunar shards, Rain arrows, a summoned husky, aura
// flames, Chidori lightning, embers, debris, slash trails...) as hundreds of separate meshes "parked" at about 1/10,000
// of their size until an ability plays. A quest giver only ever plays its idle clip, so they are never seen, but each
// one is still a draw call: 132 in Artemis, 376 in Getsuga.
//
// A mesh is hidden only when it stays parked for the whole idle clip: its scale bound, taken along its parents from
// the idle clip's scale keyframes (or the node's own scale where the clip does not animate it), is below `ratio` of
// the largest bound in the model. Nothing the idle clip can show is touched. No three.js import.

function maxAbs(values) {
  let max = 0;
  for (let i = 0; i < values.length; i++) { const v = Math.abs(values[i]); if (v > max) max = v; }
  return max;
}

/** Largest |scale| component each node reaches in `clip` (by track node name). */
export function clipScaleMaxima(clip) {
  const maxima = new Map();
  for (const track of clip?.tracks || []) {
    const match = /^(.*)\.scale$/.exec(track.name || '');
    if (!match || !track.values) continue;
    maxima.set(match[1], Math.max(maxima.get(match[1]) || 0, maxAbs(track.values)));
  }
  return maxima;
}

/**
 * Hide the meshes of `model` that stay parked through `idleClip`.
 * @returns {{hidden: number, kept: number}}
 */
export function hideParkedEffectMeshes(model, idleClip, { ratio = 0.002 } = {}) {
  if (!model?.traverse) return { hidden: 0, kept: 0 };
  const animated = clipScaleMaxima(idleClip);
  const nodeScale = (node) => (animated.has(node.name)
    ? animated.get(node.name)
    : Math.max(Math.abs(node.scale?.x ?? 1), Math.abs(node.scale?.y ?? 1), Math.abs(node.scale?.z ?? 1)));
  const bound = (node) => { let s = 1; for (let n = node; n && n !== model.parent; n = n.parent) s *= nodeScale(n); return s; };
  const meshes = [];
  model.traverse((node) => { if (node.isMesh) meshes.push(node); });
  if (!meshes.length) return { hidden: 0, kept: 0 };
  const bounds = meshes.map((mesh) => bound(mesh));
  const largest = Math.max(...bounds);
  let hidden = 0;
  meshes.forEach((mesh, i) => {
    if (largest > 0 && bounds[i] < largest * ratio && mesh.visible) {
      mesh.visible = false;
      mesh.userData.parkedEffectHidden = true;
      hidden += 1;
    }
  });
  return { hidden, kept: meshes.length - hidden };
}
