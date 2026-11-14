import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCloneGPUProfile, rendererPixelRatioLimit, summarizeCloneFrames,
  nextClonePixelRatio, readCloneGPUProfile, createCloneAdaptiveGraphics,
} from '../src/components/game3d/performance/AdaptiveGraphics.mjs';

test('browser-only profile and quality caps never upscale beyond device DPR', () => {
  assert.equal(normalizeCloneGPUProfile('unexpected'), 'auto');
  assert.equal(rendererPixelRatioLimit({ profile: 'performance', devicePixelRatio: 2 }), .75);
  assert.equal(rendererPixelRatioLimit({ profile: 'balanced', devicePixelRatio: 2 }), 1);
  assert.equal(rendererPixelRatioLimit({ profile: 'auto', quality: 'low', devicePixelRatio: 2 }), .75);
  assert.equal(rendererPixelRatioLimit({ profile: 'auto', quality: 'high', devicePixelRatio: 2 }), 1.5);
  assert.equal(rendererPixelRatioLimit({ profile: 'quality', devicePixelRatio: 1 }), 1);
});

test('frame measurements preserve long spikes and report percentile', () => {
  const report = summarizeCloneFrames([16, 16, 16, 16, 40]);
  assert.equal(report.frames, 5);
  assert.equal(report.p50Ms, 16);
  assert.equal(report.p95Ms, 40);
  assert.equal(report.p99Ms, 40);
  assert.equal(report.maxMs, 40);
  assert.ok(report.fps > 0 && report.fps < 60);
});

test('adaptive steps require repeated pressure; manual/off states are deterministic', () => {
  const basic = { profile: 'auto', current: 1.5, ceiling: 1.5, p95Ms: 30, p99Ms: 38 };
  assert.equal(nextClonePixelRatio({ ...basic, slowWindows: 1 }), 1.5);
  assert.equal(nextClonePixelRatio({ ...basic, slowWindows: 2 }), 1.375);
  assert.equal(nextClonePixelRatio({ ...basic, slowWindows: 2, current: .7 }), .7);
  assert.equal(nextClonePixelRatio({ ...basic, p95Ms: 16, p99Ms: 20, fastWindows: 3, current: 1.0 }), 1.125);
  assert.equal(nextClonePixelRatio({ ...basic, profile: 'performance', ceiling: .75 }), .75);
  assert.equal(nextClonePixelRatio({ ...basic, profile: 'off' }), 1.5);
});

test('opt-out query wins over saved profile and storage failure is safe', () => {
  assert.equal(readCloneGPUProfile({
    location: { search: '?adaptiveGpu=0' },
    localStorage: { getItem: () => 'quality' },
  }), 'off');
  assert.equal(readCloneGPUProfile({
    localStorage: { getItem() { throw Error('blocked'); } },
  }), 'auto');
});

function makeHarness({ quality = 'high' } = {}) {
  const queue = new Map();
  let id = 0, now = 0, ratio = 1.5, contextLost = false;
  const listeners = new Map();
  const setRatios = [];
  const host = {
    devicePixelRatio: 2, location: { search: '' },
    localStorage: { getItem: key => key === 'game_graphics_settings' ? JSON.stringify({ quality }) : 'auto' },
    requestAnimationFrame(callback) { const next = ++id; queue.set(next, callback); return next; },
    cancelAnimationFrame(value) { queue.delete(value); },
    addEventListener(name, cb) { listeners.set(name, cb); },
    removeEventListener(name, cb) { if (listeners.get(name) === cb) listeners.delete(name); },
  };
  const renderer = {
    getPixelRatio: () => ratio,
    setPixelRatio(value) { ratio = value; setRatios.push(value); },
    getContext: () => ({ isContextLost: () => contextLost }),
  };
  const doc = { hidden: false };
  return {
    host, renderer, doc, listeners, setRatios,
    ratio: () => ratio, pending: () => queue.size,
    setContextLost: value => { contextLost = value; },
    step(frames, delta) {
      for (let i = 0; i < frames; i++) {
        const callbacks = [...queue.values()];
        queue.clear();
        now += delta;
        for (const callback of callbacks) callback(now);
      }
    },
  };
}

test('real controller lowers ratio after repeated slow windows and restores on Off', () => {
  const h = makeHarness();
  const samples = [];
  const c = createCloneAdaptiveGraphics({
    renderer: h.renderer, host: h.host, documentRef: h.doc, onSample: value => samples.push(value),
  });
  assert.equal(h.pending(), 1);
  h.step(280, 34); // repeated 34 ms, not a single shader/GC spike
  assert.ok(samples.length >= 2);
  assert.ok(h.ratio() < 1.5);
  assert.ok(h.ratio() >= .7);
  c.setProfile('off');
  assert.equal(h.ratio(), 1.5);
  c.dispose();
  assert.equal(h.pending(), 0);
  assert.equal(h.listeners.has('graphicsSettingsChanged'), false);
});

test('hidden/lost-context frames cannot trigger adaptation; settings change is bounded', () => {
  const h = makeHarness({ quality: 'low' });
  h.doc.hidden = true;
  const c = createCloneAdaptiveGraphics({
    renderer: h.renderer, host: h.host, documentRef: h.doc,
  });
  assert.equal(h.ratio(), .75);
  h.step(200, 50);
  assert.equal(h.ratio(), .75);
  h.doc.hidden = false;
  h.setContextLost(true);
  h.step(200, 50);
  assert.equal(h.ratio(), .75);
  c.dispose();
});

test('browser requestAnimationFrame alone is not treated as game rendering', () => {
  const h = makeHarness();
  h.renderer.info = { render: { frame: 0 } };
  const c = createCloneAdaptiveGraphics({ renderer: h.renderer, host: h.host, documentRef: h.doc });
  h.step(300, 34); // browser keeps ticking, while Three.js never renders a frame
  assert.equal(c.getSnapshot().frames, 0);
  assert.equal(h.ratio(), 1.5);
  c.dispose();
});
