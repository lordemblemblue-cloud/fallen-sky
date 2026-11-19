// Duelist Adventure's wire protocol: JSON over one WebSocket, shared by the browser and the match server.
// The server owns the match (sim/match.mjs); a browser only says what its player presses and draws what
// the server sends back.
//
// client -> server
//   { t: 'hello', v, token, name, body }        sign in (token checked by the server) and pick a fighter
//   { t: 'lobby' }                               the open matches
//   { t: 'join', mode }                          'duel' | 'ffa' | 'tdm' | 'ctf' | 'any' (any match with players)
//   { t: 'join', mode: 'story', code?, create? } the co-op mission: a crew room by its code, a new room of your
//                                                own (create), or neither: any open crew
//   { t: 'input', s, m: [x, z], r, sp, f, st, i, p }  seq, move, run, sprint, face (yaw or null), strafe,
//                                                interact held (story), presses
//   { t: 'leave' }
// server -> client
//   { t: 'welcome', id, name }
//   { t: 'lobby', matches: [{ id, mode, players, bots, seats, phase }] }
//   { t: 'joined', match, mode, you, seats, replaced }   seats: [{ id, name, team, kind, body }]
//       a story room adds: mission, code, and seats for the depot's people { id, name, kind: 'enemy', type, tag, named }
//   { t: 'seats', seats }                                someone joined or left (story: people appeared or were cleared away)
//   { t: 'snap', time, ack, fighters, projectiles, flags, effects, events, view? }
//       a story room's view is the mission's (sim/mission.mjs missionView) plus room: { code, open } and againIn;
//       uses: [[id, by, progress]] for what is being used right now; idle: [id] people who have noticed nobody
//       and stand as last sent (everyone is sent in full once a second and when someone joins or appears)
//   { t: 'left' }   { t: 'error', code, message }
import { CLIENT_COMMANDS, MOVES } from '../core/index.mjs';

export const PROTOCOL = 1;
export const WS_PATH = '/ws/duelist';
export const TICK_HZ = 60;
export const SNAPSHOT_EVERY = 3; // ticks: 20 snapshots a second
export const VIEW_EVERY = 4; // snapshots: the scoreboard five times a second
export const ONLINE_MODES = Object.freeze(['duel', 'ffa', 'tdm', 'ctf']);
export const STORY_MODE = 'story';
export const CREW_SIZE = 4;
export const ROOM_CODE = /^[A-HJ-NP-Z]{5}$/; // a crew room's code: five letters, no I or O
export const MAX_MESSAGE_BYTES = 4096;
// inputs are sent at most 60 a second: messages beyond 120 a second are ignored, beyond 400 the connection closes
export const MAX_MESSAGES_PER_SECOND = 120;
export const ABUSE_MESSAGES_PER_SECOND = 400;
// the fighters a player may pick (the browser's BODIES keys)
export const BODY_IDS = Object.freeze(['maskedWarrior', 'huntress', 'female', 'male']);

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const r3 = (n) => Math.round(n * 1000) / 1000;
const r2 = (n) => Math.round(n * 100) / 100;

/** A client's input message made safe: move clamped to length 1, only known commands, at most 8 presses. */
export function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seq = Number.isInteger(raw.s) && raw.s >= 0 ? raw.s : null;
  if (seq === null) return null;
  let x = Array.isArray(raw.m) && finite(raw.m[0]) ? raw.m[0] : 0;
  let z = Array.isArray(raw.m) && finite(raw.m[1]) ? raw.m[1] : 0;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  const presses = Array.isArray(raw.p) ? raw.p.slice(0, 8).filter((c) => typeof c === 'string' && CLIENT_COMMANDS.has(c)) : [];
  return {
    seq, move: { x, z }, run: raw.r !== false, sprint: !!raw.sp, strafe: !!raw.st, interact: raw.i === 1 || raw.i === true,
    face: finite(raw.f) ? Math.atan2(Math.sin(raw.f), Math.cos(raw.f)) : null,
    presses,
  };
}

