// Movement sweep for the manor interior. Without the authored colliders the
// palace zone is walked as open ground, so a step is always allowed at the
// current foot height.

export function canTraverseManorAxis({ canWalk } = {}) {
  return typeof canWalk === 'function' ? canWalk() !== false : true;
}

export function manorStepSupport({ feetY = 0, upperFloor = false, onStairs = false, atticFloor = false, onAtticStairs = false } = {}) {
  return {
    allowed: true,
    feetY: Number.isFinite(Number(feetY)) ? Number(feetY) : 0,
    upperFloor: Boolean(upperFloor),
    onStairs: Boolean(onStairs),
    atticFloor: Boolean(atticFloor),
    onAtticStairs: Boolean(onAtticStairs),
  };
}