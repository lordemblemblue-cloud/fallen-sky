import {AXE_FARMING_STAGE_CAP,isAXEFarmingRarity} from '../loot/AXEFarmingGearTiers.mjs';

const idOf=item=>String(item?.instanceId||item?.id||'');
const levelOf=item=>Math.max(1,Math.floor(Number(item?.itemLevel??item?.level)||1));
export function getAXEAscensionFeedRequirement(rank){
  const r=Math.max(0,Math.floor(Number(rank)||0));
  return r>=AXE_FARMING_STAGE_CAP?0:r+1;
}
export function validateAXEAscensionFeed(target,donor){
  if(!target||!donor)return {ok:false,reason:'ITEM_MISSING'};
  const rarity=String(target.rarity||'').toLowerCase();
  if(!isAXEFarmingRarity(rarity))return {ok:false,reason:'FARMING_ASCENSION_ONLY'};
  if(!idOf(target)||!idOf(donor)||idOf(target)===idOf(donor))
    return {ok:false,reason:'SAME_INSTANCE'};
  if(String(donor.rarity||'').toLowerCase()!==rarity)
    return {ok:false,reason:'ASCENSION_RARITY_MISMATCH'};
  if(String(target.slot||target.category||'')!==String(donor.slot||donor.category||''))
    return {ok:false,reason:'ASCENSION_SLOT_MISMATCH'};
  if(donor.equipped||donor.locked||donor.favorited||donor.favorite)
    return {ok:false,reason:'DONOR_PROTECTED'};
  return {ok:true};
}
export function previewAXEAscensionFeed(target,stage={},donor){
  const valid=validateAXEAscensionFeed(target,donor);
  if(!valid.ok)return valid;
  const current=Math.max(0,Math.floor(Number(stage?.rank)||0));
  if(current>=AXE_FARMING_STAGE_CAP)return {ok:false,reason:'MAX_STAGE'};
  const existingProgress=Math.max(0,Math.floor(Number(stage?.feedProgress)||0));
  const sameGrade=String(target.rarity).toLowerCase();
  const legendary=sameGrade==='legendary';
  const difference=Math.max(0,levelOf(donor)-levelOf(target));
  // Higher-tier rare/elite donor may bypass several ranks in a SINGLE feed:
  // Lv80 -> Lv50 contributes +4 ranks; ordinary same-level donors need 1 for
  // +1, then 2 for +2, 3 for +3, and 4 for +4, with progress saved between.
  const skip=legendary?0:Math.floor(difference/10);
  const unlocked=skip>0?Math.min(AXE_FARMING_STAGE_CAP,current+1+skip):current;
  const cost=getAXEAscensionFeedRequirement(current);
  const count=legendary?1:cost;
  const stored=legendary?0:Math.min(existingProgress,cost-1);
  const progress=skip>0?0:stored+1;
  const newRank=skip>0?unlocked:(progress>=count?current+1:current);
  const nextProgress=progress>=count?0:progress;
  return {ok:true,currentRank:current,nextRank:newRank,
    progress:stored,progressAfter:nextProgress,
    required:count,grantedRanks:newRank-current,
    remainingToNext:newRank===current?Math.max(0,count-nextProgress):0,
    higherLevelSkip:skip>0,donorLevel:levelOf(donor),targetLevel:levelOf(target),
    consumedId:idOf(donor),requiresEquipment:true,
    oldStage:stage,
  };
}
