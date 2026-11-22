import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPANSION_HEROES, EXPANSION_HERO_IDS, expansionHero, expansionMove } from '../src/components/duelist/sim/expansionHeroKits.mjs';
import { parseExpansionHeroPacket, reserveExpansionHeroCast } from '../src/components/duelist/sim/expansionHeroAuthority.mjs';

const make = (heroId = 'skadi') => {
  const actor = { id: 'p1', team: 'blue', expansionHeroId: heroId, hp: 100, maxHp: 100,
    position: { x: 0, z: 0 }, specialMeter: 100, cooldowns: {} };
  const foe = { id: 'p2', team: 'red', hp: 100, maxHp: 100, position: { x: 0, z: 2 } };
  const ally = { id: 'p3', team: 'blue', hp: 65, maxHp: 100, position: { x: 0, z: 1 } };
  const match = { phase: 'live', seats: new Map([['p1', { kind: 'player', expansionHeroId: heroId }]]),
    world: { fighters: new Map([['p1', actor], ['p2', foe], ['p3', ally]]) } };
  return { match, actor, foe, ally };
};
const packet = (abilityId, extra = {}) => ({ type: 'expansion.ability', abilityId, ...extra });
const geometry = () => ({ allowed: true, endpoint: { x: 1, z: 1 } });
const cast = (fx, abilityId, extra = {}, options = {}) => reserveExpansionHeroCast({
  match: fx.match, verifiedSeatId: 'p1', packet: packet(abilityId, extra), now: 10,
  clearSight: () => true, resolveGeometry: geometry, ...options,
});
function validExtra(move) {
  const extra = {};
  if (move.target === 'enemy') extra.targetId = 'p2';
  if (move.target === 'ally') extra.targetId = 'p3';
  if (move.target === 'wall') extra.wallId = 'wall-12';
  if (move.directions) extra.direction = move.directions[0];
  return extra;
}

test('six isolated draft heroes, four unique basics and server-priced ultimate each', () => {
  assert.deepEqual(EXPANSION_HERO_IDS, ['skadi', 'tyr', 'susanoo', 'hekate', 'gaia', 'sniper']);
  assert.ok(EXPANSION_HERO_IDS.every(id => !['warrior', 'duelist', 'assassin', 'healer'].includes(id)));
  for (const kit of Object.values(EXPANSION_HEROES)) {
    assert.equal(kit.abilities.length, 4);
    assert.equal(new Set(kit.abilities.map(a => a.id)).size, 4);
    assert.equal(kit.ultimate.cost, 100);
    assert.ok(Object.isFrozen(kit) && Object.isFrozen(kit.abilities));
    assert.equal(expansionHero(kit.id), kit);
    assert.equal(expansionMove(kit.id, kit.ultimate.id), kit.ultimate);
  }
  for (const bad of ['__proto__', 'constructor', 'warrior', 3, null]) assert.equal(expansionHero(bad), null);
});

test('all 30 moves reserve trusted intents and never apply combat damage directly', () => {
  for (const kit of Object.values(EXPANSION_HEROES)) {
    for (const move of [...kit.abilities, kit.ultimate]) {
      const fx = make(kit.id), result = cast(fx, move.id, validExtra(move));
      assert.equal(result.accepted, true, kit.id + '.' + move.id + ': ' + result.reason);
      assert.ok(result.intents.length > 0);
      assert.equal(result.heroId, kit.id);
      assert.equal(fx.actor.specialMeter, move.cost === 100 ? 0 : 100);
      assert.equal(fx.actor.cooldowns[move.id], 10 + move.cooldown);
      assert.equal(fx.foe.hp, 100, 'world fairplay adapter must apply damage separately');
    }
  }
});

test('packets cannot spoof class, meter, damage, identity, animation or coordinates', () => {
  for (const extra of [{ heroId: 'tyr' }, { classId: 'warrior' }, { specialMeter: 100 },
    { damage: 999 }, { hp: 999 }, { team: 'red' }, { position: { x: 9, z: 9 } },
    { cooldowns: {} }, { now: 1 }, { seatId: 'p2' }, { animation: 'win' }, { slot: 0 }]) {
    assert.equal(parseExpansionHeroPacket(packet('wolfShift', extra)).ok, false);
  }
  assert.equal(parseExpansionHeroPacket({ type: 'expansion.ability' }).ok, false);
  assert.equal(cast(make(), 'wolfShift', { specialMeter: 100 }).reason, 'invalid-packet');
});

