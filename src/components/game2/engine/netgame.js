/* eslint-disable */
// Online named FFA / team rooms, with optional host-simulated bots. The legacy WebRTC test path remains available.
//
// Authority: every player simulates their own fighter, so their moves, swings and Force answer the next frame with no
// network wait. The arena host also runs the AI Reborn. Other players' fighters are puppets driven by their snapshots
// (60 per second, unreliable channel), shown at their extrapolated current position. Effects follow the owner:
//   - a blade contact is detected by the attacker, but its dodge / parry / damage
//     is decided by the defender's owner using their live Q input and Force;
//     snapshots then show the actual blue dodge movement to other players;
//   - Force push / pull is resolved by the victim's owner (exact defender state, so counters and blocks follow w_force.c);
//   - grip, lightning and drain damage come from the caster; the victim's owner applies the lift / hurt / shock.
// Puppets get these Fighter methods replaced by messages to their owner, so the shared combat and Force code runs unchanged.
import { NetSession } from '../net/session.js';
import { RailwayGameSession } from '../net/railway.js';
import { Base44GameSession } from '../net/base44Actor.js';
import { MAX_PLAYERS } from '../net/signaling.js';
import { Fighter } from './fighter.js';
import { Force, SELECT_ORDER } from './force.js';
import { hostile } from './combat.js';
import { v3, clamp, wrapPi } from './math.js';
import { SERVER_CAPACITY } from '../net/serverRules.js';
import { reconcileRemotePosition } from '../net/remoteSmoothing.js';
import { duelRole } from '../../../../server/game2/duelLine.mjs';

// Free-for-all side is cosmetic; in Team Battle light/dark maps to hostile blue/red teams.
// AI Reborn are only available in FFA matches.
export const SIDES = {
  light: { name: 'Jedi', blade: [0.22, 0.52, 1], tint: [1, 1, 1], tintAmt: 0, css: '#7fc8ff' },
  dark: { name: 'Dark Jedi', blade: [1, 0.06, 0.05], tint: [0.12, 0.09, 0.17], tintAmt: 0.66, css: '#ff7a6a' },
};
export const RESPAWN_S = 3, SHIELD_S = 3; // back after 3 s, then 3 s of immunity
const RPC_METHODS = ['hurt', 'push', 'pullTo', 'shove', 'stagger', 'electrify', 'shock', 'grip', 'unlodgeSaber', 'levitate', 'executedBy', 'vaporize'];
const STATUS = ['normal', 'dead', 'flung', 'down', 'getup', 'gripped', 'shocked', 'roll', 'whole', 'levitated', 'executed', 'executing', 'clash', 'open'];
const HILT = ['hand', 'thigh', 'thrown', 'none'];
const TIMED = ['speed', 'rage', 'protect', 'absorb', 'see'];
const HOLD = ['', 'grip', 'lightning', 'heal', 'drain'];
// snapshot layout (NetGame.snap): field -> position
export const SN = { fid: 0, side: 1, name: 2, x: 3, y: 4, z: 5, vx: 6, vy: 7, vz: 8, yaw: 9, ayaw: 10, syaw: 11, spitch: 12, status: 13, hp: 14, maxHp: 15, legs: 16, torso: 20, move: 24, level: 25, holst: 26, lit: 27, hilt: 28, thrown: 29, fp: 30, fmax: 31, bits: 32, hold: 33, tgt: 34, duck: 35, glow: 36, flash: 37, match: 38, gripBase: 39, pitch: 40, dj: 41, legYaw: 42, kit: 43 };
const KITS = ['single', 'dual', 'staff'];
const pnow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const r3 = v => Math.round(v * 1000) / 1000;

export function applySide(f, side, team = 'ffa') {
  const S = SIDES[side] || SIDES.light; f.side = side; f.team = team; f.blade.color = S.blade.slice(); f.actor.tint = S.tint.slice(); f.actor.tintAmt = S.tintAmt;
  if (f.blade2) f.blade2.color = f.blade.color;
}

// Spawn points spread over the arena floor, clear of walls (two groups either side of the map's duel spawns).
export function arenaSpawns(world, perSide = 10) {
  const sp = world.spawns, a = sp.player, b = sp.enemy, mid = [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2];
  let u = [b[0] - a[0], 0, b[2] - a[2]]; const ul = Math.hypot(u[0], u[2]) || 1; u = [u[0] / ul, 0, u[2] / ul];
  const ok = (x, z, y0) => { const fl = world.floorAt(x, z, y0 + 0.8); if (fl == null || Math.abs(fl - y0) > 0.7) return null; const p = [x, fl, z], q = p.slice(); world.collide(q, 0.45); return Math.hypot(q[0] - p[0], q[2] - p[2]) < 0.1 ? p : null; };
  const clear = (p, q) => { for (let j = 1; j <= 10; j++) { const x = p[0] + (q[0] - p[0]) * j / 10, z = p[2] + (q[2] - p[2]) * j / 10; if (!ok(x, z, p[1])) return false; } return true; };
  let anchors = null;
  for (const d of [7, 6, 5, 4, 2.25]) { const A = ok(mid[0] - u[0] * d, mid[2] - u[2] * d, mid[1]), B = ok(mid[0] + u[0] * d, mid[2] + u[2] * d, mid[1]); if (A && B && clear(A, B)) { anchors = [A, B]; break; } }
  if (!anchors) anchors = [a.slice(), b.slice()];
  const out = [];
  for (const [A, B] of [[anchors[0], anchors[1]], [anchors[1], anchors[0]]]) {
    const yaw = Math.atan2(B[0] - A[0], B[2] - A[2]), pts = [A.slice()];
    for (const rad of [1.3, 2.4, 3.4]) for (let k = 0; k < 10 && pts.length < perSide; k++) {
      const ang = yaw + Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.42 + (rad > 2 ? 0.2 : 0), x = A[0] + Math.sin(ang) * rad, z = A[2] + Math.cos(ang) * rad;
      const p = ok(x, z, A[1]); if (p && pts.every(o => Math.hypot(o[0] - p[0], o[2] - p[2]) > 1.1) && clear(A, p)) pts.push(p);
    }
    for (const p of pts) out.push({ pos: p, yaw });
  }
  return out;
}
// the spawn point farthest from every other fighter still standing (a little random among the best three)
export function pickSpawn(points, others, rng = Math.random) {
  const score = s => others.length ? Math.min(...others.map(o => Math.hypot(o.pos[0] - s.pos[0], o.pos[2] - s.pos[2]))) : 0;
  const ranked = points.map(s => [s, score(s) + rng() * 0.5]).sort((a, b) => b[1] - a[1]);
  return ranked[Math.floor(rng() * Math.min(3, ranked.length))][0];
}

// pack an argument list for a method call on another player's fighter
export function packArgs(args) {
  const one = v => v instanceof Fighter || (v && v.fid && v.actor) ? { $f: v.fid } : typeof v === 'function' ? true : Array.isArray(v) ? v.map(x => (typeof x === 'number' ? r3(x) : one(x))) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, one(x)])) : typeof v === 'number' ? r3(v) : v;
  return args.map(one);
}
export function unpackArgs(args, byId) {
  const one = v => v && typeof v === 'object' && !Array.isArray(v) ? (v.$f ? byId(v.$f) || null : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, one(x)]))) : Array.isArray(v) ? v.map(one) : v;
  return (args || []).map(one);
}

