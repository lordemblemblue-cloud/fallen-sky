// Low-poly world (docs/GAME3D_LOW_POLY_20261122.md): the town plaza's deep static merge (AXETownStaticMerge.mjs)
// must draw exactly the same triangles as before in every state the town can be in (near / far room LODs, roofs
// off, indoor cutaway, a different showroom mount, doors, lanterns, gates and mounts animating), with far fewer
// draw calls. The plaza is built twice from the same random seed, with and without the merge, and compared.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAXETownPlaza } from '../src/components/game3d/wolfveil/AXETownPlaza.js';

// Canvas stand-in: the plaza paints its textures on 2D canvases; geometry does not depend on them.
function fakeContext() {
  const target = {};
  const handler = {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'getImageData' || key === 'createImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(4 * w * h), width: w, height: h });
      return () => proxy;
    },
    set(obj, key, value) { obj[key] = value; return true; },
  };
  const proxy = new Proxy(target, handler);
  return proxy;
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => fakeContext() }) };

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function build(deepStaticMerge) {
  const random = Math.random;
  Math.random = seeded(20261122);
  try {
    return createAXETownPlaza({ THREE, quality: 'low', includeLighting: false, deepStaticMerge });
  } finally {
    Math.random = random;
  }
}

function materialKey(m) {
  return [m.type, m.name, m.color?.getHexString?.(), m.emissive?.getHexString?.(), m.roughness, m.metalness,
    m.side, m.transparent ? 1 : 0, m.opacity, m.map ? 'map' : '', m.vertexColors ? 'vc' : ''].join('|');
}

/** Sum of every visible triangle in world space, per material look: count, area, centroid moments. */
function visibleSignature(root) {
  root.updateMatrixWorld(true);
  const sig = new Map();
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  const ab = new THREE.Vector3(); const ac = new THREE.Vector3();
  let drawCalls = 0; let triangles = 0;
  const visible = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
  root.traverse((mesh) => {
    if (!mesh.isMesh || !visible(mesh)) return;
    drawCalls++;
    const g = mesh.geometry; const pos = g.attributes.position; const idx = g.index;
    const count = idx ? idx.count : pos.count;
    const look = materialKey(mesh.material);
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = idx ? idx.getX(i) : i; const ib = idx ? idx.getX(i + 1) : i + 1; const ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
      const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
      const cx = (a.x + b.x + c.x) / 3; const cy = (a.y + b.y + c.y) / 3; const cz = (a.z + b.z + c.z) / 3;
      // per material and 2 m cell (offset so box faces on whole metres do not sit on a cell border): a part that
      // moved, vanished or appeared changes its own cell's sums, not a town-wide total
      const key = `${look}@${Math.floor((cx + 0.137) / 2)},${Math.floor((cy + 0.071) / 2)},${Math.floor((cz + 0.113) / 2)}`;
      let s = sig.get(key);
      if (!s) { s = { n: 0, area: 0, x: 0, y: 0, z: 0, xx: 0, yy: 0, zz: 0 }; sig.set(key, s); }
      s.n++; s.area += area; s.x += cx; s.y += cy; s.z += cz; s.xx += cx * cx; s.yy += cy * cy; s.zz += cz * cz;
      triangles++;
    }
  });
  return { sig, drawCalls, triangles };
}

function assertSameLook(before, after, label) {
  assert.equal(after.triangles, before.triangles, `${label}: same number of visible triangles`);
  assert.deepEqual([...after.sig.keys()].sort(), [...before.sig.keys()].sort(), `${label}: same materials visible`);
  for (const [key, s] of before.sig) {
    const t = after.sig.get(key);
    assert.equal(t.n, s.n, `${label}: triangle count for ${key}`);
    for (const f of ['area', 'x', 'y', 'z', 'xx', 'yy', 'zz']) {
      const tol = 1e-5 * Math.max(1, Math.abs(s[f])) + 1e-5 * s.n; // float32 rounding of merged positions
      assert.ok(Math.abs(t[f] - s[f]) <= tol, `${label}: ${key} ${f} ${t[f]} vs ${s[f]}`);
    }
  }
}

// The same sequence of states on both builds; signatures compared after each step.
function states(town) {
  const steps = [];
  const at = (x, z) => new THREE.Vector3(x, 0, z).add(town.group.position);
  steps.push(['built', () => {}]);
  steps.push(['player at the fountain', () => { for (let i = 0; i < 4; i++) town.update(0.3, 1 + i * 0.3, at(0, 9)); }]);
  steps.push(['player at the blacksmith', () => { for (let i = 0; i < 4; i++) town.update(0.3, 3 + i * 0.3, at(-16.2, -16.2)); }]);
  steps.push(['player at a far edge', () => { for (let i = 0; i < 4; i++) town.update(0.3, 5 + i * 0.3, at(0, 120)); }]);
  steps.push(['back at the shops, animating 3 s', () => { for (let i = 0; i < 30; i++) town.update(0.1, 7 + i * 0.1, at(14, -14)); }]);
  steps.push(['doors closed', () => { town.setDoorsOpen(false); for (let i = 0; i < 20; i++) town.update(0.1, 10 + i * 0.1, at(-16, 16)); }]);
  steps.push(['roofs hidden, indoor cutaway', () => { town.setRoofsVisible(false); town.setIndoorCutaway('blacksmith'); town.update(0.1, 12, at(-16.2, -16.2)); }]);
  steps.push(['another showroom mount', () => { town.setShowroomModel(1); town.update(0.1, 12.2, at(-16.2, 16.2)); }]);
  return steps;
}

test('town plaza deep merge: identical visible triangles in every state, far fewer draw calls', () => {
  const plain = build(false);
  const merged = build(true);
  const stats = merged.performanceStats.deepStaticMerge;
  assert.ok(stats && stats.merged > 0, 'the merge ran');
  const a = states(plain); const b = states(merged);
  const report = [];
  for (let i = 0; i < a.length; i++) {
    a[i][1](); b[i][1]();
    const before = visibleSignature(plain.group); const after = visibleSignature(merged.group);
    globalThis.console.log(`${a[i][0]}: ${before.drawCalls} -> ${after.drawCalls} draw calls, ${before.triangles} / ${after.triangles} triangles`);
    assertSameLook(before, after, a[i][0]);
    report.push(`${a[i][0]}: ${before.drawCalls} -> ${after.drawCalls} draw calls, ${after.triangles} triangles`);
  }
  globalThis.console.log(report.join('\n'));
  plain.dispose(); merged.dispose();
});

// Budget for the town buildings with the player at the fountain (the spawn plaza): pinned so it cannot creep back.
// Measured 2026-11-22 (quality 'low', the desktop default): 525 draw calls before the merge, 279 after; 38,478
// triangles (unchanged by the merge). See docs/GAME3D_LOW_POLY_20261122.md.
export const TOWN_PLAZA_BUDGET = Object.freeze({ drawCalls: 290, triangles: 40000 });

test('town plaza budget at the fountain (draw calls and triangles)', () => {
  const town = build(true);
  for (let i = 0; i < 4; i++) town.update(0.3, 1 + i * 0.3, new THREE.Vector3(0, 0, 9).add(town.group.position));
  const s = visibleSignature(town.group);
  assert.ok(s.drawCalls <= TOWN_PLAZA_BUDGET.drawCalls, `town plaza draw calls ${s.drawCalls} > ${TOWN_PLAZA_BUDGET.drawCalls}`);
  assert.ok(s.triangles <= TOWN_PLAZA_BUDGET.triangles, `town plaza triangles ${s.triangles} > ${TOWN_PLAZA_BUDGET.triangles}`);
  town.dispose();
});
