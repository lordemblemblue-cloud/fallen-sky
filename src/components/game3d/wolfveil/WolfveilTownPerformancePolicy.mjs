// Town rendering policy: only visuals are culled or replaced, never the
// authoritative Wolfveil ground height, wall collision or quest interactions.
export function resolveTownQuality(requested = 'auto', coarsePointer = false) {
  if (requested === 'high' || requested === 'balanced') return requested;
  if (requested === 'ultra-low') return 'ultra-low';
  if (requested === 'low') return 'low';
  return coarsePointer ? 'ultra-low' : 'low';
}

export function townLODState(distanceMeters, type = 'home', previous = 'proxy', quality = 'low') {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return 'detail';
  if (quality === 'high') return distanceMeters < 95 ? 'detail' : 'hidden';
  if (quality === 'balanced') return distanceMeters < 65 ? 'detail' : 'hidden';
  const mobile = quality === 'ultra-low';
  // Hysteresis reduces flashing when crossing an entrance threshold.
  // Shop door interactions happen well inside the detailed radius.
  const enter = type === 'shop' ? (mobile ? 17 : 19) : (mobile ? 14 : 17);
  const exit = enter + 5;
  const distant = type === 'shop' ? 82 : 78;
  if (distanceMeters <= (previous === 'detail' ? exit : enter)) return 'detail';
  return distanceMeters <= distant ? 'proxy' : 'hidden';
}
