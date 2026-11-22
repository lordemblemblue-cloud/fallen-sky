// The world is mounted again on every gate crossing (and when entering it). On
// WebGPU a disposed geometry or material is not brought back the way WebGL does,
// so nothing a later mount draws with may be something an earlier mount disposed.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCastSubsystem, ownCopy, measurePoseBox } from '../src/components/game3d/threeroads/cast/castSubsystem.mjs';
import { createThreeRoadsBus } from '../src/components/game3d/threeroads/ThreeRoadsWorld.mjs';
import { createCaptionView } from '../src/components/game3d/threeroads/cast/castCaptionView.mjs';

const tick = () => new Promise(resolve => globalThis.setTimeout(resolve, 0));

// Every geometry, material and texture disposed while a test runs.
const disposed = new Set();
const watch = proto => {
  const original = proto.dispose;
  proto.dispose = function () { disposed.add(this); return original.apply(this, arguments); };
  return () => { proto.dispose = original; };
};
const unwatch = [watch(THREE.BufferGeometry.prototype), watch(THREE.Material.prototype), watch(THREE.Texture.prototype)];
test.after(() => unwatch.forEach(fn => fn()));

// A loader that hands every mount THE SAME parsed model (the worst case: a cache).
const shared = (() => {
  const scene = new THREE.Group();
  const texture = new THREE.Texture();
  const body = new THREE.Mesh(new THREE.BoxGeometry(40, 170, 30), new THREE.MeshStandardMaterial({ map: texture }));
  body.name = 'Body';
  body.position.y = 85;
  scene.add(body);
  const track = new THREE.VectorKeyframeTrack('Body.position', [0, 1], [0, 85, 0, 0, 86, 0]);
  return { scene, idleClip: new THREE.AnimationClip('idle', 1, [track]), walkClip: new THREE.AnimationClip('run', 1, [track.clone()]),
    format: 'fbx', url: 'test://archer.fbx', walkClipSpeed: 3.6, tint: 'replace' };
})();

function mount() {
  const scene = new THREE.Scene();
  const store = { getState: () => ({ storyFlags: {} }), subscribe(fn) { fn(store.getState()); return () => {}; } };
  const cast = createCastSubsystem({
    region: 'wolfveil', worldArea: 'town', areaScenes: true, preview: false, scene, bus: createThreeRoadsBus(),
    questNPCs: [], sampleGroundY: () => 22.7, camera: new THREE.PerspectiveCamera(),
  }, { loadSource: async () => shared, probe: () => true, warn: () => {}, questStore: store, playVoice: () => null });
  return { scene, cast };
}
async function settle(cast) {
  await tick();
  for (let t = 0; t < 4; t += 0.1) cast.update(0.1, { x: 100, z: 100 });
}
const drawnWith = scene => {
  const used = new Set();
  scene.traverse(node => {
    if (!node.isMesh) return;
    used.add(node.geometry);
    for (const m of [].concat(node.material)) {
      used.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) used.add(value);
    }
  });
  return used;
};

test('mount, dispose, mount again: nothing the second mount draws with was disposed', async () => {
  disposed.clear();
  const first = mount();
  await settle(first.cast);
  const firstUsed = drawnWith(first.scene);
  assert.ok(first.cast.status().people.every(p => p.state === 'ready'));
  first.cast.dispose();
  assert.ok([...firstUsed].some(item => disposed.has(item)), 'the first mount did free its own copies');

  const second = mount();
  await settle(second.cast);
  assert.ok(second.cast.status().people.every(p => p.state === 'ready'));
  const secondUsed = drawnWith(second.scene);
  assert.ok(secondUsed.size > 0);
  for (const item of secondUsed) assert.ok(!disposed.has(item), (item.type || item.constructor.name) + ' of the second mount was disposed');
  // and what the loader handed over was never disposed by either
  shared.scene.traverse(node => {
    if (!node.isMesh) return;
    assert.ok(!disposed.has(node.geometry) && !disposed.has(node.material) && !disposed.has(node.material.map));
  });
  second.cast.dispose();
});

test('an own copy shares no geometry, material or texture with what was loaded', () => {
  const copy = ownCopy(shared.scene);
  const a = shared.scene.getObjectByName('Body'), b = copy.getObjectByName('Body');
  assert.notEqual(a.geometry, b.geometry);
  assert.notEqual(a.material, b.material);
  assert.notEqual(a.material.map, b.material.map);
  assert.equal(a.material.map.source, b.material.map.source, 'the image itself is shared, not re-read');
});

test('height and foot are measured as the person stands in the idle, and the pose is put back', () => {
  const model = new THREE.Group();
  const hips = new THREE.Bone(); hips.name = 'Hips'; model.add(hips);
  const geometry = new THREE.BoxGeometry(0.4, 1.8, 0.3).translate(0, 0.9, 0);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(count * 4).fill(0).map((_, i) => (i % 4 ? 0 : 1)), 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  model.add(mesh);
  model.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([hips]));
  // the idle lowers the whole body 10 cm and squashes it to 90 %
  const idle = new THREE.AnimationClip('Idle', 1, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, -0.1, 0, 0, -0.1, 0]),
    new THREE.VectorKeyframeTrack('Hips.scale', [0, 1], [1, 0.9, 1, 1, 0.9, 1]),
  ]);
  const standing = measurePoseBox(THREE, model, idle);
  assert.ok(Math.abs(standing.height - 1.62) < 0.01, String(standing.height));
  assert.ok(Math.abs(standing.foot + 0.1) < 0.01, String(standing.foot));
  assert.deepEqual(hips.position.toArray(), [0, 0, 0], 'pose put back');
  assert.deepEqual(hips.scale.toArray(), [1, 1, 1]);
  assert.equal(measurePoseBox(THREE, model, null), null);
});

test('a subtitle is placed from the camera that draws it, not the one of the last update', () => {
  const view = createCaptionView(THREE, { geometry: new THREE.PlaneGeometry(1, 1) });
  view.mesh.material.map = new THREE.Texture(); // as if text had been drawn
  view.placeOnScreen(1, { distance: 1.25, foot: 0.17, share: 0.1 });
  assert.equal(view.anchor, 'screen');
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
  camera.position.set(10, 5, 3);
  camera.lookAt(10, 5, -10);
  camera.updateMatrixWorld(true);
  view.mesh.onBeforeRender(null, null, camera);
  const local = view.mesh.position.clone().applyMatrix4(camera.matrixWorldInverse);
  assert.ok(Math.abs(local.z + 1.25) < 1e-6, 'in front of the drawing camera');
  assert.ok(Math.abs(local.x) < 1e-6);
  assert.ok(local.y < 0, 'below the middle of the view');
  // the camera turns before the frame is drawn: the subtitle follows
  camera.lookAt(30, 5, 3);
  camera.updateMatrixWorld(true);
  view.mesh.onBeforeRender(null, null, camera);
  const turned = view.mesh.position.clone().applyMatrix4(camera.matrixWorldInverse);
  assert.ok(Math.abs(turned.z + 1.25) < 1e-6 && Math.abs(turned.x) < 1e-6);
  assert.ok(view.mesh.quaternion.angleTo(camera.quaternion) < 1e-6, 'faces the drawing camera');
  view.place(0, 0, 0, null, 1);
  assert.equal(view.anchor, 'world');
  view.dispose();
});
