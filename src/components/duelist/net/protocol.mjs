// Duelist Adventure's wire protocol: JSON over one WebSocket, shared by the browser and the match server.
// The server owns the match (sim/match.mjs); a browser only says what its player presses and draws what
// the server sends back.
//
// client -> server
//   { t: 'hello', v, token, name, body, resume? }  sign in (token checked by the server) and pick a fighter;
//                                                resume: { match, key } from an earlier 'joined': back to that seat
//   { t: 'lobby' }                               the open matches
//   { t: 'join', mode }                          'duel' | 'ffa' | 'ctf' | 'football' | 'tdm' | 'control'
//                                                or 'online' (random TDM, CTF or Three-Point Control)
//                                                or legacy 'any' (busiest occupied match)
//   { t: 'join', mode: 'story', mission?, code?, create?, open?, matchId? } a story mission (sim/mission.mjs
//                                                MISSIONS; default Contraband): a crew room by its code (whatever it
//                                                plays), a new room of your own (create; open: listed for others), a
//                                                listed crew (matchId), or none of these: any open crew playing it
//   { t: 'join', ..., cls? }                      cls: the class to fight as (core/classes.mjs CLASS_IDS)
//   { t: 'class', id }                           change class: queued for the next spawn (allowed before the fight,
//                                                between rounds or while down; answered { t: 'class', ok, pending, reason })
//   { t: 'storySupply', id }                     request one free recovery supply in an active story operation;
//                                                server derives seat ID and validates missing resources (no match gold)
//   { t: 'input', s, m: [x, z], r, sp, f, st, i, p, tg }  seq, move, run, sprint, face (yaw or null), strafe,
//                                                interact held (story), presses (ability1-4 and special too)
//   { t: 'leave' }
// server -> client
//   { t: 'welcome', id, name, resumed }          resumed: back in the seat (its 'joined', resumed: true, follows)
//   { t: 'lobby', matches: [{ id, mode, players, bots, seats, phase }] }
//   { t: 'joined', match, mode, you, seats, replaced, key }   seats: [{ id, name, team, kind, body, away? }];
//       key: comes back to this seat after a dropped connection (a fresh one each time), for RECONNECT_SECONDS
//       a story room adds: mission, code, and seats for the depot's people { id, name, kind: 'enemy', type, tag, named }
//       and the crew's allies { id, name, kind: 'ally', type, tag }; a finished mission's crew is sent the next
//       mission's 'joined' (rematch: true, mission: the next one)
//   { t: 'seats', seats }                                someone joined or left (story: people appeared or were cleared away)
//   { t: 'snap', time, ack, fighters, projectiles, flags, effects, events, view?, own? }
//       view.controlPoints: [{ id, x, z, owner, capturing, progress, contested }] in Three-Point Control;
//       view.teamScores: authoritative percentages from 0 to 100
//       ack: the last input the simulation has used (inputs are used one a tick, in order);
//       own: the receiving player's fighter in full at that moment (encodeOwn), sent while the server is
//       acting on that player's inputs: the browser carries on from it by the same rules (net/predict.mjs)
//       a story room's view is the mission's (sim/mission.mjs missionView) plus room: { code, open } and againIn;
//       uses: [[id, by, progress]] for what is being used right now; idle: [id] people who have noticed nobody
//       and stand as last sent (everyone is sent in full once a second and when someone joins or appears)
//   { t: 'storySupply', ok, id?, reason?, stat?, value? }  result sent only to the requesting story player
//   { t: 'left' }   { t: 'error', code, message }
//   every view adds away: [ids] (players whose connection dropped: a bot or the autopilot plays their seat)
// close codes: 4401 not signed in, 4409 signed in elsewhere, 4410 the seat went on in a newer connection,
// 4426 a page from before an update, 4429 too many messages
import { CLIENT_COMMANDS, MOVES, EFFECT_BITS, effectsFromBits, moveFor, itemBonuses } from '../core/index.mjs';

