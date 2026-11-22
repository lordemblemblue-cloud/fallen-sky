import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldDrawWatchdog } from '../src/components/game3d/render/liveRendererRecovery.mjs';

// This is stacked on the active world-startup PR. It does not alter live rendering.
for (const scene of ['fallen-sky', 'duelist-adventure']) {
  test(`${scene}: empty-draw detection requires eight seconds of eligible samples`, () => {
    const check = createWorldDrawWatchdog();
    assert.equal(check(0, true, 0), false);
    for (let i = 1; i < 32; i++) {
      assert.equal(check(i * 250, true, 0), false);
    }
    assert.equal(check(8000, true, 0), true);
  });
}

test('background or warmup samples reset the timer rather than count as empty world', () => {
  const check = createWorldDrawWatchdog();
  check(0, true, 0);
  for (let i = 1; i <= 20; i++) check(i * 250, true, 0);
  assert.equal(check(5250, false, 0), false);
  assert.equal(check(5500, true, 0), false);
  assert.equal(check(5750, true, 0), false);
});

test('a rendered geometry frame resets the accumulated empty time', () => {
  const check = createWorldDrawWatchdog();
  check(0, true, 0);
  for (let i = 1; i <= 30; i++) check(i * 250, true, 0);
  assert.equal(check(7750, true, 1), false);
  assert.equal(check(8000, true, 0), false);
  assert.equal(check(8250, true, 0), false);
});

test('long frame stalls are capped to avoid a single false fallback', () => {
  const check = createWorldDrawWatchdog();
  assert.equal(check(0, true, 0), false);
  assert.equal(check(60000, true, 0), false);
  assert.equal(check(120000, true, 0), false);
});

test('a backward clock adjustment cannot accumulate negative time', () => {
  const check = createWorldDrawWatchdog();
  check(1000, true, 0);
  assert.equal(check(500, true, 0), false);
  assert.equal(check(750, true, 0), false);
});
