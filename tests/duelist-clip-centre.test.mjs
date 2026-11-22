// A clip authored off-centre is drawn over the body (client/motionLibrary.mjs OFF_CENTRE): two of the staff's
// Blender clips start with the hips 1.3 m and 3.7 m to the side, which drew the Assassin far from where the rules
// had her, swinging round her as she turned (owner, 2026-11-22: "she can snap out of place and go across the map").
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { describeRig, retargetClip, OFF_CENTRE } from '../src/components/duelist/client/motionLibrary.mjs';

// a little Mixamo-named rig: hips, one leg
function rig() {
  const root = new THREE.Object3D();
  const hips = new THREE.Bone(); hips.name = 'mixamorigHips'; hips.position.set(0, 0.9, 0);
  const up = new THREE.Bone(); up.name = 'mixamorigLeftUpLeg'; up.position.set(0.1, -0.05, 0);
  const knee = new THREE.Bone(); knee.name = 'mixamorigLeftLeg'; knee.position.set(0, -0.42, 0);
  const foot = new THREE.Bone(); foot.name = 'mixamorigLeftFoot'; foot.position.set(0, -0.42, 0);
  root.add(hips); hips.add(up); up.add(knee); knee.add(foot);
  return root;
}
const hipsTrack = (clip) => clip.tracks.find((t) => t.name.endsWith('.position'));

test('a clip whose hips start off to the side is moved back over the body, keeping its own motion', () => {
  const source = describeRig(rig());
  const target = describeRig(rig());
  // starts 3.7 m to the side and moves 0.3 m forward over the clip
  const off = new THREE.AnimationClip('staffLeap', 1, [new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 0.5, 1],
    [3.7, 0.9, 0, 3.7, 0.85, 0.15, 3.7, 0.9, 0.3])]);
  const v = hipsTrack(retargetClip(off, source, target)).values;
  assert.ok(Math.hypot(v[0], v[2]) < 1e-6, `starts over the body (${v[0].toFixed(2)}, ${v[2].toFixed(2)})`);
  assert.ok(Math.abs(v[8] - 0.3) < 1e-6 && Math.abs(v[6]) < 1e-6, 'its own 0.3 m stays');
  assert.ok(Math.abs(v[4] - 0.85) < 1e-6, 'and its rise and fall');
  // a clip that starts near the spot (a sway, a step) is left as it is
  const near = new THREE.AnimationClip('walk', 1, [new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1],
    [OFF_CENTRE * 0.5, 0.9, 0.05, OFF_CENTRE * 0.5, 0.9, 0.4])]);
  const w = hipsTrack(retargetClip(near, source, target)).values;
  assert.ok(Math.abs(w[0] - OFF_CENTRE * 0.5) < 1e-6 && Math.abs(w[2] - 0.05) < 1e-6, 'untouched');
});
