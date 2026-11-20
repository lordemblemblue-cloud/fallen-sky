/**
 * Places the contextual stamina gauge beside the player's waist, using the
 * world renderer's normalized on-screen avatar anchor. Pure layout math keeps
 * desktop and mobile behavior deterministic without reading the DOM.
 */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function staminaHudAnchor(position) {
  if (!position?.screenVisible ||
    !Number.isFinite(position.screenX) ||
    !Number.isFinite(position.screenY)) return null;

  // screenY is projected at shoulder/chest height; move the gauge down toward
  // the waist and closer to the avatar's right side.
  return {
    left: clamp(position.screenX + 6.5, 10, 88),
    top: clamp(position.screenY + 7, 18, 84),
  };
}

/**
 * Enemy positions are projected pixels from GameWorld3D. A monster directly
 * behind or overlapping the small gauge should remain visible, so the HUD
 * reduces the gauge's opacity without hiding stamina from the player.
 */
export function staminaOverlapsEnemy(position, enemies, width, height) {
  const anchor = staminaHudAnchor(position);
  if (!anchor || !(width > 0) || !(height > 0) || !Array.isArray(enemies)) return false;
  const x = anchor.left * width / 100;
  const y = anchor.top * height / 100;
  return enemies.some(enemy =>
    Number.isFinite(enemy?.x) && Number.isFinite(enemy?.y) &&
    Math.abs(enemy.x - x) < 54 && Math.abs(enemy.y - y) < 56
  );
}
