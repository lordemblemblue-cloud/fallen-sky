import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleetMatch } from '../fleet/match.mjs';
import { createFleetHub } from '../fleet/hub.mjs';
import { BODY, CHARGES, COMMANDER, CRUISER, GROUND, HANGAR_FIELD, INTERIOR, PERSONAL_SHIELD, SHIP_CLASSES, SHIP_TIERS, TROOPER_TIERS, commanderModifiers, roleCaps } from '../fleet/rules.mjs';
import { add, dist, fromBoxLocal, norm, qlook, sub, scale, toBoxLocal } from '../fleet/vec.mjs';

// In-memory stand-ins for the network: a fake clock, a seeded random source and connections that record what they get.
function harness(config = {}) {
  let t = 1000;
  let seed = 12345;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mt = createFleetMatch({ id: 'test', now: () => t, rng, config: { warmupMs: 1000, cruisersPerSide: 2, minPlayers: 40, maxPlayers: 64, ...config } });
  const conns = new Map();
  const h = {
    mt, s: mt.state, conns, now: () => t,
    join(id, o = {}) {
      const conn = { got: [], send: msg => conn.got.push(JSON.parse(JSON.stringify(msg))) };
      conns.set(id, conn);
      return mt.addHuman({ id, name: id, conn, ...o });
    },
    advance(ms) { const end = t + ms; while (t < end) { t = Math.min(end, t + 1000 / 30); mt.tick(); } },
    start() { h.advance(1100); assert.equal(h.s.phase, 'battle'); },
    p: id => h.s.players.get(id),
    craft: id => h.s.crafts.get(h.s.players.get(id).eid),
    cruiser: eid => h.s.cruisers.find(c => c.eid === eid),
    events(id, kind) { return conns.get(id).got.filter(m => m.t === 'fe').flatMap(m => m.ev).filter(e => !kind || e.e === kind); },
    send(id, msg) { return mt.handle(id, msg); },
    // walk a body to a point at 12 m/s, reporting positions the way a client does
    walk(id, to) {
      const b = h.p(id).body;
      for (let i = 0; i < 2000 && dist(b.p, to) > 0.3; i++) {
        const d = sub(to, b.p), step = Math.min(1.2, dist(b.p, to));
        h.advance(100);
        h.send(id, { c: 'pos', p: add(b.p, scale(norm(d), step)) });
      }
      assert.ok(dist(b.p, to) <= 0.3, 'reached ' + to);
    },
    // a boarding craft inside the enemy hangar bay, past the trigger, with that cruiser's shields down goes aboard
    // points and kills enough for any level, and that level picked on the selection screen
    kit(id, trooper = 'jedi', ship) { const p = h.p(id); p.points += 10000; p.earned += 10000; p.stats.kills += 20; h.send(id, { c: 'loadout', trooper, ship }); },
    board(id, cruiser) {
      cruiser.shields = 0; cruiser.lastHitAt = t;
      h.craft(id).f.p = h.mt.world.bayCenterOf(cruiser);
      h.advance(40);
      assert.equal(h.p(id).theater, 'interior');
      assert.equal(h.p(id).body.area, 'ship:' + cruiser.eid);
    },
  };
  return h;
}

test('a match holds 40+ humans: two balanced sides, a commander per cruiser, capped boarding and ground roles', () => {
  const h = harness({ fillBots: false });
  const prefs = ['commander', 'commander', 'commander', 'commander', 'commander', 'commander',
    ...Array(10).fill('saboteur'), ...Array(4).fill('strike'), ...Array(10).fill('ground'), ...Array(4).fill('guard')];
  for (let i = 0; i < 48; i++) assert.equal(h.join('p' + i, { role: prefs[i] || 'pilot' }).ok, true);
  const sides = { republic: [], separatist: [] };
  for (const p of h.s.players.values()) if (p.human) sides[p.side].push(p);
  assert.equal(sides.republic.length, 24);
  assert.equal(sides.separatist.length, 24);
  const caps = roleCaps(24, 2);
  for (const side of Object.values(sides)) {
    const count = r => side.filter(p => p.role === r).length;
    assert.equal(count('commander'), 2, 'one human commander per cruiser');
    assert.ok(count('saboteur') <= caps.saboteur && count('saboteur') > 0);
    assert.ok(count('ground') <= caps.ground && count('ground') >= 2);
    assert.ok(count('guard') <= caps.guard);
    assert.ok(count('pilot') >= 12, 'most of the side flies');
  }
  assert.equal([...h.s.players.values()].filter(p => !p.human).length, 0, 'every command seat is human, so no AI stand-ins');
  h.start();
  for (const p of h.s.players.values()) assert.ok(['space', 'interior'].includes(p.theater), p.id + ' deployed: ' + p.theater);
  assert.equal(h.s.crafts.size, 48 - 4 - [...h.s.players.values()].filter(p => p.role === 'guard').length);
  assert.equal(h.join('late', {}).ok, true, 'joining in progress');
  assert.equal(h.p('late').theater, 'space');
});

