import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGame2ArenaServer } from '../arena.mjs';
import { FLEET_PROTOCOL } from '../fleet/rules.mjs';

async function fixture(t) {
  const arena = createGame2ArenaServer({
    host: '127.0.0.1',
    authenticate: async token => (token.startsWith('user-') ? { id: token.slice(5) } : null),
    fleet: { config: { warmupMs: 300, minPlayers: 6, cruisersPerSide: 2 } },
  });
  const addr = await arena.listen();
  t.after(async () => await arena.close());
  return { arena, url: 'ws://127.0.0.1:' + addr.port + '/ws/game2' };
}
async function eventually(check, message, timeout = 4000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (check()) return;
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error(message);
}
async function connect(url, user, extra = {}) {
  const ws = new WebSocket(url);
  ws.got = [];
  ws.on('message', raw => ws.got.push(JSON.parse(String(raw))));
  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'join', version: 2, mode: 'fleet', peer: user + '~abc123', token: 'user-' + user, name: user, ...extra }));
  return ws;
}

test('Fleet Assault over the Railway socket: authenticated join, live snapshots, commands that fly the ship', async t => {
  const { arena, url } = await fixture(t);
  const a = await connect(url, 'alice', { side: 'republic' });
  const b = await connect(url, 'bob', { role: 'commander' });
  await eventually(() => a.got.some(m => m.t === 'fw') && b.got.some(m => m.t === 'fw'), 'welcome missing');
  const wa = a.got.find(m => m.t === 'fw');
  assert.equal(wa.proto, FLEET_PROTOCOL);
  assert.equal(wa.you.side, 'republic');
  assert.equal(b.got.find(m => m.t === 'fw').you.side, 'separatist', 'sides balance');
  assert.equal(wa.cruisers.length, 4);
  assert.equal(wa.cfg.spendPoints, true, "the deploy screen is told whether points are spent");
  await eventually(() => a.got.some(m => m.t === 'fs' && m.you?.th === 'space'), 'never launched');
  assert.equal(b.got.filter(m => m.t === 'fs').at(-1).you.th, 'interior', 'the commander starts on the bridge');
  const first = a.got.filter(m => m.t === 'fs').at(-1);
  // a floor of 6: alice, bob and 4 AI pilots; bob commands from the bridge, so 5 ships fly
  assert.equal(first.s.length, 5);
  for (let seq = 1; seq <= 30; seq++) a.send(JSON.stringify({ t: 'fleet', c: 'cmd', cmds: [{ seq, ms: 33, throttle: 1, boost: true }] }));
  await eventually(() => a.got.some(m => m.t === 'fs' && m.you?.seq === 30), 'commands not acknowledged');
  const last = a.got.filter(m => m.t === 'fs').at(-1);
  const moved = Math.hypot(...last.you.f.p.map((v, i) => v - first.you.f.p[i]));
  assert.ok(moved > 30, 'the server flew the ship ' + moved.toFixed(1) + ' m');
  assert.ok(a.got.some(m => m.t === 'fp'), 'the server measures round trips');
  a.send(JSON.stringify({ t: 'fleet', c: 'pong', id: a.got.find(m => m.t === 'fp').id }));
  const report = arena.report();
  assert.equal(report.fleet.humans, 2);
  assert.equal(report.players, 0, 'Fleet Assault players are not in the duel arenas');
  a.close();
  await eventually(() => arena.report().fleet.humans === 1, 'leaving frees the seat');
  b.close();
});

test('a Fleet Assault join needs a valid account token like every arena join', async t => {
  const { arena, url } = await fixture(t);
  const ws = new WebSocket(url);
  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'join', version: 2, mode: 'fleet', peer: 'mallory~abc123', token: 'forged' }));
  await eventually(() => ws.readyState === WebSocket.CLOSED, 'unauthenticated socket stayed open');
  assert.equal(arena.report().fleet.humans, 0);
});
