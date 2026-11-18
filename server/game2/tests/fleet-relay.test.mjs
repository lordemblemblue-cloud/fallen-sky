import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleetMatch } from '../fleet/match.mjs';
import { BODY, POSE_FIELDS, POSE_FLAGS, POSE_HILTS, POSE_THROWN, RELAY, TIER_LEVEL_CODES, TROOPER_TIERS } from '../fleet/rules.mjs';

// The body-state relay aboard a cruiser: 'st' (position + pose) and 'fx' (an effect on another player's fighter) in,
// 'fr' (poses of the others in the same area) and 'ff' (effects) out. The server checks size, rate, area, side and range,
// and never lets the relay touch HP or take a position its speed check refused.
function harness(config = {}) {
  let t = 1000, seed = 4242;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mt = createFleetMatch({ id: 'relay', now: () => t, rng, config: { warmupMs: 500, fillBots: false, forfeit: false, ...config } });
  const conns = new Map();
  const h = {
    mt, s: mt.state, now: () => t,
    join(id, o = {}) {
      const conn = { got: [], send: (msg, reliable = true) => conn.got.push({ ...JSON.parse(JSON.stringify(msg)), reliable }) };
      conns.set(id, conn);
      return mt.addHuman({ id, name: id, conn, ...o });
    },
    advance(ms) { const end = t + ms; while (t < end) { t = Math.min(end, t + 1000 / 30); mt.tick(); } },
    start() { h.advance(600); assert.equal(h.s.phase, 'battle'); },
    p: id => h.s.players.get(id),
    got: (id, kind) => conns.get(id).got.filter(m => m.t === kind),
    clear: () => { for (const c of conns.values()) c.got.length = 0; },
    denied: (id, what) => conns.get(id).got.filter(m => m.t === 'fe').flatMap(m => m.ev).filter(e => e.e === 'denied' && (!what || e.what === what)),
    send: (id, msg) => mt.handle(id, msg),
    // put a player's body aboard a cruiser at a point, with a trooper level's kit (test tooling: boarding and the levels
    // themselves are tested in fleet-match)
    aboard(id, cruiser, at, tier = 'jedi') {
      const p = h.p(id), T = TROOPER_TIERS.find(x => x.id === tier);
      h.s.crafts.delete(p.eid);
      p.body = { area: 'ship:' + cruiser.eid, p: at.slice(), hp: T.hp, max: T.hp, alive: true, protectUntil: 0, posAt: t, action: null,
        shield: 0, maxShield: 0, hurtAt: 0, kinds: T.kinds.slice(), tier, pose: null, poseAt: 0, poseNew: false };
      p.theater = 'interior';
      return p;
    },
  };
  return h;
}
// a pose a page could send: a fighter mid-swing in Medium stance, running
const pose = (o = {}) => {
  const s = POSE_FIELDS.map(([k]) => ({ yaw: 1571, ayaw: 1571, syaw: 120, spitch: -80, pitch: 150, flags: 2 | 8, legs: 312, legsT: 1234, legsSpeed: 1000, legsLoop: 1, torso: 455, torsoT: 345, torsoSpeed: 1500, move: 23, level: 2 }[k] ?? 0));
  for (const [k, v] of Object.entries(o)) s[POSE_FIELDS.findIndex(f => f[0] === k)] = v;
  return s;
};
const relayed = (h, id) => h.got(id, 'fr').flatMap(m => m.b);

function crew(n = 3) {
  const h = harness();
  // joined in turn so the sides stay balanced and every id keeps the side its name says
  for (const id of ['r0', 's0', 'r1', 's1', 'r2'].slice(0, n + 2)) h.join(id, { side: id[0] === 'r' ? 'republic' : 'separatist' });
  h.start();
  const ship = h.s.cruisers.find(c => c.side === 'separatist'), other = h.s.cruisers.find(c => c.side === 'republic');
  return { h, ship, other };
}

