import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { morphNodeKey } from '../src/lib/webgpuSceneRenderer.js';

// Two meshes with the same layout and shape-key count must not share a built shader: r171 bakes the shape-key texture
// of the geometry that built it into the shared state (see morphNodeKey).
const morphBox = (deltaScale) => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const position = geometry.attributes.position;
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(position.array.map((v) => v * deltaScale), 3)];
  geometry.morphTargetsRelative = true;
  return geometry;
};
const renderObjectOf = (object) => ({ object, geometry: object.geometry });

test('meshes without shape keys keep the shared key', () => {
  const plain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  assert.equal(morphNodeKey(renderObjectOf(plain)), '');
  const empty = new THREE.BoxGeometry(1, 1, 1);
  empty.morphAttributes.position = [];
  assert.equal(morphNodeKey(renderObjectOf(new THREE.Mesh(empty))), '');
  assert.equal(morphNodeKey(null), '');
  assert.equal(morphNodeKey({}), '');
});

test('same-layout shape-key meshes get one key per geometry; clones of one geometry share it', () => {
  const a = new THREE.Mesh(morphBox(1));
  const b = new THREE.Mesh(morphBox(0));
  const aClone = new THREE.Mesh(a.geometry);
  const keyA = morphNodeKey(renderObjectOf(a));
  const keyB = morphNodeKey(renderObjectOf(b));
  assert.match(keyA, /^\|morph:\d+$/);
  assert.notEqual(keyA, keyB);
  assert.equal(morphNodeKey(renderObjectOf(aClone)), keyA);
  const normalOnly = new THREE.BoxGeometry(1, 1, 1);
  normalOnly.morphAttributes.normal = [new THREE.Float32BufferAttribute(normalOnly.attributes.normal.array, 3)];
  assert.equal(morphNodeKey(renderObjectOf(new THREE.Mesh(normalOnly))), `|morph:${normalOnly.id}`);
});

test('an instanced mesh with its own morph texture is keyed per object as well', () => {
  const geometry = morphBox(1);
  const one = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 2);
  const two = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 2);
  assert.equal(morphNodeKey(renderObjectOf(one)), morphNodeKey(renderObjectOf(two)), 'no own morph texture: per geometry');
  one.morphTexture = new THREE.DataTexture(new Float32Array(8), 2, 1, THREE.RedFormat, THREE.FloatType);
  two.morphTexture = new THREE.DataTexture(new Float32Array(8), 2, 1, THREE.RedFormat, THREE.FloatType);
  assert.notEqual(morphNodeKey(renderObjectOf(one)), morphNodeKey(renderObjectOf(two)));
  assert.equal(morphNodeKey(renderObjectOf(one)), `|morph:${geometry.id}:${one.id}`);
});
