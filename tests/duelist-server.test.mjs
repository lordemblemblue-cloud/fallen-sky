/* global performance, setTimeout, setInterval, clearInterval */
// Duelist Adventure's match server over real WebSockets: sign-in, joining (a player takes a bot's seat; Join
// finds the match that has players), snapshots, the server moving a player by its input, the press budget,
// and a leaving player's seat going back to a bot. The server clock runs 4x fast to skip the countdown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createDuelistServer } from '../server/duelist/server.mjs';
import { WS_PATH, encodeInput } from '../src/components/duelist/net/protocol.mjs';
import { INPUT } from '../src/components/duelist/core/index.mjs';

const SPEED = 4;
async function start() {
  const server = createDuelistServer({
    host: '127.0.0.1', port: 0, clock: () => (performance.now() / 1000) * SPEED,
    authenticate: async (token, hello) => (token ? { id: token, name: hello.name } : null),
  });
  const address = await server.listen();
  return { server, url: `ws://127.0.0.1:${address.port}${WS_PATH}` };
}

function connect(url) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data));
    inbox.push(msg);
    for (const w of waiters.slice()) if (w.test(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  const closed = new Promise((resolve) => ws.on('close', (code) => resolve(code)));
  return {
    ws, inbox, closed,
    open: () => new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); }),
    send: (m) => ws.send(JSON.stringify(m)),
    next(test, ms = 4000) {
      const found = inbox.find(test);
      if (found) { inbox.splice(inbox.indexOf(found), 1); return Promise.resolve(found); }
      return new Promise((resolve, reject) => {
        const w = { test, resolve };
        waiters.push(w);
        setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); reject(new Error('timed out')); } }, ms);
      });
    },
  };
}

async function player(url, id, body = 'huntress') {
  const c = connect(url);
  await c.open();
  c.send({ t: 'hello', v: 1, token: id, name: id.toUpperCase(), body });
  await c.next((m) => m.t === 'welcome');
  return c;
}

test('without a token there is no game', async () => {
  const { server, url } = await start();
  const c = connect(url);
  await c.open();
  c.send({ t: 'hello', v: 1, token: '', name: 'x' });
  const err = await c.next((m) => m.t === 'error');
  assert.equal(err.code, 'auth');
  assert.equal(await c.closed, 4401);
  await server.close();
});

test('players join (taking bots\' seats), Join finds the match with players, the server moves a player by its input', async () => {
  const { server, url } = await start();
  const a = await player(url, 'ann');
  a.send({ t: 'join', mode: 'ffa' });
  const joined = await a.next((m) => m.t === 'joined');
  assert.equal(joined.mode, 'ffa');
  assert.ok(joined.replaced, 'took a bot\'s seat');
  assert.equal(joined.seats.length, 6);
  assert.equal(joined.seats.find((s) => s.id === 'ann').body, 'huntress');
  // the second player presses Join (any mode): the match that has a player in it
  const b = await player(url, 'ben', 'maskedWarrior');
  b.send({ t: 'join', mode: 'any' });
  const joinedB = await b.next((m) => m.t === 'joined');
  assert.equal(joinedB.match, joined.match);
  assert.equal(joinedB.seats.filter((s) => s.kind === 'player').length, 2);
  await a.next((m) => m.t === 'seats' && m.seats.filter((s) => s.kind === 'player').length === 2);
  // snapshots: wait for the fight to start, then walk forward
  const live = await a.next((m) => m.t === 'snap' && m.view?.phase === 'live', 6000);
  const startPos = live.fighters.find((f) => f.id === 'ann').p;
  let seq = 0;
  const walk = setInterval(() => a.send(encodeInput(seq++, { move: { x: 0, z: 1 }, run: true, face: 0 })), 15);
  await new Promise((r) => setTimeout(r, 400));
  clearInterval(walk);
  const later = await a.next((m) => m.t === 'snap' && m.ack >= seq - 3);
  const endPos = later.fighters.find((f) => f.id === 'ann').p;
  const moved = Math.hypot(endPos[0] - startPos[0], endPos[2] - startPos[2]);
  assert.ok(moved > 1, `moved ${moved.toFixed(2)} m by input`);
  assert.ok(later.fighters.find((f) => f.id === 'ann').cd !== undefined, 'own cooldowns are sent');
  assert.equal(later.fighters.find((f) => f.id === 'ben').cd, undefined, 'nobody else\'s');
  a.ws.close();
  b.ws.close();
  await server.close();
});

test('presses beyond the budget are dropped; leaving gives the seat back to a bot', async () => {
  const { server, url } = await start();
  const a = await player(url, 'cat');
  a.send({ t: 'join', mode: 'duel' });
  const joined = await a.next((m) => m.t === 'joined');
  const room = server.rooms.get(joined.match);
  const client = [...room.clients.values()][0];
  // 10 messages of 8 presses at once: only the burst gets through
  for (let i = 0; i < 10; i++) a.send(encodeInput(i, { move: { x: 0, z: 0 }, presses: ['light', 'light', 'light', 'light', 'light', 'light', 'light', 'light'] }));
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(client.presses.length <= INPUT.burst + 2, `${client.presses.length} presses queued`);
  // an unknown command never reaches the rules
  a.send({ t: 'input', s: 999, m: [0, 0], p: ['teleport', 'instakill'] });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!client.presses.includes('teleport'));
  const d = await player(url, 'dan');
  d.send({ t: 'join', mode: 'duel' });
  const joinedD = await d.next((m) => m.t === 'joined');
  assert.equal(joinedD.match, joined.match, 'the duel with a waiting player');
  assert.equal(joinedD.seats.filter((s) => s.kind === 'player').length, 2);
  a.send({ t: 'leave' });
  await a.next((m) => m.t === 'left');
  const seats = await d.next((m) => m.t === 'seats');
  assert.equal(seats.seats.filter((s) => s.kind === 'bot').length, 1, 'a bot took the empty seat');
  a.ws.close();
  d.ws.close();
  await server.close();
});
