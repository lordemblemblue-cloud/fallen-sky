import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { ONLINE_SERVER_MODES, visibleDuelistServers, serverJoinSearch, modeServerDirectory } from '../src/components/duelist/menu/serverBrowser.mjs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const room = (id, mode, players = 1, seats = 20, open = true) => ({
  id, mode, players, seats, bots: Math.max(0, 8 - players), open, phase: 'live',
});

test('Online Play only displays real, validated public battle rooms grouped by mode', () => {
  assert.deepEqual(ONLINE_SERVER_MODES, ['duel', 'ffa', 'tdm', 'ctf', 'escort', 'football', 'control']);
  const servers = visibleDuelistServers([
    room('m10', 'ctf', 4),
    room('m3', 'duel', 1, 2),
    room('m9', 'ffa', 2),
    room('m4', 'ctf', 10),
    room('m5', 'story', 3, 4),
    { ...room('m6', 'tdm'), id: '../../admin' },
    { ...room('m7', 'tdm'), seats: -1 },
  ]);
  assert.deepEqual(servers.map(item => [item.id, item.mode]),
    [['m3', 'duel'], ['m9', 'ffa'], ['m4', 'ctf'], ['m10', 'ctf']]);
  assert.deepEqual(visibleDuelistServers(servers, 'ctf').map(item => item.id), ['m4', 'm10']);
});

test('join always carries the selected mode and exact server ID; no automatic quickplay fallback', () => {
  const selected = visibleDuelistServers([room('m25', 'escort', 3)])[0];
  assert.deepEqual(serverJoinSearch(selected),
    { mode: 'escort', online: 1, matchId: 'm25', from: 'online-play' });
  assert.equal(serverJoinSearch(room('m3', 'online', 1)), null);
  assert.equal(serverJoinSearch(room('m3', 'tdm', 20, 20)), null);
  assert.equal(serverJoinSearch(room('m3', 'tdm', 5, 20, false)), null);
});

test('malformed counts, forged IDs, and stale server entries cannot create a join action', () => {
  const rows = [null, {}, room('not-a-room', 'ctf'), { ...room('m4', 'ctf'), players: -5 },
    { ...room('m5', 'ctf'), seats: NaN }, room('m6', 'story')];
  assert.equal(visibleDuelistServers(rows).some(r => r.id === 'not-a-room'), false);
  assert.equal(serverJoinSearch(rows[0]), null);
  assert.equal(serverJoinSearch(rows[1]), null);
  assert.equal(serverJoinSearch(rows[2]), null);
  assert.equal(serverJoinSearch(rows[4]), null);
  assert.equal(serverJoinSearch(rows[5]), null);
  assert.equal(visibleDuelistServers('not an array').length, 0);
});

test('browser supports 100-player advertised rooms but keeps individual duels at two', () => {
  const servers = visibleDuelistServers([
    room('m6', 'tdm', 33, 50),
    { ...room('m7', 'duel', 2, 2), open: true },
    { ...room('m8', 'control', 3), phase: 'over' },
  ]);
  assert.equal(servers[0].seats, 2);
  assert.equal(servers.find(x => x.id === 'm6').seats, 50);
  assert.equal(servers.find(x => x.id === 'm6').open, true);
  assert.equal(servers.filter(x => x.id !== 'm6').every(x => !x.open), true);
});

test('the main menu links to Online Play and no longer auto-joins/queues a selected mode', () => {
  const hub = source('src/components/duelist/menu/DuelistTemplateHub.jsx');
  const page = source('src/components/duelist/menu/OnlinePlayPage.jsx');
  const routes = source('src/routes/duelist-next.$page.jsx');
  const arena = source('src/pages/DuelistNext.jsx');
  assert.match(hub, /page: 'online-play'/);
  assert.match(hub, /BROWSE SERVERS/);
  assert.match(hub, /const chooseMode = id => setMode\(id\)/);
  assert.doesNotMatch(hub, /'QUEUE'/);
  assert.match(page, /serverJoinSearch\(room\)/);
  assert.match(page, /lobby\.online && exactServer/);
  assert.match(routes, /'online-play': OnlinePlayPage/);
  assert.match(arena, /from === 'online-play'/);
});

 test('mode directory persists offline without fabricated occupancy or joinable ids',()=>{
  const entries=modeServerDirectory(null,false);
  assert.equal(entries.length,7);
  assert.ok(entries.every(e=>e.players===null && e.capacity===null && !e.joinable && e.plannedCapacity===100));
 });
 test('mode pools aggregate only real rooms with an advertised 100-player limit',()=>{
  const entries=modeServerDirectory([{...room('m1','tdm',8,8,false),modeCapacity:100},{...room('m2','tdm',3,8),modeCapacity:100}],true,'tdm');
  assert.equal(entries[0].players,11);
  assert.equal(entries[0].capacity,100);
  assert.equal(serverJoinSearch(entries[0].joinable).matchId,'m2');
 });
