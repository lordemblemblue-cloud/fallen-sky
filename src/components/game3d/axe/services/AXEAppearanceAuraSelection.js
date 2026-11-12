// Appearance Aura is a cosmetic selection of an ALREADY OWNED equipment Aura.
// It never duplicates the underlying equipment Aura bonuses, currency or rolls.
import { characterScopedStorage, subscribeCharacterChange } from '../../characterStorage';
import { getAXEEquipmentItem } from '../equipment/AXEEquipmentInventoryStore';
import { getAXEItemAura } from '../equipment/AXEEquipmentAuraStore';
const storage=characterScopedStorage('axe_selected_appearance_aura_v1');
const read=()=>storage.get()||'';
let selectedItemId=read();
const listeners=new Set();
const notify=()=>{for(const listener of listeners)listener(selectedItemId);};
subscribeCharacterChange(()=>{selectedItemId=read();notify();});
export const getAppearanceAuraSource=()=>selectedItemId;
export const subscribeAppearanceAuraSource=fn=>{listeners.add(fn);fn(selectedItemId);return()=>listeners.delete(fn);};
export const selectAppearanceAuraSource=itemId=>{
  if(itemId && (!getAXEEquipmentItem(itemId) || !getAXEItemAura(itemId)))
    return {ok:false,reason:'AURA_NOT_OWNED'};
  selectedItemId=itemId||'';
  storage.set(selectedItemId);
  notify();
  return {ok:true,itemId:selectedItemId};
};
