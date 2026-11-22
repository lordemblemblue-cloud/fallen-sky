// Transport-neutral server-owned action-intent engine for FUTURE Duelist Adventure heroes.
// The caller MUST derive verifiedSeatId from an authenticated connection and provide trusted match state.
// This does not settle damage, movement, summons or portals; those need a reviewed authoritative world adapter.
import { expansionHero, expansionMove } from './expansionHeroKits.mjs';

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const safeId = id => typeof id === 'string' && id.length > 0 && id.length <= 128;
const point = p => p && finite(p.x) && finite(p.z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ALLOWED_KEYS = new Set(['type', 'abilityId', 'direction', 'targetId', 'wallId', 'allyId']);

export function parseExpansionHeroPacket(packet) {
  if (!plain(packet) || packet.type !== 'expansion.ability' || !safeId(packet.abilityId) ||
      Object.keys(packet).some(key => !ALLOWED_KEYS.has(key))) return { ok: false, reason: 'invalid-packet' };
  for (const key of ['direction', 'targetId', 'wallId', 'allyId']) {
    if (own(packet, key) && !safeId(packet[key])) return { ok: false, reason: 'invalid-packet' };
  }
  return { ok: true, abilityId: packet.abilityId, direction: packet.direction,
    targetId: packet.targetId, wallId: packet.wallId, allyId: packet.allyId };
}

function resolveTarget(match, targetId, actor, side, range, now, clearSight) {
  const target = match?.world?.fighters?.get?.(targetId);
  if (!target || !point(target.position) || !finite(target.hp) || target.hp <= 0 ||
      !finite(target.maxHp) || target.maxHp <= 0 || target.hp > target.maxHp ||
      !safeId(target.id) || !safeId(target.team)) return { ok: false, reason: 'invalid-target' };
  if (side === 'enemy' && (target.team === actor.team || target.id === actor.id)) return { ok: false, reason: 'friendly-target' };
  if (side === 'ally' && target.team !== actor.team) return { ok: false, reason: 'enemy-target' };
  if (dist(actor.position, target.position) > range) return { ok: false, reason: 'out-of-range' };
  if (side === 'enemy' && (target.invulnerable ||
      (target.protectedUntil != null && target.protectedUntil !== -Infinity &&
       (!finite(target.protectedUntil) || target.protectedUntil > now)))) return { ok: false, reason: 'protected-target' };
  if (side === 'enemy' && (!clearSight || clearSight(actor, target) !== true)) return { ok: false, reason: 'blocked-sight' };
  return { ok: true, target };
}

// This output is an INTENT only. Fair-play combat and navigation are solely responsible for resolving effects.
function effectsFor(heroId, id, direction, form, enchanted, windborne, targetId, allyId) {
  switch (heroId + '.' + id) {
    case 'skadi.wolfShift': return [{ kind: 'transform', form: form === 'wolf' ? 'human' : 'wolf' }];
    case 'skadi.directionalLeap': return [{ kind: 'leap', direction, distance: 6, height: direction === 'up' ? 4 : 1.4 }];
    case 'skadi.exit': {
      if (direction === 'neutral') return [{ kind: 'cancel' }];
      if (direction === 'right') return [{ kind: 'transform', form: 'spirit' }, { kind: 'phase', duration: 1.5 }];
      if (direction === 'left' && form === 'wolf') return [{ kind: 'dodge', distance: 4 }, { kind: 'transform', form: 'human' }];
      if (direction === 'left') return [{ kind: 'projectile', projectile: 'frostArrow', damage: 18 }];
      if (direction === 'back') return [{ kind: 'retreat', distance: 5 }, { kind: 'iceTrail', duration: 3.5, slow: 0.3 },
        { kind: 'transform', form: 'human' }];
      return [{ kind: 'spearThrust', damage: 26, reach: 3 }, { kind: 'transform', form: 'human' }];
    }
    case 'skadi.iceSpear': return [{ kind: 'hit', targetId, damage: 18 }, { kind: 'slow', targetId, factor: 0.7, duration: 2 }];
    case 'skadi.spiritWolf': return [{ kind: 'freezeArea', radius: 7, duration: 2.2, damage: 20 }, { kind: 'transform', form: 'human' }];
    case 'tyr.stunCombo': return [{ kind: 'combo', targetId, hits: enchanted ? 3 : 2, hitDamage: 11, stun: 0.7, aerial: enchanted }];
    case 'tyr.skyBreaker': return [{ kind: 'launch', targetId, height: enchanted ? 4 : 2.4, damage: 20, aerial: enchanted }];
    case 'tyr.warriorsVapor': return [{ kind: 'vapor', duration: 4, mitigation: enchanted ? 0.35 : 0.2,
      baseHeal: enchanted ? 18 : 12, healForPreventedDamage: true }];
    case 'tyr.sweepingBlade': return [{ kind: 'sweep', radius: enchanted ? 5.5 : 3, arcDegrees: enchanted ? 270 : 150, damage: 20 }];
    case 'tyr.enchant': return [{ kind: 'enchant', duration: 7 }];
    case 'susanoo.rideWind': return [{ kind: 'windDash', direction, distance: windborne ? 12 : 5, ignoreSlow: windborne }];
    case 'susanoo.delayedStrike': return [{ kind: 'delayedHit', targetId, delay: 1.4, damage: 32, stun: 0.25 }];
    case 'susanoo.windStun': return [{ kind: 'hit', targetId, damage: 13 }, { kind: 'stun', targetId, duration: 0.8 }];
    case 'susanoo.stormTempo': return [{ kind: 'attackBuff', duration: 5, attackRate: 1.3, damageMultiplier: 1.15 }];
    case 'susanoo.risingDragon': return [{ kind: 'windPush', direction, radius: 7, pushDistance: 8, damage: 22 },
      { kind: 'windborne', duration: 8 }];
    case 'hekate.wallPortal': return [{ kind: 'portal', wall: 'validated', duration: 8, alliedUse: true, charges: 1 }];
    case 'hekate.elementalHex': return [{ kind: 'damageOverTime', targetId, damagePerTick: 6, ticks: 4, everySeconds: 1 }];
    case 'hekate.summonMinion': return [{ kind: 'summon', unit: 'helheimWraith', duration: 12, damagePerHit: 6, stunSeconds: 0.4 }];
    case 'hekate.enhance': return [{ kind: 'statTransfer', targetId, allyId: allyId ?? null,
      distribution: allyId ? 'chosen-ally' : 'all-nearby-allies', duration: 5, attackFraction: 0.1, defenseFraction: 0.1 }];
    case 'hekate.veilPassage': return [{ kind: 'portal', wall: 'validated', duration: 4, alliedUse: true,
      charges: null, phaseThroughWalls: true }];
    case 'gaia.thornSnare': return [{ kind: 'root', targetId, duration: 1.6 }, { kind: 'hit', targetId, damage: 11 }];
    case 'gaia.earthShield': return [{ kind: 'earthShield', duration: 4, mitigation: 0.25 }];
    case 'gaia.touchHeal': return [{ kind: 'touchHeal', targetId, selfHeal: 16, allyHeal: 24 }];
    case 'gaia.earthWall': return [{ kind: 'earthWall', wall: 'validated', duration: 7, hp: 150 }];
    case 'gaia.oneWithPlanet': return [{ kind: 'verdantZone', radius: 9, duration: 8, healPerSecond: 6,
      mitigation: 0.3, foliageConcealment: true }];
    case 'sniper.aimedShot': return [{ kind: 'hit', targetId, damage: 33, bonusAgainstMarked: 1.25 }];
    case 'sniper.markTarget': return [{ kind: 'mark', targetId, duration: 7 }];
    case 'sniper.relocate': return [{ kind: 'dodge', direction, distance: 7 }];
    case 'sniper.suppress': return [{ kind: 'trap', radius: 3.5, duration: 8, slow: 0.4, damagePerTick: 4 }];
    case 'sniper.deadeye': return [{ kind: 'piercingShot', targetId, damage: 70, bonusAgainstMarked: 1.25,
      maxTargets: 3, reach: 45 }];
    default: return null;
  }
}

/**
 * Reserve a future hero cast using a VERIFIED seat ID from the host's authenticated connection.
 * Trusted host match contains seat.expansionHeroId and fighter hp/team/position/meter/cooldowns.
 * Geometry and LoS callbacks must use world data, never client verdicts. On success only the
 * caster's cooldown/meter/form/buff deadlines change; no target HP/world effects are applied.
 */
export function reserveExpansionHeroCast({ match, verifiedSeatId, packet, now, clearSight, resolveGeometry } = {}) {
  const parsed = parseExpansionHeroPacket(packet);
  if (!parsed.ok) return { accepted: false, reason: parsed.reason };
  if (!safeId(verifiedSeatId) || !finite(now) || now < 0 || match?.phase !== 'live' ||
      typeof match.seats?.get !== 'function' || typeof match.world?.fighters?.get !== 'function') {
    return { accepted: false, reason: 'invalid-authority' };
  }
  const seat = match.seats.get(verifiedSeatId);
  const actor = match.world.fighters.get(verifiedSeatId);
  const kit = expansionHero(seat?.expansionHeroId);
  if (!seat || seat.kind !== 'player' || !kit || !actor || actor.id !== verifiedSeatId ||
      actor.expansionHeroId !== kit.id || !safeId(actor.team) || !point(actor.position) ||
      !finite(actor.hp) || !finite(actor.maxHp) || actor.hp <= 0 || actor.hp > actor.maxHp ||
      !finite(actor.specialMeter) || actor.specialMeter < 0 || actor.specialMeter > 100 ||
      !plain(actor.cooldowns)) return { accepted: false, reason: 'invalid-actor' };
  const move = expansionMove(kit.id, parsed.abilityId);
  if (!move) return { accepted: false, reason: 'not-in-kit' };
  const ultimate = kit.ultimate.id === move.id;
  if ((move.directions && !move.directions.includes(parsed.direction)) ||
      (!move.directions && parsed.direction !== undefined)) return { accepted: false, reason: 'invalid-direction' };
  const requiresTarget = move.target === 'enemy' || move.target === 'ally';
  if ((requiresTarget && !parsed.targetId) || (!requiresTarget && parsed.targetId) ||
      (parsed.allyId && !(kit.id === 'hekate' && move.id === 'enhance')) ||
      ((move.target === 'wall') !== !!parsed.wallId)) return { accepted: false, reason: 'invalid-target-request' };
  const until = own(actor.cooldowns, move.id) ? actor.cooldowns[move.id] : 0;
  if (!finite(until) || until < 0) return { accepted: false, reason: 'invalid-cooldown' };
  if (until > now) return { accepted: false, reason: 'cooldown' };
  if (ultimate && actor.specialMeter < move.cost) return { accepted: false, reason: 'not-charged' };

  let target = null;
  if (requiresTarget) {
    const result = resolveTarget(match, parsed.targetId, actor, move.target, move.range, now, clearSight);
    if (!result.ok) return { accepted: false, reason: result.reason };
    target = result.target;
  }
  if (parsed.allyId) {
    const ally = resolveTarget(match, parsed.allyId, actor, 'ally', 9, now, clearSight);
    if (!ally.ok) return { accepted: false, reason: ally.reason };
  }
  const needsGeometry = move.target === 'wall' || move.id === 'directionalLeap' || move.id === 'rideWind' ||
    move.id === 'relocate' || (kit.id === 'skadi' && move.id === 'exit' && ['back', 'left'].includes(parsed.direction));
  let geometry = null;
  if (needsGeometry) {
    if (typeof resolveGeometry !== 'function') return { accepted: false, reason: 'geometry-unavailable' };
    geometry = resolveGeometry({ actor, moveId: move.id, direction: parsed.direction, wallId: parsed.wallId, now });
    if (!geometry || geometry.allowed !== true || !point(geometry.endpoint)) return { accepted: false, reason: 'blocked-geometry' };
  }
  const form = ['human', 'wolf', 'spirit'].includes(actor.heroForm) ? actor.heroForm : 'human';
  const enchanted = finite(actor.enchantedUntil) && actor.enchantedUntil > now;
  const windborne = finite(actor.windborneUntil) && actor.windborneUntil > now;
  const events = effectsFor(kit.id, move.id, parsed.direction, form, enchanted, windborne, target?.id, parsed.allyId);
  if (!events) return { accepted: false, reason: 'unimplemented-ability' };
  if (!(kit.id === 'skadi' && move.id === 'exit' && parsed.direction === 'neutral')) {
    actor.cooldowns[move.id] = now + move.cooldown;
  }
  if (ultimate) actor.specialMeter -= move.cost;
  for (const e of events) {
    if (e.kind === 'transform') actor.heroForm = e.form;
    if (e.kind === 'enchant') actor.enchantedUntil = now + e.duration;
    if (e.kind === 'windborne') actor.windborneUntil = now + e.duration;
  }
  return { accepted: true, heroId: kit.id, abilityId: move.id, cooldownUntil: actor.cooldowns[move.id] ?? 0,
    specialMeter: actor.specialMeter, geometry, intents: Object.freeze(events.map(e => Object.freeze({ ...e }))) };
}
