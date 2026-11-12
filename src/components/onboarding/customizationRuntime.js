// Applies a saved appearance to a loaded avatar: creator shape keys, material
// colours and per-mesh tints. One runtime instance per model so the previous
// values can be restored when a model is disposed.
const HEX = /^#[0-9a-f]{6}$/i;

function setColor(material, value) {
  if (HEX.test(String(value || '')) && material?.color) material.color.set(value);
}

function applyMorphs(model, config) {
  const shapes = config?.shapes && typeof config.shapes === 'object' ? config.shapes : {};
  const morphs = config?.morph_targets && typeof config.morph_targets === 'object' ? config.morph_targets : {};
  model.traverse((node) => {
    if (!node.isMesh || !node.morphTargetDictionary) return;
    Object.entries(node.morphTargetDictionary).forEach(([name, index]) => {
      if (!name.startsWith('CC_')) return;
      const key = `${node.name}:${name}`;
      const value = morphs[key] ?? shapes[name.replace(/^CC_/, '').toLowerCase()];
      if (Number.isFinite(Number(value))) node.morphTargetInfluences[index] = Number(value);
    });
  });
}

export function applyCustomizationAppearance(model, appearance = {}) {
  if (!model) return;
  applyMorphs(model, appearance);

  const colors = appearance.material_colors && typeof appearance.material_colors === 'object' ? appearance.material_colors : {};
  model.traverse((node) => {
    if (!node.isMesh) return;
    const materials = (Array.isArray(node.material) ? node.material : [node.material]).filter(Boolean);
    materials.forEach((material, index) => {
      const key = `${node.name}:${index}`;
      if (colors[key]) setColor(material, colors[key]);
    });
  });
}

export class AvatarCustomizationRuntime {
  constructor(model, options = {}) {
    this.model = model;
    this.options = options;
    this.applied = null;
  }

  async update(appearance = {}) {
    if (!this.model) return;
    this.applied = appearance;
    applyCustomizationAppearance(this.model, appearance);
  }

  dispose() {
    this.model = null;
    this.applied = null;
  }
}

export default AvatarCustomizationRuntime;