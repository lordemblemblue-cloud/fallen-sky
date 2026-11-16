// Shared Skill Book horizontal wheel mapping.
// Owner controls: vertical wheel DOWN moves LEFT; UP moves RIGHT.
// The viewport itself (not either row) applies this single offset.
export function horizontalSkillWheelOffset(deltaY=0,deltaX=0) {
  const y=Number(deltaY)||0;
  const x=Number(deltaX)||0;
  const dominant=Math.abs(y)>=Math.abs(x)?y:x;
  return -dominant;
}