test('verified human, correct hero, alive actor and live match are mandatory', () => {
  const fx = make('tyr');
  assert.equal(cast(fx, 'stunCombo', { targetId: 'p2' }, { verifiedSeatId: 'other' }).reason, 'invalid-actor');
  fx.match.seats.get('p1').kind = 'bot';
  assert.equal(cast(fx, 'stunCombo', { targetId: 'p2' }).reason, 'invalid-actor');
  fx.match.seats.get('p1').kind = 'player';
  fx.actor.expansionHeroId = 'sniper';
  assert.equal(cast(fx, 'stunCombo', { targetId: 'p2' }).reason, 'invalid-actor');
  fx.actor.expansionHeroId = 'tyr'; fx.actor.hp = 0;
  assert.equal(cast(fx, 'stunCombo', { targetId: 'p2' }).reason, 'invalid-actor');
  fx.actor.hp = 100; fx.match.phase = 'countdown';
  assert.equal(cast(fx, 'stunCombo', { targetId: 'p2' }).reason, 'invalid-authority');
});

test('range, team safety, invulnerability, line of sight and targets fail closed without spending', () => {
  const fx = make('sniper');
  for (const [extra, opt, reason] of [
    [{ targetId: 'p1' }, {}, 'friendly-target'],
    [{ targetId: 'p3' }, {}, 'friendly-target'],
    [{ targetId: 'missing' }, {}, 'invalid-target'],
    [{ targetId: 'p2' }, { clearSight: () => false }, 'blocked-sight'],
    [{ targetId: 'p2', direction: 'forward' }, {}, 'invalid-direction'],
    [{}, {}, 'invalid-target-request'],
  ]) {
    assert.equal(cast(fx, 'aimedShot', extra, opt).reason, reason);
    assert.deepEqual(fx.actor.cooldowns, {});
    assert.equal(fx.actor.specialMeter, 100);
  }
  fx.foe.protectedUntil = 20;
  assert.equal(cast(fx, 'aimedShot', { targetId: 'p2' }).reason, 'protected-target');
  fx.foe.protectedUntil = -Infinity; fx.foe.position.z = 39;
  assert.equal(cast(fx, 'aimedShot', { targetId: 'p2' }).reason, 'out-of-range');
  assert.equal(cast(make('gaia'), 'touchHeal', { targetId: 'p2' }).reason, 'enemy-target');
});

test('server meter 0-100, cooldowns and NaN corruption reject safely', () => {
  const fx = make('tyr');
  fx.actor.specialMeter = 99;
  assert.equal(cast(fx, 'enchant').reason, 'not-charged');
  fx.actor.specialMeter = 100;
  assert.equal(cast(fx, 'enchant').accepted, true);
  assert.equal(fx.actor.specialMeter, 0);
  fx.actor.cooldowns.stunCombo = 15;
  assert.equal(cast(fx, 'stunCombo', { targetId: 'p2' }).reason, 'cooldown');
  fx.actor.cooldowns.stunCombo = NaN;
  assert.equal(cast(fx, 'stunCombo', { targetId: 'p2' }).reason, 'invalid-cooldown');
  fx.actor.cooldowns = null;
  assert.equal(cast(fx, 'stunCombo', { targetId: 'p2' }).reason, 'invalid-actor');
  fx.actor.cooldowns = {}; fx.actor.specialMeter = Infinity;
  assert.equal(cast(fx, 'stunCombo', { targetId: 'p2' }).reason, 'invalid-actor');
});

test('Skadi wolf/human/spirit exits, five-direction leap and return after wolf freeze', () => {
  const fx = make('skadi');
  cast(fx, 'wolfShift');
  assert.equal(fx.actor.heroForm, 'wolf');
  assert.equal(cast(fx, 'exit', { direction: 'left' }).intents[0].kind, 'dodge');
  assert.equal(fx.actor.heroForm, 'human');
  fx.actor.cooldowns.exit = 0;
  assert.equal(cast(fx, 'exit', { direction: 'left' }).intents[0].projectile, 'frostArrow');
  fx.actor.cooldowns.exit = 0;
  cast(fx, 'exit', { direction: 'right' });
  assert.equal(fx.actor.heroForm, 'spirit');
  fx.actor.cooldowns.exit = 0;
  assert.equal(cast(fx, 'exit', { direction: 'neutral' }).intents[0].kind, 'cancel');
  assert.equal(fx.actor.cooldowns.exit, 0);
  assert.equal(cast(fx, 'spiritWolf').intents[0].kind, 'freezeArea');
  assert.equal(fx.actor.heroForm, 'human');
  for (const direction of ['forward', 'back', 'left', 'right', 'up']) {
    assert.equal(cast(make('skadi'), 'directionalLeap', { direction }).accepted, true);
  }
});

