import { useEffect, useMemo, useState } from 'react';
import PlayerAvatarPreview from '@/components/onboarding/PlayerAvatarPreview';
import { ARMOR_SLOTS, creatorBody } from '@/components/onboarding/avatarCustomization';
import { loadBuiltinLayers } from '@/components/onboarding/creatorBuiltinLayers';
import { useGameAvatar } from '../useGameAvatar';
import {
  getAllAXEEquipmentItems, subscribeAXEEquipmentInventory,
} from '../axe/equipment/AXEEquipmentInventoryStore';
import { equippedAXEArmorPieces } from '../axe/equipment/AXEArmorPackCatalog';
import { withEquippedArmor } from '../armor/armorEquipBridge';

// Services can be opened before GameWorld3D mounts its armor event forwarder.
// Read the same canonical, character-scoped equipment inventory the world uses
// instead of relying on a world-only event to refresh the 3D preview.
export default function EquipmentPreview3D() {
  const worldAvatar = useGameAvatar();
  const [items, setItems] = useState(getAllAXEEquipmentItems);
  const [armorAssets, setArmorAssets] = useState([]);
  const body = creatorBody(worldAvatar);

  useEffect(() => subscribeAXEEquipmentInventory(state => {
    setItems(state?.items || getAllAXEEquipmentItems());
  }), []);

  useEffect(() => {
    let active = true;
    setArmorAssets([]);
    if (body) {
      loadBuiltinLayers('armor')
        .then(manifest => {
          if (active) setArmorAssets((manifest[body.gender] || [])
            .filter(asset => asset.rig_id === body.rig_id));
        })
        .catch(() => { if (active) setArmorAssets([]); });
    }
    return () => { active = false; };
  }, [body?.id]);

  const config = useMemo(() => {
    if (!body) return worldAvatar;
    // Explicit empty slots remove stale preview armor on unequip. This does
    // not mutate the saved creator appearance or the character inventory.
    const equipped = equippedAXEArmorPieces(items);
    const overrides = Object.fromEntries(ARMOR_SLOTS.map(slot => [
      slot, equipped[slot] || '',
    ]));
    return withEquippedArmor(worldAvatar, overrides, armorAssets, ARMOR_SLOTS);
  }, [worldAvatar, body, items, armorAssets]);

  return <PlayerAvatarPreview config={config}
    modelUrlOverride={config.model_url} controls="compact"/>;
}
