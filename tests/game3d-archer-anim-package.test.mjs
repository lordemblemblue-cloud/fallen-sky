// Archer animation package v1 (made in the Atom X Eve Animation Studio, docs/game3d/ARCHER_ANIM_PACKAGE_20261127.md):
// ten clips per fused body in public/models/animations/archer/, the weapon clip pack's file format, NOT loaded by the
// game. These checks read the files the way the game reads pack clips (GLTFLoader + clipBindsToActor on the real
// fused bodies) and check the package's own promises: every clip binds, timings and markers match the manifest, the
// clips join seamlessly in their sequence, loops close, and no existing game animation or manifest refers to them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clipBindsToActor } from '../src/components/game3d/player/mobilityClipPack.mjs';
import { AUTHORABLE_WEAPON_STATES } from '../src/components/game3d/weapons/weaponClipPack.mjs';
import { BODIES } from '../tools/game3d-weapon-anim/export-game-clips.mjs';

globalThis.self ??= globalThis;
const DIR = 'public/models/animations/archer/';
const manifest = JSON.parse(readFileSync(`${DIR}manifest.json`, 'utf8'));
const CLIP_IDS = ['archer_combat_idle', 'archer_nock', 'archer_raise', 'archer_draw', 'archer_full_draw_aim', 'archer_sustained_aim',
  'archer_release', 'archer_follow_through', 'archer_lower', 'archer_return_idle'];
const FRAME = 1 / 60;

async function parse(bytes) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const clipCache = new Map();
async function clipOf(rigId, id) {
  const key = `${rigId}/${id}`;
  if (!clipCache.has(key)) {
    const entry = manifest.bodies[rigId].clips[id];
    const gltf = await parse(readFileSync(`${DIR}${entry.file}`));
    clipCache.set(key, gltf.animations);
  }
  return clipCache.get(key);
}
// the value of a track at its first or last key
const ends = (track, last) => {
  const n = track.getValueSize();
  const i = last ? track.times.length - 1 : 0;
  return Array.from(track.values.slice(i * n, i * n + n));
};
const quatAngle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180 / Math.PI;

test('the manifest lists the ten clips for both fused bodies, in the shape of the weapon clip pack', () => {
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.sequence, [...CLIP_IDS, 'archer_combat_idle']);
  for (const [name, { rigId }] of Object.entries(BODIES)) {
    const body = manifest.bodies[rigId];
    assert.ok(body, `${rigId} listed`);
    assert.equal(body.dir, name === 'male' ? '' : 'female/');
    assert.deepEqual(Object.keys(body.clips), CLIP_IDS);
    for (const [id, entry] of Object.entries(body.clips)) {
      assert.match(entry.file, /^(?:female\/)?archer_[a-z_]+\.glb$/);
      assert.ok(existsSync(`${DIR}${entry.file}`), `${entry.file} exists`);
      assert.ok(entry.duration > 0);
      for (const k of ['nock', 'full', 'hit', 'cancel']) if (k in entry) assert.ok(entry[k] >= 0 && entry[k] <= entry.duration + 1e-6, `${id}.${k}`);
      assert.ok(['approved-by-qa', 'needs-review'].includes(entry.status), `${id} has a QA status`);
    }
  }
  // the moments the game would key effects and the arrow on
  const male = manifest.bodies['fused-male-v1'].clips;
  assert.ok(Math.abs(male.archer_release.hit - FRAME) < 1e-3, 'the arrow leaves on the release clip\'s first frame after the hold');
  assert.ok(male.archer_nock.nock > 0 && male.archer_draw.full === male.archer_draw.duration);
  assert.equal(male.archer_combat_idle.loop, true);
  assert.equal(male.archer_sustained_aim.loop, true);
});

test('every clip loads with the GLTFLoader and binds to its real fused body, as the game checks pack clips', async () => {
  for (const [name, { file, rigId }] of Object.entries(BODIES)) {
    const body = (await parse(readFileSync(file))).scene;
    for (const id of CLIP_IDS) {
      const anims = await clipOf(rigId, id);
      assert.equal(anims.length, 1, `${name} ${id}: one animation`);
      const clip = anims[0];
      assert.ok(clipBindsToActor(clip, body), `${name} ${id} binds to ${file}`);
      const entry = manifest.bodies[rigId].clips[id];
      assert.ok(Math.abs(clip.duration - entry.duration) <= FRAME + 1e-4, `${name} ${id}: ${clip.duration} s vs manifest ${entry.duration} s`);
    }
  }
});

test('the clips join without a jump along the sequence, and the loops close', async () => {
  for (const { rigId } of Object.values(BODIES)) {
    const seq = manifest.sequence;
    for (let i = 0; i + 1 < seq.length; i++) {
      const [a] = await clipOf(rigId, seq[i]);
      const [b] = await clipOf(rigId, seq[i + 1]);
      for (const ta of a.tracks) {
        const tb = b.tracks.find((t) => t.name === ta.name);
        assert.ok(tb, `${seq[i + 1]} animates ${ta.name}`);
        const va = ends(ta, true), vb = ends(tb, false);
        if (ta.name.endsWith('.quaternion')) assert.ok(quatAngle(va, vb) < 0.2, `${rigId} ${seq[i]} -> ${seq[i + 1]} ${ta.name}: ${quatAngle(va, vb).toFixed(3)} deg`);
        else va.forEach((v, k) => assert.ok(Math.abs(v - vb[k]) < 1e-3, `${rigId} ${seq[i]} -> ${seq[i + 1]} ${ta.name}`));
      }
    }
    for (const id of ['archer_combat_idle', 'archer_sustained_aim']) {
      const [clip] = await clipOf(rigId, id);
      for (const t of clip.tracks) {
        if (!t.name.endsWith('.quaternion')) continue;
        assert.ok(quatAngle(ends(t, false), ends(t, true)) < 0.2, `${rigId} ${id} loops on ${t.name}`);
      }
    }
  }
});

test('nothing in the game plays these clips yet: no existing animation or manifest is replaced', () => {
  for (const id of CLIP_IDS) assert.ok(!AUTHORABLE_WEAPON_STATES.includes(id), `${id} is not a game state name`);
  const weapons = readFileSync('public/models/animations/weapons/manifest.json', 'utf8');
  const mocap = readFileSync('public/models/animations/mocap/manifest.json', 'utf8');
  assert.ok(!/archer_/.test(weapons) && !/archer_/.test(mocap), 'the weapon and mocap packs do not list archer clips');
});
