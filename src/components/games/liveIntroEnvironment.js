// The launcher cinematic belongs to the published app, never the editor's preview.
// Preview builds can also be production-optimized, so import.meta.env.PROD alone
// is not sufficient to distinguish the two environments.
export function shouldShowLiveIntro({
  hostname = '',
  search = '',
  embedded = false,
  isDevelopment = false,
  isPreview = false,
} = {}) {
  if (isDevelopment || embedded || isPreview) return false;

  const host = String(hostname).toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('preview--') ||
    host.startsWith('preview.') ||
    host.includes('.preview.') ||
    host.startsWith('sandbox-') ||
    host.startsWith('sandbox.') ||
    host.startsWith('editor-') ||
    host.startsWith('editor.')
  ) return false;

  const params = new URLSearchParams(search);
  // Allow an explicit preview/test link to bypass the intro even on a live host.
  if (['preview', 'preview_mode', 'sandbox', 'editor'].some(key => params.has(key))) {
    return false;
  }

  return true;
}
