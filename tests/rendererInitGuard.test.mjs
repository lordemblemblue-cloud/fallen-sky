import test from 'node:test';
import assert from 'node:assert/strict';
import { createRendererInitGuard } from '../src/lib/rendererInitGuard.mjs';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const fakeRenderer = () => {
  let disposed = 0;
  return { dispose() { disposed += 1; }, get disposed() { return disposed; } };
};

test('accepts renderer after asynchronous initialization', async () => {
  const guard = createRendererInitGuard();
  const renderer = fakeRenderer();
  assert.deepEqual(await guard.initialize(async () => renderer), { renderer, stale: false });
  assert.equal(guard.renderer, renderer);
  guard.dispose();
  assert.equal(renderer.disposed, 1);
});

test('late initialization after unmount is disposed, never published', async () => {
  const guard = createRendererInitGuard();
  const pending = deferred();
  const renderer = fakeRenderer();
  const result = guard.initialize(() => pending.promise);
  guard.dispose();
  pending.resolve(renderer);
  assert.deepEqual(await result, { renderer: null, stale: true });
  assert.equal(renderer.disposed, 1);
  assert.equal(guard.renderer, null);
});

test('newer initialization wins, older completion is disposed', async () => {
  const guard = createRendererInitGuard();
  const old = deferred();
  const oldRenderer = fakeRenderer();
  const newRenderer = fakeRenderer();
  const first = guard.initialize(() => old.promise);
  const second = await guard.initialize(async () => newRenderer);
  old.resolve(oldRenderer);
  assert.equal((await first).stale, true);
  assert.equal(second.renderer, newRenderer);
  assert.equal(guard.renderer, newRenderer);
  assert.equal(oldRenderer.disposed, 1);
  guard.dispose();
});

test('reinitialization disposes the previously published renderer', async () => {
  const guard = createRendererInitGuard();
  const first = fakeRenderer();
  await guard.initialize(async () => first);
  await guard.initialize(async () => fakeRenderer());
  assert.equal(first.disposed, 1);
  guard.dispose();
});

test('stale factory rejection is ignored after cancellation', async () => {
  const guard = createRendererInitGuard();
  const pending = deferred();
  const result = guard.initialize(() => pending.promise);
  guard.dispose();
  pending.reject(new Error('device lost'));
  assert.deepEqual(await result, { renderer: null, stale: true });
});

test('active factory rejection propagates without retaining a renderer', async () => {
  const guard = createRendererInitGuard();
  await assert.rejects(guard.initialize(async () => { throw new Error('init failed'); }), /init failed/);
  assert.equal(guard.renderer, null);
});

test('invalid factory fails fast', async () => {
  const guard = createRendererInitGuard();
  await assert.rejects(guard.initialize(null), TypeError);
});
