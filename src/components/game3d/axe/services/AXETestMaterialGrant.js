// Game3D Dev Test ONLY. Never grant upgrade items to published/live characters.
// Only called by a deliberate Blacksmith button in a non-live preview, while
// the isolated '__dev_test__' character is selected and ?axe_test_region=1.
// The batch is character-scoped and can be claimed once; no auto-refills.
import { characterScopedStorage, getActiveId } from '../../characterStorage';
import { LOOT_TABLE, addLootToInventory, getLootInventory } from '../../lootStore';
import { countBagItems, GAME3D_LOOT_BAG_CAPACITY } from '../../storage/game3dStorageModel.mjs';
import { AXE_RUNE_DEFINITIONS } from '../equipment/AXEEquipmentRuneStore';
import { grantAXECoreEssence } from '../progression/AXECoreStore';
import {
  AXE_TEST_CORE_ESSENCE, AXE_TEST_MATERIAL_BATCH,
  AXE_TEST_MATERIALS, AXE_TEST_MATERIAL_UNIT_COUNT, isAXETestMaterialRegion,
} from './AXETestMaterialBundle.mjs';

const receipt = characterScopedStorage('axe_blacksmith_test_material_receipt_v1');

export function canClaimAXEBlacksmithTestMaterials() {
  if (typeof window === 'undefined') return false;
  return isAXETestMaterialRegion({
    hostname: window.location.hostname,
    isDevBuild: !!import.meta.env?.DEV,
    regionFlag: new URLSearchParams(window.location.search).get('axe_test_region') || '',
    characterId: getActiveId(),
  });
}

export function grantLimitedAXEBlacksmithTestMaterials() {
  if (!canClaimAXEBlacksmithTestMaterials()) {
    return { ok: false, reason: 'TEST_REGION_ONLY' };
  }
  if (receipt.get() === AXE_TEST_MATERIAL_BATCH) {
    return { ok: false, reason: 'TEST_PACK_ALREADY_CLAIMED' };
  }
  // Refuse the entire batch if it cannot fit in the live bag. A deposit into
  // overflow storage would not be immediately usable at the forge.
  const freeSlots = GAME3D_LOOT_BAG_CAPACITY - countBagItems(getLootInventory());
  if (freeSlots < AXE_TEST_MATERIAL_UNIT_COUNT) {
    return { ok: false, reason: 'FREE_BAG_SPACE_REQUIRED', slotsNeeded: AXE_TEST_MATERIAL_UNIT_COUNT };
  }

  const catalog = new Map(LOOT_TABLE.map(item => [item.id, item]));
  const toGrant = [];
  for (const entry of AXE_TEST_MATERIALS) {
    const definition = entry.category === 'rune'
      ? AXE_RUNE_DEFINITIONS[entry.id]
      : catalog.get(entry.id);
    if (!definition || (entry.category !== 'rune' && definition.category !== entry.category)) {
      return { ok: false, reason: 'MISSING_MATERIAL_DEFINITION', materialId: entry.id };
    }
    for (let i = 0; i < entry.quantity; i += 1) {
      toGrant.push({ ...definition, category: entry.category, source: AXE_TEST_MATERIAL_BATCH,
        testOnly: true, isBound: true, isTradable: false });
    }
  }

  // A write failure is reported, not hidden. This pack does not touch player
  // equipment, purchase balances, upgrade formulas or live drop tables.
  for (const item of toGrant) {
    if (!addLootToInventory(item)) return { ok: false, reason: 'TEST_INVENTORY_SAVE_FAILED' };
  }
  if (!receipt.setChecked(AXE_TEST_MATERIAL_BATCH)) {
    return { ok: false, reason: 'TEST_RECEIPT_SAVE_FAILED' };
  }
  grantAXECoreEssence(AXE_TEST_CORE_ESSENCE);
  return { ok: true, materialUnits: toGrant.length, coreEssence: AXE_TEST_CORE_ESSENCE };
}
