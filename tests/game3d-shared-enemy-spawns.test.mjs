import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSharedSkinnedFBXSpawner } from '../src/components/game3d/performance/SharedSkinnedFBXSpawner.mjs';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('one FBX parse feeds many unique actors, only two clones per frame', async () => {
  const frames = [];
  let loads = 0, resolveModel;
  const loader = { load(url, onLoaded) { loads++; assert.equal(url, '/creature.fbx'); resolveModel = onLoaded; } };
  const source = createSharedSkinnedFBXSpawner(loader, '/creature.fbx', {
    scheduleFrame: cb => { frames.push(cb); return frames.length; },
    cancelFrame: () => {},
  });
  const clones = [];
  for (let i = 0; i < 5; i++) source.spawn(model => clones.push(model));
  assert.equal(loads, 1);
  const prototype = new THREE.Group();
  prototype.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  resolveModel(prototype);
  await flush();
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(clones.length, 2);
  frames.shift()();
  assert.equal(clones.length, 4);
  frames.shift()();
  assert.equal(clones.length, 5);
  assert.notEqual(clones[0], clones[1]);
  assert.notEqual(clones[0].children[0], clones[1].children[0]);
  assert.equal(clones[0].children[0].geometry, clones[1].children[0].geometry);
  clones[0].position.x = 9;
  assert.equal(clones[1].position.x, 0);
  source.dispose();
});

test('dispose prevents stale actor insertion, and a failed fetch can retry', async () => {
  let onLoaded, onError, count = 0;
  const loader = { load(url, ok, progress, fail) { count++; onLoaded = ok; onError = fail; } };
  const frames = [];
  const source = createSharedSkinnedFBXSpawner(loader, '/creature.fbx', {
    scheduleFrame: fn => { frames.push(fn); return frames.length; },
    cancelFrame: () => {},
  });
  const errors = [];
  source.spawn(() => assert.fail('should not spawn on failed load'), error => errors.push(error.message));
  onError(new Error('network'));
  await flush();
  assert.deepEqual(errors, ['network']);
  source.spawn(() => assert.fail('should not spawn after dispose'));
  assert.equal(count, 2);
  source.dispose();
  onLoaded(new THREE.Group());
  await flush();
  assert.equal(frames.length, 0);
});

