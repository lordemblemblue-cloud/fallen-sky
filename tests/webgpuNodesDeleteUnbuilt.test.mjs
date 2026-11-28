import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import Nodes from 'three/src/renderers/common/nodes/Nodes.js';
import RenderObject from 'three/src/renderers/common/RenderObject.js';
import { installNodesDeleteFix } from '../src/lib/webgpuThreeFixes.js';

// three r171's own Nodes and RenderObject: a render object created (by a compile pass) but never built, then its
// material disposed, the way the low-poly session's zombie was: MeshPhongMaterial.dispose -> RenderObject.
// onMaterialDispose -> RenderObject.dispose -> onDispose (set by Objects.createRenderObject) -> Nodes.delete.
const shippedDelete = Nodes.prototype.delete;

function world() {
  const renderer = { info: { calls: 0 }, shadowMap: { enabled: false } };
  const nodes = new Nodes(renderer, {});
  nodes.getForRenderCacheKey = (renderObject) => renderObject.initialCacheKey; // as r171 does
  const lightsNode = { getCacheKey: () => 1 };
  const make = () => {
    const material = new THREE.MeshPhongMaterial({ color: 0x55aa33 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    const renderObject = new RenderObject(nodes, {}, renderer, mesh, material, new THREE.Scene(),
      new THREE.PerspectiveCamera(), lightsNode, {}, null);
    renderObject.onDispose = () => nodes.delete(renderObject);
    return { material, renderObject };
  };
  return { nodes, make };
}

test('r171 as shipped: disposing the material of a never-built render object throws out of dispose()', () => {
  const { nodes, make } = world();
  const { material } = make();
  assert.equal(nodes.delete, shippedDelete);
  assert.throws(() => material.dispose(), /usedTimes/);
});

test('with the fix the same dispose is quiet and forgets the render object', () => {
  const { nodes, make } = world();
  assert.equal(installNodesDeleteFix(nodes), true);
  assert.equal(installNodesDeleteFix(nodes), false, 'patched once per class');
  const { material, renderObject } = make();
  nodes.get(renderObject); // three looked it up once, still nothing built
  assert.equal(nodes.data.has(renderObject), true);
  assert.doesNotThrow(() => material.dispose());
  assert.equal(nodes.data.has(renderObject), false);
});

test('a built render object still releases its shared node state as r171 does', () => {
  const { nodes, make } = world();
  installNodesDeleteFix(nodes);
  const one = make(), two = make();
  const state = { usedTimes: 2 };
  nodes.nodeBuilderCache.set(one.renderObject.initialCacheKey, state);
  nodes.get(one.renderObject).nodeBuilderState = state;
  nodes.get(two.renderObject).nodeBuilderState = state;
  one.material.dispose();
  assert.equal(state.usedTimes, 1);
  assert.equal(nodes.nodeBuilderCache.has(one.renderObject.initialCacheKey), true, 'still used by the other');
  two.material.dispose();
  assert.equal(state.usedTimes, 0);
  assert.equal(nodes.nodeBuilderCache.has(one.renderObject.initialCacheKey), false, 'released with its last user');
  assert.equal(installNodesDeleteFix(null), false);
});
