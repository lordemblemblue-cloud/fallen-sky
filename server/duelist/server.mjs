/* global performance, setInterval, clearInterval */
// Duelist Adventure's match server: one Node process, many matches, each run by the same rules the browser
// practises with (src/components/duelist/sim/match.mjs). The server is the authority: it steps every match
// at 60 Hz, decides every hit, and sends each player 20 snapshots a second. Players only send commands,
// checked and rate-limited here (a modified client can press buttons faster than the rules allow, never
// more than the rules allow).
//
// Joining: a mode picks the busiest match of that mode with room (a bot seat to take, or a free seat), or
// starts one filled with bots; 'any' picks the busiest match of any mode that has players in it (or starts a
// free for all). The joining player takes a bot's place; a leaving player's seat goes back to a bot. A
// finished match starts again after a short pause with the same players.
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createMatch, stepMatch, joinMatch, leaveMatch, matchView, MODES } from '../../src/components/duelist/sim/match.mjs';
import { createInputRateLimiter } from '../../src/components/duelist/core/index.mjs';
import { PROTOCOL, WS_PATH, TICK_HZ, SNAPSHOT_EVERY, VIEW_EVERY, ONLINE_MODES, MAX_MESSAGE_BYTES, MAX_MESSAGES_PER_SECOND, ABUSE_MESSAGES_PER_SECOND, BODY_IDS,
  sanitizeInput, encodeFighter } from '../../src/components/duelist/net/protocol.mjs';

const STEP = 1 / TICK_HZ;
const REMATCH_AFTER = 12; // seconds after a match ends
const IDLE_ROOM_SECONDS = 60; // a match with no players closes after this
const IDLE_PLAYER_SECONDS = 180; // no input for this long: out of the match