test('a pose goes only to the other humans in the same ship, with the position the server accepted', () => {
  const { h, ship, other } = crew();
  const a = h.aboard('r0', ship, [0, 0, -4]), b = h.aboard('s0', ship, [0, 0, -8]);
  h.aboard('r1', other, [0, 0, -8]); // another ship: never sees ship's poses
  // r2 flies in space, s1 too: no bodies, no relay
  h.clear();
  assert.equal(h.send('r0', { c: 'st', p: [0.5, 0, -4.5], s: pose() }), true);
  h.advance(40);
  const toB = relayed(h, 's0');
  assert.equal(toB.length, 1, 'the separatist guard aboard gets one pose');
  const [eid, level, x, y, z, ...s] = toB[0];
  assert.equal(eid, a.eid);
  assert.equal(level, TIER_LEVEL_CODES.jedi, 'with its level: the kit the pose is for');
  assert.deepEqual([x, y, z], [50, 0, -450], 'centimetres of the accepted position');
  assert.deepEqual(s, pose());
  assert.deepEqual(a.body.p, [0.5, 0, -4.5], "'st' moves the body as 'pos' does");
  assert.equal(h.got('s0', 'fr')[0].reliable, false, 'state goes on the unreliable channel');
  for (const id of ['r0', 'r1', 'r2', 's1']) assert.equal(relayed(h, id).length, 0, id + ' gets none (own pose, another ship, or no body)');
  // nothing new: nothing relayed
  h.clear(); h.advance(200);
  assert.equal(relayed(h, 's0').length, 0, 'a pose is relayed once');
  // a jump the speed check refuses: the server keeps its position, tells the sender, and relays its own
  h.clear();
  h.send('r0', { c: 'st', p: [30, 0, -60], s: pose({ status: 2 }) });
  h.advance(40);
  assert.deepEqual(a.body.p, [0.5, 0, -4.5]);
  assert.ok(h.got('r0', 'fe').flatMap(m => m.ev).some(e => e.e === 'fix'), 'a fix for the sender');
  assert.deepEqual(relayed(h, 's0')[0].slice(2, 5), [50, 0, -450], 'never the refused position');
  assert.ok(b.body.alive);
});

test('poses are checked: shape, integer ranges, the held Force target, and the rate', () => {
  const { h, ship, other } = crew();
  const a = h.aboard('r0', ship, [0, 0, -4]), b = h.aboard('s0', ship, [0, 0, -8]), far = h.aboard('r1', other, [0, 0, -4]);
  const bad = [
    'not a list', pose().slice(0, 10), [...pose(), 1], pose({ yaw: 1.5 }), pose({ status: 99 }), pose({ legs: -2 }),
    pose({ legsT: 1e9 }), pose().map(String), [...pose(), 1, 2, 3, 99999999],
  ];
  for (const s of bad) {
    h.clear(); h.advance(2100); // past the 2 s between refusals
    assert.equal(h.send('r0', { c: 'st', p: a.body.p, s }), false, 'refused: ' + JSON.stringify(s).slice(0, 60));
    h.advance(40);
    assert.equal(relayed(h, 's0').length, 0);
    assert.equal(h.denied('r0', 'st').length, 1);
  }
  // a thrown saber's four extra fields are fine
  h.clear(); h.advance(100);
  const thrown = [...pose({ hilt: 2 }), 120, 110, -620, 3000];
  assert.equal(thrown.length, POSE_FIELDS.length + POSE_THROWN.length);
  assert.equal(h.send('r0', { c: 'st', s: thrown }), true, 'a pose without a position is kept too');
  h.advance(40);
  assert.deepEqual(relayed(h, 's0')[0].slice(5), thrown);
  // a held power's target: kept when it stands in the same area, zeroed when it does not
  const ti = POSE_FIELDS.findIndex(f => f[0] === 'target');
  h.clear(); h.send('r0', { c: 'st', s: pose({ hold: 1, target: b.eid }) }); h.advance(40);
  assert.equal(relayed(h, 's0')[0][5 + ti], b.eid);
  h.clear(); h.send('r0', { c: 'st', s: pose({ hold: 1, target: far.eid }) }); h.advance(40);
  assert.equal(relayed(h, 's0')[0][5 + ti], 0, 'a body in another ship is not a target here');
  // rate: a page may send RELAY.poseRate a second with a burst of RELAY.poseBurst; a flood is dropped, not relayed more
  h.clear(); h.advance(1000);
  let ok = 0;
  for (let i = 0; i < 50; i++) ok += h.send('r0', { c: 'st', p: a.body.p, s: pose({ legsT: i }) }) ? 1 : 0;
  assert.equal(ok, RELAY.poseBurst, 'the burst, then nothing');
  h.advance(40);
  assert.equal(relayed(h, 's0').length, 1, 'and still one pose per tick to each viewer');
  let later = 0;
  for (let i = 0; i < 30; i++) { h.advance(1000 / 20); later += h.send('r0', { c: 'st', p: a.body.p, s: pose() }) ? 1 : 0; }
  assert.equal(later, 30, 'a page at 20 a second is never refused');
});

