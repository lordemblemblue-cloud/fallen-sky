// The bow's own clips (Atom X Eve Animation Studio, package bow-game, 2026-11-28): bowDraw, bowHold, bowRelease and
// bowQuick in the weapon clip pack replace the code-made bow poses of weapons/weaponComboClips.js (BOW_SHOTS) on each
// body that lists them. The owner's report (2026-11-28): Eve's string hand went behind and into her head and her body
// while she charged a shot.
// These checks read the files as the game does (GLTFLoader, the pack's manifest and binding rule) and pin:
// - the owner's 2026-11-19 timing, the same numbers BOW_SHOTS uses;
// - a draw that ends at full draw (the controller holds when the draw clip ends) on the hold's first pose, and a
//   seamless hold;
// - the string hand's palm and middle knuckle never inside the head or the torso, at every frame of the draw (every
//   charge level the player sees), the hold and the shots. Inside = deeper than 1.5 cm into the convex shape of that
//   body part's own skin, posed by the clip (the convex shape is fuller than the skin, so resting on the jaw passes);
// - whenever the hand is at the head, it is on the right side of the face, and never behind the head: the
//   code-made hold crosses it to the far side of Eve's face, behind her head as the camera sees it (the owner's video).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { weaponClipPackEntries, weaponClipUserData } from '../src/components/game3d/weapons/weaponClipPack.mjs';
import { clipBindsToActor } from '../src/components/game3d/player/mobilityClipPack.mjs';
import { BOW_SHOTS } from '../src/components/game3d/weapons/weaponComboClips.js';
import { BODIES, GAME_HEIGHT } from '../tools/game3d-weapon-anim/export-game-clips.mjs';

globalThis.self ??= globalThis;
const manifest = JSON.parse(readFileSync('public/models/animations/weapons/manifest.json', 'utf8'));
const BOW_STATES = ['bowDraw', 'bowHold', 'bowRelease', 'bowQuick'];
const SHOT = Object.fromEntries(BOW_SHOTS.filter((s) => BOW_STATES.includes(s.name)).map((s) => [s.name, s]));
const DEPTH_LIMIT = 0.015; // m into the convex shape of the head or the torso
const SIDE_MIN = 0.6; // the knuckle at least this many of the head's half widths right of its centre
const BACK_MIN = 0.05; // m in front of the back of the head, unless the hand is out beside the head
const UP = new THREE.Vector3(0, 1, 0);

async function parse(path) {
  const b = readFileSync(path);
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
}
async function loadBody(name) {
  const model = (await parse(BODIES[name].file)).scene;
  model.userData.rigId = BODIES[name].rigId;
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
  model.scale.multiplyScalar(GAME_HEIGHT / (box.max.y - box.min.y)); // metres, as the game scales the body
  model.updateMatrixWorld(true);
  return model;
}
const short = (name) => name.replace('mixamorig:', '').replace('mixamorig', '');
const quatDeg = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180 / Math.PI;
const ends = (track, last) => { const n = track.getValueSize(); const i = last ? track.times.length - 1 : 0; return Array.from(track.values.slice(i * n, i * n + n)); };
const bowEntries = (rigId) => weaponClipPackEntries(manifest, rigId).filter((e) => BOW_STATES.includes(e.state));

test('Eve has her own draw and hold in the pack, listed with the owner\'s timing', () => {
  const states = bowEntries('fused-female-v1').map((e) => e.state);
  for (const state of ['bowDraw', 'bowHold']) assert.ok(states.includes(state), `${state} listed for Eve`);
  for (const rigId of ['fused-male-v1', 'fused-female-v1']) {
    for (const { state, entry } of bowEntries(rigId)) {
      const shot = SHOT[state];
      const u = weaponClipUserData(entry);
      for (const key of ['hit', 'cancel', 'nock', 'full']) {
        if (Number.isFinite(shot[key])) assert.equal(u[key], shot[key], `${rigId} ${state}.${key}: the owner's 2026-11-19 timing`);
      }
      const end = shot.keys[shot.keys.length - 1].t;
      if (state === 'bowDraw') assert.equal(entry.duration, shot.full, 'the draw ends at full draw: the controller holds when it ends');
      else if (state === 'bowHold') assert.ok(Math.abs(entry.duration - end) < 1e-6 && u.loop === true, 'a 1.6 s loop');
      else assert.ok(entry.duration <= end + 1e-6, `${state} is back at ready by ${end} s`);
    }
  }
});

