// Area load timing and counted inventory for Game 3D, a developer tool used for docs/GAME3D_LOW_POLY_20261122.md.
// Dev server only (it is imported by hand from the page, never by the game):
//
//   const t = await import('/src/components/game3d/performance/Game3DAreaLoadTiming.mjs');
//   t.installAreaLoadTiming(window);          // before ENTER WORLD, so resource timing keeps every download
//   await t.timeWorldEntry(window);           // clicks ENTER WORLD, returns { shownMs, settledMs, ... }
//   await t.timeAreaTravel(window, 'south');  // the game's own gate event, same fields
//
// shownMs: from the click / gate event until the entry curtain is gone and the new scene draws.
// settledMs: until the counted scene (visible meshes, triangles, draw calls) has not changed for three readings
// 0.8 s apart and the area loader is idle: the late model loads (town, trees, grass) are in by then.
// downloads: model and texture files fetched since the start (resource timing; a file served from the browser
// cache counts with its size and ~0 ms).
import { inventoryGame3DScene } from './Game3DSceneInventory.mjs';
import { PERF_POINTS, PERF_WORLD_Z_OFFSET } from './Game3DPerfViewpoints.mjs';

const MODEL_OR_TEXTURE = /\.(glb|gltf|fbx|bin|png|jpe?g|webp|ktx2|hdr|exr)(\?|$)/i;

// MessageChannel waits: a hidden pane throttles setTimeout, not messages.
let channel = null;
const waiters = [];
function poll() {
  const now = performance.now();
  for (let i = waiters.length - 1; i >= 0; i--) if (now >= waiters[i].at) waiters.splice(i, 1)[0].resolve();
  if (waiters.length) channel.port2.postMessage(0);
}
export function sleep(ms) {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') { setTimeout(resolve, ms); return; }
    if (!channel) { channel = new MessageChannel(); channel.port1.onmessage = poll; }
    waiters.push({ at: performance.now() + ms, resolve });
    channel.port2.postMessage(0);
  });
}

async function waitFor(test, { timeoutMs = 180000, everyMs = 100 } = {}) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) { if (test()) return true; await sleep(everyMs); }
  return false;
}

export function installAreaLoadTiming(host = globalThis) {
  try { host.performance?.setResourceTimingBufferSize?.(50000); } catch { /* older browser */ }
  return true;
}

function counted(host) {
  const scene = host.__gw3dScene;
  if (!scene) return null;
  const inv = inventoryGame3DScene(scene, { camera: host.__gw3dCamera, depth: 1 });
  return { inv, ...inv.totals };
}

function downloadsSince(host, t0) {
  const entries = host.performance.getEntriesByType('resource').filter((e) => e.startTime >= t0 && MODEL_OR_TEXTURE.test(e.name));
  const files = entries.map((e) => ({ file: e.name.replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(-90),
    kb: Math.round((e.decodedBodySize || e.encodedBodySize || 0) / 1024), transferKb: Math.round((e.transferSize || 0) / 1024),
    ms: Math.round(e.duration) }));
  files.sort((a, b) => b.kb - a.kb);
  return { files: files.length, mb: Math.round(files.reduce((a, f) => a + f.kb, 0) / 102.4) / 10,
    transferMb: Math.round(files.reduce((a, f) => a + f.transferKb, 0) / 102.4) / 10, largest: files.slice(0, 25) };
}

async function settle(host, t0, { maxMs = 120000 } = {}) {
  const readings = [];
  for (;;) {
    const c = counted(host);
    const loader = host.__gw3dRegionStreamingStatus;
    const busy = !!(loader?.batches?.settling || loader?.batches?.building);
    if (c) readings.push({ at: performance.now(), busy, meshes: c.meshes, triangles: c.triangles, drawCalls: c.drawCalls });
    const last = readings.slice(-3);
    if (last.length === 3 && last.every((r) => !r.busy && r.drawCalls > 0 &&
      r.meshes === last[0].meshes && Math.abs(r.triangles - last[0].triangles) <= last[0].triangles * 0.002)) {
      return { settledMs: Math.round(last[0].at - t0), stable: true };
    }
    if (performance.now() - t0 > maxMs) return { settledMs: Math.round(performance.now() - t0), stable: false };
    await sleep(800);
  }
}

