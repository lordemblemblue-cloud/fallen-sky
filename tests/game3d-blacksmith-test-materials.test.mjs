import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AXE_TEST_MATERIALS, AXE_TEST_MATERIAL_UNIT_COUNT,
  AXE_TEST_CORE_ESSENCE, isAXETestMaterialRegion,
} from '../src/components/game3d/axe/services/AXETestMaterialBundle.mjs';

test('Blacksmith pack is deliberately small and contains only valid quantity/category entries', () => {
  assert.ok(AXE_TEST_MATERIAL_UNIT_COUNT > 0 && AXE_TEST_MATERIAL_UNIT_COUNT < 100);
  assert.equal(AXE_TEST_MATERIAL_UNIT_COUNT, AXE_TEST_MATERIALS.reduce((s, x) => s + x.quantity, 0));
  assert.equal(new Set(AXE_TEST_MATERIALS.map(x => x.id)).size, AXE_TEST_MATERIALS.length);
  for (const x of AXE_TEST_MATERIALS) {
    assert.ok(['material','evolution','gem','rune'].includes(x.category));
    assert.ok(Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 12);
  }
  assert.equal(AXE_TEST_CORE_ESSENCE, 500);
  for (const id of ['mat_reinforce', 'mat_over_enchant', 'mat_crystal',
    'mat_divine_essence', 'mat_heroic_core', 'evo_upgrade_stone',
    'gem_ruby_i', 'axe_rune_wrath_t1']) {
    assert.ok(AXE_TEST_MATERIALS.some(x => x.id === id), 'missing coverage: ' + id);
  }
});

test('published/live site cannot grant pack even with test-region URL flag', () => {
  for (const host of ['fallen-sky.base44.app', 'example.com', 'www.example.com']) {
    assert.equal(isAXETestMaterialRegion({
      hostname:host, isDevBuild:false, regionFlag:'1', characterId:'__dev_test__',
    }), false);
  }
});

test('preview grant requires explicit URL opt-in and Dev Test character', () => {
  const setup = { hostname:'localhost', isDevBuild:true, regionFlag:'1', characterId:'__dev_test__' };
  assert.equal(isAXETestMaterialRegion(setup), true);
  assert.equal(isAXETestMaterialRegion({...setup, regionFlag:''}), false);
  assert.equal(isAXETestMaterialRegion({...setup, characterId:'player-1'}), false);
  assert.equal(isAXETestMaterialRegion({...setup, hostname:'fallen-sky.base44.app', isDevBuild:false}), false);
  assert.equal(isAXETestMaterialRegion({
    hostname:'game.preview.base44.com', isDevBuild:false, regionFlag:'1', characterId:'__dev_test__',
  }), true);
});