test('an effect goes to the one player it is on, inside the ship and within range; it never changes HP or position', () => {
  const { h, ship, other } = crew();
  const a = h.aboard('r0', ship, [0, 0, -4]), b = h.aboard('s0', ship, [0, 0, -12]), mate = h.aboard('r1', ship, [2, 0, -4]);
  const away = h.aboard('s1', other, [0, 0, -12]);
  const push = [{ from: { $f: a.eid }, pull: false, lv: 3, dmgScale: 1, dir: [0, 0, -1], dist: 8, charge: 0 }];
  h.clear();
  assert.equal(h.send('r0', { c: 'fx', to: b.eid, k: 'throw', a: push }), true);
  const ff = h.got('s0', 'ff');
  assert.equal(ff.length, 1);
  assert.deepEqual({ ...ff[0], reliable: undefined }, { t: 'ff', from: a.eid, k: 'throw', a: push, reliable: undefined });
  assert.equal(ff[0].reliable, true, 'effects are reliable');
  for (const id of ['r0', 'r1', 'r2', 's1']) assert.equal(h.got(id, 'ff').length, 0, 'nobody else: ' + id);
  assert.equal(b.body.hp, BODY.hp, 'the server took no HP for it (damage only ever arrives as a hit)');
  assert.deepEqual(b.body.p, [0, 0, -12]);
  // the answer comes back the same way
  h.clear();
  assert.equal(h.send('s0', { c: 'fx', to: a.eid, k: 'throwRes', a: [{ outcome: 'knockdown', pull: false }] }), true);
  assert.equal(h.got('r0', 'ff')[0].k, 'throwRes');
  // refused: an ally (hostile kinds), another ship, out of range, a kind not on the list, too large, no target
  const tries = [
    [{ c: 'fx', to: mate.eid, k: 'grip', a: [true, 1.4, {}] }, 'target'],
    [{ c: 'fx', to: away.eid, k: 'push', a: [[0, 0, -1], 9] }, 'target'],
    [{ c: 'fx', to: 999999, k: 'push', a: [[0, 0, -1], 9] }, 'target'],
    [{ c: 'fx', to: b.eid, k: 'hurt', a: [50] }, 'kind'],
    [{ c: 'fx', to: b.eid, k: 'executedBy', a: [] }, 'kind'],
    [{ c: 'fx', to: b.eid, k: 'push', a: ['x'.repeat(RELAY.effectBytes)] }, 'too large'],
    [{ c: 'fx', to: b.eid, k: 'push', a: { 0: 1 } }, 'invalid'],
  ];
  for (const [msg, why] of tries) {
    h.clear(); h.advance(2100);
    assert.equal(h.send('r0', msg), false, JSON.stringify(msg).slice(0, 60));
    h.advance(40);
    assert.deepEqual(h.denied('r0', 'fx').map(e => e.why), [why]);
    assert.equal(h.got('s0', 'ff').length + h.got('r1', 'ff').length + h.got('s1', 'ff').length, 0);
  }
  // range: a blade block needs the two bodies close, a Force effect within RELAY.effectRange
  h.clear(); h.advance(2100);
  b.body.p = [0, 0, -13.5];
  assert.equal(h.send('r0', { c: 'fx', to: b.eid, k: 'blocked', a: ['BOUNCE'] }), false, '9.5 m is too far for a blade');
  b.body.p = [0, 0, -4 - RELAY.effectRange - BODY.rangeSlack - 1];
  h.advance(2100);
  assert.equal(h.send('r0', { c: 'fx', to: b.eid, k: 'push', a: [[0, 0, -1], 9] }), false, 'beyond Force range');
  h.advance(40);
  assert.deepEqual(h.denied('r0', 'fx').map(e => e.why), ['range', 'range']);
  b.body.p = [0, 0, -5.5];
  assert.equal(h.send('r0', { c: 'fx', to: b.eid, k: 'blocked', a: ['BOUNCE'] }), true, 'close enough to cross blades');
  // a body that is down cannot be the target, nor send
  b.body.alive = false;
  h.advance(2100);
  assert.equal(h.send('r0', { c: 'fx', to: b.eid, k: 'push', a: [[0, 0, -1], 9] }), false);
  assert.equal(h.send('s0', { c: 'fx', to: a.eid, k: 'push', a: [[0, 0, -1], 9] }), false);
});