function curtainGone(host) {
  return !host.document.querySelector('.axe-world-entry-curtain');
}

function summary(host, t0, shownAt, settled, extra = {}) {
  const c = counted(host);
  const groups = c.inv.groups.slice(0, 25).map((g) => ({ owner: g.owner.slice(0, 80), meshes: g.meshes, triangles: g.triangles,
    drawCalls: g.drawCalls, texMB: Math.round(g.textureBytes / 1048576) }));
  return {
    ...extra,
    renderer: host.__gw3dRendererChoice?.kind ?? null,
    area: host.__gw3dRegionStreamingStatus?.area ?? null,
    shownMs: shownAt ? Math.round(shownAt - t0) : null,
    ...settled,
    counted: { meshes: c.meshes, triangles: c.triangles, drawCalls: c.drawCalls, textures: c.textures,
      textureMB: Math.round(c.textureBytes / 1048576) },
    groups,
    precompile: host.__gw3dPrecompile ?? null,
    downloads: downloadsSince(host, t0),
  };
}

/** Click ENTER WORLD (a saved character must exist on this origin) and time the entry. */
export async function timeWorldEntry(host = globalThis) {
  const button = [...host.document.querySelectorAll('button')].find((b) => /ENTER WORLD/.test(b.textContent || ''));
  if (!button) throw new Error('no ENTER WORLD button');
  const t0 = performance.now();
  button.click();
  await waitFor(() => host.__gw3dScene && host.document.querySelector('.axe-world-entry-curtain'), { timeoutMs: 20000 });
  await waitFor(() => host.__gw3dScene && curtainGone(host));
  const shownAt = performance.now();
  const settled = await settle(host, t0);
  return summary(host, t0, shownAt, settled, { kind: 'entry' });
}

/**
 * Travel to an area through the game's own gate event, landing at the area's first perf viewpoint.
 * shownMs here = until the game's own 'game3dWorldAvatarReady' (the moment it lifts the loading curtain; on WebGPU
 * after the new scene's shaders are compiled). GameView shows "World entry interrupted" when that takes over 30 s;
 * the result records whether it did (curtainError).
 */
export async function timeAreaTravel(host = globalThis, area, { point = null } = {}) {
  const p = point || PERF_POINTS.find((q) => q.area === area);
  if (!p) throw new Error(`no viewpoint for ${area}`);
  const oldScene = host.__gw3dScene;
  let readyAt = null;
  const onReady = () => { readyAt ??= performance.now(); };
  host.addEventListener('game3dWorldAvatarReady', onReady);
  const t0 = performance.now();
  host.dispatchEvent(new CustomEvent('game3dPortalTravel', { detail: { target: 'wolfveil-area', area, gateway: 'load-timing',
    landing: { x: p.x, y: 0, z: p.z + PERF_WORLD_Z_OFFSET, yaw: 0 } } }));
  await waitFor(() => host.__gw3dScene && host.__gw3dScene !== oldScene);
  const sceneAt = performance.now();
  await waitFor(() => readyAt != null && host.__gw3dRegionStreamingStatus?.area === area, { timeoutMs: 240000 });
  host.removeEventListener('game3dWorldAvatarReady', onReady);
  const curtainError = /interrupted/i.test(host.document.querySelector('.axe-world-entry-curtain')?.innerText || '');
  const settled = await settle(host, t0);
  return summary(host, t0, readyAt, settled, { kind: 'travel', to: area, landing: `${p.area}.${p.key}`,
    sceneMs: Math.round(sceneAt - t0), curtainError });
}

/** POST a result to scripts/game3d-perf-receiver.mjs (it accepts any game3d-perf-probe/* schema). */
export async function postResult(url, label, result) {
  const body = JSON.stringify({ schema: 'game3d-perf-probe/load-1', label, startedAt: new Date().toISOString(), ...result });
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body });
  return response.text();
}
