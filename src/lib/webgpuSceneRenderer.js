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
import { WebGPURenderer, ShadowNode, NoToneMapping, LinearSRGBColorSpace, SRGBColorSpace, Color, FrontSide, BackSide, DoubleSide, BufferAttribute } from 'three/webgpu';
import { texture, vec4, normalFlat, faceDirection } from 'three/tsl';
import { WebGLRenderer } from 'three';
import { chooseSceneRendererFor, rememberRendererFailure } from './rendererBackendChoice.mjs';
import { resolveNodeTwin } from './webgpuMaterialTwins.js';
import { installWebGPUThreeFixes } from './webgpuThreeFixes.js';
import { pointSpriteFor, pointSpriteForTwin } from './webgpuPointSprites.js';
import { applyNodeSetups } from './webgpuNodeKit.js';
import { applyClassicOutput, applyClassicShaderOutput, classicOutputKey, materialReadsNormals } from './webgpuClassicOutput.js';

export const WEBGPU_DEFAULT_MAX_TEXTURE = 8192;
// WebGLShadowMap's side for a material with shadowSide = null
const CLASSIC_SHADOW_SIDE = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };

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

/**
 * WebGPU backend: build and compile every visible object of `scene` now, in the background, before its first frame:
 * r171's compileAsync creates the pipelines with createRenderPipelineAsync, off the GPU process's main thread, while
 * frames are held (render() draws nothing until it resolves). r171 otherwise compiles each new pipeline
 * synchronously at its object's first draw, and the page waits for the GPU process: 102 new pipelines held this PC's
 * page for 7.4 + 2.9 s, against 2.2 s with the page responsive for 49 compiled this way. Objects are compiled whether
 * or not the camera sees them yet (frustum culling is lifted for the call), for `target`, the render target the scene
 * is drawn into (null: the canvas). r171 first builds every object's shader on the main thread (seconds for a whole
 * area: the page waits for that part), then waits at most `timeoutMs` for the background compiles. Never rejects.
 * Resolves with { pipelines, ms, timedOut } ({ skipped: true } for other renderers).
 */
export async function precompileSceneObjects(renderer, scene, camera, { target = null, timeoutMs = 15000 } = {}) {
  const state = renderer?.__sceneState;
  if (!renderer?.isWebGPURenderer || !renderer.backend?.isWebGPUBackend || state?.ready !== true || !scene || !camera
    || typeof renderer.compileAsync !== 'function') return { skipped: true };
  const started = performance.now();
  const before = renderer._pipelines?.caches?.size ?? 0;
  const lifted = [];
  const previous = renderer.getRenderTarget();
  let timedOut = false;
  let timer = null;
  state.holdRender = (state.holdRender || 0) + 1;
  try {
    scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; lifted.push(o); } });
    renderer.setRenderTarget(target);
    // compileAsync projects the scene, builds the shaders and starts the pipelines before its first await
    const compiling = renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(previous);
    for (const o of lifted) o.frustumCulled = true;
    lifted.length = 0;
    await Promise.race([compiling, new Promise((resolve) => { timer = setTimeout(() => { timedOut = true; resolve(); }, timeoutMs); })]);
  } catch { /* best effort: the remaining pipelines compile at first draw */ } finally {
    clearTimeout(timer);
    for (const o of lifted) o.frustumCulled = true;
    if (renderer.getRenderTarget() !== previous) renderer.setRenderTarget(previous);
    state.holdRender = Math.max(0, state.holdRender - 1);
    // from now on an object drawn for the first time compiles in the background (compileLateObjectsInBackground)
    state.backgroundCompile = true;
  }
  return { pipelines: (renderer._pipelines?.caches?.size ?? 0) - before, ms: Math.round(performance.now() - started), timedOut };
}

