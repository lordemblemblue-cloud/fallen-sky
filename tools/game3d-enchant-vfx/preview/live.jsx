// Live check on the real data path (no Base44 sign-in needed): the real inventory store with the
// clone's seeded Crescent Moon pieces, the real enchant store, the real roster-slot armor viewer
// (SelectedCharacterArmorPreview -> CreatorStage -> AvatarCustomizationRuntime -> armorEnchantGlow)
// and the Blacksmith preview card. window.liveQA drives it.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SelectedCharacterArmorPreview from '@/components/game3d/equipment/SelectedCharacterArmorPreview';
import EnchantLightPreview from '@/components/game3d/enchantVfx/EnchantLightPreview';
import { getItemEnchantPercent, projectEnchantPercent } from '@/components/game3d/enchantVfx/enchantVisualState.js';
import {
  equipAXEInventoryItem, getAllAXEEquipmentItems, subscribeAXEEquipmentInventory, unequipAXEInventoryItem,
} from '@/components/game3d/axe/equipment/AXEEquipmentInventoryStore';
import { reinforceItem, setServerUpgradeRecord, subscribeEnchantments } from '@/components/game3d/equipment/enchantmentStore';
import { getActiveId } from '@/components/game3d/characterStorage';

const crescentItems = () => getAllAXEEquipmentItems()
  .filter((item) => String(item.appearance?.armorPiece || '').startsWith('crescent_moon_'));
const bySlot = (slot) => crescentItems().find((item) => (item.slot || item.category) === slot) || null;

window.liveQA = {
  activeId: () => getActiveId(),
  items: () => crescentItems().map((i) => ({ id: i.instanceId, slot: i.slot, rarity: i.rarity, equipped: i.equipped, percent: getItemEnchantPercent(i) })),
  equipAll: () => crescentItems().map((i) => equipAXEInventoryItem(i.instanceId).ok),
  unequipAll: () => crescentItems().map((i) => unequipAXEInventoryItem(i.instanceId).ok),
  equip: (slot) => equipAXEInventoryItem(bySlot(slot)?.instanceId).ok,
  unequip: (slot) => unequipAXEInventoryItem(bySlot(slot)?.instanceId).ok,
  // test data only: write a reinforcement record the way a server upgrade result is applied
  setPercent: (slot, percent) => setServerUpgradeRecord('reinforcement', bySlot(slot)?.instanceId, { percent }),
  // the real client roll path (roll 0 = success)
  reinforce: (slot) => reinforceItem(bySlot(slot)?.instanceId, { roll: 0 }),
};

function App() {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const bump = () => setRevision((v) => v + 1);
    const off1 = subscribeAXEEquipmentInventory(bump);
    const off2 = subscribeEnchantments(bump);
    return () => { off1?.(); off2?.(); };
  }, []);
  const character = { id: getActiveId(), name: 'Live check', gender: 'female', creator_body: 'fused-female-v1', selected_assets: {} };
  const items = crescentItems();
  return (
    <>
      <div className="stage" data-live-stage><SelectedCharacterArmorPreview character={character} shot="body" /></div>
      <div className="rows">
        <div className="row">active character: <b>{character.id}</b> · items: {items.length}</div>
        {items.map((item) => (
          <div className="row" key={item.instanceId} data-slot={item.slot}>
            <b>{item.name}</b> · {item.slot} · {item.rarity} · {item.equipped ? 'equipped' : 'not equipped'} · {getItemEnchantPercent(item)}%
            <div>
              <button type="button" onClick={() => (item.equipped ? unequipAXEInventoryItem(item.instanceId) : equipAXEInventoryItem(item.instanceId))}>
                {item.equipped ? 'Unequip' : 'Equip'}</button>
              {[0, 30, 59, 90, 120, 150, 200].map((p) => (
                <button type="button" key={p} onClick={() => setServerUpgradeRecord('reinforcement', item.instanceId, { percent: p })}>{p}%</button>
              ))}
            </div>
            <EnchantLightPreview item={item} proposedPercent={projectEnchantPercent(item, 'reinforcement')} compact />
          </div>
        ))}
      </div>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
