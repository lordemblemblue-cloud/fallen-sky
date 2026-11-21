import test from 'node:test';
import assert from 'node:assert/strict';
import { setNodeTwin, hasNodeTwin, resolveNodeTwin, disposeNodeTwin } from '../src/lib/webgpuMaterialTwins.js';

function fakeMaterial(extra = {}) {
  return { name: 'Fake', type: 'ShaderMaterial', version: 0, visible: true, transparent: false, opacity: 1,
    side: 0, depthWrite: true, depthTest: true, blending: 1, uniforms: { uTime: { value: 0 } }, userData: {}, ...extra };
}
function fakeTwin() {
  let version = 0;
  return { name: '', userData: {}, disposed: false, dispose() { this.disposed = true; },
    set needsUpdate(v) { if (v) version++; }, get version() { return version; } };
}

test('a twin is built once, on first use, and shares the classic uniforms', () => {
  const classic = fakeMaterial();
  let built = 0;
  setNodeTwin(classic, () => { built++; return fakeTwin(); });
  assert.equal(hasNodeTwin(classic), true);
  assert.equal(built, 0);
  const twin = resolveNodeTwin(classic);
  assert.equal(built, 1);
  assert.equal(resolveNodeTwin(classic), twin);
  assert.equal(built, 1);
  assert.equal(twin.uniforms, classic.uniforms);
  assert.equal(twin.userData.classicMaterial, classic);
  assert.match(twin.name, /node twin/);
});

test('render state follows the classic material; pipeline changes mark the twin for rebuild', () => {
  const classic = fakeMaterial();
  setNodeTwin(classic, () => fakeTwin());
  const twin = resolveNodeTwin(classic);
  const v0 = twin.version;
  classic.opacity = 0.5; classic.visible = false;
  resolveNodeTwin(classic);
  assert.equal(twin.opacity, 0.5);
  assert.equal(twin.visible, false);
  assert.equal(twin.version, v0); // opacity / visibility are uniforms and flags, not a new pipeline
  classic.transparent = true; // flipped without needsUpdate
  resolveNodeTwin(classic);
  assert.equal(twin.transparent, true);
  assert.ok(twin.version > v0);
  const v1 = twin.version;
  classic.version++; // classic needsUpdate
  resolveNodeTwin(classic);
  assert.ok(twin.version > v1);
});

test('unregistered materials, failing factories and disposal', () => {
  assert.equal(resolveNodeTwin(fakeMaterial()), null);
  const broken = fakeMaterial();
  const warn = globalThis.console.warn; globalThis.console.warn = () => {};
  try {
    setNodeTwin(broken, () => { throw new Error('no TSL'); });
    assert.equal(resolveNodeTwin(broken), null);
    assert.equal(resolveNodeTwin(broken), null); // not retried every frame
  } finally { globalThis.console.warn = warn; }
  const empty = fakeMaterial();
  setNodeTwin(empty, () => null);
  assert.equal(resolveNodeTwin(empty), null);
  const classic = fakeMaterial();
  setNodeTwin(classic, () => fakeTwin());
  const twin = resolveNodeTwin(classic);
  disposeNodeTwin(classic);
  assert.equal(twin.disposed, true);
  assert.equal(hasNodeTwin(classic), false);
  assert.equal(setNodeTwin(null, () => fakeTwin()), null);
});