test('a cast, sparks and a taunt are shown to everyone aboard; effects are rate limited', () => {
  const { h, ship, other } = crew();
  h.aboard('r0', ship, [0, 0, -4]); h.aboard('s0', ship, [0, 0, -12]); h.aboard('r1', ship, [2, 0, -4]); h.aboard('s1', other, [0, 0, -4]);
  h.clear();
  assert.equal(h.send('r0', { c: 'fx', k: 'cast', a: ['push', [0, 0, -1]] }), true);
  for (const id of ['s0', 'r1']) assert.equal(h.got(id, 'ff')[0]?.k, 'cast', id + ' sees the cast');
  for (const id of ['r0', 's1', 'r2']) assert.equal(h.got(id, 'ff').length, 0, id + ' does not');
  // the rate: RELAY.effectBurst at once, then RELAY.effectRate a second
  h.advance(1000);
  let ok = 0;
  for (let i = 0; i < 100; i++) ok += h.send('r0', { c: 'fx', k: 'hit', a: [[0, 1, -8], 0, 0] }) ? 1 : 0;
  assert.equal(ok, RELAY.effectBurst);
  ok = 0;
  for (let i = 0; i < 40; i++) { h.advance(1000 / 40); ok += h.send('r0', { c: 'fx', k: 'hit', a: [[0, 1, -8], 0, 0] }) ? 1 : 0; }
  assert.ok(ok >= RELAY.effectRate * 0.95, 'lightning-rate effects get through: ' + ok);
});