for (const name of ['female', 'male']) {
  const rigId = BODIES[name].rigId;
  test(`${name}: the bow clips bind to the body, flow into each other, and keep the string hand out of the head and body`, async (t) => {
    const listed = bowEntries(rigId);
    if (!listed.length) { t.skip(`no bow clips for ${rigId} yet`); return; }
    const model = await loadBody(name);
    const clips = {};
    for (const { state, url, entry } of listed) {
      const gltf = await parse(`public${url}`);
      const clip = gltf.animations[0];
      assert.ok(clip && clipBindsToActor(clip, model), `${state} binds to ${rigId}`);
      for (const track of clip.tracks) assert.ok(track.values.every(Number.isFinite), `${state} ${track.name}`);
      assert.ok(Math.abs(clip.duration - entry.duration) < 1 / 60 + 1e-6, `${state}: the file is as long as its entry`);
      clip.name = state;
      clips[state] = clip;
    }
    if (clips.bowDraw && clips.bowHold) {
      for (const track of clips.bowDraw.tracks) {
        if (!track.name.endsWith('.quaternion')) continue;
        const hold = clips.bowHold.tracks.find((x) => x.name === track.name);
        if (hold) assert.ok(quatDeg(ends(track, true), ends(hold, false)) < 0.5, `full draw flows into the hold on ${track.name}`);
      }
    }
    if (clips.bowHold) {
      for (const track of clips.bowHold.tracks) {
        if (track.name.endsWith('.quaternion')) assert.ok(quatDeg(ends(track, false), ends(track, true)) < 0.5, `the hold loops on ${track.name}`);
      }
    }

    // the body's own skin (the body and head meshes, not the hair), grouped by the bone that moves each vertex most
    const groups = { head: [], torso: [], palm: [] };
    model.traverse((mesh) => {
      if (!mesh.isSkinnedMesh || /^hair/i.test(mesh.name)) return;
      const { skinIndex, skinWeight, position } = mesh.geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best)) best = k;
        const bone = short(mesh.skeleton.bones[skinIndex.getComponent(i, best)].name);
        if (bone === 'Head') groups.head.push([mesh, i]);
        else if (['Hips', 'Spine', 'Spine1', 'Spine2'].includes(bone)) groups.torso.push([mesh, i]);
        else if (bone === 'RightHand') groups.palm.push([mesh, i]);
      }
    });
    assert.ok(groups.head.length > 100 && groups.torso.length > 100 && groups.palm.length > 20, 'the body has a head, a torso and a hand');
    const bone = (n) => { let f = null; model.traverse((o) => { if (!f && o.isBone && short(o.name) === n) f = o; }); return f; };
    const knuckle = bone('RightHandMiddle1');
    const bowHand = bone('LeftHand');
    const v = new THREE.Vector3();
    const skinPoint = ([mesh, i]) => mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).clone();
    const depthIn = (hull, p) => -Math.max(...hull.faces.map((f) => f.distanceToPoint(p)));
    const worst = {};
    const worse = (key, value, time, low) => {
      const w = worst[key];
      if (!w || (low ? value < w.value : value > w.value)) worst[key] = { value, time };
    };

    const mixer = new THREE.AnimationMixer(model);
    for (const [state, clip] of Object.entries(clips)) {
      mixer.stopAllAction();
      const action = mixer.clipAction(clip);
      action.reset().play();
      // every frame of the draw and the shots (every charge level), the hold every tenth of a second
      const step = state === 'bowHold' ? 0.1 : 1 / 60;
      for (let time = 0; time <= clip.duration + 1e-6; time += step) {
        action.time = Math.min(time, clip.duration - 1e-4);
        mixer.update(0);
        model.updateMatrixWorld(true);
        const headPoints = groups.head.map(skinPoint);
        const hulls = { head: new ConvexHull().setFromPoints(headPoints), torso: new ConvexHull().setFromPoints(groups.torso.map(skinPoint)) };
        const k = knuckle.getWorldPosition(new THREE.Vector3());
        const hand = [...groups.palm.map(skinPoint), k];
        for (const [part, hull] of Object.entries(hulls)) {
          const d = Math.max(...hand.map((p) => depthIn(hull, p)));
          worse(`${state} ${part} (cm)`, d * 100, time, false);
          assert.ok(d <= DEPTH_LIMIT, `${state} at ${time.toFixed(3)} s: the string hand is ${(d * 100).toFixed(1)} cm inside the ${part}`);
        }
        // at the head: the right side of the face (a right-handed draw), in front of the back of the head
        const centre = headPoints.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / headPoints.length);
        if (k.distanceTo(centre) < 0.3) {
          const arrow = bowHand.getWorldPosition(new THREE.Vector3()).sub(k).setY(0).normalize();
          const right = arrow.clone().cross(UP).normalize();
          const halfWidth = Math.max(...headPoints.map((p) => p.clone().sub(centre).dot(right)));
          const side = k.clone().sub(centre).dot(right) / halfWidth;
          const inFront = k.dot(arrow) - Math.min(...headPoints.map((p) => p.dot(arrow)));
          worse(`${state} side (head half widths)`, side, time, true);
          assert.ok(side >= SIDE_MIN, `${state} at ${time.toFixed(3)} s: the string hand is at ${side.toFixed(2)} of the head's half width, not beside the right of the face`);
          // level with the back of the head is fine out beside it (the loose flicks the hand back past the jaw)
          assert.ok(inFront >= BACK_MIN || side >= 1, `${state} at ${time.toFixed(3)} s: the string hand is behind the head (${(inFront * 100).toFixed(1)} cm from its back, ${side.toFixed(2)} half widths out)`);
        }
      }
    }
    t.diagnostic(`worst per clip: ${Object.entries(worst).map(([key, w]) => `${key} ${w.value.toFixed(2)} at ${w.time.toFixed(2)} s`).join(', ')}`);
  });
}
