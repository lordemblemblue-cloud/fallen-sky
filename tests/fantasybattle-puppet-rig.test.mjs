/* global URL */
// Fantasy Battle puppet rig: the archer's layers resolve against the cut PNGs, bones sit at their authored joints at
// rest, springs lag and settle, blinking and breathing behave, skills reorder layers (zIndex) and smear fast motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildRig, createPuppetState, stepPuppet, solveBones, composePose, bonePosition, socketPosition, faceState, triggerExpression,
  blinkCurve, BLINK_DURATION, matApply, matMul, matTRS,
} from '../src/components/fantasybattle/core/puppetCore.mjs';
import { SkillPlayer } from '../src/components/fantasybattle/core/skillTimeline.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const rigData = read('../src/components/fantasybattle/data/archerRig.json');
const manifest = read('../public/fantasybattle/archer/parts.json');
const skills = read('../src/components/fantasybattle/data/bowSkills.json').skills;
const rig = buildRig(rigData, manifest);

test('every layer and expression names a cut PNG that exists', () => {
  for (const l of rigData.layers) assert.ok(fs.existsSync(new URL(`../public/fantasybattle/archer/${l.part}.png`, import.meta.url)), l.part);
  for (const part of Object.values(rigData.expressions)) assert.ok(manifest.parts[part], part);
  for (const [name, s] of Object.entries(rigData.sockets)) assert.ok(s.layer ? rig.layerOf(s.layer) !== undefined : rig.boneOf(s.bone) !== undefined, name);
  assert.throws(() => buildRig({ ...rigData, layers: [{ id: 'x', part: 'nope', bone: 'root', pivot: [0, 0] }] }, manifest), /no part nope/);
  assert.throws(() => buildRig({ ...rigData, bones: [{ id: 'a', parent: 'b' }, { id: 'b' }] }, manifest), /listed first/);
});

test('matrices compose like the canvas transform', () => {
  const m = matMul(matTRS(10, 0, 90), matTRS(5, 0));
  const [x, y] = matApply(m, 0, 0);
  assert.ok(Math.abs(x - 10) < 1e-9 && Math.abs(y - 5) < 1e-9);
});

test('at rest every bone sits on its authored joint and the bow grip is in the bow hand', () => {
  const state = createPuppetState(rig);
  state.life.breath = 0;
  composePose({ ...rig, data: { ...rigData, stances: {}, breathing: {}, look: {} } }, state.life, null, state.pose);
  solveBones(rig, state);
  for (const b of rig.bones) {
    const [x, y] = bonePosition(state, b.index);
    assert.ok(Math.hypot(x - b.pos[0], y - b.pos[1]) < 1e-6, `${b.id} at ${x},${y}`);
  }
  const grip = socketPosition(rig, state, 'bowGrip');
  const socket = rigData.bones.find((b) => b.id === 'bowSocket').pos;
  assert.ok(Math.hypot(grip[0] - socket[0], grip[1] - socket[1]) < 1e-6);
});

test('a hanging strand lags behind a sideways shove, overshoots, then settles', () => {
  const state = createPuppetState(rig, { seed: 3 });
  const lock = rig.layerOf('lockLeft');
  const pelvis = rig.boneOf('root');
  const dt = 1 / 60;
  for (let i = 0; i < 60; i += 1) stepPuppet(rig, state, dt);
  const restAngle = state.springs[lock].angle;
  // shove the whole character right for a few frames
  const angles = [];
  for (let i = 0; i < 6; i += 1) {
    rig.bones[pelvis].local[0] += 12;
    stepPuppet(rig, state, dt);
    angles.push(state.springs[lock].angle);
  }
  rig.bones[pelvis].local[0] -= 72;
  assert.ok(Math.min(...angles) < restAngle - 0.02, 'the tip swings left (clockwise) as the body accelerates right');
  let maxAfter = -Infinity;
  for (let i = 0; i < 60; i += 1) { stepPuppet(rig, state, dt); maxAfter = Math.max(maxAfter, state.springs[lock].angle); }
  assert.ok(maxAfter > restAngle, 'it overshoots the other way');
  for (let i = 0; i < 240; i += 1) stepPuppet(rig, state, dt);
  assert.ok(Math.abs(state.springs[lock].angle - restAngle) < 0.01, 'and settles');
});

