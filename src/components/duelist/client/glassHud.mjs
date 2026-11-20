// Presentation-only HUD contract. The SVG images are transparent frames;
// values and ownership always come from the game simulation, never the images.
export const HUD_IMAGES = Object.freeze({
  player: '/ui/duelist/glass-health.svg',
  portrait: '/ui/duelist/glass-portrait.svg',
  special: '/ui/duelist/glass-special.svg',
  ability: '/ui/duelist/glass-ability.svg',
  control: '/ui/duelist/glass-control.svg',
  feed: '/ui/duelist/glass-feed.svg',
});
export const ABILITY_PAGES = Object.freeze([
  Object.freeze(['push', 'pull', 'grip']),
  Object.freeze(['breach', 'dash', 'resist']),
]);
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
export function healthNumbers(current, max) {
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return '— / —';
  return `${Math.ceil(clamp(current, 0, max))} / ${Math.round(max)}`;
}
export function specialPercent(value) {
  // An absent field means the authoritative class-special resource is NOT
  // implemented. Never fabricate meter charge from elapsed time or health.
  return Number.isFinite(value) ? Math.round(clamp(value, 0, 100)) : null;
}
export function pointState(point) {
  if (point?.contested) return 'contested';
  if (point?.capturing) return 'capturing';
  return point?.owner === 'red' || point?.owner === 'blue' ? point.owner : 'neutral';
}
export function captureText(point) {
  const status = pointState(point);
  return status === 'contested' ? `${point.id}: contested` :
    status === 'capturing' ? `${point.id}: ${point.capturing} capturing ${Math.round(clamp((point.progress || 0) * 100, 0, 100))}%` :
    `${point?.id || '?'}: ${status}`;
}
