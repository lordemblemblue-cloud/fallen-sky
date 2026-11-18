// The weapons a player can actually equip from this repository: a sword, a pair of daggers and a bow.
// Each has its model file in the weapon pack's frame, a picture for the inventory, and an item that shows
// it. The last part equips them on the real bodies with the real weapon runtime (Three.js needed) and
// checks the hand: the grip sits in the palm and the fingers close round the handle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WEAPON_PACK_PICTURES, weaponPackPictureForItem, weaponPictureFamily } from '../src/components/game3d/weapons/weaponPackPictures.mjs';

/* global console */
const DIR = 'public/game3d/weapons';
const manifest = JSON.parse(fs.readFileSync(DIR + '/manifest.json', 'utf8'));
function readGlb(path) {
  const data = fs.readFileSync(path);
  assert.equal(data.toString('latin1', 0, 4), 'glTF', path);
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  const bin = data.subarray(20 + jsonLength + 8);
  const floats = (index) => {
    const a = json.accessors[index], v = json.bufferViews[a.bufferView];
    const width = { VEC2: 2, VEC3: 3 }[a.type];
    return new Float32Array(bin.buffer, bin.byteOffset + (v.byteOffset || 0), a.count * width);
  };
  return { json, bin, floats, bytes: data.length };
}
const jpegSide = (buf) => {
  for (let i = 2; i < buf.length - 9;) {
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
};

test('the sword: its file is here, in the frame the pack manifest records', () => {
  const w = manifest.weapons.find((x) => x.id === 'fantasy_sword');
  const glb = readGlb('public' + w.url);
  assert.equal(glb.bytes, w.bytes, 'size recorded');
  assert.ok(glb.bytes < 2.2 * 1048576);
  assert.equal(glb.json.meshes.length, 1);
  const prim = glb.json.meshes[0].primitives[0];
  assert.equal(glb.json.accessors[prim.indices].count / 3, w.tris);
  const pos = glb.json.accessors[prim.attributes.POSITION];
  assert.ok(Math.abs(pos.max[1] - pos.min[1] - w.length) < 0.005, 'length');
  assert.ok(Math.abs(pos.max[1] - w.points.tip[1]) < 0.005, 'the tip is as far above the grip as the manifest says');
  for (const k of [0, 2]) assert.ok(pos.min[k] < -0.005 && pos.max[k] > 0.005, 'the grip is inside the handle');
  for (const img of glb.json.images) {
    assert.equal(img.mimeType, 'image/jpeg');
    const v = glb.json.bufferViews[img.bufferView];
    const [width, height] = jpegSide(glb.bin.subarray(v.byteOffset, v.byteOffset + v.byteLength));
    assert.ok(width === height && width >= 1024 && width <= 2048, 'texture ' + width);
  }
  assert.ok(!glb.json.extensionsUsed && !glb.json.materials[0].extensions);
});

test('the daggers: one file, two blades, each in the weapon frame with a hand-sized grip at the origin', () => {
  const glb = readGlb(DIR + '/curved_daggers.glb');
  assert.ok(glb.bytes < 1048576, 'under a megabyte');
  assert.deepEqual(glb.json.nodes.map((n) => n.name).sort(), ['DaggerLeft', 'DaggerRight']);
  let triangles = 0;
  for (const node of glb.json.nodes) {
    const prim = glb.json.meshes[node.mesh].primitives[0];
    triangles += glb.json.accessors[prim.indices].count / 3;
    const p = glb.floats(prim.attributes.POSITION);
    let top = -Infinity, bottom = Infinity, tipZ = 0, grip = 0, gripCount = 0, flat = 0;
    for (let i = 0; i < p.length; i += 3) {
      const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
      if (y > top) { top = y; tipZ = z; }
      bottom = Math.min(bottom, y);
      if (Math.abs(y) < 0.012) { grip += Math.hypot(x, z); gripCount++; }
      if (y > 0.2) flat = Math.max(flat, Math.abs(x));
    }
    assert.ok(Math.abs(top - 0.38) < 0.002, node.name + ' tip ' + top);
    assert.ok(bottom < -0.05 && bottom > -0.09, node.name + ' pommel ' + bottom);
    assert.ok(top - bottom > 0.42 && top - bottom < 0.48, node.name + ' is a dagger, not a sword');
    assert.ok(grip / gripCount > 0.008 && grip / gripCount < 0.022, node.name + ' grip radius ' + (grip / gripCount).toFixed(4));
    assert.ok(tipZ < -0.04, node.name + ' curves back from its edge (+Z)');
    assert.ok(flat < 0.03, node.name + ' blade is flat across X (' + flat.toFixed(3) + ')');
  }
  assert.equal(triangles, 4906);
});

test('every sword, dagger and bow item has a picture, and the picture file exists', async () => {
  for (const url of Object.values(WEAPON_PACK_PICTURES)) {
    const png = fs.readFileSync('public' + url);
    assert.equal(png.toString('latin1', 1, 4), 'PNG', url);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [256, 256], url);
    assert.ok(png.length > 8000 && png.length < 120000, url + ' ' + png.length);
  }
  const { WOLFVEIL_ARTISAN_SHOPS } = await import('../src/components/game3d/wolfveil/WolfveilArtisanShopCatalog.mjs').then((m) => ({ WOLFVEIL_ARTISAN_SHOPS: Object.values(m).find((v) => v && typeof v === 'object') }));
  const shopItems = JSON.stringify(WOLFVEIL_ARTISAN_SHOPS).match(/\{[^{}]*"slot":"weapon"[^{}]*(\{[^{}]*\}[^{}]*)*\}/g).map((text) => JSON.parse(text));
  assert.ok(shopItems.length >= 3);
  const seeds = [...fs.readFileSync('src/components/game3d/equipment/inventoryData.jsx', 'utf8').matchAll(/id: '(wp_\w+)', name: '([^']+)', type: '([^']+)', slot: 'weapon', masteryWeaponId: '(\w+)'/g)]
    .map((m) => ({ id: m[1], name: m[2], type: m[3], slot: 'weapon', masteryWeaponId: m[4] }));
  assert.deepEqual(seeds.map((s) => s.id), ['wp_truesword', 'wp_dagger', 'wp_fan']);
  const expected = { sword: WEAPON_PACK_PICTURES.fantasy_sword, dual_blades: WEAPON_PACK_PICTURES.curved_daggers, bow: WEAPON_PACK_PICTURES.violet_bow };
  for (const item of [...seeds, ...shopItems]) {
    const family = weaponPictureFamily(item);
    assert.equal(weaponPackPictureForItem(item), family ? expected[family] : null, item.id);
  }
  assert.equal(weaponPackPictureForItem(seeds[0]), WEAPON_PACK_PICTURES.fantasy_sword);
  assert.equal(weaponPackPictureForItem(seeds[1]), WEAPON_PACK_PICTURES.curved_daggers);
  assert.equal(weaponPackPictureForItem(seeds[2]), null, 'the fan has no pack picture');
  // an item with its own picture keeps it; a non-weapon gets none; names alone are enough for old saves
  assert.equal(weaponPackPictureForItem({ slot: 'weapon', masteryWeaponId: 'bow', iconUrl: '/own.svg' }), null);
  assert.equal(weaponPackPictureForItem({ slot: 'helm', name: 'Sword Crest Helm' }), null);
  assert.equal(weaponPackPictureForItem({ category: 'weapon', name: 'Steel Practice Dagger' }), WEAPON_PACK_PICTURES.curved_daggers);
  assert.equal(weaponPackPictureForItem({ category: 'weapon', type: 'Weapon — Bow' }), WEAPON_PACK_PICTURES.violet_bow);
  const store = fs.readFileSync('src/components/game3d/axe/equipment/AXEEquipmentInventoryStore.js', 'utf8');
  assert.equal(store.split('...weaponPicture({ ...raw, category }),').length - 1, 2, 'starting items and saved items both get the picture');
});

