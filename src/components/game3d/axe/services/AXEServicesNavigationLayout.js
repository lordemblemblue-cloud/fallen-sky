// Coordinates are relative to the existing world/HUD, never to a second canvas.
// The top row now runs left-to-right: real minimap, Services, live weather.
// Use the minimap's RIGHT edge to start Services; the empty status anchor is
// intentionally not a position reference for this row. Reserve weather's
// LEFT edge when visible and let Services fill that space when it is hidden.
export function measureAXEServicesArea({ bounds, status, weather, compass, gap = 12 }) {
  const viewportWidth = Math.max(0, bounds.right - bounds.left);
  const clearance = viewportWidth <= 420 ? Math.min(8, gap) : gap;
  const leftEdge = compass?.right ?? status?.right ?? bounds.left;
  const left = Math.max(clearance, Math.ceil(leftEdge - bounds.left + clearance));
  const rightEdge = Math.min(bounds.right - clearance, weather?.left ?? bounds.right - clearance);
  const rowTop = compass?.top ?? weather?.top ?? status?.top ?? (bounds.top + 18);
  return {
    left,
    width: Math.max(0, Math.floor(rightEdge - bounds.left - clearance - left)),
    top: Math.max(12, Math.round(rowTop - bounds.top)),
  };
}

// Preserve reading order. If even two rows do not fit, the containing strip
// scrolls horizontally instead of making a third row or covering another HUD.
export function splitAXEServiceRows(widths, availableWidth, gap = 6) {
  if (!widths.length) return [];
  if (widths.length === 1) return [[0]];
  const rowWidth = (values) => values.reduce((sum, width) => sum + width, 0) + Math.max(0, values.length - 1) * gap;
  if (rowWidth(widths) <= availableWidth) return [widths.map((_, index) => index)];
  let split = 1;
  let widest = Infinity;
  for (let i = 1; i < widths.length; i += 1) {
    const candidate = Math.max(rowWidth(widths.slice(0, i)), rowWidth(widths.slice(i)));
    if (candidate < widest) { widest = candidate; split = i; }
  }
  return [widths.slice(0, split).map((_, index) => index), widths.slice(split).map((_, index) => index + split)];
}