test('AI pilots fill the 40-combatant floor and step aside as humans join; empty command seats get AI commanders', () => {
  const h = harness();
  h.join('solo', { side: 'republic' });
  h.start();
  const fighters = side => [...h.s.players.values()].filter(p => p.side === side && p.role !== 'commander').length;
  assert.equal(fighters('republic'), 20); assert.equal(fighters('separatist'), 20);
  assert.equal([...h.s.players.values()].filter(p => p.role === 'commander' && !p.human).length, 4);
  for (let i = 0; i < 6; i++) h.join('late' + i);
  assert.equal(fighters('republic') + fighters('separatist'), 40, 'still 40 fighting');
  assert.equal([...h.s.players.values()].filter(p => p.human).length, 7);
  assert.ok(h.s.crafts.size >= 36, 'and they are flying');
  h.join('boss', { role: 'commander', side: 'separatist' });
  assert.equal(h.p('boss').role, 'commander');
  assert.equal([...h.s.players.values()].filter(p => p.role === 'commander' && !p.human).length, 3, 'a human took a seat from its stand-in');
  assert.equal(h.p('boss').theater, 'interior');
  assert.deepEqual(h.p('boss').body.p, INTERIOR.stations.bridge);
});

test('flight is server-authoritative: commands move the ship, snapshots acknowledge them, banked time is capped', () => {
  const h = harness({ fillBots: false });
  h.join('ace', { side: 'republic' });
  h.start();
  const craft = h.craft('ace');
  const startP = [...craft.f.p];
  const cmds = Array.from({ length: 30 }, (_, i) => ({ seq: i + 1, ms: 33, throttle: 1, boost: true, pitch: 0.2 }));
  for (let i = 0; i < 30; i += 3) { h.advance(100); h.send('ace', { c: 'cmd', cmds: cmds.slice(i, i + 3) }); }
  h.advance(70);
  const snap = h.mt.snapshotFor('ace');
  assert.equal(snap.you.seq, 30);
  assert.ok(dist(startP, craft.f.p) > 100, 'moved ' + dist(startP, craft.f.p).toFixed(1) + ' m');
  assert.ok(craft.f.boosting && craft.f.energy < SHIP_CLASSES.fighter.boostMax);
  // a speed hack: ten seconds of commands in one burst only runs what the bank allows
  const before = [...craft.f.p];
  h.send('ace', { c: 'cmd', cmds: Array.from({ length: 8 }, (_, i) => ({ seq: 100 + i, ms: 100, throttle: 1 })) });
  const moved = dist(before, craft.f.p);
  assert.ok(moved < (h.s.cfg.cmdBudgetMs / 1000 + 0.1) * SHIP_CLASSES.fighter.boostSpeed, 'burst capped: ' + moved.toFixed(1) + ' m');
  assert.equal(h.p('ace').lastSeq, 107, 'dropped commands are still acknowledged so prediction resyncs');
});

test('server bolts: a pilot on a target kills it; lag compensation hits where the shooter saw the target', () => {
  const h = harness({ fillBots: false });
  h.join('hunter', { side: 'republic' }); h.join('prey', { side: 'separatist' });
  h.start();
  const a = h.craft('hunter'), b = h.craft('prey');
  const place = (c, p, dir) => { c.f.p = [...p]; c.f.q = qlook(dir); c.f.v = scale(norm(dir), 100); c.f.speed = 100; c.hist = []; };
  place(a, [0, 2000, 0], [0, 0, -1]);
  place(b, [0, 2000, -300], [0, 0, -1]);
  let seq = 1;
  const fire = (n, lock = 0) => { for (let i = 0; i < n; i++) { h.send('hunter', { c: 'cmd', cmds: [{ seq: seq++, ms: 33, throttle: 0, fire: true, lock }] }); b.f.p = [a.f.p[0], a.f.p[1], a.f.p[2] - 300]; h.advance(34); } };
  fire(15);
  assert.ok(b.shield < SHIP_CLASSES.fighter.shieldMax || b.hp < SHIP_CLASSES.fighter.hull,
    'hits first strip shields, then hull: ' + b.shield + '/' + b.hp);
  assert.ok(h.events('hunter', 'hit').length > 0, 'the shooter gets hit confirmations');
  assert.ok(h.events('prey', 'shield-hit').length + h.events('prey', 'hurt').length > 0,
    'shield hit is not mistaken for hull damage');
  const seen = h.conns.get('prey').got.filter(m => m.t === 'fs').flatMap(m => m.bo).filter(x => x[0] === a.eid);
  assert.ok(seen.length >= 3, 'the target sees the bolts coming in its snapshots: ' + seen.length);
  const tickets = h.s.sides.separatist.tickets;
  fire(110);
  assert.equal(h.p('prey').theater, 'dead');
  assert.equal(h.s.sides.separatist.tickets, tickets - 1, 'a lost fighter costs a reinforcement');
  assert.equal(h.p('hunter').stats.kills, 1);
  assert.ok(h.events('hunter', 'kill').some(e => e.victim === h.p('prey').eid && e.killer === h.p('hunter').eid));

  // lag compensation: 200 ms ago the target sat in the line of fire, now it is 40 m to the side
  const lagged = (rtt, interpMs) => {
    const g = harness({ fillBots: false, interpMs });
    g.join('hunter', { side: 'republic' }); g.join('prey', { side: 'separatist' });
    g.start();
    const s = g.craft('hunter'), v = g.craft('prey');
    s.f.p = [0, 2000, 0]; s.f.q = qlook([0, 0, -1]); s.f.v = [0, 0, 0]; s.f.speed = 40;
    const T = g.now();
    v.f.p = [40, 2000, -150]; v.f.q = qlook([1, 0, 0]); v.f.v = [200, 0, 0];
    v.hist = Array.from({ length: 12 }, (_, k) => ({ t: T - 330 + k * 30, p: [40 - (330 - k * 30) * 0.2, 2000, -150] }));
    g.p('hunter').rtt = rtt;
    g.send('hunter', { c: 'cmd', cmds: [{ seq: 1, ms: 20, throttle: 0, fire: true }] });
    for (let k = 0; k < 8; k++) { g.s.crafts.get(v.eid) && (v.hist.forEach(x => { x.t += 34; }), v.f.p = [40, 2000, -150]); g.advance(34); }
    return v.hp + v.shield;
  };
  const fullDefense = SHIP_CLASSES.fighter.hull + SHIP_CLASSES.fighter.shieldMax;
  assert.equal(lagged(0, 0), fullDefense, 'without compensation the bolt misses the protected fighter');
  assert.ok(lagged(200, 100) < fullDefense, 'with 200ms rewind the hit first depletes the shield');
});

