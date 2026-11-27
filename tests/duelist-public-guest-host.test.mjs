import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createGuestArenaHost, publicArenaOrigins } from '../server/duelist/publicHost.mjs';
import { PROTOCOL, WS_PATH, DEFAULT_PUBLIC_ROOMS } from '../src/components/duelist/net/protocol.mjs';

const origin = 'https://game.example';
function next(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => { ws.off('message', listener); reject(new Error('Timed out: ' + type)); }, 3000);
    function listener(raw) {
      const msg = JSON.parse(String(raw));
      if (msg.t !== type) return;
      globalThis.clearTimeout(timer);
      ws.off('message', listener);
      resolve(msg);
    }
    ws.on('message', listener);
  });
}

test('guest host requires exact HTTPS origins and bounded resources', () => {
  for (const value of ['', '*', 'http://game.example', 'https://game.example/path', 'https://u:p@game.example']) {
    assert.throws(() => publicArenaOrigins(value));
  }
  assert.deepEqual(publicArenaOrigins(origin + ',' + origin), [origin]);
  assert.throws(() => createGuestArenaHost({ origins: origin, maxConnections: 65 }));
  assert.throws(() => createGuestArenaHost({ origins: origin, maxRooms: 1 }));
});

test('public lobby and two real guest clients join the same exact arena; unauthorized origins and excessive sockets rejected', { timeout: 12000 }, async () => {
  const host = createGuestArenaHost({ origins: origin, maxConnections: 2, maxRooms: DEFAULT_PUBLIC_ROOMS.length });
  const { port } = await host.listen();
  const url = 'ws://127.0.0.1:' + port + WS_PATH;
  const sockets = [];
  async function open(originHeader = origin) {
    const ws = new WebSocket(url, { origin: originHeader });
    sockets.push(ws);
    ws.on('error', () => {});
    await once(ws, 'open');
    return ws;
  }
  async function hello(ws, resume) {
    const pending = next(ws, 'welcome');
    ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'admin', token: 'ignored', name: 'admin', ...(resume ? { resume } : {}) }));
    return pending;
  }
  try {
    await assert.rejects(open('https://untrusted.example'));
    const lobbyUrl = 'http://127.0.0.1:' + port + '/lobby';
    const initial = await (await globalThis.fetch(lobbyUrl)).json();
    assert.equal(initial.protocol, PROTOCOL);
    assert.equal(initial.matches.length, DEFAULT_PUBLIC_ROOMS.length);
    const room = initial.matches.find(r => r.mode === 'duel');
    const a = await open(), b = await open();
    const wa = await hello(a), wb = await hello(b);
    assert.match(wa.id, /^guest-/);
    assert.notEqual(wa.id, wb.id);
    assert.equal(wa.name, 'Guest');
    for (const ws of [a, b]) {
      const pending = next(ws, 'joined');
      ws.send(JSON.stringify({ t: 'join', mode: 'duel', matchId: room.id }));
      assert.equal((await pending).match, room.id);
    }
    const after = await (await globalThis.fetch(lobbyUrl)).json();
    assert.equal(after.matches.find(r => r.id === room.id).players, 2);
    assert.equal(after.matches.length, DEFAULT_PUBLIC_ROOMS.length, 'room limit prevents overflow');
    assert.ok(!JSON.stringify(after).includes(wa.id));
    await assert.rejects(open());
    const error = next(a, 'error');
    a.send(JSON.stringify({ t: 'join', mode: 'story', create: true }));
    assert.equal((await error).code, 'mode');
    const closed = once(a, 'close');
    a.close();
    await closed;
    const fresh = await open();
    const w = await hello(fresh, { match: room.id, key: 'é'.repeat(24) });
    assert.equal(w.resumed, false);
    assert.notEqual(w.id, wa.id);
  } finally {
    for (const ws of sockets) ws.terminate();
    await host.close();
  }
});
