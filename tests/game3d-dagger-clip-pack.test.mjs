// The daggers' own clips (Atom X Eve Animation Studio, package dagger-game, 2026-11-28): idleDaggers, daggerLight1,
// daggerLight2, daggerStab and daggerCharge in the weapon clip pack replace the code-made dagger poses of
// weapons/weaponComboClips.js (DAGGER_COMBO, DAGGER_CHARGE, IDLE_DAGGERS) on each body. They are original, keyed by
// hand: the owner's own move list (2026-11-19, reverse grip in both hands), nothing from any other game.
// These checks read the files as the game does (GLTFLoader, the pack's manifest and binding rule) and pin:
// - the owner's timing, the same numbers the code-made moves use (hit, sweep, cancel, wind-up, the charge's coil);
// - every move starting and ending on the guard the idle loops on (the game blends between them), a seamless idle;
// - both fists never inside the head or the torso at any frame (deeper than 1.5 cm into the convex shape of that
//   body part's own skin, posed by the clip);
// - each strike reaching out: at its hit, the striking fist is well in front of where it waits in the guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { weaponClipPackEntries, weaponClipUserData } from '../src/components/game3d/weapons/weaponClipPack.mjs';
import { clipBindsToActor } from '../src/components/game3d/player/mobilityClipPack.mjs';
import { DAGGER_COMBO, DAGGER_CHARGE, IDLE_DAGGERS } from '../src/components/game3d/weapons/weaponComboClips.js';
import { BODIES, GAME_HEIGHT } from '../tools/game3d-weapon-anim/export-game-clips.mjs';

globalThis.self ??= globalThis;
const manifest = JSON.parse(readFileSync('public/models/animations/weapons/manifest.json', 'utf8'));
const CODE = Object.fromEntries([...DAGGER_COMBO, DAGGER_CHARGE, IDLE_DAGGERS].map((m) => [m.name, m]));
const STATES = Object.keys(CODE);
const STRIKER = { daggerLight1: ['Right'], daggerLight2: ['Left'], daggerStab: ['Right'], daggerCharge: ['Left', 'Right'] };
const DEPTH_LIMIT = 0.015;

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
const daggerEntries = (rigId) => weaponClipPackEntries(manifest, rigId).filter((e) => STATES.includes(e.state));

test('both bodies list all five dagger clips with the owner\'s timing', () => {
  for (const rigId of ['fused-male-v1', 'fused-female-v1']) {
    const listed = daggerEntries(rigId);
    assert.deepEqual(listed.map((e) => e.state).sort(), [...STATES].sort(), `${rigId}: the five dagger states`);
    for (const { state, entry } of listed) {
      const code = CODE[state];
      const u = weaponClipUserData(entry);
      for (const key of ['hit', 'cancel', 'chargeFrom', 'charge']) {
        if (Number.isFinite(code[key])) assert.equal(u[key], code[key], `${rigId} ${state}.${key}`);
      }
      if (code.sweep) assert.deepEqual(u.sweep, code.sweep, `${rigId} ${state}.sweep`);
      // the code's wind-up is its second key (weaponComboClips.js): the strike's own clip keeps it
      if (!code.idle) assert.equal(u.windUp, code.keys[1].t, `${rigId} ${state}.windUp`);
      const end = code.keys[code.keys.length - 1].t;
      assert.ok(Math.abs(entry.duration - end) <= 1 / 60, `${rigId} ${state}: ${entry.duration} s, the code's ${end} s`);
      if (code.idle) assert.equal(u.loop, true, `${state} loops`);
    }
  }
});

