// Combat 10.4 — server-owned, deterministic level policy preview.
// Never trust client level or external XP-total assertions. No XP is credited.
export const MAX_CHARACTER_LEVEL=100;
export const CHARACTER_LEVEL_POLICY_VERSION='game3d-level-preview-v1';
const MAX_XP=9223372036854775807n;
export function xpForNextLevel(level){
 if(!Number.isSafeInteger(level)||level<1||level>=MAX_CHARACTER_LEVEL)
  throw Error('Invalid progression level');
 return BigInt(100+25*(level-1));
}
export function deriveCharacterLevel(totalXP){
 const xp=typeof totalXP==='bigint'?totalXP:
  typeof totalXP==='string'&&/^(0|[1-9][0-9]*)$/.test(totalXP)
   ?BigInt(totalXP):null;
 if(xp===null||xp<0n||xp>MAX_XP)throw Error('Invalid committed XP total');
 let level=1,remaining=xp;
 while(level<MAX_CHARACTER_LEVEL){
  const step=xpForNextLevel(level);
  if(remaining<step)break;
  remaining-=step;level++;
 }
 return {level,xpIntoLevel:remaining.toString(),
  xpToNextLevel:level===MAX_CHARACTER_LEVEL?null:
   xpForNextLevel(level).toString(),
  capped:level===MAX_CHARACTER_LEVEL,
  policyVersion:CHARACTER_LEVEL_POLICY_VERSION,
  combatStatsCertified:false,rankedEligible:false};
}
