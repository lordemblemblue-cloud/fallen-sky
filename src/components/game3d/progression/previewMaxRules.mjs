// This controls only a local visual/combat preview overlay. It is NOT authorization
// for an admin action; production privileges must be checked by the game server.
export function allowsSpiritualPreviewMax({ hostname = '', enabled = '', serverEnv = '', dev = false, previewHost = '' } = {}) {
  const host = String(hostname).toLowerCase();
  const allowedPreviewHost = String(previewHost).toLowerCase().trim();
  if (enabled !== 'true' || serverEnv !== 'test') return false;
  if (dev && (host === 'localhost' || host === '127.0.0.1' || host === '[::1]')) return true;
  // A named preview deployment requires an exact hostname match. Never use
  // "contains preview" or "*.base44.app": those can include published apps.
  return Boolean(allowedPreviewHost) && host === allowedPreviewHost && host !== 'localhost';
}
