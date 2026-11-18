// Fleet Assault client state. The server is the authority; this keeps the player's own ship responsive the way Quake 3
// (and so Jedi Outcast) does: input becomes fixed-length commands, the ship is predicted with the server's own flight
// code, every snapshot resets it to the server's state and the unacknowledged commands are replayed on top. Other ships
// are drawn a little in the past, between two snapshots, so they move smoothly.
import { CLASS_BY_CODE, CRUISER, ROLE_IDS, SIDES, SUBSYSTEM_IDS, TIER_CODES } from '../../../../../server/game2/fleet/rules.mjs';
import { boltVelocity, cloneFlight, muzzleOf, stepShip } from '../../../../../server/game2/fleet/flight.mjs';
import { add, addScaled, dist, dot, forwardOf, len, lerp3, norm, qnorm, qslerp, scale, sub } from '../../../../../server/game2/fleet/vec.mjs';

export const CMD_MS = 16;          // one command per 16 ms of flight
export const SEND_EVERY_MS = 33;   // commands go out ~30 times a second, the last two repeated for packet loss
export const INTERP_MS = 120;      // other ships are drawn this far behind the newest snapshot
const STATES = ['active', 'spooling', 'escaped', 'destroyed'];
const TIERS = Object.keys(TIER_CODES).sort((a, b) => TIER_CODES[a] - TIER_CODES[b]);
const GROUND_PHASES = ['pending', 'open', 'closed'];
const BOLT_LIFE = { 0: 1500, 1: 2600 };

