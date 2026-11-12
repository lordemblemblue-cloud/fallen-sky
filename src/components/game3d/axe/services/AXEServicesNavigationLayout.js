// Coordinates are relative to the existing world/HUD, never to a second canvas.
export function measureAXEServicesArea({ bounds, status, weather, compass, gap = 12 }) {
  const left = Math.max(gap, (status?.right ?? bounds.left) - bounds.left + gap);
  const rightEdge = Math.min(
    bounds.right - gap,
    weather?.left ?? compass?.left ?? bounds.right - gap,
  );
  return {
    left: Math.round(left),
    width: Math.max(0, Math.floor(rightEdge - bounds.left - gap - left)),
    top: Math.max(12, Math.round(Math.min(status?.top ?? bounds.top + 18, weather?.top ?? bounds.top + 18) - bounds.top)),
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
