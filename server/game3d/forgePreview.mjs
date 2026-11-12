// Foundation 13.6 — authenticated, read-only Blacksmith forge preview.
// The actual upgrade state MUST come from a trusted server-side item record,
// never from the browser inventory or a client-supplied current level.
import {createGame3DBlacksmithSelection} from './blacksmithSelection.mjs';
import {inspectAscendStage} from './ascendStageRules.mjs';
import {inspectEnchantPath} from './enchantRules.mjs';
import {inspectGame3DForgeTransition} from './forgeTransitionPreview.mjs';
import {parsePrivateInventoryRevision} from './inventorySlotRead.mjs';
const modes=new Set(['ascend','enchant','over_enchant']);
export function createGame3DForgePreview({
 pool,resolveAuthenticatedSubject,readServerUpgradeState
}={}){
 if(typeof readServerUpgradeState!=='function')
  throw Error('Forge preview requires trusted item upgrade state provider');
 const selection=createGame3DBlacksmithSelection({pool,resolveAuthenticatedSubject});
 const inspect=async({serverRequestContext,characterId,itemInstanceId,
  mode}={})=>{
  const denied=code=>({ok:false,code,forgeAuthorized:false,
   materialsConsumed:false});
  if(!modes.has(mode))return denied('invalid_forge_mode');
  const item=await selection.inspect({
   serverRequestContext,characterId,itemInstanceId,
   readUpgradeState:readServerUpgradeState});
  if(!item.ok)return denied(item.code);
  const state=item.upgradeState;
  if(state?.source!=='trusted-private-upgrade-state'||
     state.readTransactionBound!==true||
     state.ownerId!==item.ownerId||
     state.characterId!==characterId||
     state.itemInstanceId!==itemInstanceId)
   return denied('unverified_item_upgrade_state');
  const ascend=inspectAscendStage({stage:state.ascendStage});
  const enchant=inspectEnchantPath({
   enchantLevel:state.enchantLevel,
   overEnchantLevel:state.overEnchantLevel});
  const revision=parsePrivateInventoryRevision(state.revision);
  if(!ascend.ok||!enchant.ok||revision===null)
   return denied('invalid_upgrade_record');
  const transition=inspectGame3DForgeTransition({
   state,mode,expectedRevision:revision});
  const available=transition.ok;
  return {ok:true,ownerId:item.ownerId,characterId,itemInstanceId,
   mode,previewAvailable:available,
   ascend,enchant,
   itemRevision:String(revision),
   proposedState:transition.ok?transition.next:null,
   proposedRevision:transition.ok?transition.proposedRevision:null,
   previewOnly:true,upgradeAuthorized:false,
   forgeAuthorized:false,materialsConsumed:false,
   competitiveBonusEnabled:false};
 };
 return Object.freeze({inspect});
}
