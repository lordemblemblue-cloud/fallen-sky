// A separate, bounded public PvP service: guest identities only, no Base44 token or service role.
import { randomUUID } from 'node:crypto';
import { createDuelistServer } from './server.mjs';
import { DEFAULT_PUBLIC_ROOMS } from '../../src/components/duelist/net/protocol.mjs';

export function publicArenaOrigins(raw) {
  const origins = String(raw || '').split(',').map(v => v.trim()).filter(Boolean);
  if (!origins.length || origins.some(value => {
    try { const url = new globalThis.URL(value); return url.protocol !== 'https:' || url.origin !== value; }
    catch { return true; }
  })) throw new Error('Configure explicit HTTPS DUELIST_PUBLIC_ORIGINS');
  return [...new Set(origins)];
}

export function createGuestArenaHost({ origins, port = 0, host = '127.0.0.1', maxConnections = 64, maxRooms = 16 } = {}) {
  if (!Number.isSafeInteger(maxConnections) || maxConnections < 1 || maxConnections > 64 ||
      !Number.isSafeInteger(maxRooms) || maxRooms < DEFAULT_PUBLIC_ROOMS.length || maxRooms > 16) {
    throw new Error('Invalid public arena resource limits');
  }
  return createDuelistServer({
    port, host, allowedOrigins: publicArenaOrigins(origins),
    maxConnections, maxRooms, publicArenaOnly: true, continuousPublicRooms: true,
    authenticate: async () => ({ id: 'guest-' + randomUUID(), name: 'Guest', guest: true }),
    progress: { get: () => null, add: () => null, flush: () => {} },
  });
}
