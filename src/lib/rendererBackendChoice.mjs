/**
 * Which renderer a scene uses. Pure: no DOM, no three.js.
 *
 *   'webgpu' - three's WebGPURenderer. It uses WebGPU and falls back to its own WebGL2 backend by itself
 *              when the browser has no usable WebGPU adapter (the fallback the conversion keeps).
 *   'webgl2' - WebGPURenderer forced onto that WebGL2 backend (forceWebGL), to test the fallback.
 *   'webgl'  - the classic WebGLRenderer with the original GLSL materials.
 *
 * The default: ready scenes start with WebGPU when the browser exposes navigator.gpu. A measured slower
 * WebGPU verdict (webgpuDeviceVerdict.mjs) may select accelerated classic WebGL instead. Unsupported browsers,
 * unready scenes, and earlier WebGPU failures keep classic WebGL. WebGPURenderer itself falls back to WebGL2
 * when it cannot obtain a WebGPU adapter. Both WebGPU and WebGL execute drawing/shaders on the GPU.
 * A developer can choose explicitly with `?renderer=webgpu|webgl2|webgl`, which is remembered on this device until
 * `?renderer=auto`; WebGPU kinds are honoured only for scenes marked ready or preview, so an unknown scene can never
 * opt in.
 */
import { WEBGPU_SCENES, isSceneWebGPUPreviewable, isSceneWebGPUReady } from './webgpuSceneReadiness.mjs';
import { readDeviceVerdict } from './webgpuDeviceVerdict.mjs';

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
 * @param {object|null} [o.deviceVerdict] readDeviceVerdict(): WebGPU measured at least as fast on this device?
 * @returns {{kind:'webgpu'|'webgl2'|'webgl', reason:string}}
 */
export function chooseSceneRenderer({ sceneId, override = null, previousFailure = false, scenes = WEBGPU_SCENES,
  deviceVerdict = null } = {}) {
  if (override === 'webgl') return { kind: 'webgl', reason: 'override' };
  const previewable = isSceneWebGPUPreviewable(sceneId, scenes);
  if (override === 'webgpu' || override === 'webgl2') {
    if (!previewable) return { kind: 'webgl', reason: 'scene-not-previewable' };
    if (previousFailure && override === 'webgpu') return { kind: 'webgl', reason: 'webgpu-failed-earlier' };
    return { kind: override, reason: 'override' };
  }
  if (!isSceneWebGPUReady(sceneId, scenes)) return { kind: 'webgl', reason: 'scene-not-ready' };
  if (previousFailure) return { kind: 'webgl', reason: 'webgpu-failed-earlier' };
  if (deviceVerdict?.webgpuAtLeastAsFast === false) {
    return { kind: 'webgl', reason: 'webgpu-slower-on-this-device' };
  }
  return { kind: 'webgpu', reason: deviceVerdict?.webgpuAtLeastAsFast === true
    ? 'scene-ready' : 'webgpu-first-unmeasured' };
}

/** Browser convenience: the choice for a scene from window.location and localStorage / sessionStorage. */
export function chooseSceneRendererFor(sceneId, host = globalThis.window) {
  // Browser privacy wrappers and embedded hosts can throw while reading properties,
  // not just while invoking storage methods. Treat an unreadable host as WebGL-only.
  let previousFailure = false;
  let search = '';
  let storage = null;
  let fingerprint = '';
  try {
    previousFailure = host?.sessionStorage?.getItem?.(RENDERER_FAILED_KEY) === '1';
    search = host?.location?.search || '';
    storage = host?.localStorage || null;
    fingerprint = String(host?.navigator?.userAgent || '');
  } catch {
    return { kind: 'webgl', reason: 'browser-host-unavailable' };
  }
  const override = readRendererOverride({ search, storage });
  // The graphics API is exposed only in supported, secure browser contexts.
  // Do not default to WebGPU on SSR, insecure pages or browsers without it.
  if (!override && (!host?.navigator?.gpu || host?.isSecureContext === false)) {
    return { kind: 'webgl', reason: 'webgpu-api-unavailable' };
  }
  const deviceVerdict = readDeviceVerdict({ storage, fingerprint });
  return chooseSceneRenderer({ sceneId, override, previousFailure, deviceVerdict });
}

/** Remember for this tab that WebGPURenderer could not run (init failure or device loss). */
export function rememberRendererFailure(host = globalThis.window) {
  try { host?.sessionStorage?.setItem?.(RENDERER_FAILED_KEY, '1'); } catch { /* storage may be blocked */ }
}