test('cruisers: shields absorb first, then hull and hardpoints; subsystems matter; shields come back', () => {
  const h = harness({ fillBots: false });
  h.join('a', { side: 'republic' });
  h.start();
  const c = h.cruiser(3);
  h.mt.debug.hurtCruiser(c, 5000, null, null, 'laser');
  assert.equal(c.shields, CRUISER.shields - 5000);
  assert.equal(c.hull, CRUISER.hull);
  h.mt.debug.hurtCruiser(c, 5000, null, null, 'laser');
  assert.equal(c.shields, 0);
  assert.equal(c.hull, CRUISER.hull - 2000);
  const hp = h.mt.world.hardpointOf(c, 'weapons');
  h.mt.debug.hurtCruiser(c, 1000, hp, null, 'missile');
  assert.equal(c.subs.weapons, CRUISER.subsystems.weapons.hp - 1000, 'a hit on the battery damages it');
  assert.equal(c.hull, CRUISER.hull - 2000 - 1000 * CRUISER.subsystemShare, 'and half as much hull');
  // a destroyed battery stops the turrets
  const prey = h.craft('a');
  const silent = () => { h.s.bolts = []; prey.f.p = add(h.mt.world.hardpointOf(c, 'weapons'), [0, 300, 0]); prey.hp = 1e9; h.advance(1500); return h.s.bolts.filter(b => b.kind === 'turret' && b.ownerEid === c.eid).length; };
  assert.ok(silent() > 0, 'turrets fire at a fighter in range');
  h.mt.debug.damageSubsystem(c, 'weapons', 1e9, null);
  assert.equal(silent(), 0, 'no battery, no turret fire');
  // shields regenerate after a quiet spell, but not without the generator
  const d = h.cruiser(4);
  d.shields = 0; d.lastHitAt = h.now();
  h.advance(CRUISER.shieldDelayMs + 2000);
  assert.ok(d.shields > 0 && d.shields < CRUISER.shields);
  h.mt.debug.damageSubsystem(d, 'shields', 1e9, null);
  assert.equal(d.shields, 0);
  h.advance(CRUISER.shieldDelayMs + 2000);
  assert.equal(d.shields, 0);
});

test('commander curve: hard to kill while the fleet holds, easier as the fleet dwindles and the ship burns', () => {
  const full = commanderModifiers(1, 1), none = commanderModifiers(0, 0);
  assert.equal(full.tier, 'fortified'); assert.equal(none.tier, 'broken');
  assert.equal(full.damageTaken, COMMANDER.damageTaken[0]); assert.equal(none.damageTaken, COMMANDER.damageTaken[1]);
  assert.ok(full.damageDealt > 1 && none.damageDealt < 1);
  let last = 0;
  for (let s = 1; s >= 0; s -= 0.05) {
    const m = commanderModifiers(s, s);
    assert.ok(m.damageTaken >= last, 'never easier to hurt with more strength');
    last = m.damageTaken;
  }
  assert.equal(commanderModifiers(0.6, 0.6).tier, 'steady');
  assert.equal(commanderModifiers(0.3, 0.3).tier, 'strained');

  const h = harness({ fillBots: false });
  h.join('cmdr', { side: 'separatist', role: 'commander' });
  h.join('blade', { side: 'republic', role: 'strike' });
  h.start();
  const ship = h.cruiser(h.p('cmdr').home);
  h.kit('blade');
  h.board('blade', ship);
  h.walk('blade', INTERIOR.stations.bridge);
  h.advance(BODY.spawnProtectMs);
  const target = h.p('cmdr').eid;
  const hp0 = h.p('cmdr').body.hp;
  assert.equal(h.send('blade', { c: 'hit', target, kind: 'saber', dmg: 40 }), true);
  const early = hp0 - h.p('cmdr').body.hp;
  assert.ok(Math.abs(early - 40 * COMMANDER.damageTaken[0] * COMMANDER.strikeBonus) < 0.5, 'fortified commander takes ' + early.toFixed(1));
  h.s.sides.separatist.tickets = 0;
  ship.hull = CRUISER.hull * 0.1;
  h.advance(1100);
  const hp1 = h.p('cmdr').body.hp;
  h.send('blade', { c: 'hit', target, kind: 'saber', dmg: 40 });
  const late = hp1 - h.p('cmdr').body.hp;
  assert.ok(late > early * 3, 'broken commander takes ' + late.toFixed(1) + ' from the same blow');
  assert.ok(h.mt.snapshotFor('cmdr').you.md[0] > 1.2, 'the commander is told about the nerf');
});

