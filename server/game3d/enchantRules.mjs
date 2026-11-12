// Foundation 13.5 — one Enchant / Over Enchant capability policy.
// Over Enchant UI is available only AFTER ordinary enchant reaches max.
export const GAME3D_ENCHANT_MAX=10;
export const GAME3D_OVER_ENCHANT_MAX=5;
export function inspectEnchantPath({enchantLevel,overEnchantLevel}={}){
 if(!Number.isSafeInteger(enchantLevel)||enchantLevel<0||
    enchantLevel>GAME3D_ENCHANT_MAX||
    !Number.isSafeInteger(overEnchantLevel)||overEnchantLevel<0||
    overEnchantLevel>GAME3D_OVER_ENCHANT_MAX||
    (overEnchantLevel>0&&enchantLevel!==GAME3D_ENCHANT_MAX))
  return {ok:false,code:'invalid_enchant_progression',
   enchantAuthorized:false,overEnchantAuthorized:false};
 const regularMaxed=enchantLevel===GAME3D_ENCHANT_MAX;
 const overMaxed=overEnchantLevel===GAME3D_OVER_ENCHANT_MAX;
 return {ok:true,enchantLevel,overEnchantLevel,
  nextEnchant:regularMaxed?null:enchantLevel+1,
  showOverEnchant:regularMaxed,
  nextOverEnchant:regularMaxed&&!overMaxed?overEnchantLevel+1:null,
  materialsConsumed:false,
  enchantAuthorized:false,overEnchantAuthorized:false,
  competitiveStatsActivated:false};
}
