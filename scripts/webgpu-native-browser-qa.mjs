/**
 * Inspect an already-open game tab using a locally started Chrome/Edge DevTools port.
 * Node 22+ only; no npm browser driver or remote telemetry. This cannot certify
 * visible pixels without a human reviewing the optional screenshot.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCENE_KEYS = Object.freeze({
  'fallen-sky': '__gw3dRenderer',
  'duelist-adventure': '__duelistGameRenderer',
});

/** Self-contained: this function is serialized and evaluated inside the browser tab. */
function inspectLiveScene(rendererKey, sceneId) {
  try {
    const renderer = window[rendererKey];
    const state = renderer?.__sceneState;
    const ready = state?.ready === true;
    const webgpuRenderer = renderer?.isWebGPURenderer === true;
    const backend = !renderer ? 'none' : !webgpuRenderer ? 'classic-webgl'
      : !ready ? 'initializing'
        : renderer.backend?.isWebGPUBackend === true ? 'webgpu' : 'webgl2-fallback';
    const device = backend === 'webgpu' ? renderer.backend?.device : null;
    const deviceConfirmed = Boolean(device && typeof device.createCommandEncoder === 'function'
      && typeof device.queue?.submit === 'function');
    const frames = renderer?.info?.render?.frame;
    const gameplayFrames = state?.gameplayFrames;
    return {
      sceneId, backend, deviceConfirmed, deviceLost: Boolean(state?.lost),
      frameCount: Number.isSafeInteger(frames) && frames >= 0 ? frames : null,
      gameplayFrames: Number.isSafeInteger(gameplayFrames) && gameplayFrames >= 0 ? gameplayFrames : null,
      canvasAttached: renderer?.domElement?.isConnected === true,
    };
  } catch (error) {
    return { sceneId, backend: 'unavailable', error: String(error?.message || error) };
  }
}

export function buildBrowserExpression(sceneId) {
  if (!Object.hasOwn(SCENE_KEYS, sceneId)) throw new Error('Unknown scene ID: ' + sceneId);
  return '(' + inspectLiveScene.toString() + ')('
    + JSON.stringify(SCENE_KEYS[sceneId]) + ',' + JSON.stringify(sceneId) + ')';
}

export function classifySamplePair(first, last) {
  const fail = (reason) => ({ ok: false, reason });
  if (!first || !last || first.sceneId !== last.sceneId ||
    !Object.hasOwn(SCENE_KEYS, last.sceneId)) return fail('invalid-scene-samples');
  if (last.backend !== 'webgpu') return fail('not-native-webgpu:' + last.backend);
  if (first.backend !== 'webgpu') return fail('backend-changed-during-sample');
  if (!first.deviceConfirmed || !last.deviceConfirmed) return fail('gpu-device-not-confirmed');
  if (first.canvasAttached !== true || last.canvasAttached !== true) return fail('renderer-canvas-not-attached');
  if (first.deviceLost || last.deviceLost) return fail('gpu-device-lost');
  for (const sample of [first, last]) {
    if (!Number.isSafeInteger(sample.frameCount) || sample.frameCount < 0 ||
      !Number.isSafeInteger(sample.gameplayFrames) || sample.gameplayFrames < 0) {
      return fail('invalid-render-counters');
    }
  }
  if (last.frameCount <= first.frameCount) return fail('render-frame-counter-not-advancing');
  if (last.gameplayFrames <= first.gameplayFrames) return fail('gameplay-draw-counter-not-advancing');
  return { ok: true, reason: 'native-webgpu-gameplay-draws-advancing' };
}

