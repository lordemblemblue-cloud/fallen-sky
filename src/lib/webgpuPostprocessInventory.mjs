/**
 * Source-only inventory for postprocessing dependencies that require a WebGPU
 * implementation or explicit parity verification. Never use as a runtime
 * renderer selector: absence of these tokens is not proof of compatibility.
 */
export const LEGACY_POSTPROCESS_MARKERS = Object.freeze([
  Object.freeze({ id: 'effect-composer', pattern: /\bEffectComposer\b/ }),
  Object.freeze({ id: 'shader-pass', pattern: /\bShaderPass\b/ }),
  Object.freeze({ id: 'glsl-texture-sampling', pattern: /\btexture2D\s*\(/ }),
  Object.freeze({ id: 'glsl-fragment-output', pattern: /\bgl_FragColor\b/ }),
  Object.freeze({ id: 'webgl-render-target', pattern: /\bWebGLRenderTarget\b/ }),
  Object.freeze({ id: 'depth-texture', pattern: /\bDepthTexture\b/ }),
]);

export function inventoryLegacyPostprocess(source) {
  if (typeof source !== 'string') throw new TypeError('Expected source text');
  return LEGACY_POSTPROCESS_MARKERS.filter(({ pattern }) => pattern.test(source))
    .map(({ id }) => id);
}

/** Never infer WebGPU readiness from a clean static scan. */
export function describePostprocessMigration(sceneId, source) {
  return {
    sceneId,
    blockers: inventoryLegacyPostprocess(source),
    runtimeValidated: false,
    webgpuReady: false,
  };
}
