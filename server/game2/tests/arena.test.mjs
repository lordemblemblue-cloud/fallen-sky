import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGame2ArenaServer, MAX_PLAYERS, MAX_TEAM_PLAYERS } from '../arena.mjs';
import { RailwayGameSession } from '../../../src/components/game2/net/railway.js';

async function fixture(t, o = {}) {
  const arena = createGame2ArenaServer({
    host: '127.0.0.1', ...o,
    authenticate: async token => token.startsWith('user-') ? { id: token.slice(5) } : null,
  });
  const addr = await arena.listen();
  t.after(async () => await arena.close());
  return { arena, url: 'ws://127.0.0.1:' + addr.port + '/ws/game2', http: 'http://127.0.0.1:' + addr.port };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function eventually(test, message, timeout = 3000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (test()) return;
    await tick();
  }
  throw new Error(message);
}
function player(url, id, side = 'light', ai = 0, mapId, matchMode) {
  const peer = id + '~abc123';
  const session = new RailwayGameSession({
    selfId: peer, name: 'Character ' + id, side, ai, mapId, matchMode,
    token: 'user-' + id, url, WebSocketImpl: WebSocket,
  });
  session.received = [];
  session.onMessage = (from, body) => session.received.push({ from, body });
  return session;
}

test('two separate browser identities spawn two human players in one Railway arena', async t => {
  const { arena, url, http } = await fixture(t);
  const a = player(url, 'alice', 'light'), b = player(url, 'bob', 'dark');
  await a.start();
  assert.equal(a.state, 'live');
  assert.equal(a.isHost, true);
  assert.equal(a.roster.size, 1);
  assert.equal(arena.report().ai, 0, 'AI bot is not a replacement for other humans');

  await b.start();
  await eventually(() => a.roster.size === 2 && b.roster.size === 2, 'Both browsers must see two human fighters');
  assert.equal(b.isHost, false);
  assert.equal(a.hostId, b.hostId);
  assert.equal(arena.report().players, 2);
  assert.equal(arena.report().light, 1);
  assert.equal(arena.report().dark, 1);
  const status = await (await fetch(http + '/status')).json();
  assert.equal(status.players, 2);

  // A full per-frame position/animation packet reaches the other player.
  const snap = { k: 's', t: 1.2, f: [[a.self + ':p', 0, 'Character alice', 3, 0, 7]] };
  assert.equal(a.broadcast(snap, false), 1);
  await eventually(() => b.received.some(x => x.body.k === 's'), 'Opponent position snapshot not received');
  assert.deepEqual(b.received.find(x => x.body.k === 's').body, snap);
  assert.equal(b.received.find(x => x.body.k === 's').from, a.self);

  // Reliable saber hit and Force power messages travel through the same connection.
  const hurt = { k: 'rpc', fid: b.self + ':p', m: 'hurt', a: [25] };
  assert.equal(a.send(b.self, hurt, true), true);
  const lightning = { k: 'fx', e: 'cast', fid: a.self + ':p', id: 'lightning' };
  assert.equal(a.broadcast(lightning, true), 1);
  await eventually(() => b.received.some(x => x.body.k === 'rpc') && b.received.some(x => x.body.k === 'fx'), 'Combat events missing');
  assert.deepEqual(b.received.find(x => x.body.k === 'rpc').body, hurt);
  a.leave(); b.leave();
});

test('both tabs signed in with the same account get distinct controllable characters', async t => {
  const { url, arena } = await fixture(t);
  const a = player(url, 'same'), b = player(url, 'same');
  b.self = 'same~second9';
  const me = await a.start();
  await b.start();
  await eventually(() => a.roster.size === 2, 'Same user different tabs should both join');
  assert.equal(arena.report().players, 2);
  a.leave(); b.leave();
});

test('host disconnect elects another connected player instead of spawning a second world', async t => {
  const { url, arena } = await fixture(t);
  const a = player(url, 'alice', 'light', 1);
  const b = player(url, 'bob', 'dark');
  const c = player(url, 'charlie', 'light');
  await a.start(); await b.start(); await c.start();
  assert.equal(arena.report().ai, 1);
  assert.equal(arena.report().players, 3);
  a.leave();
  await eventually(() => b.isHost && c.hostId === b.self && b.roster.size === 2, 'Host migration failed');
  assert.equal(arena.report().players, 2);
  assert.equal(arena.report().ai, 1, 'AI setting preserved on host migration');
  const d = player(url, 'denise', 'dark');
  await d.start();
  await eventually(() => c.roster.size === 3 && b.roster.size === 3, 'New arrival must join the existing arena');
  assert.equal(d.hostId, b.self);
  b.leave(); c.leave(); d.leave();
});

