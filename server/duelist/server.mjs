/* global performance, setInterval, clearInterval, Buffer */
// Duelist Adventure's match server: one Node process, many matches, each run by the same rules the browser
// practises with (src/components/duelist/sim/match.mjs). The server is the authority: it steps every match
// at 60 Hz, decides every hit, and sends each player 20 snapshots a second. Players only send commands,
// checked and rate-limited here (a modified client can press buttons faster than the rules allow, never
// more than the rules allow).
//
// A player's inputs are numbered and used one a tick, in the order they were sent (with none waiting, the
// last one's movement stands; a burst after a stall skips to the newest few, keeping every press). Each
// snapshot says which input the simulation has reached and, while it is acting on the player's inputs,
// carries that player's own fighter in full: the browser replays the inputs the server has not reached yet
// on top of it, so a player's own moves show at once (src/components/duelist/net/predict.mjs).
//
// Joining: a mode picks the busiest match of that mode with room (a bot seat to take, or a free seat), or
// starts one filled with bots; 'any' picks the busiest match of any mode that has players in it (or starts a
// free for all). The joining player takes a bot's place; a leaving player's seat goes back to a bot. A
// finished match starts again after a short pause with the same players.
//
// The story missions (sim/mission.mjs) run in crew rooms of up to four: a room of your own with a code to give
// to friends, a room joined by its code (whatever mission it plays), or any open crew playing the mission
// asked for. A crew room is not listed unless it is open. The mission waits while nobody is in the room; a
// little after it is completed the crew goes on to the next one in the story (the last one plays again).
//
// A dropped connection does not lose its seat: for RECONNECT_SECONDS a bot plays it (a match) or the
// mission's autopilot does (a crew; with nobody connected the mission waits), and the player sits back down
// with the key their 'joined' carried (a fresh key each time; it opens only that player's seat). Pings every
// few seconds notice a connection that died without closing.
import { randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createMatch, stepMatch, joinMatch, leaveMatch, matchView, standInInput, noteEvent, MODES, queueMatchClass, purchaseMatchItem } from '../../src/components/duelist/sim/match.mjs';
import { createProgressStore } from './progress.mjs';
import { createMission, stepMission, joinMission, leaveMission, missionView, nextMission, MISSIONS, claimStorySupply } from '../../src/components/duelist/sim/mission.mjs';
import { createAutopilot, thinkAutopilot } from '../../src/components/duelist/sim/autopilot.mjs';
import { createInputRateLimiter, classById } from '../../src/components/duelist/core/index.mjs';
import { PROTOCOL, WS_PATH, TICK_HZ, SNAPSHOT_EVERY, VIEW_EVERY, ONLINE_MODES, DEFAULT_PUBLIC_ROOMS, STORY_MODE, CREW_SIZE, ROOM_CODE, MAX_MESSAGE_BYTES, MAX_MESSAGES_PER_SECOND,
  ABUSE_MESSAGES_PER_SECOND, compactWaitingInputs, RECONNECT_SECONDS, BODY_IDS, QUICKPLAY_MODES, sanitizeInput, encodeFighter, encodeOwn } from '../../src/components/duelist/net/protocol.mjs';

const STEP = 1 / TICK_HZ;
const REMATCH_AFTER = 12; // seconds after a match ends
const MISSION_AGAIN_AFTER = 20; // seconds after a mission is completed before it starts again
const FALLEN_SHOWN_SECONDS = 9; // a mission's fallen stay in the snapshots this long, then are cleared away
const FULL_EVERY = 20; // snapshots: once a second everyone in a mission is sent in full
const IDLE_ROOM_SECONDS = 60; // a match with no players closes after this
const IDLE_PLAYER_SECONDS = 180; // no input for this long: out of the match
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
const WRONG_CODES = Object.freeze({ allowed: 5, coolSeconds: 30 }); // guessing crew codes is slowed down

