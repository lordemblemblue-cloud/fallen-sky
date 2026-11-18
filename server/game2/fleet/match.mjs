// One authoritative Fleet Assault match: two sides of cruisers, 40+ combatants, space, boarding and the ground phase.
// The server owns flight (commands run through flight.mjs), bolts, missiles, cruisers, HP, timers and outcomes.
// Saber / Force contact inside a ship or on the planet is resolved by Game 2's own combat code on the attacker's
// client, as in the arena; every such report is checked against rules.mjs BODY limits before it changes HP. What a
// body looks like (pose) and Force effects on another player's fighter are relayed between the pages in the same area
// within rules.mjs RELAY limits; the relay never changes HP or takes a position the speed check refused.
//
// Transport-neutral: a player's `conn` only needs send(message, reliable). hub.mjs plugs in WebSockets (arena.mjs) and the
// browser's in-page practice server plugs in callbacks.
import {
  BOARDING_ROLES, BODY, CHARGES, COMMANDER, CRUISER, FLEET_PROTOCOL, GROUND, HANGAR_FIELD, INTERIOR, MATCH, PERSONAL_SHIELD,
  POSE_FIELDS, POSE_FLAGS, POSE_HILTS, POSE_THROWN, PROGRESSION, RELAY, ROLE_CODES, ROLES, SCORE, SHIP_CLASSES, SHIP_TIERS, SIDES, SUBSYSTEM_IDS,
  TIER_CODES, TIER_LEVEL_CODES, TROOPER_TIERS, SHIP_SHIELD_SKILL, classForRole, commanderModifiers, enemyOf, fleetStrength, roleCaps, sideCode,
} from './rules.mjs';
import {
  add, addScaled, clamp, dist, dot, finite, finite3, forwardOf, fromBoxLocal, insideBox, len, lerp3, norm, qlook,
  scale, segmentHitsBox, segmentHitsSphere, sub, toBoxLocal,
} from './vec.mjs';
import { boltVelocity, muzzleOf, newFlightState, sanitizeCmd, stepShip } from './flight.mjs';
import { botCommand } from './bots.mjs';
import { capitalPosition, createAsteroidField, asteroidHitFraction } from './battlefield.mjs';

const CRAFT_EID0 = 100;
const HIST = 16;
const STATE_CODES = { active: 0, spooling: 1, escaped: 2, destroyed: 3 };
const GROUND_CODES = { pending: 0, open: 1, closed: 2 };
const live = c => c.state === 'active' || c.state === 'spooling';
const q10 = n => Math.round(n * 10);
const q4 = n => Math.round(n * 10000);
const q100 = n => Math.round(n * 100);
const POSE_ALL = [...POSE_FIELDS, ...POSE_THROWN];
const PI = Object.fromEntries(POSE_FIELDS.map(([k], i) => [k, i]));
const hasKind = (b, k) => !b.kinds || b.kinds.includes(k); // a commander's body has no kit list: every kind

