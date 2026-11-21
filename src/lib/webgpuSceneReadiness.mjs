/**
 * Fail-closed readiness policy for the two live games.
 * A scene may be marked ready only after shader/effects parity and browser QA. A ready scene runs on WebGPU
 * wherever the browser offers it (rendererBackendChoice.mjs); browsers without WebGPU keep the classic renderer.
 *
 * `preview: true` lets a developer opt a scene in explicitly (`?renderer=webgpu`, see
 * rendererBackendChoice.mjs); it never changes the default.
 *
 * Both scenes: every live shader and effect has a WebGPU (TSL) version, checked against the classic renderer in
 * the browser view by view, and a lost GPU device falls back to the classic renderer
 * (docs/webgpu/CONVERSION_SURVEY_20261120.md, stages 2-5). The GLSL versions stay for that classic renderer.
 */
export const WEBGPU_SCENES = Object.freeze({
  'fallen-sky': Object.freeze({ ready: true, preview: true, blocker: null }),
  'duelist-adventure': Object.freeze({ ready: true, preview: true, blocker: null }),
});

/**
 * Unknown scene IDs must never silently inherit another scene's readiness.
 * Returns a boolean suitable for selectRendererBackend({ sceneWebGPUReady }).
 */
export function isSceneWebGPUReady(sceneId, scenes = WEBGPU_SCENES) {
  if (typeof sceneId !== 'string' || !scenes || (typeof scenes !== 'object' && typeof scenes !== 'function') || !Object.prototype.hasOwnProperty.call(scenes, sceneId)) return false;
  return scenes[sceneId]?.ready === true;
}

/** True when a developer may explicitly select WebGPU for this scene (ready scenes always may). */
export function isSceneWebGPUPreviewable(sceneId, scenes = WEBGPU_SCENES) {
  if (typeof sceneId !== 'string' || !scenes || (typeof scenes !== 'object' && typeof scenes !== 'function') || !Object.prototype.hasOwnProperty.call(scenes, sceneId)) return false;
  return scenes[sceneId]?.ready === true || scenes[sceneId]?.preview === true;
}

export function getSceneWebGPUBlocker(sceneId, scenes = WEBGPU_SCENES) {
  if (typeof sceneId !== 'string' || !scenes || (typeof scenes !== 'object' && typeof scenes !== 'function') || !Object.prototype.hasOwnProperty.call(scenes, sceneId)) return 'unknown-scene';
  return isSceneWebGPUReady(sceneId, scenes) ? null : (scenes[sceneId]?.blocker || 'not-validated');
}
