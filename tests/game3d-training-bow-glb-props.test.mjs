import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Portable regression check for main Game 3D and the independently deployed clone.
const src = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('original prop catalog stays intact when the ranged test bow is added', () => {
  const inventory = src('src/components/game3d/equipment/inventoryData.jsx');
  for (const id of ['wp_truesword', 'wp_dagger', 'wp_fan',
    'hl_hood', 'ch_robe', 'gl_wraps', 'lg_pants', 'bt_boots',
    'tr_coin', 'cape_trainee', 'wing_starter', 'costume_wanderer',
    'aux_skyguard_sig', 'aux_skyguard_talisman']) {
    assert.ok(inventory.includes(id), 'Preserve original inventory item: ' + id);
  }
  assert.match(inventory, /id: 'test_training_bow'/);
  assert.match(inventory, /masteryWeaponId: 'bow'/);
  assert.match(inventory, /axeWeaponRole: 'ranged'/);
  assert.match(inventory, /modelUrl: '\/game3d\/test-gear\/training-bow\.glb'/);
  assert.match(inventory, /modelFormat: 'glb'/);
  assert.ok(src('public/game3d/test-gear/training-bow.svg').includes('<svg'));
});

test('the test bow is a loadable-format GLB mesh with an embedded binary buffer', () => {
  const file = readFileSync(new URL('../public/game3d/test-gear/training-bow.glb', import.meta.url));
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  const length = file.readUInt32LE(12);
  assert.equal(file.toString('ascii', 16, 20), 'JSON');
  assert.equal(length + 20, file.length);
  const doc = JSON.parse(file.toString('utf8', 20, 20 + length).trim());
  assert.equal(doc.asset.version, '2.0');
  assert.equal(doc.meshes[0].primitives.length, 4);
  const prefix = 'data:application/octet-stream;base64,';
  assert.ok(doc.buffers[0].uri.startsWith(prefix));
  const bytes = Buffer.from(doc.buffers[0].uri.slice(prefix.length), 'base64');
  assert.equal(bytes.length, doc.buffers[0].byteLength);
  assert.ok(bytes.length > 1000);
  for (const view of doc.bufferViews) {
    assert.ok(view.byteOffset >= 0 && view.byteOffset + view.byteLength <= bytes.length);
  }
});

test('starter catalog migration never recreates already consumed V1 props', () => {
  const store = src('src/components/game3d/axe/equipment/AXEEquipmentInventoryStore.js');
  assert.match(store, /CURRENT_STARTER_CATALOG_VERSION = [2-9]\b/); // the V2 bow stays; later versions add other items
  assert.match(store, /previousCatalogVersion < Number\(starter\.introducedVersion \|\| 1\)/);
  assert.match(store, /modelUrl: existing\.modelUrl \|\| starter\.modelUrl/);
});