test('every map is its own arena: players on another map are never seen or reached; the status counts each', async t => {
  const { url, arena, http } = await fixture(t);
  const a = player(url, 'alice', 'light', 0, 'skybridge'), b = player(url, 'bob', 'dark', 0, 'skybridge');
  const c = player(url, 'carol', 'light', 0, 'hangar'), d = player(url, 'dave', 'dark'); // no map: the original training arena
  await a.start(); await b.start(); await c.start(); await d.start();
  await eventually(() => a.roster.size === 2 && b.roster.size === 2, 'Skybridge players see each other');
  assert.equal(c.roster.size, 1, 'alone on the hangar map'); assert.equal(c.isHost, true, 'and its host');
  assert.equal(d.roster.size, 1); assert.equal(d.isHost, true);
  const snap = { k: 's', t: 1, f: [[a.self + ':p', 0, 'Character alice', 1, 0, 2]] };
  a.broadcast(snap, false); a.send(c.self, { k: 'rpc', fid: c.self + ':p', m: 'hurt', a: [25] }, true);
  await eventually(() => b.received.some(x => x.body.k === 's'), 'Snapshot within the arena');
  await tick(); await tick();
  assert.equal(c.received.length + d.received.length, 0, 'nothing crosses to another map');
  const status = await (await fetch(http + '/status')).json();
  assert.equal(status.rooms, true); assert.equal(status.arenas.skybridge.players, 2); assert.equal(status.arenas.hangar.players, 1);
  assert.equal(status.players, 1, 'top-level numbers are the training arena (for clients from before map arenas)');
  a.leave(); b.leave(); c.leave(); d.leave();
});

test('the player ceiling counts per arena', async t => {
  const { url } = await fixture(t, { maxPlayers: 2 });
  const a = player(url, 'alice', 'light', 0, 'carbon'), b = player(url, 'bob', 'dark', 0, 'carbon'), c = player(url, 'carol', 'light', 0, 'carbon'), d = player(url, 'dave', 'dark', 0, 'skybridge');
  await a.start(); await b.start(); await c.start(); await d.start();
  assert.equal(a.state, 'live'); assert.equal(b.state, 'live');
  assert.ok(c.ended, 'the third on that map is turned away'); assert.equal(d.state, 'live', 'another map still has room');
  a.leave(); b.leave(); d.leave();
});

test('an invalid token cannot create a fake fighter or hijack another account', async t => {
  const { url, arena } = await fixture(t);
  const bad = new WebSocket(url);
  await new Promise(resolve => bad.on('open', resolve));
  bad.send(JSON.stringify({ t: 'join', version: 2, peer: 'alice~abc123', token: 'invalid', side: 'dark' }));
  await eventually(() => bad.readyState === WebSocket.CLOSED, 'Unauthorized WebSocket stayed connected');
  assert.equal(arena.report().players, 0);
  const forged = new WebSocket(url);
  await new Promise(resolve => forged.on('open', resolve));
  forged.send(JSON.stringify({ t: 'join', version: 2, peer: 'alice~abc123', token: 'user-bob' }));
  await eventually(() => forged.readyState === WebSocket.CLOSED, 'Identity spoofing accepted');
  assert.equal(arena.report().players, 0);
});