export const PROTOCOL = 14; // 14: shared multilevel PvP arena layouts; old clients must reload.
// // 13: input tg (the fighter locked on to) for targeted abilities; Mind Dominance, taunt, air dash per jump
// 11: the sword's directional cuts in three modes; 10: active relic commands and timed stasis/anchor state
export const WS_PATH = '/ws/duelist';
export const TICK_HZ = 60;
// A player's inputs wait for their tick in order, one used a tick. More than this many waiting (a burst after
// a stall) and the oldest are skipped, their presses kept, so the fighter never runs long behind its player.
export const MAX_WAITING_INPUTS = 5;
// A dropped connection keeps its seat this long (server seconds); the browser keeps trying for as long.
export const RECONNECT_SECONDS = 30;
export const KEPT_WAITING_INPUTS = 2;
export const SNAPSHOT_EVERY = 3; // ticks: 20 snapshots a second
export const VIEW_EVERY = 4; // snapshots: the scoreboard five times a second
export const ONLINE_MODES = Object.freeze(['duel', 'ctf', 'football', 'tdm', 'control', 'escort']);
// Online is a quick-match action, not a match ruleset or permanent server.
export const QUICKPLAY_MODES = Object.freeze(['tdm', 'ctf', 'control']);
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
    // the fighter the player is locked on to (an id; the world checks it qualifies before an ability takes it)
    target: typeof raw.tg === 'string' && raw.tg.length > 0 && raw.tg.length <= 64 ? raw.tg : null,
  };
}

/** The browser's input object as an input message. */
export function encodeInput(seq, input) {
  return { t: 'input', s: seq, m: [r3(input.move?.x || 0), r3(input.move?.z || 0)], r: input.run !== false, sp: !!input.sprint,
    f: finite(input.face) ? r3(input.face) : null, st: !!input.strafe, i: input.interact ? 1 : undefined, p: input.presses?.length ? input.presses : undefined,
    tg: typeof input.target === 'string' && input.target ? input.target : undefined };
}

const FLAG_BITS = { collapsed: 1, winded: 2, dead: 4 };
// which lasting effects a fighter has (core/abilities.mjs EFFECT_BITS), from its effects
const effectFlags = (f) => Object.keys(f.effects || {}).reduce((bits, kind) => bits | (EFFECT_BITS[kind] || 0), 0);

