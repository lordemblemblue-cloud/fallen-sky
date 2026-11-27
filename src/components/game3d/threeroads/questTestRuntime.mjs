// In-memory admin test preview, shared by the game page, weather HUD and
// Three Roads feature flags. Never persisted in a URL or character storage.
// Reloading/leaving the page resets to the user's existing flag settings.
let testPreview = null;

export function setQuestTestRuntimePreview(preview = null) {
  testPreview = typeof preview === 'boolean' ? preview : null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('game3dQuestTestSessionChanged'));
  }
}

export const questTestRuntimePreview = () => testPreview;
export const questTestRuntimeActive = () => testPreview !== null;
