// Companion shares 50% of XP *actually awarded* to the player, including
// any rested XP added by the player's canonical progression store.
// The enemy's level already determines the player's combat XP reward, so
// the mount must not apply a second unrelated mob-level multiplier.
export const AXE_COMPANION_PLAYER_XP_SHARE=0.5;
const safe=x=>Number.isFinite(Number(x))?Math.max(0,Number(x)):0;
export function splitAXECompanionPlayerXP(playerAwardedXP, savedRemainder=0) {
  const xp=safe(playerAwardedXP);
  // The mount store persists leftover half-points so repeated odd rewards do
  // not silently cost the companion XP (e.g. 1+1 player XP => 1 mount XP).
  const carry=Math.min(0.999999,Math.max(0,safe(savedRemainder)));
  if(!Number.isSafeInteger(Math.floor(xp)))return {xp:0,remainder:carry};
  const shared=xp*AXE_COMPANION_PLAYER_XP_SHARE+carry;
  if(!Number.isFinite(shared)||shared>Number.MAX_SAFE_INTEGER)
    return {xp:0,remainder:carry};
  const whole=Math.floor(shared);
  return {xp:whole,remainder:Number((shared-whole).toFixed(8))};
}
