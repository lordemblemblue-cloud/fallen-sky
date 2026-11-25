// Duelist Adventure match server (Railway or any Node 20+ host). Run from the repository root, since the
// server runs the game's own rules from src/components/duelist:
//   node server/duelist/index.mjs
// Settings (environment):
//   BASE44_APP_ID            the app whose accounts may play (required unless DUELIST_ALLOW_GUESTS=1)
//   BASE44_BACKEND_URL       default https://base44.app
//   PORT                     default 5321
//   DUELIST_ALLOWED_ORIGINS  comma-separated exact origins allowed to connect (default: any)
//   DUELIST_ALLOW_GUESTS     1 lets players without an account in as guests: local testing only
//   DUELIST_CONTINUOUS_PUBLIC_ROOMS  0 pauses empty public rooms; default 1
//   DUELIST_BOT_LEVEL        trainee | duelist | master (default duelist)
//   DUELIST_PROGRESS_FILE    where each account's class EXP is kept (a JSON file on a disk that lasts); without
//                            it, levels last only while the server runs
/* global process, console */
import { createClient } from '@base44/sdk';
import { createDuelistServer } from './server.mjs';
import { createProgressStore } from './progress.mjs';

const appId = String(process.env.BASE44_APP_ID || '');
const allowGuests = process.env.DUELIST_ALLOW_GUESTS === '1';
if (!appId && !allowGuests) throw new Error('Set BASE44_APP_ID (or DUELIST_ALLOW_GUESTS=1 for a local test server)');
const serverUrl = String(process.env.BASE44_BACKEND_URL || 'https://base44.app');
const port = Number(process.env.PORT || 5321);
const allowedOrigins = process.env.DUELIST_ALLOWED_ORIGINS
  ? process.env.DUELIST_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : null;

// Every connection signs in once: a Base44 account token, checked with Base44 (the account id is the player's
// id; a client can never claim another). Guests get a throwaway id, and only when allowed.
async function authenticate(token, hello) {
  if (token && appId) {
    const client = createClient({ appId, serverUrl, token, requiresAuth: true });
    const user = await client.auth.me();
    if (user?.id) return { id: String(user.id), name: hello?.name || user.full_name || 'Duelist' };
  }
  if (allowGuests) return { id: `guest-${Math.random().toString(36).slice(2, 10)}`, name: hello?.name || 'Guest', guest: true };
  return null;
}

const log = (...a) => console.log('[duelist]', ...a);
const progress = createProgressStore({ file: process.env.DUELIST_PROGRESS_FILE || null, log });
const server = createDuelistServer({
  authenticate, port, allowedOrigins, botLevel: process.env.DUELIST_BOT_LEVEL || 'duelist', progress,
  continuousPublicRooms: process.env.DUELIST_CONTINUOUS_PUBLIC_ROOMS !== '0',
  log,
});
const address = await server.listen();
console.log('[duelist] match server on port', address.port, allowGuests ? '(guests allowed: local testing only)' : '', allowedOrigins ? `origins ${allowedOrigins.join(', ')}` : '');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    console.log('[duelist] shutting down');
    await server.close();
    process.exit(0);
  });
}
