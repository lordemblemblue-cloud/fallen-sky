/**
 * Which renderer a scene uses. Pure: no DOM, no three.js.
 *
 *   'webgpu' - three's WebGPURenderer. It uses WebGPU and falls back to its own WebGL2 backend by itself
 *              when the browser has no usable WebGPU adapter (the fallback the conversion keeps).
 *   'webgl2' - WebGPURenderer forced onto that WebGL2 backend (forceWebGL), to test the fallback.
 *   'webgl'  - the classic WebGLRenderer with the original GLSL materials.
 *
 * The scene's entry in webgpuSceneReadiness.mjs decides the default: a ready scene uses 'webgpu', any other
 * scene the classic renderer. A developer can choose explicitly with `?renderer=webgpu|webgl2|webgl`, which is
 * remembered on this device until `?renderer=auto`; WebGPU kinds are honoured only for scenes marked ready or
 * preview, so an unknown scene can never opt in.
 */
import { WEBGPU_SCENES, isSceneWebGPUPreviewable, isSceneWebGPUReady } from './webgpuSceneReadiness.mjs';

export const RENDERER_OVERRIDE_KEY = 'fallen_sky_renderer_v1';
export const RENDERER_KINDS = Object.freeze(['webgpu', 'webgl2', 'webgl']);
// Set (per tab) when WebGPURenderer failed to start or lost its device: the next start uses the classic renderer.
export const RENDERER_FAILED_KEY = 'fallen_sky_renderer_failed_v1';

/** The explicit choice from the URL (remembered) or from storage; null when there is none. */
export function readRendererOverride({ search = '', storage = null } = {}) {
  let param = null;
  try { param = new globalThis.URLSearchParams(search || '').get('renderer'); } catch { param = null; }
  if (param === 'auto') {
    try { storage?.removeItem?.(RENDERER_OVERRIDE_KEY); } catch { /* storage may be blocked */ }
    return null;
  }
  if (RENDERER_KINDS.includes(param)) {
    try { storage?.setItem?.(RENDERER_OVERRIDE_KEY, param); } catch { /* storage may be blocked */ }
    return param;
  }
  let saved = null;
  try { saved = storage?.getItem?.(RENDERER_OVERRIDE_KEY) ?? null; } catch { saved = null; }
  return RENDERER_KINDS.includes(saved) ? saved : null;
}

/**
 * @param {object} o
 * @param {string} o.sceneId           an id from WEBGPU_SCENES
 * @param {string|null} o.override     readRendererOverride()
 * @param {boolean} o.previousFailure  WebGPURenderer failed earlier in this tab
 * @param {object} [o.scenes]          readiness inventory (tests)
 * @returns {{kind:'webgpu'|'webgl2'|'webgl', reason:string}}
 */
export function chooseSceneRenderer({ sceneId, override = null, previousFailure = false, scenes = WEBGPU_SCENES } = {}) {
  if (override === 'webgl') return { kind: 'webgl', reason: 'override' };
  const previewable = isSceneWebGPUPreviewable(sceneId, scenes);
  if (override === 'webgpu' || override === 'webgl2') {
    if (!previewable) return { kind: 'webgl', reason: 'scene-not-previewable' };
    if (previousFailure && override === 'webgpu') return { kind: 'webgl', reason: 'webgpu-failed-earlier' };
    return { kind: override, reason: 'override' };
  }
  if (!isSceneWebGPUReady(sceneId, scenes)) return { kind: 'webgl', reason: 'scene-not-ready' };
  if (previousFailure) return { kind: 'webgl', reason: 'webgpu-failed-earlier' };
  return { kind: 'webgpu', reason: 'scene-ready' };
}

/** Browser convenience: the choice for a scene from window.location and localStorage / sessionStorage. */
export function chooseSceneRendererFor(sceneId, host = globalThis.window) {
  // Browser privacy wrappers and embedded hosts can throw while reading properties,
  // not just while invoking storage methods. Treat an unreadable host as WebGL-only.
  let previousFailure = false;
  let search = '';
  let storage = null;
  try {
    previousFailure = host?.sessionStorage?.getItem?.(RENDERER_FAILED_KEY) === '1';
    search = host?.location?.search || '';
    storage = host?.localStorage || null;
  } catch {
    return { kind: 'webgl', reason: 'browser-host-unavailable' };
  }
  const override = readRendererOverride({ search, storage });
  return chooseSceneRenderer({ sceneId, override, previousFailure });
}

/** Remember for this tab that WebGPURenderer could not run (init failure or device loss). */
export function rememberRendererFailure(host = globalThis.window) {
  try { host?.sessionStorage?.setItem?.(RENDERER_FAILED_KEY, '1'); } catch { /* storage may be blocked */ }
}