export class FleetClient {
  constructor(transport, { now = () => performance.now() } = {}) {
    this.t = transport;
    this.now = now;
    this.me = null; this.welcome = null; this.phase = 'connecting'; this.ended = null; this.result = null;
    this.ships = new Map(); this.cruisers = new Map(); this.missiles = new Map(); this.bodies = []; this.asteroids = [];
    this.sides = {}; this.ground = null; this.charges = []; this.left = null; this.warmupIn = null;
    this.you = null; this.pred = null; this.prevPred = null; this.predCls = null; this.alpha = 0;
    this.pending = []; this.unsent = []; this.resend = []; this.seq = 0; this.acc = 0; this.lastSend = -1e9;
    this.errOffset = [0, 0, 0]; this.corrections = 0;
    this.bolts = []; this.effects = []; this.feed = []; this.toasts = []; this.events = [];
    this.names = new Map(); this.board = null; this.lockTarget = 0; this.hitFlash = 0; this.hurtFlash = 0;
    this.snapCount = 0; this.listeners = new Set(); this.relayListeners = new Set();
    transport.onMessage = m => this.receive(m);
    transport.onClose = reason => { this.ended = this.ended || reason || 'Disconnected'; };
  }
  start() { return this.t.start(); }
  close() { this.t.close(); }
  send(msg) { return this.t.send({ t: 'fleet', ...msg }); }
  // every server event, as it arrives (the boarding view listens; returns the unsubscribe function)
  addListener(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  // the body-state relay aboard ('fr' poses, 'ff' effects), as it arrives (returns the unsubscribe function)
  onRelay(fn) { this.relayListeners.add(fn); return () => this.relayListeners.delete(fn); }

  // ---- incoming -----------------------------------------------------------------------------------------------------
  receive(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'fw':
        this.welcome = m; this.me = m.you; this.phase = m.phase;
        for (const c of m.cruisers) this.names.set(c.eid, c.name);
        this.asteroids = (m.asteroids || []).map(([id, x, y, z, r, seed]) => ({
          id, p: [x / 10, y / 10, z / 10], r: r / 10, seed,
        }));
        break;
      case 'fs': this.onSnapshot(m); break;
      case 'fe': for (const e of m.ev || []) this.onEvent(e); break;
      case 'fb':
        this.board = m;
        for (const p of m.players) this.names.set(p[0], p[1]);
        if (m.result) this.result = m.result;
        break;
      case 'fp': this.send({ c: 'pong', id: m.id }); break;
      case 'fv': this.onVoice?.(m.from, m.sig); break;
      case 'fr': case 'ff': for (const fn of this.relayListeners) fn(m); break;
      case 'fx': this.ended = m.reason || 'Match over'; break;
      case 'welcome': this.ended = 'This server does not run Fleet Assault yet'; this.t.close(); break;
      case 'error': this.ended = m.message || 'The server refused the connection'; break;
      default: break;
    }
  }
  onSnapshot(s) {
    const T = this.now();
    this.snapCount++;
    this.phase = s.phase; this.left = s.left; this.warmupIn = s.warmupIn; this.snapAt = T;
    const seen = new Set();
    for (const e of s.s || []) {
      const [eid, cls, sc, x, y, z, qx, qy, qz, qw, speed, flags, hp, shield] = e;
      seen.add(eid);
      let sh = this.ships.get(eid);
      if (!sh) { sh = { eid, buf: [] }; this.ships.set(eid, sh); }
      sh.cls = CLASS_BY_CODE[cls]; sh.side = SIDES[sc]; sh.flags = flags; sh.hp = hp; sh.shield = shield ?? 0; sh.speed = speed; sh.lastSeen = T;
      sh.buf.push({ t: T, p: [x / 10, y / 10, z / 10], q: qnorm([qx / 1e4, qy / 1e4, qz / 1e4, qw / 1e4]) });
      if (sh.buf.length > 8) sh.buf.shift();
    }
    for (const eid of [...this.ships.keys()]) if (!seen.has(eid)) this.ships.delete(eid);
    for (const c of s.c || []) {
      const [eid, sc, x, y, z, yaw, hull, shields, ...rest] = c;
      const subs = Object.fromEntries(SUBSYSTEM_IDS.map((k, i) => [k, rest[i]]));
      const [state, garrison, cmdrHp, tier, defeats, flags] = rest.slice(SUBSYSTEM_IDS.length);
      const prev = this.cruisers.get(eid);
      this.cruisers.set(eid, {
        eid, side: SIDES[sc], p: [x / 10, y / 10, z / 10], yaw: yaw / 1000, hull, shields, subs, state: STATES[state], garrison,
        cmdrHp, tier: TIERS[tier], defeats, leaderless: !!(flags & 1), collapsed: !!(flags & 2), spooling: !!(flags & 4), humanCommander: !!(flags & 8),
        name: this.names.get(eid) || 'Cruiser', shieldHitAt: prev && shields < prev.shields ? T : prev?.shieldHitAt ?? 0,
      });
    }
    const ms = new Map();
    for (const [id, x, y, z, target] of s.m || []) {
      const prev = this.missiles.get(id);
      ms.set(id, { id, target, p: [x / 10, y / 10, z / 10], from: prev ? prev.p : [x / 10, y / 10, z / 10], at: T });
    }
    this.missiles = ms;
    (s.sd || []).forEach((d, i) => { this.sides[SIDES[i]] = { tickets: d[0], strength: d[1] / 1000, score: d[2], buff: !!d[3], voice: !!d[4] }; });
    if (s.g) this.ground = { phase: GROUND_PHASES[s.g[0]], arrays: { republic: s.g[1], separatist: s.g[2] }, winner: s.g[3] >= 0 ? SIDES[s.g[3]] : (s.g[3] === -1 ? null : undefined), timer: s.g[4] };
    this.charges = (s.ch || []).map(([area, station, sc, left]) => ({ area, station, side: SIDES[sc], left }));
    this.bodies = s.b || [];
    // bolts others fired: shown from the moment the ships that fired them are drawn
    for (const [owner, x, y, z, vx, vy, vz, kind] of s.bo || []) {
      if (this.me && owner === this.me.eid) continue; // ours are predicted
      const shooter = this.ships.get(owner) || this.cruisers.get(owner);
      this.bolts.push({ p: [x / 10, y / 10, z / 10], v: [vx, vy, vz], born: T + INTERP_MS - 33, life: BOLT_LIFE[kind] || 1500, side: shooter?.side, kind });
    }
    if (this.bolts.length > 1500) this.bolts.splice(0, this.bolts.length - 1500);
    if (s.you) this.reconcile(s.you);
  }
  reconcile(you) {
    const wasAlive = !!this.pred;
    this.you = you;
    if (this.me) { this.me.role = you.r; this.me.theater = you.th; }
    if (!you.f) { this.pred = null; this.prevPred = null; this.pending = []; return; }
    const cls = CLASS_BY_CODE[you.cls];
    const old = this.pred;
    const s = cloneFlight(you.f);
    this.pending = this.pending.filter(c => c.seq > you.seq);
    for (const c of this.pending) stepShip(s, cls, c);
    // s is where the server's state plus our unacknowledged commands puts us now; old is what we predicted for the
    // same command. With the same code on both sides they match; a difference is a real correction.
    const err = old && wasAlive && this.predCls === cls ? sub(old.p, s.p) : null;
    if (err && len(err) > 0.05) this.corrections++;
    if (err && len(err) < 60) { // small: keep drawing where we were and let the offset fade
      this.errOffset = add(this.errOffset, err);
      this.prevPred = { ...cloneFlight(this.prevPred), p: sub(this.prevPred.p, err) };
    } else { // first state, respawn, or a big jump: take it as it is
      this.errOffset = [0, 0, 0];
      this.prevPred = cloneFlight(s);
      this.alpha = 1;
    }
    this.pred = s; this.predCls = cls;
  }
  onEvent(e) {
    const T = this.now();
    this.events.push(e);
    if (this.events.length > 200) this.events.shift();
    for (const fn of this.listeners) fn(e);
    const name = eid => (eid ? this.names.get(eid) || 'Pilot ' + eid : null);
    const mine = this.me?.eid;
    switch (e.e) {
      case 'kill': {
        const at = e.at ? e.at.map(v => v / 10) : null;
        if (at) this.effects.push({ kind: 'explosion', p: at, t: T + INTERP_MS, size: 18, life: 1100 });
        if (e.victim === mine) { this.pred = null; this.hurtFlash = 1; }
        const how = e.how === 'crash' ? 'crashed' : e.how === 'edge' ? 'was lost beyond the battlefield' : e.how === 'field' ? 'hit a hangar force field' : null;
        this.pushFeed(how ? name(e.victim) + ' ' + how : (name(e.killer) || 'Turret fire') + ' destroyed ' + name(e.victim), e.killer === mine ? 'good' : e.victim === mine ? 'bad' : '');
        break;
      }
      case 'hit': this.hitFlash = 1; break;
      case 'hurt': this.hurtFlash = Math.min(1, this.hurtFlash + 0.35); break;
      case 'shield-hit': this.events.push({e:'shield-impact'}); break;
      case 'shield-rebuff': this.pushToast('Ship shield restored'); this.events.push({e:'shield-rebuff'}); break;
      case 'spawn': if (e.theater === 'interior' && e.area && this.cruisers.get(+e.area.slice(5))?.side !== this.me?.side) this.boardedAt = { at: T, name: this.names.get(+e.area.slice(5)) };
        if (e.theater === 'space') this.pushToast('Launched from ' + (this.names.get(e.home) || 'your cruiser')); else if (e.theater === 'interior') this.pushToast(e.area && this.cruisers.get(+e.area.slice(5))?.side !== this.me?.side ? 'Aboard the enemy cruiser' : 'Defending your cruiser from inside'); else if (e.theater === 'ground') this.pushToast('Landed on the planet: destroy the enemy communications array'); break;
      case 'field': this.pushToast('The hangar force field is up: knock their shields down first'); break;
      case 'asteroid-impact': if (e.p) this.effects.push({ kind: 'explosion', p: e.p.map(v => v / 10), t: T, size: 22, life: 520 }); break;
      case 'shields': this.pushFeed(this.names.get(e.cruiser) + ': shields down', 'warn'); break;
      case 'subsystem': this.pushFeed(this.names.get(e.cruiser) + ': ' + CRUISER.subsystems[e.sub].name.toLowerCase() + ' destroyed', 'warn'); break;
      case 'cruiser': {
        const c = this.cruisers.get(e.cruiser);
        if (c) this.effects.push({ kind: 'explosion', p: c.p, t: T, size: 600, life: 4000 });
        this.pushFeed(this.names.get(e.cruiser) + ' destroyed', 'big');
        break;
      }
      case 'commander': this.pushFeed(this.names.get(e.cruiser) + ': commander defeated' + (e.final ? ' for good' : ''), 'big'); break;
      case 'boarded': this.pushFeed(name(e.player) + ' boarded ' + this.names.get(e.cruiser), 'warn'); break;
      case 'charge': this.pushFeed('Charge planted on ' + e.station.replace('array:', 'the array of the ') + (e.area === 'ground' ? '' : ' aboard ' + this.names.get(+e.area.slice(5))), 'warn'); break;
      case 'detonate': this.pushFeed('Charge detonated: ' + e.station.replace('array:', 'array '), 'big'); break;
      case 'defused': this.pushFeed(name(e.by) + ' defused a charge', ''); break;
      case 'ground-open': this.pushToast('The planet is open: ground strike teams, destroy the enemy communications array'); break;
      case 'ground': this.pushToast(e.winner ? (e.winner === this.me?.side ? 'Our team destroyed their array: we have the buff for the rest of the match' : 'They destroyed our array: their team has the buff') : 'Neither array fell: no buff this match'); break;
      case 'voice': if (e.side === this.me?.side) this.pushToast('Our team voice is down for the rest of the match'); break;
      case 'jump': this.pushFeed(this.names.get(e.cruiser) + (e.escaped ? ' jumped to hyperspace' : e.cancelled ? ': jump cancelled' : ' is spooling its hyperdrive'), 'warn'); break;
      case 'phase': if (e.phase === 'ended') this.result = { winner: e.winner, reason: e.reason }; else if (e.phase === 'battle') this.pushToast('Battle stations'); break;
      case 'denied': this.pushToast('Not possible: ' + e.why); break;
      case 'assigned': if (!e.player) this.pushToast('Your commander assigned you: ' + e.role); break;
      case 'deployed': this.pushToast('Deployed: ' + e.cost + ' points spent'); break;
      case 'role': this.pushToast(e.next ? 'Role change at your next launch: ' + e.wanted : 'Role: ' + (e.role || e.wanted)); break;
      case 'mark': this.effects.push({ kind: 'mark', p: e.p, t: T, life: 8000, attack: e.kind !== 'defend' }); break;
      default: break;
    }
  }
  pushFeed(text, tone) { this.feed.unshift({ text, tone, at: this.now() }); this.feed.length = Math.min(this.feed.length, 7); }
  pushToast(text) { this.toasts.unshift({ text, at: this.now() }); this.toasts.length = Math.min(this.toasts.length, 3); }

