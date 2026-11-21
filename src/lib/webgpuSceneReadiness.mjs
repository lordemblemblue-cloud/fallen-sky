/**
 * Fail-closed readiness policy for the two live games.
 * This is an inventory, NOT a runtime WebGPU opt-in.
 * A scene may be enabled only after shader/effects parity and browser QA.
 *
 * `preview: true` lets a developer opt a scene in explicitly (`?renderer=webgpu`, see
 * rendererBackendChoice.mjs) while the conversion is under review; it never changes the default.
 */
export const WEBGPU_SCENES = Object.freeze({
  'fallen-sky': Object.freeze({ ready: false, preview: true, blocker: 'GameWorld3D shader, render-target and device-loss audit pending' }),
  'duelist-adventure': Object.freeze({ ready: false, preview: true, blocker: 'Legacy EffectComposer/ShaderPass warp effects require WebGPU parity' }),
});

/**
 * Unknown scene IDs must never silently inherit another scene's readiness.
 * Returns a boolean suitable for selectRendererBackend({ sceneWebGPUReady }).
 */
export function isSceneWebGPUReady(sceneId, scenes = WEBGPU_SCENES) {
  if (typeof sceneId !== 'string' || !Object.prototype.hasOwnProperty.call(scenes, sceneId)) return false;
  return scenes[sceneId]?.ready === true;
}

/** True when a developer may explicitly select WebGPU for this scene (ready scenes always may). */
export function isSceneWebGPUPreviewable(sceneId, scenes = WEBGPU_SCENES) {
  if (typeof sceneId !== 'string' || !Object.prototype.hasOwnProperty.call(scenes, sceneId)) return false;
  return scenes[sceneId]?.ready === true || scenes[sceneId]?.preview === true;
}

export function getSceneWebGPUBlocker(sceneId, scenes = WEBGPU_SCENES) {
  if (typeof sceneId !== 'string' || !Object.prototype.hasOwnProperty.call(scenes, sceneId)) return 'unknown-scene';
  return isSceneWebGPUReady(sceneId, scenes) ? null : (scenes[sceneId]?.blocker || 'not-validated');
}
