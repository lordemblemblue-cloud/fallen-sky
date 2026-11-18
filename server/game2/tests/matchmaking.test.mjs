import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGame2ArenaServer } from '../arena.mjs';
import { RailwayGameSession } from '../../../src/components/game2/net/railway.js';
import { GAME2_QUEUE_MODES, GAME2_QUEUE_RULES, requestedGame2QueueModes,
  normalizeGame2QueueModes } from '../queueRules.mjs';

const eventually = async (predicate, message) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
async function fixture(t, options = {}) {
  const arena = createGame2ArenaServer({
    host: '127.0.0.1',
    authenticate: async token => token.startsWith('user-') ? { id: token.slice(5) } : null,
    ...options,
  });
  const address = await arena.listen();
  t.after(async () => arena.close());
  return { arena, url: 'ws://127.0.0.1:' + address.port + '/ws/game2' };
}
async function queue(url, name, modes) {
  const socket = new WebSocket(url), messages = [];
  socket.on('message', raw => { try { messages.push(JSON.parse(String(raw))); } catch { /* ignore */ } });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({
    t: 'queue', version: 2, token: 'user-' + name,
    peer: name + '~abc123', name, modes,
  }));
  return { socket, messages, match: () => messages.find(m => m.t === 'match_found') };
}
function enter(url, name, match, options = {}) {
  const session = new RailwayGameSession({
    selfId: name + '~abc123', name, token: 'user-' + name,
    url, WebSocketImpl: WebSocket, ai: 0,
    side: match.side, matchMode: match.matchMode, mapId: match.mapId,
    serverId: match.serverId, matchTicket: match.matchTicket, ...options,
  });
  session.received = [];
  session.onMessage = (from, body) => session.received.push({ from, body });
  return session;
}

test('mode rules cover random, all, duel, team duel and online CTF', () => {
  assert.deepEqual(GAME2_QUEUE_MODES, ['ffa', 'teams', 'duel', 'team_duel', 'ctf']);
  assert.equal(GAME2_QUEUE_RULES.duel.minPlayers, 2);
  assert.equal(GAME2_QUEUE_RULES.team_duel.minPlayers, 4);
  assert.deepEqual(requestedGame2QueueModes('all'), GAME2_QUEUE_MODES);
  assert.deepEqual(requestedGame2QueueModes('random', () => .99), ['ctf']);
  assert.deepEqual(requestedGame2QueueModes('ctf'), ['ctf']);
  assert.equal(normalizeGame2QueueModes(['ffa', 'ffa']), null);
  assert.deepEqual(normalizeGame2QueueModes(['duel', 'ctf']), ['duel', 'ctf']);
  assert.equal(normalizeGame2QueueModes([]), null);
});

test('legacy duel queue compatibility uses the single canonical public server map', async t => {
  const { arena, url } = await fixture(t, { rng: () => 0.999 });
  const a = await queue(url, 'ladder-a', ['duel']);
  const b = await queue(url, 'ladder-b', ['duel']);
  await eventually(() => a.match() && b.match(), 'two duel players did not receive canonical server tickets');
  assert.equal(a.match().serverId, 'public-duel');
  assert.equal(b.match().serverId, 'public-duel');
  assert.equal(a.match().mapId, 'training');
  assert.equal(b.match().mapId, 'training');
  a.socket.close(); b.socket.close();
  assert.equal(arena.report().servers.filter(room => room.publicMode && room.matchMode === 'duel').length, 1);
});

