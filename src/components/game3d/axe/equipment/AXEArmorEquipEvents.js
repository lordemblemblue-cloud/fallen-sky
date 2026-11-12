// The event contract between the canonical inventory and the fitted-armor bridge
// (src/components/game3d/armor/armorEquipBridge.js), pure so node tests can drive it with any EventTarget:
//   'game3d:armor-equip'         { id: '<set>_<slot>' } puts a piece on; { slot, id: null } takes the slot off
//                                (the bridge keeps that explicit "none" over the creator's pick)
//   'game3d:armor-sync-request'  the bridge asks for every equipped piece again (it fires once when it mounts)
// Events apply to the active character (the bridge's default).
import { diffAXEArmorEquip, equippedAXEArmorPieces } from './AXEArmorPackCatalog.js';

export const AXE_ARMOR_EQUIP_EVENT = 'game3d:armor-equip';
export const AXE_ARMOR_SYNC_REQUEST_EVENT = 'game3d:armor-sync-request';

export function armorEquipDetail({ slot, id }) {
  return id ? { id, source: 'inventory' } : { slot, id: null, source: 'inventory' };
}

// subscribe(fn) must call fn with an inventory snapshot ({ items }) now and on every change, and return an
// unsubscribe function (AXEEquipmentInventoryStore.subscribeAXEEquipmentInventory does). owner() names whose
// inventory the snapshot is (user + character): when it changes the baseline starts over, so switching
// characters never sends one character's unequips to the next.
// Only slots whose armor changed are sent. The first snapshot of an owner sends one equip per equipped piece and
// never a null, so a look picked in the creator stays on.
export function createAXEArmorEquipForwarder({ target, subscribe, owner = () => '' }) {
  let worn = {};
  let ownerKey;
  const send = (change) => target.dispatchEvent(new CustomEvent(AXE_ARMOR_EQUIP_EVENT, { detail: armorEquipDetail(change) }));
  const unsubscribe = subscribe((snapshot) => {
    const who = owner();
    if (who !== ownerKey) { ownerKey = who; worn = {}; }
    const next = equippedAXEArmorPieces(snapshot?.items || []);
    diffAXEArmorEquip(worn, next).forEach(send);
    worn = next;
  });
  const resend = () => Object.entries(worn).forEach(([slot, id]) => send({ slot, id }));
  target.addEventListener(AXE_ARMOR_SYNC_REQUEST_EVENT, resend);
  return {
    worn: () => ({ ...worn }),
    dispose() {
      unsubscribe?.();
      target.removeEventListener(AXE_ARMOR_SYNC_REQUEST_EVENT, resend);
    },
  };
}
