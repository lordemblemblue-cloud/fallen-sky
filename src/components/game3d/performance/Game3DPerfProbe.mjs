// Game 3D draw-cost probe (developer tool, never part of the shipped game).
//
// Loaded only by the dev server: Game3DPerformanceBootstrap imports it when the page URL has ?perfProbe=1 and
// import.meta.env.DEV is true (a production build drops that branch and this file). It can also be imported by hand
// from the browser console of the dev server: await import('/src/components/game3d/performance/Game3DPerfProbe.mjs').
//
// What it does, per viewpoint (Game3DPerfViewpoints.mjs): it reaches the viewpoint's area the way a gate does (the
// game's own `game3dPortalTravel` event, which remounts the world as that area's scene) or, inside the same area,
// moves the player there; it waits until the scene stops changing; then it draws a fixed number of frames itself
// from a copy of the game camera placed at eye height, looking along the view's heading. While it draws, the game's
// own drawing is paused (its simulation keeps running), the player model is hidden (budgets count scenery and
// enemies, not the player) and the adaptive-resolution governor is switched off so the canvas size stays fixed
// (both restored afterwards, and the result says so).
//
// Each frame is timed from the start of the draw until the GPU has finished it (WebGPU: queue.onSubmittedWorkDone;
// WebGL: a one-pixel read). Frames are drawn back to back, one at a time, so a frame time here is "what one frame
// costs this machine", independent of the browser's frame scheduling: it stays meaningful in a hidden pane, where
// requestAnimationFrame is throttled. GPU time comes from timestamp queries the probe adds to every render pass
// (WebGPU, when the adapter offers 'timestamp-query') or EXT_disjoint_timer_query_webgl2 (classic WebGL).
//
// Results: one JSON object per run, kept in window.__gw3dPerfProbe.last and, when ?perfPost=<url> (or the post
// option) is given, POSTed as text/plain to scripts/game3d-perf-receiver.mjs. scripts/game3d-perf-compare.mjs
// prints a table of one run or a before/after table of two.
import { Frustum, Matrix4 } from 'three';
import { perfViewpoints, PERF_AREAS, PERF_EYE_HEIGHT } from './Game3DPerfViewpoints.mjs';
import { evaluateGame3DAreaBudget, GAME3D_AREA_BUDGETS } from './Game3DAreaBudget.mjs';
import { installRafPump } from './Game3DRafPump.mjs';

export const PERF_PROBE_SCHEMA = 'game3d-perf-probe/1';

// Groups the probe can switch off one at a time. A mesh belongs to the FIRST group (in this order) that matches the
// name of the mesh, of its material, or of any object on its path to the scene root. The area loader's copies are
// named WV_Area_<area>_<source>; that prefix is ignored. Names come from the scene graph as built (see the
// inventory: __gw3dPerfProbe.inventory()).
export const PERF_TOGGLE_GROUPS = [
  { id: 'threeRoads', label: 'War of Three Roads content (?threeRoads=1; objects named TR_*)', match: /^TR_/ },
  { id: 'farMeadow', label: 'Streamed meadow beyond the ground (WV_4MileRadius_StreamingSolidMeadow, with its grass)',
    match: /4mileradius|streamingsolidmeadow|meadow_?solidground|splat_solidmeadow/i },
  { id: 'farGrass', label: 'Owner long-grass tiles, far ring (SWV_Owner_LongGrass_Tile_*_Far)', match: /longgrass_tile_[^ ]*_far/i },
  { id: 'nearGrass', label: 'Near grass (long-grass near tiles, blades, clumps, tufts, ferns)',
    match: /grass|blade|fern|clump|reed|tuft/i, exclude: /grassandsoil|grass_and_soil|soilpigment|grassseam/i },
  { id: 'trees', label: 'Trees, bamboo, canopy', match: /tree|cedar|bamboo|canopy|bark|\belm\b|elm-|oak|birch|pine|maple|willow|sakura|cherry|foliage|leaves|trunk/i },
  { id: 'rocksPlants', label: 'Rocks, stones and plant cards', match: /rock|boulder|shoulderstone|standingstone|wolfstone|plantcard|plant|flower|shrub|bush|pebble/i },
  { id: 'water', label: 'Water, river, waterfall, lake', match: /water|river|waterfall|lake|vortex|foam|fountain/i },
  { id: 'roads', label: 'Roads, paving, kerbs, trails', match: /road|paved|paving|kerb|trail|footpath|path_/i },
  { id: 'terrain', label: 'Terrain and ground layers', match: /terrain|overworldfloor|areafloor|heightfield|ground|soil|splat/i },
  { id: 'town', label: 'Town buildings, gates and props', match: /town|house|roof|architecture|artisan|interior|wall|lantern|stall|shrine|temple|pagoda|bridge|fence|gate|torii|building|palace|tile/i },
];
const AREA_COPY_PREFIX = /WV_Area_(town|south|west|east|north)_/gi;
// Not mesh groups: handled specially by toggle()
export const PERF_SPECIAL_TOGGLES = Object.freeze([
  { id: 'characters', label: 'Enemies, bosses, NPCs and mounts' },
  { id: 'shadows', label: 'Shadow casting (all lights castShadow off)' },
  { id: 'shadowRefresh', label: 'Shadow map redrawn every frame (normally only on request)' },
  { id: 'post', label: 'Ink-wash post effect (level 0)' },
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}
export function summarizeMs(values) {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  return { frames: v.length, medianMs: round(percentile(v, 50)), p95Ms: round(percentile(v, 95)),
    minMs: round(v[0]), maxMs: round(v[v.length - 1]), meanMs: round(v.reduce((s, x) => s + x, 0) / v.length) };
}

export { installRafPump };

async function measureRafInterval(host, frames = 20, timeoutMs = 4000) {
  const raf = host.__gw3dRafPump ? null : host.requestAnimationFrame?.bind(host);
  if (!raf) return null;
  const times = [];
  await new Promise((resolve) => {
    const deadline = performance.now() + timeoutMs;
    const tick = (t) => { times.push(t); if (times.length > frames || performance.now() > deadline) resolve(); else raf(tick); };
    raf(tick);
    setTimeout(resolve, timeoutMs + 200);
  });
  const deltas = [];
  for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1]);
  return summarizeMs(deltas);
}

