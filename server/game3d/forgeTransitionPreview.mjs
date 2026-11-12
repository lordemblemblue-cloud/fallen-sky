// Forge Foundation 16.1 — deterministic single-step upgrades, PREVIEW ONLY.
// Server must verify full item ownership, material conservation and revision
// within a future transactional writer; do not call this a successful forge.
import {inspectAscendStage} from './ascendStageRules.mjs';
import {inspectEnchantPath} from './enchantRules.mjs';
import {parsePrivateInventoryRevision} from './inventorySlotRead.mjs';
const modes=new Set(['ascend','enchant','over_enchant']);
const denied=code=>({ok:false,code,upgradeAuthorized:false,materialsSpent:false});
export function inspectGame3DForgeTransition({state,mode,expectedRevision}={}){
 if(!modes.has(mode)||!state||
    state.source!=='trusted-private-upgrade-state'||
    state.readTransactionBound!==true||
    parsePrivateInventoryRevision(state.revision)!==expectedRevision||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<0)
  return denied('unverified_forge_transition_scope');
 const {ascendStage,enchantLevel,overEnchantLevel}=state;
 const stage=inspectAscendStage({stage:ascendStage});
 const enchant=inspectEnchantPath({enchantLevel,overEnchantLevel});
 if(!stage.ok||!enchant.ok)return denied('invalid_prior_forge_state');
 const next={ascendStage,enchantLevel,overEnchantLevel};
 if(mode==='ascend'){
  if(stage.nextStage===null)return denied('maximum_ascension');
  next.ascendStage=stage.nextStage;
 }else if(mode==='enchant'){
  if(enchant.nextEnchant===null)return denied('maximum_enchant');
  next.enchantLevel=enchant.nextEnchant;
 }else{
  if(enchant.nextOverEnchant===null)return denied('over_enchant_locked_or_maxed');
  next.overEnchantLevel=enchant.nextOverEnchant;
 }
 return Object.freeze({ok:true,mode,
  previousRevision:String(expectedRevision),
  proposedRevision:String(expectedRevision+1),
  previous:{ascendStage,enchantLevel,overEnchantLevel},
  next,previewOnly:true,upgradeAuthorized:false,
  materialsSpent:false,currencyDebited:false,statsChanged:false});
}
