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
  // Fantasy Battle draws only textured MeshBasicMaterials and lines (no custom shaders), checked on both renderers.
  'fantasy-battle': Object.freeze({ ready: true, preview: true, blocker: null }),
});

/**
 * Readiness inventories can be supplied by browser integrations and tests.
 * A Proxy or accessor may throw even after an own-property check; fail closed.
 */
function readScenePolicy(sceneId, scenes) {
  if (typeof sceneId !== 'string' || !scenes || (typeof scenes !== 'object' && typeof scenes !== 'function')) return null;
  try {
    if (!Object.prototype.hasOwnProperty.call(scenes, sceneId)) return null;
    const policy = scenes[sceneId];
    return policy && (typeof policy === 'object' || typeof policy === 'function') ? policy : null;
  } catch {
    return null;
  }
}

function readPolicyFlag(policy, key) {
  try { return policy?.[key] === true; } catch { return false; }
}

/** Unknown or inaccessible scene IDs must fail closed. */
export function isSceneWebGPUReady(sceneId, scenes = WEBGPU_SCENES) {
  return readPolicyFlag(readScenePolicy(sceneId, scenes), 'ready');
}

/** True when a developer may explicitly select WebGPU for this scene. */
export function isSceneWebGPUPreviewable(sceneId, scenes = WEBGPU_SCENES) {
  const policy = readScenePolicy(sceneId, scenes);
  return readPolicyFlag(policy, 'ready') || readPolicyFlag(policy, 'preview');
}

export function getSceneWebGPUBlocker(sceneId, scenes = WEBGPU_SCENES) {
  const policy = readScenePolicy(sceneId, scenes);
  if (!policy) return 'unknown-scene';
  if (readPolicyFlag(policy, 'ready')) return null;
  try { return policy.blocker || 'not-validated'; } catch { return 'not-validated'; }
}
