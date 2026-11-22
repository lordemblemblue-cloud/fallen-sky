// The browser's side of online play: a connection to the match server, and the match as a "source" the game
// view draws from, exactly like a local match. The server's snapshots are written into a mirror world
// (fighters and bodies the animator, effects and HUD already read), shown 100 ms behind the newest one so
// movement between snapshots is interpolated and smooth. Effects and match events are released when the
// picture reaches the moment they happened.
//
// The player's own fighter is the exception: it is played here a step ahead of the server (net/predict.mjs),
// so a press shows at once, and hits that involve the player show the moment the server reports them.
//
// A dropped connection is not the end: the page reconnects by itself and sits back down in its seat with the
// key the server gave it (a bot or the autopilot plays it meanwhile, for RECONNECT_SECONDS). The key is kept
// in the tab's session storage too, so a reload sits back down as well; leaving for the menu gives it up.
/* global window, WebSocket, performance, fetch, setTimeout */
import { createWorld } from '../sim/world.mjs';
import { createFighter } from '../core/index.mjs';
import { MODES } from '../sim/match.mjs';
import { MISSIONS } from '../sim/mission.mjs';
import { createLevel, setDoor } from '../sim/level.mjs';
import { enemySeat, allySeat, crewSeat } from '../client/missionSeats.mjs';
import { PROTOCOL, WS_PATH, TICK_HZ, RECONNECT_SECONDS, encodeInput, sanitizeInput, applyFighter } from './protocol.mjs';
import { createPredictor } from './predict.mjs';

const DELAY = 0.1; // seconds the picture stays behind the newest snapshot
const STEP = 1 / TICK_HZ; // the player's inputs are read, sent and played in the server's own steps
const MAX_CATCH_UP = 0.1; // seconds of steps made up after a long frame; beyond that the time is let go
const DEAD = 4; // the fallen bit of a snapshot fighter's state
const SILENCE_SECONDS = 3; // nothing from the server for this long (it sends 20 snapshots a second): the connection is gone
const CLOSE_REASONS = { 4401: 'Sign in to play online.', 4409: 'You signed in somewhere else.', 4410: 'You carried on in another window.',
  4426: 'The game was updated. Reload the page.', 4429: 'Too many messages.' };
// closes that end the visit (nothing to reconnect to)
const FINAL = new Set([4401, 4409, 4410, 4426, 4429]);
const RESUME_KEY = 'duelist.resume';

// This tab's session storage (where the seat's key is kept across a reload), when the browser allows it.
function tabStorage() {
  try { return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null; } catch { return null; }
}
// The seat this tab last sat in, when it was asked for the same way and recently: { match, key }.
function keptSeat(storage, mode, room, matchId = null) {
  try {
    const kept = JSON.parse(storage.getItem(RESUME_KEY) || 'null');
    if (kept && kept.mode === mode && (kept.room || null) === (room || null) && (!matchId || kept.match === matchId) && typeof kept.match === 'string' && typeof kept.key === 'string'
      && Date.now() - kept.at < RECONNECT_SECONDS * 1000) return { match: kept.match, key: kept.key };
  } catch { /* nothing kept */ }
  return null;
}

/** Where the match server is: VITE_DUELIST_WS_URL, or the local test server when the page runs on localhost. */
export function duelistServerUrl() {
  const configured = import.meta.env?.VITE_DUELIST_WS_URL;
  if (typeof configured === 'string' && /^wss?:\/\/[^\s/]+(?::\d+)?\/ws\/duelist$/i.test(configured.trim())) return configured.trim();
  if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return `ws://${window.location.hostname}:5321${WS_PATH}`;
  return null;
}

/**
 * The live matches on the match server (for the menus): [{ id, mode, name, players, bots, seats, phase, open }],
 * or null when the server cannot be reached.
 */
export async function fetchLobby(serverUrl = duelistServerUrl()) {
  if (!serverUrl) return null;
  const url = serverUrl.replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/ws\/duelist$/i, '/lobby');
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body.matches) ? body.matches : null;
  } catch {
    return null;
  }
}

