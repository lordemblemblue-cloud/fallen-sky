// Fleet Assault aboard a cruiser: the bridge between Game 2's Jedi Outcast combat (engine/game.js in its 'boarding'
// mode) and the authoritative match server (server/game2/fleet/match.mjs) through FleetClient. It plugs into the engine
// the way the online arena's NetGame does (Game.net: beforeStep / afterStep / updatePuppets / rpc / onHit / onDeath /
// drawHud / draw), so saber, Force, blocks and bolts all run on the unchanged combat code. What crosses the network is
// only what the fleet protocol carries:
//   - 'st'   our body twenty times a second: its position, in steps the server's speed check accepts, and its pose
//            (bodyPose.js: yaw, animation layers, saber, status, the Force held). The server relays poses ('fr') to the
//            other bodies aboard with the position it accepted. ('pos' at 10 Hz, position only, with a server from before
//            the relay: welcome `proto` < 2.)
//   - 'fx'   a Force effect our player's fighter put on another player's puppet (a push or pull to resolve, a grip, a
//            levitate, a stagger, lightning, a blade block): forwarded to that player's page, which resolves it with
//            their own fighter as the arena does peer to peer, and answers a push with its outcome. A cast, saber sparks
//            and a taunt are shown to everyone aboard. HP stays the server's: damage goes only as 'hit'.
//   - 'hit'  a blow we landed on another player's body or on the AI stand-in commander: the raw damage our combat code
//            resolved (saber, Force, bolt), paced under the server's per-hit and per-second caps. The server applies
//            the commander curve (damage taken, strike-team bonus) and owns every HP
//   - 'npc'  the trooper garrison and the AI commander run in this page (one copy per boarder: the protocol has no NPC
//            relay): a trooper we kill is a 'kill' (the server keeps the garrison count), damage they do to us is 'hurt';
//            damage we took resolving another player's effect (a push's knock) is a 'hurt' naming them ('by')
//   - 'plant' / 'defuse' / 'cancel' with E at a station
// Other players' bodies come from the snapshot's `b` list (position, HP, shield, level). A player whose page relays its
// pose is drawn as the arena draws its puppets (their animation, swings, Force and knockback); one that does not (the AI
// stand-in of our own ship) walks between snapshots. Their blows reach us as 'hurt' events, their effects on us as 'ff'.
// Each body's kit follows its trooper level (rules.mjs TROOPER_TIERS, chosen on the deploy screen): a trooper carries
// Story Mode's Bryar pistol and no lightsaber or Force, a heavy trooper the pistol, a grenade launcher (engine/
// launcher.js) and a personal shield, a Jedi (and every commander) the lightsaber and the Force. We only report the hit
// kinds and effects the server takes from that kit, and a puppet only shows what its level's kit has.
import { Fighter } from '../../engine/fighter.js';
import { NetForceView, packArgs, unpackArgs } from '../../engine/netgame.js';
import { segSeg } from '../../engine/combat.js';
import { GrenadeLauncher } from '../../engine/launcher.js';
import { BODY, COMMANDER, CRUISER, INTERIOR, RELAY, ROLE_IDS, SIDES, SUBSYSTEM_IDS, TROOPER_TIERS, commanderModifiers } from '../../../../../server/game2/fleet/rules.mjs';
import { COMMANDER_POST, GARRISON_POSTS, REINFORCE_POINTS, STATION_LABELS } from './cruiserInterior.js';
import { applyPose, encodePose } from './bodyPose.js';

