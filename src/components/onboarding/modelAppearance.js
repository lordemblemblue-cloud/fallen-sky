// Surface treatment for avatar materials.
//
// Bodies carry their own authored materials; this module only answers the two
// questions the appearance pass asks: does the model own embedded face
// geometry, and does a material need the extra sheen the style presets use.
export function isHi3DAvatar(model) {
  const rigId = model?.userData?.rigId || model?.userData?.rig_id || '';
  return /hi3d|fused/i.test(String(rigId)) || Boolean(model?.userData?.hi3d);
}

// Face shape is authored as morph targets on the body, so there is no geometry
// to rebuild here; the customization pass drives those shape keys.
export function applyFaceGeometry() {
  return undefined;
}

export function applyAvatarSurface(node, material, appearance = {}, embeddedRig = false) {
  if (!material) return;
  const sheen = appearance.skin_gloss;
  if (typeof material.clearcoat === 'number' && Number.isFinite(Number(sheen))) {
    material.clearcoat = Math.min(1, Math.max(0, Number(sheen)));
  }
  if (embeddedRig && typeof material.envMapIntensity === 'number') {
    material.envMapIntensity = Math.max(material.envMapIntensity, 1);
  }
  if (node?.isMesh) {
    node.castShadow = true;
    node.receiveShadow = true;
  }
}