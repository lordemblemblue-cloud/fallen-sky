import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { classicOutputPolicyForMaterial, materialReadsNormals } from '../src/lib/webgpuClassicOutput.js';

// WebGL reads a missing normal attribute as (0, 0, 0); r171's WebGPURenderer substitutes an up normal instead, so the
// scene renderer gives the geometry of the materials flagged here a zero normal, as WebGL reads it.
test('lit smooth-shaded classic materials keep the WebGL result on geometry without normals', () => {
  for (const Material of [THREE.MeshStandardMaterial, THREE.MeshPhysicalMaterial, THREE.MeshLambertMaterial,
    THREE.MeshPhongMaterial, THREE.MeshToonMaterial, THREE.MeshMatcapMaterial]) {
    assert.equal(classicOutputPolicyForMaterial(new Material()).litNeedsNormals, true, Material.name);
  }
});

test('unlit and flat-shaded materials do not depend on a normal attribute', () => {
  assert.equal(classicOutputPolicyForMaterial(new THREE.MeshBasicMaterial()).litNeedsNormals, false);
  assert.equal(classicOutputPolicyForMaterial(new THREE.SpriteMaterial()).litNeedsNormals, false);
  assert.equal(classicOutputPolicyForMaterial(new THREE.PointsMaterial()).litNeedsNormals, false);
  assert.equal(classicOutputPolicyForMaterial(new THREE.MeshStandardMaterial({ flatShading: true })).litNeedsNormals, false);
});

test('only classic lit materials get the zero normal; node materials keep their own', () => {
  assert.equal(materialReadsNormals(new THREE.MeshStandardMaterial()), true);
  assert.equal(materialReadsNormals(new MeshStandardNodeMaterial()), false);
  assert.equal(materialReadsNormals(new THREE.MeshLambertMaterial({ flatShading: true })), false);
  assert.equal(materialReadsNormals(null), false);
});

test('tone mapping and fog follow the material flags', () => {
  const policy = classicOutputPolicyForMaterial(new THREE.MeshStandardMaterial({ toneMapped: false, fog: false }));
  assert.deepEqual({ toneMap: policy.toneMap, encode: policy.encode, fog: policy.fog }, { toneMap: false, encode: true, fog: false });
  const plain = classicOutputPolicyForMaterial(new THREE.MeshLambertMaterial());
  assert.deepEqual({ toneMap: plain.toneMap, encode: plain.encode, fog: plain.fog }, { toneMap: true, encode: true, fog: true });
});
