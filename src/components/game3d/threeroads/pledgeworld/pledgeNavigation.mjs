// Where the trail on the ground should lead for a tracked pledge. The pledge
// world of the scene that is loaded answers; with no such scene (the switch
// off, a cave, a dungeon) there is no answer and no trail. Pure.
let provider = null;

// The pledge-world subsystem registers itself here while it is alive. The
// function returned takes it out again, unless another scene has replaced it.
export function setPledgeNavigationProvider(fn) {
  provider = typeof fn === 'function' ? fn : null;
  return () => { if (provider === fn) provider = null; };
}

// { x, z, label } in world metres for the pledge's current step, or null.
export function getPledgeNavigationTarget(pledge, player = { x: 0, z: 0 }) {
  if (!provider || !pledge) return null;
  try {
    const at = provider(pledge, player);
    return at && Number.isFinite(at.x) && Number.isFinite(at.z) ? at : null;
  } catch {
    return null;
  }
}
