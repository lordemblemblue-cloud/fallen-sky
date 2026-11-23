/* global URL */
// Fantasy Battle skills as data: the bow skills JSON, timeline evaluation (keys, easing, phases, blend weights),
// events firing once on their frames at any frame rate, and cancel windows with the input buffer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validateSkill, compileSkill, evaluateSkill, sampleTrack, eventsBetween, skillWeight, phaseAt, ease, SkillPlayer, SKILL_PHASES,
} from '../src/components/fantasybattle/core/skillTimeline.mjs';

const doc = JSON.parse(fs.readFileSync(new URL('../src/components/fantasybattle/data/bowSkills.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(doc.skills.map((s) => [s.id, s]));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('every skill in bowSkills.json validates and compiles', () => {
  for (const skill of doc.skills) {
    const { ok, errors } = validateSkill(skill);
    assert.ok(ok, `${skill.id}: ${errors.join('; ')}`);
    const c = compileSkill(skill);
    assert.equal(c.id, skill.id);
    assert.ok(c.cancelWindowStart <= c.totalDuration);
  }
});

test('the three bow skills sit on hotkeys 1, 2 and 3 and each spawns arrows on a live hit frame', () => {
  const hot = Object.fromEntries(doc.skills.filter((s) => s.hotkey).map((s) => [s.hotkey, s.id]));
  assert.equal(hot['1'], 'quickShot');
  assert.equal(hot['2'], 'chargedShot');
  assert.equal(hot['3'], 'volley');
  for (const id of ['quickShot', 'chargedShot', 'volley']) {
    const events = byId[id].events;
    const hit = events.find((e) => e.type === 'onHitFrame');
    assert.ok(hit && hit.activeFor > 0, `${id} has an onHitFrame with a duration`);
    for (const arrow of events.filter((e) => e.type === 'spawnArrow')) {
      assert.ok(arrow.time >= hit.time && arrow.time <= hit.time + hit.activeFor, `${id}: arrow at ${arrow.time} inside the hit window`);
      assert.ok(arrow.trail, `${id}: arrow has a trail`);
    }
  }
  assert.equal(byId.quickShot.events.filter((e) => e.type === 'spawnArrow').length, 1);
  assert.equal(byId.volley.events.filter((e) => e.type === 'spawnArrow').length, 3);
  const charged = byId.chargedShot.events;
  assert.ok(charged.some((e) => e.type === 'screenShake' && e.intensity >= 3));
  assert.ok(charged.some((e) => e.type === 'hitStop'));
  assert.ok(byId.chargedShot.keyframes.some((k) => k.phase === 'hitStop'));
});

test('easing curves and track sampling hit their keys exactly', () => {
  assert.equal(ease('linear', 0.25), 0.25);
  assert.equal(ease('easeInOutQuad', 0.5), 0.5);
  assert.ok(near(ease('easeOutCubic', 0.5), 0.875));
  assert.equal(ease('easeOutExpo', 1), 1);
  assert.equal(ease('unknownCurve', 0.3), 0.3);
  const keys = [{ t: 0, v: 10, e: 'linear' }, { t: 1, v: 20, e: 'linear' }, { t: 2, v: 0, e: 'easeOutCubic' }, { t: 3, v: 5, e: 'step' }];
  assert.equal(sampleTrack(keys, -1), 10);
  assert.equal(sampleTrack(keys, 0.5), 15);
  assert.equal(sampleTrack(keys, 1), 20);
  assert.ok(near(sampleTrack(keys, 1.5), 20 - 20 * 0.875));
  assert.equal(sampleTrack(keys, 2.99), 0, 'step holds until its key');
  assert.equal(sampleTrack(keys, 3), 5);
  assert.equal(sampleTrack(keys, 9), 5);
});

test('evaluateSkill returns keyed bone values, params and phases in order', () => {
  const c = compileSkill(byId.chargedShot);
  const fullDraw = byId.chargedShot.keyframes.find((k) => k.time === 1.08);
  const at = evaluateSkill(c, 1.08);
  assert.equal(at.bones.drawArm.rotation, fullDraw.bones.drawArm.rotation);
  assert.equal(at.bones.drawHand.zIndex, 59);
  assert.equal(at.params.draw, 1);
  assert.equal(at.phase, 'active');
  // the hit-stop holds the release pose
  const a = evaluateSkill(c, 1.12);
  const b = evaluateSkill(c, 1.22);
  assert.equal(a.phase, 'hitStop');
  assert.ok(near(a.bones.drawArm.rotation, b.bones.drawArm.rotation, 0.5));
  // phases only move forward through anticipation -> active -> hitStop -> recovery
  let last = -1;
  for (let t = 0; t <= c.totalDuration; t += 0.01) {
    const idx = SKILL_PHASES.indexOf(phaseAt(c, t));
    assert.ok(idx >= last, `phase went back at ${t.toFixed(2)}`);
    last = idx;
  }
  assert.equal(last, SKILL_PHASES.indexOf('recovery'));
});

test('blend weight ramps in and out; held skills keep their last pose', () => {
  const c = compileSkill(byId.quickShot);
  assert.equal(skillWeight(c, 0), 0);
  assert.equal(skillWeight(c, 0.5), 1);
  assert.ok(skillWeight(c, c.totalDuration - 0.05) < 0.2);
  assert.equal(skillWeight(c, c.totalDuration), 0);
  const v = compileSkill(byId.victory);
  assert.equal(v.hold, true);
  assert.equal(skillWeight(v, v.totalDuration), 1);
  const player = new SkillPlayer([byId.victory]);
  player.play('victory');
  let finished = 0;
  for (let i = 0; i < 200; i += 1) finished += player.update(1 / 60).finished.length;
  assert.equal(finished, 1, 'reported finished once');
  assert.ok(player.busy, 'still holding the pose');
  assert.equal(player.evaluate().weight, 1);
  player.stop();
  assert.equal(player.busy, false);
});

function runEvents(skill, steps) {
  const player = new SkillPlayer([skill]);
  player.play(skill.id);
  const fired = [];
  let t = 0;
  for (const dt of steps) {
    const t0 = t;
    t += dt;
    for (const e of player.update(dt).events) fired.push({ e, t0, t1: t });
    if (!player.busy) break;
  }
  return fired;
}

test('events fire once each, on the frame whose span contains their time, at any frame rate', () => {
  for (const id of ['quickShot', 'chargedShot', 'volley', 'guard']) {
    const skill = byId[id];
    const random = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const rates = [Array(400).fill(1 / 30), Array(400).fill(1 / 60), Array(800).fill(1 / 144), Array(600).fill(0).map(() => 0.002 + random() * 0.04)];
    for (const steps of rates) {
      const fired = runEvents(skill, steps);
      assert.equal(fired.length, skill.events.length, `${id}: every event fired exactly once`);
      for (const { e, t0, t1 } of fired) {
        assert.ok(e.time > t0 - 1e-9 && e.time <= t1 + 1e-9, `${id}: ${e.type}@${e.time} fired in [${t0}, ${t1}]`);
      }
    }
  }
});

test('eventsBetween is half-open and catches time-0 events on the first step', () => {
  const c = compileSkill({ id: 'x', name: 'x', totalDuration: 1, blendOutTime: 0, cancelWindowStart: 1,
    keyframes: [{ time: 0, phase: 'active' }], events: [{ time: 0, type: 'playSFX', sfxId: 'a' }, { time: 0.5, type: 'playSFX', sfxId: 'b' }] });
  assert.deepEqual(eventsBetween(c, -1e-9, 0.1).map((e) => e.sfxId), ['a']);
  assert.deepEqual(eventsBetween(c, 0, 0.5).map((e) => e.sfxId), ['b']);
  assert.deepEqual(eventsBetween(c, 0.5, 0.9).map((e) => e.sfxId), []);
});

test('cancel window: an early request waits in the buffer, a stale one is dropped', () => {
  const quick = byId.quickShot;
  // a request 0.15 s before the window opens is played when it opens
  let player = new SkillPlayer([quick, byId.volley], { bufferTime: 0.25 });
  player.play('quickShot');
  let t = 0;
  while (t < quick.cancelWindowStart - 0.15) { player.update(1 / 120); t += 1 / 120; }
  assert.equal(player.play('volley'), 'buffered');
  let startedAt = null;
  while (t < quick.cancelWindowStart + 0.2) {
    const { started } = player.update(1 / 120);
    t += 1 / 120;
    if (started.length && startedAt === null) startedAt = t;
  }
  assert.ok(startedAt !== null && Math.abs(startedAt - quick.cancelWindowStart) < 0.02, `volley started at ${startedAt}`);
  assert.equal(player.current.id, 'volley');
  // a request 0.4 s before the window goes stale
  player = new SkillPlayer([quick, byId.volley], { bufferTime: 0.25 });
  player.play('quickShot');
  t = 0;
  while (t < quick.cancelWindowStart - 0.4) { player.update(1 / 120); t += 1 / 120; }
  assert.equal(player.play('volley'), 'buffered');
  while (t < quick.totalDuration + 0.1) { player.update(1 / 120); t += 1 / 120; }
  assert.equal(player.busy, false, 'the stale request never started');
  // inside the window a request starts at once
  player.play('quickShot');
  while (!player.canCancel()) player.update(1 / 120);
  assert.equal(player.play('volley'), 'started');
});

test('validateSkill reports schema mistakes', () => {
  const bad = { id: 'b', name: 'b', totalDuration: 1, blendOutTime: 2, cancelWindowStart: 0.5,
    keyframes: [{ time: 0, phase: 'windup', easing: 'wobbly', bones: { arm: { rotation: 'x', zIndex: 1.5 } } }],
    events: [{ time: 3, type: 'spawnSlashArc' }] };
  const { ok, errors } = validateSkill(bad);
  assert.equal(ok, false);
  for (const fragment of ['blendOutTime', 'phase "windup"', 'easing "wobbly"', 'rotation', 'zIndex', 'events[0].time', 'spawnSlashArc']) {
    assert.ok(errors.some((e) => e.includes(fragment)), `reports ${fragment}`);
  }
  assert.throws(() => compileSkill(bad));
});