export function createDuelistServer({ authenticate, host = '0.0.0.0', port = 0, allowedOrigins = null, botLevel = 'duelist',
  clock = () => performance.now() / 1000, log = () => {} } = {}) {
  if (typeof authenticate !== 'function') throw new TypeError('the Duelist server needs a token verifier');
  const rooms = new Map(); // match id -> room
  const clients = new Set();
  let nextRoom = 1;
  const http = createServer((req, res) => {
    if (req.url === '/status') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL, rooms: rooms.size, players: [...clients].filter((c) => c.room).length }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  http.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    const origin = req.headers.origin || '';
    if (path !== WS_PATH || (allowedOrigins && !allowedOrigins.includes(origin))) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const send = (client, message) => { if (client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(message)); };
  const humansIn = (room) => [...room.match.seats.values()].filter((s) => s.kind === 'player').length;
  const hasRoom = (room) => room.match.phase !== 'over' && ([...room.match.seats.values()].some((s) => s.kind === 'bot') || room.match.seats.size < room.match.capacity);
  const seatsOf = (room) => [...room.match.seats.values()].map((s) => ({ id: s.id, name: s.name, team: s.team, kind: s.kind, body: room.bodies.get(s.id) || BODY_IDS[0] }));

  function openRoom(mode) {
    const id = `m${nextRoom++}`;
    const match = createMatch({ mode, seed: nextRoom * 7919 + Math.floor(clock() * 1000) % 100000, botLevel });
    const room = { id, mode, match, clients: new Map(), bodies: new Map(), ticks: 0, snaps: 0, effects: [], events: [], emptySince: clock(), overAt: null };
    let k = 0;
    for (const s of match.seats.values()) room.bodies.set(s.id, BODY_IDS[k++ % BODY_IDS.length]);
    rooms.set(id, room);
    log('room', id, mode);
    return room;
  }

  function pickRoom(mode) {
    const pool = [...rooms.values()].filter((r) => hasRoom(r) && (mode === 'any' ? humansIn(r) > 0 : r.mode === mode));
    pool.sort((a, b) => humansIn(b) - humansIn(a) || a.id.localeCompare(b.id, undefined, { numeric: true }));
    return pool[0] || openRoom(mode === 'any' ? 'ffa' : mode);
  }

  function enter(client, mode) {
    if (client.room) leave(client);
    const room = pickRoom(mode);
    const result = joinMatch(room.match, { id: client.id, name: client.name });
    if (!result.ok) { send(client, { t: 'error', code: 'full', message: 'That match is full.' }); return; }
    room.bodies.set(client.id, client.body);
    if (result.replaced) room.bodies.delete(result.replaced);
    // a bot that replaced a leaving player needs a body too
    for (const s of room.match.seats.values()) if (!room.bodies.has(s.id)) room.bodies.set(s.id, BODY_IDS[room.bodies.size % BODY_IDS.length]);
    room.clients.set(client.id, client);
    client.room = room;
    client.lastInputAt = clock();
    send(client, { t: 'joined', match: room.id, mode: room.mode, you: client.id, team: result.team, replaced: result.replaced, seats: seatsOf(room) });
    for (const other of room.clients.values()) if (other !== client) send(other, { t: 'seats', seats: seatsOf(room) });
    log('join', client.id, room.id, result.replaced ? `replacing ${result.replaced}` : '');
  }

  function leave(client) {
    const room = client.room;
    if (!room) return;
    room.clients.delete(client.id);
    leaveMatch(room.match, client.id);
    room.bodies.delete(client.id);
    for (const s of room.match.seats.values()) if (!room.bodies.has(s.id)) room.bodies.set(s.id, BODY_IDS[room.bodies.size % BODY_IDS.length]);
    client.room = null;
    send(client, { t: 'left' });
    for (const other of room.clients.values()) send(other, { t: 'seats', seats: seatsOf(room) });
    if (!room.clients.size) room.emptySince = clock();
  }

  function rematch(room) {
    const players = [...room.clients.values()];
    room.match = createMatch({ mode: room.mode, seed: Math.floor(clock() * 1000) % 1000003, botLevel });
    room.bodies = new Map();
    let k = 0;
    for (const s of room.match.seats.values()) room.bodies.set(s.id, BODY_IDS[k++ % BODY_IDS.length]);
    room.overAt = null;
    room.effects = [];
    room.events = [];
    for (const client of players) {
      const result = joinMatch(room.match, { id: client.id, name: client.name });
      room.bodies.set(client.id, client.body);
      if (result.replaced) room.bodies.delete(result.replaced);
      send(client, { t: 'joined', match: room.id, mode: room.mode, you: client.id, team: result.team, replaced: result.replaced, seats: seatsOf(room), rematch: true });
    }
  }

  function snapshot(room) {
    const { match } = room;
    const { world } = match;
    room.snaps += 1;
    const withView = room.snaps % VIEW_EVERY === 0 || room.events.length > 0;
    const flags = match.flags ? Object.fromEntries(Object.entries(match.flags).map(([t, f]) => [t, { state: f.state, carrier: f.carrier, x: f.x, z: f.z }])) : null;
    const projectiles = world.projectiles.map((p) => ({ id: p.id, x: p.x, z: p.z, d: [p.dir.x, p.dir.z], move: p.move }));
    const effects = room.effects;
    const events = room.events;
    room.effects = [];
    room.events = [];
    for (const client of room.clients.values()) {
      const fighters = [];
      for (const f of world.fighters.values()) fighters.push(encodeFighter(f, world.bodies.get(f.id), { own: f.id === client.id }));
      send(client, { t: 'snap', time: Math.round(world.time * 1000) / 1000, ack: client.lastSeq, fighters, projectiles, flags, effects, events,
        view: withView ? matchView(match, client.id) : undefined });
    }
  }

  // the clock: every match advances in fixed 60 Hz steps, whatever the timer's jitter
  let last = clock();
  let carry = 0;
  const timer = setInterval(() => {
    const now = clock();
    carry = Math.min(0.25, carry + (now - last));
    last = now;
    while (carry >= STEP) {
      carry -= STEP;
      for (const room of rooms.values()) {
        const inputs = {};
        for (const client of room.clients.values()) {
          inputs[client.id] = { ...client.input, presses: client.presses.splice(0) };
        }
        const { effects, events } = stepMatch(room.match, STEP, inputs);
        if (effects.length) room.effects.push(...effects);
        if (events.length) room.events.push(...events);
        room.ticks += 1;
        if (room.ticks % SNAPSHOT_EVERY === 0) snapshot(room);
        if (room.match.phase === 'over' && room.overAt === null) room.overAt = now;
        if (room.overAt !== null && now - room.overAt > REMATCH_AFTER && room.clients.size) rematch(room);
      }
    }
    for (const [id, room] of rooms) if (!room.clients.size && now - room.emptySince > IDLE_ROOM_SECONDS) { rooms.delete(id); log('room closed', id); }
    for (const client of clients) if (client.room && now - client.lastInputAt > IDLE_PLAYER_SECONDS) { leave(client); send(client, { t: 'error', code: 'idle', message: 'Left the match after a long time without input.' }); }
  }, 4);

  wss.on('connection', (ws) => {
    const client = { ws, id: null, name: 'Duelist', body: BODY_IDS[0], room: null, input: {}, presses: [], lastSeq: -1, lastInputAt: clock(),
      limiter: createInputRateLimiter(), budget: { since: clock(), count: 0 }, signingIn: false };
    clients.add(client);
    ws.on('message', async (data) => {
      const now = clock();
      if (now - client.budget.since >= 1) { client.budget.since = now; client.budget.count = 0; }
      client.budget.count += 1;
      if (client.budget.count > ABUSE_MESSAGES_PER_SECOND) { ws.close(4429, 'too many messages'); return; }
      if (client.budget.count > MAX_MESSAGES_PER_SECOND) return; // over budget: ignored, not punished
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'hello') {
        if (client.id || client.signingIn) return;
        client.signingIn = true;
        let user = null;
        try { user = await authenticate(typeof msg.token === 'string' ? msg.token : '', msg); } catch { user = null; }
        if (!user?.id) { send(client, { t: 'error', code: 'auth', message: 'Sign in to play online.' }); ws.close(4401, 'not signed in'); return; }
        // one connection per account: an older one is closed
        for (const other of clients) if (other !== client && other.id === String(user.id)) { leave(other); other.ws.close(4409, 'signed in elsewhere'); }
        client.id = String(user.id);
        client.name = String(user.name || msg.name || 'Duelist').replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 20) || 'Duelist';
        client.body = BODY_IDS.includes(msg.body) ? msg.body : BODY_IDS[0];
        send(client, { t: 'welcome', id: client.id, name: client.name, protocol: PROTOCOL });
        return;
      }
      if (!client.id) return;
      if (msg.t === 'lobby') {
        send(client, { t: 'lobby', matches: [...rooms.values()].map((r) => ({ id: r.id, mode: r.mode, name: MODES[r.mode].name, players: humansIn(r),
          bots: r.match.seats.size - humansIn(r), seats: r.match.capacity, phase: r.match.phase })) });
      } else if (msg.t === 'join') {
        const mode = msg.mode === 'any' || ONLINE_MODES.includes(msg.mode) ? msg.mode : null;
        if (!mode) { send(client, { t: 'error', code: 'mode', message: 'Unknown mode.' }); return; }
        enter(client, mode);
      } else if (msg.t === 'leave') {
        leave(client);
      } else if (msg.t === 'input' && client.room) {
        const input = sanitizeInput(msg);
        if (!input || input.seq <= client.lastSeq) return;
        client.lastSeq = input.seq;
        client.lastInputAt = now;
        client.input = { move: input.move, run: input.run, sprint: input.sprint, face: input.face, strafe: input.strafe };
        for (const command of input.presses) {
          // presses beyond the input budget are dropped (guard and release always pass: they only let go)
          if (command === 'blockUp' || command === 'release' || client.limiter.allow(now)) client.presses.push(command);
        }
        if (client.presses.length > 16) client.presses.splice(0, client.presses.length - 16);
      }
    });
    ws.on('close', () => { leave(client); clients.delete(client); });
    ws.on('error', () => {});
  });

  return {
    rooms, clients,
    listen() { return new Promise((resolve) => http.listen(port, host, () => resolve(http.address()))); },
    async close() {
      clearInterval(timer);
      for (const client of clients) client.ws.terminate();
      await new Promise((resolve) => wss.close(() => resolve()));
      await new Promise((resolve) => http.close(() => resolve()));
    },
  };
}
