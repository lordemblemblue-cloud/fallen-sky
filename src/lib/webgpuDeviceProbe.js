/**
 * Measures once whether WebGPU is at least as fast as the classic WebGL renderer on this device, and stores the
 * verdict (webgpuDeviceVerdict.mjs) that makes WebGPU the default for WebGPU-ready scenes on this device
 * (rendererBackendChoice.mjs). Until a verdict exists, and wherever WebGPU measured slower, the classic renderer stays.
 *
 * A small scene shaped like the game's load (a few hundred lit meshes in front of full-screen lit layers, fog, ACES
 * tone mapping, sRGB output) is drawn by each renderer into its own off-screen canvas, in alternating rounds; the
 * best mean frame time of each, measured until the GPU finished, is compared. WebGPU's shaders are compiled in the
 * background first (precompileSceneObjects), so the measurement never stalls the page; it takes about a second of
 * GPU time once per browser build (a verdict is kept 30 days).
 */
import * as THREE from 'three';
import { createWebGPUSceneRenderer, precompileSceneObjects } from './webgpuSceneRenderer.js';
import { readDeviceVerdict, writeDeviceVerdict, verdictFromTimings } from './webgpuDeviceVerdict.mjs';
import { RENDERER_FAILED_KEY } from './rendererBackendChoice.mjs';

const WIDTH = 960;
const HEIGHT = 540;
const FRAMES = 30;
const WARMUP = 6;
const ROUNDS = 2;

function buildProbeScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8899aa, 30, 160);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x334422, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(20, 40, 15);
  scene.add(sun);
  const geometries = [new THREE.BoxGeometry(1, 1, 1), new THREE.SphereGeometry(0.6, 20, 14),
    new THREE.CylinderGeometry(0.4, 0.5, 1.4, 16), new THREE.PlaneGeometry(400, 220)];
  const materials = Array.from({ length: 24 }, (_, i) => new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(i / 24, 0.55, 0.5), roughness: 0.55 + (i % 4) * 0.1, metalness: i % 5 === 0 ? 0.6 : 0,
  }));
  for (let i = 0; i < 320; i++) {
    const mesh = new THREE.Mesh(geometries[i % 3], materials[i % materials.length]);
    mesh.position.set((i % 20) * 2.2 - 21, (Math.floor(i / 20) % 4) * 2 - 3, -Math.floor(i / 80) * 6 - 8);
    mesh.rotation.set(i * 0.3, i * 0.7, 0);
    scene.add(mesh);
  }
  // full-screen lit layers drawn back to front (the overdraw of terrain, grass and buildings)
  const ground = new THREE.MeshStandardMaterial({ color: 0x6f8f4f, roughness: 0.9 });
  materials.push(ground);
  for (let k = 0; k < 5; k++) {
    const layer = new THREE.Mesh(geometries[3], ground);
    layer.position.z = -40 - k * 5;
    layer.renderOrder = -10 - k;
    scene.add(layer);
  }
  const camera = new THREE.PerspectiveCamera(55, WIDTH / HEIGHT, 0.1, 400);
  camera.position.set(0, 1, 12);
  camera.lookAt(0, 0, -20);
  return { scene, camera, dispose: () => { geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); } };
}

// Frames go to an off-screen render target (as the game's scene pass into the ink look's target): a canvas would be
// paced by presentation. One wait for the GPU at the end of each run.
async function meanFrameMs(render, finish) {
  for (let i = 0; i < WARMUP; i++) render();
  await finish();
  const started = performance.now();
  for (let i = 0; i < FRAMES; i++) render();
  await finish();
  return (performance.now() - started) / FRAMES;
}

/**
 * Draw the probe scene on both renderers; resolves with a verdict (verdictFromTimings), or with
 * { webgpuAtLeastAsFast: false, reason } when WebGPU cannot run here. Rejects only on unexpected errors.
 */
