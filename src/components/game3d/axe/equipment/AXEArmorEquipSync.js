// Game 3D: the canonical inventory decides which armor-pack piece is worn; the armor bridge of the
// fitted-armor pipeline shows it. This forwards inventory changes as 'game3d:armor-equip' events
// (contract and diff rules in AXEArmorEquipEvents.js). GameWorld3D creates it once the avatar has
// loaded and disposes it on teardown.
import { subscribeAXEEquipmentInventory, addAXEEquipmentItem } from './AXEEquipmentInventoryStore';
import { getActiveId, getStorageUser } from '../../characterStorage';
import { createAXEArmorEquipForwarder } from './AXEArmorEquipEvents.js';
import { AXE_ARMOR_PACK_SETS, AXE_ARMOR_PACK_TEMPLATES } from './AXEArmorPackCatalog.js';

export function createAXEArmorEquipSync({ target = typeof window !== 'undefined' ? window : null } = {}) {
  if (!target) return { worn: () => ({}), dispose() {} };
  const forwarder = createAXEArmorEquipForwarder({
    target,
    subscribe: subscribeAXEEquipmentInventory,
    // the inventory store reloads on a character/account switch; that is a new owner, not an unequip
    owner: () => `${getStorageUser()}::${getActiveId()}`,
  });

  // Development builds only: try a whole set without farming drops (local inventory, never in production).
  if (import.meta.env.DEV) {
    target.__axeArmorDev = {
      sets: AXE_ARMOR_PACK_SETS.map((s) => s.id),
      grantSet: (setId) => AXE_ARMOR_PACK_TEMPLATES.filter((t) => t.appearance.armorSet === setId)
        .map((t) => addAXEEquipmentItem(t, { source: 'dev_armor_preview', equipped: true })),
      worn: forwarder.worn,
    };
  }

  return {
    worn: forwarder.worn,
    dispose() {
      forwarder.dispose();
      if (import.meta.env.DEV) delete target.__axeArmorDev;
    },
  };
}
