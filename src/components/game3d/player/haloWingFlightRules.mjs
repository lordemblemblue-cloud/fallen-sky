// Halo flight progression is based on the EXISTING 0–200 halo level, not a
// second save/progression currency. Wing-path enhancement remains independent.
// 10% Halo -> 5 seconds of free glide; 100% -> 50 seconds. After that, the
// canonical combat stamina ledger pays for gliding at the current rate.
export const HALO_FLIGHT_RULES=Object.freeze({
  maxHaloLevel:200,
  wingUnlockPercent:10,
  freeSecondsPerPercent:.5,
  maxFreeGlideSeconds:50,
  airRunStaminaPerSecond:12,
  airRunHoldThresholdSeconds:.20,
  airRunVerticalSpeed:1.8,
  airRunForwardSpeed:4.5,
  finisherStaminaCost:28,
  finisherSeconds:.42,
  finisherForwardSpeed:13,
  finisherVerticalSpeed:1.3,
  doubleTapMilliseconds:300,
  initialAirJumpForwardSpeed:3.8,
  initialAirJumpSeconds:.24,
});
export function getHaloFlightProfile({level=0,maxLevel=HALO_FLIGHT_RULES.maxHaloLevel}={}){
  const cap=Number.isFinite(maxLevel)&&maxLevel>0?maxLevel:HALO_FLIGHT_RULES.maxHaloLevel;
  const lvl=Number.isFinite(level)?Math.max(0,Math.min(cap,level)):0;
  const percent=Math.min(100,Math.max(0,lvl/cap*100));
  const unlocked=percent+1e-8>=HALO_FLIGHT_RULES.wingUnlockPercent;
  return Object.freeze({
    level:lvl,haloPercent:percent,unlocked,
    freeGlideSeconds:unlocked?Math.min(HALO_FLIGHT_RULES.maxFreeGlideSeconds,
      percent*HALO_FLIGHT_RULES.freeSecondsPerPercent):0,
    nextUnlockLevel:!unlocked?Math.ceil(cap*HALO_FLIGHT_RULES.wingUnlockPercent/100):null,
  });
}
export function paidGlideSeconds(state,seconds) {
  const dt=Number.isFinite(seconds)?Math.max(0,Math.min(.08,seconds)):0;
  // The exact tick that crosses the free-budget boundary bills ONLY its paid
  // fraction, so there is no extra charge or unearned free fraction.
  const free=Number.isFinite(state?.freeGlideRemaining)?
    Math.max(0,state.freeGlideRemaining):0;
  return Math.max(0,dt-Math.min(dt,free));
}
