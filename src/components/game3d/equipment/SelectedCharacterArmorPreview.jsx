import { useEffect, useMemo, useState } from 'react';
import CreatorStage from '@/components/onboarding/CreatorStage';
import { ARMOR_SLOTS, creatorBody } from '@/components/onboarding/avatarCustomization';
import { loadBuiltinLayers } from '@/components/onboarding/creatorBuiltinLayers';
import { getActiveId, getStorageUser } from '../characterStorage';
import {
  getEquippedAXEItems, subscribeAXEEquipmentInventory,
} from '../axe/equipment/AXEEquipmentInventoryStore';
import {
  equippedAXEArmorPieces, AXE_ARMOR_PACK_SETS, AXE_DEV_ARMOR_SETS,
} from '../axe/equipment/AXEArmorPackCatalog';
import {
  withEquippedArmor, reconcileInventoryArmorOverrides,
} from '../armor/armorEquipCore';
import {
  getArmorEnchantMap, getStoredArmorEnchantMap, subscribeEnchantments,
} from '../enchantVfx/enchantVisualState.js';
import { armorEnchantKey } from '../enchantVfx/enchantEquipment.mjs';

const PACKS = [...AXE_ARMOR_PACK_SETS, ...AXE_DEV_ARMOR_SETS].map(x => x.id);

function readSavedItems(characterId) {
  try {
    const key = 'axe_equipment_inventory_v2::' + getStorageUser() + '::' + characterId;
    const saved = JSON.parse(globalThis.localStorage?.getItem(key) || 'null');
    return Array.isArray(saved?.items) ? saved.items : [];
  } catch { return []; }
}

// Character selection shows the saved gear belonging to the SELECTED roster
// slot, not whichever character last entered the world. This read never sets
// an active character, grants an item, or rewrites the inventory.
export function readSelectedCharacterArmor(characterId) {
  if (!characterId) return {};
  if (characterId === getActiveId()) return equippedAXEArmorPieces(getEquippedAXEItems());
  return equippedAXEArmorPieces(readSavedItems(characterId));
}

// The same roster slot's enchantment light per worn piece (read-only, enchantVfx/).
export function readSelectedCharacterArmorEnchant(characterId) {
  if (!characterId) return {};
  if (characterId === getActiveId()) return getArmorEnchantMap(getEquippedAXEItems());
  return getStoredArmorEnchantMap(readSavedItems(characterId), { user: getStorageUser(), characterId });
}

export default function SelectedCharacterArmorPreview({ character, ...stageProps }) {
  const [equipped, setEquipped] = useState(() => readSelectedCharacterArmor(character?.id));
  const [enchant, setEnchant] = useState(() => readSelectedCharacterArmorEnchant(character?.id));
  const [assets, setAssets] = useState([]);
  const body = creatorBody(character);
  const equippedPieceIds = Object.values(equipped).filter(Boolean).sort().join('|');
  useEffect(() => {
    const update = () => {
      setEquipped(readSelectedCharacterArmor(character?.id));
      const next = readSelectedCharacterArmorEnchant(character?.id);
      setEnchant(previous => armorEnchantKey(previous) === armorEnchantKey(next) ? previous : next);
    };
    update();
    const unsubscribe = subscribeAXEEquipmentInventory(update);
    const unsubscribeEnchant = subscribeEnchantments(update);
    globalThis.window?.addEventListener?.('storage', update);
    return () => {
      unsubscribe?.();
      unsubscribeEnchant?.();
      globalThis.window?.removeEventListener?.('storage', update);
    };
  }, [character?.id]);

  useEffect(() => {
    if (!body) { setAssets([]); return undefined; }
    let live = true;
    loadBuiltinLayers('armor',{equippedIds:equippedPieceIds.split('|').filter(Boolean)})
      .then(manifest => {
        if (live) setAssets((manifest[body.gender] || []).filter(asset => asset.rig_id === body.rig_id));
      })
      .catch(() => { if (live) setAssets([]); });
    return () => { live = false; };
  }, [body?.id,equippedPieceIds]);

  const config = useMemo(() => {
    if (!body) return character;
    const savedPieces = Object.fromEntries(ARMOR_SLOTS
      .filter(slot => character?.selected_assets?.[slot])
      .map(slot => [slot, character.selected_assets[slot]]));
    const resolved = reconcileInventoryArmorOverrides(savedPieces, equipped, PACKS);
    const merged = withEquippedArmor(character, resolved, assets, ARMOR_SLOTS);
    return merged && typeof merged === 'object' ? { ...merged, game3d_armor_enchant: enchant } : merged;
  }, [character, body, equipped, assets, enchant]);
  return <CreatorStage config={config} {...stageProps} />;
}