// Development only: a slow connection to try prediction against. In the browser's console:
// sessionStorage.setItem('duelist.lag', '150') and reload (150 ms there and back; this tab only).
function devLag() {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return 0;
  try { return Math.max(0, Math.min(1000, Number(window.sessionStorage.getItem('duelist.lag')) || 0)); } catch { return 0; }
}
// Development only: sessionStorage.setItem('duelist.predict', '0') draws your own fighter from the server's
// picture, as it was before prediction (to feel the difference).
function devNoPrediction() {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return false;
  try { return window.sessionStorage.getItem('duelist.predict') === '0'; } catch { return false; }
}

const newBody = () => ({ x: 0, y: 0, z: 0, yaw: 0, vy: 0, speed: 0, moving: false, motion: null, intent: { x: 0, z: 0 }, target: null });
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/**
 * An online match. mode: 'duel' | 'ffa' | 'tdm' | 'ctf' | 'any', or 'story': a co-op mission (mission: which
 * one, sim/mission.mjs MISSIONS) in a crew room (room: a crew's code, 'new' for a room of your own, or null for
 * any open crew). A crew's room may play another mission than the one asked for (a friend's code; the next
 * mission after one is finished): level and def follow it, and generation counts each new mission or match. onChange(status, detail)
 * reports 'connecting' | 'joining' | 'ready' | 'reconnecting' | 'closed' | 'error'. predict: false draws the
 * player's own fighter from the server's picture like everyone else's (for comparison). storage: where the
 * seat's key is kept across a reload (this tab's session storage by default).
 */
