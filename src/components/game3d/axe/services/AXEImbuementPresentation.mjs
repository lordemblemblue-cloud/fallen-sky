// Presentation-only map over the four canonical Soul Regalia infusion body
// slots. Weapons intentionally share the Arms infusion with Hands; never mint
// a fifth reward slot, separate currency or duplicate progress.
export const IMBUE_TARGETS=Object.freeze([
  Object.freeze({id:'hands',label:'Hands',slot:'arms',equipmentSlots:['gloves'],icon:'✧'}),
  Object.freeze({id:'helmet',label:'Helmet',slot:'head',equipmentSlots:['helm'],icon:'♕'}),
  Object.freeze({id:'feet',label:'Feet',slot:'legs',equipmentSlots:['boots','legs'],icon:'◇'}),
  Object.freeze({id:'armor',label:'Armor',slot:'chest',equipmentSlots:['chest'],icon:'⬡'}),
  Object.freeze({id:'weapons',label:'Weapons',slot:'arms',equipmentSlots:['weapon'],icon:'⚔',sharedWith:'hands'}),
]);
export function imbuementTargetView(target,soul={},equippedItems=[]) {
  const entry=IMBUE_TARGETS.find(row=>row.id===target)||IMBUE_TARGETS[0];
  const percent=Math.max(0,Math.min(100,Number(soul?.infusion?.[entry.slot])||0));
  return {
    ...entry,percent,
    equipment:(equippedItems||[]).filter(item=>item?.equipped!==false&&entry.equipmentSlots.includes(item?.slot)),
    sharedWith:entry.sharedWith||null,
  };
}
export const IMBUE_MATERIAL_RECIPE_STATUS='UNCONFIGURED';
// Only applyVerifiedAXESoulReward accepts server-verified infusion; UI must
// never spend local pet materials/XP and directly credit itself infusion.
export function canManuallyImbue() {return false;}
