// When GameWorld3D builds its world again (docs/GAME3D_CHARACTER_SCREEN_PERF_20261122.md, "Left" 1).
//
// The world used to rebuild everything (renderer, GPU device, terrain, village, every shader) whenever the player's
// body file changed, which froze WebGPU pages for about 34 s right after Create character. Now a body change on the
// character screens (entry mode), with a running world able to swap its actor, keeps the world and only swaps the
// player model; a body change during play, or before the world can swap, rebuilds as before.

/**
 * @param {{key: number, url: string}} previous the current build (its key is the world effect's dependency)
 * @param {string} modelUrl the player's body file now
 * @param {{entryMode: boolean, canSwap: boolean}} state on the character screens / the running world can swap its actor
 * @returns {{key: number, url: string}} the same object when nothing changes
 */
export function nextWorldBuild(previous, modelUrl, { entryMode = false, canSwap = false } = {}) {
  if (modelUrl === previous.url) return previous;
  return { url: modelUrl, key: previous.key + (entryMode && canSwap ? 0 : 1) };
}