export function createFleetMatch({ id = 'fleet', now = Date.now, rng = Math.random, config = {} } = {}) {
  const cfg = { ...MATCH, ...config };
  const t0 = now();
  const m = {
    id, cfg, phase: 'warmup', createdAt: t0, warmupUntil: null, startedAt: null, endedAt: null, result: null,
    tick: 0, simAt: t0, players: new Map(), byEid: new Map(), crafts: new Map(), cruisers: [], bolts: [], missiles: [],
    sides: Object.fromEntries(SIDES.map(s => [s, {
      tickets: cfg.tickets, maxTickets: cfg.tickets, score: 0, strength: 1,
      buffs: { comms: false }, voice: { team: true }, noHumansSince: null,
    }])),
    ground: { phase: 'pending', opensAt: null, closesAt: null, arrays: { republic: GROUND.arrayHp, separatist: GROUND.arrayHp }, charges: new Map(), result: null },
    nextEid: CRAFT_EID0, nextShot: 1, events: [], boardDirty: true, newBolts: [],
    asteroids: [],
  };

  // ---- cruisers -----------------------------------------------------------------------------------------------------
  let cruiserEid = 1;
  for (const side of SIDES) {
    const dir = side === 'republic' ? -1 : 1;
    for (let i = 0; i < cfg.cruisersPerSide; i++) {
      // 7-per-side defaults: 14 stations distributed across a full 3D sphere.
      // Explicit <=2-cruiser test / custom matches retain their previous layout.
      const spherical = cfg.cruisersPerSide > 2;
      const pos = spherical ? capitalPosition(side, i, cfg.cruisersPerSide) :
        [(i - (cfg.cruisersPerSide - 1) / 2) * CRUISER.spacing, 0, dir * CRUISER.startZ];
      const yaw = spherical ? Math.atan2(pos[0], pos[2]) : Math.PI / 2;
      m.cruisers.push({
        eid: cruiserEid++, side, idx: i, name: (side === 'republic' ? 'Republic' : 'Imperial') + ' capital ' + (i + 1),
        p: pos, yaw, half: CRUISER.half,
        hull: CRUISER.hull, shields: CRUISER.shields, subs: Object.fromEntries(SUBSYSTEM_IDS.map(s => [s, CRUISER.subsystems[s].hp])),
        state: 'active', spoolUntil: 0, lastHitAt: -Infinity, shieldsCollapsedUntil: 0, leaderless: false, focus: null,
        commander: { pid: null, defeats: 0 }, garrison: INTERIOR.garrison, garrisonAt: 0,
        turretCd: CRUISER.turrets.map((_, k) => k * 40), broadsideCd: CRUISER.broadsideIntervalMs * (0.5 + i * 0.25),
        charges: new Map(), mods: commanderModifiers(1, 1), destroyedAt: 0,
      });
    }
  }
  // All clients receive this fixed field once in their welcome message.
  m.asteroids = createAsteroidField(m.cruisers);
  const cruiserByEid = eid => m.cruisers.find(c => c.eid === eid) || null;
  const sideCruisers = side => m.cruisers.filter(c => c.side === side);
  const liveCruisers = side => m.cruisers.filter(c => c.side === side && live(c));
  const hangarOf = c => fromBoxLocal(CRUISER.hangar, c.p, c.yaw);
  const hardpointOf = (c, s) => fromBoxLocal(CRUISER.subsystems[s].at, c.p, c.yaw);
  const fleetCenter = side => {
    const cs = liveCruisers(side).length ? liveCruisers(side) : sideCruisers(side);
    return scale(cs.reduce((a, c) => add(a, c.p), [0, 0, 0]), 1 / Math.max(1, cs.length));
  };

  // ---- events and output --------------------------------------------------------------------------------------------
  const emit = ev => { m.events.push(ev); };
  const tell = (p, ev) => { if (p?.human && p.conn) p.outbox.push(ev); };
  const sendTo = (p, msg, reliable = true) => { if (p?.human && p.conn) { try { p.conn.send(msg, reliable); } catch { /* transport gone */ } } };
  const humans = side => [...m.players.values()].filter(p => p.human && (!side || p.side === side));
  const credit = (p, points, field) => {
    if (!p) return;
    p.stats.score += points;
    p.points += points * PROGRESSION.pointsPerScore; p.earned += points * PROGRESSION.pointsPerScore;
    if (field) p.stats[field] += 1;
    m.sides[p.side].score += points;
    m.boardDirty = true;
  };

  // ---- players ------------------------------------------------------------------------------------------------------
  function newPlayer({ pid, name, human, conn = null, side, pref = 'pilot' }) {
    const p = {
      id: pid, eid: m.nextEid++, name: String(name || 'Pilot').slice(0, 20) || 'Pilot', human, conn, side,
      pref: ROLES[pref] ? pref : 'pilot', role: 'pilot', home: null, theater: 'lobby', body: null, respawnAt: 0,
      lastSeq: -1, budget: cfg.cmdBudgetMs, budgetAt: now(), rtt: 0, pingId: 0, pingAt: 0, pingSent: null,
      stats: { kills: 0, deaths: 0, damage: 0, objectives: 0, score: 0 }, outbox: [], joinedAt: now(),
      dmgWin: { at: 0, sum: 0 }, npcAt: 0, pingMarkAt: 0, bot: human ? null : { seq: 0, target: null, retargetAt: 0, style: 'dogfight' },
      points: PROGRESSION.startPoints, earned: PROGRESSION.startPoints,
      loadout: { ship: SHIP_TIERS[0].id, trooper: TROOPER_TIERS[0].id }, deployed: { ship: null, trooper: null },
      relay: { pose: { tokens: RELAY.poseBurst, at: now() }, fx: { tokens: RELAY.effectBurst, at: now() }, deniedAt: -Infinity, fxFrom: new Map() },
    };
    m.players.set(pid, p); m.byEid.set(p.eid, p);
    return p;
  }
  const roleCount = (side, role, except) => [...m.players.values()].filter(p => p.side === side && p.role === role && p !== except && (role !== 'commander' || p.human)).length;
  const sideSize = side => [...m.players.values()].filter(p => p.side === side && !(p.bot && p.role === 'commander')).length;

  // Give p the role it asks for if its side has room; otherwise it flies. Commanders take a cruiser's command seat.
  function applyRole(p, wanted) {
    let role = ROLES[wanted] ? wanted : 'pilot';
    if (!p.human && role !== 'pilot' && role !== 'commander') role = 'pilot';
    const caps = roleCaps(sideSize(p.side), cfg.cruisersPerSide);
    if (role === 'commander') {
      const seat = liveCruisers(p.side).find(c => c.commander.pid === p.id) ||
        liveCruisers(p.side).find(c => !c.leaderless && (!c.commander.pid || m.players.get(c.commander.pid)?.bot));
      if (!seat) role = p.human ? 'pilot' : null;
      else {
        const prev = seat.commander.pid && seat.commander.pid !== p.id ? m.players.get(seat.commander.pid) : null;
        seat.commander.pid = p.id; p.home = seat.eid;
        if (prev) { // a human takes over from the stand-in: keep the body's health
          if (prev.body?.alive && p.body == null && m.phase === 'battle') p.inheritHp = prev.body.hp;
          removePlayer(prev.id, true);
        }
      }
    } else if (roleCount(p.side, role, p) >= caps[role]) role = 'pilot';
    if (p.role === 'commander' && role !== 'commander') {
      const seat = cruiserByEid(p.home);
      if (seat?.commander.pid === p.id) seat.commander.pid = null;
    }
    if (role === null) return null;
    p.role = role;
    if (role !== 'commander' && (!p.home || !live(cruiserByEid(p.home)))) p.home = pickHome(p.side, role);
    if (role === 'guard') p.home = pickHome(p.side, role);
    m.boardDirty = true;
    ensureCommanders();
    return role;
  }
  function pickHome(side, role) {
    const cs = liveCruisers(side);
    if (!cs.length) return null;
    const load = c => [...m.players.values()].filter(q => q.home === c.eid && (role !== 'guard' || q.role === 'guard')).length;
    return cs.reduce((best, c) => (load(c) < load(best) ? c : best), cs[0]).eid;
  }
  // every cruiser has a commander: a human who asked for the seat, or an AI stand-in
  function ensureCommanders() {
    for (const c of m.cruisers) {
      if (!live(c) || c.leaderless) continue;
      if (c.commander.pid && m.players.has(c.commander.pid)) continue;
      const bot = newPlayer({ pid: 'bot:cmdr:' + c.eid + ':' + m.nextEid, name: 'Jedi Master (AI)', human: false, side: c.side, pref: 'commander' });
      bot.role = 'commander'; bot.home = c.eid; c.commander.pid = bot.id;
      if (m.phase === 'battle') spawn(bot);
    }
  }
  function pilotBots(side) { return [...m.players.values()].filter(p => p.bot && p.side === side && p.role !== 'commander'); }
  // keep at least cfg.minPlayers fighting: AI pilots fill both sides evenly and leave as humans arrive
  function rebalanceBots() {
    if (!cfg.fillBots || m.phase === 'ended') return;
    const humanCount = Object.fromEntries(SIDES.map(s => [s, humans(s).length]));
    const perSide = Math.max(Math.ceil(cfg.minPlayers / 2), ...SIDES.map(s => humanCount[s]));
    for (const side of SIDES) {
      const bots = pilotBots(side);
      const want = Math.max(0, perSide - humanCount[side]);
      for (let i = bots.length; i < want; i++) {
        const bot = newPlayer({ pid: 'bot:' + side + ':' + m.nextEid, name: (side === 'republic' ? 'Republic' : 'Separatist') + ' AI ' + (i + 1), human: false, side });
        bot.bot.style = i % 5 < 3 ? 'dogfight' : 'capital';
        applyRole(bot, 'pilot');
        if (m.phase === 'battle') spawn(bot);
      }
      const extra = bots.length - want;
      if (extra > 0) bots.sort((a, b) => (a.theater === 'space') - (b.theater === 'space')).slice(0, extra).forEach(b => removePlayer(b.id, true));
    }
    m.boardDirty = true;
  }
  function chooseSide(requested) {
    const h = Object.fromEntries(SIDES.map(s => [s, humans(s).length]));
    if (SIDES.includes(requested) && h[requested] <= h[enemyOf(requested)]) return requested;
    if (h.republic !== h.separatist) return h.republic < h.separatist ? 'republic' : 'separatist';
    return SIDES.includes(requested) ? requested : (rng() < 0.5 ? 'republic' : 'separatist');
  }

  // ---- spawning, crafts and bodies ----------------------------------------------------------------------------------
  function newBody(area, at, hp) {
    return {
      area, p: [...at], hp, max: hp, alive: true, protectUntil: now() + BODY.spawnProtectMs, posAt: now(), action: null,
      shield: 0, maxShield: 0, hurtAt: 0, kinds: null, tier: 'commander', pose: null, poseAt: 0, poseNew: false,
    };
  }
  // ---- progression: what a player may deploy as, and paying for it ---------------------------------------------------
  const tierOpen = (p, t) => p.stats.kills >= t.kills && (cfg.spendPoints ? p.points : p.earned) >= t.cost;
  // the level the player picked if they can have it (paid for in spend mode), otherwise the basic one
  function takeTier(p, tiers, wanted) {
    let t = tiers.find(x => x.id === wanted) || tiers[0];
    if (!p.human) t = [...tiers].reverse().find(x => tierOpen(p, x)) || tiers[0]; // AI pilots take the best they can afford
    if (t !== tiers[0] && !tierOpen(p, t)) {
      tell(p, { e: 'denied', what: 'loadout', why: t.name[p.side] + ' needs ' + t.cost + ' points and ' + t.kills + ' kills' });
      t = tiers[0];
    }
    if (cfg.spendPoints && t.cost) { p.points -= t.cost; tell(p, { e: 'deployed', tier: t.id, cost: t.cost }); }
    return t;
  }
  // a body for someone on foot: the commander is always a Jedi; everyone else gets their trooper level
  function infantryBody(p, area, at) {
    if (p.role === 'commander') {
      const b = newBody(area, at, p.inheritHp ?? COMMANDER.hp);
      b.max = COMMANDER.hp; p.inheritHp = undefined;
      return b;
    }
    const t = takeTier(p, TROOPER_TIERS, p.loadout.trooper);
    const b = newBody(area, at, t.hp);
    b.shield = b.maxShield = t.shield; b.kinds = t.kinds; b.tier = t.id;
    p.deployed.trooper = t.id;
    return b;
  }
  function launchPoint(c) {
    const h = hangarOf(c);
    const along = fromBoxLocal([0, 0, (rng() - 0.5) * 2 * (CRUISER.half[2] - 40)], [0, 0, 0], c.yaw);
    const p = add(add(h, along), [(rng() - 0.5) * 120, -70 - rng() * 50, (rng() - 0.5) * 120]);
    const toward = sub(fleetCenter(enemyOf(c.side)), p);
    return { p, q: qlook(toward) };
  }
  function spawn(p) {
    p.respawnAt = 0;
    removeCraft(p);
    p.body = null;
    if (m.phase !== 'battle') { p.theater = 'lobby'; return; }
    if (p.human && p.role !== p.pref) applyRole(p, p.pref);
    if (!p.home || !live(cruiserByEid(p.home))) p.home = pickHome(p.side, p.role);
    const home = cruiserByEid(p.home);
    if (!home) { p.theater = 'out'; return; }
    const S = INTERIOR.stations;
    if (p.role === 'commander') {
      p.body = infantryBody(p, 'ship:' + home.eid, S.bridge);
      p.theater = 'interior';
    } else if (p.role === 'guard' || (p.role !== 'ground' && m.sides[p.side].tickets <= 0)) {
      // guards, and everyone once the fleet's reinforcements are spent, defend their ship from inside
      const posts = ['weapons', 'hyperdrive', 'shields', 'comms'];
      p.body = infantryBody(p, 'ship:' + home.eid, S[posts[p.eid % posts.length]]);
      p.theater = 'interior';
    } else if (p.role === 'ground' && m.ground.phase === 'open') {
      const at = GROUND.landing[p.side];
      p.body = infantryBody(p, 'ground', [at[0], 0, at[2] + (rng() - 0.5) * 30]);
      p.theater = 'ground';
    } else {
      let cls = classForRole(p.role);
      if (!cls.canDock) { // fighters come in three levels; boarding parties always fly the boarding craft
        const t = takeTier(p, SHIP_TIERS, p.loadout.ship);
        cls = SHIP_CLASSES[t.cls];
        p.deployed.ship = t.id;
      } else p.deployed.ship = null;
      const lp = launchPoint(home);
      const craft = {
        eid: p.eid, owner: p.id, cls, side: p.side, f: newFlightState(cls, lp.p, lp.q), hp: cls.hull,
        shield: cls.shieldMax, shieldReadyAt: 0, alive: true,
        hist: [], lock: { target: 0, t: 0 }, missiles: cls.missiles?.count || 0, missileCd: 0, firingUntil: 0, spawnedAt: now(),
      };
      m.crafts.set(craft.eid, craft);
      p.theater = 'space';
    }
    tell(p, { e: 'spawn', theater: p.theater, role: p.role, home: p.home });
    m.boardDirty = true;
  }
  function removeCraft(p) { const c = m.crafts.get(p.eid); if (c) { c.alive = false; m.crafts.delete(p.eid); } }
  function respawnDelay(p, base = cfg.respawnMs) { return base * (m.sides[p.side].buffs.comms ? GROUND.buff.respawn : 1); }
  function destroyCraft(craft, killer, how) {
    if (!craft.alive) return;
    const p = m.players.get(craft.owner);
    craft.alive = false; m.crafts.delete(craft.eid);
    emit({ e: 'kill', victim: craft.eid, killer: killer?.eid || 0, how, at: craft.f.p.map(q10) });
    if (killer && killer !== p) { killer.stats.kills++; credit(killer, SCORE.kill); }
    if (!p) return;
    p.stats.deaths++;
    m.sides[p.side].tickets = Math.max(0, m.sides[p.side].tickets - 1);
    p.theater = 'dead'; p.respawnAt = now() + respawnDelay(p);
    m.boardDirty = true;
  }
  function downBody(p, killer, how) {
    const b = p.body;
    if (!b?.alive) return;
    b.alive = false; b.action = null;
    const area = b.area;
    emit({ e: 'down', victim: p.eid, killer: killer?.eid || 0, how, area });
    if (killer && killer !== p) { killer.stats.kills++; credit(killer, SCORE.bodyKill); }
    p.stats.deaths++;
    p.theater = 'dead';
    let delay = BODY.respawnMs;
    const enemyShip = area.startsWith('ship:') && cruiserByEid(+area.slice(5))?.side !== p.side;
    if (enemyShip && (BOARDING_ROLES.includes(p.role) || p.role === 'pilot')) { // a boarder killed aboard: one more fleet loss
      m.sides[p.side].tickets = Math.max(0, m.sides[p.side].tickets - 1);
      delay = respawnDelay(p);
    }
    if (p.role === 'commander') {
      const c = cruiserByEid(p.home);
      if (c && live(c)) { // (a commander lost with the ship is handled by leaveCruiser)
        c.commander.defeats++;
        c.shields = 0; c.shieldsCollapsedUntil = now() + COMMANDER.shieldCollapseMs;
        if (killer) credit(killer, SCORE.commander, 'objectives');
        emit({ e: 'commander', cruiser: c.eid, defeats: c.commander.defeats, final: c.commander.defeats >= COMMANDER.maxDefeats });
        if (c.commander.defeats >= COMMANDER.maxDefeats) {
          c.leaderless = true; c.commander.pid = null;
          p.role = 'guard'; p.pref = p.human ? 'guard' : p.pref;
          if (!p.human) { removePlayer(p.id, true); return; }
        } else delay = COMMANDER.respawnMs;
      }
    }
    p.respawnAt = now() + delay;
    m.boardDirty = true;
  }
  // self: the victim's own page resolved and reported it (it has already shown it)
  function applyBodyDamage(t, dmg, attacker, kind, self = false) {
    const b = t.body;
    const absorbed = Math.min(b.shield, dmg); // a personal shield takes the damage first
    b.shield -= absorbed; b.hurtAt = now();
    b.hp -= dmg - absorbed;
    b.action = null; // taking damage interrupts planting and defusing
    if (attacker) { tell(attacker, { e: 'hit', target: t.eid, dmg: Math.round(dmg), kind }); attacker.stats.damage += dmg; }
    tell(t, self ? { e: 'hurt', by: attacker?.eid || 0, dmg: Math.round(dmg), kind, self: 1 } : { e: 'hurt', by: attacker?.eid || 0, dmg: Math.round(dmg), kind });
    if (b.hp <= 0) downBody(t, attacker, kind);
  }

  // ---- cruiser damage -----------------------------------------------------------------------------------------------
  function subsystemAt(c, point) {
    let best = null, bestD = Infinity;
    for (const s of SUBSYSTEM_IDS) {
      if (c.subs[s] <= 0) continue;
      const d = dist(point, hardpointOf(c, s));
      if (d <= CRUISER.subsystems[s].r && d < bestD) { best = s; bestD = d; }
    }
    return best;
  }
  function damageSubsystem(c, s, dmg, attacker) {
    if (c.subs[s] <= 0) return;
    c.subs[s] = Math.max(0, c.subs[s] - dmg);
    if (c.subs[s] > 0) return;
    emit({ e: 'subsystem', cruiser: c.eid, sub: s });
    if (attacker) credit(attacker, SCORE.subsystem, 'objectives');
    if (s === 'shields') c.shields = 0;
    if (s === 'hyperdrive' && c.state === 'spooling') { c.state = 'active'; emit({ e: 'jump', cruiser: c.eid, cancelled: true }); }
    if (s === 'weapons') c.focus = null;
  }
  function damageHull(c, dmg, attacker) {
    c.hull = Math.max(0, c.hull - dmg);
    if (c.hull <= 0) destroyCruiser(c, attacker);
  }
  function hurtCruiser(c, amount, point, attacker, kind) {
    if (!live(c) || !(amount > 0)) return;
    c.lastHitAt = now();
    if (attacker) { attacker.stats.damage += amount; credit(attacker, amount * SCORE.capitalDamage); }
    let dmg = amount;
    if (kind !== 'charge' && c.shields > 0) {
      const a = Math.min(c.shields, dmg);
      c.shields -= a; dmg -= a;
      if (c.shields <= 0) emit({ e: 'shields', cruiser: c.eid, down: true });
      if (dmg <= 0) return;
    }
    const s = point ? subsystemAt(c, point) : null;
    if (s) { damageSubsystem(c, s, dmg, attacker); damageHull(c, dmg * CRUISER.subsystemShare, attacker); }
    else damageHull(c, dmg, attacker);
  }
  function bodiesIn(area) { return [...m.players.values()].filter(p => p.body?.alive && p.body.area === area); }
  function destroyCruiser(c, killer) {
    if (!live(c)) return;
    c.state = 'destroyed'; c.hull = 0; c.shields = 0; c.destroyedAt = now(); c.charges.clear();
    emit({ e: 'cruiser', cruiser: c.eid, destroyed: true, killer: killer?.eid || 0 });
    if (killer) credit(killer, SCORE.cruiser, 'objectives');
    m.sides[enemyOf(c.side)].score += SCORE.cruiser;
    for (const p of bodiesIn('ship:' + c.eid)) downBody(p, null, 'explosion');
    leaveCruiser(c);
  }
  // a cruiser left the battle: its crew moves to another cruiser of the side (or is out), boarders aboard go home
  function leaveCruiser(c) {
    if (c.commander.pid) {
      const cmdr = m.players.get(c.commander.pid);
      c.commander.pid = null;
      if (cmdr?.bot) removePlayer(cmdr.id, true);
      else if (cmdr) cmdr.role = 'pilot'; // still asks for a seat: takes another cruiser's from its AI stand-in
    }
    for (const p of m.players.values()) {
      if (p.home === c.eid) p.home = pickHome(p.side, p.role);
      if (p.body?.alive && p.body.area === 'ship:' + c.eid) { // carried away in a jump
        p.body = null; p.theater = 'dead'; p.respawnAt = now() + 3000;
      }
    }
    ensureCommanders();
    m.boardDirty = true;
  }
  function escapeCruiser(c) {
    c.state = 'escaped';
    emit({ e: 'jump', cruiser: c.eid, escaped: true });
    leaveCruiser(c);
  }

  // ---- bolts, missiles, turrets ---------------------------------------------------------------------------------
  function rewindFor(p) { return p?.human ? clamp(p.rtt / 2 + cfg.interpMs, 0, cfg.maxRewindMs) : 0; }
  function positionAt(craft, t) {
    const h = craft.hist;
    if (!h.length || t >= h[h.length - 1].t) return craft.f.p;
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (t >= a.t) return lerp3(a.p, b.p, (t - a.t) / Math.max(1, b.t - a.t));
    }
    return h[0].p;
  }
  function fireBolt(owner, ownerEid, side, p, v, dmg, lifeMs, rewind, kind) {
    m.bolts.push({ id: m.nextShot++, owner, ownerEid, side, p, v, dmg, die: now() + lifeMs, rewind, kind });
    // every client draws the same bolts (its own it predicts); the next snapshot carries them
    if (m.newBolts.length < 400) m.newBolts.push([ownerEid, q10(p[0]), q10(p[1]), q10(p[2]), Math.round(v[0]), Math.round(v[1]), Math.round(v[2]), kind === 'turret' ? 1 : 0]);
  }
  function laserDamage(p, cls) { return cls.lasers.damage * (m.sides[p.side].buffs.comms ? GROUND.buff.laserDamage : 1); }
  function updateLock(craft, cmd, dt) {
    const M = craft.cls.missiles;
    if (!M) return;
    const target = cmd.lock ? (m.crafts.get(cmd.lock) || cruiserByEid(cmd.lock)) : null;
    const ok = target && target.side !== craft.side && (target.f ? target.alive : live(target)) && (() => {
      const tp = target.f ? target.f.p : target.p;
      const to = sub(tp, craft.f.p), d = len(to);
      return d <= M.lockRange + (target.f ? 0 : 300) && dot(norm(to), forwardOf(craft.f.q)) >= Math.cos(M.lockCone);
    })();
    if (!ok) { craft.lock.target = 0; craft.lock.t = 0; return; }
    if (craft.lock.target !== cmd.lock) { craft.lock.target = cmd.lock; craft.lock.t = 0; }
    craft.lock.t += dt;
  }
  function runCmd(p, craft, cmd) {
    const cls = craft.cls;
    const shots = stepShip(craft.f, cls, cmd);
    // All hulls spawn protected by a ship shield. Recasting the ability
    // refreshes a bounded fraction of that same shield after damage.
    // Server checks the cooldown; repeated/spoofed input can't grant extra.
    if ((cmd.shield || (p.bot && craft.shield <= cls.shieldMax * .28)) &&
        craft.shield < cls.shieldMax && now() >= craft.shieldReadyAt) {
      craft.shield = Math.min(cls.shieldMax, craft.shield + cls.shieldMax * SHIP_SHIELD_SKILL.restoreFraction);
      craft.shieldReadyAt = now() + SHIP_SHIELD_SKILL.cooldownMs;
      tell(p, { e: 'shield-rebuff', value: Math.ceil(craft.shield) });
    }
    const dt = cmd.ms / 1000;
    updateLock(craft, cmd, dt);
    craft.missileCd = Math.max(0, craft.missileCd - dt);
    if (shots.length) {
      craft.firingUntil = now() + 150;
      const v = boltVelocity(craft.f, cls), rewind = rewindFor(p);
      for (const g of shots) fireBolt(p.id, craft.eid, craft.side, muzzleOf(craft.f, cls, g), v, laserDamage(p, cls), cls.lasers.life * 1000, rewind, 'laser');
    }
    const M = cls.missiles;
    if (cmd.missile && M && craft.missiles > 0 && craft.missileCd <= 0 && craft.lock.target && craft.lock.t >= M.lockTime) {
      craft.missiles--; craft.missileCd = M.cooldown;
      const tc = cruiserByEid(craft.lock.target);
      const aim = tc ? (SUBSYSTEM_IDS.filter(s => tc.subs[s] > 0).sort((a, b) => dist(hardpointOf(tc, a), craft.f.p) - dist(hardpointOf(tc, b), craft.f.p))[0] || null) : null;
      m.missiles.push({
        id: m.nextShot++, owner: p.id, ownerEid: craft.eid, side: craft.side, target: craft.lock.target, aim,
        p: add(craft.f.p, scale(forwardOf(craft.f.q), 6)), v: add(craft.f.v, scale(forwardOf(craft.f.q), M.speed * 0.6)),
        speed: M.speed, turn: M.turn, die: now() + M.life * 1000, dmg: M.damage, cap: M.capitalDamage,
      });
      emit({ e: 'missile', from: craft.eid, to: craft.lock.target });
    }
  }
  function boltHits(b, p1) {
    let best = null;
    const t = now() - b.rewind;
    for (const craft of m.crafts.values()) {
      if (craft.side === b.side || !craft.alive) continue;
      const at = segmentHitsSphere(b.p, p1, positionAt(craft, t), craft.cls.radius + 1.5);
      if (at >= 0 && (!best || at < best.at)) best = { at, craft };
    }
    for (const c of m.cruisers) {
      if (c.side === b.side || !live(c)) continue;
      const at = segmentHitsBox(b.p, p1, c.p, c.yaw, c.half);
      if (at >= 0 && (!best || at < best.at)) best = { at, cruiser: c };
    }
    // Laser and turret beams hit rocks before ships hidden behind them.
    const rock = asteroidHitFraction(b.p, p1, m.asteroids);
    if (rock >= 0 && (!best || rock < best.at)) best = { at: rock, asteroid: true };
    return best;
  }
  function stepBolts(dt) {
    const keep = [];
    const T = now();
    for (const b of m.bolts) {
      const p1 = addScaled(b.p, b.v, dt);
      const hit = boltHits(b, p1);
      const shooter = m.players.get(b.owner) || null;
      if (hit?.asteroid) {
        // Natural cover absorbs the incoming beam; no ghost hit behind it.
      } else if (hit?.craft) {
        hitCraft(hit.craft, b.dmg, shooter, b.kind);
      } else if (hit?.cruiser) {
        const at = lerp3(b.p, p1, hit.at);
        const dmg = b.kind === 'laser' ? b.dmg * CRUISER.laserArmor : b.dmg;
        hurtCruiser(hit.cruiser, dmg, at, shooter, b.kind);
        if (shooter) tell(shooter, { e: 'hit', target: hit.cruiser.eid, dmg: Math.round(dmg), kind: b.kind });
      } else if (T < b.die) { b.p = p1; keep.push(b); }
    }
    m.bolts = keep;
  }
  function hitCraft(craft, dmg, shooter, kind) {
    // Energy shields absorb hits before the hull. Out-of-bounds and
    // catastrophic structural collisions are handled separately.
    const absorbed = Math.min(craft.shield || 0, dmg);
    craft.shield = Math.max(0, (craft.shield || 0) - absorbed);
    const hullDamage = dmg - absorbed;
    if (hullDamage > 0) craft.hp -= hullDamage;
    if (shooter) { tell(shooter, { e: 'hit', target: craft.eid, dmg: Math.round(dmg), kind }); shooter.stats.damage += dmg; }
    const owner = m.players.get(craft.owner);
    tell(owner, { e: absorbed > 0 && hullDamage <= 0 ? 'shield-hit' : 'hurt',
      by: shooter?.eid || 0, dmg: Math.round(dmg), blocked: Math.round(absorbed), kind });
    if (craft.hp <= 0) destroyCraft(craft, shooter, kind);
  }
  function stepMissiles(dt) {
    const keep = [];
    for (const ms of m.missiles) {
      const craft = m.crafts.get(ms.target);
      const cr = craft ? null : cruiserByEid(ms.target);
      const tp = craft?.alive ? craft.f.p : (cr && live(cr) ? (ms.aim && cr.subs[ms.aim] > 0 ? hardpointOf(cr, ms.aim) : cr.p) : null);
      let dir = norm(ms.v);
      if (tp) {
        const want = norm(sub(tp, ms.p));
        const ang = Math.acos(clamp(dot(dir, want), -1, 1)), maxTurn = ms.turn * dt;
        dir = ang <= maxTurn ? want : norm(lerp3(dir, want, maxTurn / ang));
      }
      ms.v = scale(dir, ms.speed);
      const p1 = addScaled(ms.p, ms.v, dt);
      const shooter = m.players.get(ms.owner) || null;
      // Missile seekers cannot phase through terrain to hit a covered target.
      const rockHit = asteroidHitFraction(ms.p, p1, m.asteroids);
      if (rockHit >= 0) {
        emit({ e: 'asteroid-impact', p: lerp3(ms.p, p1, rockHit).map(q10) });
        continue;
      }
      if (craft?.alive && segmentHitsSphere(ms.p, p1, craft.f.p, craft.cls.radius + 3) >= 0) { hitCraft(craft, ms.dmg, shooter, 'missile'); continue; }
      if (cr && live(cr)) {
        const at = segmentHitsBox(ms.p, p1, cr.p, cr.yaw, cr.half);
        if (at >= 0) {
          const point = ms.aim && cr.subs[ms.aim] > 0 && dist(lerp3(ms.p, p1, at), hardpointOf(cr, ms.aim)) < 80 ? hardpointOf(cr, ms.aim) : lerp3(ms.p, p1, at);
          hurtCruiser(cr, ms.cap, point, shooter, 'missile');
          if (shooter) tell(shooter, { e: 'hit', target: cr.eid, dmg: ms.cap, kind: 'missile' });
          continue;
        }
      }
      if (now() < ms.die) { ms.p = p1; keep.push(ms); }
    }
    m.missiles = keep;
  }
  function leadPoint(from, tp, tv, speed) {
    const r = sub(tp, from);
    const a = dot(tv, tv) - speed * speed, b = 2 * dot(r, tv), c = dot(r, r);
    let t = -1;
    if (Math.abs(a) < 1e-6) t = b !== 0 ? -c / b : -1;
    else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const s = Math.sqrt(disc), t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
        t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
      }
    }
    return t > 0 ? addScaled(tp, tv, t) : tp;
  }
  // the outward direction of the hull face a turret sits on (local position relative to the half extents)
  function turretFacing(c, tl) {
    const r = tl.map((v, i) => v / CRUISER.half[i]);
    const k = r.reduce((best, v, i) => (Math.abs(v) > Math.abs(r[best]) ? i : best), 0);
    const n = [0, 0, 0]; n[k] = Math.sign(r[k]) || 1;
    return fromBoxLocal(n, [0, 0, 0], c.yaw);
  }
  function stepCruisers(dtMs) {
    const dt = dtMs / 1000;
    for (const c of m.cruisers) {
      if (!live(c)) continue;
      const enemy = liveCruisers(enemyOf(c.side));
      const nearest = enemy.length ? Math.min(...enemy.map(e => dist(e.p, c.p))) : Infinity;
      if (enemy.length && nearest > CRUISER.holdDistance) {
        // Capital ships converge gently inward from all angles, including above/below.
        const toward = norm(scale(c.p, -1));
        c.p = addScaled(c.p, toward, Math.min(CRUISER.driftSpeed * dt, nearest - CRUISER.holdDistance));
      }
      if (c.subs.shields > 0 && now() - c.lastHitAt > CRUISER.shieldDelayMs && now() >= c.shieldsCollapsedUntil) {
        c.shields = Math.min(CRUISER.shields, c.shields + CRUISER.shieldRegen * dt);
      }
      if (c.garrison < INTERIOR.garrison && c.hull / CRUISER.hull >= INTERIOR.garrisonMinHull && now() >= c.garrisonAt) {
        if (c.garrisonAt) c.garrison++;
        c.garrisonAt = now() + INTERIOR.garrisonEveryMs;
      }
      if (c.state === 'spooling' && now() >= c.spoolUntil) { escapeCruiser(c); continue; }
      const wf = c.subs.weapons / CRUISER.subsystems.weapons.hp;
      if (wf <= 0) continue;
      const rate = (0.4 + 0.6 * wf) * (c.leaderless ? COMMANDER.leaderlessTurretRate : 1);
      CRUISER.turrets.forEach((tl, k) => {
        c.turretCd[k] -= dtMs;
        if (c.turretCd[k] > 0) return;
        c.turretCd[k] += CRUISER.turretIntervalMs / rate;
        const tw = fromBoxLocal(tl, c.p, c.yaw), facing = turretFacing(c, tl);
        let target = null, td = CRUISER.turretRange;
        for (const craft of m.crafts.values()) {
          if (craft.side === c.side) continue;
          if (dot(sub(craft.f.p, tw), facing) <= 0) continue; // the hull is in the way: a turret only covers its own side
          const d = dist(craft.f.p, tw);
          if (d < td) { td = d; target = craft; }
        }
        if (!target) return;
        const aim = leadPoint(tw, target.f.p, target.f.v, CRUISER.turretBoltSpeed);
        const s = CRUISER.turretSpread;
        const dir = norm(add(norm(sub(aim, tw)), [(rng() - 0.5) * 2 * s, (rng() - 0.5) * 2 * s, (rng() - 0.5) * 2 * s]));
        fireBolt(null, c.eid, c.side, tw, scale(dir, CRUISER.turretBoltSpeed), CRUISER.turretDamage, (CRUISER.turretRange / CRUISER.turretBoltSpeed) * 1000 + 200, 0, 'turret');
      });
      c.broadsideCd -= dtMs;
      if (c.broadsideCd <= 0) {
        c.broadsideCd += CRUISER.broadsideIntervalMs;
        const target = enemy.filter(e => dist(e.p, c.p) <= CRUISER.broadsideRange).sort((a, b) => dist(a.p, c.p) - dist(b.p, c.p))[0];
        if (target) {
          const point = c.focus && target.subs[c.focus] > 0 ? hardpointOf(target, c.focus) : null;
          const cmdr = m.players.get(c.commander.pid) || null;
          hurtCruiser(target, CRUISER.broadsideDamage * (0.4 + 0.6 * wf), point, cmdr?.human ? cmdr : null, 'broadside');
          emit({ e: 'bs', from: c.eid, to: target.eid, sub: point ? c.focus : null });
        }
      }
    }
  }

  // ---- boarding, charges, ground ------------------------------------------------------------------------------------
  // the hangar bay in the cruiser's frame, measured from the bay's centre
  const bayLocal = (c, p) => sub(toBoxLocal(p, c.p, c.yaw), CRUISER.bay.center);
  const inBay = l => Math.abs(l[0]) <= CRUISER.bay.half[0] + 1 && Math.abs(l[1]) <= CRUISER.bay.half[1] && Math.abs(l[2]) <= CRUISER.bay.half[2];
  const fieldOpenTo = (c, side) => side === c.side || c.shields <= 0;
  // a ship inside a cruiser's box: through the bay it may be fine; anywhere else it hit the hull
  function hullContact(craft) {
    for (const c of m.cruisers) {
      if (!live(c) || !insideBox(craft.f.p, c.p, c.yaw, c.half, 1)) continue;
      const l = bayLocal(c, craft.f.p);
      if (!inBay(l)) return 'crash';
      if (!fieldOpenTo(c, craft.side)) { repel(craft, c, l); return craft.alive ? 'repelled' : 'dead'; }
    }
    return null;
  }
  // a closed hangar field throws the ship back out of the mouth it came through, turned around, and damages it
  function repel(craft, c, l) {
    const s = Math.sign(l[0]) || 1;
    const out = [s * (CRUISER.bay.half[0] + HANGAR_FIELD.repelOffset), l[1], l[2]];
    craft.f.p = fromBoxLocal(add(out, CRUISER.bay.center), c.p, c.yaw);
    const v = toBoxLocal(craft.f.v, [0, 0, 0], c.yaw);
    const back = fromBoxLocal([s * Math.abs(v[0]) + s * 1e-3, v[1], v[2]], [0, 0, 0], c.yaw);
    craft.f.v = back; craft.f.q = qlook(back);
    craft.hist = [];
    tell(m.players.get(craft.owner), { e: 'field', cruiser: c.eid, open: false });
    hitCraft(craft, HANGAR_FIELD.repelDamage, null, 'field');
  }
  // a boarding craft that flies through an open field to the trigger point boards: the interior loads
  function stepBoarding() {
    for (const craft of [...m.crafts.values()]) {
      if (!craft.cls.canDock) continue;
      const p = m.players.get(craft.owner);
      for (const c of liveCruisers(enemyOf(craft.side))) {
        const l = bayLocal(c, craft.f.p);
        if (!inBay(l) || Math.abs(l[0]) > CRUISER.bay.trigger || !fieldOpenTo(c, craft.side)) continue;
        removeCraft(p);
        const h = INTERIOR.stations.hangar;
        p.body = infantryBody(p, 'ship:' + c.eid, [h[0] + (rng() - 0.5) * 4, h[1], h[2] + (rng() - 0.5) * 4]);
        p.theater = 'interior';
        credit(p, SCORE.boarded);
        emit({ e: 'boarded', player: p.eid, cruiser: c.eid });
        tell(p, { e: 'spawn', theater: 'interior', role: p.role, area: p.body.area });
        break;
      }
    }
  }
  function areaInfo(area) {
    if (area === 'ground') return { kind: 'ground' };
    const c = area?.startsWith('ship:') ? cruiserByEid(+area.slice(5)) : null;
    return c && live(c) ? { kind: 'ship', cruiser: c } : null;
  }
  function stationPos(info, station) {
    if (info.kind === 'ship') return INTERIOR.stations[station] || null;
    const side = station?.startsWith('array:') ? station.slice(6) : null;
    return GROUND.arrays[side] || null;
  }
  function startAction(p, kind, station) {
    const b = p.body;
    if (!b?.alive || m.phase !== 'battle') return reject(p, kind, 'not deployed');
    const info = areaInfo(b.area);
    if (!info) return reject(p, kind, 'area');
    const at = typeof station === 'string' ? stationPos(info, station) : null;
    if (!at) return reject(p, kind, 'station');
    if (dist(b.p, at) > (info.kind === 'ship' ? INTERIOR.stationRadius : GROUND.stationRadius)) return reject(p, kind, 'too far');
    const charges = info.kind === 'ship' ? info.cruiser.charges : m.ground.charges;
    let ms;
    if (kind === 'plant') {
      if (info.kind === 'ship') {
        if (info.cruiser.side === p.side || !SUBSYSTEM_IDS.includes(station) || info.cruiser.subs[station] <= 0) return reject(p, kind, 'target');
      } else {
        const side = station.slice(6);
        if (side === p.side || m.ground.phase !== 'open' || m.ground.arrays[side] <= 0) return reject(p, kind, 'target');
      }
      if (charges.has(station)) return reject(p, kind, 'already charged');
      const specialist = (info.kind === 'ship' && p.role === 'saboteur') || (info.kind === 'ground' && p.role === 'ground');
      ms = specialist ? CHARGES.plantMs.specialist : CHARGES.plantMs.other;
    } else {
      const ch = charges.get(station);
      if (!ch || ch.side === p.side) return reject(p, kind, 'no charge');
      ms = CHARGES.defuseMs;
    }
    b.action = { kind, station, at, until: now() + ms, ms };
    tell(p, { e: 'action', kind, station, ms });
    return true;
  }
  function stepActions(dtMs) {
    for (const p of m.players.values()) {
      const b = p.body;
      if (b?.alive && b.shield < b.maxShield && now() - b.hurtAt >= PERSONAL_SHIELD.delayMs) {
        b.shield = Math.min(b.maxShield, b.shield + PERSONAL_SHIELD.regenPerSec * dtMs / 1000);
      }
      const a = p.body?.alive ? p.body.action : null;
      if (!a || now() < a.until) continue;
      p.body.action = null;
      const info = areaInfo(p.body.area);
      if (!info) continue;
      const charges = info.kind === 'ship' ? info.cruiser.charges : m.ground.charges;
      if (a.kind === 'plant') {
        charges.set(a.station, { side: p.side, by: p.id, at: now() + CHARGES.fuseMs });
        emit({ e: 'charge', area: p.body.area, station: a.station, side: p.side, fuse: CHARGES.fuseMs });
      } else if (charges.get(a.station)?.side !== p.side) {
        charges.delete(a.station);
        credit(p, SCORE.defuse, 'objectives');
        emit({ e: 'defused', area: p.body.area, station: a.station, by: p.eid });
      }
    }
  }
  function stepCharges() {
    for (const c of m.cruisers) {
      if (!live(c)) continue;
      for (const [station, ch] of [...c.charges]) {
        if (now() < ch.at) continue;
        c.charges.delete(station);
        const planter = m.players.get(ch.by) || null;
        emit({ e: 'detonate', area: 'ship:' + c.eid, station });
        if (planter) credit(planter, SCORE.charge, 'objectives');
        c.lastHitAt = now();
        damageSubsystem(c, station, CRUISER.subsystems[station].hp * CHARGES.subsystemFrac, planter);
        if (live(c)) damageHull(c, CHARGES.hullDamage, planter);
      }
    }
    for (const [station, ch] of [...m.ground.charges]) {
      if (now() < ch.at) continue;
      m.ground.charges.delete(station);
      const planter = m.players.get(ch.by) || null;
      emit({ e: 'detonate', area: 'ground', station });
      if (planter) credit(planter, SCORE.charge, 'objectives');
      damageArray(station.slice(6), CHARGES.arrayDamage, planter);
    }
  }
  function damageArray(side, dmg, attacker) {
    const G = m.ground;
    if (G.phase !== 'open' || G.arrays[side] <= 0) return;
    G.arrays[side] = Math.max(0, G.arrays[side] - dmg);
    if (G.arrays[side] <= 0) {
      if (attacker) credit(attacker, SCORE.array, 'objectives');
      groundResult(enemyOf(side));
    }
  }
  // the first side to destroy the other's array: a buff for the rest of the match; the loser loses team voice
  function groundResult(winner) {
    const G = m.ground;
    G.phase = 'closed'; G.charges.clear();
    G.result = { winner, at: now() };
    if (winner) {
      const loser = enemyOf(winner);
      m.sides[winner].buffs.comms = true;
      m.sides[loser].voice.team = false;
      emit({ e: 'ground', winner });
      emit({ e: 'voice', side: loser, team: false });
    } else emit({ e: 'ground', winner: null });
    for (const p of m.players.values()) {
      if (p.body?.area === 'ground') { p.body = null; p.theater = 'dead'; p.respawnAt = now() + 3000; }
    }
  }
  function stepGround() {
    const G = m.ground;
    if (G.phase === 'pending' && now() >= G.opensAt) {
      G.phase = 'open'; G.closesAt = now() + GROUND.windowMs;
      emit({ e: 'ground-open', closes: GROUND.windowMs });
      for (const p of m.players.values()) {
        if (p.role !== 'ground') continue;
        if (m.crafts.has(p.eid)) { removeCraft(p); spawn(p); }
      }
    } else if (G.phase === 'open' && now() >= G.closesAt) groundResult(null);
  }

  // ---- commands -----------------------------------------------------------------------------------------------------
  function reject(p, what, why) { tell(p, { e: 'denied', what, why }); return false; }
  function refreshBudget(p) {
    const t = now();
    p.budget = Math.min(cfg.cmdBudgetMs, p.budget + (t - p.budgetAt));
    p.budgetAt = t;
  }
  function onCmds(p, list) {
    if (!Array.isArray(list)) return;
    refreshBudget(p);
    const craft = m.crafts.get(p.eid);
    for (const raw of list.slice(-8)) {
      const cmd = sanitizeCmd(raw);
      if (!cmd || cmd.seq <= p.lastSeq) continue;
      if (p.budget < cmd.ms - 50) { p.lastSeq = cmd.seq; continue; } // claimed more time than has passed: dropped
      p.budget -= cmd.ms;
      p.lastSeq = cmd.seq;
      if (craft?.alive && m.phase === 'battle') runCmd(p, craft, cmd);
    }
  }
  function onPos(p, msg) {
    const b = p.body;
    if (!b?.alive || !finite3(msg.p)) return;
    const box = b.area === 'ground' ? GROUND.bounds : INTERIOR.bounds;
    const q = msg.p.map((v, i) => clamp(v, box[0][i], box[1][i]));
    const dt = Math.max(0.05, (now() - b.posAt) / 1000);
    if (dist(q, b.p) > BODY.moveSpeed * dt + BODY.moveSlack) { tell(p, { e: 'fix', p: b.p }); b.posAt = now(); return; }
    b.p = q; b.posAt = now();
    if (b.action && dist(b.p, b.action.at) > (b.area === 'ground' ? GROUND.stationRadius : INTERIOR.stationRadius) + 0.5) {
      b.action = null; tell(p, { e: 'action', kind: 'cancelled' });
    }
  }
  function capDps(p, dmg) {
    const w = p.dmgWin;
    if (now() - w.at > 1000) { w.at = now(); w.sum = 0; }
    const ok = Math.max(0, Math.min(dmg, BODY.dpsCap - w.sum));
    w.sum += ok;
    return ok;
  }
  function onHit(p, msg) {
    const a = p.body;
    if (!a?.alive || m.phase !== 'battle') return reject(p, 'hit', 'not deployed');
    const kind = typeof msg.kind === 'string' && BODY.hitCaps[msg.kind] ? msg.kind : null;
    const raw = Number(msg.dmg);
    if (!kind || !finite(raw) || raw <= 0) return reject(p, 'hit', 'invalid');
    if (a.kinds && !a.kinds.includes(kind)) return reject(p, 'hit', 'not with this kit'); // a trooper has no lightsaber
    let dmg = Math.min(raw, BODY.hitCaps[kind]);
    if (msg.target === 'array') {
      const side = enemyOf(p.side);
      if (a.area !== 'ground' || m.ground.phase !== 'open') return reject(p, 'hit', 'no array');
      if (dist(a.p, GROUND.arrays[side]) > BODY.hitRange[kind] + GROUND.stationRadius + BODY.rangeSlack) return reject(p, 'hit', 'range');
      dmg = capDps(p, dmg);
      if (dmg > 0) { p.stats.damage += dmg; damageArray(side, dmg, p); tell(p, { e: 'hit', target: 'array', dmg: Math.round(dmg), kind }); }
      return true;
    }
    const tp = m.byEid.get(msg.target);
    const t = tp?.body;
    if (!t?.alive || t.area !== a.area || tp.side === p.side) return reject(p, 'hit', 'target');
    if (now() < t.protectUntil) return false;
    if (dist(a.p, t.p) > BODY.hitRange[kind] + BODY.rangeSlack) return reject(p, 'hit', 'range');
    dmg = capDps(p, dmg);
    if (dmg <= 0) return false;
    if (p.role === 'commander') dmg *= cruiserByEid(p.home)?.mods.damageDealt ?? 1;
    if (tp.role === 'commander') dmg *= (cruiserByEid(tp.home)?.mods.damageTaken ?? 1) * (p.role === 'strike' ? COMMANDER.strikeBonus : 1);
    applyBodyDamage(tp, dmg, p, kind);
    return true;
  }
  function onNpc(p, msg) {
    const b = p.body;
    const info = b?.alive ? areaInfo(b.area) : null;
    if (info && msg.kind === 'hurt' && msg.by !== undefined) { // what another player's effect did to us, resolved on our page
      const by = m.byEid.get(msg.by);
      if (!by?.body?.alive || by.body.area !== b.area || now() - (p.relay.fxFrom.get(by.eid) ?? -Infinity) > RELAY.creditMs) return refuse(p, 'npc', 'by');
      if (!finite(msg.dmg) || msg.dmg <= 0) return false;
      applyBodyDamage(p, Math.min(msg.dmg, BODY.hitCaps.force), by, 'force', true);
      return true;
    }
    if (!info || info.kind !== 'ship' || info.cruiser.side === p.side) return reject(p, 'npc', 'area');
    if (msg.kind === 'kill') {
      if (info.cruiser.garrison <= 0 || now() - p.npcAt < BODY.npcKillEveryMs) return reject(p, 'npc', 'rate');
      p.npcAt = now();
      info.cruiser.garrison--;
      credit(p, SCORE.npc);
      emit({ e: 'garrison', cruiser: info.cruiser.eid, left: info.cruiser.garrison });
    } else if (msg.kind === 'hurt' && finite(msg.dmg) && msg.dmg > 0) {
      applyBodyDamage(p, Math.min(msg.dmg, BODY.npcHurtCap), null, 'npc');
    }
    return true;
  }
  // ---- the body-state relay ----------------------------------------------------------------------------------------
  // a token bucket per body and kind: `rate` a second, at most `burst` saved up
  function take(bucket, rate, burst) {
    const t = now();
    bucket.tokens = Math.min(burst, bucket.tokens + (t - bucket.at) * rate / 1000); bucket.at = t;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
  // a refusal at most every 2 s (a page that keeps sending something wrong is not answered at its own rate)
  function refuse(p, what, why) {
    if (now() - p.relay.deniedAt < 2000) return false;
    p.relay.deniedAt = now();
    return reject(p, what, why);
  }
  // a pose: integers only, each inside its POSE_FIELDS range; the held Force's target must stand in the same area; and
  // only what the body's kit has: a trooper shows no lightsaber and holds no Force power, whatever its page says
  function cleanPose(s, b) {
    if (!Array.isArray(s) || (s.length !== POSE_FIELDS.length && s.length !== POSE_ALL.length)) return null;
    for (let i = 0; i < s.length; i++) {
      const v = s[i], [, lo, hi] = POSE_ALL[i];
      if (!Number.isInteger(v) || v < lo || v > hi) return null;
    }
    const out = s.slice();
    if (out[PI.target]) { const t = m.byEid.get(out[PI.target])?.body; if (!t?.alive || t.area !== b.area) out[PI.target] = 0; }
    if (!hasKind(b, 'force')) out[PI.hold] = out[PI.target] = out[PI.timed] = out[PI.gripBase] = 0;
    if (!hasKind(b, 'saber')) {
      out[PI.flags] = (out[PI.flags] & ~POSE_FLAGS.lit) | POSE_FLAGS.holstered; out[PI.hilt] = POSE_HILTS.indexOf('none');
      out[PI.move] = out[PI.kit] = 0; out.length = POSE_FIELDS.length; // and no thrown saber
    }
    return out;
  }
  // 'st': our body's position (the same check as 'pos') and its pose, kept for the relay at the next tick
  function onState(p, msg) {
    const b = p.body;
    if (!b?.alive) return false;
    if (!take(p.relay.pose, RELAY.poseRate, RELAY.poseBurst)) return false; // over the rate: dropped, position and all
    if (msg.p !== undefined) onPos(p, msg);
    const s = cleanPose(msg.s, b);
    if (!s) return msg.s === undefined ? true : refuse(p, 'st', 'invalid');
    b.pose = s; b.poseAt = now(); b.poseNew = true;
    return true;
  }
  // 'fx': an effect on another player's fighter, forwarded to that player's page, which resolves it with its own
  // fighter's exact state (as the arena does); 'shown' kinds (a Force cast, saber sparks, a taunt) go to everyone aboard
  function onEffect(p, msg) {
    const a = p.body;
    if (!a?.alive || m.phase !== 'battle') return false;
    const k = msg.k, shown = RELAY.shown.includes(k);
    if (!shown && !RELAY.effects.includes(k)) return refuse(p, 'fx', 'kind');
    if (RELAY.needs[k] && !RELAY.needs[k].some(n => hasKind(a, n))) return refuse(p, 'fx', 'not with this kit');
    if (!take(p.relay.fx, RELAY.effectRate, RELAY.effectBurst)) return refuse(p, 'fx', 'rate');
    const args = msg.a === undefined ? [] : msg.a;
    if (!Array.isArray(args)) return refuse(p, 'fx', 'invalid');
    let size;
    try { size = JSON.stringify(args).length; } catch { size = Infinity; }
    if (size > RELAY.effectBytes) return refuse(p, 'fx', 'too large');
    const out = { t: 'ff', from: p.eid, k, a: args };
    if (shown) {
      for (const q of bodiesIn(a.area)) if (q !== p && q.human) sendTo(q, out, true);
      return true;
    }
    const tp = m.byEid.get(msg.to), t = tp?.body;
    if (!tp?.human || tp === p || !t?.alive || t.area !== a.area) return refuse(p, 'fx', 'target');
    if (RELAY.hostile.includes(k) && tp.side === p.side) return refuse(p, 'fx', 'target');
    if (dist(a.p, t.p) > (k === 'blocked' ? RELAY.bladeRange : RELAY.effectRange) + BODY.rangeSlack) return refuse(p, 'fx', 'range');
    if (RELAY.hostile.includes(k)) tp.relay.fxFrom.set(p.eid, now()); // what the target's page reports it took from this is credited to p
    sendTo(tp, out, true);
    return true;
  }
  // every tick: the latest pose of each body that sent one since the last tick, with its level (the kit the pose is for)
  // and the position the server holds, to the other humans in its area (never across areas, never one's own)
  function relayPoses() {
    const T = now(), areas = new Map();
    for (const p of m.players.values()) {
      const b = p.body;
      if (!b?.alive) continue;
      let A = areas.get(b.area);
      if (!A) areas.set(b.area, A = { fresh: [], humans: [] });
      if (p.human) A.humans.push(p);
      if (b.poseNew && T - b.poseAt <= RELAY.poseFreshMs) A.fresh.push([p.eid, TIER_LEVEL_CODES[b.tier] || 0, q100(b.p[0]), q100(b.p[1]), q100(b.p[2]), ...b.pose]);
      b.poseNew = false;
    }
    for (const A of areas.values()) {
      if (!A.fresh.length) continue;
      for (const p of A.humans) {
        const list = A.fresh.filter(e => e[0] !== p.eid);
        if (list.length) sendTo(p, { t: 'fr', n: m.tick, b: list }, false);
      }
    }
  }

  function commanderSeat(p) {
    const c = p.role === 'commander' ? cruiserByEid(p.home) : null;
    return c && live(c) && c.commander.pid === p.id ? c : null;
  }
  function onAssign(p, msg) {
    const c = commanderSeat(p);
    if (!c) return reject(p, 'assign', 'not a commander');
    if (c.subs.comms <= 0) return reject(p, 'assign', 'comms down');
    const t = m.byEid.get(msg.player) || m.players.get(msg.player);
    if (!t || t.side !== p.side || t === p || !t.human) return reject(p, 'assign', 'player');
    if (!['pilot', 'guard', 'ground', ...BOARDING_ROLES].includes(msg.role)) return reject(p, 'assign', 'role');
    if (msg.role !== 'pilot' && roleCount(p.side, msg.role, t) >= roleCaps(sideSize(p.side), cfg.cruisersPerSide)[msg.role]) return reject(p, 'assign', 'full');
    t.pref = msg.role;
    if (t.theater === 'lobby' || t.theater === 'dead') applyRole(t, msg.role);
    tell(t, { e: 'assigned', role: msg.role, by: p.eid });
    tell(p, { e: 'assigned', player: t.eid, role: msg.role });
    return true;
  }
  function onRole(p, msg) {
    if (!ROLES[msg.role]) return reject(p, 'role', 'unknown');
    p.pref = msg.role;
    if (p.theater === 'lobby' || p.theater === 'dead' || p.theater === 'out') {
      const got = applyRole(p, msg.role);
      tell(p, { e: 'role', role: got, wanted: msg.role });
    } else tell(p, { e: 'role', role: p.role, wanted: msg.role, next: true }); // applies at the next spawn
    return true;
  }
  // the selection screen: which ship and trooper level to deploy as next (checked and paid for at that moment)
  function onLoadout(p, msg) {
    const ship = msg.ship == null ? null : SHIP_TIERS.find(t => t.id === msg.ship);
    const trooper = msg.trooper == null ? null : TROOPER_TIERS.find(t => t.id === msg.trooper);
    if ((msg.ship != null && !ship) || (msg.trooper != null && !trooper)) return reject(p, 'loadout', 'unknown');
    if (ship) p.loadout.ship = ship.id;
    if (trooper) p.loadout.trooper = trooper.id;
    tell(p, { e: 'loadout', ship: p.loadout.ship, trooper: p.loadout.trooper });
    return true;
  }
  // back to the hangar without costing a reinforcement: only close to home or while waiting
  function onRedeploy(p) {
    if (m.phase !== 'battle') return reject(p, 'redeploy', 'phase');
    const craft = m.crafts.get(p.eid), home = cruiserByEid(p.home);
    if (p.theater === 'space' && craft && home && dist(craft.f.p, home.p) <= 700) { removeCraft(p); p.theater = 'dead'; p.respawnAt = now() + 3000; return true; }
    if (p.theater === 'interior' && p.body && home && p.body.area === 'ship:' + home.eid && p.role !== 'commander') { p.body = null; p.theater = 'dead'; p.respawnAt = now() + 3000; return true; }
    return reject(p, 'redeploy', 'too far');
  }
  function onJump(p) {
    const c = commanderSeat(p);
    if (!c) return reject(p, 'jump', 'not a commander');
    if (c.state !== 'active' || c.subs.hyperdrive <= 0 || c.leaderless || c.hull / CRUISER.hull > cfg.jumpHull) return reject(p, 'jump', 'unavailable');
    c.state = 'spooling'; c.spoolUntil = now() + cfg.jumpSpoolMs;
    emit({ e: 'jump', cruiser: c.eid, spool: cfg.jumpSpoolMs });
    return true;
  }
  function onFocus(p, msg) {
    const c = commanderSeat(p);
    if (!c) return reject(p, 'focus', 'not a commander');
    if (c.subs.comms <= 0) return reject(p, 'focus', 'comms down');
    c.focus = SUBSYSTEM_IDS.includes(msg.sub) ? msg.sub : null;
    tell(p, { e: 'focus', sub: c.focus });
    return true;
  }
  function onPing(p, msg) {
    if (!finite3(msg.p) || now() - p.pingMarkAt < 2000) return false;
    p.pingMarkAt = now();
    const ev = { e: 'mark', by: p.eid, p: msg.p.map(v => Math.round(clamp(v, -20000, 20000))), kind: msg.kind === 'defend' ? 'defend' : 'attack' };
    for (const q of humans(p.side)) tell(q, ev);
    return true;
  }
  // team voice signalling goes through the match so the server can cut a team's voice for good
  function onVoice(p, msg) {
    const to = m.byEid.get(msg.to) || m.players.get(msg.to);
    if (!m.sides[p.side].voice.team) return reject(p, 'voice', 'team voice lost');
    if (!to?.human || to.side !== p.side || to === p) return reject(p, 'voice', 'peer');
    let size = 0;
    try { size = JSON.stringify(msg.sig ?? null).length; } catch { size = Infinity; }
    if (size > 16000) return reject(p, 'voice', 'too large');
    sendTo(to, { t: 'fv', from: p.eid, sig: msg.sig }, true);
    return true;
  }

  function handle(pid, msg) {
    const p = m.players.get(pid);
    if (!p?.human || !msg || typeof msg !== 'object') return false;
    switch (msg.c) {
      case 'cmd': onCmds(p, msg.cmds); return true;
      case 'pong': if (p.pingSent && msg.id === p.pingSent.id) { const r = now() - p.pingSent.at; p.rtt = p.rtt ? p.rtt * 0.8 + r * 0.2 : r; p.pingSent = null; } return true;
      case 'pos': onPos(p, msg); return true;
      case 'st': return onState(p, msg);
      case 'fx': return onEffect(p, msg);
      case 'hit': return onHit(p, msg);
      case 'npc': return onNpc(p, msg);
      case 'plant': case 'defuse': return startAction(p, msg.c, msg.station);
      case 'cancel': if (p.body) p.body.action = null; return true;
      case 'role': return onRole(p, msg);
      case 'loadout': return onLoadout(p, msg);
      case 'redeploy': return onRedeploy(p);
      case 'assign': return onAssign(p, msg);
      case 'focus': return onFocus(p, msg);
      case 'jump': return onJump(p);
      case 'ping': return onPing(p, msg);
      case 'voice': return onVoice(p, msg);
      default: return false;
    }
  }

  // ---- lifecycle ------------------------------------------------------------------------------------------------
  function welcome(p) {
    return {
      t: 'fw', proto: FLEET_PROTOCOL, match: m.id, phase: m.phase, warmupIn: m.warmupUntil ? Math.max(0, m.warmupUntil - now()) : null,
      you: { eid: p.eid, side: p.side, role: p.role, pref: p.pref, name: p.name },
      cfg: { cruisersPerSide: cfg.cruisersPerSide, tickets: cfg.tickets, timeLimitMs: cfg.timeLimitMs, minPlayers: cfg.minPlayers, maxPlayers: cfg.maxPlayers, spendPoints: cfg.spendPoints },
      cruisers: m.cruisers.map(c => ({ eid: c.eid, side: c.side, name: c.name, p: c.p, yaw: c.yaw })),
      asteroids: m.asteroids.map(a => [a.id, ...a.p.map(q10), q10(a.r), a.seed]),
      voice: { channel: m.id + ':' + p.side, team: m.sides[p.side].voice.team },
    };
  }
  function addHuman({ id: pid, name, conn, role, side }) {
    if (m.phase === 'ended') return { ok: false, reason: 'Match over' };
    if (m.players.has(pid)) return { ok: false, reason: 'Already in this match' };
    if (humans().length >= cfg.maxPlayers) return { ok: false, reason: 'Match full' };
    const p = newPlayer({ pid, name, human: true, conn, side: chooseSide(side), pref: role });
    applyRole(p, p.pref);
    if (m.phase === 'warmup' && humans().length >= cfg.minHumans && !m.warmupUntil) m.warmupUntil = now() + cfg.warmupMs;
    if (m.phase === 'battle') { rebalanceBots(); spawn(p); }
    sendTo(p, welcome(p));
    m.boardDirty = true;
    return { ok: true, player: p };
  }
  function removePlayer(pid, quiet = false) {
    const p = m.players.get(pid);
    if (!p) return;
    removeCraft(p);
    m.players.delete(pid); m.byEid.delete(p.eid);
    for (const c of m.cruisers) if (c.commander.pid === pid) c.commander.pid = null;
    if (!quiet) {
      if (p.role === 'commander' && p.body?.alive) {
        // the AI stand-in takes over the same body
        ensureCommanders();
        const c = cruiserByEid(p.home), stand = c && m.players.get(c.commander.pid);
        if (stand?.body) stand.body.hp = p.body.hp;
      } else ensureCommanders();
      if (m.phase === 'warmup' && humans().length < cfg.minHumans) m.warmupUntil = null;
      rebalanceBots();
    }
    m.boardDirty = true;
  }
  function startBattle() {
    m.phase = 'battle'; m.startedAt = now(); m.warmupUntil = null;
    m.ground.opensAt = now() + GROUND.opensMs;
    rebalanceBots();
    ensureCommanders();
    for (const p of m.players.values()) spawn(p);
    emit({ e: 'phase', phase: 'battle' });
  }
  function end(winner, reason) {
    if (m.phase === 'ended') return;
    m.phase = 'ended'; m.endedAt = now();
    m.result = { winner, reason, scores: Object.fromEntries(SIDES.map(s => [s, Math.round(m.sides[s].score)])) };
    emit({ e: 'phase', phase: 'ended', winner, reason });
    m.boardDirty = true;
  }
  function checkEnd() {
    const alive = Object.fromEntries(SIDES.map(s => [s, liveCruisers(s).length]));
    if (!alive.republic && !alive.separatist) return end(null, 'mutual');
    for (const s of SIDES) {
      if (!alive[s]) return end(enemyOf(s), sideCruisers(s).some(c => c.state === 'escaped') ? 'retreat' : 'destroyed');
    }
    if (now() - m.startedAt >= cfg.timeLimitMs) {
      const a = m.sides.republic.strength, b = m.sides.separatist.strength;
      return end(Math.abs(a - b) < 1e-3 ? null : (a > b ? 'republic' : 'separatist'), 'time');
    }
    if (cfg.forfeit) {
      // only a side that had humans and lost them all forfeits; AI pilots alone never make a side
      for (const s of SIDES) {
        const side = m.sides[s];
        if (humans(s).length) { side.hadHumans = true; side.noHumansSince = null; }
        else if (side.hadHumans && side.noHumansSince == null) side.noHumansSince = now();
      }
      for (const s of SIDES) {
        if (m.sides[s].noHumansSince != null && humans(enemyOf(s)).length && now() - m.sides[s].noHumansSince >= cfg.forfeitMs) return end(enemyOf(s), 'forfeit');
      }
    }
  }
  function updateStrength() {
    for (const s of SIDES) {
      const side = m.sides[s];
      side.strength = fleetStrength(sideCruisers(s), side.tickets, side.maxTickets);
    }
    for (const c of m.cruisers) c.mods = commanderModifiers(m.sides[c.side].strength, c.hull / CRUISER.hull);
  }
  function stepSpace(dtMs) {
    const dt = dtMs / 1000;
    for (const p of m.players.values()) {
      if (!p.bot) continue;
      const craft = m.crafts.get(p.eid);
      if (!craft?.alive) continue;
      const cmd = botCommand(world, p, craft, dtMs);
      cmd.seq = ++p.bot.seq;
      runCmd(p, craft, cmd);
    }
    stepBolts(dt);
    stepMissiles(dt);
    for (const craft of [...m.crafts.values()]) {
      if (!craft.alive) continue;
      const contact = hullContact(craft);
      if (contact === 'crash') { destroyCraft(craft, null, 'crash'); continue; }
      if (contact === 'dead') continue;
      // Rocks have physical mass: crashing through cover damages the craft.
      // Projectile obstruction and flight collision use the identical spheres.
      const previous = craft.hist.at(-1)?.p || craft.f.p;
      // Explicit respawns, restores and teleports are not swept as if the ship
      // flew through every obstacle along the discontinuity.
      const oldP = dist(previous, craft.f.p) < 350 ? previous : craft.f.p;
      const obstacle = m.asteroids.find(rock => segmentHitsSphere(oldP, craft.f.p, rock.p, rock.r + craft.cls.radius) >= 0);
      if (obstacle) {
        const out = norm(sub(craft.f.p, obstacle.p));
        const n = len(out) > 0 ? out : [0, 1, 0];
        craft.f.p = addScaled(obstacle.p, n, obstacle.r + craft.cls.radius + 2);
        craft.f.v = scale(craft.f.v, -0.18);
        hitCraft(craft, 45, null, 'asteroid');
        if (!craft.alive) continue;
      }
      if (len(craft.f.p) > cfg.battlefieldRadius) {
        craft.hp -= cfg.edgeDps * dt;
        if (craft.hp <= 0) { destroyCraft(craft, null, 'edge'); continue; }
      }
      craft.hist.push({ t: now(), p: [...craft.f.p] });
      if (craft.hist.length > HIST) craft.hist.shift();
    }
    stepBoarding();
  }
  function step(dtMs) {
    m.tick++;
    if (m.phase === 'warmup') {
      if (m.warmupUntil && now() >= m.warmupUntil) startBattle();
    } else if (m.phase === 'battle') {
      updateStrength();
      stepSpace(dtMs);
      stepCruisers(dtMs);
      stepActions(dtMs);
      stepCharges();
      stepGround();
      for (const p of m.players.values()) if (p.theater === 'dead' && now() >= p.respawnAt) spawn(p);
      updateStrength();
      checkEnd();
    }
  }
  // advance to now(): fixed steps, at most 5 per call so a stalled server catches up without spiralling
  function tick() {
    const target = now();
    let steps = 0;
    while (m.simAt + cfg.tickMs <= target && steps < 5) { m.simAt += cfg.tickMs; step(cfg.tickMs); steps++; }
    if (target - m.simAt > cfg.tickMs * 5) m.simAt = target - cfg.tickMs;
    if (steps) flush();
    return steps;
  }

  // ---- snapshots ----------------------------------------------------------------------------------------------------
  function shared() {
    const T = now();
    return {
      t: 'fs', n: m.tick, phase: m.phase,
      left: m.phase === 'battle' ? Math.max(0, cfg.timeLimitMs - (T - m.startedAt)) : null,
      warmupIn: m.warmupUntil ? Math.max(0, m.warmupUntil - T) : null,
      s: [...m.crafts.values()].map(c => [c.eid, c.cls.code, sideCode(c.side), q10(c.f.p[0]), q10(c.f.p[1]), q10(c.f.p[2]),
        q4(c.f.q[0]), q4(c.f.q[1]), q4(c.f.q[2]), q4(c.f.q[3]), Math.round(c.f.speed),
        (c.f.boosting ? 1 : 0) | (T < c.firingUntil ? 2 : 0) | (m.players.get(c.owner)?.bot ? 4 : 0) |
        (c.f.engineOff ? 8 : 0) | (c.f.barrelRemaining > 0 ? 16 : 0), Math.ceil(c.hp), Math.ceil(c.shield)]),
      c: m.cruisers.map(c => {
        const cmdr = m.players.get(c.commander.pid);
        return [c.eid, sideCode(c.side), q10(c.p[0]), q10(c.p[1]), q10(c.p[2]), Math.round(c.yaw * 1000), Math.ceil(c.hull), Math.ceil(c.shields),
          ...SUBSYSTEM_IDS.map(s => Math.ceil(c.subs[s])), STATE_CODES[c.state], c.garrison,
          cmdr?.body?.alive ? Math.ceil(cmdr.body.hp) : 0, TIER_CODES[c.mods.tier], c.commander.defeats,
          (c.leaderless ? 1 : 0) | (T < c.shieldsCollapsedUntil ? 2 : 0) | (c.state === 'spooling' ? 4 : 0) | (cmdr?.human ? 8 : 0)];
      }),
      m: m.missiles.map(x => [x.id, q10(x.p[0]), q10(x.p[1]), q10(x.p[2]), x.target]),
      sd: SIDES.map(s => { const d = m.sides[s]; return [d.tickets, Math.round(d.strength * 1000), Math.round(d.score), d.buffs.comms ? 1 : 0, d.voice.team ? 1 : 0]; }),
      g: [GROUND_CODES[m.ground.phase], Math.ceil(m.ground.arrays.republic), Math.ceil(m.ground.arrays.separatist), m.ground.result ? sideCode(m.ground.result.winner) : -2,
        m.ground.phase === 'open' ? Math.max(0, m.ground.closesAt - T) : m.ground.phase === 'pending' && m.ground.opensAt ? Math.max(0, m.ground.opensAt - T) : 0],
      ch: [
        ...m.cruisers.flatMap(c => [...c.charges].map(([st, ch]) => ['ship:' + c.eid, st, sideCode(ch.side), Math.max(0, ch.at - T)])),
        ...[...m.ground.charges].map(([st, ch]) => ['ground', st, sideCode(ch.side), Math.max(0, ch.at - T)]),
      ],
    };
  }
  function bodiesByArea() {
    const out = {};
    for (const p of m.players.values()) {
      const b = p.body;
      if (!b?.alive) continue;
      (out[b.area] ||= []).push([p.eid, sideCode(p.side), ROLE_CODES[p.role], q10(b.p[0]), q10(b.p[1]), q10(b.p[2]), Math.ceil(b.hp), (b.action ? 1 : 0) | (p.bot ? 4 : 0),
        Math.ceil(b.shield), TIER_LEVEL_CODES[b.tier] || 0]);
    }
    return out;
  }
  function personal(p) {
    const craft = m.crafts.get(p.eid);
    const home = cruiserByEid(p.home);
    const you = { e: p.eid, seq: p.lastSeq, th: p.theater, r: p.role, pr: p.pref, home: p.home, rs: p.theater === 'dead' ? Math.max(0, p.respawnAt - now()) : 0 };
    if (craft) {
      const f = craft.f;
      you.f = { p: f.p, q: f.q, v: f.v, speed: f.speed, energy: f.energy, boostIdle: f.boostIdle, boosting: f.boosting,
        engineOff: f.engineOff, barrelRemaining: f.barrelRemaining, barrelCooldown: f.barrelCooldown, barrelDir: f.barrelDir,
        heat: f.heat, lockout: f.lockout, fireCd: f.fireCd, gun: f.gun };
      you.hp = craft.hp; you.sh = Math.ceil(craft.shield); you.shmax = craft.cls.shieldMax;
      you.shcd = Math.max(0, Math.ceil(craft.shieldReadyAt - now()));
      you.cls = craft.cls.code; you.ms = craft.missiles; you.lock = [craft.lock.target, Math.round(craft.lock.t * 1000)];
    }
    if (p.body) {
      const a = p.body.action;
      you.b = { area: p.body.area, p: p.body.p, hp: p.body.hp, max: p.body.max, alive: p.body.alive, act: a ? [a.kind, a.station, Math.max(0, a.until - now()), a.ms] : null,
        shield: p.body.shield, maxShield: p.body.maxShield, tier: p.body.tier, kinds: p.body.kinds };
    }
    if (home) you.md = [home.mods.damageTaken, home.mods.damageDealt, home.mods.forceRegen].map(v => Math.round(v * 100) / 100);
    if (p.role === 'commander' && home) you.cmd = { cruiser: home.eid, focus: home.focus, canJump: home.state === 'active' && home.subs.hyperdrive > 0 && !home.leaderless && home.hull / CRUISER.hull <= cfg.jumpHull };
    you.vo = { channel: m.id + ':' + p.side, team: m.sides[p.side].voice.team };
    you.pts = Math.floor(p.points); you.earned = Math.floor(p.earned); you.kills = p.stats.kills;
    you.lo = [p.loadout.ship, p.loadout.trooper]; you.dep = [p.deployed.ship, p.deployed.trooper];
    return you;
  }
  function board() {
    return {
      t: 'fb', phase: m.phase, result: m.result,
      players: [...m.players.values()].map(p => [p.eid, p.name, sideCode(p.side), ROLE_CODES[p.role], p.stats.kills, p.stats.deaths, Math.round(p.stats.score), p.human ? 1 : 0]),
    };
  }
  function flush() {
    const hs = humans();
    const events = m.events; m.events = [];
    if (m.boardDirty || m.tick % cfg.boardEvery === 0) {
      m.boardDirty = false;
      const b = board();
      for (const p of hs) sendTo(p, b, true);
    }
    for (const p of hs) {
      const ev = p.outbox.length ? [...events, ...p.outbox] : events;
      p.outbox = [];
      if (ev.length) sendTo(p, { t: 'fe', ev }, true);
    }
    relayPoses();
    if (m.tick % cfg.snapshotEvery === 0) {
      const base = { ...shared(), bo: m.newBolts }, areas = bodiesByArea();
      m.newBolts = [];
      for (const p of hs) sendTo(p, { ...base, you: personal(p), b: p.body?.alive ? areas[p.body.area] || [] : undefined }, false);
    }
    const T = now();
    for (const p of hs) {
      if (T - p.pingAt >= cfg.pingEveryMs) { p.pingAt = T; p.pingSent = { id: ++p.pingId, at: T }; sendTo(p, { t: 'fp', id: p.pingId }, false); }
    }
  }

  const bayCenterOf = c => fromBoxLocal(CRUISER.bay.center, c.p, c.yaw);
  const world = { m, cfg, rng, now, cruiserByEid, liveCruisers, hangarOf, bayCenterOf, hardpointOf, fleetCenter };
  const api = {
    id, cfg, state: m, world,
    addHuman, removePlayer: pid => removePlayer(pid), handle, tick, step, flush,
    humans: () => humans().length,
    snapshotFor: pid => { const p = m.players.get(pid); return p ? { ...shared(), you: personal(p), b: p.body?.alive ? bodiesByArea()[p.body.area] || [] : undefined } : null; },
    summary: () => ({
      id: m.id, phase: m.phase, humans: humans().length, bots: [...m.players.values()].filter(p => p.bot).length,
      sides: Object.fromEntries(SIDES.map(s => [s, { humans: humans(s).length, players: [...m.players.values()].filter(p => p.side === s).length, tickets: m.sides[s].tickets, strength: m.sides[s].strength }])),
      result: m.result,
    }),
    // test and tooling hooks: deliberate state changes, never reachable from the network
    debug: { hurtCruiser: (c, amount, point, attacker, kind) => hurtCruiser(c, amount, point, attacker, kind),
      hitCraft: (craft, damage, shooter, kind) => hitCraft(craft, damage, shooter, kind),
      damageSubsystem, groundResult, destroyCruiser, startBattle, spawn, end },
  };
  return api;
}
