// Owner weapon pack (public/game3d/weapons, built by tools/game3d-weapons/build-weapons.mjs):
// web-sized assets, one shared weapon frame, and a grip for every weapon on every supported rig.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { readGlb, readAccessor } from '../tools/avatar-motion/glb-io.mjs';
import { getSocket } from '../src/components/game3d/character/CharacterSocketUtils.js';
import { loadRigs } from '../tools/game3d-weapons/calibrate-grips.mjs';

const DIR = 'public/game3d/weapons';
const manifest = JSON.parse(fs.readFileSync(`${DIR}/manifest.json`, 'utf8'));
const RIGS = ['fused-female-v1', 'fused-male-v1', 'artemis-v5', 'getsuga-v5'];
const IDS = ['energy_sword', 'odachi', 'fantasy_sword', 'fantasy_bow', 'violet_bow', 'ornate_bow'];
const sanitize = (n) => THREE.PropertyBinding.sanitizeNodeName(n);

function jpegSize(buf) {
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

test('manifest lists the six pack weapons with class, url, hand and file size', () => {
  assert.deepEqual(manifest.weapons.map((w) => w.id).sort(), [...IDS].sort());
  for (const w of manifest.weapons) {
    assert.ok(['sword', 'greatsword', 'bow'].includes(w.class), w.id);
    assert.equal(w.hand, w.class === 'bow' ? 'left' : 'right', w.id);
    assert.equal(w.url, `/game3d/weapons/${w.id}.glb`);
    const bytes = fs.statSync(`public${w.url}`).size;
    assert.equal(w.bytes, bytes, `${w.id} size recorded`);
    assert.ok(bytes <= 4 * 1048576 && bytes > 0.3 * 1048576, `${w.id}: ${(bytes / 1048576).toFixed(2)} MB`);
  }
});

test('each GLB is one optimized mesh in the weapon frame with 1K-2K JPEG textures', () => {
  for (const w of manifest.weapons) {
    const glb = readGlb(`public${w.url}`);
    const J = glb.json;
    assert.equal(J.meshes.length, 1, w.id);
    const prim = J.meshes[0].primitives[0];
    const tris = J.accessors[prim.indices].count / 3;
    assert.ok(tris <= 24000, `${w.id}: ${tris} triangles`);
    assert.equal(tris, w.tris, `${w.id} triangle count recorded`);
    const pos = J.accessors[prim.attributes.POSITION];
    // origin = grip (inside the bounds), +Y = tip / upper limb, overall length as recorded
    for (let k = 0; k < 3; k++) assert.ok(pos.min[k] <= 0.03 && pos.max[k] >= -0.03, `${w.id} grip inside the bounds`);
    assert.ok(Math.abs(pos.max[1] - pos.min[1] - w.length) < 0.01, `${w.id} length ${pos.max[1] - pos.min[1]}`);
    if (w.points.tip) assert.ok(Math.abs(w.points.tip[1] - pos.max[1]) < 0.02, `${w.id} tip at the top`);
    for (const img of J.images) {
      assert.equal(img.mimeType, 'image/jpeg', w.id);
      const view = J.bufferViews[img.bufferView];
      const [width, height] = jpegSize(glb.bin.subarray(view.byteOffset, view.byteOffset + view.byteLength));
      assert.ok(width >= 1024 && width <= 2048 && height === width, `${w.id} texture ${width}x${height}`);
    }
  }
});

test('every weapon has carry and combat grips on all four rigs', () => {
  for (const w of manifest.weapons) {
    for (const rig of RIGS) {
      const g = w.grips[rig];
      assert.ok(g, `${w.id} on ${rig}`);
      for (const stance of ['carry', 'combat']) {
        const { position, quaternion, scale } = g[stance];
        assert.ok(position.every(Number.isFinite) && quaternion.every(Number.isFinite), `${w.id} ${rig} ${stance}`);
        assert.ok(Math.abs(Math.hypot(...quaternion) - 1) < 1e-4, 'unit quaternion');
        assert.ok(scale > 0.3 && scale < 3, `${w.id} ${rig} scale ${scale}`);
        // the grip sits within a hand's reach of the wrist bone (hand-local units / scale = metres)
        assert.ok(Math.hypot(...position) / scale < 0.2, `${w.id} ${rig} ${stance} grip ${Math.hypot(...position) / scale} m from the wrist`);
      }
    }
  }
});

const rigs = loadRigs('.');

test('hand sockets resolve on all four rigs and every closed-hand joint exists', () => {
  for (const id of RIGS) {
    const entry = manifest.rigs[id];
    const J = rigs[id].rig.J;
    // rebuild the node tree with three.js names, as GLTFLoader names them
    const nodes = J.nodes.map((n) => Object.assign(n.skin === undefined && n.mesh === undefined ? new THREE.Bone() : new THREE.Object3D(), { name: sanitize(n.name || '') }));
    J.nodes.forEach((n, i) => (n.children || []).forEach((c) => nodes[i].add(nodes[c])));
    const root = new THREE.Group();
    J.scenes[0].nodes.forEach((i) => root.add(nodes[i]));
    assert.equal(getSocket(root, 'RightHand')?.name, sanitize(entry.hands.right.bone), `${id} right`);
    assert.equal(getSocket(root, 'LeftHand')?.name, sanitize(entry.hands.left.bone), `${id} left`);
    for (const side of ['right', 'left']) {
      const fist = Object.keys(entry.hands[side].fist);
      assert.equal(fist.length, id.startsWith('fused') ? 15 : 1, `${id} ${side} fist joints`);
      for (const bone of fist) assert.ok(root.getObjectByName(sanitize(bone)), `${id} ${bone}`);
    }
  }
});

test('the grip point lies in the palm, on the palm side of the hand, on every rig', () => {
  for (const w of manifest.weapons) {
    for (const id of RIGS) {
      const hand = rigs[id].hands[w.hand];
      const g = w.grips[id].combat;
      const p = new THREE.Vector3().fromArray(g.position).applyMatrix4(hand.handBind); // bind space
      const rel = p.clone().sub(hand.palm.wrist);
      const along = rel.dot(hand.palm.d) / hand.palm.h;
      assert.ok(along > 0.4 && along < 1.2, `${w.id} on ${id}: ${along.toFixed(2)} hand lengths from the wrist`);
      assert.ok(rel.dot(hand.palm.n) > 0, `${w.id} on ${id}: grip on the palm side`);
    }
  }
});

test('blades leave the thumb side; a bow in combat sends its arrow along the forearm', () => {
  for (const w of manifest.weapons) {
    for (const id of RIGS) {
      const hand = rigs[id].hands[w.hand];
      const handQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(hand.handBind));
      const q = handQ.multiply(new THREE.Quaternion().fromArray(w.grips[id].combat.quaternion));
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      assert.ok(up.dot(hand.palm.k) > 0.8, `${w.id} on ${id}: tip/upper limb along the knuckles (${up.dot(hand.palm.k).toFixed(2)})`);
      if (w.class === 'bow') assert.ok(fwd.dot(hand.palm.d) > 0.9, `${w.id} on ${id}: arrow along the forearm`);
    }
  }
});

test('the pack weapons are starter items carrying their model ids (catalog version 3)', () => {
  const catalog = fs.readFileSync('src/components/game3d/equipment/inventoryData.jsx', 'utf8');
  const store = fs.readFileSync('src/components/game3d/axe/equipment/AXEEquipmentInventoryStore.js', 'utf8');
  for (const id of IDS) assert.match(catalog, new RegExp(`id: 'wp_pack_${id}'[^\\n]*model: '${id}'`), id);
  assert.match(catalog, /appearance: \{ weaponModelId: model \}/);
  assert.match(catalog, /introducedVersion: 3,\s*\n\s*source: 'weapon_pack',\s*\n\s*bindState: 'bound',\s*\n\s*tradeable: false,/);
  assert.match(store, /CURRENT_STARTER_CATALOG_VERSION = 3;/);
});
