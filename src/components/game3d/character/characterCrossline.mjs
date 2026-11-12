/**
 * Crossline — original perspective navigation for the Game 3D character gateway.
 * Keeps only the selected save and two neighboring saves on each side visible.
 * All other saves remain accessible with Previous/Next and arrow keys.
 * Pure selection logic; never writes player state or mutates the roster.
 */
export function getCrosslineOffset(index, selectedIndex, total) {
  if (!Number.isInteger(total) || total < 1 ||
      !Number.isInteger(index) || index < 0 || index >= total ||
      !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= total) {
    return null;
  }
  const forward = (index - selectedIndex + total) % total;
  if (forward === 0) return 0;
  const backward = forward - total;
  // An exact tie on an even-sized roster appears below the active entry.
  return forward <= total / 2 ? forward : backward;
}

export function getVisibleCrosslineSlots(total, selectedIndex, radius = 2) {
  if (!Number.isInteger(total) || total < 1 ||
      !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= total) {
    return [];
  }
  const safeRadius = Number.isInteger(radius) ? Math.max(0, Math.min(radius, 3)) : 2;
  return Array.from({ length: total }, (_, index) => ({
    index, offset: getCrosslineOffset(index, selectedIndex, total),
  }))
    .filter(item => Math.abs(item.offset) <= safeRadius)
    .sort((a, b) => a.offset - b.offset);
}