  // ---- per frame ------------------------------------------------------------------------------------------------------
  update(dtMs, controls) {
    const T = this.now();
    if (this.pred && this.phase === 'battle') {
      this.acc = Math.min(this.acc + dtMs, 250);
      while (this.acc >= CMD_MS) {
        this.acc -= CMD_MS;
        const c = controls ? controls.command() : {};
        const cmd = { seq: ++this.seq, ms: CMD_MS, pitch: c.pitch || 0, yaw: c.yaw || 0, roll: c.roll || 0, throttle: c.throttle ?? 0.6,
          boost: !!c.boost, fire: !!c.fire, missile: !!c.missile,
          engineOff: !!c.engineOff, barrel: c.barrel || 0, shield: !!c.shield,
          lock: this.lockTarget || 0 };
        this.prevPred = cloneFlight(this.pred);
        for (const g of stepShip(this.pred, this.predCls, cmd)) {
          this.bolts.push({ p: muzzleOf(this.pred, this.predCls, g), v: boltVelocity(this.pred, this.predCls), born: T, life: 1500, side: this.me.side, kind: 0, own: true });
          this.events.push({ e: 'shot' });
        }
        this.pending.push(cmd); if (this.pending.length > 240) this.pending.shift();
        this.unsent.push(cmd);
      }
      this.alpha = this.acc / CMD_MS;
    } else this.acc = 0;
    if (this.unsent.length && T - this.lastSend >= SEND_EVERY_MS) {
      this.send({ c: 'cmd', cmds: [...this.resend, ...this.unsent].slice(-8) });
      this.resend = this.unsent.slice(-2); this.unsent = []; this.lastSend = T;
    }
    const k = Math.exp(-dtMs / 90);
    this.errOffset = scale(this.errOffset, k);
    this.hitFlash *= Math.exp(-dtMs / 120); this.hurtFlash *= Math.exp(-dtMs / 400);
    this.bolts = this.bolts.filter(b => T < b.born + b.life);
    this.effects = this.effects.filter(f => T < f.t + f.life);
    this.toasts = this.toasts.filter(x => T - x.at < 5000);
  }
  // where the player's own ship is drawn this frame (between the last two commands, plus the fading correction)
  renderPos() {
    if (!this.pred) return null;
    return add(lerp3(this.prevPred.p, this.pred.p, this.alpha), this.errOffset);
  }
  renderQuat() { return this.pred ? qslerp(this.prevPred.q, this.pred.q, this.alpha) : null; }
  shipPose(sh, at = this.now() - INTERP_MS) {
    const b = sh.buf;
    if (!b.length) return null;
    if (at <= b[0].t) return { p: b[0].p, q: b[0].q };
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1], c = b[i];
      if (at < a.t) continue;
      if (at <= c.t) { const k = (at - a.t) / Math.max(1, c.t - a.t); return { p: lerp3(a.p, c.p, k), q: qslerp(a.q, c.q, k) }; }
      const vel = scale(sub(c.p, a.p), 1 / Math.max(1, c.t - a.t)); // late snapshot: carry on for up to 200 ms
      return { p: addScaled(c.p, vel, Math.min(200, at - c.t)), q: c.q };
    }
    return { p: b[0].p, q: b[0].q };
  }
  boltPos(b, T = this.now()) { return T < b.born ? null : addScaled(b.p, b.v, (T - b.born) / 1000); }
  // the enemy nearest the middle of the screen within a 15 degree cone: what lock-on and the lead marker use
  pickTarget(from, dir, maxRange = 4000) {
    let best = null, bestDot = Math.cos(15 * Math.PI / 180);
    const consider = (eid, p, side, kind) => {
      if (side === this.me?.side) return;
      const to = sub(p, from), d = len(to);
      if (d > maxRange || d < 1) return;
      const c = dot(norm(to), dir);
      if (c > bestDot) { bestDot = c; best = { eid, kind, p, d }; }
    };
    for (const sh of this.ships.values()) { if (sh.eid === this.me?.eid) continue; const pose = this.shipPose(sh); if (pose) consider(sh.eid, pose.p, sh.side, 'ship'); }
    for (const c of this.cruisers.values()) if (c.state === 'active' || c.state === 'spooling') consider(c.eid, c.p, c.side, 'cruiser');
    return best;
  }
  targetInfo(eid) {
    if (!eid) return null;
    const sh = this.ships.get(eid);
    if (sh) { const pose = this.shipPose(sh); return pose ? { eid, kind: 'ship', p: pose.p, v: sh.buf.length > 1 ? scale(sub(sh.buf.at(-1).p, sh.buf.at(-2).p), 1000 / Math.max(1, sh.buf.at(-1).t - sh.buf.at(-2).t)) : [0, 0, 0], side: sh.side, hp: sh.hp, max: sh.cls.hull, cls: sh.cls, name: this.names.get(eid) } : null; }
    const c = this.cruisers.get(eid);
    return c && (c.state === 'active' || c.state === 'spooling') ? { eid, kind: 'cruiser', p: c.p, v: [0, 0, 0], side: c.side, hp: c.hull, max: CRUISER.hull, name: c.name, cruiser: c } : null;
  }
  // where to aim to hit a target with a bolt from the predicted ship
  leadPoint(target) {
    if (!this.pred || !target) return null;
    const from = this.pred.p, speed = this.predCls.lasers?.speed || 720;
    const rel = sub(target.v, this.pred.v);
    const tFlight = dist(from, target.p) / speed;
    return addScaled(target.p, rel, tFlight);
  }
  // ---- commands to the server ---------------------------------------------------------------------------------------
  chooseRole(role) { if (ROLE_IDS.includes(role)) this.send({ c: 'role', role }); }
  // the selection screen: the ship or trooper level to deploy as next
  loadout({ ship, trooper } = {}) { this.send({ c: 'loadout', ship, trooper }); if (this.you?.lo) this.you.lo = [ship ?? this.you.lo[0], trooper ?? this.you.lo[1]]; }
  redeploy() { this.send({ c: 'redeploy' }); }
  focus(sub) { this.send({ c: 'focus', sub }); }
  jump() { this.send({ c: 'jump' }); }
  assign(player, role) { this.send({ c: 'assign', player, role }); }
  requeue() { this.send({ c: 'requeue' }); this.result = null; }
  mark(p, kind = 'attack') { this.send({ c: 'ping', p, kind }); }
  forward() { return this.pred ? forwardOf(this.renderQuat()) : null; }
}
