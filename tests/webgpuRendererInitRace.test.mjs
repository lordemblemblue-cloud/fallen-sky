import test from 'node:test';
import assert from 'node:assert/strict';
import { createRendererInitGuard } from '../src/lib/rendererInitGuard.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

for (const scene of ['fallen-sky', 'duelist-adventure']) {
  test(`${scene}: overlapping initialization publishes only the latest renderer`, async () => {
    const guard = createRendererInitGuard();
    const first = deferred();
    const second = deferred();
    const disposed = [];
    const staleRenderer = { dispose() { disposed.push('stale'); } };
    const liveRenderer = { dispose() { disposed.push('live'); } };
    const firstResult = guard.initialize(() => first.promise);
    const secondResult = guard.initialize(() => second.promise);
    second.resolve(liveRenderer);
    assert.deepEqual(await secondResult, { renderer: liveRenderer, stale: false });
    first.resolve(staleRenderer);
    assert.deepEqual(await firstResult, { renderer: null, stale: true });
    assert.equal(guard.renderer, liveRenderer);
    assert.deepEqual(disposed, ['stale']);
    guard.dispose();
    assert.deepEqual(disposed, ['stale', 'live']);
  });

  test(`${scene}: unmount during pending initialization never publishes late renderer`, async () => {
    const guard = createRendererInitGuard();
    const pending = deferred();
    let disposals = 0;
    const result = guard.initialize(() => pending.promise);
    guard.dispose();
    pending.resolve({ dispose() { disposals++; } });
    assert.deepEqual(await result, { renderer: null, stale: true });
    assert.equal(guard.renderer, null);
    assert.equal(disposals, 1);
    guard.dispose();
    assert.equal(disposals, 1);
  });

  test(`${scene}: late rejection cannot clear newer renderer`, async () => {
    const guard = createRendererInitGuard();
    const pending = deferred();
    const old = guard.initialize(() => pending.promise);
    const current = { dispose() {} };
    assert.deepEqual(await guard.initialize(async () => current), { renderer: current, stale: false });
    pending.reject(new Error('GPU adapter initialization failed'));
    assert.deepEqual(await old, { renderer: null, stale: true });
    assert.equal(guard.renderer, current);
    guard.dispose();
  });
}
