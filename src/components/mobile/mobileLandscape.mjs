/** A web page cannot physically rotate an iPhone or override Safari's orientation policy.
 * An installed PWA/fullscreen capable browser may honor landscape lock; otherwise
 * the UI reflows as soon as the user turns the phone.
 */
export function showLandscapeSuggestion({ touch, width, height } = {}) {
  // All touch gameplay is landscape-only, including tablets and foldables.
  // Keep portrait game controls inaccessible until the display actually turns.
  return !!touch && Number(width) > 0 && Number(height) > Number(width);
}
export async function requestLandscapeOnGesture(host = globalThis.window) {
  if (!host) return false;
  const root = host.document?.documentElement;
  try {
    if (!host.document?.fullscreenElement && root?.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch { /* iOS Safari does not support arbitrary element fullscreen */ }
  try {
    if (typeof host.screen?.orientation?.lock === 'function') {
      await host.screen.orientation.lock('landscape');
      return true;
    }
  } catch { /* orientation lock needs user activation or installed/fullscreen context */ }
  return false;
}
