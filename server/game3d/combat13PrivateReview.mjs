// Combat 13.5 — standalone private read-only world-combat review facade.
// Unlike the engine event pipeline, this has NO write or grant method.
import {assertGame3DPreBetaSafety} from './combatPreBetaGate.mjs';
import {createGame3DWorldCombatReviewer135}
 from './worldCombatReview135.mjs';
export function createGame3DCombat13PrivateReview({
 pool,resolveAuthenticatedSubject,env={}
}={}){
 assertGame3DPreBetaSafety(env);
 const review=createGame3DWorldCombatReviewer135({
  pool,resolveAuthenticatedSubject,
 });
 return Object.freeze({
  version:'13.5',privateBetaOnly:true,readOnly:true,
  inspectWorldCombatCandidate:args=>review.inspect(args),
  readiness:()=>({
   sourceMilestone:'13.5',
   movementInputPacketValidationAvailable:true,
   worldCombatCandidateReviewAvailable:true,
   trustedWorldAttesterInstalled:false,
   openWorldEnemyAuthorityConnected:false,
   authoritativePvEEnabled:false,
   multiplayerWorldSynchronizationConnected:false,
   verifiedCombatRewardCreditsEnabled:false,
   xpItemGrantsEnabled:false,
   rankedCombatEnabled:false,
   productionReady:false,releaseAuthorized:false,
  }),
 });
}