function backendOf(renderer) {
  if (!renderer) return 'none';
  if (!renderer.isWebGPURenderer) return 'WebGL (classic WebGLRenderer)';
  if (renderer.backend?.isWebGPUBackend) return 'WebGPU';
  if (renderer.backend?.isWebGLBackend) return 'WebGL2 (WebGPURenderer fallback)';
  return 'WebGPURenderer (backend unknown)';
}

function pipelineCount(renderer) {
  try {
    if (renderer?.isWebGPURenderer) {
      const p = renderer._pipelines;
      return { kind: 'render+compute pipelines (three cache)', count: p?.caches?.size ?? null,
        vertexPrograms: p?.programs?.vertex?.size ?? null, fragmentPrograms: p?.programs?.fragment?.size ?? null };
    }
    return { kind: 'WebGL programs', count: renderer?.info?.programs?.length ?? null };
  } catch { return { kind: 'unknown', count: null }; }
}

function readInfo(renderer) {
  const r = renderer?.info?.render || {};
  const gpu = !!renderer?.isWebGPURenderer;
  return { drawCalls: (gpu ? r.drawCalls : r.calls) ?? 0, triangles: Math.round(r.triangles ?? 0),
    points: Math.round(r.points ?? 0), lines: Math.round(r.lines ?? 0) };
}

// ---- GPU timers -------------------------------------------------------------------------------------------------

// WebGPU: add a timestamp pair to every render pass that has none, resolve them when the command encoder finishes,
// read them back after the frame. Works on the device three already created; removed by uninstall().
function createWebGPUPassTimer(renderer) {
  const device = renderer?.backend?.device;
  if (!device || !device.features?.has?.('timestamp-query')) return null;
  const CAP = 128;
  const querySet = device.createQuerySet({ type: 'timestamp', count: CAP, label: 'perfProbe timestamps' });
  const resolveBuf = device.createBuffer({ size: CAP * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC, label: 'perfProbe resolve' });
  const readBuf = device.createBuffer({ size: CAP * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, label: 'perfProbe read' });
  const hadOwn = Object.prototype.hasOwnProperty.call(device, 'createCommandEncoder');
  const ownValue = hadOwn ? device.createCommandEncoder : undefined;
  const original = device.createCommandEncoder;
  let used = 0;
  let overflow = false;
  let active = false;
  device.createCommandEncoder = function probeEncoder(descriptor) {
    const encoder = original.call(this, descriptor);
    if (!active) return encoder;
    const mine = [];
    const begin = encoder.beginRenderPass;
    encoder.beginRenderPass = function probeBeginRenderPass(desc) {
      if (desc && !desc.timestampWrites) {
        if (used + 2 <= CAP) {
          const index = used; used += 2; mine.push(index);
          desc = { ...desc, timestampWrites: { querySet, beginningOfPassWriteIndex: index, endOfPassWriteIndex: index + 1 } };
        } else overflow = true;
      }
      return begin.call(this, desc);
    };
    const finish = encoder.finish;
    encoder.finish = function probeFinish(d) {
      for (const index of mine) this.resolveQuerySet(querySet, index, 2, resolveBuf, index * 8);
      return finish.call(this, d);
    };
    return encoder;
  };
  return {
    kind: 'WebGPU timestamp-query (per render pass)',
    begin() { used = 0; overflow = false; active = true; },
    async end() {
      active = false;
      const n = used;
      if (!n) return { gpuMs: null, passes: 0, overflow };
      const enc = original.call(device, { label: 'perfProbe copy' });
      enc.copyBufferToBuffer(resolveBuf, 0, readBuf, 0, n * 8);
      device.queue.submit([enc.finish()]);
      await readBuf.mapAsync(GPUMapMode.READ, 0, n * 8);
      const t = new BigUint64Array(readBuf.getMappedRange(0, n * 8).slice(0));
      readBuf.unmap();
      let sum = 0; let first = null; let last = null; let passes = 0;
      for (let i = 0; i < n; i += 2) {
        if (t[i] === 0n || t[i + 1] < t[i]) continue;
        sum += Number(t[i + 1] - t[i]); passes++;
        if (first === null || t[i] < first) first = t[i];
        if (last === null || t[i + 1] > last) last = t[i + 1];
      }
      return { gpuMs: passes ? sum / 1e6 : null, spanMs: passes ? Number(last - first) / 1e6 : null, passes, overflow };
    },
    uninstall() {
      active = false;
      if (hadOwn) device.createCommandEncoder = ownValue; else delete device.createCommandEncoder;
      try { querySet.destroy(); resolveBuf.destroy(); readBuf.destroy(); } catch { /* device may be gone */ }
    },
  };
}

