/**
 * WebGPURenderer for a live scene, made to stand in for the classic WebGLRenderer the scenes were written for.
 *
 * `createWebGPUSceneRenderer()` builds three's WebGPURenderer (WebGPU, or its own WebGL2 backend when the browser
 * has no WebGPU adapter or `forceWebGL` is set), starts its asynchronous init, and installs a small compatibility
 * layer for the WebGL-only calls the game makes (docs/webgpu/CONVERSION_SURVEY_20261120.md section 3.4):
 *
 *   - `capabilities.maxTextureSize`, `capabilities.getMaxAnisotropy()`, `extensions.has()`;
 *   - `shadowMap.autoUpdate = false` + `shadowMap.needsUpdate = true` (the game refreshes its static sun shadow
 *     only on request): WebGPU shadow nodes refresh per light, so a refresh is granted per render() call;
 *   - `info.render.frame` counts render() calls as in WebGL; `drawCallsOf(renderer)` reads draw calls for both;
 *   - GLSL materials: a registered node twin (webgpuMaterialTwins.js) is drawn in place of a ShaderMaterial; one
 *     without a twin is skipped (and reported once) instead of being drawn as a blank surface;
 *   - device loss: `onSceneDeviceLost(renderer, fn)`.
 *
 * Rendering must wait for `ready` (or check `isSceneRendererReady`): before init, three only warns and renders
 * asynchronously.
 */
import { WebGPURenderer, ShadowNode } from 'three/webgpu';
import { resolveNodeTwin } from './webgpuMaterialTwins.js';
import { installWebGPUThreeFixes } from './webgpuThreeFixes.js';
import { pointSpriteFor } from './webgpuPointSprites.js';
import { applyNodeSetups } from './webgpuNodeKit.js';

export const WEBGPU_DEFAULT_MAX_TEXTURE = 8192;

/** Draw calls of the last frame for either renderer kind (WebGPU counts render() calls in `render.calls`). */
export function drawCallsOf(renderer) {
  const render = renderer?.info?.render;
  if (!render) return 0;
  return renderer.isWebGPURenderer ? (render.drawCalls ?? 0) : (render.calls ?? 0);
}

export function isSceneRendererReady(renderer) {
  return !renderer?.isWebGPURenderer || renderer.__sceneState?.ready === true;
}

export function isSceneRendererLost(renderer) {
  return renderer?.__sceneState?.lost != null;
}

/** Call fn(info) once if the renderer's GPU device (or WebGL context of its fallback) is lost. */
export function onSceneDeviceLost(renderer, fn) {
  const state = renderer?.__sceneState;
  if (!state || typeof fn !== 'function') return () => {};
  if (state.lost) { fn(state.lost); return () => {}; }
  state.lostListeners.add(fn);
  return () => state.lostListeners.delete(fn);
}

/** 'WebGPU' or 'WebGL2' (WebGPURenderer's fallback backend); null before init. */
export function sceneRendererApi(renderer) {
  if (!renderer?.isWebGPURenderer) return renderer ? 'WebGL (classic)' : null;
  if (!renderer.__sceneState?.ready) return null;
  return renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
}

// Shadow refresh on request, the way WebGLShadowMap does it with autoUpdate = false. Installed once per page;
// renderers without the compatibility layer keep three's own behaviour.
let shadowPatched = false;
function patchShadowRefresh() {
  if (shadowPatched || !ShadowNode?.prototype?.updateBefore) return;
  shadowPatched = true;
  const updateBefore = ShadowNode.prototype.updateBefore;
  ShadowNode.prototype.updateBefore = function sceneRendererShadowUpdate(frame) {
    const map = frame?.renderer?.shadowMap;
    const state = frame?.renderer?.__sceneState;
    if (!state || map.autoUpdate !== false) return updateBefore.call(this, frame);
    const shadow = this.shadow;
    // Draw once when the shadow first appears, then only on request (global or for this light).
    const first = this.__sceneShadowDrawn !== true;
    if (!first && !state.shadowRefresh && shadow?.needsUpdate !== true) return undefined;
    const auto = shadow.autoUpdate;
    shadow.autoUpdate = true;
    try { return updateBefore.call(this, frame); }
    finally { shadow.autoUpdate = auto; shadow.needsUpdate = false; this.__sceneShadowDrawn = true; }
  };
}