// The Force of another player's fighter: mirrors their state for visuals, Absorb checks and breaking their grip.
// (Exported for Fleet Assault boarding, whose puppets take the same state from the match server.)
export class NetForceView extends Force {
  constructor(g, f, net) { super(g, f, { npc: true, list: SELECT_ORDER }); this.remote = true; this.net = net; this.gripBase = 0; }
  update(dt) {
    const g = this.g; this.selShow = 0;
    if (this.holding === 'lightning') { this.boltT -= dt; if (this.boltT <= 0) { this.boltT = 0.04; this.regenBolts(); } g.lightFlash = Math.max(g.lightFlash, 0.4); g.lightFlashPos = this.hands()[0]; }
    else { this.bolts.length = 0; this.ltTargets = []; }
    if ((this.holding === 'grip' || this.holding === 'drain') && this.target) { const hands = this.hands(); this.beam = { a: v3.lerp(hands[0], hands[1], 0.5), b: this.target.center(), col: this.holding === 'grip' ? [1, 0.25, 0.12] : [0.8, 0.2, 1] }; }
    else this.beam = null;
    for (const k of Object.keys(this.active)) this.tickTimed(k, dt);
  }
  aim() { const p = this.p, cp = Math.cos(p.netPitch || 0); return [Math.sin(p.yaw) * cp, -Math.sin(p.netPitch || 0), Math.cos(p.yaw) * cp]; }
  targets() { return this.g.foesOf(this.p).map(f => ({ type: 'npc', ref: f, center: () => f.chest() })); }
  addFp(n) { this.net.rpc(this.p, 'fp', [n]); }
  interrupt() { this.net.rpc(this.p, 'interrupt', []); }
  release() { // a gripped local player broke this remote grip: free now, tell the caster
    if (this.holding === 'grip' && this.target && this.target.ref && !this.target.ref.remote && this.target.ref.status === 'gripped') this.target.ref.grip(false, 0, { free: true });
    this.net.rpc(this.p, 'forceRelease', [{ brokenFree: !!this.brokenFree }]); this.brokenFree = false; this.holding = null; this.beam = null;
  }
  releaseAll() { } reset() { }
  setHolding(h) { if (h === this.holding) return; if (this.loops.hold) { this.loops.hold.stop(0.1); this.loops.hold = null; } this.holding = h || null; if (h === 'lightning') { this.loops.hold = this.g.sfx.loop('lightning2', { vol: 0.2 }); this.regenBolts(); } }
  setActive(bits) {
    const g = this.g; TIMED.forEach((id, i) => { const on = !!(bits & (1 << i)); if (on && !this.active[id]) this.active[id] = { until: Infinity, t0: g.t }; else if (!on && this.active[id]) { delete this.active[id]; if (id === 'rage') this.p.glow = 0; } });
  }
  castFx(id, d) { // one-shot sound and effect of a power the owner just used (the animation comes with the snapshots)
    const g = this.g, p = this.p, col = this.p.side === 'dark' ? [1, 0.5, 0.45] : [0.7, 0.86, 1];
    const snd = { push: 'push', pull: 'pull', grip: 'grip', lightning: 'lightning', heal: 'heal', speed: 'speed', mind: 'distract', rage: 'rage', protect: 'protect', absorb: 'absorb', drain: 'drain', see: 'see' }[id];
    if (snd) g.sfxAt(snd, p.pos, 1);
    const hands = this.hands(), mid = v3.lerp(hands[0], hands[1], 0.5);
    if (id === 'push') this.pushFx(mid, d, col); else if (id === 'pull') this.pullFx(mid, d, col); else if (id === 'mind') this.mindFx();
  }
}