/** The browser's input object as an input message. */
export function encodeInput(seq, input) {
  return { t: 'input', s: seq, m: [r3(input.move?.x || 0), r3(input.move?.z || 0)], r: input.run !== false, sp: !!input.sprint,
    f: finite(input.face) ? r3(input.face) : null, st: !!input.strafe, i: input.interact ? 1 : undefined, p: input.presses?.length ? input.presses : undefined };
}

const FLAG_BITS = { collapsed: 1, winded: 2, dead: 4 };

/** One fighter in a snapshot (own: the receiving player's, with cooldowns). */
export function encodeFighter(f, body, { own = false } = {}) {
  const v = f.vitals;
  const a = f.action;
  return {
    id: f.id, tm: f.team || 0,
    p: [r3(body.x), r3(body.y), r3(body.z), r3(body.yaw)], sp: r2(body.speed || 0),
    md: body.motion?.dir ? [r3(body.motion.dir.x), r3(body.motion.dir.z)] : 0,
    a: a ? [a.id, r3(a.t), a.chainedFrom ? 1 : 0, a.held ? 1 : 0] : 0,
    v: [r2(v.hp), r2(v.will), r2(v.stamina), r2(v.shield), (v.collapsed ? FLAG_BITS.collapsed : 0) | (v.winded ? FLAG_BITS.winded : 0) | (v.dead ? FLAG_BITS.dead : 0)],
    g: f.guard ? r3(f.guard.since) : -1,
    su: finite(f.stunnedUntil) ? r3(f.stunnedUntil) : -1,
    du: finite(f.downUntil) ? r3(f.downUntil) : -1,
    ru: finite(f.riseUntil) ? r3(f.riseUntil) : -1,
    pu: finite(f.protectedUntil) ? r3(f.protectedUntil) : -1,
    hb: f.heldBy || 0,
    br: Object.keys(f.breaches),
    cd: own ? Object.fromEntries(Object.entries(f.cooldowns).map(([k, t]) => [k, r3(t)])) : undefined,
  };
}

/**
 * Write a snapshot fighter into a mirror world (the browser's copy it draws from): fighter and body are
 * created on first sight and updated in place (the animator keeps its references).
 */
export function applyFighter(world, data, makeFighter, makeBody) {
  let f = world.fighters.get(data.id);
  if (!f) { f = makeFighter(data.id, data.tm || null); world.fighters.set(data.id, f); }
  let b = world.bodies.get(data.id);
  if (!b) { b = makeBody(); world.bodies.set(data.id, b); }
  f.team = data.tm || null;
  const [hp, will, stamina, shield, bits] = data.v;
  Object.assign(f.vitals, { hp, will, stamina, shield, collapsed: !!(bits & FLAG_BITS.collapsed), winded: !!(bits & FLAG_BITS.winded), dead: !!(bits & FLAG_BITS.dead) });
  const t = (n) => (n < 0 ? -Infinity : n);
  f.stunnedUntil = t(data.su);
  f.downUntil = t(data.du);
  f.riseUntil = t(data.ru);
  f.protectedUntil = t(data.pu);
  f.heldBy = data.hb || null;
  f.guard = data.g >= 0 ? { since: data.g } : null;
  f.breaches = Object.fromEntries((data.br || []).map((id) => [id, Infinity]));
  if (data.cd) f.cooldowns = { ...data.cd };
  if (data.a) {
    const [id, at, chained, held] = data.a;
    if (!f.action || f.action.id !== id || at + 1e-6 < f.action.t - 0.25) f.action = { id, move: MOVES[id], t: at, nextHit: 0, held: !!held, chainedFrom: chained ? 'chain' : null };
    else { f.action.t = at; f.action.held = !!held; }
    f.action.seenAt = data.seenAt;
  } else f.action = null;
  const [x, y, z, yaw] = data.p;
  b.target = { x, y, z, yaw };
  b.speed = data.sp;
  b.moving = data.sp > 0.1;
  b.motion = data.md ? { dir: { x: data.md[0], z: data.md[1] } } : null;
  return { f, b };
}
