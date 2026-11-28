// Bound public request memory before parsing. Keep the legacy UTF-16 length
// ceiling, including non-ASCII saves, with a conservative UTF-8 byte ceiling.
export async function readBoundedGuestBody(request, maxChars = 1_100_000) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  const maxBytes = maxChars * 3 + 3; // UTF-8 plus an optional BOM
  let bytes = 0;
  let raw = '';
  const reject = () => {
    void reader.cancel().catch(() => {});
    return null;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) return reject();
      raw += decoder.decode(value, { stream: true });
      if (raw.length > maxChars) return reject();
    }
    raw += decoder.decode();
    return raw.length > maxChars ? null : raw;
  } finally {
    reader.releaseLock();
  }
}