test('what each family holds in hand has its file in this repository', () => {
  const summon = fs.readFileSync('src/components/game3d/weapons/playerWeaponSummon.js', 'utf8');
  const defaults = JSON.parse(/FAMILY_DEFAULT_WEAPON_MODELS = Object\.freeze\((\{[^}]+\})\)/.exec(summon)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
  assert.deepEqual(defaults, { sword: 'fantasy_sword', bow: 'violet_bow' });
  for (const id of Object.values(defaults)) {
    const w = manifest.weapons.find((x) => x.id === id);
    assert.ok(w && fs.existsSync('public' + w.url), id + ' file');
    assert.equal(fs.statSync('public' + w.url).size, w.bytes, id + ' size recorded');
  }
  const runtime = fs.readFileSync('src/components/game3d/weapons/playerWeaponRuntime.js', 'utf8');
  assert.match(runtime, /url: '\/game3d\/weapons\/curved_daggers\.glb', nodes: Object\.freeze\(\{ right: 'DaggerRight', left: 'DaggerLeft' \}\)/);
  assert.match(runtime, /\} else root\.add\(daggers\.make\(\)\);/, 'the modelled blades still stand in when the file cannot load');
});

// ---- in the hand, on the real bodies, through the real weapon runtime ----
let THREE = null, GLTFLoader = null, runtimeModule = null;
try {
  THREE = await import('three');
  ({ GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js'));
  globalThis.self ??= globalThis;
  runtimeModule = await import('../src/components/game3d/weapons/playerWeaponRuntime.js');
} catch { /* no Three.js here */ }
const skip = THREE && runtimeModule ? false : 'Three.js is not installed here';
const RIGS = { 'fused-female-v1': 'public/models/characters/fused/Female_Fused_v2.glb', 'fused-male-v1': 'public/models/characters/fused/Male_Fused_v2.glb' };

async function parse(path) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = fs.readFileSync(path);
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

for (const [rigId, file] of Object.entries(RIGS)) {
  test('sword, daggers and bow in the hands of ' + rigId, { skip }, async () => {
    const model = (await parse(file)).scene;
    const box = new THREE.Box3(); model.updateMatrixWorld(true);
    model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
    model.scale.multiplyScalar(1.7 / (box.max.y - box.min.y)); model.updateMatrixWorld(true);
    const scene = new THREE.Scene(); scene.add(model);
    const loads = [];
    const loader = { loadAsync: (url) => { loads.push(url); return parse('public' + url); } };
    const errors = [];
    const runtime = runtimeModule.createPlayerWeaponRuntime({ model, scene, manifest, loader, bodyHeight: 1.7, onError: (e) => errors.push(String(e?.message || e)) });
    const world = (o) => o.getWorldPosition(new THREE.Vector3());
    const k = world(model.getObjectByName('mixamorigHead')).y / 1.55;
    const tips = (side) => ['Index', 'Middle', 'Ring', 'Pinky'].map((f) => model.getObjectByName('mixamorig' + side + 'Hand' + f + '4') || model.getObjectByName('mixamorig' + side + 'Hand' + f + '3')).filter(Boolean);
    // how far the fingertips are from the handle's axis (the weapon root's +Y through its origin)
    const fromHandle = (root, side) => {
      const origin = world(root), axis = new THREE.Vector3(0, 1, 0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
      const d = tips(side).map((tip) => { const v = world(tip).sub(origin); return v.addScaledVector(axis, -v.dot(axis)).length() / k; });
      return d.reduce((a, b) => a + b, 0) / d.length;
    };
    // the hand as the runtime poses it: combat grip, fingers closed (or opened), settled over a second of updates
    const settle = (state, closed) => {
      runtime.setHandClosed(closed);
      for (let i = 0; i < 90; i++) runtime.update(1 / 60, { state });
      runtime.setStanceWeight(1);
      model.updateMatrixWorld(true);
    };
    const hold = (state) => {
      const roots = runtime.getRoots(), hands = runtime.getHands();
      const measure = () => roots.map((root, i) => fromHandle(root, hands[i].side === 'left' ? 'Left' : 'Right'));
      settle(state, false); const open = measure();
      settle(state, true); const closed = measure();
      return roots.map((root, i) => ({ side: hands[i].side, open: open[i], closed: closed[i], palm: world(root).distanceTo(world(hands[i].handBone)) / k }));
    };
    const check = (label, report, hands) => {
      assert.equal(report.length, hands, label + ' hands');
      for (const r of report) {
        console.log('  ' + rigId + ' ' + label.padEnd(8) + r.side.padEnd(6) + ' grip ' + (r.palm * 100).toFixed(1) + ' cm from the wrist; fingertips from the handle axis: open ' + (r.open * 100).toFixed(1) + ' cm, closed ' + (r.closed * 100).toFixed(1) + ' cm');
        assert.ok(r.palm > 0.04 && r.palm < 0.14, label + ': the grip sits in the palm (' + r.palm.toFixed(3) + ' m from the wrist)');
        assert.ok(r.closed < 0.055, label + ': the fingers close round the handle (' + r.closed.toFixed(3) + ' m)');
        assert.ok(r.closed < r.open - 0.015, label + ': closed is tighter than an open hand');
      }
    };

    assert.equal(await runtime.equip('fantasy_sword'), true, 'the sword equips ' + errors.join('; '));
    assert.deepEqual([runtime.getCurrent().id, runtime.getCurrent().hand], ['fantasy_sword', 'right']);
    assert.ok(runtime.getRoot().getObjectByProperty('isMesh', true), 'the sword model is in the hand');
    assert.ok(loads.includes('/game3d/weapons/fantasy_sword.glb'));
    check('sword', hold('swordCombo1'), 1);

    assert.equal(await runtime.equipDaggers(), true, 'the daggers equip ' + errors.join('; '));
    assert.deepEqual([runtime.getCurrent().id, runtime.getCurrent().hand], ['daggers', 'both']);
    assert.deepEqual(runtime.getRoots().map((root) => root.children[0]?.name).sort(), ['DaggerLeft', 'DaggerRight'], 'each hand holds its own blade of the pair');
    assert.ok(loads.includes('/game3d/weapons/curved_daggers.glb'));
    check('daggers', hold('swordCombo1'), 2);
    const tip = runtime.getBladeAnchors().tip.position;
    assert.ok(Math.abs(tip.y - 0.38) < 1e-6 && tip.z < 0, 'the trail follows the real blade tip');

    assert.equal(await runtime.equip('violet_bow'), true, 'the bow equips ' + errors.join('; '));
    assert.deepEqual([runtime.getCurrent().id, runtime.getCurrent().hand], ['violet_bow', 'left']);
    check('bow', hold('bowCombo1'), 1);
    assert.deepEqual(errors, []);
    runtime.dispose?.();
  });
}
