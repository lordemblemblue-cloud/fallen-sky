import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFrameTimes, frameTimesFromTimestamps } from '../src/lib/frameMetrics.mjs';

test('empty frame windows return no summary', () => {
  assert.equal(summarizeFrameTimes([]), null);
  assert.equal(summarizeFrameTimes([16], { warmupFrames: 1 }), null);
});
test('constant 20ms frames produce 50fps across metrics', () => {
  const metrics = summarizeFrameTimes(Array(100).fill(20));
  assert.equal(metrics.sampleCount, 100);
  assert.equal(metrics.averageFps, 50);
  assert.equal(metrics.onePercentLowFps, 50);
  assert.equal(metrics.p95FrameMs, 20);
  assert.equal(metrics.p99FrameMs, 20);
});
test('slow frames affect 1% low and upper percentiles', () => {
  const metrics = summarizeFrameTimes([...Array(99).fill(10), 100]);
  assert.equal(metrics.onePercentLowFps, 10);
  assert.equal(metrics.p95FrameMs, 10);
  assert.equal(metrics.p99FrameMs, 10);
  assert.equal(metrics.maxFrameMs, 100);
});
test('warmup exclusion leaves source untouched', () => {
  const source = [100, 10, 10];
  assert.equal(summarizeFrameTimes(source, { warmupFrames: 1 }).averageFps, 100);
  assert.deepEqual(source, [100, 10, 10]);
});
test('reject invalid durations and warmup values', () => {
  assert.throws(() => summarizeFrameTimes([0]), RangeError);
  assert.throws(() => summarizeFrameTimes([Infinity]), RangeError);
  assert.throws(() => summarizeFrameTimes([NaN]), RangeError);
  assert.throws(() => summarizeFrameTimes([10], { warmupFrames: -1 }), RangeError);
});
test('convert strictly increasing timestamps into durations', () => {
  assert.deepEqual(frameTimesFromTimestamps([100, 116, 149]), [16, 33]);
  assert.deepEqual(frameTimesFromTimestamps([]), []);
  assert.throws(() => frameTimesFromTimestamps([100, 100]), RangeError);
  assert.throws(() => frameTimesFromTimestamps([100, Infinity]), RangeError);
});

test('reject sparse retained samples but ignore excluded warmup holes', () => {
  assert.throws(() => summarizeFrameTimes(Array(2)), RangeError);
  assert.throws(() => summarizeFrameTimes([16, , 20]), RangeError);
  assert.equal(summarizeFrameTimes([, 20], { warmupFrames: 1 }).averageFps, 50);
});
test('reject nonfinite totals and derived frame rates', () => {
  assert.throws(() => summarizeFrameTimes([Number.MAX_VALUE, Number.MAX_VALUE]), RangeError);
  assert.throws(() => summarizeFrameTimes([Number.MIN_VALUE]), RangeError);
});
test('reject overflowing timestamp differences and sparse timestamps', () => {
  assert.throws(() => frameTimesFromTimestamps([-Number.MAX_VALUE, Number.MAX_VALUE]), RangeError);
  assert.throws(() => frameTimesFromTimestamps([1, , 3]), RangeError);
  assert.deepEqual(frameTimesFromTimestamps([-10, 10]), [20]);
});