function installCompat(renderer) {
  const state = renderer.__sceneState;

  const maxTextureSize = () => {
    const device = renderer.backend?.device;
    if (device?.limits?.maxTextureDimension2D) return device.limits.maxTextureDimension2D;
    const gl = renderer.backend?.gl;
    if (gl) { try { return gl.getParameter(gl.MAX_TEXTURE_SIZE) || WEBGPU_DEFAULT_MAX_TEXTURE; } catch { /* lost */ } }
    return WEBGPU_DEFAULT_MAX_TEXTURE;
  };
  renderer.capabilities = {
    get maxTextureSize() { return maxTextureSize(); },
    getMaxAnisotropy: () => { try { return renderer.getMaxAnisotropy(); } catch { return 1; } },
    isWebGL2: false,
    precision: 'highp',
    logarithmicDepthBuffer: false,
  };
  // WebGPU can always render to half-float targets; nothing else is asked for.
  renderer.extensions = {
    has: (name) => name === 'EXT_color_buffer_float' || name === 'EXT_color_buffer_half_float',
    get: () => null,
  };

  // shadowMap.autoUpdate / needsUpdate (WebGLShadowMap semantics)
  const shadowMap = renderer.shadowMap;
  let autoUpdate = true;
  let needsUpdate = false;
  Object.defineProperty(shadowMap, 'autoUpdate', { configurable: true, enumerable: true,
    get: () => autoUpdate, set: (v) => { autoUpdate = v !== false; } });
  Object.defineProperty(shadowMap, 'needsUpdate', { configurable: true, enumerable: true,
    get: () => needsUpdate, set: (v) => { needsUpdate = !!v; } });
  patchShadowRefresh();

  // render(): count frames like WebGL's info.render.frame and grant a requested shadow refresh to this call.
  const render = renderer.render;
  renderer.info.render.frame = 0;
  renderer.render = function sceneRender(scene, camera) {
    state.shadowRefresh = needsUpdate;
    try {
      return render.call(this, scene, camera);
    } finally {
      if (state.shadowRefresh) needsUpdate = false;
      state.shadowRefresh = false;
      this.info.render.frame++;
    }
  };

  // A pipeline that fails to compile voids the whole WebGPU command buffer (a black frame). Watch each pipeline's
  // creation and stop drawing a material whose pipeline failed (one console note each), so one bad shader costs one
  // object, not the picture. (WebGL2 backend: a failed program only loses its own draws already.)
  const broken = new WeakSet();
  const backend = renderer.backend;
  // r171's WebGPU backend also drops material.polygonOffset (decal layers: paved roads, trails, the town's ground
  // sealing would lose to the surface under them). It becomes the pipeline's depthBias / depthBiasSlopeScale, the
  // same formula as glPolygonOffset, and part of the pipeline cache key.
  let pipelineMaterial = null;
  const patchedDevices = new WeakSet();
  const withPolygonOffset = (descriptor) => {
    const m = pipelineMaterial;
    const topology = descriptor?.primitive?.topology;
    if (m?.polygonOffset && descriptor.depthStencil && (topology === 'triangle-list' || topology === 'triangle-strip' || !topology)) {
      descriptor.depthStencil.depthBias = Math.round(m.polygonOffsetUnits || 0);
      descriptor.depthStencil.depthBiasSlopeScale = m.polygonOffsetFactor || 0;
    }
    return descriptor;
  };
  const patchDevice = (device) => {
    if (!device || patchedDevices.has(device)) return;
    patchedDevices.add(device);
    const create = device.createRenderPipeline.bind(device);
    const createAsync = device.createRenderPipelineAsync.bind(device);
    device.createRenderPipeline = (descriptor) => create(withPolygonOffset(descriptor));
    device.createRenderPipelineAsync = (descriptor) => createAsync(withPolygonOffset(descriptor));
  };
  if (typeof backend.getRenderCacheKey === 'function' && backend.isWebGPUBackend) {
    const getRenderCacheKey = backend.getRenderCacheKey.bind(backend);
    backend.getRenderCacheKey = (renderObject) => {
      const m = renderObject.material;
      const key = getRenderCacheKey(renderObject);
      return m?.polygonOffset ? `${key},po${m.polygonOffsetFactor}/${m.polygonOffsetUnits}` : key;
    };
  }
  if (typeof backend.createRenderPipeline === 'function' && backend.isWebGPUBackend) {
    const createRenderPipeline = backend.createRenderPipeline.bind(backend);
    backend.createRenderPipeline = (renderObject, promises) => {
      const device = backend.device;
      patchDevice(device);
      pipelineMaterial = renderObject.material;
      device?.pushErrorScope('validation');
      try { return createRenderPipeline(renderObject, promises); }
      finally {
        pipelineMaterial = null;
        device?.popErrorScope().then((error) => {
          if (!error) return;
          // the object is skipped in every pass (a shadow pass draws it with a shared override material)
          const material = renderObject.material;
          broken.add(renderObject.object);
          const classic = material?.userData?.classicMaterial || material;
          console.warn(`[webgpu] pipeline for "${classic?.name || classic?.type}" (${renderObject.object?.name || renderObject.object?.type}) failed; it is not drawn:`, error.message);
        }, () => {});
      }
    };
  }

  // GLSL materials: draw the registered node twin; skip one without a twin instead of a blank NodeMaterial.
  const renderObject = renderer.renderObject;
  const reported = new Set();
  renderer.renderObject = function sceneRenderObject(object, scene, camera, geometry, material, ...rest) {
    if (broken.has(object)) return;
    // Points with a size: instanced quads (WebGPU points are one pixel)
    if (object?.isPoints && material?.isPointsMaterial) {
      const sprite = pointSpriteFor(object, material, this);
      if (sprite && !broken.has(sprite.mesh)) return renderObject.call(this, sprite.mesh, scene, camera, sprite.geometry, sprite.material, ...rest);
      if (sprite) return;
    }
    if (material?.isShaderMaterial) {
      const twin = resolveNodeTwin(material, this);
      if (!twin) {
        const key = material.name || material.type;
        if (!reported.has(key)) {
          reported.add(key);
          console.warn(`[webgpu] "${key}" has no node twin yet: not drawn with WebGPURenderer (${object?.name || object?.type})`);
        }
        return;
      }
      material = twin;
    }
    return renderObject.call(this, object, scene, camera, geometry, material, ...rest);
  };

  // Classic materials with TSL nodes attached (webgpuNodeKit.js attachNodes): run their node setups on the node
  // material three converts them into, so composed patches keep their GLSL order.
  const library = renderer.library;
  const fromMaterial = library.fromMaterial.bind(library);
  library.fromMaterial = (material) => applyNodeSetups(material, fromMaterial(material));

  // Device loss: three's handler logs it; listeners stop their loop and fall back.
  const onDeviceLost = renderer.onDeviceLost;
  renderer.onDeviceLost = function sceneDeviceLost(info) {
    try { onDeviceLost?.call(this, info); } catch { /* logging only */ }
    if (state.lost) return;
    state.lost = info || { api: 'unknown', message: 'device lost' };
    for (const fn of state.lostListeners) { try { fn(state.lost); } catch (error) { console.error(error); } }
    state.lostListeners.clear();
  };
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} [o.canvas]
 * @param {boolean} [o.antialias=true]
 * @param {boolean} [o.alpha=false]
 * @param {string} [o.powerPreference='high-performance']
 * @param {boolean} [o.forceWebGL=false]  use WebGPURenderer's WebGL2 backend
 * @returns {{renderer: WebGPURenderer, ready: Promise<{api:string, adapter:object|null}>}}
 */