export class NetGame {
  constructor(g, o) {
    this.g = g; this.o = o; this.side = o.side === 'dark' ? 'dark' : 'light';
    this.matchMode = ['ffa', 'teams', 'duel', 'team_duel'].includes(o.matchMode) ? o.matchMode : 'ffa';
    this.isHost = false; this.ai = this.matchMode === 'ffa' ? clamp(o.ai ?? 0, 0, 3) : 0;
    this.ctf = null;
    this.duelState = null; this.duelRole = null; this.duelRound = 0;
    this.defenderOwnedSaber = true; // This arena protocol routes saber defense to the actual target owner; Fleet Boarding does not.
    this.byId = new Map(); this.snaps = new Map(); this.batch = new Map(); this.lastElec = new Map(); this.saberHitUntil = new Map(); this.kd = new Map(); this.feed = [];
    this.sendEvery = 1; this.stepN = 0; this.sendMs = 0;
    // Separate opt-in comparison for multiplayer-only remote movement; default unchanged.
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    // Default to bounded remote correction for real Game 2 multiplayer.
    // ?g2netsmooth=0 restores the previous hard-snap path immediately.
    this.smoothRemote = params.get('g2netsmooth') !== '0';
    this.netDebug = params.get('g2netdebug') === '1';
    this.remoteArrival = new Map();
    this.remoteNetStats = { received: 0, outOfOrder: 0, lastGapMs: 0, maxGapMs: 0, longGaps: 0, largeCorrections: 0, hardSnaps: 0, worstCorrection: 0, lastRttMs: null };
    if (this.netDebug && typeof window !== 'undefined') window.__atomxeGame2NetStats = this.remoteNetStats;
    this.animNames = g.skel.rigJson.anims.map(a => a.name); this.animIdx = Object.fromEntries(this.animNames.map((n, i) => [n, i]));
    const L = g.world.level; // an authored arena brings its own spread of spawn points
    this.spawns = L?.ffaSpawns ? L.ffaSpawns.map(p => ({ pos: p.slice(), yaw: Math.atan2(-p[0], -p[2]) })) : arenaSpawns(g.world);
    g.net = this; g.remotes = []; g.round = { state: 'fight', t: 0 }; g.noDamage = false; // no rounds: a continuous deathmatch
    const Session = o.transport === 'base44' ? Base44GameSession :
      o.transport === 'railway' ? RailwayGameSession : NetSession;
    const S = this.session = new Session({ ...o, selfId: o.selfId, name: o.name, side: this.side, ai: this.ai });
    this.self = o.selfId;
    const P = g.player; P.fid = this.self + ':p'; applySide(P, this.side); P.label = o.name; this.byId.set(P.fid, P);
    S.onReady = (me, w) => {
      this.me = me;
      if (w && w.kd) this.kd = new Map(w.kd);
      if (S.ctf) this.updateCtf(S.ctf);
      this.syncRoster();
      if(S.duelState)this.updateDuelState(S.duelState);
      else this.spawnSelf();
      this.msg('Entered the arena');
    };
    S.onCtf = state => this.updateCtf(state);
    S.onDuelState = (state,outcome) => this.updateDuelState(state,outcome);
    S.onHostChange = (id, mine) => { const was = this.isHost; this.isHost = mine; if (mine && !was) { this.spawnAI(); if (this.me && this.session.roster.size > 1) this.msg('You are hosting the arena now'); } else if (!mine && was) this.removeAI(); };
    S.onJoin = (e) => { this.msg(e.name + ' entered the arena'); };
    S.onLeave = (id, e) => this.dropPeer(id, e);
    S.onRoster = () => {
      this.syncRoster();
      // Each human entry represents an actual player-controlled fighter, not
      // the Reborn bot. Create their 3D model immediately when the room roster
      // arrives; the first owner snapshot then moves and animates the puppet.
      for (const entry of S.list()) {
        if (entry.id === this.self) continue;
        const fid = entry.id + ':p';
        if (!this.byId.has(fid)) this.makePuppet(fid, entry.id, entry.side === 'dark' ? 'dark' : 'light', entry.name, false);
      }
      for (const [fid, f] of [...this.byId]) if (f.remote && !S.roster.has(f.owner)) this.removePuppet(fid);
    };
    S.onMessage = (from, m, rel) => this.recv(from, m, rel);
    S.onEnd = (why) => { this.ended = why; g.hud.msg(why); };
    S.onStatus = (t) => { this.statusText = t; };
    S.welcomeExtra = () => ({ kd: [...this.kd.entries()] });
    this.onHide = () => { try { S.leave(); } catch (e) { } }; if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onHide); // closing the tab leaves the arena
    this.startPromise = S.start().catch(e => { console.error('Game 2 online start failed', e); this.ended = 'Could not reach the arena: ' + (e?.message || e); });
  }
  teamFor(side, ai = false) { return ['teams','team_duel','ctf'].includes(this.session?.matchMode) ? (side === 'dark' ? 'red' : 'blue') : ai && !this.session?.custom ? 'enemy' : 'ffa'; }
  updateDuelState(state,outcome=null) {
    if(!state || !['duel','team_duel'].includes(state.mode))return;
    if(this.duelState && state.revision<this.duelState.revision)return;
    const before=this.duelRole,priorRound=this.duelRound,priorPhase=this.duelState?.phase;
    this.duelState=state;
    this.duelRole=duelRole(state,this.self);
    this.duelRound=state.round;
    const activeFight=this.duelRole==='duelist' && state.phase==='fighting' &&
      !state.fallen?.includes(this.self);
    // A waiting fighter observes from the sidelines and does not participate in
    // lethal combat. The backend independently rejects all spectator RPCs.
    this.g.noDamage=!activeFight;
    if(this.session?.state==='live' && (before!==this.duelRole ||
      (this.duelRole==='duelist'&&state.phase==='fighting' &&
        (priorRound!==state.round||priorPhase!=='fighting')))){
      this.spawnSelf();
    }
    if(outcome?.winner){
      this.msg((outcome.winner==='light'?'JEDI':'DARK JEDI')+
        ' WINS ROUND '+Math.max(1,state.round-1)+' · Winner stays');
    } else if(before!==this.duelRole && this.duelRole==='spectator'){
      this.msg('Spectating from sidelines · Waiting your turn');
    } else if(before!==this.duelRole && this.duelRole==='duelist'){
      this.msg('Your duel is ready · Enter the arena');
    }
  }
  updateCtf(state) {
    if (!state || !state.flags?.light || !state.flags?.dark) return;
    const old = this.ctf;
    this.ctf = state;
    if (old && state.revision > old.revision &&
        (state.score?.light !== old.score?.light || state.score?.dark !== old.score?.dark)) {
      this.msg('FLAG CAPTURE · JEDI ' + (state.score?.light || 0) + ' : ' + (state.score?.dark || 0) + ' DARK JEDI');
    }
    if (state.winner && old?.winner !== state.winner) {
      this.msg((state.winner === 'light' ? 'JEDI' : 'DARK JEDI') + ' WIN CAPTURE THE FLAG');
      this.g.noDamage = true;
    }
    const side = this.session?.me?.side || this.side;
    const enemy = side === 'light' ? 'dark' : 'light';
    const carried = state.flags[enemy]?.state === 'carried' && state.flags[enemy].carrier === this.self;
    this.g.player.ctfCarrierFlag = carried ? true : null;
  }
  ctfPassTargets() {
    if (!this.ctf || !this.g.player.ctfCarrierFlag || this.g.player.status === 'dead') return [];
    const p = this.g.player;
    return this.g.remotes.filter(f => f !== p && f.team === p.team &&
      f.status !== 'dead' && f.hp > 0 &&
      Math.hypot(f.pos[0]-p.pos[0], f.pos[2]-p.pos[2]) <= 16 &&
      Math.abs(f.pos[1]-p.pos[1]) <= 2.5);
  }
  tryPassFlag(target) {
    if (!target || !this.ctfPassTargets().includes(target) || !target.owner ||
        !this.session?.passCtfFlag?.(target.owner)) {
      this.msg('Carry the enemy flag and lock onto a teammate to pass [H]');
      return false;
    }
    this.msg('Passing the flag to ' + (target.label || 'teammate') + '…');
    return true;
  }
  syncRoster() {
    const S = this.session;
    this.ai = clamp(S.ai || 0, 0, SERVER_CAPACITY - 1);
    applySide(this.g.player, S.me?.side || this.side, this.teamFor(S.me?.side || this.side));
    for (const [fid, f] of [...this.byId]) {
      const bot = /:a(\d+)$/.exec(fid);
      if (f.remote && bot && (f.owner !== S.hostId || Number(bot[1]) >= this.ai)) this.removePuppet(fid);
      else if (f.remote) { const side = bot ? S.botSides?.[Number(bot[1])] || 'dark' : S.entry(f.owner)?.side || f.side; applySide(f, side, this.teamFor(side, !!bot)); }
    }
    if (this.isHost) this.syncBots();
    this.g.hud.title = S.matchMode === 'ctf' ? 'CAPTURE THE FLAG' :
      S.matchMode === 'team_duel' ? 'TEAM DUEL · 2v2' : S.matchMode === 'duel' ? 'DUEL · 1v1' : S.matchMode === 'teams' ? 'TEAM DEATHMATCH' : 'FREE-FOR-ALL';
  }
  syncBots() {
    for (const n of this.g.npcs.slice()) if (n.fid && n.aiIndex >= this.ai) { this.byId.delete(n.fid); this.g.removeNpc(n); }
    this.spawnAI();
  }
  hostPeer() { return this.session.hostId; }
  msg(t) { this.g.hud.msg(t); }
  dispose() { if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onHide); try { this.session.leave(); } catch (e) { } this.g.player.ctfCarrierFlag = null; for (const f of this.g.remotes) this.g.humStop(f); }
  // ---------------- spawning (respawn after a defeat, briefly shielded)
  others(f) { return this.g.fighters().filter(o => o !== f && o.status !== 'dead'); }
  shield(f) { f.spawnShield = this.g.t + SHIELD_S; f.glow = 0.35; f.glowCol = [0.55, 0.8, 1]; }
  spawnSelf() {
    const g = this.g, P = g.player;
    let s = pickSpawn(this.spawns, this.others(P));
    if(this.duelState){
      const safe=this.spawns;
      if(this.duelRole==='spectator'){
        // Spread spectators among authored, collision-safe arena spawn points.
        const key=[...this.self].reduce((v,c)=>v+c.charCodeAt(0),0);
        s=safe[2+(key%Math.max(1,safe.length-2))]||safe.at(-1)||s;
      }else if(this.duelRole==='duelist'){
        const team=this.session?.me?.side||this.side;
        const size=this.duelState.mode==='team_duel'?2:1;
        const ids=this.duelState.activeBySide?.[team]||[];
        const rank=Math.max(0,ids.indexOf(this.self));
        const half=Math.max(1,Math.floor(safe.length/2));
        s=safe[(team==='dark'?half:0)+(rank%Math.max(1,Math.min(size,half)))]||s;
      }
    }
    if (this.session?.matchMode === 'ctf' && g.world.level?.teamHomes) {
      const side = this.session.me?.side || this.side;
      const mine = side === 'dark' ? g.world.level.teamHomes.red : g.world.level.teamHomes.blue;
      const opponent = side === 'dark' ? g.world.level.teamHomes.blue : g.world.level.teamHomes.red;
      const roster = this.session.list().filter(entry => entry.side === side);
      const rank = Math.max(0, roster.findIndex(entry => entry.id === this.self));
      const offset = rank === 0 ? 0 : rank % 2 ? 2.4 : -2.4;
      s = { pos: [mine[0] + offset, mine[1], mine[2]], yaw: Math.atan2(opponent[0]-mine[0], opponent[2]-mine[2]) };
    }
    g.respawnPlayerAt(s.pos, s.yaw); g.readySaber(P); P.status = 'normal'; this.shield(P);
  }
  spawnAI() {
    const g = this.g;
    for (let i = 0; i < this.ai; i++) {
      let n = g.npcs.find(x => x.aiIndex === i); const s = pickSpawn(this.spawns, this.others(n));
      const side = this.session.botSides?.[i] || 'dark';
      if (n) { applySide(n, side, this.teamFor(side, true)); continue; }
      if (!n) {
        n = g.spawnArchetype('reborn', s.pos, s.yaw, { name: 'reborn' + i, label: 'Reborn' + (this.ai > 1 ? ' ' + (i + 1) : '') });
        n.aiIndex = i; n.fid = this.self + ':a' + i; applySide(n, side, this.teamFor(side, true)); this.byId.set(n.fid, n);
      }
      n.spawn = s.pos.slice(); g.respawnNpc(n); n.yaw = n.targetYaw = s.yaw; if (n.force) { n.force.reset(); n.force.fp = n.force.max; } this.shield(n);
    }
  }
  removeAI() { const g = this.g; for (const n of g.npcs.slice()) if (n.fid) { this.byId.delete(n.fid); g.removeNpc(n); } }
  // ---------------- puppets (other players' fighters)
  makePuppet(fid, owner, side, name, ai) {
    const g = this.g, s = this.spawns[0];
    side = ai ? this.session.botSides?.[Number(fid.split(':a').at(-1))] || side : this.session.entry(owner)?.side || side;
    const f = new Fighter(g, { name: fid, kind: 'remote', team: ai ? 'enemy' : 'ffa', pos: s.pos, yaw: s.yaw, hp: 100, hasSaber: true, bladeColor: SIDES[side].blade });
    f.remote = true; f.owner = owner; f.fid = fid; f.label = name || 'Jedi'; f.isPlayer = false; f.humId = 4 + g.remotes.length; f.provoked = true; applySide(f, side, this.teamFor(side, ai));
    f.force = new NetForceView(g, f, this); f.saber.holstered = true; f.hilt = 'thigh';
    for (const m of RPC_METHODS) f[m] = (...a) => { this.rpc(f, m, a); return false; };
    f.actor.setBoth('BOTH_STAND1', { blend: 0 }); g.remotes.push(f); this.byId.set(fid, f); return f;
  }
  removePuppet(fid) {
    const g = this.g, f = this.byId.get(fid); if (!f || !f.remote) return; this.byId.delete(fid); this.snaps.delete(fid); this.remoteArrival.delete(fid);
    g.humStop(f); if (f.force && f.force.loops.hold) f.force.loops.hold.stop(0.1); const i = g.remotes.indexOf(f); if (i >= 0) g.remotes.splice(i, 1);
  }
  dropPeer(id, e) { for (const [fid, f] of [...this.byId]) if (f.remote && f.owner === id) this.removePuppet(fid); if (e) this.msg(e.name + ' left the arena'); }
  // ---------------- snapshots
  layerOut(L, a) { if (!L.cur) return [-1, 0, 1, 0]; return [this.animIdx[L.name] ?? -1, r3((a.now - L.cur.t0) * L.cur.speed), r3(L.cur.speed), L.cur.loop ? 1 : 0]; }
  snap(f) {
    const a = f.actor, S = f.saber, F = this.g.forceOf(f), T = f.thrown;
    let bits = 0; if (F) TIMED.forEach((id, i) => { if (F.active[id]) bits |= 1 << i; });
    const tgt = F && F.holding && F.target && F.target.ref && F.target.ref.fid ? F.target.ref.fid : '';
    return [f.fid, f.side === 'dark' ? 1 : 0, f.label || '', r3(f.pos[0]), r3(f.pos[1]), r3(f.pos[2]), r3(f.vel[0]), r3(f.vel[1]), r3(f.vel[2]), r3(f.yaw), r3(a.yaw), r3(a.spineYaw), r3(a.spinePitch),
      Math.max(0, STATUS.indexOf(f.status)), r3(f.hp), f.maxHp, ...this.layerOut(a.legs, a), ...(a.torsoFollow || !a.torso.cur ? [-1, 0, 1, 0] : this.layerOut(a.torso, a)),
      S.move, S.level, S.holstered ? 1 : 0, f.blade.lit ? 1 : 0, Math.max(0, HILT.indexOf(f.hilt)), T ? [r3(T.pos[0]), r3(T.pos[1]), r3(T.pos[2]), r3(T.ang)] : 0,
      F ? Math.round(F.fp) : 0, F ? F.max : 100, bits, F ? Math.max(0, HOLD.indexOf(F.holding || '')) : 0, tgt, f.ducked ? 1 : 0, r3(f.glow || 0), r3(f.dmgFlash || 0), a.matchPelvis ? 1 : 0, F ? F.gripBase || 0 : 0,
      r3(f.isPlayer ? (f.cmd.aimPitch || 0) : (f.aimPitch || 0)), f.kind === 'darkjedi' ? 1 : 0, r3(a.legYaw || 0), Math.max(0, KITS.indexOf(f.saberKit || 'single'))];
  }
  localFighters() { const g = this.g, out = [g.player]; if (this.isHost) for (const n of g.npcs) if (n.fid) out.push(n); return out; }
  takeSnap(from, m) {
    const t = pnow();
    for (const e of m.f) {
      const fid = e[0]; if (this.byId.get(fid) && !this.byId.get(fid).remote) continue; // never our own
      if (!fid.startsWith(from + ':')) continue; // a player only sends their own fighters
      const bot = /:a(\d+)$/.exec(fid);
      if (bot && (from !== this.session.hostId || Number(bot[1]) >= this.ai)) continue;
      const old = this.snaps.get(fid);
      if (old && old.st > m.t) { if (this.netDebug) this.remoteNetStats.outOfOrder++; continue; } // late, out-of-order packet
      if (this.netDebug) {
        const last = this.remoteArrival.get(fid), gap = last == null ? 0 : t - last;
        this.remoteArrival.set(fid, t);
        this.remoteNetStats.received++;
        this.remoteNetStats.lastGapMs = Math.round(gap);
        this.remoteNetStats.maxGapMs = Math.max(this.remoteNetStats.maxGapMs, Math.round(gap));
        if (gap > 120) this.remoteNetStats.longGaps++;
      }
      if (!this.byId.has(fid)) { if (!this.session.roster.has(from)) continue; this.makePuppet(fid, from, e[SN.side] ? 'dark' : 'light', e[SN.name], !!e[SN.dj]); }
      this.snaps.set(fid, { e, st: m.t, at: t, from });
    }
  }
  applyLayer(f, L, idx, phase, speed, loop, isTorso) {
    const a = f.actor, name = this.animNames[idx]; if (!name) return;
    if (L.name !== name || !L.cur) { L.play(a.skel, name, a.now, { blend: 0.1, restart: true, startAt: phase / (speed || 1), speed, loop: !!loop }); if (isTorso) a.torsoFollow = false; return; }
    const cur = (a.now - L.cur.t0) * L.cur.speed; L.cur.speed = speed;
    if (!loop && Math.abs(cur - phase) > 0.12) L.cur.t0 = a.now - phase / (speed || 1); // re-sync (a restart of the same anim, or drift)
  }
  updatePuppet(f, dt) {
    const g = this.g, sn = this.snaps.get(f.fid); if (!sn) { f.actor.pos = f.pos.slice(); f.actor.update(g.t); f.updateHilt(dt); return; }
    const e = sn.e, rtt = this.session.rtt(sn.from), age = clamp((pnow() - sn.at) / 1000 + (rtt != null ? rtt / 2000 : 0.03), 0, 0.25); // extrapolate to "now" on the owner's side
    const status = STATUS[e[SN.status]] || 'normal', air = status === 'flung' || Math.abs(e[SN.vy]) > 0.01;
    const tgt = [e[SN.x] + e[SN.vx] * age, e[SN.y] + (air ? e[SN.vy] * age - 10 * age * age : 0), e[SN.z] + e[SN.vz] * age];
    if (air) { const fl = g.world.floorAt(tgt[0], tgt[2], tgt[1] + 0.5); if (fl != null && tgt[1] < fl) tgt[1] = fl; }
    const err = v3.dist(tgt, f.pos);
    if (this.netDebug) {
      this.remoteNetStats.lastRttMs = rtt == null ? null : Math.round(rtt);
      if (err > 1.5) this.remoteNetStats.largeCorrections++;
      this.remoteNetStats.worstCorrection = Math.max(this.remoteNetStats.worstCorrection, Math.round(err * 100) / 100);
    }
    if (this.smoothRemote) {
      // Avoid visible warps on late packets; preserve legitimate death-to-respawn teleports.
      const fix = reconcileRemotePosition(f.pos, tgt, dt, { forceSnap: f.status === 'dead' && status !== 'dead' });
      for (let i = 0; i < 3; i++) f.pos[i] = fix.pos[i];
      if (this.netDebug && fix.hardSnap) this.remoteNetStats.hardSnaps++;
    } else {
      // Original correction path remains the default and provides an A/B baseline.
      const k = err > 1.5 ? 1 : Math.min(1, dt * 22);
      for (let i = 0; i < 3; i++) f.pos[i] += (tgt[i] - f.pos[i]) * k;
      if (this.netDebug && err > 1.5) this.remoteNetStats.hardSnaps++;
    }
    f.vel = [e[SN.vx], e[SN.vy], e[SN.vz]]; f.yaw = f.yaw + wrapPi(e[SN.yaw] - f.yaw) * Math.min(1, dt * 25); f.targetYaw = f.yaw;
    const was = f.status; f.status = status; f.hp = e[SN.hp]; f.maxHp = e[SN.maxHp]; f.ducked = !!e[SN.duck]; f.glow = e[SN.glow]; f.glowCol = e[SN.glow] > 0.3 ? [0.55, 0.8, 1] : [1, 0.12, 0.08]; f.dmgFlash = Math.max(f.dmgFlash || 0, e[SN.flash]); f.netPitch = e[SN.pitch]; f.kind = e[SN.dj] ? 'darkjedi' : 'remote'; f.onGround = !air;
    if (status === 'dead' && was !== 'dead') { f.deadAt = g.t; g.humStop(f); }
    const S = f.saber, prevMove = S.move; S.move = e[SN.move]; S.level = e[SN.level]; S.holstered = !!e[SN.holst]; S.weaponTime = S.isActiveSwing() ? 1 : 0; S.moveStart = prevMove === S.move ? S.moveStart : g.t;
    if (S.move !== prevMove && S.inAttack(S.move)) g.onSwing(f, S.move);
    const lit = !!e[SN.lit] && status !== 'dead'; if (lit !== f.blade.lit) { f.blade.set(lit); g.sfxAt(lit ? 'saberon' : 'saberoff', f.pos, 0.6); if (lit) g.humStart(f); else g.humStop(f); }
    const kit = KITS[e[SN.kit]] || 'single'; if ((f.saberKit || 'single') !== kit) f.setSaberKit(kit); // dual sabers / saberstaff
    f.hilt = HILT[e[SN.hilt]] || 'hand'; const T = e[SN.thrown];
    if (T && f.hilt === 'thrown') { if (!f.thrown) f.thrown = { pos: [T[0], T[1], T[2]], prevPos: [T[0], T[1], T[2]], ang: T[3], hit: new Map() }; f.thrown.prevPos = f.thrown.pos; f.thrown.pos = [T[0], T[1], T[2]]; f.thrown.ang = T[3]; } else f.thrown = null;
    const F = f.force; F.fp = e[SN.fp]; F.max = e[SN.fmax]; F.setActive(e[SN.bits]); F.setHolding(HOLD[e[SN.hold]] || ''); F.gripBase = e[SN.gripBase];
    const tf = e[SN.tgt] ? this.byId.get(e[SN.tgt]) : null; F.target = tf ? { type: 'npc', ref: tf, center: () => tf.chest() } : null; F.update(dt);
    const a = f.actor, ph = (p, sp) => p + age * sp;
    const L = SN.legs, T2 = SN.torso; this.applyLayer(f, a.legs, e[L], ph(e[L + 1], e[L + 2]), e[L + 2], e[L + 3], false);
    if (e[T2] < 0) { if (!a.torsoFollow) { a.followLegs(); a.torso.cur = null; } } else this.applyLayer(f, a.torso, e[T2], ph(e[T2 + 1], e[T2 + 2]), e[T2 + 2], e[T2 + 3], true);
    a.yaw = a.yaw + wrapPi(e[SN.ayaw] - a.yaw) * Math.min(1, dt * 25); a.spineYaw = e[SN.syaw]; a.spinePitch = e[SN.spitch]; a.legYaw = e[SN.legYaw] || 0; a.matchPelvis = !!e[SN.match];
    a.pos[0] = f.pos[0]; a.pos[1] = f.pos[1]; a.pos[2] = f.pos[2]; a.update(g.t); f.updateHilt(dt);
    f.dmgFlash = Math.max(0, f.dmgFlash - dt * 2.5);
  }
  // ---------------- remote calls
  rpc(f, m, args) {
    if (!f || !f.owner) return;
    if(this.duelState && (this.duelRole!=='duelist' || this.duelState.phase!=='fighting' ||
      this.duelState.fallen.includes(this.self) || !this.duelState.active.includes(f.owner)))return;
    if (m === 'hurt' && args[1] && !args[1].remote) this.g.creditDamage(args[1], Math.min(args[0], f.hp || args[0])); // our damage on their fighter fills our Force Pulse meter
    if (m === 'hurt' && args[2] && args[2].noFlinch && !args[2].touch) { // continuous damage (lightning, drain, grip): batched for 100 ms
      const key = f.fid + '|' + (args[1] && args[1].fid || ''); const b = this.batch.get(key) || { f, from: args[1] || null, dmg: 0 }; b.dmg += args[0]; this.batch.set(key, b); return;
    }
    if (m === 'electrify') { const last = this.lastElec.get(f.fid) || -1; if (this.g.t - last < 0.1) return; this.lastElec.set(f.fid, this.g.t); args = [Math.max(args[0], 0.25)]; }
    // Some Force reactions carry no caster argument. A host simulating both teams must
    // not falsely attribute those bot reactions to its own human fighter.
    const actor = args.find(a => a?.fid && !a.remote) || args.find(a => a?.from?.fid && !a.from.remote)?.from || (this.isHost && this.ai ? null : this.g.player);
    this.session.send(f.owner, { k: 'rpc', fid: f.fid, actor: actor?.fid, m, a: packArgs(args) }, true);
  }
  flushBatch() { for (const b of this.batch.values()) if (b.dmg > 0) this.session.send(b.f.owner, { k: 'rpc', fid: b.f.fid, actor: b.from?.fid || this.g.player.fid, m: 'hurt', a: packArgs([b.dmg, b.from, { noFlinch: true }]) }, true); this.batch.clear(); }
  fx(e, d) { this.session.broadcast({ k: 'fx', e, ...d }, true); }
  carryOf(c) { return () => [c.pos[0] + Math.sin(c.yaw) * 2.4, 0, c.pos[2] + Math.cos(c.yaw) * 2.4]; }
  onRpc(from, m) {
    const g = this.g, f = this.byId.get(m.fid); if (!f || f.remote) return;
    const a = unpackArgs(m.a, id => this.byId.get(id));
    const source = this.byId.get(m.actor || (from === this.session?.hostId && this.ai ? undefined : from + ':p'));
    if(this.duelState && (this.duelRole!=='duelist' ||
      this.duelState.phase!=='fighting' ||
      (source && !this.duelState.active.includes(source.owner||this.self))))return;
    if (this.session?.matchMode === 'teams' && source && !hostile(source, f)) return;
    switch (m.m) {
      case 'saberHit': {
        // Never guess Q/Force from an interpolated remote puppet. Resolve the
        // attack on the defender's actual fighter, so a dodge moves that fighter.
        const [att, pt, touch] = a;
        if (!att || !att.remote || att.owner !== from || !Array.isArray(pt) || pt.length !== 3 ||
            pt.some(n => !Number.isFinite(n)) || f.status === 'dead' || f.spawnShield > g.t || g.noDamage) return;
        // Bound stale or forged hits to the vicinity of both participants.
        if (v3.dist(att.pos, f.pos) > 4.5 || v3.dist(pt, f.chest()) > 3.5) return;
        // A single contacted swing may be retransmitted across a short network
        // delay. Rate-limit at the victim as well as at the attacking client.
        const key = att.fid + '>' + f.fid;
        const hitUntil = this.saberHitUntil ??= new Map();
        if ((hitUntil.get(key) ?? -1) > g.t) return;
        const result = touch ? g.combat.touchHit(att, f, pt) : g.combat.bladeHit(att, f, pt);
        hitUntil.set(key, g.t + (result === 'blocked' || result === 'dodged' ? 0.3 : touch ? 0.2 : 0.1));
        if (result === 'blocked' || result === 'hit') {
          this.fx('hit', { p: pt.map(r3), blocked: result === 'blocked', touch: !!touch });
        }
        return;
      }
      case 'hurt': { const [dmg, src, o] = a; const opt = o || {}; if (f.status === 'dead' || f.spawnShield > g.t) return; if (f === g.player && g.force.active.protect) g.sfxAt('protecthit', f.pos, 0.8); f.hurt(dmg, src, opt); if (f === g.player) { g.hud.hit(dmg); g.shake(opt.touch ? 0.05 : opt.noFlinch ? 0.06 : 0.2); } return; }
      case 'push': case 'pullTo': case 'shove': case 'stagger': case 'electrify': case 'shock': if (f.spawnShield > g.t) return; f[m.m](...a); return;
      case 'unlodgeSaber': f.unlodgeSaber(); return;
      case 'levitate': { const [on, o] = a; if (on && f.spawnShield > g.t) return; f.levitate(!!on, o || {}); return; }
      case 'vaporize': { const [att] = a; if (att) f.vaporize(att); return; }
      case 'executedBy': { const [att, kind, o] = a; if (att && (kind === 'crush' || kind === 'bisect' || kind === 'dominance') && f.status !== 'dead' && !(f.spawnShield > g.t)) g.startExecution(att, f, kind, { ...(o || {}), fromNet: true }); return; }
      case 'grip': { const [on, lift, o] = a; if (on) { if (f.spawnShield > g.t) return; f.grip(true, lift, { carry: o && o.carry && o.from ? this.carryOf(o.from) : null }); } else f.grip(false, 0, o || {}); return; }
      case 'blocked': if (!f.saber.holstered && f.status === 'normal') f.saber.blocked = a[0]; return;
      case 'fp': { const F = g.forceOf(f); if (F) F.fp = clamp(F.fp + a[0], 0, F.max); return; }
      case 'interrupt': { const F = g.forceOf(f); if (F) F.interrupt(); return; }
      case 'forceRelease': { const F = g.forceOf(f); if (F && F.holding) { if (a[0] && a[0].brokenFree) F.brokenFree = true; F.release(); } return; }
      case 'distract': f.distracted = a[0]; return;
      case 'throw': { // push / pull resolved here with this fighter's exact state (CanCounterThrow + ForceThrow)
        const o = a[0] || {}, att = o.from; if (!att || f.spawnShield > g.t) return;
        const res = g.applyThrow({ p: att, lv: { push: o.lv, pull: o.lv }, dmgScale: o.dmgScale ?? 1 }, f, !!o.pull, { dir: o.dir, dist: o.dist, fall: o.fall, flatD: o.flatD, charge: o.charge || 0, local: true });
        if (res) this.session.send(from, { k: 'fx', e: 'throwRes', to: att.fid, outcome: res.outcome, reason: res.reason, pull: !!o.pull }, true);
        return;
      }
    }
  }
  onFx(from, m) {
    const g = this.g;
    switch (m.e) {
      case 'hit': g.fx.sparks(m.p, [0, 1, 0], m.touch ? 4 : m.blocked ? 14 : 10, m.blocked ? [1, 0.9, 0.55, 1] : [1, 0.5, 0.2, 1]); g.sfxAt(m.blocked ? 'block' + (1 + Math.floor(Math.random() * 9)) : 'hit' + (1 + Math.floor(Math.random() * 3)), m.p, m.touch ? 0.3 : 0.9); if (m.blocked) g.flashLight(m.p, [1, 0.9, 0.6], 0.15); return;
      case 'cast': { const f = this.byId.get(m.fid); if (f && f.remote && f.force.castFx) f.force.castFx(m.id, m.d || [0, 0, 1]); return; }
      case 'throwRes': { if (m.to !== g.player.fid) return; const T = { knockdown: ['KNOCKDOWN', [0.7, 1, 0.75]], staggered: ['PARTLY BLOCKED', [0.75, 0.95, 0.8]], hit: [(m.pull ? 'PULL' : 'PUSH') + ' HIT', [0.7, 1, 0.75]], countered: ['COUNTERED', [1, 0.65, 0.35]], absorbed: ['ABSORBED', [0.78, 0.5, 1]] }[m.outcome]; if (T) g.banner(T[0], T[1]); return; }
      case 'died': if (m.fid && String(m.fid).startsWith(from + ':')) { this.noteDeath(m.fid, m.by); const k = m.by && this.byId.get(m.by); if (k && !k.remote) g.creditKill(k); } return;
      case 'crack': if (Array.isArray(m.p) && Array.isArray(m.n)) g.addCrack(m.p, m.n, Math.min(2, Number(m.s) || 0.8)); return;
      case 'taunt': { const f = this.byId.get(m.fid); if (f && f.remote) g.onTaunt(f, m.side === 'dark' ? 'dark' : 'light', Number(m.n) || 0, true); return; }
      case 'pulse': { const f = this.byId.get(m.fid); if (f && f.remote) g.forcePulse(f, Math.min(10, Number(m.r) || 7), true); return; }
      case 'cut': { const f = this.byId.get(m.fid); if (f && f.remote && Array.isArray(m.dir)) g.cutFighter(f, { y: Number(m.y), dir: m.dir, floor: Number(m.floor), vertical: m.v === 1 }, true); return; }
    }
  }
  recv(from, m, rel) {
    if (m.k === 's') this.takeSnap(from, m);
    else if (m.k === 'rpc') this.onRpc(from, m);
    else if (m.k === 'fx') this.onFx(from, m);
  }
  // hooks from the game
  onCast(F, id) { if (F.p !== this.g.player && !(this.isHost && F.p.fid)) return; const d = F.aim(); this.fx('cast', { fid: F.p.fid, id, d: d.map(r3) }); }
  onHit(A, B, pt, o) { if (A.remote) return; this.fx('hit', { p: pt.map(r3), blocked: !!o.blocked, touch: !!o.touch }); }
  onDeath(f) {
    if (f.remote || !f.fid) return;
    if(this.duelState && this.duelRole!=='duelist')return; const by = f.killedBy && f.killedBy.fid ? f.killedBy.fid : '';
    this.fx('died', { fid: f.fid, by }); this.noteDeath(f.fid, by);
  }
  nameOf(fid) { const f = this.byId.get(fid); if (f) return f === this.g.player ? 'You' : f.label; return 'Someone'; }
  noteDeath(fid, by) {
    const d = this.kd.get(fid) || { k: 0, d: 0 }; d.d++; this.kd.set(fid, d);
    if (by && by !== fid) { const k = this.kd.get(by) || { k: 0, d: 0 }; k.k++; this.kd.set(by, k); }
    const g = this.g, mine = by === g.player.fid;
    this.feed.push({ t: (by ? this.nameOf(by) + ' defeated ' : '') + this.nameOf(fid) + (by ? '' : ' fell'), life: 5, mine }); if (this.feed.length > 5) this.feed.shift();
  }
  scoreboard() { // players (and the AI) by kills, then fewest deaths
    const rows = this.session.list().map(e => ({ fid: e.id + ':p', name: e.name, side: e.side, host: e.host, me: e.id === this.self, peer: e.id }));
    for (const f of this.g.fighters()) if (f.kind === 'darkjedi' && f.fid) rows.push({ fid: f.fid, name: f.label, side: 'dark', ai: true });
    for (const r of rows) Object.assign(r, this.kd.get(r.fid) || { k: 0, d: 0 });
    return rows.sort((a, b) => b.k - a.k || a.d - b.d);
  }
  // ---------------- per step
  beforeStep(dt) {
    const g = this.g, P = g.player; if (this.session.state !== 'live') return;
    if (P.status === 'dead' && g.t - P.deadAt > RESPAWN_S) this.spawnSelf();
    if (this.isHost) for (const n of g.npcs) if (n.fid && n.status === 'dead' && g.t - n.deadAt > RESPAWN_S) { const s = pickSpawn(this.spawns, this.others(n)); n.spawn = s.pos.slice(); g.respawnNpc(n); n.yaw = n.targetYaw = s.yaw; if (n.force) n.force.reset(); this.shield(n); }
    for (const f of this.localFighters()) if (f.spawnShield && f.spawnShield <= g.t) { f.spawnShield = 0; f.glow = 0; }
  }
  updatePuppets(dt) { for (const f of this.g.remotes) this.updatePuppet(f, dt); }
  afterStep(dt) {
    this.stepN++; if (this.session.state !== 'live') return;
    if (this.stepN % 6 === 0) this.flushBatch();
    if (this.stepN % this.sendEvery) return;
    const t0 = pnow(), fighters = this.localFighters();
    for (let i = 0; i < fighters.length; i += 5) this.session.broadcast({ k: 's', t: r3(this.g.t), f: fighters.slice(i, i + 5).map(f => this.snap(f)) }, false);
    this.sendMs = this.sendMs * 0.9 + (pnow() - t0) * 0.1;
    const count = this.session.roster.size;
    this.sendEvery = Math.max(count > 24 ? 6 : count > 12 ? 4 : count > 6 ? 3 : 2, Math.ceil(fighters.length / 10));
  }
  // Client draws only server-authored CTF markers. The engine and existing
  // flag icon style are reused; visuals never award objectives or points.
  draw(renderer) {
    if (!this.ctf) return;
    const g = this.g, color = { light:[.1,.68,1,.8], dark:[1,.19,.17,.8] };
    for (const [side, flag] of Object.entries(this.ctf.flags)) {
      const carrier = flag.carrier === this.self ? g.player : this.byId.get(flag.carrier + ':p');
      const p = flag.state === 'carried' && carrier ? carrier.pos : flag.pos;
      if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) continue;
      renderer.billboard([p[0], p[1] + (flag.state === 'carried' ? 2.9 : flag.state === 'base' ? 1.6 : .5), p[2]], .8, color[side], 0);
      if (flag.state !== 'carried') g.fx.disc([p[0], p[1]+.04, p[2]], 1.5, color[side], 1);
    }
  }
  // ---------------- HUD
  pingTo(id) { const r = this.session.rtt(id); return r == null ? null : Math.round(r); }
  myPing() { // what the player feels: the worst link to another player
    let worst = null; for (const e of this.session.roster.values()) if (e.id !== this.self) { const p = this.pingTo(e.id); if (p != null) worst = Math.max(worst ?? 0, p); } return worst;
  }
  drawHud(hud, x, W, H, dt) {
    const g = this.g, P = g.player, S = this.session, live = S.state === 'live';
    // name tags over every other fighter
    for (const f of [...g.npcs, ...g.remotes]) {
      if (f.status === 'dead') continue; const hp = f.headPos(); const s = hud.project(g.R, [hp[0], hp[1] + 0.38, hp[2]]); if (!s || s[0] < -60 || s[0] > W + 60 || s[1] < -60 || s[1] > H + 60) continue;
      const d = Math.hypot(f.pos[0] - P.pos[0], f.pos[2] - P.pos[2]); if (d > 30) continue; const sc = Math.max(0.55, Math.min(1.1, 9 / (s[2] + 4))), w = 58 * sc;
      hud.bar(x, s[0] - w / 2, s[1] - 14 * sc, w, 5 * sc + 1, f.hp / f.maxHp, ['#d92b2b', '#ff8f6a']);
      x.fillStyle = (SIDES[f.side] || SIDES.light).css; x.font = `600 ${Math.round(10 * sc + 1)}px system-ui,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'bottom'; x.fillText(f.label, s[0], s[1] - 16 * sc); x.textAlign = 'left';
    }
    // arena banner: free-for-all, leader, your kills (top centre; beside or below the saber panel on narrow screens)
    const rows = this.scoreboard(), lead = rows[0], mine = this.kd.get(P.fid) || { k: 0, d: 0 };
    const bw = 330, narrow = W < 360 + bw + 230, cx = W >= 1100 ? W / 2 : narrow ? 14 + bw / 2 : 360 + bw / 2, by = narrow ? 60 : 10; x.textAlign = 'center'; x.textBaseline = 'top';
    x.fillStyle = 'rgba(8,10,22,0.66)'; x.beginPath(); x.roundRect ? x.roundRect(cx - bw / 2, by, bw, 50, 10) : x.rect(cx - bw / 2, by, bw, 50); x.fill();
    x.font = '800 15px system-ui,sans-serif'; x.fillStyle = '#ffe2a8';
    const score = this.ctf?.score;
    const duelBanner = this.duelState
      ? (this.duelRole === 'spectator' ? 'SPECTATING · ROUND ' + this.duelState.round :
        this.duelState.phase === 'fighting' ? 'DUEL · ROUND ' + this.duelState.round :
        'WAITING FOR CHALLENGER') : null;
    x.fillText(duelBanner || (S.matchMode === 'ctf'
      ? `CTF · JEDI ${score?.light || 0} – ${score?.dark || 0} DARK JEDI`
      : ['teams', 'team_duel'].includes(S.matchMode) ? `JEDI ${S.teamScore?.light || 0}  ·  ${S.teamScore?.dark || 0} DARK JEDI`
      : (S.matchMode === 'duel' ? 'DUEL · ' : 'FREE-FOR-ALL · ') + mine.k + ' KILLS'), cx, by + 7);
    const st = !live ? (this.ended || this.statusText || 'Connecting') : S.serverName || (lead && lead.k > 0 ? 'Leader: ' + (lead.me ? 'you' : lead.name) + ' (' + lead.k + ')' : 'Lightsaber Training · first blood wins nothing but glory');
    x.font = '600 11px system-ui,sans-serif'; x.fillStyle = '#c8d4f0';
    x.fillText(this.duelState
      ? this.duelRole === 'spectator'
        ? 'Sidelines · ' + this.duelState.waiting.length + ' next in order'
        : this.duelState.phase === 'fighting'
          ? 'Winner stays · Defeated players join spectators'
          : 'Waiting for the next challenger'
      : S.matchMode === 'ctf' && this.ctf
        ? 'Jedi flag: ' + this.ctf.flags.light.state + ' · Dark flag: ' + this.ctf.flags.dark.state +
          (this.ctf.winner ? ' · MATCH COMPLETE' : ' · First to 3')
        : st, cx, by + 30); x.textAlign = 'left';
    // ping + players (top right) and the scoreboard
    const ping = this.myPing(), col = ping == null ? '#9aa6c8' : ping < 65 ? '#7dffa0' : ping < 120 ? '#ffd76a' : '#ff7a6a';
    x.textAlign = 'right'; x.font = '700 13px ui-monospace,Menlo,Consolas,monospace'; x.fillStyle = col; x.fillText(live ? (S.roster.size < 2 ? 'ARENA OPEN' : (['railway','base44'].includes(this.o.transport) ? 'SERVER ' : 'PING ') + (ping == null ? '--' : ping) + ' ms') : 'OFFLINE', W - 18, 36);
    x.font = '11px system-ui,sans-serif'; x.fillStyle = '#9aa6c8'; x.fillText(S.roster.size + '/' + (S.max || MAX_PLAYERS) + ' players' + (this.ai ? ' · ' + this.ai + ' AI' : '') + ' · ' + (60 / this.sendEvery) + ' Hz', W - 18, 54);
    let y = 74; for (const r of rows.slice(0, 12)) {
      const p = r.me || r.ai ? null : this.pingTo(r.peer);
      x.fillStyle = r.me ? '#ffe2a8' : (SIDES[r.side] || SIDES.light).css; x.fillText((r.me ? '▶ ' : '') + r.name + (r.ai ? ' (AI)' : '') + '   ' + r.k + ' / ' + r.d + (r.me || r.ai ? '' : '   ' + (p == null ? (S.direct(r.peer) ? '--' : 'relay') : p + 'ms')), W - 18, y); y += 15;
    }
    x.textAlign = 'left';
    // kill feed
    for (const k of this.feed) k.life -= dt; this.feed = this.feed.filter(k => k.life > 0);
    x.textAlign = 'right'; x.font = '600 12px system-ui,sans-serif'; this.feed.forEach((k, i) => { x.globalAlpha = Math.min(1, k.life); x.fillStyle = k.mine ? '#ffe2a8' : '#e8ecff'; x.fillText(k.t, W - 18, y + 8 + i * 16); }); x.globalAlpha = 1; x.textAlign = 'left';
    hud.drawBanners(x, W, H, dt); hud.drawGripHint(g, x, W, H);
    if (P.status === 'dead' && live) { x.textAlign = 'center'; x.font = '700 22px system-ui,sans-serif'; x.fillStyle = '#ffd8d0'; x.fillText('Defeated — back in ' + Math.max(1, Math.ceil(RESPAWN_S - (g.t - P.deadAt))), W / 2, H * 0.36); x.textAlign = 'left'; }
    else if (P.spawnShield > g.t) { x.textAlign = 'center'; x.font = '600 13px system-ui,sans-serif'; x.fillStyle = '#bfe3ff'; x.fillText('Spawn protection', W / 2, H * 0.36); x.textAlign = 'left'; }
    if (!live) { x.fillStyle = 'rgba(5,6,12,0.55)'; x.fillRect(0, H * 0.4, W, 64); x.textAlign = 'center'; x.font = '700 18px system-ui,sans-serif'; x.fillStyle = this.ended ? '#ffb4a8' : '#dfeaff'; x.fillText(this.ended || (this.statusText || 'Connecting') + '…', W / 2, H * 0.4 + 24); x.font = '12px system-ui,sans-serif'; x.fillStyle = '#9aa6c8'; x.fillText(this.ended ? 'Use the Lobby button to go back' : (this.o.transport === 'railway' ? 'Railway real-time WebSocket connection' : 'Direct peer-to-peer connection'), W / 2, H * 0.4 + 46); x.textAlign = 'left'; }
  }
}
