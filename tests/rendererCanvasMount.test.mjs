import test from 'node:test';
import assert from 'node:assert/strict';
import { mountRendererCanvas, unmountRendererCanvas } from '../src/lib/rendererCanvasMount.mjs';

class FakeNode {
  constructor(name) { this.name = name; this.parentNode = null; this.children = []; }
  appendChild(child) {
    child.parentNode?.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  replaceChild(next, previous) {
    const index = this.children.indexOf(previous);
    if (index < 0) throw new Error('Not a child');
    if (next === previous) return previous;
    next.parentNode?.removeChild(next);
    const slot = this.children.indexOf(previous);
    this.children[slot] = next;
    previous.parentNode = null;
    next.parentNode = this;
    return previous;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index < 0) throw new Error('Not a child');
    this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
}
const renderer = (canvas) => ({ domElement: canvas });

test('mounts the actual renderer canvas without assuming the supplied canvas survived init', () => {
  const host = new FakeNode('viewport');
  const canvas = new FakeNode('webgl');
  assert.deepEqual(mountRendererCanvas(host, renderer(canvas)), { canvas, replaced: false });
  assert.deepEqual(host.children, [canvas]);
});

test('replaces claimed WebGPU canvas with a fresh fallback WebGL canvas', () => {
  const host = new FakeNode('viewport');
  const original = new FakeNode('webgpu');
  const replacement = new FakeNode('webgl');
  host.appendChild(original);
  const result = mountRendererCanvas(host, renderer(replacement), { previousCanvas: original });
  assert.deepEqual(result, { canvas: replacement, replaced: true });
  assert.deepEqual(host.children, [replacement]);
  assert.equal(original.parentNode, null);
});

test('retains an existing canvas without reattaching and resetting its surface', () => {
  const host = new FakeNode('viewport');
  const canvas = new FakeNode('canvas');
  host.appendChild(canvas);
  assert.deepEqual(mountRendererCanvas(host, renderer(canvas), { previousCanvas: canvas }), {
    canvas, replaced: false,
  });
  assert.deepEqual(host.children, [canvas]);
});

test('does not remove unrelated DOM elements during renderer replacement', () => {
  const host = new FakeNode('viewport');
  const overlay = new FakeNode('hud');
  const oldCanvas = new FakeNode('old');
  const newCanvas = new FakeNode('new');
  host.appendChild(overlay);
  host.appendChild(oldCanvas);
  mountRendererCanvas(host, renderer(newCanvas), { previousCanvas: oldCanvas });
  assert.deepEqual(host.children, [overlay, newCanvas]);
});

test('mounts replacement when teardown already detached the previous canvas', () => {
  const host = new FakeNode('viewport');
  const oldCanvas = new FakeNode('old');
  const nextCanvas = new FakeNode('next');
  assert.equal(mountRendererCanvas(host, renderer(nextCanvas), { previousCanvas: oldCanvas }).replaced, false);
  assert.deepEqual(host.children, [nextCanvas]);
});

test('moves canvas from an earlier viewport without leaving a duplicate', () => {
  const oldHost = new FakeNode('old-host');
  const host = new FakeNode('new-host');
  const canvas = new FakeNode('canvas');
  oldHost.appendChild(canvas);
  mountRendererCanvas(host, renderer(canvas));
  assert.deepEqual(oldHost.children, []);
  assert.deepEqual(host.children, [canvas]);
});

test('unmount removes only the renderer canvas, preserving overlay', () => {
  const host = new FakeNode('viewport');
  const overlay = new FakeNode('hud');
  const canvas = new FakeNode('canvas');
  host.appendChild(overlay);
  host.appendChild(canvas);
  assert.equal(unmountRendererCanvas(host, renderer(canvas)), true);
  assert.equal(unmountRendererCanvas(host, renderer(canvas)), false);
  assert.deepEqual(host.children, [overlay]);
});

test('unmount refuses to remove a canvas from a different viewport', () => {
  const host = new FakeNode('viewport');
  const other = new FakeNode('other');
  const canvas = new FakeNode('canvas');
  other.appendChild(canvas);
  assert.equal(unmountRendererCanvas(host, renderer(canvas)), false);
  assert.deepEqual(other.children, [canvas]);
});

test('invalid renderer or viewport inputs fail closed', () => {
  const host = new FakeNode('viewport');
  assert.throws(() => mountRendererCanvas(null, renderer(new FakeNode('canvas'))), TypeError);
  assert.throws(() => mountRendererCanvas(host, null), TypeError);
  assert.throws(() => mountRendererCanvas(host, {}), TypeError);
  assert.equal(unmountRendererCanvas(host, null), false);
});
