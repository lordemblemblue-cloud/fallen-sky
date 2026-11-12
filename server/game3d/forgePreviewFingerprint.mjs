// Forge Foundation 16.3 — deterministic display-only upgrade fingerprint.
// A hash is not a signature, server authorization, or a material receipt.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {inspectGame3DForgeTransition} from './forgeTransitionPreview.mjs';
import {parsePrivateInventoryRevision} from './inventorySlotRead.mjs';
const uuid=x=>typeof x==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
export function fingerprintGame3DForgePreview(preview){
 if(preview?.ok!==true||preview.previewAvailable!==true||
    !who(preview.ownerId)||!who(preview.characterId)||
    !uuid(preview.itemInstanceId))
  return {ok:false,code:'forge_preview_unavailable',forgeAuthorized:false};
 const rev=parsePrivateInventoryRevision(preview.itemRevision);
 if(rev===null)return {ok:false,code:'invalid_forge_revision',forgeAuthorized:false};
 const state={source:'trusted-private-upgrade-state',
  readTransactionBound:true,revision:String(rev),
  ascendStage:preview.ascend?.currentStage,
  enchantLevel:preview.enchant?.enchantLevel,
  overEnchantLevel:preview.enchant?.overEnchantLevel};
 const transition=inspectGame3DForgeTransition({
  state,mode:preview.mode,expectedRevision:rev});
 if(!transition.ok||stableJournalJSON(transition.next)!==
    stableJournalJSON(preview.proposedState)||
    preview.proposedRevision!==transition.proposedRevision)
  return {ok:false,code:'forge_preview_state_conflict',forgeAuthorized:false};
 const binding={ownerId:preview.ownerId,characterId:preview.characterId,
  itemInstanceId:preview.itemInstanceId,mode:preview.mode,
  revision:String(rev),nextRevision:transition.proposedRevision,
  proposedState:transition.next};
 const hash=createHash('sha256').update(stableJournalJSON(binding)).digest('hex');
 return {ok:true,previewFingerprint:hash,
  previewOnly:true,forgeAuthorized:false,materialsDebited:false,
  gameplayStatsChanged:false};
}
