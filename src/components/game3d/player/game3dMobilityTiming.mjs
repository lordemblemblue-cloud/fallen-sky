// Independent Game 3D mobility clips: play the actual character's authored
// animation once, fast, before resuming the locomotion loop. In particular,
// never truncate a full Eve dodge at an unrelated fixed wall-clock deadline.
// No UI, movement physics, or Game 2/Luna controller dependencies.
export const GAME3D_MOBILITY_SECONDS=Object.freeze({
  dodgeLeft:.50,
  dodgeRight:.50,
  dodgeForward:.52,
  dodgeBackward:.52,
  roll:.65,
});

export function fitGame3DMobilityTiming(clipDuration,desiredDuration) {
  const desired=Number.isFinite(desiredDuration)&&desiredDuration>0?desiredDuration:.50;
  if(!Number.isFinite(clipDuration)||clipDuration<=0)
    return {timeScale:1,duration:desired};
  // Accelerate long authored clips, without shredding movement into a one
  // frame teleport. Keep especially short authentic clips at a playable rate.
  const timeScale=Math.min(4,Math.max(.65,clipDuration/desired));
  return {timeScale,duration:clipDuration/timeScale};
}
