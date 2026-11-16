// Read-only projection from the existing mount XP earned through combat/riding.
// Each 20-level cycle is 5,000 XP, matching the original mount growth cap.
// Subsequent cycles are naturally available as XP continues to accrue; the
// bonus milestones are 10%, 15%, 20%, 25% at completed cycles.
export const COMPANION_GROWTH_LEVELS_PER_CYCLE=20;
export const COMPANION_GROWTH_XP_PER_CYCLE=5000;
export const COMPANION_GROWTH_TIER_BONUSES=Object.freeze([0,10,15,20,25]);
export const COMPANION_GROWTH_MAX_XP=COMPANION_GROWTH_XP_PER_CYCLE*4;
const clamp=x=>Math.max(0,Math.min(COMPANION_GROWTH_MAX_XP,Math.floor(Number(x)||0)));
export function getCompanionGrowthView(totalXp=0) {
  const actualXp=Math.max(0,Math.floor(Number(totalXp)||0));
  const xp=clamp(actualXp);
  const completed=Math.min(4,Math.floor(xp/COMPANION_GROWTH_XP_PER_CYCLE));
  const capped=completed===4;
  const inCycle=capped?COMPANION_GROWTH_XP_PER_CYCLE:xp%COMPANION_GROWTH_XP_PER_CYCLE;
  const step=COMPANION_GROWTH_XP_PER_CYCLE/COMPANION_GROWTH_LEVELS_PER_CYCLE;
  const level=capped?20:Math.min(20,1+Math.floor(inCycle/step));
  const currentLevelXP=capped?xp:inCycle-(level-1)*step;
  const nextLevelXP=capped?null:(Math.floor(xp/step)+1)*step;
  const bonusPct=COMPANION_GROWTH_TIER_BONUSES[completed];
  const nextBonusPct=capped?null:COMPANION_GROWTH_TIER_BONUSES[completed+1];
  const nextMilestoneXP=capped?null:(completed+1)*COMPANION_GROWTH_XP_PER_CYCLE;
  return {level,maxLevel:20,totalXp:actualXp,cycle:Math.min(completed+1,4),
    completedCycles:completed,bonusPct,nextBonusPct,nextMilestoneXP,
    currentLevelXP,levelXPRequired:step,nextLevelXP,
    percent:capped?100:Math.max(0,Math.min(100,currentLevelXP/step*100)),
    maxed:capped};
}
// Growth modifiers apply only to registered mount contribution; never overwrite
// the saved original growthStats / physical equipment / spiritual gear.
export function applyCompanionGrowthBonus(base,totalXp) {
  const pct=getCompanionGrowthView(totalXp).bonusPct;
  return Object.fromEntries(Object.entries(base||{}).map(([key,value])=>
    [key,Number.isFinite(Number(value))?Math.round(Number(value)*(1+pct/100)*100)/100:value]));
}
