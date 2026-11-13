// Controls the site but handles ONLY /game3d/ assets; never
// cache HTML, API responses, sessions, player data, cross-origin assets or ranges.
// Bump this version when replacing an existing non-fingerprinted asset path.
const CACHE_NAME = 'game3d-public-v1-20261113';
const MAX_ENTRIES = 72;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const STATIC_FILE = /\.(?:glb|gltf|fbx|bin|ktx2|png|jpe?g|webp|avif|mp3|ogg|wav)$/i;

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('game3d-public-') && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith('/game3d/') || !STATIC_FILE.test(url.pathname) ||
      req.headers.has('range') || req.headers.has('authorization') ||
      req.cache === 'no-store') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    const response = await fetch(req);
    const type = response.headers.get('content-type') || '';
    const policy = response.headers.get('cache-control') || '';
    const bytes = Number(response.headers.get('content-length'));
    if (response.ok && response.type === 'basic' && !/private|no-store/i.test(policy) &&
        !/text\/html/i.test(type) && Number.isFinite(bytes) &&
        bytes >= 0 && bytes <= MAX_FILE_BYTES && !response.headers.has('set-cookie')) {
      // Don't delay first render to write browser storage. Quota failures are safe.
      event.waitUntil((async () => {
        try {
          await cache.put(req, response.clone());
          const keys = await cache.keys();
          for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
            await cache.delete(key);
          }
        } catch { /* storage quota or private browsing */ }
      })());
    }
    return response;
  })());
});
