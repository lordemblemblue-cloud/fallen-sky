// Ultimate Runes: one separate rune per real owned equipment instance.
// Deliberately NOT the older 4-slot weapon-mastery runes or the legacy Ultimate
// server upgrade ledger. This store is character-scoped and survives switching.
import { characterScopedStorage, subscribeCharacterChange } from '../../characterStorage';
import { getAXEEquipmentItem } from './AXEEquipmentInventoryStore';
import { addLootToInventory, consumeLootItemById, getLootInventory, getLootItemCount } from '../../lootStore';
import { getShopState, spendGold, addGold } from '../../shop/shopStore';

export const AXE_RUNE_MAX_TIER = 5;
const BASE = Object.freeze({
  axe_rune_wrath: {name:'Rune of Wrath',stat:'attack',base:5,icon:'⚔️',description:'Increases weapon and equipment damage.'},
  axe_rune_guard: {name:'Rune of Warding',stat:'defense',base:6,icon:'🛡️',description:'Reinforces defense.'},
  axe_rune_swiftness: {name:'Rune of Swiftness',stat:'dexterity',base:3,icon:'💨',description:'Increases dexterity, supporting nimble movement.'},
  axe_rune_vitality: {name:'Rune of Vitality',stat:'maxHP',base:24,icon:'❤️',description:'Increases vitals.'},
  axe_rune_precision: {name:'Rune of Precision',stat:'critChance',base:0.5,icon:'🎯',description:'Increases critical hit chance.'},
});
const roman=['I','II','III','IV','V'];
const cost=[300,700,1500,3000];
const chance=[.85,.7,.55,.4];
export const AXE_RUNE_DEFINITIONS=Object.freeze(Object.fromEntries(
  Object.entries(BASE).flatMap(([family,base])=>roman.map((n,i)=>{
    const id=family+'_t'+(i+1);
    return [id,Object.freeze({...base,id,family,tier:i+1,name:base.name+' '+n,
      value:Number((base.base*(i+1)).toFixed(2)),rarity:['common','uncommon','rare','epic','legendary'][i]})];
  }))
));
export function previewAXERuneUpgrade(runeId) {
  const rune=AXE_RUNE_DEFINITIONS[runeId];
  if(!rune) return {ok:false,reason:'RUNE_MISSING'};
  if(rune.tier>=AXE_RUNE_MAX_TIER) return {ok:false,reason:'MAX_RUNE_TIER',rune};
  return {ok:true,rune,next:AXE_RUNE_DEFINITIONS[rune.family+'_t'+(rune.tier+1)],
    copiesRequired:2,silver:cost[rune.tier-1],chance:chance[rune.tier-1]};
}
const storage=characterScopedStorage('axe_ultimate_runes_v1');
const read=()=>{
  try{const raw=JSON.parse(storage.get()||'{}');
    return Object.fromEntries(Object.entries(raw||{}).filter(([,r])=>AXE_RUNE_DEFINITIONS[r]));}
  catch{return {};}
};
let equippedByItem=read();
const listeners=new Set();
const snapshot=()=>({...equippedByItem});
const emit=()=>{storage.set(JSON.stringify(equippedByItem));for(const fn of listeners)fn(snapshot());};
subscribeCharacterChange(()=>{equippedByItem=read();for(const fn of listeners)fn(snapshot());});
export const subscribeAXEEquipmentRunes=fn=>{listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);};
export const getAXEEquipmentRune=(itemId)=>equippedByItem[itemId]||null;
export const getAXEEquipmentRunes=()=>snapshot();
export const getAXEEquipmentRuneStats=itemId=>{
  const rune=AXE_RUNE_DEFINITIONS[getAXEEquipmentRune(itemId)];
  return rune?{[rune.stat]:rune.value}:{};
};
export function equipAXEEquipmentRune(itemId,runeId){
  const item=getAXEEquipmentItem(itemId);
  const rune=AXE_RUNE_DEFINITIONS[runeId];
  if(!item) return {ok:false,reason:'ITEM_NOT_OWNED'};
  if(!rune || !getLootItemCount(runeId,'rune')) return {ok:false,reason:'RUNE_NOT_OWNED'};
  if(equippedByItem[itemId]) return {ok:false,reason:'RUNE_SLOT_OCCUPIED'};
  const consumed=consumeLootItemById(runeId,1,'rune');
  if(!consumed.ok)return consumed;
  equippedByItem={...equippedByItem,[itemId]:runeId};
  emit();return{ok:true,itemId,runeId};
}
export function unequipAXEEquipmentRune(itemId){
  const runeId=equippedByItem[itemId];
  if(!runeId)return {ok:false,reason:'NO_RUNE_EQUIPPED'};
  // Only return runes into inventory for equipment that is still owned.
  if(!getAXEEquipmentItem(itemId))return {ok:false,reason:'ITEM_NOT_OWNED'};
  const next={...equippedByItem};delete next[itemId];equippedByItem=next;
  addLootToInventory({...AXE_RUNE_DEFINITIONS[runeId],category:'rune'});
  emit();return{ok:true,runeId};
}
export function upgradeAXEInventoryRune(runeId,{roll=Math.random()}={}){
  const preview=previewAXERuneUpgrade(runeId);
  if(!preview.ok)return preview;
  if(getLootItemCount(runeId,'rune')<2)return{ok:false,reason:'NEED_TWO_MATCHING_RUNES'};
  if(getShopState().gold<preview.silver)return{ok:false,reason:'INSUFFICIENT_SILVER'};
  const payment=spendGold(preview.silver);
  if(!payment.ok)return payment;
  const success=Number(roll)<preview.chance;
  const consumed=consumeLootItemById(runeId,success?2:1,'rune');
  if(!consumed.ok){addGold(preview.silver);return consumed;}
  if(success)addLootToInventory({...preview.next,category:'rune'});
  return{ok:success,outcome:success?'success':'failure',chance:preview.chance,
    silver:preview.silver,consumed:consumed.consumed,
    runeId:success?preview.next.id:runeId};
}
// A consumed item must not leave a ghost rune equipped; unlike unequip, this
// does NOT duplicate the rune into inventory on item destruction.
if(typeof window!=='undefined'&&!window.__axeEquipmentRuneLifecycleHook){
  window.__axeEquipmentRuneLifecycleHook=true;
  window.addEventListener('axeEquipmentItemRemoved',event=>{
    const id=event?.detail?.instanceId;
    if(!id||!equippedByItem[id])return;
    const next={...equippedByItem};delete next[id];equippedByItem=next;emit();
  });
}