// classId: the class to fight as (core/classes.mjs); chooseClass changes it for the next spawn
export function createOnlineSource({ url, token, name, body, mode, mission = 'contraband', room = null, matchId = null, classId = null, predict = true, storage = tabStorage(), onChange = () => {} }) {
  let wantedClass = classId;
  let classAnswer = null; // the server's last answer: { ok, pending, reason }
  let shopAnswer = null;
  const story = mode === 'story';
  // a mission's rooms, for the picture and the camera (the server owns the doors: they follow its view)
  let def = story ? MISSIONS[mission] || MISSIONS.contraband : null;
  let level = def ? createLevel(def.level) : null;
  let generation = 0;
  const world = createWorld({ arenaRadius: story ? 1e6 : MODES[mode]?.arena || 22 });
  const maxOf = new Map(); // the depot's people: id -> their full vitals
  const lastFull = new Map(); // a mission: fighter id -> its last full state (the unchanged come by id only)
  let code = null;
  const snaps = []; // { time, fighters, projectiles, flags, effects, events }
  let ws = null;
  let meId = null;
  let seats = [];
  let matchMode = mode;
  let view = null;
  let flags = null;
  let footballBall = null;
  let escortDistance = 0;
  let status = 'connecting';
  let seq = 0;
  let stepClock = 0; // time waiting to be played in whole steps
  let predictor = null; // the player's own fighter, a step ahead (made once the server says who the player is)
  // When the server stops acting on the player's inputs (fallen, grabbed, the round over), the predicted
  // fighter stands as it was until the delayed picture reaches that moment: no rewind of the last tenth of a second.
  let handover = -Infinity;
  let others = []; // where the other standing fighters were in the newest snapshot (bodies keep apart)
  const instant = []; // effects that involve the player: shown at the next frame, not with the delayed picture
  const sentAt = new Map(); // input number -> when it left (for the round trip)
  let roundTrip = null; // seconds from an input leaving to a snapshot that has used it (smoothed)
  let offset = null; // server time minus local seconds
  let shown = -Infinity; // the server time the picture has reached
  let seatsVersion = 0;
  const lag = devLag() / 1000;
  const setStatus = (s, detail = '') => { status = s; onChange(s, detail); };
  // the server's seats as the game view dresses them (a mission's people get their kits here)
  const dress = (list) => {
    if (!story) return list;
    return list.map((s) => {
      if (s.kind === 'player') return crewSeat(s, meId);
      if (s.max) maxOf.set(s.id, { hp: s.max[0], will: s.max[1], stamina: s.max[2], shield: s.max[3] });
      if (s.kind === 'ally') return allySeat({ id: s.id, name: s.name, typeId: s.type, tag: s.tag, body: s.body });
      return enemySeat({ id: s.id, name: s.name, typeId: s.type, named: s.named, tag: s.tag, body: s.body });
    });
  };
  const makeFighter = (id, team) => createFighter({ id, team, vitals: maxOf.get(id) || null });
  // what is being used right now rides every snapshot; the rest of the view comes a few times a second
  const applyUses = (uses = []) => {
    if (!view?.interactables) return;
    const by = new Map(uses.map((u) => [u[0], u]));
    for (const it of view.interactables) {
      const u = by.get(it.id);
      it.by = u ? u[1] : null;
      if (u) it.progress = u[2];
    }
    const mine = view.prompt ? by.get(view.prompt.id) : null;
    if (mine) view.prompt.progress = mine[2];
  };
  const deliver = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
  const send = (m) => { if (lag) setTimeout(() => deliver(m), lag * 500); else deliver(m); };
  const local = () => performance.now() / 1000;
  const carrying = () => !!flags && Object.values(flags).some((f) => f.carrier === meId);
  // a hit on the player, or the player's own strike landing or being parried
  const involvesMe = (e) => e.defender === meId || ((e.type === 'impact' || e.type === 'parry') && e.attacker === meId);

  // ---- the connection
  let seat = null; // { match, key }: where the player sits, and the key that comes back to it
  let joinedOnce = false;
  let stopped = false; // left on purpose: nothing to come back to
  let reconnectUntil = 0;
  let attempt = 0;
  let lastHeard = 0; // when the server was last heard from (local seconds)
  let lastKept = 0;
  const keep = () => {
    if (!storage || !seat) return;
    try { storage.setItem(RESUME_KEY, JSON.stringify({ mode, room, match: seat.match, key: seat.key, at: Date.now() })); } catch { /* this visit only */ }
  };
  const forget = () => { if (!storage) return; try { storage.removeItem(RESUME_KEY); } catch { /* nothing kept */ } };

  function receive(msg) {
    lastHeard = local();
    if (msg.t === 'welcome') {
      meId = msg.id;
      if (predict && !devNoPrediction() && (!predictor || predictor.fighter.id !== meId)) predictor = createPredictor({ id: meId, level, arenaRadius: world.arenaRadius });
      if (msg.resumed) return; // back in the seat: its 'joined' follows
      // a seat of its own: as asked; after a drop that lasted too long, back into the same crew by its code
      const again = !!seat;
      seat = null;
      setStatus('joining', again ? 'Your seat was given up. Joining again…' : '');
      const how = story && again && code ? { code }
        : story && room === 'open' ? { create: true, open: true }
        : story && room === 'new' ? { create: true }
        : story && /^m[0-9]+$/.test(room || '') ? { matchId: room }
        : story && room ? { code: room } : matchId ? { matchId } : {};
      send({ t: 'join', mode, ...(story ? { mission } : {}), ...(wantedClass && !story ? { cls: wantedClass } : {}), ...how });
    } else if (msg.t === 'joined') {
      // a new match or mission (the next one, or another after the seat was given up): nothing of the old one stays
      const fresh = !!msg.rematch || (joinedOnce && !msg.resumed);
      joinedOnce = true;
      matchMode = msg.mode;
      world.arenaRadius = MODES[msg.mode]?.arena || world.arenaRadius;
      if (predictor) { predictor.world.arenaRadius = world.arenaRadius; predictor.reset(); }
      // the crew plays another mission (a friend's crew; the story's next one): its rooms
      if (story && msg.mission && MISSIONS[msg.mission] && msg.mission !== def?.id) {
        def = MISSIONS[msg.mission];
        level = createLevel(def.level);
        if (predictor) predictor.world.level = level;
        view = null; maxOf.clear(); lastFull.clear();
      }
      if (fresh) {
        generation += 1;
        world.fighters.clear(); world.bodies.clear(); flags = null; escortDistance = 0;
        // a mission from the start: its doors as they were
        if (level) { for (const d of def.level.doors) setDoor(level, d.id, !!d.open); view = null; maxOf.clear(); lastFull.clear(); }
      }
      // the picture starts again from the server's next snapshot (back after a drop: the same world, a new clock)
      if (fresh || msg.resumed) { snaps.length = 0; shown = -Infinity; offset = null; instant.length = 0; sentAt.clear(); handover = -Infinity; }
      seat = msg.key ? { match: msg.match, key: msg.key } : null;
      keep();
      code = msg.code || null;
      seats = dress(msg.seats);
      seatsVersion += 1;
      setStatus('ready', msg.mode);
    } else if (msg.t === 'seats') { seats = dress(msg.seats); seatsVersion += 1; }
    else if (msg.t === 'snap') {
      const at = local();
      const estimate = msg.time - at;
      // the newest snapshot that arrived soonest after it was sent sets the clock (jitter only delays)
      offset = offset === null ? estimate : Math.max(estimate, offset - 0.002);
      if (story) {
        // the depot's people who have noticed nobody come by id only: their last full state stands
        for (const f of msg.fighters) lastFull.set(f.id, f);
        for (const id of msg.idle || []) { const f = lastFull.get(id); if (f) msg.fighters.push(f); }
      }
      // what happens to the player shows now; the rest waits for the picture to reach its moment
      if (meId && msg.effects.some(involvesMe)) {
        instant.push(...msg.effects.filter(involvesMe));
        msg.effects = msg.effects.filter((e) => !involvesMe(e));
      }
      snaps.push(msg);
      if (snaps.length > 40) snaps.shift();
      if (msg.view) {
        view = msg.view;
        if (level && view.doors) for (const d of view.doors) setDoor(level, d.id, d.open);
      }
      if (story) applyUses(msg.uses);
      if (msg.flags) flags = msg.flags;
      if (msg.ball) footballBall = { ...msg.ball };
      // the player's own fighter: back to the server's word, the inputs it has not used yet replayed on top
      others = msg.fighters.filter((f) => f.id !== meId && !(f.v[4] & DEAD) && !f.hb).map((f) => ({ x: f.p[0], z: f.p[2] }));
      if (predictor) {
        const was = predictor.active;
        if (msg.own) predictor.reconcile(msg.own, msg.ack, others, was ? null : world.bodies.get(meId) || null);
        else predictor.drop();
        if (predictor.active) handover = -Infinity;
        else if (was) handover = msg.time;
      }
      const left = sentAt.get(msg.ack);
      if (left !== undefined) roundTrip = roundTrip === null ? at - left : roundTrip + (at - left - roundTrip) * 0.1;
      for (const n of sentAt.keys()) { if (n > msg.ack) break; sentAt.delete(n); }
    } else if (msg.t === 'class') {
      classAnswer = { ok: !!msg.ok, pending: msg.pending || null, reason: msg.reason || null };
      onChange(status, null);
    } else if (msg.t === 'shop') {
      shopAnswer = msg;
      if (msg.ok && view?.me) view = { ...view, me: { ...view.me, gold: msg.gold, items: msg.items } };
      onChange(status, null);
    } else if (msg.t === 'error') setStatus('error', msg.message);
    else if (msg.t === 'left') { seat = null; forget(); setStatus('closed', 'You left the match.'); }
  }

  function connect(resume) {
    const socket = new WebSocket(url);
    ws = socket;
    socket.onopen = () => { if (ws === socket) send({ t: 'hello', v: PROTOCOL, token: token || '', name, body, ...(resume ? { resume } : {}) }); };
    socket.onmessage = (event) => {
      if (ws !== socket) return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (lag) setTimeout(() => { if (ws === socket) receive(msg); }, lag * 500); else receive(msg);
    };
    socket.onclose = (e) => { if (ws === socket) lost(e.code); };
    socket.onerror = () => {}; // its close follows
  }

  // The connection closed: the end (left, refused, replaced, never reached), or a drop to come back from:
  // tries again, sooner then later, for as long as the server keeps the seat.
  function lost(closeCode) {
    ws = null;
    if (stopped) return;
    if (!seat || FINAL.has(closeCode)) {
      if (FINAL.has(closeCode)) { seat = null; forget(); }
      if (status === 'error' || status === 'closed') return;
      if (status === 'connecting') setStatus('error', 'The match server could not be reached.');
      else setStatus('closed', CLOSE_REASONS[closeCode] || 'The match server closed the connection.');
      return;
    }
    if (status !== 'reconnecting') {
      reconnectUntil = local() + RECONNECT_SECONDS - 2;
      attempt = 0;
      predictor?.reset();
      setStatus('reconnecting', 'Connection lost. Reconnecting…');
    }
    if (local() > reconnectUntil) { seat = null; forget(); setStatus('closed', 'The connection was lost.'); return; }
    const wait = Math.min(4, 0.25 * 2 ** attempt);
    attempt += 1;
    setTimeout(() => { if (!stopped && !ws && seat) connect(seat); }, wait * 1000);
  }

  // a reload in this tab while seated: straight back to that seat
  connect(storage ? keptSeat(storage, mode, room, matchId) : null);

  return {
    world,
    kind: story ? 'mission' : 'match',
    get level() { return level; },
    get def() { return def; },
    get generation() { return generation; }, // a new mission or match: what was drawn of the last one goes
    get code() { return code; }, // a crew room's code, to give to friends
    get meId() { return meId; },
    get mode() { return matchMode; },
    get status() { return status; },
    get seatsVersion() { return seatsVersion; },
    /** The server's answer to the last class change: { ok, pending, reason } or null. */
    get classAnswer() { return classAnswer; },
    get shopAnswer() { return shopAnswer; },
    /** Change class: the server queues it for the next spawn (before the fight, between rounds or while down). */
    chooseClass(id) {
      wantedClass = id;
      classAnswer = null;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'class', id }));
    },
    buyItem(id) {
      shopAnswer = null;
      if (!story && typeof id === 'string' && ws?.readyState === 1) send({ t: 'shop', id });
    },
    seats: () => seats,
    view: () => view,
    flags: () => flags,
    ball: () => footballBall,
    escortDistance: () => escortDistance,
    /** The connection as the player feels it: the round trip (seconds) and how the prediction is going. */
    netStats: () => ({ roundTrip, lag, ...(predictor ? predictor.stats() : { predicting: false }) }),
    /**
     * Each frame: read, send and play the player's input in whole 60 Hz steps; move the picture to (server
     * time - 100 ms); return the effects and events that happened up to then (and what just happened to the
     * player). input: the frame's input, or a function that reads it (called once a step).
     */
    step(dt, input) {
      const out = { effects: instant.splice(0), events: [] };
      // nothing heard for a while: the connection is gone, whatever the socket says
      if (status === 'ready' && ws && local() - lastHeard > SILENCE_SECONDS) {
        const dead = ws;
        ws = null;
        try { dead.close(); } catch { /* already gone */ }
        lost(1006);
      }
      if (seat && local() - lastKept > 1) { lastKept = local(); keep(); }
      if (status === 'ready' && meId) {
        stepClock = Math.min(MAX_CATCH_UP, stepClock + dt);
        while (stepClock >= STEP - 1e-9) {
          stepClock -= STEP;
          const given = typeof input === 'function' ? input() : input;
          if (!given) break;
          const wire = encodeInput(seq, given);
          send(wire);
          sentAt.set(seq, local());
          if (sentAt.size > 600) sentAt.delete(sentAt.keys().next().value);
          if (predictor) {
            // played here exactly as the server will play it (a flag carrier cannot sprint)
            const used = sanitizeInput(wire);
            if (carrying()) used.sprint = false;
            predictor.advance(seq, used, others);
          }
          seq += 1;
        }
      }
      if (offset === null || snaps.length === 0) return out;
      const target = local() + offset - DELAY;
      const time = Math.max(shown, Math.min(target, snaps[snaps.length - 1].time));
      for (const s of snaps) {
        if (s.time > shown && s.time <= time) { out.effects.push(...s.effects); out.events.push(...s.events); }
      }
      shown = time;
      world.time = time;
      // the two snapshots around the shown moment
      let i = snaps.findIndex((s) => s.time > time);
      if (i === -1) i = snaps.length - 1;
      const s1 = snaps[i];
      const s0 = snaps[Math.max(0, i - 1)];
      const k = s1.time > s0.time ? Math.min(1, Math.max(0, (time - s0.time) / (s1.time - s0.time))) : 1;
      const predicting = !!predictor && (predictor.active || time < handover);
      const present = new Set();
      const past = new Map(s0.fighters.map((f) => [f.id, f]));
      for (const data of s1.fighters) {
        present.add(data.id);
        if (predicting && data.id === meId) {
          // the player's own fighter is played here, not read from the delayed picture
          if (!world.fighters.has(meId)) { world.fighters.set(meId, makeFighter(meId, data.tm || null)); world.bodies.set(meId, newBody()); }
          world.fighters.get(meId).team = data.tm || null;
          continue;
        }
        const before = past.get(data.id) || data;
        // discrete state from the earlier snapshot (the moment shown), its action clock carried forward
        const sample = k === 1 ? data : before;
        const { f, b } = applyFighter(world, sample, makeFighter, newBody);
        if (f.action && k < 1 && before !== data) {
          const next = data.a;
          // The server clock includes stance speed, buffs and hit recovery.
          if (next && next[0] === f.action.id && next[1] >= before.a[1]) {
            f.action.t = before.a[1] + (next[1] - before.a[1]) * k;
          } else {
            f.action.t = Math.min(f.action.move.duration, before.a[1] + Math.max(0, time - s0.time));
          }
        }
        const [x0, y0, z0, yaw0] = before.p;
        const [x1, y1, z1, yaw1] = data.p;
        b.x = x0 + (x1 - x0) * k;
        b.y = y0 + (y1 - y0) * k;
        b.z = z0 + (z1 - z0) * k;
        b.yaw = lerpAngle(yaw0, yaw1, k);
      }
      for (const id of [...world.fighters.keys()]) if (!present.has(id)) { world.fighters.delete(id); world.bodies.delete(id); }
      if (predicting && world.fighters.has(meId)) predictor.present(world.fighters.get(meId), world.bodies.get(meId), time, dt);
      if (Number.isFinite(s1.escortDistance)) {
        const before = s0.escortDistance ?? s1.escortDistance;
        escortDistance = before + (s1.escortDistance - before) * k;
      }
      if (s1.ball) {
        const prev = s0.ball || s1.ball;
        footballBall = { x: prev.x + (s1.ball.x - prev.x) * k, z: prev.z + (s1.ball.z - prev.z) * k };
      }
      world.projectiles = s1.projectiles.map((p) => ({ id: p.id, x: p.x, z: p.z, dir: { x: p.d[0], z: p.d[1] }, move: p.move }));
      while (snaps.length > 2 && snaps[1].time < time - 0.5) snaps.shift();
      return out;
    },
    /** For trying the reconnect out (and tests): the connection goes as if the network had dropped. */
    simulateDrop() {
      if (!ws) return;
      const dead = ws;
      ws = null;
      try { dead.close(); } catch { /* already gone */ }
      lost(1006);
    },
    /** Leave on purpose: the seat is given up (a bot takes it) and nothing reconnects. */
    leave() { stopped = true; seat = null; forget(); send({ t: 'leave' }); },
    /**
     * Done with the match (back to the menu): the seat is given up. keepSeat: the page is going but its player
     * is not (a reload, or a test of one): the seat waits and the kept key brings the next page back to it.
     * Only a source that got its seat gives one up (React's development double mount disposes the first
     * source before it has one: the kept key must survive for the second).
     */
    dispose({ keepSeat = false } = {}) {
      stopped = true;
      if (!keepSeat && seat) { seat = null; forget(); deliver({ t: 'leave' }); }
      const socket = ws;
      ws = null;
      try { socket?.close(); } catch { /* already closed */ }
    },
  };
}
