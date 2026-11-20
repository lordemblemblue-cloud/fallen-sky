/* global performance, setTimeout */
// Coming back after a dropped connection (server/duelist/server.mjs, net/client.mjs): the seat waits for its
// player while a bot (a match) or the autopilot (a crew) plays it, and the key from 'joined' sits the player
// back down with everything kept; a crew's mission waits while nobody is connected; a key opens only its own
// seat; a connection that stops answering is noticed; the browser's source reconnects by itself and after a
// reload. Real WebSockets; the server's clock runs 4x fast unless a test says otherwise.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createDuelistServer } from '../server/duelist/server.mjs';
import { PROTOCOL, WS_PATH } from '../src/components/duelist/net/protocol.mjs';
import { createOnlineSource } from '../src/components/duelist/net/client.mjs';

// every server a test starts is closed at the end, even when the test fails (an open one keeps node running)
const started = [];
after(async () => { for (const s of started) await s.close(); });
async function start({ speed = 4, ...options } = {}) {
  const server = createDuelistServer({
    host: '127.0.0.1', port: 0, clock: () => (performance.now() / 1000) * speed, ...options,
    // a token is the account's id; 'guest' signs in as a guest (a fresh id each time, as the real server does)
    authenticate: async (token, hello) => (token === 'guest' ? { id: `guest-${Math.random().toString(36).slice(2, 8)}`, name: 'Guest', guest: true }
      : token ? { id: token, name: hello.name } : null),
  });
  const close = server.close;
  let closed = false;
  server.close = async () => { if (closed) return; closed = true; await close(); };
  started.push(server);
  const address = await server.listen();
  return { server, url: `ws://127.0.0.1:${address.port}${WS_PATH}` };
}