test('public multiplayer: selected map and FFA/team modes are independent shared rooms', async t => {
  const { url, http } = await fixture(t);
  const a = player(url, 'alpha', 'light', 0, 'hangar', 'ffa');
  const b = player(url, 'bravo', 'dark', 0, 'hangar', 'teams');
  const c = player(url, 'charlie', 'light', 0, 'hangar', 'teams');
  const d = player(url, 'delta', 'dark', 0, 'carbon', 'teams');
  await Promise.all([a.start(), b.start(), c.start(), d.start()]);
  await eventually(() => b.roster.size === 2 && c.roster.size === 2, 'Team roster failed to assemble');
  assert.equal(a.roster.size, 1, 'FFA isolated from team fight on same map');
  assert.equal(d.roster.size, 1, 'Different map isolated from team fight');
  assert.equal(b.me.matchMode, 'teams', 'Server owns the match mode');
  const stat = await (await fetch(http + '/status')).json();
  assert.equal(stat.supports_modes, true);
  assert.equal(stat.max_players, 100);
  assert.equal(stat.max_team_players, 50);
  assert.equal(stat.arenas.hangar.players, 1);
  assert.equal(stat.team_arenas.hangar.players, 2);
  assert.equal(stat.team_arenas.hangar.light, 1);
  assert.equal(stat.team_arenas.hangar.dark, 1);
  a.leave(); b.leave(); c.leave(); d.leave();
});

test('team battle rejects same-side combat RPC, while passing opposing-team strikes', async t => {
  const { url } = await fixture(t);
  const a = player(url, 'alpha', 'light', 0, 'skybridge', 'teams');
  const b = player(url, 'bravo', 'light', 0, 'skybridge', 'teams');
  const c = player(url, 'charlie', 'dark', 0, 'skybridge', 'teams');
  await Promise.all([a.start(), b.start(), c.start()]);
  await eventually(() => a.roster.size === 3, 'Team battle roster incomplete');
  a.send(b.self, { k: 'rpc', fid: b.self + ':p', m: 'hurt', a: [100] }, true);
  a.send(c.self, { k: 'rpc', fid: c.self + ':p', m: 'hurt', a: [15] }, true);
  await eventually(() => c.received.some(x => x.body.k === 'rpc'), 'Opponent RPC missing');
  assert.equal(b.received.filter(x => x.body.k === 'rpc').length, 0, 'Friendly fire must be blocked on the server');
  a.leave(); b.leave(); c.leave();
});

test('a public match accepts 100 humans, never a 101st, with at most 50 per team', async t => {
  assert.equal(MAX_PLAYERS, 100);
  assert.equal(MAX_TEAM_PLAYERS, 50);
  const { arena, url, http } = await fixture(t);
  const fighters = Array.from({ length: 100 }, (_, i) =>
    player(url, 'teamplayer' + i, i < 50 ? 'light' : 'dark', 0, 'skybridge', 'teams'));
  // Batch connection setup so the relay has a chance to dispatch each roster update.
  for (let offset = 0; offset < 100; offset += 10) {
    await Promise.all(fighters.slice(offset, offset + 10).map(f => f.start()));
  }
  await eventually(() => arena.report().team_arenas.skybridge.players === 100, '100-player team roster did not populate', 10000);
  assert.equal(arena.report().team_arenas.skybridge.light, 50);
  assert.equal(arena.report().team_arenas.skybridge.dark, 50);
  const deniedLight = player(url, 'tooManyLight', 'light', 0, 'skybridge', 'teams');
  const deniedDark = player(url, 'tooManyDark', 'dark', 0, 'skybridge', 'teams');
  await Promise.all([deniedLight.start(), deniedDark.start()]);
  assert.ok(deniedLight.ended && deniedDark.ended, 'No team may exceed the 100-person room cap');
  const status = await (await fetch(http + '/status')).json();
  assert.equal(status.team_arenas.skybridge.players, 100);
  assert.equal(status.arenas.skybridge.players, 0, 'Team room does not consume FFA map capacity');
  fighters.forEach(f => f.leave());
});

test('FFA has an exactly 100-player ceiling and an independent map capacity', async t => {
  const { arena, url } = await fixture(t);
  const fighters = Array.from({ length: MAX_PLAYERS }, (_, i) =>
    player(url, 'ffaplayer' + i, i % 2 ? 'dark' : 'light', 0, 'hangar', 'ffa'));
  for (let offset = 0; offset < fighters.length; offset += 10) {
    await Promise.all(fighters.slice(offset, offset + 10).map(f => f.start()));
  }
  assert.equal(arena.report().arenas.hangar.players, 100);
  const denied = player(url, 'lateFFA', 'light', 0, 'hangar', 'ffa');
  await denied.start();
  assert.ok(denied.ended, '101st FFA player must be rejected');
  fighters.forEach(f => f.leave());
});