test('boarding: docking needs the hangar open; saboteurs plant charges, defenders defuse, a blast wrecks the hyperdrive', () => {
  const h = harness({ fillBots: false });
  h.join('sab', { side: 'republic', role: 'saboteur' });
  h.join('guard', { side: 'separatist', role: 'guard' });
  h.join('cmdr', { side: 'separatist', role: 'commander' });
  h.start();
  assert.equal(h.craft('sab').cls.id, 'breacher', 'boarding missions fly a boarding craft');
  const ship = h.cruiser(h.p('guard').home);
  h.craft('sab').f.p = h.mt.world.bayCenterOf(ship);
  h.advance(40);
  assert.equal(h.p('sab').theater, 'space', 'shields up: the hangar field is closed');
  assert.equal(h.craft('sab').hp, SHIP_CLASSES.breacher.hull,
    'hangar field repulsion is absorbed by the new boarding shield first');
  assert.equal(h.craft('sab').shield, SHIP_CLASSES.breacher.shieldMax - HANGAR_FIELD.repelDamage,
    'the defensive barrier still depletes and throws the ship back out');
  h.board('sab', ship);
  assert.ok(h.events('sab', 'spawn').some(e => e.theater === 'interior'));
  // movement inside is checked: a 40 m jump is refused and corrected
  h.send('sab', { c: 'pos', p: [0, 0, -40] });
  h.advance(40);
  assert.ok(h.events('sab', 'fix').length > 0);
  h.walk('sab', INTERIOR.stations.hyperdrive);
  assert.equal(h.send('sab', { c: 'plant', station: 'bridge' }), false, 'only subsystems take charges');
  assert.equal(h.send('sab', { c: 'plant', station: 'hyperdrive' }), true);
  h.advance(CHARGES.plantMs.specialist + 100);
  assert.ok(ship.charges.has('hyperdrive'), 'planted in 6 s by a saboteur');
  // the guard defuses it in time
  h.walk('guard', INTERIOR.stations.hyperdrive);
  assert.equal(h.send('guard', { c: 'defuse', station: 'hyperdrive' }), true);
  h.advance(CHARGES.defuseMs + 100);
  assert.equal(ship.charges.has('hyperdrive'), false);
  assert.equal(ship.subs.hyperdrive, CRUISER.subsystems.hyperdrive.hp);
  // planted again and left to blow
  h.send('sab', { c: 'plant', station: 'hyperdrive' });
  h.advance(CHARGES.plantMs.specialist + CHARGES.fuseMs + 200);
  assert.ok(Math.abs(ship.subs.hyperdrive - CRUISER.subsystems.hyperdrive.hp * (1 - CHARGES.subsystemFrac)) < 1e-6, 'the blast takes 70% of the hyperdrive');
  assert.ok(ship.hull <= CRUISER.hull - CHARGES.hullDamage);
  assert.ok(h.events('guard', 'detonate').length === 1);
  // a crippled ship may jump out, but not with its hyperdrive gone
  ship.hull = CRUISER.hull * 0.2;
  h.mt.debug.damageSubsystem(ship, 'hyperdrive', 1e9, null);
  assert.equal(h.send('cmdr', { c: 'jump' }), false);
  // a planting saboteur who takes damage is interrupted
  h.walk('sab', INTERIOR.stations.weapons);
  h.send('sab', { c: 'plant', station: 'weapons' });
  h.walk('guard', add(INTERIOR.stations.weapons, [2, 0, 0]));
  h.advance(BODY.spawnProtectMs);
  h.send('guard', { c: 'hit', target: h.p('sab').eid, kind: 'bolt', dmg: 10 });
  assert.equal(h.p('sab').body.action, null);
});

test('jumping out: a crippled cruiser with a working hyperdrive escapes; if it was the last one, the attackers win by retreat', () => {
  const h = harness({ fillBots: false });
  h.join('cmdr', { side: 'separatist', role: 'commander' });
  h.join('r', { side: 'republic' });
  h.start();
  const ship = h.cruiser(h.p('cmdr').home);
  assert.equal(h.send('cmdr', { c: 'jump' }), false, 'a healthy ship stays to fight');
  ship.hull = CRUISER.hull * 0.2;
  assert.equal(h.send('cmdr', { c: 'jump' }), true);
  assert.equal(ship.state, 'spooling');
  const other = h.s.cruisers.find(c => c.side === 'separatist' && c !== ship);
  h.mt.debug.destroyCruiser(other, h.p('r'));
  assert.equal(h.s.phase, 'battle', 'still in the fight while spooling');
  h.advance(h.s.cfg.jumpSpoolMs + 100);
  assert.equal(ship.state, 'escaped');
  assert.deepEqual([h.s.result.winner, h.s.result.reason], ['republic', 'retreat']);
});