/** One fighter in a snapshot (own: the receiving player's, with cooldowns). */
export function encodeFighter(f, body, { own = false } = {}) {
  const v = f.vitals;
  const a = f.action;
  return {
    id: f.id, tm: f.team || 0,
    p: [r3(body.x), r3(body.y), r3(body.z), r3(body.yaw)], sp: r2(body.speed || 0),
    flight: body.jumped ? [body.airJumpAt ?? null] : null,
    md: body.motion?.dir ? [r3(body.motion.dir.x), r3(body.motion.dir.z)] : 0,
    a: a ? [a.id, r3(a.t), a.chainedFrom ? 1 : 0, a.held ? 1 : 0] : 0,
    v: [r2(v.hp), r2(v.will), r2(v.stamina), r2(v.shield), (v.collapsed ? FLAG_BITS.collapsed : 0) | (v.winded ? FLAG_BITS.winded : 0) | (v.dead ? FLAG_BITS.dead : 0)],
    g: f.guard ? r3(f.guard.since) : -1,
    su: finite(f.stunnedUntil) ? r3(f.stunnedUntil) : -1,
    si: finite(f.staggerImmuneUntil) ? r3(f.staggerImmuneUntil) : -1,
    du: finite(f.downUntil) ? r3(f.downUntil) : -1,
    ru: finite(f.riseUntil) ? r3(f.riseUntil) : -1,
    pu: finite(f.protectedUntil) ? r3(f.protectedUntil) : -1,
    hb: f.heldBy || 0,
    br: Object.keys(f.breaches),
    c: f.classId || 0, mb: f.matchBoost || 0, it: f.items || [], st: Number.isFinite(f.activeRelicUntil) ? r3(f.activeRelicUntil) : null,
    fx: effectFlags(f),
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
  f.staggerImmuneUntil = finite(data.si) ? t(data.si) : -Infinity;
  f.downUntil = t(data.du);
  f.riseUntil = t(data.ru);
  f.protectedUntil = t(data.pu);
  f.heldBy = data.hb || null;
  f.guard = data.g >= 0 ? { since: data.g } : null;
  f.breaches = Object.fromEntries((data.br || []).map((id) => [id, Infinity]));
  f.classId = data.c || null;
  f.matchBoost = Math.max(0, Math.min(3, Math.floor(data.mb) || 0));
  f.items = Array.isArray(data.it) ? data.it.map((x) => ({ id: x.id, tier: x.tier })) : [];
  f.shopStats = itemBonuses(f.items);
  f.activeRelicUntil = Number.isFinite(data.st) ? data.st : -Infinity;
  f.effects = effectsFromBits(data.fx || 0);
  if (data.cd) f.cooldowns = { ...data.cd };
  if (data.a) {
    const [id, at, chained, held] = data.a;
    if (!f.action || f.action.id !== id || at + 1e-6 < f.action.t - 0.25) f.action = { id, move: MOVES[id], t: at, nextHit: 0, held: !!held, chainedFrom: chained ? 'chain' : null };
    else { f.action.t = at; f.action.held = !!held; }
    f.action.seenAt = data.seenAt;
  } else f.action = null;
  const [x, y, z, yaw] = data.p;
  b.jumped = !!data.flight;
  b.airJumpAt = data.flight?.[0] ?? null;
  b.target = { x, y, z, yaw };
  b.speed = data.sp;
  b.moving = data.sp > 0.1;
  b.motion = data.md ? { dir: { x: data.md[0], z: data.md[1] } } : null;
  return { f, b };
}

// ---- the receiving player's own fighter, in full
// Positions travel to a hundredth of a millimetre. Times travel exactly: the rules compare them with
// thresholds (six ticks of a sixtieth sit right on a tenth of a second), and a rounded clock would decide a
// tick differently from the server.
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const when = (n) => (n === -Infinity ? null : n === Infinity ? 'inf' : n);
const then = (n) => (n === null || n === undefined ? -Infinity : n === 'inf' ? Infinity : n);
const times = (map) => Object.fromEntries(Object.entries(map).map(([k, t]) => [k, when(t)]));
const untimes = (map) => Object.fromEntries(Object.entries(map || {}).map(([k, t]) => [k, then(t)]));

/**
 * Everything the rules keep about one fighter and its body at world time `time`: enough for the player's
 * browser to carry on from this moment by the same rules (net/predict.mjs). Only ever sent to that player.
 */
export function encodeOwn(f, body, time) {
  const v = f.vitals;
  const a = f.action;
  const m = body.motion;
  return {
    at: time, w: f.weapon,
    v: [r5(v.hp), r5(v.stamina), r5(v.will), r5(v.shield), v.collapsed ? 1 : 0, v.winded ? 1 : 0, v.dead ? 1 : 0,
      when(v.collapsedAt), when(v.lastStaminaSpend), when(v.lastWillSpend), when(v.lastShieldHit)],
    mx: [v.max.hp, v.max.stamina, v.max.will, v.max.shield],
    a: a ? [a.id, a.t, a.nextHit, a.held ? 1 : 0, a.chainedFrom || 0, a.link || 1, a.from || 0] : 0,
    cd: times(f.cooldowns),
    bf: f.buffer ? [f.buffer.command, f.buffer.at, f.buffer.direction || 0] : 0,
    g: f.guard ? f.guard.since : null,
    t: [when(f.stunnedUntil), when(f.protectedUntil), when(f.downUntil), when(f.riseUntil)],
    hi: [f.recentStaggerHits, when(f.lastStaggerHitAt), when(f.staggerImmuneUntil)],
    hb: f.heldBy || 0,
    br: times(f.breaches),
    b: [r5(body.x), r5(body.y), r5(body.z), r5(body.yaw), r5(body.vy), r5(body.kx), r5(body.kz)],
    ad: [body.jumped ? 1 : 0, body.airDashReady ? 1 : 0, null, body.airJumpAt ?? null],
    cl: f.classId || 0, lv: f.level || 1, md: f.mode || 0, mb: f.matchBoost || 0, it: f.items || [],
    re: [when(f.activeRelicUntil), when(f.activeRelicCooldownUntil),
      f.activeAnchorAt ? [f.activeAnchorAt.x, f.activeAnchorAt.z, f.activeAnchorAt.until, f.activeAnchorAt.y ?? null] : null],
    mt: f.meter || 0, sg: f.specialTarget || 0,
    fx: Object.fromEntries(Object.entries(f.effects || {}).map(([k, e]) => [k, { ...e, until: when(e.until) }])),
    // the current move's root motion: following its clip, or a set distance along a direction
    m: !m ? 0 : m.clip ? [m.id, 1, r5(m.forward), r5(m.right)] : [m.id, 0, r5(m.dir.x), r5(m.dir.z), m.from, m.to, m.distance, r5(m.done), r5(m.baseY ?? 0)],
  };
}

/** Write encodeOwn's data into a fighter and its body (both replaced in every respect the rules read). */
export function applyOwn(f, body, data) {
  const v = f.vitals;
  const [hp, stamina, will, shield, collapsed, winded, dead, collapsedAt, lastStaminaSpend, lastWillSpend, lastShieldHit] = data.v;
  Object.assign(v, { hp, stamina, will, shield, collapsed: !!collapsed, winded: !!winded, dead: !!dead, collapsedAt: then(collapsedAt),
    lastStaminaSpend: then(lastStaminaSpend), lastWillSpend: then(lastWillSpend), lastShieldHit: then(lastShieldHit) });
  v.max = { hp: data.mx[0], stamina: data.mx[1], will: data.mx[2], shield: data.mx[3] };
  f.weapon = data.w;
  f.classId = data.cl || null;
  f.level = data.lv || 1; // saved mastery, never controls combat
  f.matchBoost = Math.max(0, Math.min(3, Math.floor(data.mb) || 0)); // authoritative per-match combat rank
  f.items = Array.isArray(data.it) ? data.it.map((x) => ({ id: x.id, tier: x.tier })) : [];
  f.shopStats = itemBonuses(f.items); // exact item bonuses match server before reconstructing moves
  f.activeRelicUntil = then(data.re?.[0]);
  f.activeRelicCooldownUntil = then(data.re?.[1]);
  f.activeAnchorAt = data.re?.[2] ? { x: data.re[2][0], z: data.re[2][1], until: data.re[2][2], ...(Number.isFinite(data.re[2][3]) ? {y:data.re[2][3]} : {}) } : null;
  f.mode = data.md || 'balanced';
  f.action = data.a ? { id: data.a[0], move: moveFor(f, data.a[0]), t: data.a[1], nextHit: data.a[2], held: !!data.a[3], chainedFrom: data.a[4] || null, link: data.a[5] || 1, from: data.a[6] || 0 } : null;
  f.cooldowns = untimes(data.cd);
  f.buffer = data.bf ? { command: data.bf[0], at: data.bf[1], direction: data.bf[2] || null } : null;
  f.guard = data.g === null || data.g === undefined ? null : { since: data.g };
  [f.stunnedUntil, f.protectedUntil, f.downUntil, f.riseUntil] = data.t.map(then);
  f.recentStaggerHits = Math.max(0, Math.min(2, Math.floor(data.hi?.[0]) || 0));
  f.lastStaggerHitAt = then(data.hi?.[1]);
  f.staggerImmuneUntil = then(data.hi?.[2]);
  f.heldBy = data.hb || null;
  f.breaches = untimes(data.br);
  f.classId = data.cl || null;
  f.meter = data.mt || 0;
  f.specialTarget = data.sg || null;
  f.effects = Object.fromEntries(Object.entries(data.fx || {}).map(([k, e]) => [k, { ...e, until: then(e.until) }]));
  f.events = [];
  const [x, y, z, yaw, vy, kx, kz] = data.b;
  Object.assign(body, { x, y, z, yaw, vy, kx, kz,
    airJumpAt: Number.isFinite(data.ad?.[3]) ? data.ad[3] : null, jumped: !!data.ad?.[0], airDashReady: !!data.ad?.[1] });
  const m = data.m;
  body.motion = !m ? null : m[1] ? { id: m[0], clip: true, forward: m[2], right: m[3] }
    : { id: m[0], dir: { x: m[2], z: m[3] }, from: m[4], to: m[5], distance: m[6], done: m[7], baseY: m[8] ?? 0 };
  return { f, body };
}
