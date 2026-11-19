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
//
// The story mission (sim/mission.mjs) runs in crew rooms of up to four: a room of your own with a code to
// give to friends, a room joined by its code, or any open crew. A crew room is not listed unless it is open.
// The mission waits while nobody is in the room, and starts again a little after it is completed.
import { randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createMatch, stepMatch, joinMatch, leaveMatch, matchView, MODES } from '../../src/components/duelist/sim/match.mjs';
import { createMission, stepMission, joinMission, leaveMission, missionView } from '../../src/components/duelist/sim/mission.mjs';
import { createInputRateLimiter } from '../../src/components/duelist/core/index.mjs';
import { PROTOCOL, WS_PATH, TICK_HZ, SNAPSHOT_EVERY, VIEW_EVERY, ONLINE_MODES, STORY_MODE, CREW_SIZE, ROOM_CODE, MAX_MESSAGE_BYTES, MAX_MESSAGES_PER_SECOND,
  ABUSE_MESSAGES_PER_SECOND, BODY_IDS, sanitizeInput, encodeFighter } from '../../src/components/duelist/net/protocol.mjs';

const STEP = 1 / TICK_HZ;
const REMATCH_AFTER = 12; // seconds after a match ends
const MISSION_AGAIN_AFTER = 20; // seconds after a mission is completed before it starts again
const FALLEN_SHOWN_SECONDS = 9; // a mission's fallen stay in the snapshots this long, then are cleared away
const FULL_EVERY = 20; // snapshots: once a second everyone in a mission is sent in full
const IDLE_ROOM_SECONDS = 60; // a match with no players closes after this
const IDLE_PLAYER_SECONDS = 180; // no input for this long: out of the match
const MISSION = 'contraband';
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
const WRONG_CODES = Object.freeze({ allowed: 5, coolSeconds: 30 }); // guessing crew codes is slowed down