test('the strike team defeats the commander: shields collapse, the commander returns, the third defeat leaves the ship leaderless', () => {
  const h = harness({ fillBots: false });
  h.join('cmdr', { side: 'separatist', role: 'commander' });
  h.join('blade', { side: 'republic', role: 'strike' });
  h.start();
  const ship = h.cruiser(h.p('cmdr').home);
  h.kit('blade');
  h.board('blade', ship);
  h.walk('blade', INTERIOR.stations.bridge);
  const kill = () => {
    h.advance(BODY.spawnProtectMs);
    for (let i = 0; i < 200 && h.p('cmdr').body?.alive; i++) { h.send('blade', { c: 'hit', target: h.p('cmdr').eid, kind: 'saber', dmg: 72 }); h.advance(400); }
    assert.equal(h.p('cmdr').theater, 'dead');
  };
  kill();
  assert.equal(ship.commander.defeats, 1);
  assert.equal(ship.shields, 0);
  assert.ok(ship.shieldsCollapsedUntil > h.now());
  ship.lastHitAt = -Infinity;
  h.advance(CRUISER.shieldDelayMs);
  assert.equal(ship.shields, 0, 'shields stay down while collapsed');
  h.advance(COMMANDER.respawnMs);
  assert.equal(h.p('cmdr').theater, 'interior', 'back on the bridge after a minute');
  kill(); h.advance(COMMANDER.respawnMs + 100);
  kill();
  assert.equal(ship.leaderless, true);
  assert.equal(h.p('cmdr').role, 'guard', 'the commander is out of command for good');
  assert.equal(h.send('cmdr', { c: 'jump' }), false);
  assert.ok(h.events('blade', 'commander').some(e => e.final));
  assert.ok(h.p('blade').stats.objectives >= 3);
});

test('ground phase: the first array destroyed buffs the winners and cuts the losers\' team voice for the rest of the match', () => {
  const h = harness({ fillBots: false });
  h.join('g1', { side: 'republic', role: 'ground' }); h.join('g2', { side: 'separatist', role: 'ground' });
  h.join('r2', { side: 'republic' }); h.join('s2', { side: 'separatist' });
  h.start();
  assert.equal(h.p('g1').theater, 'space', 'the strike team flies until the planet opens');
  h.advance(GROUND.opensMs + 100);
  assert.equal(h.s.ground.phase, 'open');
  assert.equal(h.p('g1').theater, 'ground');
  // voice works for everyone before the result
  assert.equal(h.send('s2', { c: 'voice', to: h.p('g2').eid, sig: { type: 'offer', sdp: 'x' } }), true);
  assert.ok(h.conns.get('g2').got.some(m => m.t === 'fv'));
  assert.equal(h.send('s2', { c: 'voice', to: h.p('g1').eid, sig: {} }), false, 'never to the other team');
  h.walk('g1', [100, 0, 0]);
  assert.equal(h.send('g1', { c: 'hit', target: 'array', kind: 'bolt', dmg: 85 }), true);
  for (let i = 0; i < 300 && h.s.ground.phase === 'open'; i++) { h.advance(400); h.send('g1', { c: 'hit', target: 'array', kind: 'bolt', dmg: 85 }); }
  h.advance(40);
  assert.deepEqual(h.s.ground.result.winner, 'republic');
  assert.equal(h.s.sides.republic.buffs.comms, true);
  assert.equal(h.s.sides.separatist.buffs.comms, false, 'no buff for the losers');
  assert.equal(h.s.sides.separatist.voice.team, false);
  assert.equal(h.s.sides.republic.voice.team, true);
  assert.ok(h.events('s2', 'voice').some(e => e.side === 'separatist' && e.team === false));
  const before = h.conns.get('g2').got.filter(m => m.t === 'fv').length;
  assert.equal(h.send('s2', { c: 'voice', to: h.p('g2').eid, sig: { type: 'offer' } }), false);
  assert.equal(h.conns.get('g2').got.filter(m => m.t === 'fv').length, before, 'the server no longer relays their team voice');
  assert.equal(h.send('r2', { c: 'voice', to: h.p('g1').eid, sig: { type: 'offer' } }), true);
  // the buff: faster respawns and harder-hitting lasers, for the rest of the match
  h.advance(5000);
  h.send('r2', { c: 'cmd', cmds: [{ seq: 1, ms: 33, fire: true }] });
  const bolt = h.s.bolts.find(b => b.owner === 'r2');
  assert.ok(Math.abs(bolt.dmg - SHIP_CLASSES.fighter.lasers.damage * GROUND.buff.laserDamage) < 1e-9);
  h.advance(GROUND.windowMs);
  assert.equal(h.s.sides.separatist.voice.team, false, 'still muted later in the match');
  const snap = h.mt.snapshotFor('s2');
  assert.equal(snap.you.vo.team, false);
  assert.deepEqual(snap.sd.map(x => x[4]), [1, 0]);
});

test('ground phase with no array destroyed in the window: nobody gets the buff, nobody loses voice', () => {
  const h = harness({ fillBots: false });
  h.join('g1', { side: 'republic', role: 'ground' }); h.join('g2', { side: 'separatist', role: 'ground' });
  h.start();
  h.advance(GROUND.opensMs + GROUND.windowMs + 200);
  assert.equal(h.s.ground.phase, 'closed');
  assert.equal(h.s.ground.result.winner, null);
  assert.equal(h.s.sides.republic.buffs.comms || h.s.sides.separatist.buffs.comms, false);
  assert.equal(h.s.sides.republic.voice.team && h.s.sides.separatist.voice.team, true);
  h.advance(4000);
  assert.equal(h.p('g1').theater, 'space', 'the strike team is back in the fleet');
});