export function pickTarget(targets, sceneId, tabContains = '') {
  if (!Object.hasOwn(SCENE_KEYS, sceneId)) throw new Error('Unknown scene ID: ' + sceneId);
  const expected = sceneId === 'fallen-sky' ? '/gameview' : '/duelist-next/play';
  const pages = targets.filter((target) => {
    if (target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
    try {
      const url = new URL(target.url);
      if (!['https:', 'http:'].includes(url.protocol)) return false;
      return tabContains ? target.url.includes(tabContains)
        : url.pathname === expected || url.pathname.startsWith(expected + '/');
    } catch { return false; }
  });
  if (pages.length !== 1) {
    throw new Error('Expected exactly one matching game tab for ' + sceneId +
      '; found ' + pages.length + '. Use --tab-contains=... to select a specific tab.');
  }
  return pages[0];
}

export function requireLocalCdpWebSocket(webSocketUrl, expectedPort) {
  let url;
  try { url = new URL(webSocketUrl); } catch { throw new Error('Invalid DevTools WebSocket URL'); }
  if (!['ws:', 'wss:'].includes(url.protocol) ||
    !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
    url.username || url.password) {
    throw new Error('DevTools WebSocket must use a loopback host');
  }
  if (expectedPort !== undefined && Number(url.port || (url.protocol === 'wss:' ? 443 : 80)) !== expectedPort) {
    throw new Error('DevTools WebSocket port does not match the selected local CDP port');
  }
  return url.href;
}

async function connectCdp(webSocketUrl, expectedPort) {
  const socket = new WebSocket(requireLocalCdpWebSocket(webSocketUrl, expectedPort));
  const pending = new Map();
  let nextId = 0;
  const rejectPending = (message) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
    pending.clear();
  };
  socket.addEventListener('message', (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (!data.id || !pending.has(data.id)) return;
    const entry = pending.get(data.id);
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.error) entry.reject(new Error(data.error.message || 'DevTools request failed'));
    else entry.resolve(data.result);
  });
  socket.addEventListener('close', () => rejectPending('DevTools connection closed'));
  await new Promise((yes, no) => {
    socket.addEventListener('open', yes, { once: true });
    socket.addEventListener('error', () => no(new Error('Unable to connect to local DevTools port')), { once: true });
  });
  return {
    send(method, params = {}) {
      return new Promise((yes, no) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          no(new Error('DevTools timed out: ' + method));
        }, 15000);
        pending.set(id, { resolve: yes, reject: no, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

function parseOptions(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) throw new Error('Unexpected argument: ' + token);
    const separator = token.indexOf('=');
    const name = separator < 0 ? token.slice(2) : token.slice(2, separator);
    const value = separator < 0 ? true : token.slice(separator + 1);
    if (!['scene', 'cdp-port', 'sample-ms', 'tab-contains', 'out', 'screenshot'].includes(name)) {
      throw new Error('Unknown option: ' + name);
    }
    options[name] = value;
  }
  if (!Object.hasOwn(SCENE_KEYS, options.scene)) {
    throw new Error('Use --scene=fallen-sky or --scene=duelist-adventure');
  }
  const port = Number(options['cdp-port'] ?? 9222);
  const wait = Number(options['sample-ms'] ?? 2000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CDP port');
  if (!Number.isSafeInteger(wait) || wait < 250 || wait > 30000) throw new Error('Invalid sample interval');
  return { ...options, port, wait };
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv);
  // Only talk to a locally launched Chrome/Edge instance; never expose DevTools remotely.
  const response = await fetch('http://127.0.0.1:' + opts.port + '/json/list');
  if (!response.ok) throw new Error('Local DevTools HTTP ' + response.status);
  const target = pickTarget(await response.json(), opts.scene, opts['tab-contains'] || '');
  const client = await connectCdp(target.webSocketDebuggerUrl, opts.port);
  let report;
  try {
    await client.send('Runtime.enable');
    const sample = async () => {
      const response = await client.send('Runtime.evaluate', {
        expression: buildBrowserExpression(opts.scene), returnByValue: true,
      });
      if (response.exceptionDetails) throw new Error('Browser evaluation failed');
      return response.result?.value;
    };
    const first = await sample();
    await new Promise((done) => setTimeout(done, opts.wait));
    const last = await sample();
    report = { checkedAt: new Date().toISOString(), sceneId: opts.scene,
      tabUrl: target.url, ...classifySamplePair(first, last), first, last,
      screenshot: null, screenshotNote: 'Draws are not proof of visible pixels; inspect a screenshot.' };
    if (opts.screenshot) {
      await client.send('Page.enable');
      const capture = await client.send('Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: false });
      const path = resolve(opts.out ? opts.out.replace(/(\.json)?$/i, '.png')
        : 'webgpu-native-qa-' + opts.scene + '.png');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, Buffer.from(capture.data, 'base64'));
      report.screenshot = path;
    }
  } finally {
    client.close();
  }
  if (opts.out) {
    const path = resolve(opts.out);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Native WebGPU QA error: ' + error.message);
    process.exitCode = 1;
  });
}