export function createWebGPUSceneRenderer({ canvas, antialias = true, alpha = false,
  powerPreference = 'high-performance', forceWebGL = false } = {}) {
  installWebGPUThreeFixes();
  const renderer = new WebGPURenderer({
    ...(canvas ? { canvas } : {}), antialias, alpha, powerPreference, forceWebGL,
  });
  const state = renderer.__sceneState = { ready: false, lost: null, lostListeners: new Set(), shadowRefresh: false,
    error: null, disposed: false };
  installCompat(renderer);
  const ready = renderer.init().then(() => {
    state.ready = true;
    return { api: sceneRendererApi(renderer), adapter: describeAdapter(renderer) };
  }, (error) => {
    state.error = error;
    throw error;
  });
  // three's dispose() throws on a renderer whose init has not finished (its subsystems are still null), which a
  // scene unmounted early (React's development double mount, a quick route change) would hit: dispose once init
  // has settled instead. Disposing twice is a no-op.
  const dispose = renderer.dispose;
  renderer.dispose = function sceneDispose() {
    if (state.disposed) return;
    state.disposed = true;
    const run = () => { try { dispose.call(renderer); } catch (error) { console.warn('[webgpu] dispose', error); } };
    if (state.ready) run();
    else ready.then(run, () => {});
  };
  return { renderer, ready };
}

/** What the GPU says about itself (WebGPU adapter info, or the WebGL2 fallback's unmasked renderer). */
export function describeAdapter(renderer) {
  const device = renderer?.backend?.device;
  const info = device?.adapterInfo;
  if (info) {
    const name = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ');
    return { vendor: info.vendor || '', architecture: info.architecture || '', name };
  }
  const gl = renderer?.backend?.gl;
  if (gl) {
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      return { vendor: '', architecture: '', name };
    } catch { /* lost */ }
  }
  return null;
}
