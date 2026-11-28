// Locomotion batch 1 (Animation Studio, 2026-11-28): Jump_Start, Jump_Loop, Jump_Land and Fall_Loop in the mobility
// clip pack replace the code-made placeholders of player/playerMovementFallbackClips.js on the controller's existing
// jumpStart / jumpLoop / jumpLand / fallLoop slots. These checks read the files as the game does (GLTFLoader, the
// pack's manifest and binding rule) and pin what must not change: the controller's timing windows (the landing keeps
// the player busy for the clip's length on the fall path), in-place motion (the controller lifts the body), closed
// loops, and a take-off that ends where the airborne loop begins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mobilityClipPackEntries, clipBindsToActor } from '../src/components/game3d/player/mobilityClipPack.mjs';
import { createPlayerMovementFallbackClips } from '../src/components/game3d/player/playerMovementFallbackClips.js';

globalThis.self ??= globalThis;
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const manifest = JSON.parse(read('public/models/animations/mocap/manifest.json'));
const library = read('src/components/game3d/player/playerAnimationLibrary.jsx');
const controller = read('src/components/game3d/player/LunaDashboardPlayerController.jsx');
const SLOTS = { Jump_Start: 'jumpStart', Jump_Loop: 'jumpLoop', Jump_Land: 'jumpLand', Fall_Loop: 'fallLoop' };
const loader = new GLTFLoader();
loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
const parse = (path) => { const b = readFileSync(path); return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); };
const ends = (track, last) => { const n = track.getValueSize(); const i = last ? track.times.length - 1 : 0; return Array.from(track.values.slice(i * n, i * n + n)); };
const quatDeg = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180 / Math.PI;
const windowOf = (state) => Number(controller.match(new RegExp(`\\[STATES\\.${state}\\]: ([0-9.]+)`))[1]);

test('the controller maps the four pack clips onto its existing jump and fall slots', () => {
  for (const [name, slot] of Object.entries(SLOTS)) assert.match(library, new RegExp(`${name}: '${slot}'`), `${name} -> ${slot}`);
  assert.match(controller, /'fallLoop', \/\/ regular falling/, 'fallLoop is already a looping state');
});

for (const [rigId, bodyName] of [['fused-male-v1', 'Male'], ['fused-female-v1', 'Female']]) {
  test(`${bodyName}: the jump set and fall bind to the real body, stay in place and keep the controller's timing`, async () => {
    const asset = await parse(`public/models/characters/fused/${bodyName}_Fused_v2.glb`);
    const root = asset.scene;
    const entries = mobilityClipPackEntries(manifest, rigId);
    const clips = {};
    for (const name of Object.keys(SLOTS)) {
      const entry = entries.find((e) => e.name === name);
      assert.ok(entry, `${name} listed for ${rigId}`);
      const gltf = await parse(`public/${entry.url.replace(/^\//, '')}`);
      assert.equal(gltf.animations.length, 1);
      const clip = gltf.animations[0];
      clip.userData = gltf.parser.json.animations[0].extras;
      assert.equal(clip.name, name);
      assert.ok(clipBindsToActor(clip, root), `${name} binds to ${bodyName}`);
      assert.equal(clip.userData.inPlace, true, `${name} is in place: the controller moves the body`);
      // the hips stay over the feet: no horizontal travel baked into the clip
      const hips = clip.tracks.find((t) => t.name.endsWith('Hips.position'));
      if (hips) {
        const [x0, , z0] = ends(hips, false);
        for (let i = 0; i < hips.times.length; i++) {
          const [x, , z] = Array.from(hips.values.slice(i * 3, i * 3 + 3));
          assert.ok(Math.hypot(x - x0, z - z0) < 3, `${name}: hips stay in place (rig units)`);
        }
      }
      clips[name] = clip;
    }
    // timing: the one-shots fit the controller's own windows (the fall landing keeps the player busy for the clip)
    assert.ok(clips.Jump_Start.duration <= windowOf('JUMP_START') + 1e-6, `take-off ${clips.Jump_Start.duration} s`);
    assert.ok(clips.Jump_Land.duration <= windowOf('JUMP_LAND') + 1e-6, `landing ${clips.Jump_Land.duration} s`);
    // the loops close, and the take-off ends on the airborne loop's first pose
    for (const name of ['Jump_Loop', 'Fall_Loop']) {
      assert.equal(clips[name].userData.loop, true);
      for (const t of clips[name].tracks) if (t.name.endsWith('.quaternion')) assert.ok(quatDeg(ends(t, false), ends(t, true)) < 0.5, `${name} loops on ${t.name}`);
    }
    for (const t of clips.Jump_Start.tracks) {
      if (!t.name.endsWith('.quaternion')) continue;
      const u = clips.Jump_Loop.tracks.find((x) => x.name === t.name);
      assert.ok(quatDeg(ends(t, true), ends(u, false)) < 0.5, `take-off flows into the loop on ${t.name}`);
    }
  });
}

test('the code-made placeholders still exist as the last resort if the pack cannot load', () => {
  const fake = new THREE.Object3D();
  for (const n of ['Hips', 'Spine2', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm']) {
    const bone = new THREE.Bone(); bone.name = 'mixamorig' + n; fake.add(bone);
  }
  const fallback = createPlayerMovementFallbackClips(fake);
  for (const slot of ['jumpStart', 'jumpLoop', 'jumpLand']) assert.ok(fallback[slot] || Object.keys(fallback).length === 0, slot);
});