// Classic WebGL / WebGL2 fallback: one TIME_ELAPSED query around the frame.
function createWebGLFrameTimer(gl) {
  const ext = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  let query = null;
  return {
    kind: 'EXT_disjoint_timer_query_webgl2 (whole frame)',
    begin() { query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); },
    async end() {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      const q = query; query = null;
      const deadline = performance.now() + 500;
      while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        if (performance.now() > deadline) { gl.deleteQuery(q); return { gpuMs: null, passes: 0 }; }
        await sleep(2);
      }
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q);
      return { gpuMs: disjoint ? null : ns / 1e6, passes: 1, disjoint: !!disjoint };
    },
    uninstall() {},
  };
}

function glOf(renderer) {
  try {
    if (!renderer?.isWebGPURenderer) return renderer.getContext();
    if (renderer.backend?.isWebGLBackend) return renderer.backend.gl;
  } catch { /* lost */ }
  return null;
}

async function waitForGpu(renderer, pixel) {
  if (renderer?.isWebGPURenderer && renderer.backend?.isWebGPUBackend) {
    await renderer.backend.device.queue.onSubmittedWorkDone();
    return;
  }
  const gl = glOf(renderer);
  if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); // blocks until the GPU has drawn the frame
}

// ---- scene helpers ----------------------------------------------------------------------------------------------

function countTriangles(object) {
  const g = object.geometry;
  if (!g || !(object.isMesh || object.isSprite)) return 0;
  const n = g.index ? g.index.count : (g.attributes?.position?.count ?? 0);
  const range = Number.isFinite(g.drawRange?.count) ? Math.min(n, g.drawRange.count) : n;
  let instances = 1;
  if (object.isInstancedMesh) instances = object.count ?? 1;
  else if (g.isInstancedBufferGeometry) instances = Number.isFinite(g.instanceCount) ? g.instanceCount : 1;
  if (object.isBatchedMesh) return Math.round((object._multiDrawCounts ? Array.from(object._multiDrawCounts.slice(0, object._multiDrawCount || 0)).reduce((s, c) => s + c, 0) : range) / 3);
  return Math.round((range / 3) * instances);
}

function visibleChain(object) {
  for (let o = object; o; o = o.parent) if (o.visible === false) return false;
  return true;
}

function materialNames(object) {
  const m = object.material;
  if (!m) return '';
  return (Array.isArray(m) ? m : [m]).map((x) => x?.name || '').join(' ');
}