test('twenty bodies in one ship: the snapshot and the pose relay stay small', () => {
  const h = harness({ cruisersPerSide: 1 });
  for (let i = 0; i < 20; i++) h.join('p' + i, { side: i % 2 ? 'separatist' : 'republic' });
  h.start();
  const ship = h.s.cruisers.find(c => c.side === 'separatist');
  const ids = [...h.s.players.values()].filter(p => p.human).map(p => p.id);
  ids.forEach((id, i) => h.aboard(id, ship, [-20 + (i % 5) * 9, i < 15 ? 0 : 4, -10 - Math.floor(i / 5) * 18]));
  h.advance(100);
  const snap = h.mt.snapshotFor('p0');
  assert.equal(snap.b.length, 21, 'every body aboard is in the snapshot: the 20 players and the AI stand-in commander');
  const snapBytes = JSON.stringify(snap).length, bBytes = JSON.stringify(snap.b).length;
  // every page reports its pose (a thrown saber for one, to measure the long form)
  h.clear();
  ids.forEach((id, i) => h.send(id, { c: 'st', p: h.p(id).body.p, s: i === 3 ? [...pose({ hilt: 2, legsT: 100000 + i * 37 }), 120, 110, -620, 3000] : pose({ legsT: 100000 + i * 37, yaw: -3141 + i * 300 }) }));
  h.advance(40);
  const fr = h.got('p0', 'fr');
  assert.equal(fr.length, 1);
  assert.equal(fr[0].b.length, 19, 'the other 19');
  const { reliable, ...msg } = fr[0];
  const frBytes = JSON.stringify(msg).length;
  assert.ok(snapBytes < 3500, 'snapshot ' + snapBytes + ' bytes');
  assert.ok(frBytes < 3600, 'relay ' + frBytes + ' bytes');
  // each page sends 20 poses a second: the relay forwards them at the server's 30 Hz tick, two ticks in three on average
  const perSecond = snapBytes * 15 + frBytes * 20;
  console.log('# 20 players (and the AI commander) in one ship: snapshot', snapBytes, 'bytes (b list', bBytes + '), pose relay', frBytes, 'bytes for 19 bodies;',
    '≈', Math.round(perSecond / 1024), 'KiB/s down per player (snapshots at 15 Hz + relays at 20 Hz)');
});

test("damage a page took from another player's effect is credited to them, and only after such an effect", () => {
  const { h, ship } = crew();
  const a = h.aboard('r0', ship, [0, 0, -4]), b = h.aboard('s0', ship, [0, 0, -7]), mate = h.aboard('r1', ship, [2, 0, -4]);
  // a defender (on its own ship) may not report damage out of nowhere, nor name a player who did nothing to it
  h.clear();
  assert.equal(h.send('s0', { c: 'npc', kind: 'hurt', dmg: 10 }), false, 'no NPCs on its own ship');
  h.advance(2100);
  assert.equal(h.send('s0', { c: 'npc', kind: 'hurt', dmg: 10, by: a.eid }), false, 'r0 put no effect on it');
  assert.equal(b.body.hp, BODY.hp);
  // r0 pushes s0; s0's page resolves it and reports what the knock cost, naming r0
  h.send('r0', { c: 'fx', to: b.eid, k: 'throw', a: [{ from: { $f: a.eid }, pull: false, lv: 3, dir: [0, 0, -1], dist: 3, charge: 1 }] });
  h.clear();
  assert.equal(h.send('s0', { c: 'npc', kind: 'hurt', dmg: 16, by: a.eid }), true);
  h.advance(40);
  assert.equal(b.body.hp, BODY.hp - 16);
  assert.equal(a.stats.damage, 16, 'credited to the pusher');
  assert.ok(h.got('r0', 'fe').flatMap(m => m.ev).some(e => e.e === 'hit' && e.target === b.eid && e.dmg === 16), 'who is told of the hit');
  const hurt = h.got('s0', 'fe').flatMap(m => m.ev).find(e => e.e === 'hurt');
  assert.equal(hurt.self, 1, "marked as the victim's own report (its page has shown it already)");
  // at most a Force hit per report; nothing for a third player who did nothing; nothing once the effect is old
  assert.equal(h.send('s0', { c: 'npc', kind: 'hurt', dmg: 500, by: a.eid }), true);
  assert.equal(b.body.hp, BODY.hp - 16 - BODY.hitCaps.force);
  h.advance(2100);
  assert.equal(h.send('s0', { c: 'npc', kind: 'hurt', dmg: 5, by: mate.eid }), false);
  h.advance(RELAY.creditMs);
  assert.equal(h.send('s0', { c: 'npc', kind: 'hurt', dmg: 5, by: a.eid }), false, 'too long after the push');
  // a fall to the end: the defeat is the pusher's
  h.send('r0', { c: 'fx', to: b.eid, k: 'throw', a: [{ from: { $f: a.eid }, pull: false, lv: 3, dir: [0, 0, -1], dist: 3, charge: 1 }] });
  for (let i = 0; i < 4 && b.body.alive; i++) h.send('s0', { c: 'npc', kind: 'hurt', dmg: 40, by: a.eid });
  h.advance(40);
  assert.equal(b.body.alive, false);
  assert.equal(a.stats.kills, 1);
  assert.ok(h.got('r0', 'fe').flatMap(m => m.ev).some(e => e.e === 'down' && e.victim === b.eid && e.killer === a.eid));
});

