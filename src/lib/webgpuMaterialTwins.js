/**
 * Node-material twins for GLSL materials, so one scene renders with either renderer.
 *
 * The classic WebGLRenderer draws a ShaderMaterial / RawShaderMaterial from its GLSL. WebGPURenderer cannot (it
 * builds every shader from TSL nodes), so the module that makes such a material also registers a factory for an
 * equivalent NodeMaterial: `setNodeTwin(material, (classic) => nodeMaterial)`. A WebGPURenderer (see
 * webgpuSceneRenderer.js) draws the twin in the classic material's place. The classic material stays the one the
 * game owns: code that changes `material.uniforms.x.value`, `visible`, `opacity`, `transparent`, `side`... keeps
 * working, because a twin reads the same uniform objects (`reference('value', type, classic.uniforms.x)`) and its
 * render state is copied from the classic material whenever that changes.
 *
 * No three.js import: classic-only code paths load nothing extra.
 */
const twins = new WeakMap();

// Render state that decides the pipeline or visibility, mirrored from the classic material.
const STATE = ['visible', 'transparent', 'opacity', 'side', 'blending', 'blendSrc', 'blendDst', 'blendEquation',
  'blendSrcAlpha', 'blendDstAlpha', 'blendEquationAlpha', 'premultipliedAlpha', 'depthTest', 'depthWrite',
  'depthFunc', 'colorWrite', 'alphaTest', 'wireframe', 'polygonOffset', 'polygonOffsetFactor',
  'polygonOffsetUnits', 'forceSinglePass', 'toneMapped', 'fog', 'alphaToCoverage', 'stencilWrite'];

/**
 * Register a NodeMaterial factory for a classic (GLSL) material. The factory runs once, the first time a
 * WebGPURenderer draws the material, and receives the classic material and that renderer.
 */
export function setNodeTwin(material, factory) {
  if (!material || typeof factory !== 'function') return material;
  twins.set(material, { factory, twin: null, failed: false, version: -1 });
  return material;
}

export function hasNodeTwin(material) {
  return !!material && twins.has(material);
}

function syncState(classic, twin) {
  let changed = false;
  for (const key of STATE) {
    if (!(key in classic)) continue;
    const value = classic[key];
    if (twin[key] !== value) {
      twin[key] = value;
      if (key !== 'opacity' && key !== 'visible') changed = true;
    }
  }
  return changed;
}

/** The twin to draw for `material` (built on first use), or null when none is registered or it failed. */
export function resolveNodeTwin(material, renderer = null) {
  const entry = twins.get(material);
  if (!entry || entry.failed) return null;
  if (!entry.twin) {
    try {
      entry.twin = entry.factory(material, renderer) || null;
    } catch (error) {
      entry.failed = true;
      console.warn('[webgpu] node twin failed for material', material?.name || material?.type, error);
      return null;
    }
    if (!entry.twin) { entry.failed = true; return null; }
    entry.twin.name ||= (material.name || material.type) + ' (node twin)';
    // Code that reaches the drawn material (onBeforeRender, debug tools) still finds the classic uniforms.
    if (material.uniforms && !entry.twin.uniforms) entry.twin.uniforms = material.uniforms;
    entry.twin.userData.classicMaterial = material;
    syncState(material, entry.twin);
    entry.version = material.version;
    entry.twin.needsUpdate = true;
    return entry.twin;
  }
  // A few dozen property reads per drawn twin: cheaper than missing a `transparent` flip done without needsUpdate.
  const changed = syncState(material, entry.twin);
  if (changed || material.version !== entry.version) {
    entry.version = material.version;
    entry.twin.needsUpdate = true;
  }
  return entry.twin;
}

/** Rebuild the twin on its next draw (after the classic material swapped a uniform object for another). */
export function resetNodeTwin(material) {
  const entry = twins.get(material);
  if (!entry) return;
  entry.twin?.dispose?.();
  entry.twin = null;
  entry.failed = false;
}

/** Dispose a classic material's twin together with it (call from the owner's dispose). */
export function disposeNodeTwin(material) {
  const entry = twins.get(material);
  if (entry?.twin) entry.twin.dispose?.();
  twins.delete(material);
}
