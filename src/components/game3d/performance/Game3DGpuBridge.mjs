// Local graphics-card report. The browser cannot see dedicated video memory.
// A program on this computer can, and the page reads only what that program
// writes: a JSON file the player selects, or http://127.0.0.1 with a pairing code.
export const GAME3D_GPU_BRIDGE_KIND = 'fallen-sky-gpu-report';
export const GAME3D_GPU_BRIDGE_PORT = 47321;
export const GAME3D_GPU_BRIDGE_SESSION_KEY = 'game3d_gpu_bridge_report_v1';
export const GAME3D_GPU_BRIDGE_DOWNLOAD =
  'https://github.com/lordemblemblue-cloud/fallen-sky/blob/main/tools/gpu-bridge/Export-FallenSkyGpu.ps1';

const LOOPBACK = new Set(['127.0.0.1', 'localhost']);

function finiteBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1024 ** 5) return null;
  return Math.round(number);
}

export function formatGpuMemory(bytes) {
  const size = finiteBytes(bytes);
  if (!size) return null;
  const gb = size / (1024 ** 3);
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

export function parseGame3DGpuReport(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || data.kind !== GAME3D_GPU_BRIDGE_KIND || Number(data.version) !== 1)
    throw new Error('This is not a Fallen Sky graphics-card report.');
  if (!Array.isArray(data.adapters) || data.adapters.length < 1)
    throw new Error('The graphics-card report did not list an adapter.');
  const adapters = data.adapters.slice(0, 4).map(adapter => {
    const name = String(adapter?.name || '').trim().slice(0, 160);
    if (!name) throw new Error('A graphics adapter in the report has no name.');
    return Object.freeze({
      name,
      dedicatedVideoMemoryBytes: finiteBytes(adapter.dedicatedVideoMemoryBytes),
      sharedSystemMemoryBytes: finiteBytes(adapter.sharedSystemMemoryBytes),
      driverVersion: adapter.driverVersion ? String(adapter.driverVersion).slice(0, 80) : null,
      memorySource: adapter.memorySource ? String(adapter.memorySource).slice(0, 40) : null,
    });
  });
  return Object.freeze({
    kind: GAME3D_GPU_BRIDGE_KIND,
    version: 1,
    collectedAt: typeof data.collectedAt === 'string' ? data.collectedAt.slice(0, 40) : null,
    adapters: Object.freeze(adapters),
  });
}

export function describeGame3DGpuReport(report) {
  if (!report?.adapters?.length) return 'No graphics-card report is connected.';
  return report.adapters.map(adapter => {
    const memory = formatGpuMemory(adapter.dedicatedVideoMemoryBytes);
    return memory
      ? `${adapter.name}: ${memory} dedicated video memory, from ${adapter.memorySource || 'the local report'}.`
      : `${adapter.name}: connected, but the report had no trusted video-memory size.`;
  }).join(' ');
}

export async function fetchGame3DGpuBridge({
  pairingCode, host = '127.0.0.1', port = GAME3D_GPU_BRIDGE_PORT,
  fetchImpl = globalThis.fetch, signal,
} = {}) {
  const code = String(pairingCode || '').trim();
  if (!/^[A-Za-z0-9]{6,12}$/.test(code))
    throw new Error('Enter the pairing code printed by the graphics-card bridge.');
  if (!LOOPBACK.has(host))
    throw new Error('The graphics-card bridge is only read from this computer.');
  let response;
  try {
    response = await fetchImpl(`http://${host}:${port}/gpu`, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'X-Fallen-Sky-Token': code },
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('The bridge is not running. Start Export-FallenSkyGpu.ps1 and leave its window open.');
  }
  if (!response?.ok) {
    throw new Error(response?.status === 401
      ? 'The pairing code was rejected. Use the code from the open bridge window.'
      : 'The graphics-card bridge did not return a report.');
  }
  return parseGame3DGpuReport(await response.json());
}