test("the relay follows each body's level: a trooper shows no lightsaber, holds no power, and casts no Force effect", () => {
  const { h, ship } = crew();
  const trooper = h.aboard('r0', ship, [0, 0, -4], 'trooper'), heavy = h.aboard('r1', ship, [2, 0, -4], 'heavy');
  const jedi = h.aboard('s0', ship, [0, 0, -8], 'jedi');
  const F = Object.fromEntries(POSE_FIELDS.map(([k], i) => [k, i]));
  // a trooper's page claims a lit, thrown saber and a held grip: the others see a holstered blaster carrier, holding nothing
  h.clear();
  h.send('r0', { c: 'st', s: [...pose({ flags: POSE_FLAGS.lit | POSE_FLAGS.onGround, hilt: 2, hold: 1, target: jedi.eid, timed: 3, gripBase: 3 }), 120, 110, -620, 3000] });
  h.advance(40);
  const e = relayed(h, 's0')[0], ps = e.slice(5);
  assert.equal(e[1], TIER_LEVEL_CODES.trooper);
  assert.equal(ps.length, POSE_FIELDS.length, 'no thrown saber');
  assert.equal(ps[F.flags] & POSE_FLAGS.lit, 0, 'no blade lit'); assert.ok(ps[F.flags] & POSE_FLAGS.holstered);
  assert.ok(ps[F.flags] & POSE_FLAGS.onGround, 'the rest of the flags stay');
  assert.equal(POSE_HILTS[ps[F.hilt]], 'none');
  for (const k of ['hold', 'target', 'timed', 'gripBase']) assert.equal(ps[F[k]], 0, k);
  assert.equal(ps[F.legs], pose()[F.legs], 'its animation still goes through');
  // a Jedi's own pose keeps all of it
  h.clear(); h.send('s0', { c: 'st', s: pose({ hold: 1, target: trooper.eid }) }); h.advance(40);
  assert.equal(relayed(h, 'r0')[0].slice(5)[F.hold], 1); assert.equal(relayed(h, 'r0')[0].slice(5)[F.target], trooper.eid);
  // effects: what the kit lacks is refused
  const tries = [
    ['r0', { to: jedi.eid, k: 'throw', a: [{ pull: false }] }, false], ['r0', { to: jedi.eid, k: 'push', a: [[0, 0, -1], 9] }, false],
    ['r0', { k: 'cast', a: ['push', [0, 0, -1]] }, false], ['r0', { k: 'hit', a: [[0, 1, -6], 0, 0] }, true],
    ['r1', { to: jedi.eid, k: 'grip', a: [true, 1.4, {}] }, false], ['r1', { to: jedi.eid, k: 'push', a: [[0, 0, -1], 9] }, true], // a grenade's knock
    ['r1', { to: jedi.eid, k: 'blocked', a: ['BOUNCE'] }, false],
    ['s0', { to: trooper.eid, k: 'grip', a: [true, 1.4, {}] }, true], ['s0', { to: heavy.eid, k: 'throw', a: [{ pull: true }] }, true],
  ];
  for (const [id, msg, ok] of tries) {
    h.clear(); h.advance(2100);
    assert.equal(h.send(id, { c: 'fx', ...msg }), ok, id + ' ' + msg.k);
    h.advance(40);
    if (!ok) assert.deepEqual(h.denied(id, 'fx').map(x => x.why), ['not with this kit'], id + ' ' + msg.k);
  }
});
