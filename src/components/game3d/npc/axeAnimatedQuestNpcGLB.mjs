/**
 * Authored Game 3D quest-NPC appearances from the character GLBs already
 * shipped under /public. These are presentation-only replacements for a few
 * of the five existing, named quest givers: never extra quest NPCs or enemies.
 *
 * Only GLBs with a valid embedded idle animation can replace the currently
 * working FBX rig. Unrigged/static GLBs fall back to the old animated NPC,
 * rather than rendering motionless mannequins or trying to play animations
 * authored for an incompatible skeleton.
 */
import {loadSharedNpcModel} from './sharedNpcModel.mjs';

export const AXE_QUEST_NPC_GLBS=Object.freeze({
  archer_lyra:Object.freeze({
    url:'/models/characters/Artemis_Character_v5.glb',
    label:'Artemis archer character',
  }),
  archer_vex:Object.freeze({
    url:'/models/characters/Getsuga_Tensho_Character_v5.glb',
    label:'Getsuga character',
  }),
  archer_zephyr:Object.freeze({
    url:'/models/luna-hi3d/warrior.glb',
    label:'Hi3D animated warrior',
  }),
});

export function getAXEQuestNPCVisual(npcId){
  return Object.hasOwn(AXE_QUEST_NPC_GLBS,npcId)?
    AXE_QUEST_NPC_GLBS[npcId]:null;
}

export function pickAXEEmbeddedIdleClip(clips=[]){
  if(!Array.isArray(clips))return null;
  const valid=clips.filter(clip=>
    clip && Number.isFinite(clip.duration)&&clip.duration>0&&
    Array.isArray(clip.tracks)&&clip.tracks.length>0);
  return valid.find(clip=>/(?:^|[\s_-])(idle|standing|stand|rest|breathing|wait)(?:[\s_-]|$)/i
    .test(String(clip.name||'')))||null;
}

/** Assets have no ownership of XP, spawn authority or quests.
 * Failure to load or animate a GLB gracefully returns to the original archer.
 */
export function loadAXEQuestNPCVisual({
  npcId,gltfLoader,fbxLoader,fallbackUrl,onLoaded,onError=()=>{},
}){
  const visual=getAXEQuestNPCVisual(npcId);
  const fallback=()=>{
    if(!fbxLoader?.load||!fallbackUrl)return onError(new Error('Missing NPC FBX fallback'));
    // one shared parse of the archer FBX per world mount (sharedNpcModel.mjs); each NPC gets its own clone
    loadSharedNpcModel(fbxLoader,fallbackUrl,model=>{
      if(!model)return onError(new Error('Empty NPC FBX'));
      onLoaded({model,embeddedIdleClip:null,isEmbeddedGLB:false,
        sourceUrl:fallbackUrl});
    },onError);
  };
  if(!visual)return fallback();
  if(!gltfLoader?.load)return fallback();
  gltfLoader.load(visual.url,gltf=>{
    const model=gltf?.scene||gltf?.scenes?.[0];
    const embeddedIdleClip=pickAXEEmbeddedIdleClip(gltf?.animations);
    if(!model||!embeddedIdleClip)return fallback();
    onLoaded({model,embeddedIdleClip,isEmbeddedGLB:true,sourceUrl:visual.url});
  },undefined,fallback);
}