// reconnectSeconds: how long a dropped seat waits (server clock); heartbeatMs: how often connections are pinged;
// missionAgainSeconds: how long after a mission is completed its crew goes on to the next
export function createDuelistServer({ authenticate, host = '0.0.0.0', port = 0, allowedOrigins = null, botLevel = 'duelist',
  clock = () => performance.now() / 1000, log = () => {}, reconnectSeconds = RECONNECT_SECONDS, heartbeatMs = 5000,
  missionAgainSeconds = MISSION_AGAIN_AFTER, controlLayout = null, progress = createProgressStore(), continuousPublicRooms = false,
  maxConnections = Infinity, maxRooms = Infinity, publicArenaOnly = false } = {}) {
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
    if (wss.clients.size >= maxConnections) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const send = (client, message) => { if (client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(message)); };
  const newKey = () => randomBytes(18).toString('base64url');
  const sameKey = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{24}$/.test(a) && /^[A-Za-z0-9_-]{24}$/.test(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const worldOf = (room) => (room.mission || room.match).world;
  const awayIn = (room) => [...room.clients.values()].filter((c) => c.away).map((c) => c.id);
  const connected = (room) => [...room.clients.values()].some((c) => !c.away);
  const isAway = (room, id) => room.clients.get(id)?.away || undefined;
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
  // the teacher (Arden: an enemy in Contraband, an ally in Saltmarch) wears whichever of the owner's two
  // fighters the crew does not play, if one is free (decided once)
  const isTeacher = (person) => person.tag === 'arden' || person.typeId === 'willUser';
  const teacherBody = (room, id) => {
    if (!room.enemyBodies.has(id)) {
      const used = new Set(room.bodies.values());
      room.enemyBodies.set(id, !used.has('huntress') ? 'huntress' : !used.has('maskedWarrior') ? 'maskedWarrior' : 'huntress');
    }
    return room.enemyBodies.get(id);
  };
  const seatsOf = (room) => (room.mission
    ? [
      ...[...room.mission.seats.values()].map((s) => ({ id: s.id, name: s.name, team: 'crew', kind: 'player', body: room.bodies.get(s.id) || BODY_IDS[0], away: isAway(room, s.id) })),
      // max: the person's full health, Will, stamina and armor (the depot's people are not built like duelists)
      ...[...room.mission.allies.values()].map((a) => {
        const { max } = room.mission.world.fighters.get(a.id).vitals;
        return { id: a.id, name: a.name, kind: 'ally', type: a.typeId, tag: a.tag || undefined, named: true,
          max: [max.hp, max.will, max.stamina, max.shield], body: isTeacher(a) ? teacherBody(room, a.id) : undefined };
      }),
      ...shownEnemies(room).map((e) => {
        const { max } = room.mission.world.fighters.get(e.id).vitals;
        return { id: e.id, name: e.name, kind: 'enemy', type: e.typeId, tag: e.tag || undefined, named: e.named || undefined,
          max: [max.hp, max.will, max.stamina, max.shield], body: isTeacher(e) ? teacherBody(room, e.id) : undefined };
      }),
    ]
    : [...room.match.seats.values()].map((s) => ({ id: s.id, name: s.name, team: s.team, kind: s.kind, body: room.bodies.get(s.id) || BODY_IDS[0], away: isAway(room, s.id) })));
  const seatKey = (room) => [...room.mission.seats.keys(), '|', ...room.mission.allies.keys(), '|', ...shownEnemies(room).map((e) => e.id)].join(',');
  // live matches and open crews, busiest first: mode, players, bots, seats, phase (no names or ids beyond the room's)
  const lobby = () => [...rooms.values()].filter((r) => !r.mission || r.open)
    .map((r) => (r.mission
      ? { id: r.id, mode: STORY_MODE, mission: r.mission.id, name: r.mission.def.title, players: humansIn(r), bots: 0, seats: CREW_SIZE,
        phase: r.mission.phase === 'complete' ? 'over' : 'live', open: hasRoom(r) }
      : { id: r.id, mode: r.mode, name: MODES[r.mode].name, players: humansIn(r), bots: r.match.seats.size - humansIn(r),
        seats: r.match.capacity, phase: r.match.phase, open: hasRoom(r), publicRoom: !!r.publicRoom }))
    .sort((a, b) => b.players - a.players || a.id.localeCompare(b.id, undefined, { numeric: true }));

  function openRoom(mode, { permanent = false } = {}) {
    const id = `m${nextRoom++}`;
    const match = createMatch({ mode, seed: nextRoom * 7919 + Math.floor(clock() * 1000) % 100000, botLevel,
      controlLayout: mode === 'control' ? controlLayout : null });
    const room = { id, mode, match, mission: null, publicRoom: permanent, clients: new Map(), bodies: new Map(), ticks: 0, snaps: 0, effects: [], events: [], emptySince: clock(), overAt: null };
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

  // a crew room starts with its first member in it (the mission is manned for the crew's size)
  function openCrew(client, { open, mission: missionId }) {
    const id = `m${nextRoom++}`;
    const mission = createMission({ id: missionId, players: [{ id: client.id, name: client.name }], seed: nextRoom * 7919 + Math.floor(clock() * 1000) % 100000 });
    const room = { id, mode: STORY_MODE, match: null, mission, code: newCode(), open, clients: new Map(), bodies: new Map(), enemyBodies: new Map(), fallenAt: new Map(),
      ticks: 0, snaps: 0, effects: [], events: [], emptySince: clock(), overAt: null, seatKey: '', fullNext: true };
    rooms.set(id, room);
    log('crew', id, open ? 'open' : 'private');
    return room;
  }

  // One always-open, bot-filled public server per competitive mode. Extra rooms open only when needed.
  for (const { id, mode } of DEFAULT_PUBLIC_ROOMS) {
    const room = openRoom(mode, { permanent: true });
    if (room.id !== id) throw new Error('Permanent public room identity mismatch');
  }

  function pickRoom(mode) {
    // the Join button ('any') looks for a match; crews are joined from the story page
    const pool = [...rooms.values()].filter((r) => hasRoom(r) && (mode === 'any' ? !r.mission && humansIn(r) > 0 : r.mode === mode));
    pool.sort(byPlayers);
    return pool[0] || (rooms.size < maxRooms ? openRoom(mode === 'any' ? 'duel' : mode) : null);
  }

  function ensureSpareRoom(mode) {
    if (!ONLINE_MODES.includes(mode)) return;
    // Exactly one bot-filled open room is kept ready while this mode fills;
    // unused overflow rooms still expire after the normal idle timeout.
    const ready = [...rooms.values()].some(r => !r.mission && r.mode === mode && hasRoom(r));
    if (!ready && rooms.size < maxRooms) openRoom(mode);
  }

  // classId: the class the player fights as (a seat they already have keeps its own)
  function enter(client, mode, requestedMatchId = null, classId = null) {
    // Select the exact advertised match when joining from the server browser.
    // A stale or forged id must not silently send the player into a different arena.
    const selected = requestedMatchId ? rooms.get(requestedMatchId) : null;
    if (requestedMatchId && (!selected || selected.mission || selected.mode !== mode || !hasRoom(selected))) {
      send(client, { t: 'error', code: 'room', message: 'That server is no longer available. Return to Online and refresh.' });
      return;
    }
    if (client.room) leave(client);
    const room = selected || pickRoom(mode);
    if (!room) { send(client, { t: 'error', code: 'full', message: 'All rooms are busy. Refresh Online Play.' }); return; }
    if (classId) client.classId = classId; // remembered for rematches
    // the account's EXP per class: the match works out the level from it, never from the browser
    const result = joinMatch(room.match, { id: client.id, name: client.name, classId: client.classId || null, progress: progress.get(client.id) });
    if (!result.ok) { send(client, { t: 'error', code: 'full', message: 'That match is full.' }); return; }
    room.bodies.set(client.id, client.body);
    if (result.replaced) room.bodies.delete(result.replaced);
    // a bot that replaced a leaving player needs a body too
    for (const s of room.match.seats.values()) if (!room.bodies.has(s.id)) room.bodies.set(s.id, BODY_IDS[room.bodies.size % BODY_IDS.length]);
    room.clients.set(client.id, client);
    client.room = room;
    client.input = {};
    client.waiting = [];
    client.lastInputAt = clock();
    client.key = newKey();
    send(client, { t: 'joined', match: room.id, mode: room.mode, you: client.id, team: result.team, replaced: result.replaced, seats: seatsOf(room), key: client.key });
    for (const other of room.clients.values()) if (other !== client) send(other, { t: 'seats', seats: seatsOf(room) });
    ensureSpareRoom(room.mode);
    log('join', client.id, room.id, result.replaced ? `replacing ${result.replaced}` : '');
  }

  const crewJoined = (room, client, extra = {}) => ({ t: 'joined', match: room.id, mode: STORY_MODE, mission: room.mission.id, code: room.code, you: client.id, team: 'crew',
    seats: seatsOf(room), key: client.key, ...extra });

  // matchId: an open crew listed in the lobby; code: a friend's crew (whatever it plays); create: a room of your own
  // (listed only with open); none of these: any open crew playing the mission asked for, or a new open one
  function enterCrew(client, { code = null, create = false, open = false, matchId = null, mission = 'contraband' } = {}) {
    const now = clock();
    let room = null;
    if (matchId) {
      // An open crew may be joined by the exact ID advertised in /lobby.
      // Never allow private rooms to be enumerated or joined by guessed IDs.
      room = rooms.get(matchId);
      if (!room?.mission || !room.open || !hasRoom(room)) {
        send(client, { t: 'error', code: 'room', message: 'That public crew is no longer available.' });
        return;
      }
    } else if (code) {
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
      room = [...rooms.values()].filter((r) => r.mission && hasRoom(r) && r.mission.id === mission).sort(byPlayers)[0] || null;
    }
    if (!room && rooms.size >= maxRooms) { send(client, { t: 'error', code: 'full', message: 'All rooms are busy.' }); return; }
    if (client.room) leave(client);
    if (room) joinMission(room.mission, { id: client.id, name: client.name });
    else room = openCrew(client, { open: open || !create, mission });
    room.bodies.set(client.id, client.body);
    room.clients.set(client.id, client);
    client.room = room;
    client.input = {};
    client.waiting = [];
    client.lastInputAt = now;
    client.key = newKey();
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
    room.match = createMatch({ mode: room.mode, seed: Math.floor(clock() * 1000) % 1000003, botLevel,
      controlLayout: room.mode === 'control' ? controlLayout : null });
    room.bodies = new Map();
    let k = 0;
    for (const s of room.match.seats.values()) room.bodies.set(s.id, BODY_IDS[k++ % BODY_IDS.length]);
    room.overAt = null;
    room.effects = [];
    room.events = [];
    for (const client of players) {
      const result = joinMatch(room.match, { id: client.id, name: client.name, classId: client.classId || null, progress: progress.get(client.id) });
      room.bodies.set(client.id, client.body);
      if (result.replaced) room.bodies.delete(result.replaced);
      send(client, { t: 'joined', match: room.id, mode: room.mode, you: client.id, team: result.team, replaced: result.replaced, seats: seatsOf(room), key: client.key, rematch: true });
    }
  }

  // the story goes on: the next mission (or this one again, the last), with whoever is still in the room
  function restartMission(room) {
    const players = [...room.clients.values()];
    room.mission = createMission({ id: nextMission(room.mission.id), players: players.map((c) => ({ id: c.id, name: c.name })), seed: Math.floor(clock() * 1000) % 1000003 });
    room.overAt = null;
    room.effects = [];
    room.events = [];
    room.fallenAt = new Map();
    room.enemyBodies = new Map();
    for (const client of players) send(client, crewJoined(room, client, { rematch: true }));
    room.seatKey = seatKey(room);
    room.fullNext = true;
  }

  // something everyone in the room should hear about (a drop, a return): with the next snapshot, and in a match's feed
  const note = (room, e) => {
    room.events.push({ ...e, at: worldOf(room).time });
    if (room.match) noteEvent(room.match, e);
  };
  const tellSeats = (room, except = null) => {
    const seats = seatsOf(room);
    for (const other of room.clients.values()) if (other !== except) send(other, { t: 'seats', seats });
  };

  // The connection dropped without leaving: the seat waits for its player.
  function goAway(client) {
    const room = client.room;
    Object.assign(client, { away: true, awaySince: clock(), input: {}, waiting: [], extra: ['blockUp', 'release'], pilot: null });
    note(room, { type: 'away', id: client.id, name: client.name });
    tellSeats(room, client);
    log('away', client.id, room.id);
  }

  // A dropped player's seat is played meanwhile: by a bot in a match, by the mission's autopilot in a crew.
  function standIn(room, client) {
    if (room.match) return standInInput(room.match, client.id);
    if (!client.pilot) client.pilot = createAutopilot(client.id, { seed: 7 });
    return thinkAutopilot(room.mission, client.pilot);
  }

  // The seat a 'hello' asks to come back to: its room and key must match, and it must be this account's (a
  // guest only ever gets a guest's seat back).
  function seatFor(user, resume) {
    if (!resume || typeof resume !== 'object' || typeof resume.match !== 'string' || typeof resume.key !== 'string' || resume.key.length > 64) return null;
    const room = rooms.get(resume.match);
    if (!room) return null;
    const old = [...room.clients.values()].find((c) => sameKey(c.key, resume.key));
    if (!old) return null;
    return (user.guest ? old.guest : !old.guest && old.id === String(user.id)) ? old : null;
  }

  // A new connection sits down in the seat an older one held (dropped, or still open after a reload).
  function takeOver(client, old) {
    const room = old.room;
    Object.assign(client, { id: old.id, name: old.name, body: old.body, guest: old.guest, room, key: newKey(), away: false, input: {}, waiting: [],
      extra: ['blockUp', 'release'], lastSeq: -1, usedSeq: -1, lastInputAt: clock(), wrongCodes: old.wrongCodes });
    room.clients.set(client.id, client);
    old.room = null;
    old.replaced = true;
    clients.delete(old);
    if (old.ws.readyState === WebSocket.OPEN) old.ws.close(4410, 'continued elsewhere');
    note(room, { type: 'back', id: client.id, name: client.name });
    if (room.mission) room.fullNext = true; // the returning player sees everyone in full
    tellSeats(room, client);
    log('back', client.id, room.id);
  }

  // what a returning player is told: the room as it is now
  const rejoined = (client) => {
    const room = client.room;
    if (room.mission) return crewJoined(room, client, { resumed: true });
    return { t: 'joined', match: room.id, mode: room.mode, you: client.id, team: room.match.seats.get(client.id)?.team || null, seats: seatsOf(room),
      key: client.key, resumed: true };
  };

  // A player's own fighter in full, for prediction: only while the rules act on that player's inputs (the
  // fight is on and the fighter stands), and only ever to that player.
  const ownOf = (world, client, live) => {
    const f = live ? world.fighters.get(client.id) : null;
    return f && !f.vitals.dead ? encodeOwn(f, world.bodies.get(client.id), world.time) : undefined;
  };

  function snapshot(room) {
    room.snaps += 1;
    const full = !!room.fullNext || room.snaps % FULL_EVERY === 0;
    room.fullNext = false;
    const withView = room.snaps % VIEW_EVERY === 0 || room.events.length > 0 || (!!room.mission && full);
    const { world } = room.mission || room.match;
    const time = Math.round(world.time * 1000) / 1000;
    const projectiles = world.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, d: [p.dir.x, p.dir.z], move: p.move }));
    const effects = room.effects;
    const events = room.events;
    room.effects = [];
    room.events = [];
    const away = awayIn(room);
    if (room.mission) {
      const { mission } = room;
      // The crew and whoever of the depot's people is still part of the picture; each fighter is encoded once.
      // People who have noticed nobody stand still: between full snapshots they are sent by id only (idle).
      const encoded = new Map();
      const idle = [];
      for (const id of [...mission.seats.keys(), ...mission.allies.keys(), ...shownEnemies(room).map((e) => e.id)]) {
        const f = world.fighters.get(id);
        if (!f) continue;
        const e = mission.enemies.get(id);
        if (!full && e && !e.alerted && !f.vitals.dead && !f.action && !f.heldBy) idle.push(id);
        else encoded.set(id, encodeFighter(f, world.bodies.get(id)));
      }
      const uses = [...mission.interactables.values()].filter((it) => it.by).map((it) => [it.id, it.by, Math.round(Math.min(1, it.progress / it.seconds) * 100) / 100]);
      const againIn = room.overAt === null ? null : Math.max(0, Math.ceil(missionAgainSeconds - (clock() - room.overAt)));
      for (const client of room.clients.values()) {
        if (client.away) continue;
        const fighters = [];
        for (const [id, data] of encoded) fighters.push(id === client.id ? encodeFighter(world.fighters.get(id), world.bodies.get(id), { own: true }) : data);
        send(client, { t: 'snap', time, ack: client.usedSeq, fighters, idle: idle.length ? idle : undefined, projectiles, flags: null, effects, events,
          own: ownOf(world, client, mission.phase === 'live'), uses: uses.length ? uses : undefined,
          view: withView ? { ...missionView(mission, client.id), room: { code: room.code, open: room.open }, againIn, away } : undefined });
      }
      return;
    }
    const { match } = room;
    const flags = match.flags ? Object.fromEntries(Object.entries(match.flags).map(([t, f]) => [t, { state: f.state, carrier: f.carrier, x: f.x, z: f.z }])) : null;
    const ball = match.ball ? { x: match.ball.x, z: match.ball.z } : null;
    for (const client of room.clients.values()) {
      if (client.away) continue;
      const fighters = [];
      for (const f of world.fighters.values()) fighters.push(encodeFighter(f, world.bodies.get(f.id), { own: f.id === client.id }));
      send(client, { t: 'snap', time, ack: client.usedSeq, fighters, projectiles, flags, ball, escortDistance:match.escort?.distance, effects, events, own: ownOf(world, client, match.phase === 'live'),
        view: withView ? { ...matchView(match, client.id), away } : undefined });
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
        if (room.mission && !connected(room)) continue; // nobody here (or everyone dropped): the mission waits
        if (!room.mission && !room.clients.size && !(continuousPublicRooms && room.publicRoom)) continue; // only permanent arenas run without humans
        const inputs = {};
        for (const client of room.clients.values()) {
          let input;
          if (client.away) input = standIn(room, client); // dropped: played meanwhile
          else {
            // one waiting input a tick, in order; with none waiting, the last one's movement stands
            const next = client.waiting.shift();
            if (next) {
              const { seq, presses, ...held } = next;
              client.input = held;
              client.usedSeq = seq;
              input = { ...held, presses };
            } else input = { ...client.input, presses: [] };
          }
          // on dropping and on coming back: let go of a raised guard or a held grip
          if (client.extra.length) input = { ...input, presses: [...client.extra.splice(0), ...(input.presses || [])] };
          inputs[client.id] = input;
        }
        const { effects, events } = room.mission ? stepMission(room.mission, STEP, inputs) : stepMatch(room.match, STEP, inputs);
        if (effects.length) room.effects.push(...effects);
        // what a player earned goes to the account (each browser sees its own total in its view, not in the events)
        for (const e of events) if (e.type === 'xp') progress.add(e.id, e.classId, e.amount);
        if (events.length) room.events.push(...events.filter((e) => e.type !== 'xp'));
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
          if (room.overAt !== null && now - room.overAt > missionAgainSeconds && room.clients.size) restartMission(room);
          continue;
        }
        if (room.ticks % SNAPSHOT_EVERY === 0) {
          if (room.clients.size) snapshot(room);
          else { room.effects = []; room.events = []; } // no audience: discard transient effects, not the world
        }
        if (room.match.phase === 'over' && room.overAt === null) room.overAt = now;
        if (room.overAt !== null && now - room.overAt > REMATCH_AFTER && (room.clients.size || room.publicRoom)) rematch(room);
      }
    }
    // a dropped player who has not come back in time: the seat goes back to a bot (a match) or leaves the crew
    for (const room of rooms.values()) {
      for (const client of [...room.clients.values()]) if (client.away && now - client.awaySince > reconnectSeconds) { log('gone', client.id, room.id); leave(client); }
    }
    for (const [id, room] of rooms) {
      if (room.publicRoom || room.clients.size || now - room.emptySince <= IDLE_ROOM_SECONDS) continue;
      // Do not expire the last spare server while all the other servers of
      // that mode are full. A newcomer must always see an available room.
      const anotherOpen = [...rooms.values()].some(other => other !== room && !other.mission &&
        other.mode === room.mode && hasRoom(other));
      if (!room.mission && ONLINE_MODES.includes(room.mode) && !anotherOpen) continue;
      rooms.delete(id);
      log('room closed', id);
    }
    for (const client of clients) if (client.room && now - client.lastInputAt > IDLE_PLAYER_SECONDS) { leave(client); send(client, { t: 'error', code: 'idle', message: 'Left the match after a long time without input.' }); }
  }, 4);

  // A connection that died without closing (a dropped network) answers no pings: it is cut, and its seat waits.
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (client.pinged) { client.ws.terminate(); continue; }
      client.pinged = true;
      try { client.ws.ping(); } catch { /* closing */ }
    }
  }, heartbeatMs);

  wss.on('connection', (ws) => {
    // waiting: inputs not yet used; lastSeq: the newest received; usedSeq: the newest the simulation used; accepted: presses let through
    // key: comes back to the seat; away: the connection dropped (the seat waits); extra: presses for the next step
    const client = { ws, id: null, name: 'Duelist', body: BODY_IDS[0], room: null, input: {}, waiting: [], lastSeq: -1, usedSeq: -1, accepted: 0, lastInputAt: clock(),
      limiter: createInputRateLimiter(), budget: { since: clock(), count: 0 }, wrongCodes: { count: 0, until: 0 }, signingIn: false,
      key: null, guest: false, away: false, awaySince: 0, extra: [], pilot: null, pinged: false, replaced: false };
    clients.add(client);
    ws.on('pong', () => { client.pinged = false; });
    ws.on('message', async (data) => {
      const now = clock();
      client.pinged = false;
      if (now - client.budget.since >= 1) { client.budget.since = now; client.budget.count = 0; }
      client.budget.count += 1;
      if (client.budget.count > ABUSE_MESSAGES_PER_SECOND) { leave(client); ws.close(4429, 'too many messages'); return; }
      if (client.budget.count > MAX_MESSAGES_PER_SECOND) return; // over budget: ignored, not punished
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'hello') {
        if (client.id || client.signingIn) return;
        // a page loaded before the game was updated speaks an older protocol
        if (msg.v !== PROTOCOL) { send(client, { t: 'error', code: 'version', message: 'The game was updated. Reload the page.' }); ws.close(4426, 'version'); return; }
        client.signingIn = true;
        let user = null;
        try { user = await authenticate(typeof msg.token === 'string' ? msg.token : '', msg); } catch { user = null; }
        if (!user?.id) { send(client, { t: 'error', code: 'auth', message: 'Sign in to play online.' }); ws.close(4401, 'not signed in'); return; }
        // back after a drop or a reload: the seat the key opens, if it is this player's
        const old = seatFor(user, msg.resume);
        if (old) {
          takeOver(client, old);
          send(client, { t: 'welcome', id: client.id, name: client.name, protocol: PROTOCOL, resumed: true });
          send(client, rejoined(client));
          return;
        }
        // one connection per account: an older one is closed, and a seat it left waiting is given up
        for (const other of clients) if (other !== client && other.id === String(user.id)) { leave(other); other.ws.close(4409, 'signed in elsewhere'); }
        for (const room of rooms.values()) { const waiting = room.clients.get(String(user.id)); if (waiting?.away) leave(waiting); }
        client.id = String(user.id);
        client.guest = !!user.guest;
        client.name = String(user.name || msg.name || 'Duelist').replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 20) || 'Duelist';
        client.body = BODY_IDS.includes(msg.body) ? msg.body : BODY_IDS[0];
        send(client, { t: 'welcome', id: client.id, name: client.name, protocol: PROTOCOL, resumed: false });
        return;
      }
      if (!client.id) return;
      if (msg.t === 'lobby') {
        send(client, { t: 'lobby', matches: lobby() });
      } else if (msg.t === 'join') {
        if (msg.mode === STORY_MODE) {
          if (publicArenaOnly) { send(client, { t: 'error', code: 'mode', message: 'This guest host serves competitive arenas only.' }); return; }
          const coded = msg.code !== undefined && msg.code !== null;
          if (coded && (typeof msg.code !== 'string' || !ROOM_CODE.test(msg.code))) { send(client, { t: 'error', code: 'code', message: 'That is not a crew code.' }); return; }
          const matchId = msg.matchId === undefined ? null : typeof msg.matchId === 'string' && /^m[0-9]+$/.test(msg.matchId) ? msg.matchId : false;
          if (matchId === false || (matchId && (coded || msg.create))) {
            send(client, { t: 'error', code: 'room', message: 'Invalid public crew selection.' }); return;
          }
          enterCrew(client, { code: coded ? msg.code : null, create: msg.create === true, open: msg.open === true, matchId,
            mission: MISSIONS[msg.mission] ? msg.mission : 'contraband' });
          return;
        }
        const quickplay = msg.mode === 'online';
        const mode = quickplay ? QUICKPLAY_MODES[randomInt(QUICKPLAY_MODES.length)]
          : msg.mode === 'any' || ONLINE_MODES.includes(msg.mode) ? msg.mode : null;
        if (!mode) { send(client, { t: 'error', code: 'mode', message: 'Unknown mode.' }); return; }
        const matchId = msg.matchId === undefined ? null
          : typeof msg.matchId === 'string' && /^m[0-9]+$/.test(msg.matchId) ? msg.matchId : false;
        if (matchId === false || (quickplay && matchId)) {
          send(client, { t: 'error', code: 'room', message: 'Invalid server selection.' }); return;
        }
        // Server chooses a random supported battle mode. The client receives
        // the actual mode in 'joined' and uses that ruleset for its arena.
        enter(client, mode, matchId, typeof msg.cls === 'string' && classById(msg.cls) ? msg.cls : null);
      } else if (msg.t === 'class') {
        // a class change: queued for the player's next spawn; the match decides when that may be
        if (!client.room?.match || typeof msg.id !== 'string') { send(client, { t: 'class', ok: false, pending: null, reason: 'no-match' }); return; }
        const res = queueMatchClass(client.room.match, client.id, msg.id);
        if (res.accepted) client.classId = msg.id;
        send(client, { t: 'class', ok: res.accepted, pending: res.pendingClass ?? null, reason: res.reason ?? null });
      } else if (msg.t === 'shop') {
        // The client can only request an item ID. Match rules validate every coin,
        // tier, loadout slot and eligibility; story missions have no item shop.
        if (!client.room?.match || typeof msg.id !== 'string' || msg.id.length > 48) {
          send(client, { t: 'shop', ok: false, reason: 'no-match' }); return;
        }
        const result = purchaseMatchItem(client.room.match, client.id, msg.id);
        send(client, { t: 'shop', ...result });
      } else if (msg.t === 'storySupply') {
        // Free supplies are story-only, once per authoritative human seat per operation.
        // The client cannot set stats, choose another seat, or spend competitive gold.
        if (!client.room?.mission || typeof msg.id !== 'string' || msg.id.length > 48) {
          send(client, { t: 'storySupply', ok: false, reason: 'no-story' }); return;
        }
        const result = claimStorySupply(client.room.mission, client.id, msg.id);
        send(client, { t: 'storySupply', ...result });
      } else if (msg.t === 'leave') {
        leave(client);
      } else if (msg.t === 'input' && client.room) {
        const input = sanitizeInput(msg);
        if (!input || input.seq <= client.lastSeq) return;
        client.lastSeq = input.seq;
        client.lastInputAt = now;
        // presses beyond the input budget are dropped (guard and release always pass: they only let go)
        const presses = input.presses.filter((command) => command === 'blockUp' || command === 'release' || client.limiter.allow(now));
        client.accepted += presses.length;
        client.waiting.push({ seq: input.seq, move: input.move, run: input.run, sprint: input.sprint, face: input.face, strafe: input.strafe, interact: input.interact, presses });
        // a burst after a stall: skip to the newest few (every press kept), so the fighter does not run long behind its player
        compactWaitingInputs(client.waiting);
      }
    });
    ws.on('close', () => {
      clients.delete(client);
      // it left on purpose, or a newer connection took its seat; otherwise the seat waits for its player
      if (client.replaced || !client.room) return;
      goAway(client);
    });
    ws.on('error', () => {});
  });

  return {
    rooms, clients,
    listen() { return new Promise((resolve) => http.listen(port, host, () => resolve(http.address()))); },
    async close() {
      progress.flush();
      clearInterval(timer);
      clearInterval(heartbeat);
      for (const client of clients) client.ws.terminate();
      await new Promise((resolve) => wss.close(() => resolve()));
      await new Promise((resolve) => http.close(() => resolve()));
    },
  };
}