test('win conditions: every enemy cruiser destroyed, the time limit on fleet strength, and a forfeit', () => {
  const a = harness({ fillBots: false });
  a.join('r', { side: 'republic' }); a.join('s', { side: 'separatist' });
  a.start();
  for (const c of a.s.cruisers.filter(c => c.side === 'separatist')) a.mt.debug.destroyCruiser(c, a.p('r'));
  a.advance(40);
  assert.deepEqual([a.s.result.winner, a.s.result.reason], ['republic', 'destroyed']);
  assert.ok(a.events('s', 'phase').some(e => e.phase === 'ended' && e.winner === 'republic'));
  assert.ok(a.s.sides.republic.score >= 2 * 2000);

  const b = harness({ fillBots: false, timeLimitMs: 60000 });
  b.join('r', { side: 'republic' }); b.join('s', { side: 'separatist' });
  b.start();
  b.cruiser(1).hull = CRUISER.hull * 0.5;
  b.advance(61000);
  assert.deepEqual([b.s.result.winner, b.s.result.reason], ['separatist', 'time']);

  const c = harness({ fillBots: false, forfeitMs: 5000 });
  c.join('r', { side: 'republic' }); c.join('s', { side: 'separatist' });
  c.start();
  c.mt.removePlayer('s');
  c.advance(5200);
  assert.deepEqual([c.s.result.winner, c.s.result.reason], ['republic', 'forfeit']);

  const d = harness({ forfeitMs: 5000 });
  d.join('solo', { side: 'republic' });
  d.start(); d.advance(8000);
  assert.equal(d.s.phase, 'battle', 'a lone human against AI pilots is not a forfeit');
});

test('every network report is checked: theater, range, damage caps, rate, rights and team', () => {
  const h = harness({ fillBots: false });
  h.join('sab', { side: 'republic', role: 'boarder' });
  h.join('guard', { side: 'separatist', role: 'guard' });
  h.join('pilot', { side: 'republic' });
  h.join('cmdr', { side: 'separatist', role: 'commander' });
  h.join('mate', { side: 'separatist' });
  h.start();
  for (const junk of [null, 5, 'x', {}, { c: 'nope' }, { c: 'cmd', cmds: 'x' }, { c: 'pos', p: [NaN, 0, 0] }, { c: 'hit' }]) h.send('pilot', junk);
  assert.equal(h.send('pilot', { c: 'hit', target: h.p('guard').eid, kind: 'saber', dmg: 50 }), false, 'a pilot in space hits nobody aboard');
  const ship = h.cruiser(h.p('guard').home);
  h.kit('sab');
  h.board('sab', ship);
  const g = h.p('guard');
  assert.equal(h.send('sab', { c: 'hit', target: g.eid, kind: 'saber', dmg: 50 }), false, 'out of saber range');
  h.walk('sab', add(g.body.p, [1.5, 0, 0]));
  h.advance(BODY.spawnProtectMs);
  assert.equal(h.send('sab', { c: 'hit', target: g.eid, kind: 'lightsaber-of-doom', dmg: 50 }), false);
  h.send('sab', { c: 'hit', target: g.eid, kind: 'saber', dmg: 5000 });
  assert.equal(g.body.hp, BODY.hp - BODY.hitCaps.saber, 'one blow is capped at the heaviest real saber hit');
  h.advance(1100);
  g.body.hp = 1e6;
  for (let i = 0; i < 10; i++) h.send('sab', { c: 'hit', target: g.eid, kind: 'bolt', dmg: 85 });
  assert.equal(1e6 - g.body.hp, BODY.dpsCap, 'no more than the per-second cap');
  assert.equal(h.send('sab', { c: 'hit', target: h.p('pilot').eid, kind: 'saber', dmg: 10 }), false, 'no friendly fire, no hits across theaters');
  // command rights
  assert.equal(h.send('pilot', { c: 'assign', player: h.p('sab').eid, role: 'strike' }), false, 'only commanders assign');
  assert.equal(h.send('cmdr', { c: 'assign', player: h.p('sab').eid, role: 'strike' }), false, 'only their own side');
  assert.equal(h.send('cmdr', { c: 'assign', player: h.p('mate').eid, role: 'ground' }), true);
  assert.equal(h.p('mate').pref, 'ground');
  h.advance(40);
  assert.ok(h.events('mate', 'assigned').some(e => e.role === 'ground'));
  h.mt.debug.damageSubsystem(h.cruiser(h.p('cmdr').home), 'comms', 1e9, null);
  assert.equal(h.send('cmdr', { c: 'assign', player: h.p('mate').eid, role: 'pilot' }), false, 'no comms, no orders');
  assert.equal(h.send('cmdr', { c: 'focus', sub: 'shields' }), false);
  // NPC garrison reports are rate limited
  const before = ship.garrison;
  h.send('sab', { c: 'npc', kind: 'kill' }); h.send('sab', { c: 'npc', kind: 'kill' });
  assert.equal(ship.garrison, before - 1);
  h.advance(BODY.npcKillEveryMs + 50);
  h.send('sab', { c: 'npc', kind: 'kill' });
  assert.equal(ship.garrison, before - 2);
});

test('a snapshot of a full 64-player sky stays small enough for 15 Hz', () => {
  const h = harness({ fillBots: false });
  for (let i = 0; i < 64; i++) h.join('p' + i);
  h.start();
  assert.equal(h.s.crafts.size, 64);
  const snap = h.mt.snapshotFor('p0');
  const bytes = JSON.stringify(snap).length;
  assert.equal(snap.s.length, 64);
  assert.ok(bytes < 9000, 'snapshot ' + bytes + ' bytes');
  console.log('# 64-ship snapshot:', bytes, 'bytes ≈', Math.round(bytes * 15 / 1024), 'KiB/s per player at 15 Hz');
});

