/* global performance, setTimeout, setInterval, clearInterval, fetch */
// Duelist Adventure's match server over real WebSockets: sign-in, joining (a player takes a bot's seat; Join
// finds the match that has players), snapshots, the server moving a player by its input, the press budget,
// and a leaving player's seat going back to a bot. The server clock runs 4x fast to skip the countdown
// (the prediction tests run it at its real speed, against a browser's predictor).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createDuelistServer } from '../server/duelist/server.mjs';
import { PROTOCOL, WS_PATH, MAX_WAITING_INPUTS, encodeInput, sanitizeInput } from '../src/components/duelist/net/protocol.mjs';
import { createPredictor } from '../src/components/duelist/net/predict.mjs';
import { INPUT } from '../src/components/duelist/core/index.mjs';

const SPEED = 4;
async function start({ speed = SPEED } = {}) {
  const server = createDuelistServer({
    host: '127.0.0.1', port: 0, clock: () => (performance.now() / 1000) * speed,
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
  c.send({ t: 'hello', v: PROTOCOL, token: id, name: id.toUpperCase(), body });
  await c.next((m) => m.t === 'welcome');
  return c;
}

test('without a token there is no game', async () => {
  const { server, url } = await start();
  const c = connect(url);
  await c.open();
  c.send({ t: 'hello', v: PROTOCOL, token: '', name: 'x' });
  const err = await c.next((m) => m.t === 'error');
  assert.equal(err.code, 'auth');
  assert.equal(await c.closed, 4401);
  await server.close();
});

test('a page loaded before an update (an older protocol) is told to reload', async () => {
  const { server, url } = await start();
  const c = connect(url);
  await c.open();
  c.send({ t: 'hello', v: PROTOCOL - 1, token: 'ann', name: 'Ann' });
  const err = await c.next((m) => m.t === 'error');
  assert.equal(err.code, 'version');
  assert.match(err.message, /Reload/);
  assert.equal(await c.closed, 4426);
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
  // during the countdown the rules do not act on anyone's inputs: no own state to predict from
  assert.equal((await a.next((m) => m.t === 'snap')).own, undefined);
  // snapshots: wait for the fight to start, then walk forward
  const live = await a.next((m) => m.t === 'snap' && m.view?.phase === 'live', 6000);
  assert.ok(live.own && live.own.b.length === 7 && live.own.at > 0, 'the fight is on: the player\'s own fighter in full');
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
  assert.ok(client.accepted <= INPUT.burst + 2, `${client.accepted} of 80 presses let through`);
  // an unknown command never reaches the rules
  const before = client.accepted;
  a.send({ t: 'input', s: 999, m: [0, 0], p: ['teleport', 'instakill'] });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(client.accepted, before);
  assert.ok(!client.waiting.some((w) => w.presses.includes('teleport')));
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

test('the lobby lists live matches for the menus: mode and head counts, no names or account ids', async () => {
  const { server, url } = await start();
  const http = url.replace('ws://', 'http://').replace(WS_PATH, '/lobby');
  assert.deepEqual((await (await fetch(http)).json()).matches, []);
  const a = await player(url, 'eve-account-123');
  a.send({ t: 'join', mode: 'tdm' });
  const joined = await a.next((m) => m.t === 'joined');
  const res = await fetch(http);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const text = await res.text();
  const { matches } = JSON.parse(text);
  assert.equal(matches.length, 1);
  assert.deepEqual({ id: matches[0].id, mode: matches[0].mode, players: matches[0].players, bots: matches[0].bots, seats: matches[0].seats, open: matches[0].open },
    { id: joined.match, mode: 'tdm', players: 1, bots: 7, seats: 8, open: true });
  assert.ok(!text.includes('eve-account-123') && !text.includes('EVE-ACCOUNT'), 'no player ids or names');
  a.ws.close();
  await server.close();
});

test('a crew room for the story mission: its own code, a friend joins by it, the depot and the mission view arrive, it is not listed', async () => {
  const { server, url } = await start();
  const http = url.replace('ws://', 'http://').replace(WS_PATH, '/lobby');
  const a = await player(url, 'ann', 'maskedWarrior');
  a.send({ t: 'join', mode: 'story', create: true });
  const joined = await a.next((m) => m.t === 'joined');
  assert.equal(joined.mode, 'story');
  assert.equal(joined.mission, 'contraband');
  assert.match(joined.code, /^[A-HJ-NP-Z]{5}$/);
  assert.deepEqual(joined.seats.filter((s) => s.kind === 'player').map((s) => [s.id, s.team, s.body]), [['ann', 'crew', 'maskedWarrior']]);
  const depot = joined.seats.filter((s) => s.kind === 'enemy');
  assert.equal(depot.length, 3, 'the dock is manned for a crew of one');
  assert.deepEqual([depot[0].type, depot[0].max], ['gunner', [42, 0, 60, 10]], 'a guard, with a guard\'s vitals (no Will: no Veil)');
  assert.deepEqual((await (await fetch(http)).json()).matches, [], 'a room of your own is not listed');
  const snap = await a.next((m) => m.t === 'snap' && m.view);
  assert.equal(snap.view.mission, 'contraband');
  assert.equal(snap.view.stage.index, 0);
  assert.deepEqual(snap.view.room, { code: joined.code, open: false });
  assert.equal(snap.fighters.length, 4, 'the player and the three guards');
  const quiet = await a.next((m) => m.t === 'snap' && m.idle?.length === 3);
  assert.equal(quiet.fighters.length, 1, 'guards who have noticed nobody come by id between full snapshots');
  assert.ok(JSON.stringify(snap).length < 4000, `a snapshot of ${JSON.stringify(snap).length} bytes`);
  // a wrong code and a malformed one are refused; the right one joins the same room
  const b = await player(url, 'ben', 'huntress');
  b.send({ t: 'join', mode: 'story', code: joined.code === 'ZZZZZ' ? 'YYYYY' : 'ZZZZZ' });
  assert.equal((await b.next((m) => m.t === 'error')).code, 'code');
  b.send({ t: 'join', mode: 'story', code: 'nope' });
  assert.equal((await b.next((m) => m.t === 'error')).code, 'code');
  b.send({ t: 'join', mode: 'story', code: joined.code });
  const joinedB = await b.next((m) => m.t === 'joined');
  assert.equal(joinedB.match, joined.match);
  assert.equal(joinedB.seats.filter((s) => s.kind === 'player').length, 2);
  await a.next((m) => m.t === 'seats' && m.seats.filter((s) => s.kind === 'player').length === 2);
  const both = await b.next((m) => m.t === 'snap' && m.view?.people.length === 2);
  assert.deepEqual(both.view.people.map((p) => p.id).sort(), ['ann', 'ben']);
  // the friend leaves: the crew is one again, the mission goes on
  b.send({ t: 'leave' });
  await b.next((m) => m.t === 'left');
  await a.next((m) => m.t === 'seats' && m.seats.filter((s) => s.kind === 'player').length === 1);
  a.ws.close();
  b.ws.close();
  await server.close();
});

test('the interact key reaches the mission: held at a marked crate, the crate opens', async () => {
  const { server, url } = await start();
  const a = await player(url, 'ann');
  a.send({ t: 'join', mode: 'story', create: true });
  const joined = await a.next((m) => m.t === 'joined');
  const { mission } = server.rooms.get(joined.match);
  const { world } = mission;
  // nobody in the way, and the player standing at crate A
  for (const e of mission.enemies.values()) Object.assign(world.fighters.get(e.id).vitals, { hp: 0, dead: true });
  Object.assign(world.bodies.get('ann'), { x: -20, z: -16.6 });
  let seq = 0;
  const hold = setInterval(() => a.send(encodeInput(seq++, { move: { x: 0, z: 0 }, interact: true })), 15);
  const using = await a.next((m) => m.t === 'snap' && m.uses?.some((u) => u[0] === 'crateA' && u[1] === 'ann' && u[2] > 0), 4000);
  assert.ok(using, 'who is using what rides the snapshots');
  const opened = await a.next((m) => m.t === 'snap' && m.view?.done.includes('crateA'), 6000);
  clearInterval(hold);
  assert.ok(opened.events.some((e) => e.type === 'interacted' && e.id === 'crateA' && e.by === 'ann'));
  assert.equal(opened.view.stage.text, 'Open the marked crates (1/3)');
  a.ws.close();
  await server.close();
});

test('open crews: the story with no code finds a crew with room; the lobby lists it; Join (any) stays with the matches', async () => {
  const { server, url } = await start();
  const http = url.replace('ws://', 'http://').replace(WS_PATH, '/lobby');
  const a = await player(url, 'ann');
  a.send({ t: 'join', mode: 'story' });
  const joined = await a.next((m) => m.t === 'joined');
  const { matches } = await (await fetch(http)).json();
  assert.deepEqual(matches.map((m) => [m.id, m.mode, m.name, m.players, m.seats, m.open]), [[joined.match, 'story', 'Contraband', 1, 4, true]]);
  const b = await player(url, 'ben');
  b.send({ t: 'join', mode: 'story' });
  assert.equal((await b.next((m) => m.t === 'joined')).match, joined.match, 'the crew that has room');
  const c = await player(url, 'cy');
  c.send({ t: 'join', mode: 'any' });
  const joinedC = await c.next((m) => m.t === 'joined');
  assert.notEqual(joinedC.match, joined.match);
  assert.equal(joinedC.mode, 'ffa', 'the Join button looks for a match, not a mission');
  for (const p of [a, b, c]) p.ws.close();
  await server.close();
});

test('a burst of inputs after a stall is caught up to the newest few, and no press is lost', async () => {
  const { server, url } = await start({ speed: 1 });
  const a = await player(url, 'ann');
  a.send({ t: 'join', mode: 'story', create: true });
  const joined = await a.next((m) => m.t === 'joined');
  const room = server.rooms.get(joined.match);
  const client = room.clients.get('ann');
  for (const e of room.mission.enemies.values()) Object.assign(room.mission.world.fighters.get(e.id).vitals, { hp: 0, dead: true });
  // twelve inputs at once, a roll in the very first
  for (let i = 0; i < 12; i++) a.send(encodeInput(i, { move: { x: 0, z: 1 }, run: true, face: 0, presses: i === 0 ? ['roll'] : [] }));
  const rolling = await a.next((m) => m.t === 'snap' && m.own?.a?.[0] === 'roll', 2000);
  assert.ok(rolling, 'the roll was kept although its input was skipped');
  assert.ok(client.waiting.length <= MAX_WAITING_INPUTS, `${client.waiting.length} inputs waiting`);
  assert.equal((await a.next((m) => m.t === 'snap' && m.ack === 11, 2000)).ack, 11, 'and the newest input is reached');
  a.ws.close();
  await server.close();
});

test('a browser predicting against the real server: its inputs are used in order and it barely needs correcting', async () => {
  const { server, url } = await start({ speed: 1 });
  const a = await player(url, 'ann');
  a.send({ t: 'join', mode: 'story', create: true });
  const joined = await a.next((m) => m.t === 'joined');
  const { mission } = server.rooms.get(joined.match);
  for (const e of mission.enemies.values()) Object.assign(mission.world.fighters.get(e.id).vitals, { hp: 0, dead: true });
  const startZ = mission.world.bodies.get('ann').z;
  const predictor = createPredictor({ id: 'ann', level: mission.level });
  const corrections = [];
  let acked = -1;
  let owns = 0;
  let serverZ = startZ;
  a.ws.on('message', (data) => {
    const msg = JSON.parse(String(data));
    if (msg.t !== 'snap') return;
    assert.ok(msg.ack >= acked, 'inputs are used in the order they were sent');
    acked = msg.ack;
    if (!msg.own) return;
    owns += 1;
    serverZ = msg.own.b[2];
    const was = predictor.active;
    predictor.reconcile(msg.own, msg.ack, []);
    if (was) corrections.push(predictor.stats().correction);
  });
  // sixty steps a second for a second and a half: walk up the dock, each input sent and played at once
  let seq = 0;
  let clock = 0;
  let last = performance.now();
  let lead = 0;
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const now = performance.now();
      clock += (now - last) / 1000;
      last = now;
      while (clock >= 1 / 60 && seq < 90) {
        clock -= 1 / 60;
        const message = encodeInput(seq, { move: { x: 0, z: 1 }, run: true, face: 0 });
        a.send(message);
        predictor.advance(seq, sanitizeInput(JSON.parse(JSON.stringify(message))), []);
        seq += 1;
        if (predictor.active) lead = Math.max(lead, predictor.body.z - serverZ);
      }
      if (seq >= 90) { clearInterval(timer); resolve(); }
    }, 4);
  });
  await a.next((m) => m.t === 'snap' && m.ack === 89, 2000);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(owns >= 20, `${owns} snapshots carried the player's own fighter`);
  assert.ok(predictor.body.z - startZ > 5, `walked ${(predictor.body.z - startZ).toFixed(1)} m`);
  assert.ok(lead > 0.05, `the browser's fighter ran ${lead.toFixed(2)} m ahead of the server's word`);
  const mean = corrections.reduce((s, c) => s + c, 0) / corrections.length;
  const worst = Math.max(...corrections);
  assert.ok(mean < 0.1 && worst < 0.6, `corrections: ${mean.toFixed(3)} m on average, ${worst.toFixed(2)} m at worst over ${corrections.length} snapshots`);
  a.ws.close();
  await server.close();
});
