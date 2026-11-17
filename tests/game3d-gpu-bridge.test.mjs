import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  describeGame3DGpuReport, fetchGame3DGpuBridge, parseGame3DGpuReport,
} from '../src/components/game3d/performance/Game3DGpuBridge.mjs';

const menu = readFileSync(new URL('../src/components/game3d/PauseMenu.jsx', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../tools/gpu-bridge/Export-FallenSkyGpu.ps1', import.meta.url), 'utf8');
const report = {
  kind: 'fallen-sky-gpu-report',
  version: 1,
  pairingCode: 'SECRET12',
  collectedAt: '2026-11-17T00:00:00.000Z',
  adapters: [{
    name: 'NVIDIA GeForce RTX 4070',
    dedicatedVideoMemoryBytes: 12884901888,
    sharedSystemMemoryBytes: null,
    driverVersion: '560.94',
    memorySource: 'nvidia-smi',
  }],
};

test('a local report exposes dedicated memory and drops the pairing code', () => {
  const parsed = parseGame3DGpuReport(JSON.stringify(report));
  assert.equal(parsed.adapters[0].name, 'NVIDIA GeForce RTX 4070');
  assert.equal(parsed.adapters[0].dedicatedVideoMemoryBytes, 12884901888);
  assert.equal('pairingCode' in parsed, false);
  assert.match(describeGame3DGpuReport(parsed), /12 GB dedicated video memory/);
  assert.throws(() => parseGame3DGpuReport('{"kind":"other","version":1,"adapters":[{}]}'), /not a Fallen Sky/);
});

test('the page only asks the loopback bridge and sends the pairing code', async () => {
  let called;
  const parsed = await fetchGame3DGpuBridge({
    pairingCode: 'ab12cd34',
    fetchImpl: async (url, options) => {
      called = { url, options };
      return { ok: true, status: 200, json: async () => report };
    },
  });
  assert.equal(called.url, 'http://127.0.0.1:47321/gpu');
  assert.equal(called.options.headers['X-Fallen-Sky-Token'], 'ab12cd34');
  assert.equal(parsed.adapters[0].memorySource, 'nvidia-smi');
  await assert.rejects(() => fetchGame3DGpuBridge({
    pairingCode: 'ab12cd34', host: 'example.com', fetchImpl: async () => { throw new Error('must not be called'); },
  }), /only read from this computer/);
  await assert.rejects(() => fetchGame3DGpuBridge({ pairingCode: 'no' }), /pairing code/);
});

test('the menu can download the bridge or load its file, and the bridge stays local', () => {
  assert.match(menu, /Download graphics-card bridge/);
  assert.match(menu, /Load report file/);
  assert.match(menu, /type="file"/);
  assert.match(bridge, /http:\/\/127\.0\.0\.1:/);
  assert.match(bridge, /X-Fallen-Sky-Token/);
  assert.match(bridge, /nvidia-smi/);
  assert.doesNotMatch(bridge, /Invoke-Expression|DownloadString|0\.0\.0\.0/);
});