test('the hub opens another match when one is full, requeues after a result and closes empty matches', () => {
  let t = 1000;
  const hub = createFleetHub({ now: () => t, rng: () => 0.5, config: { warmupMs: 1000, cruisersPerSide: 2, minPlayers: 40, maxPlayers: 64 } });
  const conns = [];
  for (let i = 0; i < 65; i++) {
    const conn = { got: [], send: m => conn.got.push(m) };
    conns.push(conn);
    assert.equal(hub.join(conn, { id: 'u' + i, name: 'U' + i }).ok, true);
  }
  assert.equal(hub.matches.size, 2);
  assert.deepEqual([...hub.matches.values()].map(m => m.humans()), [64, 1]);
  assert.equal(hub.join(conns[0], { id: 'u0' }).ok, false, 'one connection, one seat');
  assert.equal(hub.join({ send() {} }, { id: 'u1' }).ok, false, 'one session, one seat');
  assert.ok(conns[0].got.some(m => m.t === 'fw'));
  const second = [...hub.matches.values()][1];
  second.debug.startBattle(); second.debug.end('republic', 'test');
  assert.equal(hub.message(conns[64], { c: 'requeue' }), true);
  assert.equal(hub.matches.size, 3, 'into a fresh match');
  for (const c of conns.slice(0, 64)) hub.leave(c);
  t += 100; hub.tick();
  assert.equal(hub.matches.size, 1, 'empty and finished matches are closed');
  assert.equal(hub.report().humans, 1);
});

test('progression: points from the fight buy the command ship and the Jedi fighter at the next launch, Battlefront II style', () => {
  const h = harness({ fillBots: false });
  h.join('ace', { side: 'republic' }); h.join('foe', { side: 'separatist' });
  h.start();
  const ace = h.p('ace'), relaunch = () => { h.send('ace', { c: 'redeploy' }); h.advance(3100); return h.craft('ace'); };
  assert.equal(h.craft('ace').cls.id, 'fighter', 'everyone starts in the basic fighter');
  assert.equal(h.send('ace', { c: 'loadout', ship: 'command' }), true);
  assert.equal(h.send('ace', { c: 'loadout', ship: 'star-destroyer' }), false);
  assert.equal(relaunch().cls.id, 'fighter', 'not enough points or kills yet');
  assert.ok(h.events('ace', 'denied').some(e => e.what === 'loadout'));
  // points come from score: here, damage to an enemy cruiser
  h.mt.debug.hurtCruiser(h.cruiser(3), 20000, null, ace, 'laser');
  assert.equal(ace.points, 20000 * 0.05);
  const [command, jedi] = SHIP_TIERS.slice(1);
  assert.equal(relaunch().cls.id, 'fighter', 'points alone are not enough: it also takes kills');
  ace.stats.kills = command.kills;
  const before = ace.points;
  const craft = relaunch();
  assert.equal(craft.cls.id, 'command');
  assert.equal(craft.hp, SHIP_CLASSES.command.hull);
  assert.equal(ace.points, before - command.cost, 'deploying spends the points');
  const snap = h.mt.snapshotFor('ace');
  assert.deepEqual(snap.you.dep, ['command', null], 'deployed as: ship, trooper (none yet)');
  assert.equal(snap.you.pts, ace.points);
  assert.equal(snap.s.find(x => x[0] === ace.eid)[1], SHIP_CLASSES.command.code, 'others see the command ship');
  assert.equal(relaunch().cls.id, 'fighter', 'the points went on the last one; it takes more to fly it again');
  ace.points += 5000; ace.stats.kills = jedi.kills;
  h.send('ace', { c: 'loadout', ship: 'jedi' });
  assert.equal(relaunch().cls.id, 'jedi');
  assert.ok(SHIP_CLASSES.jedi.boostSpeed > SHIP_CLASSES.fighter.boostSpeed && SHIP_CLASSES.command.hull > SHIP_CLASSES.fighter.hull);
});

test('progression can be a permanent unlock instead (the owner has to choose)', () => {
  const h = harness({ fillBots: false, spendPoints: false });
  h.join('ace', { side: 'republic' }); h.join('foe', { side: 'separatist' });
  h.start();
  const ace = h.p('ace');
  h.mt.debug.hurtCruiser(h.cruiser(3), 20000, null, ace, 'laser');
  ace.stats.kills = 3;
  h.send('ace', { c: 'loadout', ship: 'command' });
  for (let i = 0; i < 3; i++) { h.send('ace', { c: 'redeploy' }); h.advance(3100); assert.equal(h.craft('ace').cls.id, 'command'); }
  assert.equal(ace.points, 1000, 'nothing is spent');
});

