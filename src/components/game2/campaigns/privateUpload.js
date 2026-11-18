// SDK callers may return the integration payload directly or its HTTP data
// envelope. Never substitute public file URLs for a private storage handle.
export function privateUploadUri(response) {
  const payload = response?.file_uri !== undefined ? response : response?.data ?? response;
  const uri = payload?.file_uri;
  if (typeof uri === 'string' && uri.startsWith('private/') && uri.length > 8) return uri;
  const shape = payload && typeof payload === 'object'
    ? Object.keys(payload).filter(key => /^[a-z_]{1,32}$/i.test(key)).slice(0,8).join(', ') || 'no fields'
    : typeof payload;
  throw new Error('Private upload returned no valid private storage handle (' + shape + '). No archive chunk was marked complete.');
}
