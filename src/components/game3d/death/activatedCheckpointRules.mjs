// Pure selection rules; storage and world collision validation live elsewhere.
export function normalizeActivatedIds(value, points) {
  const ids = new Set(points.filter(p => p.default).map(p => p.id));
  if (Array.isArray(value)) {
    for (const id of value) {
      if (typeof id === 'string' && points.some(p => p.id === id)) ids.add(id);
    }
  }
  return [...ids];
}
export function availableRespawnCheckpoints(points, activatedIds, legacySavedId = null) {
  const allowed = new Set(normalizeActivatedIds([...activatedIds, legacySavedId], points));
  return points.filter(point => allowed.has(point.id));
}
