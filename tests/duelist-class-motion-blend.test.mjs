import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { CLASS_IDS } from '../src/components/duelist/core/classes.mjs';
import { classMotionBlend, CLASS_MOTION_BLEND, DEFAULT_MOTION_BLEND } from '../src/components/duelist/client/classMotionBlend.mjs';

test('the four canonical crystal-weapon classes have independent, non-zero visual fades', () => {
  assert.deepEqual(Object.keys(CLASS_MOTION_BLEND).sort(), [...CLASS_IDS].sort());
  for (const classId of CLASS_IDS) {
    const timing = classMotionBlend(classId);
    assert.ok(Object.isFrozen(timing), classId);
    for (const key of ['entry', 'chain', 'out', 'settle', 'guard']) {
      assert.ok(Number.isFinite(timing[key]) && timing[key] >= 0.03 && timing[key] <= 0.25,
        `${classId}: ${key} is a small crossfade, not an attack/hit frame adjustment`);
    }
    assert.ok(timing.chain < timing.entry, `${classId} chains faster than its opening attack`);
  }
  assert.ok(classMotionBlend('healer').entry < classMotionBlend('warrior').entry,
    'the blue swift stance blends into action faster than the red heavy stance');
  assert.ok(classMotionBlend('duelist').chain < classMotionBlend('assassin').chain,
    'dual blades can change hands quickly; the staff keeps some continuous momentum');
});

test('unclassed or unexpected fighters retain the existing default animation blend', () => {
  for (const id of [null, undefined, {}, '', '__proto__', 'unknown']) {
    assert.strictEqual(classMotionBlend(id), DEFAULT_MOTION_BLEND);
  }
  assert.equal(DEFAULT_MOTION_BLEND.entry, 0.07);
  assert.equal(DEFAULT_MOTION_BLEND.chain, 0.06);
  assert.equal(DEFAULT_MOTION_BLEND.out, 0.12);
  assert.equal(DEFAULT_MOTION_BLEND.settle, 0.18);
});

test('class fades are used only in visual animator, never in the shared server rules', () => {
  const animator = readFileSync(new URL('../src/components/duelist/client/animator.mjs', import.meta.url), 'utf8');
  assert.match(animator, /import \{ classMotionBlend \} from '.\/classMotionBlend\.mjs'/);
  assert.match(animator, /const blend = classMotionBlend\(fighter\.classId\)/);
  assert.match(animator, /a\.chainedFrom \? blend\.chain : blend\.entry/);
  assert.match(animator, /fade: blend\.guard/);
  assert.match(animator, /out: blend\.settle/);
  assert.match(animator, /1 \/ classMotionBlend\(fighter\.classId\)\.out/);
  const classRules = readFileSync(new URL('../src/components/duelist/core/classes.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(classRules, /classMotionBlend/);
});
