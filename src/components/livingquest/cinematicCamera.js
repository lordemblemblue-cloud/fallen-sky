// Camera hand-off for the Living Quest cinematic. The world camera listens for
// these window events and frames the player and the quest giver; without a
// listener (dashboard or a paused world) the calls are harmless.
export function startCinematicCamera(target) {
  if (typeof window === 'undefined') return;
  window.__cinematicCamera = { active: true, target: target || null };
  window.dispatchEvent(new CustomEvent('cinematicCameraStart', { detail: { target: target || null } }));
}

export function stopCinematicCamera() {
  if (typeof window === 'undefined') return;
  window.__cinematicCamera = null;
  window.dispatchEvent(new CustomEvent('cinematicCameraEnd'));
}