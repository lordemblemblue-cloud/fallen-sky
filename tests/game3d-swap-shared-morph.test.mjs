// A swapped-out body keeps the morph geometries a live mesh shares a three r171 node shader with
// (src/components/game3d/player/sharedMorphGeometry.mjs): disposing them destroyed the morph texture a fused-body NPC
// was drawing with, and every WebGPU frame was rejected (a black world).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BufferGeometry, BufferAttribute, Mesh, MeshStandardMaterial, Scene, Group } from 'three';
import { morphLayoutKey, keepSharedMorphGeometry } from '../src/components/game3d/player/sharedMorphGeometry.mjs';

function geometry(vertices, morphs, { uv = true } = {}) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(vertices * 3), 3));
  if (uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(vertices * 2), 2));
  if (morphs) g.morphAttributes.position = Array.from({ length: morphs }, () => new BufferAttribute(new Float32Array(vertices * 3), 3));
  return g;
}

test('the layout key follows three\'s render cache key: attributes and morph count, not vertex count or identity', () => {
  assert.equal(morphLayoutKey(geometry(10, 0)), null, 'no morph targets: never shares a baked morph texture');
  assert.equal(morphLayoutKey(geometry(257, 14)), morphLayoutKey(geometry(257, 14)), 'two irises from two loads');
  assert.equal(morphLayoutKey(geometry(257, 14)), morphLayoutKey(geometry(481, 14)), 'vertex count is not in three\'s key');
  assert.notEqual(morphLayoutKey(geometry(257, 14)), morphLayoutKey(geometry(257, 45)));
  assert.notEqual(morphLayoutKey(geometry(257, 14)), morphLayoutKey(geometry(257, 14, { uv: false })));
});

test('a released body keeps only the morph geometries a live mesh shares a layout with', () => {
  const scene = new Scene();
  const npc = new Group();
  npc.add(new Mesh(geometry(257, 14), new MeshStandardMaterial())); // the town NPC's iris
  npc.add(new Mesh(geometry(40997, 45), new MeshStandardMaterial()));
  scene.add(npc);
  const keep = keepSharedMorphGeometry(scene);
  assert.equal(keep(geometry(257, 14)), true, 'the old body\'s iris: the NPC may draw with its morph texture');
  assert.equal(keep(geometry(40997, 45)), true);
  assert.equal(keep(geometry(319, 14, { uv: false })), false, 'a layout no live mesh has is freed');
  assert.equal(keep(geometry(500, 0)), false, 'no morph targets: freed');
  assert.equal(keepSharedMorphGeometry(new Scene())(geometry(257, 14)), false, 'nothing live: everything is freed');
});

test('the swap releases the old body with that rule, after taking it out of the scene', () => {
  const world = readFileSync(new URL('../src/components/game3d/GameWorld3D.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(world, /if \(old\) \{ old\.parent\?\.remove\(old\); disposeAvatarModel\(old, \{ keepGeometry: keepSharedMorphGeometry\(scene\) \}\); \}/);
  const runtime = readFileSync(new URL('../src/components/onboarding/avatarAssetRuntime.js', import.meta.url), 'utf8');
  assert.match(runtime, /export function disposeAvatarModel\(model,\{keepGeometry=null\}=\{\}\)/);
  assert.match(runtime, /geometries\.forEach\(g=>\{if\(!keepGeometry\?\.\(g\)\)g\.dispose\(\);\}\)/);
});
