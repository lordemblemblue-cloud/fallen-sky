// The browser's side of online play: a connection to the match server, and the match as a "source" the game
// view draws from, exactly like a local match. The server's snapshots are written into a mirror world
// (fighters and bodies the animator, effects and HUD already read), shown 100 ms behind the newest one so
// movement between snapshots is interpolated and smooth. Effects and match events are released when the
// picture reaches the moment they happened.
/* global window, WebSocket, performance, fetch */
import { createWorld } from '../sim/world.mjs';
import { createFighter } from '../core/index.mjs';
import { MODES } from '../sim/match.mjs';
import { MISSIONS } from '../sim/mission.mjs';
import { createLevel, setDoor } from '../sim/level.mjs';
import { enemySeat, crewSeat } from '../client/missionSeats.mjs';
import { PROTOCOL, WS_PATH, encodeInput, applyFighter } from './protocol.mjs';

const DELAY = 0.1; // seconds the picture stays behind the newest snapshot
const CLOSE_REASONS = { 4401: 'Sign in to play online.', 4409: 'You signed in somewhere else.', 4429: 'Too many messages.' };

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

const newBody = () => ({ x: 0, y: 0, z: 0, yaw: 0, vy: 0, speed: 0, moving: false, motion: null, intent: { x: 0, z: 0 }, target: null });
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/**
 * An online match. mode: 'duel' | 'ffa' | 'tdm' | 'ctf' | 'any', or 'story': the co-op mission in a crew room
 * (room: a crew's code, 'new' for a room of your own, or null for any open crew). onChange(status, detail)
 * reports 'connecting' | 'joining' | 'ready' | 'closed' | 'error'.
 */
export function createOnlineSource({ url, token, name, body, mode, room = null, onChange = () => {} }) {
  const story = mode === 'story';
  // a mission's rooms, for the picture and the camera (the server owns the doors: they follow its view)
  const def = story ? MISSIONS.contraband : null;
  const level = def ? createLevel(def.level) : null;
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
  let status = 'connecting';
  let seq = 0;
  let lastSent = -Infinity;
  const queued = []; // presses waiting for the next input message
  let offset = null; // server time minus local seconds
  let shown = -Infinity; // the server time the picture has reached
  let seatsVersion = 0;
  const setStatus = (s, detail = '') => { status = s; onChange(s, detail); };
  // the server's seats as the game view dresses them (a mission's people get their kits here)
  const dress = (list) => {
    if (!story) return list;
    return list.map((s) => {
      if (s.kind !== 'enemy') return crewSeat(s, meId);
      if (s.max) maxOf.set(s.id, { hp: s.max[0], will: s.max[1], stamina: s.max[2], shield: s.max[3] });
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
  const send = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
  const local = () => performance.now() / 1000;

  ws = new WebSocket(url);
  ws.onopen = () => send({ t: 'hello', v: PROTOCOL, token: token || '', name, body });
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.t === 'welcome') {
      meId = msg.id;
      setStatus('joining');
      send({ t: 'join', mode, ...(story && room === 'new' ? { create: true } : story && room ? { code: room } : {}) });
    }
    else if (msg.t === 'joined') {
      matchMode = msg.mode;
      world.arenaRadius = MODES[msg.mode]?.arena || world.arenaRadius;
      if (msg.rematch) {
        world.fighters.clear(); world.bodies.clear(); snaps.length = 0; shown = -Infinity; offset = null;
        // a mission from the start: its doors as they were
        if (level) { for (const d of def.level.doors) setDoor(level, d.id, !!d.open); view = null; maxOf.clear(); lastFull.clear(); }
      }
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
      snaps.push(msg);
      if (snaps.length > 40) snaps.shift();
      if (msg.view) {
        view = msg.view;
        if (level && view.doors) for (const d of view.doors) setDoor(level, d.id, d.open);
      }
      if (story) applyUses(msg.uses);
      if (msg.flags) flags = msg.flags;
    } else if (msg.t === 'error') setStatus('error', msg.message);
    else if (msg.t === 'left') setStatus('closed', 'You left the match.');
  };
  ws.onclose = (e) => { if (status !== 'error') setStatus('closed', CLOSE_REASONS[e.code] || 'The match server closed the connection.'); };
  ws.onerror = () => setStatus('error', 'The match server could not be reached.');

  return {
    world,
    kind: story ? 'mission' : 'match',
    level,
    def,
    get code() { return code; }, // a crew room's code, to give to friends
    get meId() { return meId; },
    get mode() { return matchMode; },
    get status() { return status; },
    get seatsVersion() { return seatsVersion; },
    seats: () => seats,
    view: () => view,
    flags: () => flags,
    /**
     * Each frame: send the player's input, move the picture to (server time - 100 ms), and return the
     * effects and events that happened up to then.
     */
    step(dt, input) {
      const now = local();
      const given = typeof input === 'function' ? input() : input;
      if (status === 'ready' && given) {
        if (given.presses?.length) queued.push(...given.presses);
        // at most 60 messages a second (a fast screen draws more frames than that); presses ride the next one
        if (now - lastSent >= 1 / 60 - 0.002 || (queued.length && now - lastSent >= 0.008)) {
          send(encodeInput(seq++, { ...given, presses: queued.splice(0, 8) }));
          lastSent = now;
        }
      }
      const out = { effects: [], events: [] };
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
      const present = new Set();
      const past = new Map(s0.fighters.map((f) => [f.id, f]));
      for (const data of s1.fighters) {
        present.add(data.id);
        const before = past.get(data.id) || data;
        // discrete state from the earlier snapshot (the moment shown), its action clock carried forward
        const { f, b } = applyFighter(world, before, makeFighter, newBody);
        if (f.action) f.action.t += Math.max(0, time - s0.time);
        const [x0, y0, z0, yaw0] = before.p;
        const [x1, y1, z1, yaw1] = data.p;
        b.x = x0 + (x1 - x0) * k;
        b.y = y0 + (y1 - y0) * k;
        b.z = z0 + (z1 - z0) * k;
        b.yaw = lerpAngle(yaw0, yaw1, k);
      }
      for (const id of [...world.fighters.keys()]) if (!present.has(id)) { world.fighters.delete(id); world.bodies.delete(id); }
      world.projectiles = s1.projectiles.map((p) => ({ id: p.id, x: p.x, z: p.z, dir: { x: p.d[0], z: p.d[1] }, move: p.move }));
      while (snaps.length > 2 && snaps[1].time < time - 0.5) snaps.shift();
      return out;
    },
    leave() { send({ t: 'leave' }); },
    dispose() { try { ws?.close(); } catch { /* already closed */ } },
  };
}
