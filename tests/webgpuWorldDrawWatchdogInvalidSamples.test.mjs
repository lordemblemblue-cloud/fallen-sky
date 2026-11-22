import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldDrawWatchdog } from '../src/components/game3d/render/liveRendererRecovery.mjs';

test('the watchdog still reports sustained legitimate zero-draw frames after eight seconds', () => {
  const check = createWorldDrawWatchdog();
  assert.equal(check(0, true, 0), false);
  for (let i = 1; i < 32; i++) assert.equal(check(i * 250, true, 0), false);
  assert.equal(check(8000, true, 0), true);
  assert.equal(check(8250, true, 15), false);
  assert.equal(check(8500, true, 0), false);
});

test('invalid or inaccessible draw counters reset, never accumulate empty-world time', () => {
  const malformed = [undefined, null, NaN, Infinity, -Infinity, -1, 0.3, '0', false, {}, []];
  for (const value of malformed) {
    const check = createWorldDrawWatchdog();
    check(0, true, 0);
    for (let i = 1; i <= 30; i++) check(i * 250, true, 0);
    assert.equal(check(7750, true, value), false, String(value));
    assert.equal(check(8000, true, 0), false, String(value));
    assert.equal(check(8250, true, 0), false, String(value));
  }
});

test('NaN and infinite clocks reset rather than permanently poisoning the watchdog', () => {
  for (const value of [NaN, Infinity, -Infinity, -1, undefined, null, '250']) {
    const check = createWorldDrawWatchdog();
    check(0, true, 0);
    check(250, true, 0);
    assert.equal(check(value, true, 0), false, String(value));
    assert.equal(check(1000, true, 0), false);
    for (let i = 1; i < 32; i++) assert.equal(check(1000 + i * 250, true, 0), false);
    assert.equal(check(9000, true, 0), true);
  }
});

test('backward clock jumps discard any old empty streak', () => {
  const check = createWorldDrawWatchdog();
  check(1000, true, 0);
  for (let i = 1; i <= 20; i++) check(1000 + i * 250, true, 0);
  assert.equal(check(500, true, 0), false);
  assert.equal(check(750, true, 0), false);
  assert.equal(check(1000, true, 0), false);
});

test('paused, background or nonboolean eligibility never counts as an empty world', () => {
  for (const state of [false, undefined, null, 0, 1, 'true']) {
    const check = createWorldDrawWatchdog();
    check(0, true, 0);
    for (let i = 1; i <= 29; i++) check(i * 250, true, 0);
    assert.equal(check(7500, state, 0), false);
    assert.equal(check(7750, true, 0), false);
    assert.equal(check(8000, true, 0), false);
  }
});

test('a single long frame stall is still capped at one quarter second', () => {
  const check = createWorldDrawWatchdog();
  assert.equal(check(0, true, 0), false);
  assert.equal(check(60000, true, 0), false);
  assert.equal(check(120000, true, 0), false);
});