export function createGame3DPerfProbe({ host = window, groups = PERF_TOGGLE_GROUPS } = {}) {
  const state = { drawing: false, paused: null, notes: [], log: [] };
  const say = (text) => { state.log.push(`${new Date().toISOString().slice(11, 19)} ${text}`); console.info('[perfProbe]', text); };

  const r = () => host.__gw3dRenderer;
  const scene = () => host.__gw3dScene;
  const gameCamera = () => host.__gw3dCamera;
  const playerModel = () => host.__gw3dWeaponDebug?.model || null;
  const currentArea = () => host.__gw3dAreaLoader?.getArea?.() || host.__gw3dRegionStreamingStatus?.area || null;
  const wholeWorld = () => { try { const q = new URLSearchParams(host.location.search).get('wholeWorld'); if (q === '1' || q === 'true') return true; if (q === '0' || q === 'false') return false; return host.localStorage?.getItem('game3d.wolfveilWholeWorld') === '1'; } catch { return false; } };

  function characterRoots() {
    const roots = new Set();
    const add = (list) => { for (const e of list || []) { const g = e?.group || e?.mesh || e?.root || (e?.isObject3D ? e : null); if (g?.isObject3D) roots.add(g); } };
    add(host.__gw3dEnemies); add(host.__gw3dBosses); add(host.__gw3dRogues);
    if (host.__gw3dLivingQuestNPC?.isObject3D) roots.add(host.__gw3dLivingQuestNPC);
    const s = scene();
    s?.traverse?.((o) => { if (o.isSkinnedMesh) { let top = o; while (top.parent && top.parent !== s && !top.parent.isScene) top = top.parent; roots.add(top); } });
    const player = playerModel(); if (player) roots.delete(player);
    return roots;
  }

  function classify(object, chars) {
    for (let o = object; o; o = o.parent) {
      if (chars?.has(o)) return 'characters';
      if (o === playerModel()) return 'player';
    }
    const names = [materialNames(object)];
    for (let o = object; o && !o.isScene; o = o.parent) if (o.name) names.push(o.name);
    const clean = names.map((n) => n.replace(AREA_COPY_PREFIX, '')).filter((n) => n.trim());
    for (const group of groups) {
      if (clean.some((name) => group.match.test(name) && !group.exclude?.test(name))) return group.id;
    }
    return 'other';
  }

  function drawables() {
    const out = [];
    scene()?.traverse?.((o) => { if (o.isMesh || o.isSprite || o.isPoints || o.isLine) out.push(o); });
    return out;
  }

  function makeCamera(view, eyeY) {
    const base = gameCamera();
    const cam = base.clone();
    cam.position.set(view.worldX, eyeY, view.worldZ);
    cam.up.set(0, 1, 0);
    cam.lookAt(view.worldX + view.dirX * 100, eyeY, view.worldZ + view.dirZ * 100);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
  }

  function groundAt(view) {
    const sample = host.__axeTileInspectionSampleGroundY;
    let y = typeof sample === 'function' ? sample(view.worldX, view.worldZ) : null;
    let water = null;
    try { const w = host.__gw3dWater; const h = w?.heightAt?.(view.worldX, view.worldZ) ?? w?.surfaceY?.(view.worldX, view.worldZ); if (Number.isFinite(h)) water = h; } catch { /* optional */ }
    if (Number.isFinite(water) && (!Number.isFinite(y) || water > y)) y = water;
    return Number.isFinite(y) ? y : null;
  }

  // pause the game's drawing (not its simulation) so only probe frames reach the GPU
  function pauseGameDrawing() {
    if (state.paused) return;
    const renderer = r(); const look = host.__gw3dInkLook;
    const paused = { renderer, look, render: renderer.render, lookRender: look?.render, autoReset: renderer.info.autoReset,
      player: playerModel(), playerVisible: playerModel()?.visible };
    renderer.render = function probeGate(s, c) { return state.drawing ? paused.render.call(this, s, c) : undefined; };
    if (look) look.render = function probeLookGate(s, c) { return state.drawing ? paused.lookRender.call(this, s, c) : true; };
    if (paused.player) paused.player.visible = false;
    state.paused = paused;
  }
  function resumeGameDrawing() {
    const p = state.paused; if (!p) return;
    p.renderer.render = p.render;
    if (p.look) p.look.render = p.lookRender;
    p.renderer.info.autoReset = p.autoReset;
    if (p.player) p.player.visible = p.playerVisible !== false;
    state.paused = null;
  }

  function drawOnce(cam) {
    const renderer = r(); const s = scene(); const look = host.__gw3dInkLook;
    const player = playerModel(); if (player) player.visible = false;
    renderer.info.autoReset = false;
    renderer.info.reset();
    state.drawing = true;
    try { if (look) look.render(s, cam); else renderer.render(s, cam); }
    finally { state.drawing = false; }
    return readInfo(renderer);
  }

  // governor off = the original pixel ratio, no adaptation (AdaptiveGraphics.mjs: profile 'off')
  function pinGovernor() {
    const gov = host.__axe3dCloneGovernor;
    const before = gov?.getSnapshot?.() || null;
    if (gov?.setProfile) gov.setProfile('off');
    return { governor: gov || null, before, pinnedTo: gov ? "profile 'off' (fixed pixel ratio, no adaptation)" : 'no governor present' };
  }
  function unpinGovernor(pin) { if (pin?.governor && pin.before?.profile) pin.governor.setProfile(pin.before.profile); }

  async function environment() {
    const renderer = r();
    let adapter = null;
    try {
      if (renderer?.backend?.isWebGPUBackend && navigator.gpu) {
        const a = await navigator.gpu.requestAdapter();
        const i = a?.info || (await a?.requestAdapterInfo?.());
        adapter = i ? { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description } : null;
      }
    } catch { adapter = null; }
    let browser = null;
    try { browser = (await navigator.userAgentData?.getHighEntropyValues?.(['fullVersionList', 'platformVersion']))?.fullVersionList || null; } catch { browser = null; }
    let graphicsSettings = null;
    try { graphicsSettings = JSON.parse(host.localStorage.getItem('game_graphics_settings') || 'null'); } catch { graphicsSettings = null; }
    const gl = glOf(renderer);
    let glRenderer = null;
    try { const ext = gl?.getExtension('WEBGL_debug_renderer_info'); glRenderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null; } catch { glRenderer = null; }
    return {
      backend: backendOf(renderer), rendererChoice: host.__gw3dRendererChoice || null, gpuInfo: host.__gw3dGpuInfo || null,
      adapter, glRenderer, userAgent: navigator.userAgent, browser,
      timestampQuery: !!renderer?.backend?.device?.features?.has?.('timestamp-query'),
      webglTimerQuery: !!glOf(renderer)?.getExtension?.('EXT_disjoint_timer_query_webgl2'),
      canvas: { width: renderer?.domElement?.width, height: renderer?.domElement?.height,
        cssWidth: renderer?.domElement?.clientWidth, cssHeight: renderer?.domElement?.clientHeight },
      pixelRatio: renderer?.getPixelRatio?.(), devicePixelRatio: host.devicePixelRatio,
      graphicsSettings, graphicsBudget: host.__gw3dGraphicsBudget || null,
      inkLevel: host.__gw3dInkLook?.level ?? null, inkPalette: host.__gw3dInkLook?.palette ?? null,
      wholeWorld: wholeWorld(), area: currentArea(),
      pageVisible: document.visibilityState, hasFocus: document.hasFocus?.() ?? null,
      rafPump: !!host.__gw3dRafPump,
      threeRoads: (() => { try { const w = host.__gw3dThreeRoads; return w ? { status: w.status?.() ?? null, places: w.get?.('places')?.status?.() ?? null } : null; } catch (error) { return { error: String(error?.message || error) }; } })(),
    };
  }

  async function waitFor(test, { timeoutMs = 60000, everyMs = 250, what = 'condition' } = {}) {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      let ok = false; try { ok = await test(); } catch { ok = false; }
      if (ok) return true;
      if (performance.now() > deadline) throw new Error(`perfProbe: timed out waiting for ${what}`);
      await sleep(everyMs);
    }
  }

  function rendererReady() {
    const renderer = r();
    return !!renderer && !!scene() && !!gameCamera() && (!renderer.isWebGPURenderer || renderer.__sceneState?.ready === true);
  }

  // Reach `view`: the same area -> move the player; another area -> the gate travel event (a new scene).
  async function reach(view) {
    await waitFor(rendererReady, { what: 'renderer' });
    if (wholeWorld()) { if (view.area !== 'town' || view.point !== 'town.plaza') say('whole-world scene: viewpoints are reached by moving the player'); }
    const area = currentArea();
    if (!wholeWorld() && area && area !== view.area) {
      const oldScene = scene();
      say(`travelling ${area} -> ${view.area} through game3dPortalTravel`);
      host.dispatchEvent(new CustomEvent('game3dPortalTravel', { detail: { target: 'wolfveil-area', area: view.area, gateway: 'perf-probe',
        landing: { x: view.worldX, y: 0, z: view.worldZ, yaw: 0 } } }));
      await waitFor(() => scene() && scene() !== oldScene && rendererReady() && currentArea() === view.area && playerModel(), { timeoutMs: 180000, what: `area ${view.area}` });
      await sleep(1500);
    }
    await waitFor(() => playerModel(), { timeoutMs: 90000, what: 'the player model (window.__gw3dWeaponDebug is dev-only: run on the dev server)' });
    const player = playerModel();
    await waitFor(() => Number.isFinite(groundAt(view)), { timeoutMs: 60000, what: 'ground under the viewpoint' });
    const y = groundAt(view);
    if (Math.hypot(player.position.x - view.worldX, player.position.z - view.worldZ) > 2) {
      player.position.set(view.worldX, y + 0.05, view.worldZ);
      player.updateMatrixWorld?.(true);
    }
    return y;
  }

  // Wait until what the probe camera sees stops changing (areas streaming in, grass rebuilt around the player,
  // asynchronous town and model loads): three readings in a row within 1 % of each other.
  async function settle(cam, { minMs = 2500, maxMs = 60000, everyMs = 800 } = {}) {
    const start = performance.now();
    await sleep(minMs);
    const readings = [];
    for (;;) {
      const player = playerModel(); const view = cam.userData.view;
      if (player && view && Math.hypot(player.position.x - view.worldX, player.position.z - view.worldZ) > 3) {
        player.position.set(view.worldX, (groundAt(view) ?? player.position.y) + 0.05, view.worldZ);
      }
      const info = drawOnce(cam);
      const loader = host.__gw3dRegionStreamingStatus;
      const busy = !!(loader?.batches?.settling || loader?.batches?.building);
      readings.push({ ...info, busy, pipelines: pipelineCount(r()).count });
      const last = readings.slice(-3);
      const stable = last.length === 3 && last.every((x) => !x.busy && x.drawCalls > 0) &&
        last.every((x) => Math.abs(x.drawCalls - last[0].drawCalls) <= Math.max(1, last[0].drawCalls * 0.01) &&
          Math.abs(x.triangles - last[0].triangles) <= Math.max(10, last[0].triangles * 0.01));
      if (stable) return { settledMs: Math.round(performance.now() - start), readings: readings.length, stable: true };
      if (performance.now() - start > maxMs) return { settledMs: Math.round(performance.now() - start), readings: readings.length, stable: false };
      await sleep(everyMs);
    }
  }

  async function timedFrames(cam, { frames = 90, warmup = 20, before = null } = {}) {
    const renderer = r();
    const pixel = new Uint8Array(4);
    const pipesBefore = pipelineCount(renderer).count;
    for (let i = 0; i < warmup; i++) { before?.(); drawOnce(cam); await waitForGpu(renderer, pixel); }
    const pipesAfterWarmup = pipelineCount(renderer).count;
    const timer = renderer.isWebGPURenderer && renderer.backend?.isWebGPUBackend ? createWebGPUPassTimer(renderer) : createWebGLFrameTimer(glOf(renderer));
    const wall = []; const cpu = []; const gpu = []; const span = [];
    let info = null; let passes = null;
    try {
      for (let i = 0; i < frames; i++) {
        before?.();
        timer?.begin();
        const t0 = performance.now();
        info = drawOnce(cam);
        const t1 = performance.now();
        await waitForGpu(renderer, pixel);
        const t2 = performance.now();
        const g = timer ? await timer.end() : null;
        wall.push(t2 - t0); cpu.push(t1 - t0);
        if (Number.isFinite(g?.gpuMs)) gpu.push(g.gpuMs);
        if (Number.isFinite(g?.spanMs)) span.push(g.spanMs);
        if (g) passes = g.passes;
      }
    } finally { timer?.uninstall(); }
    return {
      counts: info,
      frame: summarizeMs(wall), cpuSubmit: summarizeMs(cpu),
      gpu: gpu.length ? { ...summarizeMs(gpu), passesPerFrame: passes, spanMedianMs: summarizeMs(span)?.medianMs ?? null, timer: timer?.kind } : null,
      pipelines: { before: pipesBefore, afterWarmup: pipesAfterWarmup, after: pipelineCount(renderer).count },
    };
  }

  // Counted (not drawn) triangles of what is in the probe camera's view, by group and by top names.
  function inventory(cam = null, { top = 30 } = {}) {
    const camera = cam || gameCamera();
    camera.updateMatrixWorld(true);
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const chars = characterRoots();
    const byGroup = {}; const byName = new Map();
    for (const o of drawables()) {
      if (!visibleChain(o) || !camera.layers.test(o.layers)) continue;
      let inView = true;
      try { if (o.frustumCulled !== false && (o.geometry?.boundingSphere || o.geometry?.computeBoundingSphere)) inView = frustum.intersectsObject(o); } catch { inView = true; }
      if (!inView) continue;
      const group = classify(o, chars);
      if (group === 'player') continue; // hidden while the probe draws
      const tris = countTriangles(o);
      const g = byGroup[group] || (byGroup[group] = { meshes: 0, triangles: 0 });
      g.meshes++; g.triangles += tris;
      const path = []; for (let p = o; p && !p.isScene && path.length < 4; p = p.parent) if (p.name) path.unshift(p.name);
      const key = `${group} | ${path.slice(-3).join(' / ') || '(unnamed)'}`;
      const n = byName.get(key) || { meshes: 0, triangles: 0 }; n.meshes++; n.triangles += tris; byName.set(key, n);
    }
    return { method: 'counted: visible meshes whose bounds touch the view frustum (one draw per mesh/material assumed)', byGroup,
      top: [...byName].sort((a, b) => b[1].triangles - a[1].triangles).slice(0, top).map(([name, v]) => ({ name, ...v })) };
  }

  // Switch one group off; returns a function that switches it back on.
  function toggle(id) {
    const renderer = r();
    if (id === 'post') {
      const look = host.__gw3dInkLook; const level = look?.level;
      if (!look || !level) return { restore() {}, note: 'ink look already off' };
      look.setLevel(0);
      return { restore() { look.setLevel(level); look.setSize?.(); } };
    }
    if (id === 'shadows') {
      const lights = []; scene().traverse((o) => { if (o.isLight && o.castShadow) lights.push(o); });
      for (const l of lights) l.castShadow = false;
      renderer.shadowMap.needsUpdate = true;
      return { lights: lights.length, restore() { for (const l of lights) l.castShadow = true; renderer.shadowMap.needsUpdate = true; } };
    }
    if (id === 'shadowRefresh') {
      return { before() { renderer.shadowMap.needsUpdate = true; }, restore() { renderer.shadowMap.needsUpdate = true; } };
    }
    const chars = characterRoots();
    const hidden = [];
    for (const o of drawables()) {
      if (o.visible === false) continue;
      if (classify(o, chars) === id) hidden.push(o);
    }
    const apply = () => { for (const o of hidden) o.visible = false; };
    apply();
    return { meshes: hidden.length, before: apply, restore() { for (const o of hidden) o.visible = true; } };
  }

  async function measureView(view, { frames = 90, warmup = 20, label = null } = {}) {
    const groundY = await reach(view);
    const eyeY = groundY + PERF_EYE_HEIGHT;
    const cam = makeCamera(view, eyeY); cam.userData.view = view;
    const settled = await settle(cam);
    pauseGameDrawing();
    let timed;
    try { timed = await timedFrames(cam, { frames, warmup }); }
    finally { resumeGameDrawing(); }
    const budget = evaluateGame3DAreaBudget({ platform: 'browser', calls: timed.counts?.drawCalls, triangles: timed.counts?.triangles });
    const scenery = GAME3D_AREA_BUDGETS.browser;
    const result = {
      id: view.id, area: view.area, point: view.point, label: label || view.label, heading: view.heading,
      local: { x: view.x, z: view.z }, eye: { x: view.worldX, y: round(eyeY), z: view.worldZ, dirX: round(view.dirX, 3), dirZ: round(view.dirZ, 3) },
      sceneArea: currentArea(), settled, ...timed,
      budget: { drawCallShare: round(budget.drawCallShare, 3), triangleShare: round(budget.triangleShare, 3), within: budget.within, over: budget.over,
        sceneryDrawCallShare: round((timed.counts?.drawCalls ?? 0) / scenery.sceneryDrawCalls, 3),
        sceneryTriangleShare: round((timed.counts?.triangles ?? 0) / scenery.sceneryTriangles, 3) },
      inventory: inventory(cam, { top: 12 }),
    };
    say(`${view.id}: ${timed.counts?.drawCalls} calls, ${timed.counts?.triangles} tris, frame median ${timed.frame?.medianMs} ms, gpu ${timed.gpu?.medianMs ?? '-'} ms`);
    return result;
  }

  // Each group off in turn at one view (and back on): change in calls, triangles and time.
  async function toggleSweep(view, { ids = [...groups.map((g) => g.id), ...PERF_SPECIAL_TOGGLES.map((t) => t.id)], frames = 60, warmup = 15 } = {}) {
    const groundY = await reach(view);
    const cam = makeCamera(view, groundY + PERF_EYE_HEIGHT); cam.userData.view = view;
    await settle(cam);
    const rows = [];
    pauseGameDrawing();
    try {
      const base = await timedFrames(cam, { frames, warmup });
      rows.push({ id: 'baseline', counts: base.counts, frame: base.frame, gpu: base.gpu, pipelines: base.pipelines });
      for (const id of ids) {
        const t = toggle(id);
        let m;
        try { m = await timedFrames(cam, { frames, warmup, before: t.before }); }
        finally { t.restore(); }
        rows.push({ id, label: [...groups, ...PERF_SPECIAL_TOGGLES].find((g) => g.id === id)?.label || id, meshesHidden: t.meshes ?? null, lights: t.lights ?? null,
          counts: m.counts, frame: m.frame, gpu: m.gpu, pipelines: m.pipelines,
          delta: { drawCalls: (m.counts?.drawCalls ?? 0) - (base.counts?.drawCalls ?? 0), triangles: (m.counts?.triangles ?? 0) - (base.counts?.triangles ?? 0),
            frameMedianMs: round((m.frame?.medianMs ?? 0) - (base.frame?.medianMs ?? 0)), gpuMedianMs: m.gpu && base.gpu ? round(m.gpu.medianMs - base.gpu.medianMs) : null } });
        say(`toggle ${view.id} ${id}: calls ${rows.at(-1).delta.drawCalls}, tris ${rows.at(-1).delta.triangles}, frame ${rows.at(-1).delta.frameMedianMs} ms`);
      }
      // check that everything came back
      const after = await timedFrames(cam, { frames: 20, warmup: 5 });
      rows.push({ id: 'restored', counts: after.counts, frame: after.frame, gpu: after.gpu });
    } finally { resumeGameDrawing(); }
    return { view: view.id, area: view.area, rows };
  }

  async function post(result, url) {
    const target = url || new URLSearchParams(host.location.search).get('perfPost');
    if (!target) return { posted: false };
    const res = await fetch(target, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(result) });
    return { posted: res.ok, status: res.status, reply: await res.text() };
  }

  // A full run: every viewpoint of the chosen areas (in area order), optional toggle sweeps at each area's worst view.
  async function run({ label = 'run', areas = PERF_AREAS, ids = null, frames = 90, warmup = 20, toggles = false, toggleIds,
    postUrl = null, governor = 'pin' } = {}) {
    const startedAt = new Date().toISOString();
    const pin = governor === 'pin' ? pinGovernor() : null;
    const raf = await measureRafInterval(host);
    const result = { schema: PERF_PROBE_SCHEMA, label, startedAt, page: host.location.pathname + host.location.search,
      env: null, governor: pin ? { pinnedTo: pin.pinnedTo, before: pin.before } : { pinnedTo: 'not pinned' },
      rafIntervalMs: raf, settings: { frames, warmup, eyeHeight: PERF_EYE_HEIGHT, playerHidden: true, gameDrawingPausedWhileTiming: true },
      views: [], toggles: [], errors: [], log: state.log };
    try {
      await waitFor(rendererReady, { what: 'renderer' });
      result.env = await environment();
      const views = perfViewpoints({ areas, ids });
      // the area the page is in first: saves one remount
      const here = currentArea();
      views.sort((a, b) => (a.area === here ? -1 : 0) - (b.area === here ? -1 : 0) || areas.indexOf(a.area) - areas.indexOf(b.area));
      for (const view of views) {
        try { result.views.push(await measureView(view, { frames, warmup })); }
        catch (error) { result.errors.push({ view: view.id, error: String(error?.message || error) }); say(`${view.id} failed: ${error?.message || error}`); }
        if (toggles && view === views.filter((v) => v.area === view.area).at(-1)) {
          const measured = result.views.filter((v) => v.area === view.area && v.counts);
          const worst = measured.sort((a, b) => (b.frame?.medianMs ?? 0) - (a.frame?.medianMs ?? 0))[0];
          if (worst) {
            try { result.toggles.push(await toggleSweep(perfViewpoints({ ids: [worst.id] })[0], { ids: toggleIds })); }
            catch (error) { result.errors.push({ view: `${worst.id} toggles`, error: String(error?.message || error) }); }
          }
        }
      }
      result.envAfter = await environment();
    } finally {
      unpinGovernor(pin);
      result.finishedAt = new Date().toISOString();
    }
    state.last = result;
    try { result.post = await post(result, postUrl); } catch (error) { result.post = { posted: false, error: String(error?.message || error) }; }
    return result;
  }

  const api = { schema: PERF_PROBE_SCHEMA, groups, specialToggles: PERF_SPECIAL_TOGGLES, viewpoints: perfViewpoints,
    run, measureView, toggleSweep, inventory, toggle, environment, settle, reach, post, installRafPump: () => installRafPump(host),
    restoreRafPump: () => host.__gw3dRafPump?.restore(), pinGovernor, unpinGovernor, pauseGameDrawing, resumeGameDrawing,
    makeCamera, classify: (o) => classify(o, characterRoots()),
    get last() { return state.last; }, get log() { return state.log; } };
  return api;
}

