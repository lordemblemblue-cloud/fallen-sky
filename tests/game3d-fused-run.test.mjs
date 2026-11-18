// The fused female's Run is the motion-captured Mixamo "Running" the Luna dashboard uses, baked onto her rig by
// tools/avatar-motion/retarget-fused.mjs (source: tools/avatar-motion/sources/Running.glb). Game 3D plays the gaits
// within a human cadence (fusedLocomotionSync.js) instead of spinning the legs to match its fast move speeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readGlb } from '../tools/avatar-motion/glb-io.mjs';
import { buildNodeGraph, animationSampler } from '../tools/avatar-motion/rig-graph.mjs';
import { locomotionTimeScale, LOCOMOTION_CADENCE } from '../src/components/game3d/player/fusedLocomotionSync.js';

const wp = (o) => o.getWorldPosition(new THREE.Vector3());

test('the fused female runs with the motion-captured dashboard run: upright, arms pumping, looping cleanly', () => {
  const glb = readGlb('public/models/characters/fused/Female_Fused_v2.glb');
  const run = glb.json.animations.find((a) => a.name === 'Run');
  assert.equal(run.extras.retargetedFrom, 'Running.glb');
  assert.ok(run.extras.speed > 2 && run.extras.speed < 3, `stance speed ${run.extras.speed}`);
  assert.ok(Math.abs(run.extras.cycleSeconds - 0.7) < 0.01, 'one 0.7 s stride cycle');
  const g = buildNodeGraph(glb), s = animationSampler(glb, run);
  const B = (n) => g.byName.get(`mixamorig:${n}`);
  const at = (t) => { g.reset(); s.apply(g, t); g.update(); };
  let maxLean = 0, minElbow = 180;
  for (let i = 0; i < 24; i++) {
    at((s.duration * i) / 24);
    const torso = wp(B('Neck')).sub(wp(B('Hips'))).normalize();
    maxLean = Math.max(maxLean, (Math.acos(torso.y) * 180) / Math.PI);
    const upper = wp(B('LeftArm')).sub(wp(B('LeftForeArm'))), lower = wp(B('LeftHand')).sub(wp(B('LeftForeArm')));
    minElbow = Math.min(minElbow, (upper.angleTo(lower) * 180) / Math.PI);
  }
  assert.ok(maxLean < 30, `torso lean ${maxLean.toFixed(1)} deg: a run, not a crouch`);
  assert.ok(minElbow < 110, `elbows bend to pump (${minElbow.toFixed(0)} deg)`);
  const pose = (t) => { at(t); return ['LeftFoot', 'RightFoot', 'LeftHand', 'RightHand', 'Head'].map((n) => wp(B(n))); };
  const first = pose(0), last = pose(s.duration);
  first.forEach((p, i) => assert.ok(p.distanceTo(last[i]) < 0.01, 'the last frame meets the first'));
});

test('gait playback keeps a human cadence at Game 3D speeds', () => {
  const clip = 2.4629, scale = 1.55;
  assert.equal(locomotionTimeScale(clip, scale, clip * scale), 1, 'feet planted at the clip speed');
  assert.equal(locomotionTimeScale(clip, scale, 9), LOCOMOTION_CADENCE.max, 'a 9 m/s run does not spin the legs 2.4x');
  assert.equal(locomotionTimeScale(clip, scale, 0.4), LOCOMOTION_CADENCE.min);
  assert.equal(locomotionTimeScale(0, scale, 9), null);
  assert.ok(LOCOMOTION_CADENCE.max <= 1.5 && LOCOMOTION_CADENCE.min >= 0.7);
});