test('blinks: closed in the middle, open between, a few every ten seconds, none while hurt', () => {
  assert.equal(blinkCurve(-0.01), 0);
  assert.equal(blinkCurve(BLINK_DURATION / 2), 1);
  assert.equal(blinkCurve(BLINK_DURATION + 0.01), 0);
  const state = createPuppetState(rig, { seed: 11 });
  let blinks = 0; let was = 0;
  for (let i = 0; i < 600 * 2; i += 1) {
    stepPuppet(rig, state, 1 / 120);
    const v = state.life.blink.value;
    assert.ok(v >= 0 && v <= 1);
    if (v > 0.9 && was <= 0.9) blinks += 1;
    was = v;
  }
  assert.ok(blinks >= 2 && blinks <= 8, `${blinks} blinks in 10 s`);
  triggerExpression(state.life, 'hurt', 10);
  for (let i = 0; i < 480; i += 1) { stepPuppet(rig, state, 1 / 60); assert.equal(state.life.blink.value, 0); }
  assert.equal(faceState(rig, state.life).face, rigData.expressions.hurt);
});

test('breathing is slower and deeper relaxed than combat-ready', () => {
  const measure = (combat) => {
    const state = createPuppetState(rig, { seed: 5 });
    state.life.combat = state.life.combatTarget = combat;
    let crossings = 0; let prev = 0; let peak = 0;
    for (let i = 0; i < 1200; i += 1) {
      stepPuppet(rig, state, 1 / 60);
      const b = state.life.breath;
      if (prev < 0 && b >= 0) crossings += 1;
      prev = b; peak = Math.max(peak, b);
    }
    return { crossings, peak };
  };
  const relaxed = measure(0);
  const combat = measure(1);
  assert.ok(combat.crossings > relaxed.crossings, `${combat.crossings} vs ${relaxed.crossings} breaths in 20 s`);
  assert.ok(relaxed.peak > combat.peak);
});

test('at full draw the drawing hand is drawn in front of the face, and returns behind after', () => {
  const state = createPuppetState(rig, { seed: 2 });
  const player = new SkillPlayer(skills);
  const face = rig.layerOf('face');
  const hand = rig.layerOf('drawHand');
  const inFront = () => state.order.indexOf(hand) > state.order.indexOf(face);
  stepPuppet(rig, state, 1 / 60);
  assert.equal(inFront(), false);
  player.play('quickShot');
  let t = 0;
  let seenFront = false;
  while (player.busy) { player.update(1 / 60); t += 1 / 60; stepPuppet(rig, state, 1 / 60, player.evaluate()); if (t > 0.3 && t < 0.4) seenFront ||= inFront(); }
  assert.ok(seenFront);
  stepPuppet(rig, state, 1 / 60, null);
  assert.equal(inFront(), false);
});

test('a fast release smears the drawing hand along its motion', () => {
  const state = createPuppetState(rig, { seed: 2 });
  const player = new SkillPlayer(skills);
  const hand = rig.layerOf('drawHand');
  const width = () => { const p = state.positions[hand]; let lo = Infinity; let hi = -Infinity; for (let i = 0; i < p.length; i += 2) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); } return hi - lo; };
  player.play('chargedShot');
  let t = 0; let atRelease = 0; let held = 0;
  while (t < 1.3) {
    player.update(1 / 120); t += 1 / 120;
    stepPuppet(rig, state, 1 / 120, player.evaluate());
    if (t > 1.0 && t < 1.05) held = Math.max(held, width());
    if (t > 1.1 && t < 1.16) atRelease = Math.max(atRelease, width());
  }
  assert.ok(atRelease > held + 8, `smeared ${atRelease.toFixed(1)} vs held ${held.toFixed(1)}`);
});