export function createDuelistServer({ authenticate, host = '0.0.0.0', port = 0, allowedOrigins = null, botLevel = 'duelist',
  clock = () => performance.now() / 1000, log = () => {} } = {}) {
  if (typeof authenticate !== 'function') throw new TypeError('the Duelist server needs a token verifier');
  const rooms = new Map(); // room id -> room (a match, or a crew's mission)
  const clients = new Set();
  let nextRoom = 1;
  const http = createServer((req, res) => {
    if (req.url === '/status') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL, rooms: rooms.size, players: [...clients].filter((c) => c.room).length }));
      return;
    }
    // the live matches, for the menus (public: modes and head counts, no names or ids)
    if (req.url === '/lobby') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ protocol: PROTOCOL, matches: lobby() }));
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
  const byPlayers = (a, b) => humansIn(b) - humansIn(a) || a.id.localeCompare(b.id, undefined, { numeric: true });
  const humansIn = (room) => (room.mission ? room.mission.seats.size : [...room.match.seats.values()].filter((s) => s.kind === 'player').length);
  const hasRoom = (room) => (room.mission
    ? room.open && room.mission.phase !== 'complete' && room.mission.seats.size < CREW_SIZE
    : room.match.phase !== 'over' && ([...room.match.seats.values()].some((s) => s.kind === 'bot') || room.match.seats.size < room.match.capacity));
  // a mission's people who are still part of the picture: the living, and the fallen for a few seconds
  const shownEnemies = (room) => {
    const { world } = room.mission;
    return [...room.mission.enemies.values()].filter((e) => {
      const f = world.fighters.get(e.id);
      if (!f) return false;
      if (!f.vitals.dead) return true;
      if (!room.fallenAt.has(e.id)) room.fallenAt.set(e.id, world.time);
      return world.time - room.fallenAt.get(e.id) < FALLEN_SHOWN_SECONDS;
    });
  };
  // the teacher looks like neither of the owner's two fighters the crew plays, if one is free (decided once)
  const teacherBody = (room, id) => {
    if (!room.enemyBodies.has(id)) {
      const used = new Set(room.bodies.values());
      room.enemyBodies.set(id, !used.has('huntress') ? 'huntress' : !used.has('maskedWarrior') ? 'maskedWarrior' : 'huntress');
    }
    return room.enemyBodies.get(id);
  };
  const seatsOf = (room) => (room.mission
    ? [
      ...[...room.mission.seats.values()].map((s) => ({ id: s.id, name: s.name, team: 'crew', kind: 'player', body: room.bodies.get(s.id) || BODY_IDS[0] })),
      // max: the person's full health, Will, stamina and armor (the depot's people are not built like duelists)
      ...shownEnemies(room).map((e) => {
        const { max } = room.mission.world.fighters.get(e.id).vitals;
        return { id: e.id, name: e.name, kind: 'enemy', type: e.typeId, tag: e.tag || undefined, named: e.named || undefined,
          max: [max.hp, max.will, max.stamina, max.shield], body: e.type.kind === 'duelist' ? teacherBody(room, e.id) : undefined };
      }),
    ]
    : [...room.match.seats.values()].map((s) => ({ id: s.id, name: s.name, team: s.team, kind: s.kind, body: room.bodies.get(s.id) || BODY_IDS[0] })));
  const seatKey = (room) => [...room.mission.seats.keys(), '|', ...shownEnemies(room).map((e) => e.id)].join(',');
  // live matches and open crews, busiest first: mode, players, bots, seats, phase (no names or ids beyond the room's)
  const lobby = () => [...rooms.values()].filter((r) => !r.mission || r.open)
    .map((r) => (r.mission
      ? { id: r.id, mode: STORY_MODE, name: r.mission.def.title, players: humansIn(r), bots: 0, seats: CREW_SIZE, phase: r.mission.phase === 'complete' ? 'over' : 'live', open: hasRoom(r) }
      : { id: r.id, mode: r.mode, name: MODES[r.mode].name, players: humansIn(r), bots: r.match.seats.size - humansIn(r),
        seats: r.match.capacity, phase: r.match.phase, open: hasRoom(r) }))
    .sort((a, b) => b.players - a.players || a.id.localeCompare(b.id, undefined, { numeric: true }));

  function openRoom(mode) {
    const id = `m${nextRoom++}`;
    const match = createMatch({ mode, seed: nextRoom * 7919 + Math.floor(clock() * 1000) % 100000, botLevel });
    const room = { id, mode, match, mission: null, clients: new Map(), bodies: new Map(), ticks: 0, snaps: 0, effects: [], events: [], emptySince: clock(), overAt: null };
    let k = 0;
    for (const s of match.seats.values()) room.bodies.set(s.id, BODY_IDS[k++ % BODY_IDS.length]);
    rooms.set(id, room);
    log('room', id, mode);
    return room;
  }

  const newCode = () => {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
      if (![...rooms.values()].some((r) => r.code === code)) return code;
    }
  };

  // a crew room starts with its first member in it (the depot is manned for the crew's size)
  function openCrew(client, { open }) {
    const id = `m${nextRoom++}`;
    const mission = createMission({ id: MISSION, players: [{ id: client.id, name: client.name }], seed: nextRoom * 7919 + Math.floor(clock() * 1000) % 100000 });
    const room = { id, mode: STORY_MODE, match: null, mission, code: newCode(), open, clients: new Map(), bodies: new Map(), enemyBodies: new Map(), fallenAt: new Map(),
      ticks: 0, snaps: 0, effects: [], events: [], emptySince: clock(), overAt: null, seatKey: '', fullNext: true };
    rooms.set(id, room);
    log('crew', id, open ? 'open' : 'private');
    return room;
  }

  function pickRoom(mode) {
    // the Join button ('any') looks for a match; crews are joined from the story page
    const pool = [...rooms.values()].filter((r) => hasRoom(r) && (mode === 'any' ? !r.mission && humansIn(r) > 0 : r.mode === mode));
    pool.sort(byPlayers);
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

  const crewJoined = (room, client, extra = {}) => ({ t: 'joined', match: room.id, mode: STORY_MODE, mission: room.mission.id, code: room.code, you: client.id, team: 'crew',
    seats: seatsOf(room), ...extra });

  // code: a friend's crew; create: a room of your own (not listed); neither: any open crew, or a new open one
  function enterCrew(client, { code = null, create = false } = {}) {
    const now = clock();
    let room = null;
    if (code) {
      if (client.wrongCodes.until > now) { send(client, { t: 'error', code: 'wait', message: 'Too many wrong codes. Try again in a moment.' }); return; }
      room = [...rooms.values()].find((r) => r.mission && r.code === code) || null;
      if (!room) {
        client.wrongCodes.count += 1;
        if (client.wrongCodes.count >= WRONG_CODES.allowed) client.wrongCodes = { count: 0, until: now + WRONG_CODES.coolSeconds };
        send(client, { t: 'error', code: 'code', message: 'No crew has that code.' });
        return;
      }
      if (room.mission.seats.size >= CREW_SIZE && !room.mission.seats.has(client.id)) { send(client, { t: 'error', code: 'full', message: 'That crew is full.' }); return; }
    } else if (!create) {
      room = [...rooms.values()].filter((r) => r.mission && hasRoom(r)).sort(byPlayers)[0] || null;
    }
    if (client.room) leave(client);
    if (room) joinMission(room.mission, { id: client.id, name: client.name });
    else room = openCrew(client, { open: !create });
    room.bodies.set(client.id, client.body);
    room.clients.set(client.id, client);
    client.room = room;
    client.lastInputAt = now;
    send(client, crewJoined(room, client));
    for (const other of room.clients.values()) if (other !== client) send(other, { t: 'seats', seats: seatsOf(room) });
    room.seatKey = seatKey(room);
    room.fullNext = true; // the newcomer has seen nobody yet
    log('crew join', client.id, room.id);
  }

  function leave(client) {
    const room = client.room;
    if (!room) return;
    room.clients.delete(client.id);
    if (room.mission) leaveMission(room.mission, client.id);
    else leaveMatch(room.match, client.id);
    room.bodies.delete(client.id);
    if (room.match) for (const s of room.match.seats.values()) if (!room.bodies.has(s.id)) room.bodies.set(s.id, BODY_IDS[room.bodies.size % BODY_IDS.length]);
    client.room = null;
    send(client, { t: 'left' });
    for (const other of room.clients.values()) send(other, { t: 'seats', seats: seatsOf(room) });
    if (room.mission) room.seatKey = seatKey(room);
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

  // the mission again, from the start, with whoever is still in the room
  function restartMission(room) {
    const players = [...room.clients.values()];
    room.mission = createMission({ id: room.mission.id, players: players.map((c) => ({ id: c.id, name: c.name })), seed: Math.floor(clock() * 1000) % 1000003 });
    room.overAt = null;
    room.effects = [];
    room.events = [];
    room.fallenAt = new Map();
    room.enemyBodies = new Map();
    for (const client of players) send(client, crewJoined(room, client, { rematch: true }));
    room.seatKey = seatKey(room);
    room.fullNext = true;
  }

  function snapshot(room) {
    room.snaps += 1;
    const full = !!room.fullNext || room.snaps % FULL_EVERY === 0;
    room.fullNext = false;
    const withView = room.snaps % VIEW_EVERY === 0 || room.events.length > 0 || (!!room.mission && full);
    const { world } = room.mission || room.match;
    const time = Math.round(world.time * 1000) / 1000;
    const projectiles = world.projectiles.map((p) => ({ id: p.id, x: p.x, z: p.z, d: [p.dir.x, p.dir.z], move: p.move }));
    const effects = room.effects;
    const events = room.events;
    room.effects = [];
    room.events = [];
    if (room.mission) {
      const { mission } = room;
      // The crew and whoever of the depot's people is still part of the picture; each fighter is encoded once.
      // People who have noticed nobody stand still: between full snapshots they are sent by id only (idle).
      const encoded = new Map();
      const idle = [];
      for (const id of [...mission.seats.keys(), ...shownEnemies(room).map((e) => e.id)]) {
        const f = world.fighters.get(id);
        if (!f) continue;
        const e = mission.enemies.get(id);
        if (!full && e && !e.alerted && !f.vitals.dead && !f.action && !f.heldBy) idle.push(id);
        else encoded.set(id, encodeFighter(f, world.bodies.get(id)));
      }
      const uses = [...mission.interactables.values()].filter((it) => it.by).map((it) => [it.id, it.by, Math.round(Math.min(1, it.progress / it.seconds) * 100) / 100]);
      const againIn = room.overAt === null ? null : Math.max(0, Math.ceil(MISSION_AGAIN_AFTER - (clock() - room.overAt)));
      for (const client of room.clients.values()) {
        const fighters = [];
        for (const [id, data] of encoded) fighters.push(id === client.id ? encodeFighter(world.fighters.get(id), world.bodies.get(id), { own: true }) : data);
        send(client, { t: 'snap', time, ack: client.lastSeq, fighters, idle: idle.length ? idle : undefined, projectiles, flags: null, effects, events,
          uses: uses.length ? uses : undefined,
          view: withView ? { ...missionView(mission, client.id), room: { code: room.code, open: room.open }, againIn } : undefined });
      }
      return;
    }
    const { match } = room;
    const flags = match.flags ? Object.fromEntries(Object.entries(match.flags).map(([t, f]) => [t, { state: f.state, carrier: f.carrier, x: f.x, z: f.z }])) : null;
    for (const client of room.clients.values()) {
      const fighters = [];
      for (const f of world.fighters.values()) fighters.push(encodeFighter(f, world.bodies.get(f.id), { own: f.id === client.id }));
      send(client, { t: 'snap', time, ack: client.lastSeq, fighters, projectiles, flags, effects, events,
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
        if (room.mission && !room.clients.size) continue; // nobody here: the mission waits
        const inputs = {};
        for (const client of room.clients.values()) {
          inputs[client.id] = { ...client.input, presses: client.presses.splice(0) };
        }
        const { effects, events } = room.mission ? stepMission(room.mission, STEP, inputs) : stepMatch(room.match, STEP, inputs);
        if (effects.length) room.effects.push(...effects);
        if (events.length) room.events.push(...events);
        room.ticks += 1;
        if (room.mission) {
          for (const e of events) if (e.type === 'enemyDown') room.fallenAt.set(e.id, e.at);
          if (room.ticks % SNAPSHOT_EVERY === 0) {
            // people appear room by room and the fallen are cleared away: the seats say who is in the picture
            const key = seatKey(room);
            if (key !== room.seatKey) {
              room.seatKey = key;
              room.fullNext = true; // whoever just appeared is sent in full
              const seats = seatsOf(room);
              for (const client of room.clients.values()) send(client, { t: 'seats', seats });
            }
            snapshot(room);
          }
          if (room.mission.phase === 'complete' && room.overAt === null) room.overAt = now;
          if (room.overAt !== null && now - room.overAt > MISSION_AGAIN_AFTER && room.clients.size) restartMission(room);
          continue;
        }
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
      limiter: createInputRateLimiter(), budget: { since: clock(), count: 0 }, wrongCodes: { count: 0, until: 0 }, signingIn: false };
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
        send(client, { t: 'lobby', matches: lobby() });
      } else if (msg.t === 'join') {
        if (msg.mode === STORY_MODE) {
          const coded = msg.code !== undefined && msg.code !== null;
          if (coded && (typeof msg.code !== 'string' || !ROOM_CODE.test(msg.code))) { send(client, { t: 'error', code: 'code', message: 'That is not a crew code.' }); return; }
          enterCrew(client, { code: coded ? msg.code : null, create: msg.create === true });
          return;
        }
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
        client.input = { move: input.move, run: input.run, sprint: input.sprint, face: input.face, strafe: input.strafe, interact: input.interact };
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
