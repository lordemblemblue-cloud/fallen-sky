import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserGPUDetector, describeBrowserGPUAdapter, browserGPUStatusMessage }
  from '../src/lib/browserGPUDetection.mjs';

test('identifies a browser-reported NVIDIA GPU without claiming gameplay uses it', async () => {
  let calls = 0;
  const browser = { isSecureContext: true, navigator: { gpu: { requestAdapter: async ({ powerPreference }) => {
    calls++;
    assert.equal(powerPreference, 'high-performance');
    return { info: { vendor: 'NVIDIA', device: 'GeForce RTX 4050 Laptop GPU' }, isFallbackAdapter: false };
  } } } };
  const probe = createBrowserGPUDetector();
  const a = await probe(browser);
  assert.equal(a.status, 'available');
  assert.equal(a.name, 'NVIDIA GeForce RTX 4050 Laptop GPU');
  assert.equal(calls, 1);
  assert.deepEqual(await probe(browser), a);
  assert.equal(calls, 1);
  await probe(browser, { refresh: true });
  assert.equal(calls, 2);
});

test('deduplicates concurrent GPU queries from both game settings', async () => {
  let calls = 0;
  const probe = createBrowserGPUDetector();
  const host = { navigator: { gpu: { requestAdapter: async () => {
    calls++;
    return { info: { vendor: 'AMD', device: 'Radeon 780M' } };
  } } } };
  const [a,b] = await Promise.all([probe(host), probe(host)]);
  assert.deepEqual(a,b);
  assert.equal(calls, 1);
});

test('WebGPU availability survives hidden device identity', async () => {
  const probe = createBrowserGPUDetector();
  const info = await probe({ navigator: { gpu: { requestAdapter: async () => ({ info: {} }) } } });
  assert.equal(info.status, 'available');
  assert.equal(info.name, null);
  assert.match(browserGPUStatusMessage(info), /does not reveal/);
});

test('reports insecure context separately from unsupported browsers', async () => {
  const probe = createBrowserGPUDetector();
  assert.equal((await probe({ isSecureContext: false, navigator: { gpu: {} } })).status, 'insecure-context');
  assert.equal((await probe({ navigator: {} }, { refresh: true })).status, 'unsupported');
});

test('no adapter, blocked adapter, and software fallback are not reported as hardware', async () => {
  const probe = createBrowserGPUDetector();
  assert.equal((await probe({ navigator: { gpu: { requestAdapter: async () => null } } })).status, 'unavailable');
  assert.equal((await probe({ navigator: { gpu: { requestAdapter: async () => { throw Error('blocked'); } } } },
    { refresh: true })).status, 'blocked');
  const fallback = await probe({ navigator: { gpu: { requestAdapter: async () => ({
    info: { vendor: 'SwiftShader' }, isFallbackAdapter: true,
  }) } } }, { refresh: true });
  assert.equal(fallback.status, 'software-fallback');
  assert.equal(fallback.software, true);
});

test('device names are de-duplicated and invalid adapter data ignored', () => {
  assert.deepEqual(describeBrowserGPUAdapter(null), {
    name:null, vendor:null, device:null, architecture:null, description:null,
  });
  assert.equal(describeBrowserGPUAdapter({ vendor:' NVIDIA ', device:'NVIDIA', description:' RTX 4050 ' }).name,
    'NVIDIA RTX 4050');
});
