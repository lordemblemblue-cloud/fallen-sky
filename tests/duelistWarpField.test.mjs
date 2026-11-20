import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarpField, MAX_WARP_EFFECTS } from '../src/components/duelist/client/warpField.mjs';

const point = (x = 0.25, y = 0.75, perMetre = 0.2) => ({
  x, y, perMetre,
  clone() { return point(this.x, this.y, this.perMetre); },
});
const project = (at) => at.hidden ? null : at;
const sample = (field, projector = project) => {
  const effects = [];
  const count = field.write(projector, (...args) => effects.push(args));
  assert.equal(count, effects.length);
  return effects;
};

test('outward ring keeps the original easing, radius and strength fade', () => {
  const field = createWarpField();
  field.ring({ at: point(), r0: 1, r1: 5, strength: 0.04, ttl: 2, thickness: 0.3 });
  let effects = sample(field);
  assert.equal(effects.length, 1);
  assert.equal(effects[0][3], 0.2);
  assert.equal(effects[0][4], 0.04);
  assert.equal(effects[0][5], 0);
  field.update(1);
  effects = sample(field);
  assert.ok(Math.abs(effects[0][3] - 0.9) < 1e-9);
  assert.ok(Math.abs(effects[0][4] - 0.04 * 0.5 ** 1.6) < 1e-9);
  assert.ok(Math.abs(effects[0][6] - 0.27) < 1e-9);
});

test('inward ring starts outside then folds toward its inner radius', () => {
  const field = createWarpField();
  field.ring({ at: point(), kind: 'in', r0: 1, r1: 5, ttl: 2 });
  assert.equal(sample(field)[0][3], 1);
  field.update(1);
  assert.ok(Math.abs(sample(field)[0][3] - 0.3) < 1e-9);
  assert.equal(sample(field)[0][5], 1);
});

test('rings expire without producing ghost uniforms', () => {
  const field = createWarpField();
  field.ring({ at: point(), ttl: 1 });
  field.update(1);
  assert.deepEqual(sample(field), []);
});

test('zero lifetime and invalid time steps never produce infinite or NaN output', () => {
  const field = createWarpField();
  field.ring({ at: point(), ttl: 0 });
  field.update(-1);
  field.update(Number.NaN);
  assert.equal(sample(field).length, 1);
  field.update(0.01);
  assert.equal(sample(field).length, 0);
});

test('ring positions are copied at spawn time, not mutated by the actor', () => {
  const field = createWarpField();
  const at = point(0.3);
  field.ring({ at });
  at.x = 0.9;
  assert.equal(sample(field)[0][1], 0.3);
});

test('lenses replace their previous-frame list and preserve spin and screen radius', () => {
  const field = createWarpField();
  field.hold([{ at: point(), radius: 2, strength: 0.07, spin: 1.1 }]);
  assert.deepEqual(sample(field)[0], [0, 0.25, 0.75, 0.4, 0.07, 2, 0, 1.1]);
  field.hold([]);
  assert.equal(sample(field).length, 0);
});

test('default eight-effect limit prioritizes rings and evicts the oldest wave', () => {
  const field = createWarpField();
  assert.equal(MAX_WARP_EFFECTS, 8);
  for (let i = 0; i < 9; i++) field.ring({ at: point(i / 10) });
  field.hold([{ at: point(1), radius: 1, strength: 0.03, spin: 0.3 }]);
  const effects = sample(field);
  assert.equal(effects.length, 8);
  assert.equal(effects[0][1], 0.1);
  assert.equal(effects[7][1], 0.8);
  assert.ok(effects.every((effect) => effect[5] === 0));
});

test('offscreen effects are skipped and do not use up the visible capacity', () => {
  const field = createWarpField({ maxEffects: 2 });
  const hidden = point();
  hidden.hidden = true;
  // Clone intentionally preserves this flag, matching an offscreen 3D point.
  hidden.clone = () => ({ ...hidden });
  field.ring({ at: hidden });
  field.hold([{ at: point(), radius: 1, strength: 0.03, spin: 0 }]);
  const effects = sample(field);
  assert.equal(effects.length, 1);
  assert.equal(effects[0][5], 2);
});

test('a narrow ring retains the minimum band thickness for GLSL parity', () => {
  const field = createWarpField();
  field.ring({ at: point(0.1, 0.2, 0.001), r0: 0.1, r1: 0.2, thickness: 0.2 });
  assert.equal(sample(field)[0][6], 0.004);
});
