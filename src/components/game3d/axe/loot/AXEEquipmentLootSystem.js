// Monster equipment drops share the existing canonical inventory and pickup
// pipeline. Levels and rarity are driven by the ENEMY being farmed; on older
// kill messages without an enemy level, caller supplies the player's level.
// Item definitions are model-independent; a later armor asset may be attached
// without rerolling any owned gear or changing its instance id.
import { INVENTORY } from '../../equipment/inventoryData';
import {getAXEFarmingGearLevel} from './AXEFarmingGearTiers.mjs';
import { isAXERateStat } from '../equipment/AXEEquipmentRuntimeStats';
import {
  AXE_GEAR_RARITY_SCALE, AXE_PROCEDURAL_SET_FAMILIES,
  getAXELevelGearBand, rollAXELevelAffixes, rollAXELevelRarity, rollAXEEvolutionPath,
} from './AXELevelGearProgression.mjs';

export const AXE_EQUIPMENT_DROP_CONFIG = Object.freeze({
  chanceByTier: Object.freeze({
    normal: 0.035, elite: 0.12, champion: 0.20,
    miniBoss: 0.32, caveBoss: 0.55, gateBoss: 0.65,
    worldBoss: 0.9, boss: 0.9,
  }),
  qualityBands: Object.freeze([0, 5, 10, 15, 20]),
  // Only normal mobs need to be killed for a chance at regular gear.
  // Higher enemy tiers change the chance and rarity weights, not the
  // level at which higher rarities become eligible.
});
const DROP_CATEGORIES = Object.freeze(['weapon','helm','chest','gloves','legs','boots','accessory','cape']);
const unit = rng => Math.max(0,Math.min(0.999999999,Number(rng())||0));
const normalizeTier = (tier,isBoss) => isBoss ? 'boss'
  : AXE_EQUIPMENT_DROP_CONFIG.chanceByTier[tier] != null ? tier : 'normal';

export const AXE_LOOT_LEVEL_SCALE_PER_LEVEL = 0.06;
export function getAXELootLevelScale(level = 1) {
  return 1 + Math.max(0,Math.floor(Number(level)||1)-1)*AXE_LOOT_LEVEL_SCALE_PER_LEVEL;
}

// Loot-only templates. Never duplicate dev grants, preview bows or equipment
// with no combat stat contribution, and never replace a generated model later
// with the wrong starter/dev character model.
const buildTemplatePool = () => DROP_CATEGORIES.flatMap(category =>
  (INVENTORY[category]||[])
    .filter(item => !item.devGrant && !String(item.id||'').startsWith('test_')
      && !String(item.source||'').startsWith('clone_')
      && Object.keys(item.baseStats||{}).length)
    .map(item => ({...item,sourceCategory:category}))
);

export function rollAXEEquipmentDrop(enemyTier = 'normal', isBoss = false, {
  rng=Math.random, playerLevel=1, enemyLevel=null, sourceId='enemy',
} = {}) {
  const tier = normalizeTier(enemyTier,isBoss);
  if (unit(rng) >= AXE_EQUIPMENT_DROP_CONFIG.chanceByTier[tier]) return null;
  const pool=buildTemplatePool();
  if (!pool.length) return null;

  const monsterLevel = Math.max(1,Math.floor(Number(enemyLevel ?? playerLevel)||1));
  const template = pool[Math.floor(unit(rng)*pool.length)];
  const rarity = rollAXELevelRarity(monsterLevel, {enemyTier:tier,isBoss,rng});
  const gearLevel=getAXEFarmingGearLevel(rarity,monsterLevel)??monsterLevel;
  const bands = AXE_EQUIPMENT_DROP_CONFIG.qualityBands;
  const qualityBand=bands[Math.floor(unit(rng)*bands.length)];
  const rarityScale=AXE_GEAR_RARITY_SCALE[rarity]||1;
  const statScale=rarityScale*getAXELootLevelScale(gearLevel)*(1+qualityBand/100);
  const baseStats=Object.fromEntries(Object.entries(template.baseStats||{}).map(([key,value])=>[
    key,Number((Number(value||0)*(isAXERateStat(key)?rarityScale:statScale)).toFixed(
      Math.abs(Number(value||0))<2?2:0,
    )),
  ]));
  const rolledStats=rollAXELevelAffixes({
    slot:template.slot,rarity,level:gearLevel,qualityBand,rng,
  });
  const evolutionPath=rollAXEEvolutionPath(rarity,monsterLevel,rng);
  const setEligible=monsterLevel>=50 && ['rare','elite','legendary','mythic'].includes(rarity)
    && ['helm','chest','gloves','legs','boots','cape'].includes(template.slot);
  const family=setEligible && unit(rng)<0.25
    ? AXE_PROCEDURAL_SET_FAMILIES[Math.floor(unit(rng)*AXE_PROCEDURAL_SET_FAMILIES.length)]
    : null;
  const rarityLabel=rarity==='uncommon'?'Unique':rarity[0].toUpperCase()+rarity.slice(1);
  // Evolution flags are NOT earned ranks. Rare Elite / Elite Legendary names
  // and blended item glow must only appear after genuine Ascension +4.
  const displayName=`${rarityLabel} ${family?family.name+' ':''}${template.name}`;
  const templateId=template.templateId||template.id;
  const sourceTag=String(sourceId).replace(/[^a-zA-Z0-9_-]/g,'_');
  return {
    dropId:`axe_gear_drop_${sourceTag}`,
    id:template.id,templateId,name:displayName,
    category:'equipment',equipmentCategory:template.sourceCategory,
    rarity,qualityBand,icon:template.slot==='weapon'?'⚔️':'🛡️',
    equipmentItem:{
      ...template,
      id:template.id,templateId,category:template.sourceCategory,
      name:displayName,rarity,qualityBand,level:gearLevel,itemLevel:gearLevel,monsterLevelAtDrop:monsterLevel,
      dropBand:getAXELevelGearBand(monsterLevel).min,
      rarityLabel,rarityVariant:evolutionPath,evolutionPath,
      setId:family?.id||null,
      baseStats,rolledStats,
      appearance:null,visualPending:true, // no fabricated GLB assets
      modelUrl:null,modelFormat:null,
      equipped:false,locked:false,sockets:[],aura:null,
      bindState:'unbound',tradeable:true,
    },
  };
}