test('one player remains in the waiting room: no match ticket or gameplay arena until second human joins', async t => {
  const { arena, url } = await fixture(t);
  const a = await queue(url, 'alice', ['duel']);
  await eventually(() => a.messages.some(m => m.t === 'queue_wait'), 'First player never entered queue');
  assert.equal(a.match(), undefined);
  assert.equal(arena.report().matchmaking.waiting, 1);
  assert.equal(arena.report().servers.filter(r => r.id.startsWith('match-')).length, 0);
  const b = await queue(url, 'bob', ['duel']);
  await eventually(() => a.match() && b.match(), 'Two real players did not get match tickets');
  const first = a.match(), second = b.match();
  assert.equal(first.serverId, second.serverId);
  assert.notEqual(first.matchTicket, second.matchTicket);
  assert.equal(first.matchMode, 'duel');
  assert.equal(first.maxPlayers, 100, 'persistent duel ladder admits additional spectators');
  assert.equal(arena.report().matchmaking.waiting, 0);
  assert.equal(arena.report().servers.some(r => r.id === first.serverId), true, 'duel reservations join a persistent public ladder');
  const intruder = enter(url, 'mallory', first);
  await intruder.start();
  assert.equal(intruder.state, 'ended', 'another authenticated player cannot reuse a reserved ticket');
  const goodA = enter(url, 'alice', first), goodB = enter(url, 'bob', second);
  await goodA.start();
  await goodB.start();
  // Public Duel rooms are directly joinable after reserved duelists arrive;
  // later joiners spectate until promoted by the server.
  const spectator = enter(url, 'mallory', first, {matchTicket:undefined});
  await spectator.start();
  assert.equal(spectator.state, 'live');
  await eventually(() => goodA.roster.size === 3 && goodB.roster.size === 3, 'Duel roster with spectator did not form');
  assert.ok(goodA.duelState.spectators.includes(spectator.self) ||
    goodA.duelState.waiting.includes(spectator.self));
  assert.equal(goodA.matchMode, 'duel');
  assert.equal(goodA.ai, 0, 'matchmaking never substitutes bots for real players');
  goodA.leave(); goodB.leave(); spectator.leave();
});

test('cancel releases the slot and 2v2 Team Duel only starts with four distinct humans', async t => {
  const { arena, url } = await fixture(t);
  const cancelled = await queue(url, 'cancelled', ['team_duel']);
  await eventually(() => arena.report().matchmaking.waiting === 1, 'Queued player not visible');
  cancelled.socket.send(JSON.stringify({ t: 'queue_cancel' }));
  await eventually(() => arena.report().matchmaking.waiting === 0, 'Cancelled player retained a queue place');
  const names = ['alpha','bravo','charlie','delta'];
  const queueClients = [];
  for (const name of names.slice(0,3)) queueClients.push(await queue(url, name, ['team_duel']));
  await eventually(() => arena.report().matchmaking.waiting === 3, 'First three not waiting');
  assert.ok(queueClients.every(q => !q.match()), '3/4 must not open a map');
  queueClients.push(await queue(url, names[3], ['team_duel']));
  await eventually(() => queueClients.every(q => q.match()), 'Fourth participant did not start team duel');
  assert.equal(new Set(queueClients.map(q => q.match().serverId)).size, 1);
  assert.deepEqual(queueClients.map(q => q.match().side), ['light','dark','light','dark']);
  const sessions = queueClients.map((q, i) => enter(url, names[i], q.match()));
  for (const session of sessions) await session.start();
  await eventually(() => sessions.every(s => s.roster.size === 4), '2v2 roster missing');
  assert.equal(sessions[0].matchMode, 'team_duel');
  assert.equal(sessions[0].max, 100, '2v2 ladder retains sideline spectator capacity');
  sessions[0].send(sessions[2].self, { k:'rpc', actor:sessions[0].self+':p',
    fid:sessions[2].self+':p', m:'hurt', a:[10] });
  sessions[0].send(sessions[1].self, { k:'rpc', actor:sessions[0].self+':p',
    fid:sessions[1].self+':p', m:'hurt', a:[10] });
  await eventually(() => sessions[1].received.length === 1, 'Enemy damage did not relay');
  assert.equal(sessions[2].received.length, 0, 'Friendly damage must not relay');
  for (const session of sessions) session.leave();
});

test('an invalid mode or duplicate account cannot reserve a waiting-room slot', async t => {
  const { arena, url } = await fixture(t);
  const original = await queue(url, 'alice', ['teams']);
  await eventually(() => arena.report().matchmaking.waiting === 1, 'Initial place missing');
  const duplicated = await queue(url, 'alice', ['duel']);
  await eventually(() => duplicated.messages.some(m => m.t === 'error'), 'Duplicate queue did not reject');
  const unfinished = await queue(url, 'charlie', ['wrong-mode']);
  await eventually(() => unfinished.messages.some(m => m.t === 'error'), 'Invalid queue mode did not reject');
  assert.equal(arena.report().matchmaking.waiting, 1);
  original.socket.close();
  await eventually(() => arena.report().matchmaking.waiting === 0, 'Disconnected queue player was not removed');
});
