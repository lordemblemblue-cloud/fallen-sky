import { SHOP_ITEMS, SHOP_RECIPES, shopItem, ownedItem, tierPrice, purchaseRule, tierItemStats, tierItemPassive } from './shop.mjs';

export const SHOP_CATEGORIES = Object.freeze(['power','defense','ability','health','tenacity','hybrid','support','counter','relic']);
export const STAT_FILTERS = Object.freeze([
  ['power','Damage / Power'],['critChance','Critical Chance'],['critSeverity','Critical Damage'],
  ['critDefense','Critical Defense'],['ability','Ability Power'],['defense','Defense'],
  ['health','Max HP'],['hpGain','HP Gain'],['regen','HP Regeneration'],['lifesteal','Lifesteal'],
  ['tenacity','Tenacity'],['healAmp','Healing Bonus'],['haste','Cooldown Reduction'],
  ['shieldGain','Shield Gain'],['antiHeal','Anti-heal'],['onAllyHealHaste','Movement Speed'],
  ['knockbackResist','Knockback Resistance'],['onAllyHealWill','Will Gain'],['retaliation','Damage Reflection'],
  ['trueSight','Reveal Stealth'],['emergencyCloak','Stealth'],['gripEscape','Grip Escape'],
  ['activeAnchor','Teleport'],['activeStasis','Invulnerability'],
]);
export const STATUS_FILTERS = Object.freeze([
  ['affordable','Affordable Now'],['owned','Owned Items'],['upgradeable','Upgradeable'],
  ['buildable','Buildable Now'],['completed','Completed Items'],
]);
const passiveGroups = Object.freeze({
  hpGain:['regen','lifesteal','onAllyHealPulse','retaliation'],
  shieldGain:['onKillShield','onAllyHealShield'],
});
export function supportsStat(item, stat) {
  return (item.stats[stat] || 0) > 0 || item.passive.type === stat || (passiveGroups[stat] || []).includes(item.passive.type);
}
export const itemArt = (id,tier=3) => shopItem(id) && Number.isInteger(tier) && tier >= 1 && tier <= 3 ? '/duelist/item-tiers/'+id+'-'+tier+'.svg' : null;
export function itemTier(items,id) { return items.map(ownedItem).find(x=>x?.id===id)?.tier || 0; }
export function recipeFor(id) { return SHOP_RECIPES[id] || []; }
export function buildsInto(id) { return SHOP_ITEMS.filter(x=>recipeFor(x.id).includes(id)); }
export function shopQuote(me,id,tier,combine=false) {
  return purchaseRule({ gold:Number.isFinite(me?.gold)?me.gold:0, items:Array.isArray(me?.items)?me.items:[], id, targetTier:tier, combine, allowed:!!me?.canShop });
}
export function filterShopItems(me, {stats=[],statuses=[],search='',matchAll=true}={}) {
  const owned=Array.isArray(me?.items)?me.items:[];
  const q=search.trim().toLowerCase();
  return SHOP_ITEMS.filter(item=>{
    if(q && ![item.name,item.category,...[1,2,3].map(tier=>tierItemPassive(item,tier)?.text || '')].some(s=>s.toLowerCase().includes(q)))return false;
    if(stats.length && !(matchAll?stats.every(s=>supportsStat(item,s)):stats.some(s=>supportsStat(item,s))))return false;
    const tier=itemTier(owned,item.id);
    return statuses.every(s=>{
      if(s==='affordable')return tier<3 && shopQuote(me,item.id,tier+1).ok;
      if(s==='owned')return tier>0;
      if(s==='upgradeable')return tier>0&&tier<3;
      if(s==='buildable')return shopQuote(me,item.id,3,true).ok;
      if(s==='completed')return tier===3;
      return false;
    });
  });
}
export const nextPrice = (item,tier) => tier>=3?0:tierPrice(item,tier+1)-tierPrice(item,tier);
export const tierStats = (item,tier) => Object.entries(tierItemStats(item,tier));