export const POS_EVERY = 0.1;          // s between position reports ('pos', a server from before the relay)
export const STATE_EVERY = 0.05;       // s between 'st' reports (position + pose)
export const STATE_SOON = 0.034;       // s at least between them when the saber move, status or held power changes (under RELAY.poseRate)
export const STREAM_MS = 300;          // ms without a relayed pose before a puppet walks again
export const INTERP_STREAM = 0.09;     // s relayed bodies are drawn behind the newest relay (one report plus a server tick)
export const POSE_LAG = 0.04;          // s a relayed pose is older than its arrival (their report, the server's tick)
const RELAYED = ['push', 'pullTo', 'shove', 'stagger', 'electrify', 'shock', 'unlodgeSaber', 'interrupt'];
export const POS_STEP = BODY.moveSpeed * 0.05 + BODY.moveSlack - 0.2; // m per report: what the server accepts even 50 ms after the last
export const INTERP = 0.12;            // s other bodies are drawn behind the newest snapshot
export const HP_GRACE = 0.8;           // s after a local hit before the server's HP may raise ours again (reports in flight)
export const LEASH = 3;                // m the AI commander fights from its post (the server keeps its body on the bridge)
export const COMMANDER_WAKE = 18;      // m from its post at which the AI commander starts to fight (the top of the bridge ramp)
export const KILL_GAP = 1.3;           // s between garrison kill reports (the server takes one per BODY.npcKillEveryMs)
export const DPS_BUDGET = BODY.dpsCap - 20, DPS_WINDOW = 1100; // damage we report per window (ms), under the server's cap
export const NO_HEAL = Object.freeze(['heal', 'drain', 'teamheal']); // the server keeps health: nothing aboard restores it
const RPC_METHODS = ['hurt', 'push', 'pullTo', 'shove', 'stagger', 'electrify', 'shock', 'grip', 'unlodgeSaber', 'levitate', 'executedBy', 'vaporize'];
const LOOK = {
  republic: { blade: [0.22, 0.52, 1], tint: [1, 1, 1], tintAmt: 0, css: '#7fc8ff', trooper: [0.93, 0.94, 0.97], name: 'Republic' },
  separatist: { blade: [1, 0.06, 0.05], tint: [0.12, 0.09, 0.17], tintAmt: 0.66, css: '#ff9a6a', trooper: [0.72, 0.6, 0.42], name: 'Empire' },
};
const MISSION = {
  saboteur: 'Plant charges on the weapons battery and the hyperdrive',
  boarder: 'Take the fight to the defenders and the garrison',
  strike: 'Hunt and defeat the Jedi commander on the bridge',
  pilot: 'Fight your way through the ship', ground: 'Fight your way through the ship',
};
const TIER = Object.fromEntries(TROOPER_TIERS.map(t => [t.id, t]));
const LEVEL_TIER = ['jedi', 'trooper', 'heavy', 'jedi', 'commander']; // snapshot body level code -> tier (0: an older server, a Jedi)
const jediTier = tier => tier === 'jedi' || tier === 'commander' || !TIER[tier];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export class BoardingNet {
  // g: a Game in 'boarding' mode; client: a FleetClient whose player has a body in `area` ('ship:<cruiser eid>')
  constructor(g, client, { area } = {}) {
    this.g = g; this.client = client; this.area = area || client.you?.b?.area; this.cruiserEid = +String(this.area).slice(5);
    this.me = client.me; this.side = this.me.side; this.look = LOOK[this.side] || LOOK.republic;
    this.ship = client.cruisers.get(this.cruiserEid) || null;
    this.shipSide = this.ship?.side || this.side; this.enemyShip = this.shipSide !== this.side;
    this.puppets = new Map(); this.troopers = []; this.cmdr = null; this.cmdrEid = 0; this.cmdrHurtAt = -9; this.cmdrDownAt = -9;
    this.killQueue = 0; this.killsInFlight = []; this.lastKillAt = -9; this.garrisonOffAt = null; this.garrisonSeen = null;
    this.hurtBatch = 0; this.hurtAt = 0; this.hits = []; this.dps = { at: -1e9, sum: 0 };
    this.posAt = -9; this.sentPos = null; this.snapSeen = -1; this.localHurtAt = -9; this.lastHp = 100; this.deadAtT = -9; this.serverDead = false;
    this.inHurt = false; this.serverHurt = false; this.respawnPending = false; this.hitKind = null; this.feed = []; this.act = null;
    // the relay: 'st' needs a server that knows it; our player's own Force is what we may relay (this.mine while it runs)
    this.relay = (client.welcome?.proto ?? 1) >= 2; this.relayN = -1; this.mine = false;
    this.blockedFor = new Map(); this.lastHurtRpc = null; this.lastElec = new Map(); this.hitFxAt = -9; this.gripSeenAt = 0;
    this.animNames = g.skel.rigJson.anims.map(a => a.name); this.animIdx = Object.fromEntries(this.animNames.map((n, i) => [n, i]));
    this.tier = 'jedi'; this.kinds = null; this.shield = 0; this.maxShield = 0; this.refused = new Set();
    g.net = this; g.remotes = []; g.noDamage = false; g.round = { state: 'fight', t: 0 };
    const P = g.player; P.label = this.me.name || 'You'; P.team = 'player'; P.blade.color = this.look.blade.slice(); P.actor.tint = this.look.tint.slice(); P.actor.tintAmt = this.look.tintAmt;
    P.fid = this.me.eid; // packArgs names a fighter by its fid: ours and every puppet's is its body's eid
    for (const k of ['update', 'activate']) { const F = g.force, f0 = F[k].bind(F); F[k] = (...a) => { const was = this.mine; this.mine = true; try { return f0(...a); } finally { this.mine = was; } }; }
    this.jediPowers = g.force.list.filter(id => !NO_HEAL.includes(id)); g.force.list = this.jediPowers.slice(); g.force.sel = 0; // FORCE_QUICK_BINDINGS only fire listed powers
    // our own body: local damage (troopers, the AI commander, a wall slam) is reported; the server's word on HP wins.
    // A personal shield takes it first, as on the server
    const hurt0 = P.hurt.bind(P), die0 = P.die.bind(P);
    // damage from another player's puppet can only be an effect of theirs resolved here (their blade and Force hurt us
    // through the server): it is reported with their eid, the server credits them
    const took = (lost, from) => { this.localHurtAt = g.t; if (from?.remote && from.fleetEid && this.relay) this.byHurt.set(from.fleetEid, (this.byHurt.get(from.fleetEid) || 0) + lost); else this.hurtBatch += lost; };
    this.byHurt = new Map();
    P.hurt = (dmg, from, opts = {}) => {
      if (P.status === 'dead' || P.hp <= 0 || P.spawnShield > g.t || P.status === 'executed') return false;
      const k = P.takeMul || 1, soak = Math.min(this.shield, dmg * k);
      if (soak > 0) {
        this.shield -= soak; P.flash = 0.2; this.shieldHitAt = g.t; g.fx.sparks(P.chest(), [0, 1, 0], 5, [0.5, 0.85, 1, 1]);
        if (!this.serverHurt) took(soak, from);
      }
      const rest = dmg - soak / k; if (rest <= 1e-6) return false;
      const before = P.hp; this.inHurt = true;
      let died; try { died = hurt0(rest, from, opts); } finally { this.inHurt = false; }
      const lost = Math.max(0, before - Math.max(0, P.hp));
      if (lost > 0 && !this.serverHurt) took(lost, from);
      this.lastHp = Math.max(0, P.hp);
      return died;
    };
    P.die = (from, opts) => { // an execution, a Repulse or a fall: whatever health (and shield) was left goes to the server too
      if (!this.inHurt && !this.serverHurt && this.lastHp > 0) took(this.lastHp + this.shield, from);
      this.lastHp = 0; this.shield = 0; return die0(from, opts);
    };
    // which kind of blow a hurt() came from: Combat.damage carries it (blade / grenade / thrown blade / bolt); anything
    // else is Force
    const dmg0 = g.combat.damage.bind(g.combat);
    g.combat.damage = (A, B, pt, dmg, o = {}) => { const was = this.hitKind; this.hitKind = o.saber || o.touch ? 'saber' : o.explosion ? 'explosion' : o.spark ? 'force' : 'bolt'; try { return dmg0(A, B, pt, dmg, o); } finally { this.hitKind = was; } };
    this.unsub = client.addListener(e => this.onEvent(e));
    this.unrelay = client.onRelay?.(m => this.onRelay(m));
    const b = client.you?.b;
    if (b?.alive) this.placePlayer(b);
    this.ingest(true);
  }
  dispose() { this.unsub?.(); this.unrelay?.(); for (const f of this.g.remotes) { this.g.humStop(f); if (f.force?.loops?.hold) f.force.loops.hold.stop(0.1); } }
  // a body eid -> the fighter that stands for it on this page
  byEid(eid) { return eid === this.me.eid ? this.g.player : this.puppets.get(eid) || (eid === this.cmdrEid ? this.cmdr : null); }
  now() { return this.client.now(); }

  // ---------------- our body
  placePlayer(b) {
    const g = this.g, P = g.player, yaw = this.enemyShip ? Math.PI : 0;
    g.respawnPlayerAt(b.p, b.area === this.area && dist(b.p, INTERIOR.stations.bridge) < 1 ? COMMANDER_POST.yaw : yaw);
    this.applyKit(b); P.spawnShield = g.t + BODY.spawnProtectMs / 1000;
    P.maxHp = b.max; P.hp = b.hp; this.lastHp = b.hp; this.sentPos = b.p.slice(); this.posAt = g.t; this.respawnPending = false; this.serverDead = false; this.hurtBatch = 0;
  }
  // the kit of this body's trooper level (the server decided it when it made the body)
  applyKit(b) {
    const g = this.g, P = g.player, F = g.force, tier = b.tier || 'jedi';
    this.tier = tier; this.kinds = Array.isArray(b.kinds) ? b.kinds.slice() : null;
    this.maxShield = b.maxShield || 0; this.shield = b.shield ?? this.maxShield;
    P.actor.tint = (jediTier(tier) ? this.look.tint : this.look.trooper).slice(); P.actor.tintAmt = jediTier(tier) ? this.look.tintAmt : 0.62;
    if (jediTier(tier)) {
      P.hasSaber = true; P.gun = false; P.weaponPose = null; g.playerWeapon = null; g.launcher = null;
      for (const k of ['gainPulse', 'startPulse', 'startDominance']) delete F[k];
      F.list = this.jediPowers.slice(); F.sel = 0; F.max = 100; F.regen = 9; F.reset?.();
      g.readySaber(P);
      return;
    }
    // a trooper: Story Mode's Bryar pistol (game.js updatePistol), no lightsaber, no Force (and no Repulse meter)
    if (!P.saber.holstered) { P.saber.holstered = true; P.blade.set(false); g.humStop(P); }
    P.blade.len = 0; P.hasSaber = false; P.hilt = 'none'; P.gun = true; P.weaponPose = 'TORSO_WEAPONREADY2';
    g.pistol = { cool: 0, charge: 0 }; g.playerWeapon = 'bryar';
    g.launcher = tier === 'heavy' ? new GrenadeLauncher(g, P) : null;
    F.releaseAll?.(true); F.list = []; F.sel = 0; F.max = 0; F.fp = 0; F.regen = 0; F.pulse = 0;
    F.gainPulse = () => {}; F.startPulse = () => false; F.startDominance = () => false;
  }
  you() { return this.client.you; }
  role() { return this.you()?.r || this.me.role; }
  // the commander's buff / nerf (rules.mjs commanderModifiers) for this ship, from the snapshot
  shipMods() {
    const c = this.client.cruisers.get(this.cruiserEid), s = this.client.sides[this.shipSide];
    return commanderModifiers(s ? s.strength : 1, c ? c.hull / CRUISER.hull : 1);
  }

  // ---------------- snapshots
  ingest(force = false) {
    const C = this.client;
    if (!force && C.snapCount === this.snapSeen) return;
    this.snapSeen = C.snapCount;
    const g = this.g, P = g.player, you = C.you, b = you?.b, T = this.now();
    this.ship = C.cruisers.get(this.cruiserEid) || this.ship;
    if (b && b.area === this.area) {
      if (b.alive && P.status === 'dead') {
        // a new life (the 'spawn' event), or a defeat we predicted that the server never agreed to: back on our feet
        if (this.respawnPending || (!this.serverDead && g.t - this.deadAtT > 1.5 && this.hurtBatch <= 0)) this.placePlayer(b);
      } else if (b.alive) {
        const settled = g.t - this.localHurtAt > HP_GRACE;
        P.maxHp = b.max;
        P.hp = settled ? b.hp : Math.min(P.hp, b.hp);
        this.maxShield = b.maxShield || 0; this.shield = settled ? (b.shield || 0) : Math.min(this.shield, b.shield || 0); // it recharges on the server
        this.lastHp = P.hp;
      }
      this.act = b.act;
    }
    // other bodies in this area
    const seen = new Set();
    for (const e of C.bodies || []) {
      const [eid, sc, rc, x, y, z, hp, flags, shield = 0, level = 0] = e;
      if (eid === this.me.eid) continue;
      seen.add(eid);
      const side = SIDES[sc], role = ROLE_IDS[rc], p = [x / 10, y / 10, z / 10], tier = role === 'commander' ? 'commander' : LEVEL_TIER[level] || 'jedi';
      if (role === 'commander' && (flags & 4) && side !== this.side) { this.syncCommander(eid, p, hp); continue; } // the AI stand-in: run here
      let f = this.puppets.get(eid);
      if (!f || f.status === 'dead' || f.fleetTier !== tier) { if (f) this.removePuppet(eid); f = this.makePuppet(eid, side, role, p, !!(flags & 4), tier); } // a new life may bring a new kit
      if (!this.streaming(f, T)) { f.netBuf.push({ t: T, p }); if (f.netBuf.length > 8) f.netBuf.shift(); } // a relayed body has fresher positions
      f.hp = hp; f.maxHp = role === 'commander' ? COMMANDER.hp : TIER[tier]?.hp ?? BODY.hp; f.netShield = shield; f.netMaxShield = TIER[tier]?.shield || 0; f.netFlags = flags; f.lastSeen = T;
    }
    for (const [eid, f] of [...this.puppets]) if (!seen.has(eid) && f.status !== 'dead') this.removePuppet(eid); // left the area (a 'down' event kills it first)
    if (this.cmdr && !seen.has(this.cmdrEid)) { // the stand-in is down on the server (or gone: a player took the seat)
      this.killCommanderLocally();
      if ([...this.puppets.values()].some(f => f.fleetRole === 'commander' && f.team === 'enemy')) { g.removeNpc(this.cmdr); this.cmdr = null; this.cmdrEid = 0; }
    }
    if (this.enemyShip) this.syncGarrison();
  }
  // ---------------- other players' bodies: the arena's puppets when their pose is relayed, walking puppets otherwise
  makePuppet(eid, side, role, p, bot, tier = 'jedi') {
    const g = this.g, L = LOOK[side] || LOOK.republic, jedi = jediTier(tier);
    const f = new Fighter(g, { name: 'fleet' + eid, kind: 'remote', team: side === this.side ? 'ally' : 'enemy', pos: p, yaw: 0, hp: BODY.hp, hasSaber: jedi, bladeColor: L.blade });
    f.remote = true; f.fleetEid = eid; f.fid = eid; f.fleetRole = role; f.fleetTier = tier; f.netBot = bot; f.isPlayer = false; f.humId = 4 + g.remotes.length; f.provoked = true; f.netBuf = [];
    f.label = (this.client.names.get(eid) || (bot ? 'Jedi Master (AI)' : 'Jedi')) + (role === 'commander' ? ' · commander' : jedi ? '' : ' · ' + TIER[tier].name[side].toLowerCase());
    if (jedi) { f.actor.tint = L.tint.slice(); f.actor.tintAmt = L.tintAmt; } else { f.actor.tint = L.trooper.slice(); f.actor.tintAmt = 0.62; f.gun = true; f.weaponPose = 'TORSO_WEAPONREADY2'; }
    f.side = side;
    f.force = new NetForceView(g, f, this); // their Force as their page reports it (held power, target, timed powers; none for a trooper)
    for (const m of RPC_METHODS) f[m] = (...a) => { this.rpc(f, m, a); return false; };
    if (jedi) g.readySaber(f);
    g.remotes.push(f); this.puppets.set(eid, f); g.foesGen = (g.foesGen | 0) + 1;
    return f;
  }
  removePuppet(eid) {
    const g = this.g, f = this.puppets.get(eid); if (!f) return;
    this.puppets.delete(eid); g.humStop(f); if (f.force?.loops?.hold) f.force.loops.hold.stop(0.1);
    const i = g.remotes.indexOf(f); if (i >= 0) g.remotes.splice(i, 1); g.foesGen = (g.foesGen | 0) + 1;
  }
  streaming(f, T = this.now()) { return !!f.netPose && T - f.streamAt < STREAM_MS; }
  // 'fr': the poses of the other bodies aboard, each with its level and the position the server accepted
  onRelay(m) {
    if (m.t === 'ff') { this.onEffect(m); return; }
    if (!Array.isArray(m.b) || !(m.n > this.relayN)) return;
    this.relayN = m.n;
    const T = this.now();
    for (const e of m.b) {
      const f = Array.isArray(e) ? this.puppets.get(e[0]) : null;
      if (!f || f.status === 'dead') continue; // a body is introduced by the snapshot first
      if (e[1] && LEVEL_TIER[e[1]] !== f.fleetTier) continue; // a new life with another kit: the snapshot rebuilds the puppet first
      f.netPose = e.slice(5); f.poseAt = T; f.streamAt = T;
      f.netBuf.push({ t: T, p: [e[2] / 100, e[3] / 100, e[4] / 100] }); if (f.netBuf.length > 8) f.netBuf.shift();
    }
  }
  // the stream stopped (a long stall, or a page without the relay): back to a walking puppet
  unstream(f) {
    f.wasStreamed = false; f.netPose = null;
    if (f.status !== 'dead') { f.status = 'normal'; f.vel = [0, 0, 0]; f.onGround = true; f.thrown = null; f.hilt = jediTier(f.fleetTier) ? 'hand' : 'none'; }
    const F = f.force; F.setHolding?.(''); F.setActive?.(0); F.target = null;
    f.actor.followLegs(); f.actor.torso.cur = null;
  }
  puppetTarget(f, T, interp = INTERP) {
    const B = f.netBuf; if (!B.length) return f.pos;
    const at = T - interp * 1000;
    if (at <= B[0].t) return B[0].p;
    for (let i = B.length - 1; i > 0; i--) { const a = B[i - 1], c = B[i]; if (at < a.t) continue; return at <= c.t ? lerp3(a.p, c.p, (at - a.t) / Math.max(1, c.t - a.t)) : c.p; }
    return B[B.length - 1].p;
  }
  updatePuppets(dt) {
    const g = this.g, P = g.player, T = this.now();
    for (const f of g.remotes.slice()) {
      if (f.status === 'dead') { f.update(dt); if (g.t - f.deadAt > 6) this.removePuppet(f.fleetEid); continue; }
      if (this.streaming(f, T)) { // as the arena: their page's animation, saber and Force, at the position the server accepted
        const tgt = this.puppetTarget(f, T, INTERP_STREAM);
        for (let i = 0; i < 3; i++) f.pos[i] = tgt[i];
        applyPose(g, f, f.netPose, { age: (T - f.poseAt) / 1000 + POSE_LAG, dt, animNames: this.animNames, byEid: eid => this.byEid(eid), jedi: jediTier(f.fleetTier) });
        f.wasStreamed = true;
        continue;
      }
      if (f.wasStreamed) this.unstream(f);
      const tgt = this.puppetTarget(f, T), d = [tgt[0] - f.pos[0], 0, tgt[2] - f.pos[2]], fd = Math.hypot(d[0], d[2]);
      const c = f.cmd; c.fwd = c.right = 0; c.walk = c.attack = c.alt = c.jump = c.crouch = false;
      if (fd > 0.25) { // walk the way the snapshots go (run cycles from the shared locomotion code)
        const dir = [d[0] / fd, 0, d[2] / fd], s = Math.sin(f.yaw), co = Math.cos(f.yaw), k = Math.min(1, fd / 0.6);
        c.fwd = (dir[0] * s + dir[2] * co) * k; c.right = (dir[0] * -co + dir[2] * s) * k; c.walk = fd < 0.5;
        f.targetYaw = Math.atan2(dir[0], dir[2]);
      } else if (f.team === 'enemy' && P.status !== 'dead' && flat(f.pos, P.pos) < 7) f.targetYaw = Math.atan2(P.pos[0] - f.pos[0], P.pos[2] - f.pos[2]);
      f.update(dt);
      const err = dist(tgt, f.pos);
      if (err > 2.5) f.pos = tgt.slice(); else { const k = Math.min(1, dt * 8); f.pos[0] += (tgt[0] - f.pos[0]) * k; f.pos[2] += (tgt[2] - f.pos[2]) * k; f.pos[1] += (tgt[1] - f.pos[1]) * Math.min(1, dt * 14); }
    }
  }
  // the engine put something on another player's puppet (their game owns that fighter): the damage we did goes to the
  // server as a 'hit'; a Force effect our player caused goes to their page ('fx'), which resolves it on their fighter.
  // What this page's AI (the garrison, the stand-in commander) does to a puppet stays here: every page runs its own.
  rpc(f, m, args) {
    if (!f.fleetEid || f.status === 'dead') return;
    const g = this.g, P = g.player;
    if (m === 'hurt') { const [dmg, src] = args; if (src === P && dmg > 0) { this.queueHit(f.fleetEid, this.hitKind || 'force', dmg); f.dmgFlash = 1; this.lastHurtRpc = { f, t: g.t }; } return; }
    // a finishing move or a Repulse on them: the rest of their health, within the server's caps
    if ((m === 'vaporize' && args[0] === P) || (m === 'executedBy' && args[0] === P)) { this.queueHit(f.fleetEid, m === 'vaporize' ? 'force' : 'saber', Math.max(0, f.hp) / this.takeMulFor(f)); return; }
    if (!this.relay || f.netBot) return; // an AI body has no page to resolve it; a server from before the relay has no 'fx'
    if (m === 'blocked') { this.blockedFor.set(f, args[0]); return; } // sent from onHit, once we know whose blade it was
    // ours: inside our player's Force, a knock that follows our blow in the same step, or an effect that names us
    const ours = this.mine || (this.lastHurtRpc?.f === f && this.lastHurtRpc.t === g.t) || args.some(a => a && typeof a === 'object' && a.from === P);
    if (m === 'throw') { if (args[0]?.from === P) this.effect(f, 'throw', args); return; } // a push or pull: their page resolves it (w_force.c counters, blocks)
    if (m === 'grip' || m === 'levitate') { if (args[0] ? ours : f.heldBy === P) { f.heldBy = args[0] ? P : null; this.effect(f, m, args); } return; }
    if (m === 'forceRelease') { this.effect(f, m, args); return; } // our player broke free of their grip
    if (!ours || !RELAYED.includes(m)) return;
    if (m === 'electrify') { const last = this.lastElec.get(f) ?? -1; if (g.t - last < 0.1) return; this.lastElec.set(f, g.t); args = [Math.max(args[0], 0.25)]; } // lightning: ten a second per target, as the arena
    this.effect(f, m, args);
  }
  // an effect needs its kind in our kit (rules.mjs RELAY.needs, as the server checks): a trooper casts nothing
  kitAllows(k) { const need = RELAY.needs[k]; return !need || !this.kinds || need.some(n => this.kinds.includes(n)); }
  effect(f, k, args) { if (this.kitAllows(k)) this.client.send({ c: 'fx', to: f.fleetEid, k, a: packArgs(args) }); }
  shown(k, a) { if (this.relay && this.kitAllows(k)) this.client.send({ c: 'fx', k, a }); }
  // 'ff': another player's page asks ours to resolve their effect on our fighter (the arena's NetGame.onRpc), or shows
  // a cast, sparks or a taunt. Whatever arrives is clamped to what the engine itself does: our page protects itself.
  onEffect(m) {
    const g = this.g, P = g.player, from = this.puppets.get(m.from);
    if (!from || !Array.isArray(m.a)) return;
    const a = unpackArgs(m.a, id => this.byEid(id)), num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
    const dir = v => { const x = num(v?.[0], -1, 1), z = num(v?.[2], -1, 1), l = Math.hypot(x, z); return l > 1e-3 ? [x / l, 0, z / l] : [Math.sin(from.yaw), 0, Math.cos(from.yaw)]; };
    switch (m.k) {
      case 'cast': if (typeof a[0] === 'string' && from.force.castFx) from.force.castFx(a[0], Array.isArray(a[1]) ? a[1].map(v => num(v, -1, 1)) : [0, 0, 1]); return;
      case 'hit': if (Array.isArray(a[0]) && a[0].length === 3) { const p = a[0].map(v => num(v, -1000, 1000)); g.fx.sparks(p, [0, 1, 0], a[2] ? 4 : a[1] ? 14 : 10, a[1] ? [1, 0.9, 0.55, 1] : [1, 0.5, 0.2, 1]); g.sfxAt(a[1] ? 'block' + (1 + Math.floor(Math.random() * 9)) : 'hit' + (1 + Math.floor(Math.random() * 3)), p, a[2] ? 0.3 : 0.9); } return;
      case 'taunt': g.onTaunt(from, a[0] === 'dark' ? 'dark' : 'light', num(a[1], 0, 9) | 0, true); return;
      case 'throwRes': { const T = { knockdown: ['KNOCKDOWN', [0.7, 1, 0.75]], staggered: ['PARTLY BLOCKED', [0.75, 0.95, 0.8]], hit: [(a[0]?.pull ? 'PULL' : 'PUSH') + ' HIT', [0.7, 1, 0.75]], countered: ['COUNTERED', [1, 0.65, 0.35]], absorbed: ['ABSORBED', [0.78, 0.5, 1]] }[a[0]?.outcome]; if (T) g.banner(T[0], T[1]); return; }
      case 'forceRelease': if (g.force.holding) { if (a[0]?.brokenFree) g.force.brokenFree = true; g.force.release(); } return;
      case 'interrupt': g.force.interrupt(); return;
      default: break;
    }
    if (P.status === 'dead' || this.serverDead) return;
    const shielded = P.spawnShield > g.t;
    switch (m.k) {
      case 'throw': { // their push / pull, resolved with our fighter's exact state (CanCounterThrow + ForceThrow), as the arena
        const o = a[0] || {}; if (shielded) return;
        const lv = num(o.lv, 0, 3) | 0, res = g.applyThrow({ p: from, lv: { push: lv, pull: lv }, dmgScale: num(o.dmgScale, 0, 2, 1) }, P, !!o.pull,
          { dir: dir(o.dir), dist: num(o.dist, 0, 30, 5), fall: o.fall == null ? undefined : num(o.fall, 0, 1), flatD: o.flatD == null ? undefined : num(o.flatD, 0, 30), charge: num(o.charge, 0, 1), local: true });
        if (res) this.client.send({ c: 'fx', to: from.fleetEid, k: 'throwRes', a: [{ outcome: String(res.outcome), reason: String(res.reason || ''), pull: !!o.pull }] });
        return;
      }
      case 'grip': { const [on, lift, o] = a; if (on) { if (shielded) return; P.grip(true, num(lift, 0, 2), { carry: o?.carry ? () => [from.pos[0] + Math.sin(from.yaw) * 2.4, 0, from.pos[2] + Math.cos(from.yaw) * 2.4] : null }); } else P.grip(false, 0, { free: !!o?.free, soft: !!o?.soft }); return; }
      case 'levitate': { const [on, o] = a; if (on && shielded) return; P.levitate(!!on, on ? { from, duration: num(o?.duration, 0, 6, 3.5) } : { why: typeof o?.why === 'string' ? o.why : '' }); return; }
      case 'push': if (!shielded) P.push(dir(a[0]), num(a[1], 0, 25), num(a[2], 0, 8, 4.5), { keepYaw: !!a[3]?.keepYaw, quicker: !!a[3]?.quicker, anim: /^BOTH_KNOCKDOWN[0-9]$/.test(a[3]?.anim) ? a[3].anim : undefined }); return;
      case 'pullTo': if (!shielded) P.pullTo(dir(a[0]), num(a[1], 0, 25), Array.isArray(a[2]?.to) ? { to: a[2].to.map(v => num(v, -1000, 1000)), power: num(a[2].power, 0.2, 1, 1) } : {}); return;
      case 'shove': if (!shielded) P.shove(dir(a[0]), num(a[1], 0, 12)); return;
      case 'stagger': if (!shielded) P.stagger(dir(a[0]), num(a[1], 0, 20)); return;
      case 'electrify': if (!shielded) P.electrify(num(a[0], 0, 1)); return;
      case 'shock': if (!shielded) P.shock(!!a[0]); return;
      case 'unlodgeSaber': P.unlodgeSaber(); return;
      case 'blocked': if (!P.saber.holstered && P.status === 'normal' && typeof a[0] === 'string') P.saber.blocked = a[0]; return;
      default: return;
    }
  }
  takeMulFor(f) { return f.fleetRole === 'commander' ? this.shipMods().damageTaken * (this.role() === 'strike' ? COMMANDER.strikeBonus : 1) : 1; }

  // ---------------- the AI stand-in commander: the duel's Dark Jedi brain, on the bridge, with the commander curve
  syncCommander(eid, p, hp) {
    const g = this.g;
    let f = this.cmdr;
    if (!f || this.cmdrEid !== eid) {
      if (f) g.removeNpc(f);
      f = this.cmdr = g.spawnArchetype('reborn', COMMANDER_POST.pos, COMMANDER_POST.yaw, { name: 'fleet-commander', label: 'Jedi Master (AI) · commander' });
      this.cmdrEid = eid; f.fleetEid = eid; f.fleetRole = 'commander'; f.team = 'enemy'; f.baseRegen = f.force.regen; f.baseDmg = f.dmgScale;
      const L = LOOK[this.shipSide]; f.blade.color = L.blade.slice(); f.actor.tint = L.tint.slice(); f.actor.tintAmt = L.tintAmt;
      const hurt0 = f.hurt.bind(f), die0 = f.die.bind(f);
      f.hurt = (dmg, from, opts = {}) => {
        if (from === g.player && dmg > 0 && f.status !== 'dead' && !(f.spawnShield > g.t)) { this.queueHit(eid, this.hitKind || 'force', dmg); this.cmdrHurtAt = g.t; }
        this.inCmdrHurt = true; try { return hurt0(dmg, from, opts); } finally { this.inCmdrHurt = false; }
      };
      f.die = (from, opts) => { // executed or vaporized by us: the rest of its health goes to the server as blows
        if (!this.inCmdrHurt && !this.cmdrServerDown && from === g.player && f.hp > 0) { this.queueHit(eid, flat(g.player.pos, f.pos) < BODY.hitRange.saber ? 'saber' : 'force', f.hp / this.takeMulFor(f)); this.cmdrHurtAt = g.t; }
        this.cmdrDownAt = g.t; return die0(from, opts);
      };
      this.spawnCommanderAt(hp);
    }
    if (f.status === 'dead') {
      // in the snapshot, so standing on the server: back from a defeat, or a defeat we predicted that the server did not
      // grant (a blow out of range) once our last blows have been sent
      if (!this.cmdrServerDown && (g.t - this.cmdrDownAt < 1.5 || this.hits.some(h => h.target === eid))) return;
      this.spawnCommanderAt(hp);
    }
    f.hp = g.t - this.cmdrHurtAt > HP_GRACE ? hp : Math.min(f.hp, hp);
    f.maxHp = COMMANDER.hp;
  }
  spawnCommanderAt(hp) {
    const g = this.g, f = this.cmdr; this.cmdrServerDown = false;
    f.spawn = COMMANDER_POST.pos.slice(); g.respawnNpc(f); f.yaw = f.targetYaw = COMMANDER_POST.yaw; f.force.reset(); f.force.fp = f.force.max;
    f.maxHp = COMMANDER.hp; f.hp = hp; f.spawnShield = g.t + BODY.spawnProtectMs / 1000; this.cmdrHurtAt = -9;
  }
  killCommanderLocally() { const f = this.cmdr; if (!f) return; this.cmdrServerDown = true; if (f.status !== 'dead') { f.hp = 0; f.die(null); } }
  tuneCommander() {
    const f = this.cmdr, g = this.g, P = g.player, F = g.force;
    if (this.role() === 'commander' && this.you()?.md) { // our own commander body: its curve from the server
      const [taken, , regen] = this.you().md; P.takeMul = (F.active.protect ? F.protectMul : 1) * taken; F.regen = 9 * regen;
    }
    if (!f || f.status === 'dead') return;
    // it wakes when we come up to the bridge (its duel brain would otherwise cast at us through the decks)
    const awake = P.status !== 'dead' && flat(P.pos, COMMANDER_POST.pos) < COMMANDER_WAKE;
    if (!awake && f.kind === 'darkjedi') {
      f.kind = 'dormant'; const c = f.cmd; c.fwd = c.right = c.up = 0; c.walk = c.crouch = c.attack = c.alt = c.jump = c.jumpPressed = c.crouchPressed = false;
      f.force.want = {}; if (f.force.holding) f.force.release(); f.targetYaw = COMMANDER_POST.yaw;
    } else if (awake && f.kind === 'dormant') f.kind = 'darkjedi';
    const m = this.shipMods(), strike = this.role() === 'strike' ? COMMANDER.strikeBonus : 1;
    f.takeMul = (f.force.active.protect ? f.force.protectMul : 1) * m.damageTaken * strike; // what the server will do to our blows
    f.force.regen = f.baseRegen * m.forceRegen; f.dmgScale = f.baseDmg * m.damageDealt; f.cmdrMods = m;
    if (f.ai?.cd) f.ai.cd.heal = Math.max(f.ai.cd.heal, 5); // healing would not reach the server
    if (f.force.holding === 'heal') f.force.release();
  }

  // ---------------- the trooper garrison (enemy ships): as many here as the server counts, minus kills on their way
  syncGarrison() {
    const g = this.g, c = this.client.cruisers.get(this.cruiserEid); if (!c) return;
    const T = this.now(); this.killsInFlight = this.killsInFlight.filter(t => T - t < 600);
    const alive = this.troopers.filter(f => f.status !== 'dead');
    const want = Math.max(0, Math.min(INTERIOR.garrison, c.garrison) - this.killQueue - this.killsInFlight.length);
    if (this.garrisonSeen === null) { for (let i = 0; i < want; i++) this.spawnTrooper(GARRISON_POSTS[i % GARRISON_POSTS.length], i); this.garrisonSeen = c.garrison; return; }
    this.garrisonSeen = c.garrison;
    if (alive.length === want) { this.garrisonOffAt = null; return; }
    if (this.garrisonOffAt === null) { this.garrisonOffAt = T; return; }
    if (T - this.garrisonOffAt < 1000) return; // not a passing difference (a kill report on its way)
    this.garrisonOffAt = null;
    const P = g.player, unseen = f => !g.world.lineOfSight([f.pos[0], f.pos[1] + 1.5, f.pos[2]], P.chest());
    if (alive.length > want) { // someone else aboard killed some: take away the ones out of sight, farthest first
      for (const f of alive.sort((a, b) => (unseen(b) - unseen(a)) || (flat(b.pos, P.pos) - flat(a.pos, P.pos))).slice(0, alive.length - want)) { f.silent = true; g.removeNpc(f); this.troopers.splice(this.troopers.indexOf(f), 1); }
    } else { // reinforcements: in through the far side of the ship
      const pts = REINFORCE_POINTS.slice().sort((a, b) => flat(b, P.pos) - flat(a, P.pos));
      for (let i = alive.length; i < want; i++) { const p = pts[i % pts.length]; this.spawnTrooper({ pos: p, yaw: Math.atan2(P.pos[0] - p[0], P.pos[2] - p[2]) }, this.troopers.length); }
    }
  }
  spawnTrooper(post, i) {
    const g = this.g, L = LOOK[this.shipSide];
    const f = g.spawnArchetype('stormtrooper', post.pos, post.yaw, { name: 'garrison' + i + '_' + Math.round(g.t * 10), label: L.name + ' trooper' });
    f.team = 'enemy'; f.fleetNpc = 'trooper'; f.post = { pos: post.pos.slice(), yaw: post.yaw }; f.actor.tint = L.trooper.slice(); f.actor.tintAmt = 0.62;
    this.troopers.push(f);
    return f;
  }

  // ---------------- engine hooks
  onDeath(f) {
    if (f.fleetNpc === 'trooper' && !f.silent) { this.killQueue++; this.feed.unshift({ t: 'Trooper down', life: 3 }); }
    if (f === this.g.player) this.deadAtT = this.g.t;
  }
  // a blow of our player on another player: their page learns their blade blocked it; everyone aboard sees the sparks
  onHit(A, B, pt, o = {}) {
    if (A !== this.g.player || !B?.remote || !B.fleetEid) return;
    const side = this.blockedFor.get(B); this.blockedFor.delete(B);
    if (!this.relay || B.netBot) return;
    if (o.blocked && side) this.effect(B, 'blocked', [side]);
    if (this.g.t - this.hitFxAt >= 0.08) { this.hitFxAt = this.g.t; this.shown('hit', [pt.map(v => Math.round(v * 100) / 100), o.blocked ? 1 : 0, o.touch ? 1 : 0]); }
  }
  onCast(F, id) { if (F.p === this.g.player) this.shown('cast', [id, F.aim().map(v => Math.round(v * 1000) / 1000)]); } // its sound and wave on their pages (the pose has the animation)
  fx(e, d) { if (e === 'taunt' && d?.fid === this.me.eid) this.shown('taunt', [d.side, d.n]); }
  beforeStep() {
    const g = this.g, P = g.player;
    this.ingest();
    // a grip lasts while someone here is shown holding it on us: another player's release may never come (they left, fell)
    if (P.status === 'gripped' && !g.gripperOf(P)) { if (g.t - this.gripSeenAt > 0.6) P.grip(false, 0, { soft: true }); } else this.gripSeenAt = g.t;
    if (g.stepPressed('KeyE') && P.status !== 'dead') this.useStation();
    this.tuneCommander();
    for (const b of g.combat.bolts) if (b.owner === P && b.team === 'player') b.fleetFrom = b.p.slice(); // where our bolts start this step
  }
  // our bolts against other players' puppets (Combat moves bolts and tests them against the AI; players live in their
  // own pages, so the hit is reported and the server applies it)
  boltsOnPuppets() {
    const g = this.g, P = g.player, B = g.combat.bolts;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i]; if (!b.fleetFrom || b.owner !== P || b.team !== 'player') continue;
      for (const f of g.remotes) {
        if (f.team !== 'enemy' || f.status === 'dead') continue;
        const cap = g.combat.capsule(f), r = segSeg(b.fleetFrom, b.p, cap.a, cap.b);
        if (r.d > cap.r + 0.15) continue;
        this.queueHit(f.fleetEid, 'bolt', b.dmg); f.dmgFlash = 1;
        g.fx.sparks(r.b, [0, 1, 0], 6, [1, 0.45, 0.2, 1]); g.sfxAt('hit1', r.b, 0.5);
        B.splice(i, 1); break;
      }
    }
  }
  afterStep() {
    const g = this.g, P = g.player, T = this.now();
    this.boltsOnPuppets();
    // the AI commander holds the bridge: the server keeps its body at the post, so blows only count close to it
    const f = this.cmdr;
    if (f && f.status !== 'dead') { const d = flat(f.pos, COMMANDER_POST.pos); if (d > LEASH) { const k = LEASH / d; f.pos[0] = COMMANDER_POST.pos[0] + (f.pos[0] - COMMANDER_POST.pos[0]) * k; f.pos[2] = COMMANDER_POST.pos[2] + (f.pos[2] - COMMANDER_POST.pos[2]) * k; } }
    for (const n of this.troopers.slice()) if (n.status === 'dead' && g.t - n.deadAt > 8) { g.removeNpc(n); this.troopers.splice(this.troopers.indexOf(n), 1); }
    // reports: position (+ pose with the relay), in steps the server's speed check accepts
    const every = this.relay ? STATE_EVERY : POS_EVERY;
    const cue = this.relay ? P.saber.move + ':' + P.status + ':' + (g.force.holding || '') : ''; // a new swing, a fall, a power held: at once
    const soon = cue !== this.cue && g.t - this.posAt >= STATE_SOON;
    if (P.status !== 'dead' && (g.t - this.posAt >= every || soon) && this.sentPos) {
      this.cue = cue;
      this.posAt = g.t;
      const d = dist(P.pos, this.sentPos), k = d > POS_STEP ? POS_STEP / d : 1;
      const p = lerp3(this.sentPos, P.pos, k).map((v, i) => Math.max(INTERIOR.bounds[0][i], Math.min(INTERIOR.bounds[1][i], v)));
      if (d > 0.02) this.sentPos = p;
      if (this.relay) this.client.send({ c: 'st', p: this.sentPos.map(v => Math.round(v * 100) / 100), s: encodePose(g, P, this.animIdx, f => (f === P ? this.me.eid : f.fleetEid || 0)) });
      else if (d > 0.02) this.client.send({ c: 'pos', p: p.map(v => Math.round(v * 100) / 100) });
    }
    this.blockedFor.clear();
    if (this.hurtBatch > 0 && g.t - this.hurtAt >= 0.1) {
      this.hurtAt = g.t;
      while (this.hurtBatch > 0.05) { const d = Math.min(BODY.npcHurtCap, this.hurtBatch); this.hurtBatch -= d; this.client.send({ c: 'npc', kind: 'hurt', dmg: Math.round(d * 100) / 100 }); }
      this.hurtBatch = 0;
    }
    for (const [by, left] of this.byHurt) { // what another player's effect did to us
      for (let d = left; d > 0.05; d -= BODY.hitCaps.force) this.client.send({ c: 'npc', kind: 'hurt', by, dmg: Math.round(Math.min(BODY.hitCaps.force, d) * 100) / 100 });
    }
    this.byHurt.clear();
    if (this.killQueue > 0 && g.t - this.lastKillAt >= KILL_GAP) { this.killQueue--; this.lastKillAt = g.t; this.killsInFlight.push(T); this.client.send({ c: 'npc', kind: 'kill' }); }
    this.flushHits(T);
    if (P.status !== 'dead') this.lastHp = Math.max(0, P.hp);
  }
  // our blows: at most the server's cap per hit and DPS_BUDGET in any DPS_WINDOW (the server caps each attacker at
  // BODY.dpsCap a second over all targets); the rest waits its turn
  queueHit(target, kind, dmg) {
    if (this.kinds && !this.kinds.includes(kind)) { this.refused.add(kind); return; } // the server would refuse it: not with this kit
    const cap = BODY.hitCaps[kind] || BODY.hitCaps.force;
    for (let left = dmg; left > 0.05; left -= cap) this.hits.push({ target, kind, dmg: Math.min(cap, left) });
    this.flushHits(this.now());
  }
  flushHits(T) {
    if (!this.hits.length) return;
    const P = this.g.player, w = this.dps;
    if (T - w.at >= DPS_WINDOW) { w.at = T; w.sum = 0; }
    while (this.hits.length && P.status !== 'dead' && w.sum + this.hits[0].dmg <= DPS_BUDGET) {
      const h = this.hits.shift(); w.sum += h.dmg;
      this.client.send({ c: 'hit', target: h.target, kind: h.kind, dmg: Math.round(h.dmg * 100) / 100 });
    }
    if (this.hits.length > 40) this.hits.splice(0, this.hits.length - 40);
  }
  // E at a station: plant a charge aboard an enemy ship, defuse one aboard our own; E again cancels
  stationNear(p = this.g.player.pos) {
    let best = null;
    for (const id of SUBSYSTEM_IDS) { const s = INTERIOR.stations[id], d = dist(p, s); if (d <= INTERIOR.stationRadius - 0.2 && (!best || d < best.d)) best = { id, d }; }
    return best;
  }
  useStation() {
    const g = this.g, h = g.hud;
    if (this.act) { this.client.send({ c: 'cancel' }); h.msg('Stopped'); return; }
    const s = this.stationNear();
    if (!s) { h.msg('Walk up to a station: ' + SUBSYSTEM_IDS.map(id => STATION_LABELS[id]).join(' · ')); return; }
    const charge = this.client.charges.find(c => c.area === this.area && c.station === s.id);
    const c = this.client.cruisers.get(this.cruiserEid);
    if (this.enemyShip) {
      if (charge) { h.msg('A charge is already on the ' + STATION_LABELS[s.id]); return; }
      if (c && c.subs[s.id] <= 0) { h.msg('The ' + STATION_LABELS[s.id] + ' is already destroyed'); return; }
      this.client.send({ c: 'plant', station: s.id });
    } else if (charge && charge.side !== this.side) this.client.send({ c: 'defuse', station: s.id });
    else h.msg('Nothing to defuse at the ' + STATION_LABELS[s.id]);
  }

  // ---------------- server events
  onEvent(e) {
    const g = this.g, P = g.player, h = g.hud;
    switch (e.e) {
      case 'hurt': // another player's blow, already scaled and applied by the server: show it on our fighter
        if (e.kind === 'npc' || e.self || P.status === 'dead') return; // (ours, already shown: our own report coming back)
        this.serverHurt = true;
        try { const tm = P.takeMul; P.takeMul = 1; P.hurt(e.dmg, this.puppets.get(e.by) || null, { noFlinch: e.kind !== 'saber' }); P.takeMul = tm; } finally { this.serverHurt = false; }
        h.hit(e.dmg); g.shake(e.kind === 'saber' ? 0.2 : 0.08);
        return;
      case 'down':
        if (e.victim === this.me.eid) {
          this.serverDead = true;
          if (P.status !== 'dead') { this.serverHurt = true; try { P.hp = 0; P.die(this.puppets.get(e.killer) || null); } finally { this.serverHurt = false; } }
        } else if (e.victim === this.cmdrEid) { this.killCommanderLocally(); g.banner('COMMANDER DEFEATED', [1, 0.85, 0.4], 2.2); }
        else { const f = this.puppets.get(e.victim); if (f && f.status !== 'dead') { f.hp = 0; f.die(null); } }
        if (e.area === this.area) this.feed.unshift({ t: (this.client.names.get(e.killer) || (e.killer ? 'Someone' : '')) + (e.killer ? ' defeated ' : '') + (this.client.names.get(e.victim) || 'a fighter') + (e.killer ? '' : ' fell'), life: 5 });
        return;
      case 'spawn': if (e.theater === 'interior' && e.area === this.area) { this.respawnPending = true; this.serverDead = false; } return;
      case 'fix': if (P.status !== 'dead' && Array.isArray(e.p)) { P.pos = e.p.slice(); P.vel = [0, 0, 0]; this.sentPos = e.p.slice(); } return;
      case 'action':
        if (e.kind === 'cancelled') h.msg('Moved away: the charge work stopped');
        else h.msg((e.kind === 'plant' ? 'Planting a charge on the ' : 'Defusing the charge on the ') + (STATION_LABELS[e.station] || e.station) + ' · ' + Math.round(e.ms / 1000) + ' s · stay close');
        return;
      case 'charge': if (e.area === this.area) { g.banner('CHARGE PLANTED · ' + (STATION_LABELS[e.station] || e.station).toUpperCase(), e.side === this.side ? [1, 0.75, 0.35] : [1, 0.4, 0.3], 2); g.sfxAt('push', INTERIOR.stations[e.station] || P.pos, 0.6); } return;
      case 'detonate': if (e.area === this.area) { const p = INTERIOR.stations[e.station] || P.pos; g.fx.burst([p[0], p[1] + 1, p[2]], 60, { s0: 3, s1: 9, l0: 0.5, l1: 1.3, z0: 0.05, z1: 0.14, c0: [1, 0.7, 0.3, 1], c1: [1, 0.2, 0.05, 0], grav: -4 }); g.flashLight([p[0], p[1] + 1.5, p[2]], [1, 0.6, 0.25], 0.6); g.sfxAt('hit3', p, 1); g.shake(0.5); g.banner((STATION_LABELS[e.station] || e.station).toUpperCase() + ' HIT', [1, 0.6, 0.3], 2); } return;
      case 'defused': if (e.area === this.area) g.banner('CHARGE DEFUSED', [0.6, 0.9, 1], 1.6); return;
      case 'commander': if (e.cruiser === this.cruiserEid) g.banner(e.final ? 'THE COMMANDER IS DEFEATED FOR GOOD' : 'COMMANDER DOWN · SHIELDS COLLAPSE', [1, 0.85, 0.4], 2.4); return;
      case 'denied':
        if (e.what === 'npc' && e.why === 'rate' && (this.client.cruisers.get(this.cruiserEid)?.garrison ?? 0) > 0) { this.killQueue++; this.killsInFlight.shift(); return; } // too soon after the last: again
        if (['plant', 'defuse'].includes(e.what)) h.msg('Not possible: ' + e.why);
        return;
      default: return;
    }
  }

  // ---------------- drawing
  draw(R) { // station beacons and planted charges
    const T = this.now(), c = this.client.cruisers.get(this.cruiserEid);
    for (const id of SUBSYSTEM_IDS) {
      const s = INTERIOR.stations[id], ch = this.client.charges.find(x => x.area === this.area && x.station === id), dead = c && c.subs[id] <= 0;
      const col = ch ? [1, 0.2, 0.1, 0.55 + 0.45 * Math.sin(T / 90)] : dead ? [0.4, 0.4, 0.45, 0.35] : this.enemyShip ? [1, 0.62, 0.2, 0.55] : [0.4, 0.75, 1, 0.45];
      R.billboard([s[0], s[1] + 2.6 + 0.1 * Math.sin(T / 400 + s[0]), s[2]], ch ? 0.5 : 0.32, col, 0);
      if (ch) R.billboard([s[0], s[1] + 0.6, s[2]], 0.22, [1, 0.15, 0.1, 0.5 + 0.5 * Math.sin(T / 60)], 0);
    }
  }
  drawHud(hud, x, W, H, dt) {
    const g = this.g, P = g.player, C = this.client, you = C.you, c = C.cruisers.get(this.cruiserEid), T = this.now();
    const text = (s, X, Y, font, col, align = 'left', base = 'top') => { x.font = font; x.fillStyle = col; x.textAlign = align; x.textBaseline = base; x.fillText(s, X, Y); };
    const panel = (X, Y, w, h) => { x.fillStyle = 'rgba(6,12,24,0.72)'; x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, 9) : x.rect(X, Y, w, h); x.fill(); };
    // name tags + health over everyone near
    for (const f of [...g.npcs, ...g.remotes]) {
      if (f.status === 'dead' || flat(f.pos, P.pos) > 26) continue;
      const hp = f.headPos(), s = hud.project(g.R, [hp[0], hp[1] + 0.38, hp[2]]); if (!s || s[0] < -60 || s[0] > W + 60 || s[1] < -60 || s[1] > H + 60) continue;
      const sc = Math.max(0.55, Math.min(1.1, 9 / (s[2] + 4))), w = 58 * sc, foe = f.team === 'enemy';
      hud.bar(x, s[0] - w / 2, s[1] - 14 * sc, w, 5 * sc + 1, f.hp / Math.max(1, f.maxHp), foe ? ['#d92b2b', '#ff8f6a'] : ['#2b7bd9', '#7fc8ff']);
      const shTop = f.netMaxShield ? 4 * sc : 0;
      if (shTop) hud.bar(x, s[0] - w / 2, s[1] - 18 * sc, w, 3 * sc, (f.netShield || 0) / f.netMaxShield, ['#2f9fd0', '#9fe6ff']);
      text(f.label || '', s[0], s[1] - 16 * sc - shTop, `600 ${Math.round(10 * sc + 1)}px system-ui,sans-serif`, foe ? '#ffb4a0' : '#bfe3ff', 'center', 'bottom');
    }
    // station markers (with distance) so the objective is never lost
    for (const id of SUBSYSTEM_IDS) {
      const st = INTERIOR.stations[id], s = hud.project(g.R, [st[0], st[1] + 3.1, st[2]]); if (!s) continue;
      const ch = C.charges.find(q => q.area === this.area && q.station === id), left = ch ? Math.max(0, ch.left - (T - C.snapAt)) : 0, dead = c && c.subs[id] <= 0;
      const X = Math.max(40, Math.min(W - 40, s[0])), Y = Math.max(40, Math.min(H - 60, s[1]));
      text(STATION_LABELS[id] + (dead ? ' (destroyed)' : '') + ' · ' + Math.round(dist(P.pos, st)) + ' m', X, Y, '600 11px system-ui,sans-serif', ch ? '#ff8a6a' : dead ? '#8a93a8' : this.enemyShip ? '#ffcf7a' : '#9fd6ff', 'center', 'bottom');
      if (ch) text('charge ' + Math.ceil(left / 1000) + ' s', X, Y + 2, '700 12px system-ui,sans-serif', '#ff6a4a', 'center', 'top');
    }
    // mission panel (top right)
    const role = this.role(), lines = [];
    const shipName = c ? (C.names.get(c.eid) || 'Cruiser') : 'Cruiser';
    lines.push([(this.enemyShip ? 'ABOARD ' : 'DEFENDING ') + shipName.toUpperCase(), '700 13px system-ui,sans-serif', '#ffe2a8']);
    lines.push([this.enemyShip ? MISSION[role] || MISSION.boarder : role === 'commander' ? 'Hold the bridge: you are the ship\'s commander' : 'Stop the boarders: defuse their charges (E)', '12px system-ui,sans-serif', '#c8d4f0']);
    const T0 = TIER[this.tier];
    lines.push(['Kit: ' + (T0 ? T0.name[this.side] + ' · ' + T0.kit : 'Jedi commander · lightsaber, Force') + (this.refused.size ? ' (no ' + [...this.refused].join(' / ') + ' with it)' : ''), '11px system-ui,sans-serif', '#a8e0ff']);
    if (c) {
      for (const id of SUBSYSTEM_IDS) { const hp = c.subs[id], max = CRUISER.subsystems[id].hp; lines.push([STATION_LABELS[id] + '  ' + (hp > 0 ? Math.round(100 * hp / max) + '%' : 'destroyed'), '11px ui-monospace,Menlo,Consolas,monospace', hp > 0 ? '#9aa6c8' : '#ff8a6a']); }
      const m = this.shipMods(), cm = this.cmdr && this.cmdr.status !== 'dead' ? this.cmdr : [...this.puppets.values()].find(f => f.fleetRole === 'commander' && f.status !== 'dead');
      const strike = this.enemyShip && role === 'strike' ? ' (strike team x' + COMMANDER.strikeBonus + ')' : '';
      lines.push(['Commander ' + (cm ? Math.ceil(cm.hp) + ' / ' + COMMANDER.hp : c.leaderless ? 'gone: the ship is leaderless' : 'down') + ' · ' + (c.tier || m.tier) + ' · defeats ' + c.defeats + '/' + COMMANDER.maxDefeats, '11px system-ui,sans-serif', '#ffd479']);
      lines.push(['  takes x' + m.damageTaken.toFixed(2) + strike + ' · deals x' + m.damageDealt.toFixed(2) + ' · Force x' + m.forceRegen.toFixed(2), '11px system-ui,sans-serif', '#d9c48a']);
      lines.push(['Garrison ' + c.garrison + ' / ' + INTERIOR.garrison + (this.enemyShip ? ' · ' + this.troopers.filter(f => f.status !== 'dead').length + ' near you' : ''), '11px system-ui,sans-serif', '#9aa6c8']);
    }
    const pw = 330, px = W - pw - 14; panel(px, 10, pw, 14 + lines.length * 16);
    lines.forEach(([s, f, col], i) => text(s, px + 12, 17 + i * 16, f, col));
    // planting / defusing progress
    const a = you?.b?.act;
    if (a) { const k = 1 - Math.max(0, a[2] - (T - C.snapAt)) / Math.max(1, a[3]); const w = 260, X = W / 2 - w / 2, Y = H * 0.66; panel(X - 8, Y - 24, w + 16, 44); text((a[0] === 'plant' ? 'PLANTING · ' : 'DEFUSING · ') + (STATION_LABELS[a[1]] || a[1]).toUpperCase(), W / 2, Y - 18, '700 12px system-ui,sans-serif', '#ffd479', 'center'); hud.bar(x, X, Y, w, 8, Math.max(0, Math.min(1, k)), ['#c98a1f', '#ffd479']); }
    else { const s = this.stationNear(); if (s && P.status !== 'dead') { const ch = C.charges.find(q => q.area === this.area && q.station === s.id); const can = this.enemyShip ? !ch : ch && ch.side !== this.side; if (can) text('E  ' + (this.enemyShip ? 'plant a charge on the ' : 'defuse the charge on the ') + STATION_LABELS[s.id], W / 2, H * 0.66, '700 14px system-ui,sans-serif', '#ffe2a8', 'center'); } }
    // feed + toasts (bottom right)
    for (const k of this.feed) k.life -= dt; this.feed = this.feed.filter(k => k.life > 0).slice(0, 5);
    const rows = [...C.feed.filter(f => T - f.at < 6000).slice(0, 4).map(f => [f.text, f.tone === 'bad' ? '#ff9a8a' : f.tone === 'good' ? '#9dffb0' : '#e8ecff']), ...this.feed.map(f => [f.t, '#c8d4f0'])];
    rows.forEach(([s, col], i) => text(s, W - 18, H - 80 - i * 16, '600 12px system-ui,sans-serif', col, 'right', 'bottom'));
    C.toasts.forEach((t, i) => text(t.text, W / 2, 96 + i * 20, '600 13px system-ui,sans-serif', '#dfeaff', 'center'));
    if (g.t - (this.shieldHitAt ?? -9) < 0.25) { x.strokeStyle = 'rgba(120,210,255,' + (1 - (g.t - this.shieldHitAt) / 0.25) * 0.6 + ')'; x.lineWidth = 10; x.strokeRect(5, 5, W - 10, H - 10); } // a hit on the shield
    if (this.maxShield > 0 && P.status !== 'dead') { // the personal shield, just above the engine's health bar
      hud.bar(x, 18, H - 96, 194, 9, this.shield / this.maxShield, ['#2f9fd0', '#9fe6ff']);
      text('SHIELD ' + Math.ceil(this.shield) + ' / ' + this.maxShield, 24, H - 106, '700 10px system-ui,sans-serif', '#bfefff', 'left', 'bottom');
    }
    hud.drawBanners(x, W, H, dt); hud.drawGripHint(g, x, W, H);
    if (P.status === 'dead') {
      x.fillStyle = 'rgba(30,0,0,0.35)'; x.fillRect(0, 0, W, H);
      const rs = you?.rs || 0, next = role === 'commander' ? 'back on the bridge' : this.enemyShip || role === 'pilot' ? 'relaunching from your cruiser' : 'back at your post';
      text('Down', W / 2, H * 0.38, '700 30px system-ui,sans-serif', '#ffd8d0', 'center');
      text(rs > 0 ? next + ' in ' + Math.ceil(rs / 1000) + ' s' : next, W / 2, H * 0.38 + 40, '15px system-ui,sans-serif', '#ffd8d0', 'center');
    } else if (P.spawnShield > g.t) text('Spawn protection', W / 2, H * 0.36, '600 13px system-ui,sans-serif', '#bfe3ff', 'center', 'middle');
    x.textAlign = 'left';
  }
}