function connect(url, options = {}) {
  const ws = new WebSocket(url, options);
  const inbox = [];
  const waiters = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data));
    inbox.push(msg);
    for (const w of waiters.slice()) if (w.test(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  ws.on('error', () => {});
  return {
    ws,
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

async function signIn(url, token, { resume = null, socket = {} } = {}) {
  const c = connect(url, socket);
  await c.open();
  c.send({ t: 'hello', v: PROTOCOL, token, name: token.toUpperCase(), body: 'huntress', ...(resume ? { resume } : {}) });
  c.welcome = await c.next((m) => m.t === 'welcome');
  return c;
}

const until = async (test, ms = 3000) => {
  const end = performance.now() + ms;
  while (performance.now() < end) { if (test()) return true; await new Promise((r) => setTimeout(r, 10)); }
  return test();
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

test('a dropped player keeps the seat: a bot plays it meanwhile, and the key sits the player back down with the score', async () => {
  const { server, url } = await start();
  const a = await signIn(url, 'ann');
  a.send({ t: 'join', mode: 'tdm' });
  const joined = await a.next((m) => m.t === 'joined');
  assert.match(joined.key, /^[\w-]{24}$/, 'a key comes with the seat');
  await a.next((m) => m.t === 'snap' && m.view?.phase === 'live', 6000);
  const room = server.rooms.get(joined.match);
  room.match.scores.ann.defeats = 3;
  const before = { ...room.match.world.bodies.get('ann') };
  a.ws.terminate(); // the network goes, without a word
  assert.ok(await until(() => room.clients.get('ann')?.away), 'the seat waits for its player');
  assert.equal(room.match.seats.get('ann').kind, 'player');
  assert.equal([...room.match.seats.values()].filter((s) => s.kind === 'bot').length, 7, 'no bot took the seat');
  await pause(600); // 2.4 s of the match
  const f = room.match.world.fighters.get('ann');
  const now = room.match.world.bodies.get('ann');
  assert.ok(room.match.seats.get('ann').standIn, 'a bot plays the seat');
  assert.ok(f.vitals.dead || Math.hypot(now.x - before.x, now.z - before.z) > 0.3, 'and it moves');
  // back, with the key (a reload, or the page reconnecting by itself)
  const b = await signIn(url, 'ann', { resume: { match: joined.match, key: joined.key } });
  assert.equal(b.welcome.resumed, true);
  const back = await b.next((m) => m.t === 'joined');
  assert.equal(back.resumed, true);
  assert.equal(back.match, joined.match);
  assert.notEqual(back.key, joined.key, 'a fresh key each time');
  assert.equal(back.seats.find((s) => s.id === 'ann').kind, 'player');
  assert.equal(room.clients.get('ann').away, false);
  assert.equal(room.match.scores.ann.defeats, 3, 'the score is kept');
  assert.ok(room.match.feed.some((e) => e.type === 'away' && e.id === 'ann') && room.match.feed.some((e) => e.type === 'back' && e.id === 'ann'), 'the feed says so');
  assert.ok((await b.next((m) => m.t === 'snap' && m.own)).own, 'and the player is predicted again');
  b.ws.close();
  await server.close();
});

test('after the grace period the seat goes back to a bot, and the old key opens nothing', async () => {
  const { server, url } = await start({ reconnectSeconds: 1 }); // one second of the server's clock: a quarter here
  const a = await signIn(url, 'ann');
  a.send({ t: 'join', mode: 'duel' });
  const joined = await a.next((m) => m.t === 'joined');
  const room = server.rooms.get(joined.match);
  a.ws.terminate();
  assert.ok(await until(() => !room.match.seats.has('ann')), 'the seat was given up');
  assert.equal([...room.match.seats.values()].filter((s) => s.kind === 'bot').length, 2, 'a bot sits in it');
  const b = await signIn(url, 'ann', { resume: { match: joined.match, key: joined.key } });
  assert.equal(b.welcome.resumed, false);
  b.ws.close();
  await server.close();
});

test('a key opens only its own seat: not for another account, not for a guest', async () => {
  const { server, url } = await start();
  const a = await signIn(url, 'ann');
  a.send({ t: 'join', mode: 'tdm' });
  const joined = await a.next((m) => m.t === 'joined');
  const room = server.rooms.get(joined.match);
  a.ws.terminate();
  assert.ok(await until(() => room.clients.get('ann')?.away));
  const resume = { match: joined.match, key: joined.key };
  const bob = await signIn(url, 'bob', { resume });
  assert.equal(bob.welcome.resumed, false);
  assert.equal(bob.welcome.id, 'bob');
  const guest = await signIn(url, 'guest', { resume });
  assert.equal(guest.welcome.resumed, false);
  const forged = await signIn(url, 'ann', { resume: { match: joined.match, key: 'x'.repeat(24) } });
  assert.equal(forged.welcome.resumed, false, 'a wrong key opens nothing either');
  // signing in afresh (no key) gave ann's waiting seat up: one account, one seat
  assert.ok(await until(() => !room.clients.has('ann')));
  for (const c of [bob, guest, forged]) c.ws.close();
  await server.close();
});

test('a crew\'s mission waits while its only player is away, and goes on from the same moment', async () => {
  const { server, url } = await start({ speed: 1 });
  const a = await signIn(url, 'ann');
  a.send({ t: 'join', mode: 'story', create: true });
  const joined = await a.next((m) => m.t === 'joined');
  const room = server.rooms.get(joined.match);
  await a.next((m) => m.t === 'snap');
  a.ws.terminate();
  assert.ok(await until(() => room.clients.get('ann')?.away));
  const paused = room.mission.world.time;
  await pause(300);
  assert.equal(room.mission.world.time, paused, 'nobody connected: the mission waits');
  const b = await signIn(url, 'ann', { resume: { match: joined.match, key: joined.key } });
  assert.equal(b.welcome.resumed, true);
  const back = await b.next((m) => m.t === 'joined');
  assert.equal(back.code, joined.code, 'the same crew');
  assert.equal(back.mission, 'contraband');
  await b.next((m) => m.t === 'snap');
  assert.ok(room.mission.world.time > paused, 'and it goes on');
  assert.ok(room.mission.world.time - paused < 0.5, 'from where it was');
  b.ws.close();
  await server.close();
});

test('in a crew, a dropped member is played by the autopilot while the others carry on', async () => {
  const { server, url } = await start();
  const a = await signIn(url, 'ann');
  a.send({ t: 'join', mode: 'story', create: true });
  const joined = await a.next((m) => m.t === 'joined');
  const b = await signIn(url, 'ben');
  b.send({ t: 'join', mode: 'story', code: joined.code });
  await b.next((m) => m.t === 'joined');
  const room = server.rooms.get(joined.match);
  const { world } = room.mission;
  for (const e of room.mission.enemies.values()) Object.assign(world.fighters.get(e.id).vitals, { hp: 0, dead: true });
  const before = { ...world.bodies.get('ann') };
  a.ws.terminate();
  assert.ok(await b.next((m) => m.t === 'seats' && m.seats.some((s) => s.id === 'ann' && s.away)), 'the crew is told');
  await pause(700); // 2.8 s of the mission
  const now = world.bodies.get('ann');
  const walked = Math.hypot(now.x - before.x, now.z - before.z);
  assert.ok(walked > 1.5, `the autopilot walked ann ${walked.toFixed(1)} m towards the crates`);
  const snap = await b.next((m) => m.t === 'snap' && m.view);
  assert.deepEqual(snap.view.away, ['ann']);
  b.ws.close();
  await server.close();
});

test('a connection that stops answering is noticed, and its seat waits for the player', async () => {
  const { server, url } = await start({ heartbeatMs: 60 });
  const a = await signIn(url, 'ann', { socket: { autoPong: false } }); // alive, but deaf to pings: a dead network
  a.send({ t: 'join', mode: 'tdm' });
  const joined = await a.next((m) => m.t === 'joined');
  const room = server.rooms.get(joined.match);
  assert.ok(await until(() => room.clients.get('ann')?.away, 2000), 'cut after unanswered pings; the seat waits');
  assert.equal(room.match.seats.get('ann').kind, 'player');
  await server.close();
});

test('the browser\'s source reconnects by itself and sits back down; after a reload it does too; leaving gives the seat up', async () => {
  const { server, url } = await start({ speed: 1 });
  const kept = new Map();
  const storage = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) };
  const statuses = [];
  const source = createOnlineSource({ url, token: 'ann', name: 'Ann', body: 'huntress', mode: 'story', room: 'new', storage, onChange: (s) => statuses.push(s) });
  assert.ok(await until(() => source.status === 'ready'));
  const roomId = [...server.rooms.values()].find(r => r.mission)?.id;
  const { code } = source;
  assert.match(code, /^[A-HJ-NP-Z]{5}$/);
  // the network goes: the server's end of the socket is cut
  [...server.clients].find((c) => c.id === 'ann').ws.terminate();
  assert.ok(await until(() => statuses.includes('reconnecting')), 'it notices');
  assert.ok(await until(() => source.status === 'ready' && server.rooms.get(roomId).clients.get('ann')?.away === false, 4000), 'and sits back down by itself');
  assert.equal(source.code, code, 'in the same crew');
  assert.equal(source.meId, 'ann');
  assert.equal(server.rooms.size, 6, 'no new room beyond five official arenas and this crew');
  // a reload: the page goes without leaving; the new page finds the key in the tab's storage
  source.dispose({ keepSeat: true });
  assert.ok(kept.get('duelist.resume'), 'the key is kept in the tab');
  const reloaded = createOnlineSource({ url, token: 'ann', name: 'Ann', body: 'huntress', mode: 'story', room: 'new', storage });
  assert.ok(await until(() => reloaded.status === 'ready'));
  assert.equal(reloaded.code, code, 'the same crew, not a new room');
  assert.equal(server.rooms.size, 6);
  assert.equal(server.rooms.get(roomId).clients.get('ann').away, false);
  // back to the menu: the seat is given up and the key forgotten
  reloaded.dispose();
  assert.ok(await until(() => !server.rooms.get(roomId)?.clients.has('ann')), 'the seat is given up');
  assert.equal(kept.get('duelist.resume'), undefined);
  await server.close();
});