test('Tyr Enchant upgrades combo, launch, Vapor and sweep', () => {
  const fx = make('tyr');
  assert.equal(cast(make('tyr'), 'stunCombo', { targetId: 'p2' }).intents[0].hits, 2);
  cast(fx, 'enchant');
  assert.equal(fx.actor.enchantedUntil, 17);
  assert.equal(cast(fx, 'stunCombo', { targetId: 'p2' }).intents[0].hits, 3);
  assert.equal(cast(fx, 'skyBreaker', { targetId: 'p2' }).intents[0].aerial, true);
  assert.equal(cast(fx, 'warriorsVapor').intents[0].mitigation, 0.35);
  assert.equal(cast(fx, 'sweepingBlade').intents[0].radius, 5.5);
});

test('Susanoo compass pushes and ultimate boosts Ride with Wind', () => {
  for (const direction of ['forward', 'back', 'left', 'right']) {
    const fx = make('susanoo');
    assert.equal(cast(fx, 'rideWind', { direction }).intents[0].distance, 5);
    assert.equal(cast(fx, 'risingDragon', { direction }).intents[0].direction, direction);
    fx.actor.cooldowns.rideWind = 0;
    assert.equal(cast(fx, 'rideWind', { direction }).intents[0].distance, 12);
    assert.equal(cast(fx, 'delayedStrike', { targetId: 'p2' }).intents[0].delay, 1.4);
  }
});

test('Hekate requires safe geometry for wall portals; summons and stat transfer are bounded intents', () => {
  const fx = make('hekate');
  assert.equal(cast(fx, 'wallPortal', { wallId: 'wall-12' }, { resolveGeometry: undefined }).reason, 'geometry-unavailable');
  assert.equal(cast(fx, 'wallPortal', { wallId: 'wall-12' }, { resolveGeometry: () => ({ allowed: false }) }).reason, 'blocked-geometry');
  assert.deepEqual(fx.actor.cooldowns, {});
  assert.equal(cast(fx, 'wallPortal', { wallId: 'wall-12' }).intents[0].alliedUse, true);
  assert.equal(cast(fx, 'summonMinion').intents[0].unit, 'helheimWraith');
  const enhancement = cast(fx, 'enhance', { targetId: 'p2', allyId: 'p3' }).intents[0];
  assert.equal(enhancement.attackFraction, 0.1);
  assert.equal(enhancement.distribution, 'chosen-ally');
  assert.equal(cast(fx, 'veilPassage', { wallId: 'wall-12' }).intents[0].phaseThroughWalls, true);
});

test('Gaia roots, mitigates, touch-heals and creates concealing greenery intentions', () => {
  const fx = make('gaia');
  assert.equal(cast(fx, 'thornSnare', { targetId: 'p2' }).intents[0].kind, 'root');
  assert.equal(cast(fx, 'earthShield').intents[0].mitigation, 0.25);
  assert.equal(cast(fx, 'touchHeal', { targetId: 'p3' }).intents[0].allyHeal, 24);
  assert.equal(cast(fx, 'earthWall', { wallId: 'wall-12' }).intents[0].kind, 'earthWall');
  assert.equal(cast(fx, 'oneWithPlanet').intents[0].foliageConcealment, true);
  assert.equal(cast(make('gaia'), 'oneWithPlanet').intents[0].scope, 'battlefield');
  fx.ally.position.z = 4;
  assert.equal(cast(fx, 'touchHeal', { targetId: 'p3' }, { now: 23 }).reason, 'out-of-range');
});

test('Sniper shots and mark are server-owned intentions, not direct target damage', () => {
  const fx = make('sniper');
  assert.equal(cast(fx, 'aimedShot', { targetId: 'p2' }, { clearSight: undefined }).reason, 'blocked-sight');
  assert.equal(cast(fx, 'aimedShot', { targetId: 'p2' }).intents[0].damage, 33);
  assert.equal(cast(fx, 'markTarget', { targetId: 'p2' }).intents[0].kind, 'mark');
  assert.equal(cast(fx, 'relocate', { direction: 'back' }).intents[0].distance, 7);
  assert.equal(cast(fx, 'suppress').intents[0].kind, 'trap');
  assert.equal(cast(fx, 'deadeye', { targetId: 'p2' }).intents[0].maxTargets, 3);
  assert.equal(fx.foe.hp, 100);
});