test('trooper levels: a heavy trooper shield takes hits first and recharges; only a Jedi may report saber hits', () => {
  const h = harness({ fillBots: false });
  h.join('heavy', { side: 'republic', role: 'boarder' }); h.join('guard', { side: 'separatist', role: 'guard' });
  h.join('jedi', { side: 'republic', role: 'strike' }); h.join('cmdr', { side: 'separatist', role: 'commander' });
  h.start();
  const ship = h.cruiser(h.p('guard').home);
  h.kit('heavy', 'heavy'); h.kit('jedi', 'jedi');
  h.board('heavy', ship); h.board('jedi', ship);
  const hv = h.p('heavy').body, g = h.p('guard').body;
  assert.equal(hv.maxShield, TROOPER_TIERS[1].shield);
  assert.equal(g.tier, 'trooper', 'the guard deployed as a basic trooper');
  h.walk('guard', add(hv.p, [2, 0, 0]));
  h.advance(BODY.spawnProtectMs);
  assert.equal(h.send('guard', { c: 'hit', target: h.p('heavy').eid, kind: 'saber', dmg: 30 }), false, 'a trooper has no lightsaber');
  assert.equal(h.send('guard', { c: 'hit', target: h.p('heavy').eid, kind: 'explosion', dmg: 30 }), false, 'nor grenades');
  assert.equal(h.send('guard', { c: 'hit', target: h.p('heavy').eid, kind: 'bolt', dmg: 60 }), true);
  assert.deepEqual([hv.hp, hv.shield], [100, 40], 'the shield took it');
  h.advance(PERSONAL_SHIELD.delayMs + 2000);
  assert.ok(hv.shield > 40 && hv.shield <= TROOPER_TIERS[1].shield, 'and recharges after a quiet spell: ' + hv.shield.toFixed(1));
  assert.equal(h.send('heavy', { c: 'hit', target: h.p('guard').eid, kind: 'explosion', dmg: 50 }), true, 'grenades');
  assert.equal(h.send('heavy', { c: 'hit', target: h.p('guard').eid, kind: 'saber', dmg: 50 }), false);
  const entry = h.mt.snapshotFor('heavy').b.find(x => x[0] === h.p('heavy').eid);
  assert.equal(entry[9], 2, 'others see the level');
  assert.ok(entry[8] > 0, 'and the shield');
  h.walk('jedi', add(g.p, [1.5, 0, 0]));
  h.advance(BODY.spawnProtectMs);
  assert.equal(h.send('jedi', { c: 'hit', target: h.p('guard').eid, kind: 'saber', dmg: 40 }), true);
});

test('AI pilots buy better ships when they can afford them', () => {
  const h = harness({ minPlayers: 4 });
  h.join('solo', { side: 'republic' });
  h.start();
  const bot = [...h.s.players.values()].find(p => p.bot && p.role === 'pilot');
  bot.points = 5000; bot.stats.kills = 10;
  h.mt.debug.spawn(bot);
  assert.equal(h.s.crafts.get(bot.eid).cls.id, 'jedi');
  assert.equal(bot.points, 5000 - SHIP_TIERS[2].cost);
});

test('boarding means flying into the enemy hangar: through an open field to the trigger, the interior loads', () => {
  const h = harness({ fillBots: false });
  h.join('sab', { side: 'republic', role: 'saboteur' }); h.join('ace', { side: 'republic' });
  h.join('guard', { side: 'separatist', role: 'guard' });
  h.start();
  const ship = h.cruiser(h.p('guard').home);
  const B = CRUISER.bay;
  // start 60 m outside one mouth of the bay, nose pointing in
  const place = (id, side = 1) => {
    const c = h.craft(id);
    c.f.p = fromBoxLocal([side * (B.half[0] + 60) + B.center[0], B.center[1], B.center[2]], ship.p, ship.yaw);
    const dir = fromBoxLocal([-side, 0, 0], [0, 0, 0], ship.yaw);
    c.f.q = qlook(dir); c.f.v = scale(dir, 100); c.f.speed = 100; c.hist = [];
  };
  let seq = 1;
  const fly = (id, ms) => { for (let t = 0; t < ms; t += 33) { h.send(id, { c: 'cmd', cmds: [{ seq: seq++, ms: 33, throttle: 0.6 }] }); h.advance(33); } };
  // shields up: thrown back out
  place('sab');
  fly('sab', 900);
  assert.equal(h.p('sab').theater, 'space');
  assert.ok(Math.abs(toBoxLocal(h.craft('sab').f.p, ship.p, ship.yaw)[0]) > B.half[0], 'outside again');
  h.advance(40);
  assert.ok(h.events('sab', 'field').some(e => e.cruiser === ship.eid && e.open === false));
  // shields down: the field lets it through and the trigger, deep inside, boards it (battery out, so turrets do not decide the test)
  ship.shields = 0; ship.lastHitAt = h.now();
  h.mt.debug.damageSubsystem(ship, 'weapons', 1e9, null);
  place('sab', -1);
  fly('sab', 1500);
  assert.equal(h.p('sab').theater, 'interior');
  assert.equal(h.p('sab').body.area, 'ship:' + ship.eid);
  assert.ok(h.events('guard', 'boarded').some(e => e.player === h.p('sab').eid));
  // a fighter can fly straight through an open bay and out of the far side; it does not board
  ship.lastHitAt = h.now();
  place('ace');
  const hull = h.craft('ace').hp;
  fly('ace', 2200);
  assert.equal(h.p('ace').theater, 'space', 'not boarded, not crashed');
  assert.equal(h.craft('ace').hp, hull);
  assert.ok(toBoxLocal(h.craft('ace').f.p, ship.p, ship.yaw)[0] < -B.half[0], 'came out of the other mouth');
  // its own ships always pass their field
  assert.equal(h.p('guard').theater, 'interior');
});
