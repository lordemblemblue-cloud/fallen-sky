/**
 * Which renderer a scene uses. Pure: no DOM, no three.js.
 *
 *   'webgpu' - three's WebGPURenderer. It uses WebGPU and falls back to its own WebGL2 backend by itself
 *              when the browser has no usable WebGPU adapter (the fallback the conversion keeps).
 *   'webgl2' - WebGPURenderer forced onto that WebGL2 backend (forceWebGL), to test the fallback.
 *   'webgl'  - the classic WebGLRenderer with the original GLSL materials.
 *
 * The default (the owner's call, 2026-11-21): a scene marked ready runs on WebGPU wherever the browser offers it
 * (navigator.gpu on a secure page), with no speed test first. Classic WebGL only for browsers without WebGPU, scenes
 * not marked ready, a WebGPU failure earlier in this tab, or an explicit ?renderer=webgl. WebGPURenderer itself
 * falls back to WebGL2 when it cannot obtain a WebGPU adapter. Both WebGPU and WebGL draw on the GPU.
 * A developer can choose explicitly with `?renderer=webgpu|webgl2|webgl`, which is remembered on this device until
 * `?renderer=auto`; WebGPU kinds are honoured only for scenes marked ready or preview, so an unknown scene can never
 * opt in.
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
  let previousFailure = false;
  let search = '';
  let storage = null;
  try { previousFailure = host?.sessionStorage?.getItem?.(RENDERER_FAILED_KEY + ':' + sceneId) === '1'; } catch { /* optional */ }
  try { search = host?.location?.search || ''; } catch { /* optional */ }
  try { storage = host?.localStorage || null; } catch { /* optional */ }
  const override = readRendererOverride({ search, storage });
  // An explicit WebGPU override must not bypass the browser's secure-context
  // requirement. Keep forced WebGL2 available to test fallback on HTTP pages.
  // Reading this browser flag can itself throw in privacy wrappers.
  if (override === 'webgpu') {
    try {
      if (host?.isSecureContext === false) return { kind: 'webgl', reason: 'webgpu-api-unavailable' };
    } catch { return { kind: 'webgl', reason: 'webgpu-api-unavailable' }; }
  }
  // The graphics API is exposed only in supported, secure browser contexts.
  // Do not default to WebGPU on SSR, insecure pages or browsers without it. Privacy wrappers can also throw
  // on reading navigator.gpu (tests/webgpuNavigatorGpuGetterRegression.test.mjs): that counts as no WebGPU.
  if (!override) {
    let available = false;
    try { available = Boolean(host?.navigator?.gpu) && host?.isSecureContext !== false; } catch { available = false; }
    if (!available) return { kind: 'webgl', reason: 'webgpu-api-unavailable' };
  }
  return chooseSceneRenderer({ sceneId, override, previousFailure });
}

/** Remember for this tab that WebGPURenderer could not run (init failure or device loss). */
export function rememberRendererFailure(host = globalThis.window, sceneId = 'fallen-sky') {
  try { host?.sessionStorage?.setItem?.(RENDERER_FAILED_KEY + ':' + sceneId, '1'); } catch { /* storage may be blocked */ }
}

// Settings explicitly requests a fresh attempt, including after a device reset.
export function retryWebGPU(sceneId, host = globalThis.window) {
  const url = new globalThis.URL(host.location.href);
  url.searchParams.set('renderer', 'webgpu');
  try { host.sessionStorage?.removeItem?.(RENDERER_FAILED_KEY + ':' + sceneId); } catch { /* optional */ }
  if (url.href === host.location.href) host.location.reload();
  else host.location.assign(url.href);
}
