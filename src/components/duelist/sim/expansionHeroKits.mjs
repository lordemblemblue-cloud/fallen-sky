// Future Duelist Adventure hero roster. Separate from the four playable CLASSES.
const ability = (id, name, cooldown, target, range = 0, directions = null) => Object.freeze({
  id, name, cooldown, target, range, directions: directions ? Object.freeze(directions) : null,
});
const hero = (id, name, role, abilities, ultimate, notes) => Object.freeze({
  id, name, role, abilities: Object.freeze(abilities),
  ultimate: Object.freeze({ ...ultimate, cooldown: 0, cost: 100 }), notes,
});
const COMPASS = Object.freeze(['forward', 'back', 'left', 'right']);
const LEAP = Object.freeze([...COMPASS, 'up']);
const EXIT = Object.freeze([...COMPASS, 'neutral']);
// Provisional tuning, NOT approved balance or character animation implementation.
export const EXPANSION_HEROES = Object.freeze({
  skadi: hero('skadi', 'Skadi (Scotty)', 'mobile-tank', [
    ability('wolfShift', 'Wolf Form', 12, 'self'),
    ability('directionalLeap', 'Wolf Leap', 8, 'self', 0, LEAP),
    ability('exit', 'Exit', 7, 'self', 0, EXIT),
    ability('iceSpear', 'Frost Spear', 10, 'enemy', 11),
  ], { id: 'spiritWolf', name: 'Spirit Wolf', target: 'area' },
  'Exit-left in wolf form dodges; Exit-left in human/spirit form fires an arrow. Neutral cancels without a cooldown. Provisional resolution of two left-direction descriptions.'),
  tyr: hero('tyr', 'Tyr', 'tank', [
    ability('stunCombo', 'Judgment Combo', 10, 'enemy', 3),
    ability('skyBreaker', 'Sky Breaker', 11, 'enemy', 3),
    ability('warriorsVapor', "Warrior's Vapor", 15, 'self'),
    ability('sweepingBlade', 'Warrior Sweep', 9, 'area'),
  ], { id: 'enchant', name: 'Enchant', target: 'self' },
  'Enchant empowers stun/knock-up aerial finishers and broadens sweep. Vapor mitigates damage and heals for prevented damage plus a base heal.'),
  susanoo: hero('susanoo', 'Susanoo', 'wind-duelist', [
    ability('rideWind', 'Ride with the Wind', 8, 'self', 0, COMPASS),
    ability('delayedStrike', 'Delayed Strike', 11, 'enemy', 5),
    ability('windStun', 'Wind Stun', 10, 'enemy', 3),
    ability('stormTempo', 'Storm Tempo', 15, 'self'),
  ], { id: 'risingDragon', name: 'Tornado Rising Dragon', target: 'area', directions: COMPASS },
  'Wind ultimate pushes along the sword direction and strengthens Ride with the Wind. Spoken callout/localization is a later asset.'),
  hekate: hero('hekate', 'Hekate', 'support-controller', [
    ability('wallPortal', 'Crosswall Portal', 14, 'wall'),
    ability('elementalHex', 'Elemental Hex', 11, 'enemy', 10),
    ability('summonMinion', 'Helheim Summon', 18, 'area'),
    ability('enhance', 'Enhance', 20, 'enemy', 9),
  ], { id: 'veilPassage', name: 'Veil Passage', target: 'wall' },
  'The host validates traversable walls. Allies can use portals. Enhance temporarily transfers bounded enemy stats to allies.'),
  gaia: hero('gaia', 'Mother Gaia', 'boxing-tank', [
    ability('thornSnare', 'Thorn Snare', 11, 'enemy', 7),
    ability('earthShield', 'Earth Shield', 15, 'self'),
    ability('touchHeal', 'Earthbound Mend', 12, 'ally', 1.75),
    ability('earthWall', 'Protective Grounds', 17, 'wall'),
  ], { id: 'oneWithPlanet', name: 'One with the Planet', target: 'area' },
  'Heavy boxing combos are intended basic attacks. Gaia zone provides greenery concealment, regeneration, and mitigation.'),
  sniper: hero('sniper', 'The Sniper', 'ranged-damage', [
    ability('aimedShot', 'Aimed Shot', 8, 'enemy', 38),
    ability('markTarget', 'Hunting Mark', 10, 'enemy', 38),
    ability('relocate', 'Relocate', 9, 'self', 0, COMPASS),
    ability('suppress', 'Suppression Trap', 15, 'area'),
  ], { id: 'deadeye', name: 'Deadeye', target: 'enemy', range: 45 },
  'Long-range marksman, not a tank. Marked targets take bonus precision damage; every shot requires authoritative line of sight.'),
});
export const EXPANSION_HERO_IDS = Object.freeze(Object.keys(EXPANSION_HEROES));
export const expansionHero = id => (typeof id === 'string' && Object.hasOwn(EXPANSION_HEROES, id) ? EXPANSION_HEROES[id] : null);
export const expansionMove = (heroId, moveId) => {
  const kit = expansionHero(heroId);
  if (!kit || typeof moveId !== 'string') return null;
  return kit.ultimate.id === moveId ? kit.ultimate : kit.abilities.find(a => a.id === moveId) ?? null;
};