/** Install on window.__gw3dPerfProbe (idempotent). perfPump=1 also installs the rAF pump. perfRun=1 runs once the world is up. */
export function installGame3DPerfProbe(host = window) {
  if (host.__gw3dPerfProbe) return host.__gw3dPerfProbe;
  const params = new URLSearchParams(host.location?.search || '');
  if (params.get('perfPump') === '1') installRafPump(host);
  const probe = createGame3DPerfProbe({ host });
  host.__gw3dPerfProbe = probe;
  console.info('[perfProbe] ready: await __gw3dPerfProbe.run({label:"before", toggles:true})');
  const auto = params.get('perfRun');
  if (auto) {
    const start = () => {
      host.removeEventListener('gw3dSceneReady', start);
      setTimeout(() => {
        probe.run({ label: params.get('perfLabel') || 'run', toggles: params.get('perfToggles') === '1',
          areas: params.get('perfAreas') ? params.get('perfAreas').split(',') : PERF_AREAS })
          .then((result) => console.info('[perfProbe] finished', result.post))
          .catch((error) => console.error('[perfProbe] failed', error));
      }, 4000);
    };
    if (host.__gw3dScene && host.__gw3dWeaponDebug?.model) start(); else host.addEventListener('gw3dSceneReady', start);
  }
  return probe;
}
