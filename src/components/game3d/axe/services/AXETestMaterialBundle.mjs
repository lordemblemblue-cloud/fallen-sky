// Explicit, one-time material pack for the isolated Game3D test region.
// These are EXISTING inventory item IDs; no synthetic upgrade currencies.
// Do not import this catalog into normal loot drops or production starter inventory.
export const AXE_TEST_MATERIAL_BATCH = 'blacksmith-test-materials-v1';

export const AXE_TEST_MATERIALS = Object.freeze([
  { id: 'mat_reinforce', category: 'material', quantity: 12 }, // Enchant %
  { id: 'mat_over_enchant', category: 'material', quantity: 6 },
  { id: 'mat_protection', category: 'material', quantity: 6 },
  { id: 'mat_crystal', category: 'material', quantity: 6 }, // Socket drill
  { id: 'mat_divine_essence', category: 'material', quantity: 5 }, // Legacy Ultimate
  { id: 'mat_heroic_core', category: 'material', quantity: 5 }, // Legacy Ultimate
  { id: 'mat_aura_shard', category: 'material', quantity: 3 },
  { id: 'mat_essence', category: 'material', quantity: 6 },
  { id: 'mat_elite_temper', category: 'material', quantity: 3 },
  { id: 'evo_upgrade_stone', category: 'evolution', quantity: 4 }, // Chosen legacy stage
  { id: 'gem_ruby_i', category: 'gem', quantity: 4 },
  { id: 'gem_sapphire_i', category: 'gem', quantity: 2 },
  { id: 'gem_jade_i', category: 'gem', quantity: 2 },
  { id: 'gem_spirit_i', category: 'gem', quantity: 2 },
  { id: 'gem_crit_i', category: 'gem', quantity: 2 },
  { id: 'axe_rune_wrath_t1', category: 'rune', quantity: 3 },
  { id: 'axe_rune_guard_t1', category: 'rune', quantity: 3 },
  { id: 'axe_rune_precision_t1', category: 'rune', quantity: 2 },
].map(resource => Object.freeze(resource)));

export const AXE_TEST_CORE_ESSENCE = 500;

export function isAXETestMaterialRegion({
  hostname = '', isDevBuild = false, regionFlag = '', characterId = '',
} = {}) {
  // Require ALL three barriers, not just a Base44 domain or a query string.
  // The preview allowlist deliberately excludes ordinary published .base44.app hosts.
  const host = String(hostname).toLowerCase();
  const isPreview = host === 'localhost' || host === '127.0.0.1'
    || host.startsWith('preview.') || host.includes('.preview.')
    || host.includes('base44-preview');
  return characterId === '__dev_test__' && regionFlag === '1' && (isDevBuild || isPreview);
}

export const AXE_TEST_MATERIAL_UNIT_COUNT =
  AXE_TEST_MATERIALS.reduce((total, resource) => total + resource.quantity, 0);