/** Hold the renderer's frames (render() draws nothing) until the returned release() is called (WebGPURenderer only). */
export function holdSceneFrames(renderer) {
  const state = renderer?.__sceneState;
  if (!renderer?.isWebGPURenderer || !state) return () => {};
  state.holdRender = (state.holdRender || 0) + 1;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    state.holdRender = Math.max(0, state.holdRender - 1);
  };
}

/** Resolves once `renders` more render() calls have drawn (or after `timeoutMs`). */
export function waitForSceneRenders(renderer, renders = 4, timeoutMs = 6000) {
  const info = renderer?.info?.render;
  if (!info) return Promise.resolve();
  const target = (info.frame || 0) + renders;
  const deadline = performance.now() + timeoutMs;
  return new Promise((resolve) => {
    const check = () => ((info.frame || 0) >= target || performance.now() > deadline ? resolve() : setTimeout(check, 30));
    check();
  });
}

// After precompileSceneObjects (state.backgroundCompile), the pipeline of an object drawn for the first time (streamed
// in, an effect's first use) is compiled in the background and the object appears when it is ready, a few frames
// later, instead of the page waiting for the GPU process (r171 compiles synchronously at first draw: a frame of a
// second or more for a handful of new shaders). Objects already drawn keep compiling synchronously (a material variant
// or light-count change), so nothing on screen blinks out; full-screen passes and render bundles too.
function compileLateObjectsInBackground(renderer) {
  const state = renderer.__sceneState;
  const pipelines = renderer._pipelines;
  const backend = renderer.backend;
  if (!state || !pipelines?.getForRender || typeof backend?.draw !== 'function' || pipelines.__sceneLateCompile) return;
  pipelines.__sceneLateCompile = true;
  const drawn = new WeakSet();
  const getForRender = pipelines.getForRender.bind(pipelines);
  pipelines.getForRender = (renderObject, promises = null) => {
    const object = renderObject?.object;
    if (promises !== null || state.backgroundCompile !== true || !object || object.isQuadMesh || drawn.has(object)
      || renderer._currentRenderBundle) return getForRender(renderObject, promises);
    return getForRender(renderObject, []); // not awaited: draw() below waits for the pipeline
  };
  const draw = backend.draw.bind(backend);
  backend.draw = (renderObject, info) => {
    if (backend.get(renderObject.pipeline).pipeline === undefined) return; // still compiling
    if (renderObject.object) drawn.add(renderObject.object);
    return draw(renderObject, info);
  };
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
    // before init three only warns and renders later, a frame at a time: skip until it is ready; frames are also
    // held while precompileSceneObjects() compiles the scene in the background
    if (state.ready !== true || state.holdRender > 0) return undefined;
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
  let pipelineObject = null;
  const patchedDevices = new WeakSet();
  const reportPipelineFailure = (object, material, error) => {
    if (object) broken.add(object);
    const classic = material?.userData?.classicMaterial || material;
    console.warn(`[webgpu] pipeline for "${classic?.name || classic?.type}" (${object?.name || object?.type}) failed; it is not drawn:`, error?.message || error);
  };
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
    // a pipeline compiled in the background that fails: report it once and resolve without one (r171 then never
    // draws the object), instead of an unhandled rejection
    device.createRenderPipelineAsync = (descriptor) => {
      const object = pipelineObject, material = pipelineMaterial;
      return createAsync(withPolygonOffset(descriptor)).catch((error) => {
        reportPipelineFailure(object, material, error);
        return undefined;
      });
    };
    // a shader that does not compile: say where (once per message); the pipeline note below names the material
    const createShaderModule = device.createShaderModule.bind(device);
    const reportedShaderErrors = new Set();
    device.createShaderModule = (descriptor) => {
      const module = createShaderModule(descriptor);
      module.getCompilationInfo?.().then((info) => {
        const errors = (info?.messages || []).filter((m) => m.type === 'error');
        if (!errors.length) return;
        const lines = String(descriptor?.code || '').split('\n');
        const text = errors.slice(0, 3).map((e) => `${e.lineNum}:${e.linePos} ${e.message}\n    ${(lines[e.lineNum - 1] || '').trim()}`).join('\n');
        if (reportedShaderErrors.has(text)) return;
        reportedShaderErrors.add(text);
        console.warn(`[webgpu] WGSL does not compile:\n${text}`);
      }, () => {});
      return module;
    };
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
      pipelineObject = renderObject.object;
      device?.pushErrorScope('validation');
      try { return createRenderPipeline(renderObject, promises); }
      finally {
        pipelineMaterial = null;
        pipelineObject = null;
        device?.popErrorScope().then((error) => {
          // the object is skipped in every pass (a shadow pass draws it with a shared override material)
          if (error) reportPipelineFailure(renderObject.object, renderObject.material, error);
        }, () => {});
      }
    };
  }

  // The colour-map alpha cut-out a classic depth material tests (plain uv, map alpha, the material's alphaTest), as
  // the castShadowNode r171 copies into the shadow material. A texture node, not a material reference: the node is
  // stored on that same material, and a reference to it would make the graph contain itself.
  const cutouts = new WeakMap();
  function shadowCutout(material) {
    const cached = cutouts.get(material);
    if (cached && cached.map === material.map && material.castShadowNode === cached.node) return;
    if (!cached && material.castShadowNode) return; // the game's own
    const node = vec4(0, 0, 0, texture(material.map).a);
    cutouts.set(material, { map: material.map, node });
    material.castShadowNode = node;
    if (material.nodesStatic === undefined) material.nodesStatic = true; // only a texture: no per-frame refresh
  }

  // r171 draws shadow maps with one shared override material and copies each drawn material's positionNode (and
  // castShadowNode, into colorNode) onto it, but keys the override's shader by its plain properties, where every node
  // reads as "{}": every object with its own vertex movement (wind, walk cycles) would get the shadow shader built
  // for the first one. Key the override by the node ids it carries.
  function keyOverrideByNodes(override) {
    const prior = override.customProgramCacheKey;
    override.customProgramCacheKey = function sceneOverrideNodeKey() {
      return `${prior.call(this)}|pos:${this.positionNode?.id ?? ''}|color:${this.colorNode?.id ?? ''}|depth:${this.depthNode?.id ?? ''}`;
    };
    override.__sceneNodeKeyed = true;
  }

  // GLSL materials: draw the registered node twin; skip one without a twin instead of a blank NodeMaterial.
  const renderObjectRaw = renderer.renderObject;
  const reported = new Set();
  // One object's draw must never take the frame down: r171 can throw mid-draw (e.g. an index buffer it lost
  // track of after a geometry was disposed and drawn again). Skip that draw (one console note per message): the
  // pass and the rest of the frame stay valid, and the next frame tries the object again.
  const failedDraws = new Set();
  const renderObject = { call(self, object, ...args) {
    try { return renderObjectRaw.call(self, object, ...args); }
    catch (error) {
      const message = String(error?.message || error);
      if (!failedDraws.has(message)) {
        failedDraws.add(message);
        console.warn(`[webgpu] draw skipped (${object?.name || object?.type}): ${message}`);
      }
      return undefined;
    }
  } };
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
      material = applyClassicShaderOutput(material, twin);
      // gl_PointSize points: the twin is drawn on instanced quads
      if (object?.isPoints && twin.isPointSpriteTwin) {
        const sprite = pointSpriteForTwin(object, twin, this);
        if (!sprite || broken.has(sprite.mesh)) return;
        return renderObject.call(this, sprite.mesh, scene, camera, sprite.geometry, twin, ...rest);
      }
    }
    // A lit classic material on a geometry without normals: the zero normal WebGL reads (webgpuClassicOutput.js
    // materialReadsNormals), not r171's up normal. Added before the geometry's first WebGPU draw (shadow pass first).
    if (geometry && !geometry.attributes.normal && geometry.attributes.position && materialReadsNormals(material)) {
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
      geometry.userData.webgpuZeroNormals = true;
    }
    const override = scene?.overrideMaterial;
    if (override) {
      if (!override.__sceneNodeKeyed) keyOverrideByNodes(override);
      if (override.isShadowNodeMaterial && material) {
        // WebGLShadowMap draws a material's colour-map alpha cut-outs into the shadow map; r171 only its alphaMap.
        if (material.alphaTest > 0 && material.map && !material.alphaMap && !material.isNodeMaterial) shadowCutout(material);
        // ...and draws single-sided materials' back faces (shadowSide null = the opposite side), which keeps lit
        // surfaces from shadowing themselves (acne); r171 draws the same side as the material.
        if (material.shadowSide == null) {
          material.shadowSide = CLASSIC_SHADOW_SIDE[material.side] ?? material.side;
          try { return renderObject.call(this, object, scene, camera, geometry, material, ...rest); }
          finally { material.shadowSide = null; }
        }
      }
    }
    return renderObject.call(this, object, scene, camera, geometry, material, ...rest);
  };

  // Classic materials with TSL nodes attached (webgpuNodeKit.js attachNodes): run their node setups on the node
  // material three converts them into, so composed patches keep their GLSL order.
  const library = renderer.library;
  const fromMaterial = library.fromMaterial.bind(library);
  library.fromMaterial = (material) => {
    const nodeMaterial = applyNodeSetups(material, fromMaterial(material));
    // r171 multiplies every normal by the face direction, also a flat-shaded material's (screen-derivative) normal,
    // which already faces the camera: the back faces of double-sided flat-shaded meshes (grass cards, low-poly
    // foliage) were lit as if facing away. Classic GLSL leaves FLAT_SHADED normals as they are; pre-multiplying by
    // the face direction (+-1) cancels r171's.
    if (nodeMaterial && !material?.isNodeMaterial && material?.flatShading && material.side !== FrontSide
      && !nodeMaterial.normalNode && !material.normalMap && !material.bumpMap) {
      nodeMaterial.normalNode = normalFlat.mul(faceDirection);
    }
    // the classic output order for converted classic materials (webgpuClassicOutput.js)
    if (material?.isShadowMaterial && nodeMaterial) patchShadowMask(nodeMaterial);
    return material?.isNodeMaterial ? nodeMaterial : applyClassicOutput(material, nodeMaterial);
  };

  // r171's ShadowMaterial multiplies its mask by every light's shadow, also by the missing one of a light that casts
  // none (WGSL "shadowMask * null"): such a light leaves the mask as it is.
  function patchShadowMask(nodeMaterial) {
    const setupLightingModel = nodeMaterial.setupLightingModel.bind(nodeMaterial);
    nodeMaterial.setupLightingModel = (builder) => {
      const model = setupLightingModel(builder);
      const direct = model?.direct?.bind(model);
      if (direct) model.direct = (input, ...rest) => (input?.shadowMask == null ? undefined : direct(input, ...rest));
      return model;
    };
  }

  // No final tone-mapping / colour-space pass (r171 draws the frame into a linear target and converts every pixel
  // at the end): each material finishes itself as in WebGL (webgpuClassicOutput.js). The renderer's toneMapping and
  // outputColorSpace stay what the game set; only the final pass reads these two.
  Object.defineProperty(renderer, 'currentToneMapping', { configurable: true, get: () => NoToneMapping });
  Object.defineProperty(renderer, 'currentColorSpace', { configurable: true, get: () => LinearSRGBColorSpace });
  // ...so the clear colour goes to the screen in the output colour space, as WebGL clears it.
  const clearColor = new Color();
  const toOutputSpace = (c) => {
    if (renderer.getRenderTarget() !== null || renderer.outputColorSpace !== SRGBColorSpace || !c) return c;
    const a = c.a > 0 ? c.a : 1;
    clearColor.setRGB(c.r / a, c.g / a, c.b / a).convertLinearToSRGB();
    c.r = clearColor.r * a; c.g = clearColor.g * a; c.b = clearColor.b * a;
    return c;
  };
  const getClearColor = backend.getClearColor.bind(backend);
  backend.getClearColor = () => toOutputSpace(getClearColor());
  state.afterInit = () => {
    // a converted classic material's shader is keyed by its classic program key + properties; add the node graph it
    // carries (webgpuNodeKit.js attachNodes), so another graph gets another shader and a swapped graph a rebuild
    const objects = renderer._objects;
    if (objects?.createRenderObject) {
      const createRenderObject = objects.createRenderObject.bind(objects);
      objects.createRenderObject = (...args) => {
        const renderObject = createRenderObject(...args);
        const proto = Object.getPrototypeOf(renderObject);
        if (proto && !proto.__sceneNodeKeyed) {
          const getMaterialCacheKey = proto.getMaterialCacheKey;
          proto.getMaterialCacheKey = function sceneMaterialCacheKey() {
            const key = getMaterialCacheKey.call(this);
            const nodes = this.material?.__sceneNodeKey;
            return nodes ? key + nodes : key;
          };
          proto.__sceneNodeKeyed = true;
          renderObject.initialCacheKey = renderObject.getCacheKey(); // (this first one was keyed before the patch)
        }
        return renderObject;
      };
    }
    if (backend.isWebGPUBackend) patchDevice(backend.device); // before any shader module or pipeline
    const background = renderer._background;
    if (background?.update) {
      const update = background.update.bind(background);
      background.update = (scene, renderList, renderContext) => {
        const result = update(scene, renderList, renderContext);
        if (renderContext?.clearColorValue) toOutputSpace(renderContext.clearColorValue);
        return result;
      };
    }
    // a built shader depends on screen / render target and the tone mapping + colour space it was built for
    const nodes = renderer._nodes;
    if (nodes?.getForRenderCacheKey) {
      const key = nodes.getForRenderCacheKey.bind(nodes);
      nodes.getForRenderCacheKey = (renderObject) => key(renderObject) + classicOutputKey(renderer);
    }
    if (backend.isWebGPUBackend) compileLateObjectsInBackground(renderer);
  };

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
    state.afterInit?.();
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

