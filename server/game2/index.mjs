import { createClient } from '@base44/sdk';
import { createGame2ArenaServer, ARENA_ROOMS, MAX_PLAYERS } from './arena.mjs';

// Every connection is authenticated once through Base44; real-time player data
// stays on Railway after admission. No Base44 entity polling during combat.
const appId = String(process.env.BASE44_APP_ID || '');
if (!appId) throw new Error('BASE44_APP_ID must be configured on Railway');
const serverUrl = String(process.env.BASE44_BACKEND_URL || 'https://base44.app');
const port = Number(process.env.PORT || 3000);

async function authenticate(token) {
  const client = createClient({ appId, serverUrl, token, requiresAuth: true });
  const user = await client.auth.me();
  return user?.id ? { id: String(user.id) } : null;
}

const maxPlayers = Math.min(MAX_PLAYERS, Math.max(1, Number(process.env.GAME2_MAX_PLAYERS) || MAX_PLAYERS)); // hard 100-player ceiling per public room
// Fleet Assault overrides for a test deployment (fleet/rules.mjs MATCH has the defaults)
const fleetConfig = {};
for (const [env, key] of [['GAME2_FLEET_MIN_PLAYERS', 'minPlayers'], ['GAME2_FLEET_MAX_PLAYERS', 'maxPlayers'], ['GAME2_FLEET_WARMUP_MS', 'warmupMs']]) {
  if (Number(process.env[env]) > 0) fleetConfig[key] = Number(process.env[env]);
}
const arena = createGame2ArenaServer({ authenticate, port, maxPlayers, fleet: { config: fleetConfig } });
const address = await arena.listen();
console.log('[Game 2 Railway] Arena WebSocket ready on port', address.port, '| protocol 2 | arenas', ARENA_ROOMS.join(', '), '| up to', maxPlayers, 'players each | Fleet Assault', JSON.stringify(fleetConfig));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    console.log('[Game 2 Railway] Shutting down arena');
    await arena.close();
    process.exit(0);
  });
}
