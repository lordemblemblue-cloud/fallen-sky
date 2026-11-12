// Foundation 13.4 — single authoritative Ascend progression policy.
// "Stages" is not a second upgrade operation. No client-supplied max stage.
export const GAME3D_ASCEND_MAX_STAGE=4;
export const GAME3D_ASCEND_RULE_VERSION='ascend-four-imprints-v2';
export function inspectAscendStage({stage}={}){
 if(!Number.isSafeInteger(stage)||stage<0||stage>GAME3D_ASCEND_MAX_STAGE+1)
  return {ok:false,code:'invalid_ascension_stage',upgradeAuthorized:false};
 const maximum=stage>=GAME3D_ASCEND_MAX_STAGE;
 return {ok:true,currentStage:stage,
  nextStage:maximum?null:stage+1,
  atMaximum:maximum,canPreviewNextStage:!maximum,
  ruleVersion:GAME3D_ASCEND_RULE_VERSION,
  materialsSpent:false,upgradeAuthorized:false,statBonusActivated:false};
}
export function validateAscendTransition({fromStage,toStage}={}){
 const current=inspectAscendStage({stage:fromStage});
 return current.ok&&current.nextStage!==null&&
  toStage===current.nextStage
   ?{ok:true,fromStage,toStage,upgradeAuthorized:false}
   :{ok:false,code:'invalid_or_maxed_ascend_transition',
     upgradeAuthorized:false};
}