/**
 * A page's renderer, by the same choice as the Game 3D world (rendererBackendChoice.mjs: the scene's readiness and the
 * developer opt-in `?renderer=webgpu|webgl2|webgl`): the classic WebGLRenderer, or WebGPURenderer with this
 * compatibility layer. `ready` resolves once it can draw (at once for WebGL); render() calls before that are
 * skipped. A WebGPU start that fails is remembered for this tab, so the next start uses WebGL.
 * @param {string} sceneId an id from webgpuSceneReadiness.mjs WEBGPU_SCENES
 * @param {object} options WebGLRenderer options (canvas, antialias, alpha, powerPreference, preserveDrawingBuffer...)
 */
export function createSceneRenderer(sceneId, options = {}, host = globalThis.window) {
  const choice = chooseSceneRendererFor(sceneId, host);
  if (choice.kind === 'webgl') {
    return { renderer: new WebGLRenderer(options), ready: Promise.resolve({ api: 'WebGL (classic)' }), kind: 'webgl', reason: choice.reason };
  }
  const { renderer, ready } = createWebGPUSceneRenderer({
    canvas: options.canvas, antialias: options.antialias ?? true, alpha: options.alpha ?? false,
    powerPreference: options.powerPreference ?? 'high-performance', forceWebGL: choice.kind === 'webgl2',
  });
  ready.catch((error) => { console.warn('[webgpu] renderer failed to start; WebGL next time:', error); rememberRendererFailure(host); });
  return { renderer, ready, kind: choice.kind, reason: choice.reason };
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