export async function measureRendererSpeed() {
  const classicCanvas = document.createElement('canvas');
  const webgpuCanvas = document.createElement('canvas');
  const classicScene = buildProbeScene();
  const webgpuScene = buildProbeScene();
  const classic = new THREE.WebGLRenderer({ canvas: classicCanvas, antialias: true, powerPreference: 'high-performance' });
  let webgpu = null;
  const disposables = [];
  try {
    for (const r of [classic]) {
      r.setPixelRatio(1); r.setSize(WIDTH, HEIGHT, false);
      r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    }
    const targetOptions = { type: THREE.HalfFloatType, depthBuffer: true };
    const classicTarget = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, targetOptions);
    disposables.push(classicTarget);
    const pixel = new Uint16Array(4);
    const finishClassic = () => {
      classic.readRenderTargetPixels(classicTarget, 0, 0, 1, 1, pixel); // returns once the GPU has drawn it
      return Promise.resolve();
    };
    classic.setRenderTarget(classicTarget);
    classic.compile(classicScene.scene, classicScene.camera);

    const created = createWebGPUSceneRenderer({ canvas: webgpuCanvas, antialias: true, powerPreference: 'high-performance' });
    webgpu = created.renderer;
    let api = null;
    try { ({ api } = await created.ready); } catch { return { webgpuAtLeastAsFast: false, reason: 'webgpu-unavailable' }; }
    if (api !== 'WebGPU') return { webgpuAtLeastAsFast: false, reason: 'webgpu-unavailable' };
    webgpu.setPixelRatio(1); webgpu.setSize(WIDTH, HEIGHT, false);
    webgpu.toneMapping = THREE.ACESFilmicToneMapping; webgpu.outputColorSpace = THREE.SRGBColorSpace;
    const webgpuTarget = new THREE.RenderTarget(WIDTH, HEIGHT, targetOptions);
    disposables.push(webgpuTarget);
    await precompileSceneObjects(webgpu, webgpuScene.scene, webgpuScene.camera, { target: webgpuTarget, timeoutMs: 20000 });
    webgpu.setRenderTarget(webgpuTarget);
    const device = webgpu.backend.device;
    const finishWebGPU = () => device.queue.onSubmittedWorkDone();

    let classicMs = Infinity;
    let webgpuMs = Infinity;
    for (let round = 0; round < ROUNDS; round++) {
      classicMs = Math.min(classicMs, await meanFrameMs(() => classic.render(classicScene.scene, classicScene.camera), finishClassic));
      webgpuMs = Math.min(webgpuMs, await meanFrameMs(() => webgpu.render(webgpuScene.scene, webgpuScene.camera), finishWebGPU));
    }
    return verdictFromTimings({ webglMs: classicMs, webgpuMs });
  } finally {
    // the scenes first, while their renderers still track them (three reacts to each material's dispose)
    try { classicScene.dispose(); } catch { /* best effort */ }
    try { webgpuScene.dispose(); } catch { /* best effort */ }
    for (const d of disposables) { try { d.dispose(); } catch { /* best effort */ } }
    try { classic.dispose(); classic.getContext().getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* best effort */ }
    try { webgpu?.dispose(); } catch { /* best effort */ }
  }
}

let scheduled = false;

/**
 * Measure in the background (idle time, after `delayMs`) unless this browser build already has a verdict, WebGPU is
 * not offered, or WebGPU failed in this tab. Once per page; the verdict applies from the next scene start.
 * Returns true when a measurement was scheduled.
 */
export function scheduleRendererProbe(host = globalThis.window, { delayMs = 4000 } = {}) {
  if (scheduled) return false;
  let storage = null;
  let fingerprint = '';
  try {
    if (!host?.navigator?.gpu || !host.document) return false;
    if (host.sessionStorage?.getItem?.(RENDERER_FAILED_KEY) === '1') return false;
    storage = host.localStorage || null;
    fingerprint = String(host.navigator.userAgent || '');
  } catch { return false; }
  if (!storage || readDeviceVerdict({ storage, fingerprint })) return false;
  scheduled = true;
  const run = async () => {
    try {
      const verdict = await measureRendererSpeed();
      if (!verdict) return;
      writeDeviceVerdict({ storage, fingerprint, verdict });
      const how = verdict.reason ? `(${verdict.reason})`
        : `(WebGPU ${verdict.webgpuMs} ms vs WebGL ${verdict.webglMs} ms a frame)`;
      console.info(`[renderer] WebGPU ${verdict.webgpuAtLeastAsFast ? 'is' : 'is not'} the default on this device ${how}`);
    } catch (error) {
      console.info('[renderer] WebGPU speed check skipped:', error?.message || error);
    }
  };
  const start = () => (typeof host.requestIdleCallback === 'function'
    ? host.requestIdleCallback(() => { run(); }, { timeout: 8000 })
    : host.setTimeout(run, 0));
  host.setTimeout(start, delayMs);
  return true;
}
