/* global performance, setTimeout, setInterval, clearInterval, fetch */
// Duelist Adventure's match server over real WebSockets: sign-in, joining (a player takes a bot's seat; Join
// finds the match that has players), snapshots, the server moving a player by its input, the press budget,
// and a leaving player's seat going back to a bot. The server clock runs 4x fast to skip the countdown
// (the prediction tests run it at its real speed, against a browser's predictor).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createDuelistServer } from '../server/duelist/server.mjs';
import { PROTOCOL, WS_PATH, MAX_WAITING_INPUTS, QUICKPLAY_MODES, encodeInput, sanitizeInput } from '../src/components/duelist/net/protocol.mjs';
import { createPredictor } from '../src/components/duelist/net/predict.mjs';
import { INPUT, xpForLevel } from '../src/components/duelist/core/index.mjs';
import { createProgressStore } from '../server/duelist/progress.mjs';

const SPEED = 4;
// every server a test starts is closed at the end, even when the test fails (an open one keeps node running)
const started = [];
after(async () => { for (const s of started) await s.close(); });
async function start({ speed = SPEED, ...options } = {}) {
  const server = createDuelistServer({
    host: '127.0.0.1', port: 0, clock: () => (performance.now() / 1000) * speed, ...options,
    authenticate: async (token, hello) => (token ? { id: token, name: hello.name } : null),
  });
  const close = server.close;
  let closed = false;
  server.close = async () => { if (closed) return; closed = true; await close(); };
  started.push(server);
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
  a.send({ t: 'join', mode: 'football' });
  const joined = await a.next((m) => m.t === 'joined');
  assert.equal(joined.mode, 'football');
  assert.ok(joined.replaced, 'took a bot\'s seat');
  assert.equal(joined.seats.length, 8);
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

test('two Capture the Flag players join the same public match and share the updated roster', async () => {
  const { server, url } = await start();
  const firstPlayer = await player(url, 'ctf-one');
  const secondPlayer = await player(url, 'ctf-two');
  firstPlayer.send({ t: 'join', mode: 'ctf' });
  const first = await firstPlayer.next(m => m.t === 'joined');
  assert.equal(first.mode, 'ctf');
  assert.ok(first.replaced, 'the first player takes a bot seat');
  secondPlayer.send({ t: 'join', mode: 'ctf' });
  const second = await secondPlayer.next(m => m.t === 'joined');
  assert.equal(second.match, first.match, 'the second CTF player joins the existing human-occupied room');
  assert.equal(second.seats.filter(s => s.kind === 'player').length, 2);
  assert.equal(second.seats.filter(s => s.kind === 'bot').length, 6);
  const roster = await firstPlayer.next(m => m.t === 'seats' && m.seats.filter(s => s.kind === 'player').length === 2);
  assert.deepEqual(roster.seats.filter(s => s.kind === 'player').map(s => s.id).sort(), ['ctf-one', 'ctf-two']);
  firstPlayer.ws.close();
  secondPlayer.ws.close();
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

test('an online Escort room sends the authoritative carrier and player role', async () => {
  const { server, url } = await start();
  let playerConnection;
  try {
    playerConnection = await player(url, 'escort-test');
    playerConnection.send({ t: 'join', mode: 'escort' });
    const joined = await playerConnection.next(message => message.t === 'joined');
    assert.equal(joined.mode, 'escort');
    const snapshot = await playerConnection.next(message => message.t === 'snap' && message.view?.escort);
    assert.ok(Number.isFinite(snapshot.escortDistance));
    assert.ok(['red', 'blue'].includes(snapshot.view.me.team));
    assert.equal(snapshot.view.escort.distance, snapshot.escortDistance);
  } finally {
    playerConnection?.ws.close();
    await server.close();
  }
});

test('the lobby lists live matches for the menus: mode and head counts, no names or account ids', async () => {
  const { server, url } = await start();
  const http = url.replace('ws://', 'http://').replace(WS_PATH, '/lobby');
  const starters = (await (await fetch(http)).json()).matches;
  assert.deepEqual(starters.map(m => m.mode).sort(), ['control', 'ctf', 'duel', 'escort', 'ffa', 'football', 'practice', 'tdm']);
  for (const room of starters) {
    assert.equal(room.publicRoom, true, 'every mode gets a permanent official server');
    assert.equal(room.players, 0);
    assert.equal(room.bots, room.seats, 'all unoccupied slots initially belong to bots');
  }
  const a = await player(url, 'eve-account-123');
  a.send({ t: 'join', mode: 'tdm' });
  const joined = await a.next((m) => m.t === 'joined');
  const res = await fetch(http);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const text = await res.text();
  const { matches } = JSON.parse(text);
  assert.equal(matches.length, starters.length, 'joining does not create a duplicate public server');
  const selected = matches.find(m => m.id === joined.match);
  assert.deepEqual({ id: selected.id, mode: selected.mode, players: selected.players, bots: selected.bots, seats: selected.seats, open: selected.open },
    { id: joined.match, mode: 'tdm', players: 1, bots: 7, seats: 8, open: true });
  assert.ok(!text.includes('eve-account-123') && !text.includes('EVE-ACCOUNT'), 'no player ids or names');
  a.ws.close();
  await server.close();
});

test('Online quick-match chooses only TDM, CTF or Three-Point Control and lets bots fill seats', async () => {
  const { server, url } = await start();
  assert.deepEqual([...QUICKPLAY_MODES].sort(), ['control', 'ctf', 'tdm']);
  const opened = [];
  for (let index = 0; index < 12; index++) {
    const client = await player(url, 'quick-' + index);
    opened.push(client);
    client.send({ t: 'join', mode: 'online' });
    const joined = await client.next(message => message.t === 'joined');
    assert.ok(QUICKPLAY_MODES.includes(joined.mode), `random mode was ${joined.mode}`);
    assert.equal(server.rooms.get(joined.match).mode, joined.mode);
    assert.ok(joined.replaced, 'the player replaces a bot in the selected match');
    assert.ok(joined.seats.some(seat => seat.kind === 'bot'));
  }
  const rogue = await player(url, 'quick-invalid');
  opened.push(rogue);
  rogue.send({ t: 'join', mode: 'online', matchId: 'm1' });
  assert.equal((await rogue.next(message => message.t === 'error')).code, 'room',
    'random mode cannot be overridden by a caller-selected server id');
  for (const client of opened) client.ws.close();
  await server.close();
});

test('Three-Point Control reports its objective positions and 0-100% team score over WebSocket', async () => {
  const { server, url } = await start();
  const participant = await player(url, 'point-tester');
  participant.send({ t: 'join', mode: 'control' });
  const joined = await participant.next(message => message.t === 'joined');
  assert.equal(joined.mode, 'control');
  const snap = await participant.next(message => message.t === 'snap' && message.view?.mode === 'control');
  assert.deepEqual(snap.view.controlPoints.map(point => point.id), ['A', 'B', 'C']);
  assert.equal(snap.view.scoreToWin, 100);
  assert.deepEqual(snap.view.teamScores, { red: 0, blue: 0 });
  assert.ok(snap.view.controlPoints.every(point => point.owner === null));
  participant.ws.close();
  await server.close();
});

test('a selected public server accepts humans, removes exactly one bot each and rejects stale or mismatched IDs', async () => {
  const { server, url } = await start();
  const http = url.replace('ws://', 'http://').replace(WS_PATH, '/lobby');
  const initial = (await (await fetch(http)).json()).matches;
  const tdm = initial.find(m => m.mode === 'tdm');
  const duel = initial.find(m => m.mode === 'duel');
  assert.ok(tdm?.id && duel?.id, 'both official arenas are advertised');
  const a = await player(url, 'alice');
  const b = await player(url, 'bob');

  b.send({ t: 'join', mode: 'tdm', matchId: duel.id });
  assert.equal((await b.next(m => m.t === 'error')).code, 'room', 'cannot join a different mode using a room id');
  b.send({ t: 'join', mode: 'tdm', matchId: 'm999999' });
  assert.equal((await b.next(m => m.t === 'error')).code, 'room', 'cannot join a stale server id');
  a.send({ t: 'join', mode: 'tdm', matchId: tdm.id });
  const first = await a.next(m => m.t === 'joined');
  assert.equal(first.match, tdm.id);
  assert.equal(first.seats.filter(s => s.kind === 'bot').length, tdm.seats - 1);
  b.send({ t: 'join', mode: 'tdm', matchId: tdm.id });
  const second = await b.next(m => m.t === 'joined');
  assert.equal(second.match, tdm.id);
  assert.equal(second.seats.filter(s => s.kind === 'bot').length, tdm.seats - 2);
  const live = (await (await fetch(http)).json()).matches.find(m => m.id === tdm.id);
  assert.equal(live.players, 2);
  assert.equal(live.bots, tdm.seats - 2);
  a.send({ t: 'leave' });
  await a.next(m => m.t === 'left');
  const back = (await (await fetch(http)).json()).matches.find(m => m.id === tdm.id);
  assert.equal(back.players, 1);
  assert.equal(back.bots, tdm.seats - 1);
  a.ws.close();
  b.ws.close();
  await server.close();
});

test('every full Duel server creates exactly one spare bot-filled server automatically', async () => {
  const { server, url } = await start();
  const http = url.replace('ws://', 'http://').replace(WS_PATH, '/lobby');
  const first = (await (await fetch(http)).json()).matches.find(r => r.mode === 'duel');
  assert.equal(first.seats, 2);
  const a = await player(url, 'arena-a');
  const b = await player(url, 'arena-b');
  for (const client of [a, b]) {
    client.send({ t: 'join', mode: 'duel', matchId: first.id });
    assert.equal((await client.next(m => m.t === 'joined')).match, first.id);
  }
  const two = (await (await fetch(http)).json()).matches.filter(r => r.mode === 'duel');
  assert.equal(two.length, 2, 'a second bot-filled room appears as soon as the first becomes full');
  const spare = two.find(r => r.id !== first.id);
  assert.equal(spare.players, 0);
  assert.equal(spare.bots, spare.seats);
  const c = await player(url, 'arena-c');
  c.send({ t: 'join', mode: 'duel' });
  assert.equal((await c.next(m => m.t === 'joined')).match, spare.id, 'newcomer takes a bot seat in the spare room');
  const after = (await (await fetch(http)).json()).matches.filter(r => r.mode === 'duel');
  assert.equal(after.length, 2, 'only one spare is maintained, not a duplicate for every join');
  for (const client of [a, b, c]) client.ws.close();
  await server.close();
});

test('public co-op can be hosted and joined by room id, private rooms cannot be guessed', async () => {
  const { server, url } = await start();
  const http = url.replace('ws://', 'http://').replace(WS_PATH, '/lobby');
  const owner = await player(url, 'crew-owner');
  owner.send({ t: 'join', mode: 'story', create: true, open: true });
  const pub = await owner.next(m => m.t === 'joined');
  assert.equal(pub.mode, 'story');
  assert.equal(server.rooms.get(pub.match).open, true);
  const listed = (await (await fetch(http)).json()).matches.find(r => r.id === pub.match);
  assert.equal(listed.mode, 'story');
  const friend = await player(url, 'crew-friend');
  friend.send({ t: 'join', mode: 'story', matchId: pub.match });
  const joined = await friend.next(m => m.t === 'joined');
  assert.equal(joined.match, pub.match);
  assert.equal(joined.seats.filter(s => s.kind === 'player').length, 2);
  const privateOwner = await player(url, 'private-owner');
  privateOwner.send({ t: 'join', mode: 'story', create: true });
  const privateRoom = await privateOwner.next(m => m.t === 'joined');
  assert.equal(server.rooms.get(privateRoom.match).open, false);
  const outsider = await player(url, 'outsider');
  outsider.send({ t: 'join', mode: 'story', matchId: privateRoom.match });
  assert.equal((await outsider.next(m => m.t === 'error')).code, 'room', 'private rooms cannot be joined by ID');
  outsider.send({ t: 'join', mode: 'story', code: privateRoom.code });
  assert.equal((await outsider.next(m => m.t === 'joined')).match, privateRoom.match, 'valid invite code still works');
  for (const client of [owner, friend, privateOwner, outsider]) client.ws.close();
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
  assert.equal((await (await fetch(http)).json()).matches.filter(m => m.mode === 'story').length, 0, 'private story rooms are not listed beside public arenas');
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
  assert.deepEqual(matches.filter(m => m.mode === 'story').map((m) => [m.id, m.mode, m.name, m.players, m.seats, m.open]), [[joined.match, 'story', 'Contraband', 1, 4, true]]);
  assert.equal(matches.filter(m => m.publicRoom).length, 8, 'the public modes remain listed during story missions');
  const b = await player(url, 'ben');
  b.send({ t: 'join', mode: 'story' });
  assert.equal((await b.next((m) => m.t === 'joined')).match, joined.match, 'the crew that has room');
  const c = await player(url, 'cy');
  c.send({ t: 'join', mode: 'any' });
  const joinedC = await c.next((m) => m.t === 'joined');
  assert.notEqual(joinedC.match, joined.match);
  assert.equal(joinedC.mode, 'duel', 'the Join button looks for a match, not a mission');
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

const until = async (check, ms = 3000) => {
  const end = performance.now() + ms;
  while (performance.now() < end) { if (check()) return true; await new Promise((r) => setTimeout(r, 10)); }
  return check();
};

test('a crew plays the mission it asked for; open crews are matched per mission; a code joins whatever its crew plays', async () => {
  const { server, url } = await start();
  const http = url.replace('ws://', 'http://').replace(WS_PATH, '/lobby');
  const a = await player(url, 'ann');
  a.send({ t: 'join', mode: 'story', mission: 'saltmarch' });
  const joined = await a.next((m) => m.t === 'joined');
  assert.equal(joined.mission, 'saltmarch');
  assert.ok(joined.seats.some((s) => s.kind === 'enemy' && s.type === 'refugee'), 'the refuge\'s defenders in the yard');
  const b = await player(url, 'ben');
  b.send({ t: 'join', mode: 'story', mission: 'contraband' });
  const joinedB = await b.next((m) => m.t === 'joined');
  assert.equal(joinedB.mission, 'contraband');
  assert.notEqual(joinedB.match, joined.match, 'an open crew of another mission is not this one');
  const c = await player(url, 'cy');
  c.send({ t: 'join', mode: 'story', mission: 'contraband', code: joined.code });
  const joinedC = await c.next((m) => m.t === 'joined');
  assert.equal(joinedC.match, joined.match);
  assert.equal(joinedC.mission, 'saltmarch', 'a friend\'s code: their mission');
  const { matches } = await (await fetch(http)).json();
  // the lobby also lists the server's own bot-filled rooms for the competitive modes: only the crews here
  assert.deepEqual(matches.filter((m) => m.mission).map((m) => [m.mission, m.name, m.players]).sort(), [['contraband', 'Contraband', 1], ['saltmarch', 'Saltmarch', 2]]);
  for (const p of [a, b, c]) p.ws.close();
  await server.close();
});

test('a crew that finishes Contraband goes on to Saltmarch together', async () => {
  const { server, url } = await start({ speed: 1, missionAgainSeconds: 0.3 });
  const a = await player(url, 'ann');
  a.send({ t: 'join', mode: 'story', create: true });
  const joined = await a.next((m) => m.t === 'joined');
  assert.equal(joined.mission, 'contraband');
  const room = server.rooms.get(joined.match);
  room.mission.phase = 'complete';
  const done = await a.next((m) => m.t === 'snap' && m.view?.phase === 'complete');
  assert.deepEqual(done.view.next, { id: 'saltmarch', title: 'Saltmarch' }, 'the view says what comes next');
  const next = await a.next((m) => m.t === 'joined' && m.rematch, 3000);
  assert.equal(next.mission, 'saltmarch');
  assert.equal(next.match, joined.match, 'the same room, the same code');
  assert.equal(next.code, joined.code);
  assert.equal(room.mission.id, 'saltmarch');
  a.ws.close();
  await server.close();
});

test('Saltmarch\'s ally is a seat: the teacher is sent as an ally, in the teacher\'s body, and snapshots carry her', async () => {
  const { server, url } = await start({ speed: 1 });
  const a = await player(url, 'ann', 'maskedWarrior');
  a.send({ t: 'join', mode: 'story', mission: 'saltmarch', create: true });
  const joined = await a.next((m) => m.t === 'joined');
  const { mission } = server.rooms.get(joined.match);
  // through the first three stages by their own conditions: the lock opened, the keeper heard, the bells rung
  mission.flags['done:lockConsole'] = true;
  assert.ok(await until(() => mission.stageIndex === 1));
  mission.flags.heard = true;
  mission.comms.length = 0;
  assert.ok(await until(() => mission.stageIndex === 2));
  mission.counters.bells = 3;
  assert.ok(await until(() => mission.stageIndex === 3));
  const seats = await a.next((m) => m.t === 'seats' && m.seats.some((s) => s.kind === 'ally'));
  const arden = seats.seats.find((s) => s.kind === 'ally');
  assert.deepEqual([arden.name, arden.tag, arden.type, arden.body], ['Arden Vale', 'arden', 'willUser', 'huntress']);
  assert.deepEqual(arden.max, [190, 170, 140, 50], 'with the teacher\'s own strength');
  const wardens = seats.seats.filter((s) => s.kind === 'enemy' && s.type === 'warden');
  assert.ok(wardens.length >= 1 && wardens.every((w) => w.body === undefined), 'wardens wear their own builds, not the teacher\'s');
  const snap = await a.next((m) => m.t === 'snap' && m.fighters.some((f) => f.id === arden.id));
  assert.equal(snap.fighters.find((f) => f.id === arden.id).tm, 'crew');
  a.ws.close();
  await server.close();
});

test('classes over the wire: join as a class, snapshots carry it, a change waits for the next spawn, a bad one is refused', async () => {
  const { server, url } = await start();
  const a = await player(url, 'ann');
  a.send({ t: 'join', mode: 'tdm', cls: 'healer' });
  await a.next((m) => m.t === 'joined');
  const first = await a.next((m) => m.t === 'snap' && m.fighters.some((f) => f.id === 'ann'));
  assert.equal(first.fighters.find((f) => f.id === 'ann').c, 'healer', 'the class asked for at the join');
  assert.ok(first.fighters.every((f) => ['warrior', 'duelist', 'assassin', 'healer'].includes(f.c)), 'the bots have classes too');
  // before the fight a change is taken, and applied as the fight starts; an unknown class is refused
  a.send({ t: 'class', id: 'assassin' });
  const taken = await a.next((m) => m.t === 'class' && m.pending === 'assassin'); // (an answered message stays in the inbox: ask for each by what it says)
  assert.deepEqual([taken.ok, taken.pending], [true, 'assassin']);
  a.send({ t: 'class', id: 'wizard' });
  const refused = await a.next((m) => m.t === 'class' && m.reason === 'unknown-class');
  assert.deepEqual([refused.ok, refused.reason], [false, 'unknown-class']);
  let seq = 0;
  const inputs = setInterval(() => a.send({ t: 'input', s: ++seq, m: [0, 0] }), 20);
  try {
    const live = await a.next((m) => m.t === 'snap' && m.view?.phase === 'live' && m.own && m.fighters.find((f) => f.id === 'ann')?.c === 'assassin', 15000);
    assert.equal(live.own.cl, 'assassin', 'the player\'s own state says so');
    assert.equal(live.own.w, 'staff', 'with the class\'s weapon');
    assert.deepEqual([live.view.me.classId, live.view.me.specialMeter], ['assassin', 0], 'and the view carries the class and its meter');
    // standing in the fight, a change has to wait for a fall
    a.send({ t: 'class', id: 'warrior' });
    const later = await a.next((m) => m.t === 'class' && m.reason === 'alive-in-match');
    assert.deepEqual([later.ok, later.reason], [false, 'alive-in-match']);
  } finally {
    clearInterval(inputs);
  }
  await server.close();
});

test('online, a class level is what the server keeps for the account, whatever the browser says', async () => {
  const progress = createProgressStore();
  progress.add('ann', 'assassin', xpForLevel(10));
  const { url } = await start({ progress });
  const a = await player(url, 'ann');
  // a browser that claims a level, EXP or progress of its own is simply not listened to
  a.send({ t: 'join', mode: 'tdm', cls: 'assassin', level: 20, lv: 20, xp: 999999, progress: { assassin: 999999 } });
  await a.next((m) => m.t === 'joined');
  const b = await player(url, 'bob');
  b.send({ t: 'join', mode: 'tdm', cls: 'assassin' });
  await b.next((m) => m.t === 'joined');
  let seq = 0;
  const inputs = setInterval(() => { seq += 1; a.send({ t: 'input', s: seq, m: [0, 0], lv: 20 }); b.send({ t: 'input', s: seq, m: [0, 0] }); }, 20);
  try {
    const mine = await a.next((m) => m.t === 'snap' && m.own && m.view?.me, 15000);
    assert.equal(mine.own.lv, 10, 'the fighter is at the level the server has');
    assert.deepEqual([mine.view.me.level, mine.view.me.xp, mine.view.me.progress.assassin], [10, xpForLevel(10), xpForLevel(10)]);
    const theirs = await b.next((m) => m.t === 'snap' && m.own && m.view?.me, 15000);
    assert.deepEqual([theirs.own.lv, theirs.view.me.level, theirs.view.me.xp], [1, 1, 0], 'someone new starts at level 1');
    assert.ok(!a.inbox.some((m) => m.t === 'snap' && (m.events || []).some((e) => e.type === 'xp')), 'what others earn is not broadcast');
  } finally { clearInterval(inputs); }
});


test('continuous permanent arenas advance without players and reset under the same room ID', async () => {
  const { server } = await start({ speed: 1, continuousPublicRooms: true });
  try {
    const rooms = [...server.rooms.values()].filter(room => room.publicRoom);
    assert.ok(rooms.length >= 7);
    const initial = rooms.map(room => room.match.world.time);
    await new Promise(resolve => setTimeout(resolve, 200));
    rooms.forEach((room, i) => assert.ok(room.match.world.time > initial[i], room.mode));
    const room = rooms.find(room => room.mode === 'duel');
    const original = room.match;
    const id = room.id;
    // Simulate completion and an elapsed intermission without a real-time 12s wait.
    original.phase = 'over';
    room.overAt = performance.now() / 1000 - 13;
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(server.rooms.get(id), room);
    assert.notEqual(room.match, original);
    assert.equal(room.clients.size, 0);
    assert.equal(room.match.phase, 'countdown');
    assert.equal(room.effects.length, 0);
  } finally {
    await server.close();
  }
});