for (const name of ['female', 'male']) {
  const rigId = BODIES[name].rigId;
  test(`${name}: the dagger clips bind, start and end on the guard, keep the fists out of the head and body, and reach out`, async (t) => {
    const model = await loadBody(name);
    const clips = {};
    for (const { state, url } of daggerEntries(rigId)) {
      const clip = (await parse(`public${url}`)).animations[0];
      assert.ok(clip && clipBindsToActor(clip, model), `${state} binds to ${rigId}`);
      for (const track of clip.tracks) assert.ok(track.values.every(Number.isFinite), `${state} ${track.name}`);
      clip.name = state;
      clips[state] = clip;
    }
    const idle = clips.idleDaggers;
    const guard = Object.fromEntries(idle.tracks.filter((tr) => tr.name.endsWith('.quaternion')).map((tr) => [tr.name, ends(tr, false)]));
    for (const tr of idle.tracks) if (tr.name.endsWith('.quaternion')) assert.ok(quatDeg(ends(tr, false), ends(tr, true)) < 0.5, `the idle loops on ${tr.name}`);
    for (const [state, clip] of Object.entries(clips)) {
      if (state === 'idleDaggers') continue;
      for (const tr of clip.tracks) {
        if (!guard[tr.name]) continue;
        assert.ok(quatDeg(ends(tr, false), guard[tr.name]) < 0.5, `${state} starts on the guard (${tr.name})`);
        assert.ok(quatDeg(ends(tr, true), guard[tr.name]) < 0.5, `${state} ends on the guard (${tr.name})`);
      }
    }

    // the body's own skin (the body and head meshes, not the hair), grouped by the bone that moves each vertex most
    const groups = { head: [], torso: [], Left: [], Right: [] };
    model.traverse((mesh) => {
      if (!mesh.isSkinnedMesh || /^hair/i.test(mesh.name)) return;
      const { skinIndex, skinWeight, position } = mesh.geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best)) best = k;
        const bone = short(mesh.skeleton.bones[skinIndex.getComponent(i, best)].name);
        if (bone === 'Head') groups.head.push([mesh, i]);
        else if (['Hips', 'Spine', 'Spine1', 'Spine2'].includes(bone)) groups.torso.push([mesh, i]);
        else if (bone === 'LeftHand' || bone === 'RightHand') groups[bone.replace('Hand', '')].push([mesh, i]);
      }
    });
    assert.ok(groups.head.length > 100 && groups.torso.length > 100 && groups.Left.length > 20 && groups.Right.length > 20, 'a head, a torso and two hands');
    const bone = (n) => { let f = null; model.traverse((o) => { if (!f && o.isBone && short(o.name) === n) f = o; }); return f; };
    const chest = bone('Spine2');
    const hands = { Left: bone('LeftHand'), Right: bone('RightHand') };
    const v = new THREE.Vector3();
    const skinPoint = ([mesh, i]) => mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).clone();
    const depthIn = (hull, p) => -Math.max(...hull.faces.map((f) => f.distanceToPoint(p)));
    const fistAt = (side) => hands[side].getWorldPosition(new THREE.Vector3());
    const worst = {};
    const mixer = new THREE.AnimationMixer(model);
    const poseAt = (clip, time) => {
      mixer.stopAllAction();
      const action = mixer.clipAction(clip);
      action.reset().play();
      action.time = Math.min(time, clip.duration - 1e-4);
      mixer.update(0);
      model.updateMatrixWorld(true);
    };
    poseAt(idle, 0);
    const guardFist = { Left: fistAt('Left'), Right: fistAt('Right') };
    // the body's facing: from the chest toward the fists waiting in the guard, level
    const facing = guardFist.Left.clone().add(guardFist.Right).multiplyScalar(0.5).sub(chest.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
    for (const [state, clip] of Object.entries(clips)) {
      const step = state === 'idleDaggers' ? 0.1 : 1 / 60;
      for (let time = 0; time <= clip.duration + 1e-6; time += step) {
        poseAt(clip, time);
        const hulls = { head: new ConvexHull().setFromPoints(groups.head.map(skinPoint)), torso: new ConvexHull().setFromPoints(groups.torso.map(skinPoint)) };
        for (const side of ['Left', 'Right']) {
          const fist = [...groups[side].map(skinPoint), hands[side].getWorldPosition(new THREE.Vector3())];
          for (const [part, hull] of Object.entries(hulls)) {
            const d = Math.max(...fist.map((p) => depthIn(hull, p)));
            const key = `${state} ${side.toLowerCase()} fist in ${part} (cm)`;
            if (!(d * 100 <= worst[key])) worst[key] = d * 100;
            assert.ok(d <= DEPTH_LIMIT, `${state} at ${time.toFixed(3)} s: the ${side.toLowerCase()} fist is ${(d * 100).toFixed(1)} cm inside the ${part}`);
          }
        }
      }
      if (STRIKER[state]) {
        poseAt(clip, CODE[state].hit);
        for (const side of STRIKER[state]) {
          const gain = fistAt(side).sub(guardFist[side]).dot(facing);
          worst[`${state} ${side.toLowerCase()} fist forward at the hit (cm)`] = gain * 100;
          assert.ok(gain > 0.06, `${state}: at the hit the ${side.toLowerCase()} fist is only ${(gain * 100).toFixed(1)} cm in front of its guard`);
        }
      }
    }
    t.diagnostic(`worst: ${Object.entries(worst).map(([k, val]) => `${k} ${val.toFixed(1)}`).join(', ')}`);
  });
}
