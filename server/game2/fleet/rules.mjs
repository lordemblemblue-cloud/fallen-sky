// Fleet Assault rules and tuning: every number the match uses lives here, so the owner's design document can change the
// mode without touching the simulation. Units: metres, seconds (ms where the name says so), hit points.
// Republic / Separatist and every value below are Atom X Eve inventions for this mode (see docs/game2/FLEET_ASSAULT_PLAN.md);
// Star Wars Outlaws was an inspiration for the feel of boost and dogfighting only, nothing is copied from it.

// 2: bodies report 'st' (position + pose) and 'fx' (effects on another player's fighter); the server relays 'fr' / 'ff'
export const FLEET_PROTOCOL = 2;

export const SIDES = Object.freeze(['republic', 'separatist']);
export const SIDE_INFO = Object.freeze({
  republic: { name: 'Republic', cruiser: 'Republic cruiser', code: 0 },
  // Keep the legacy wire identifier for stored saves and match protocol; the visible faction is now Empire.
  separatist: { name: 'Empire', cruiser: 'Imperial Star Destroyer', code: 1 },
});
export const enemyOf = side => (side === 'republic' ? 'separatist' : 'republic');
export const sideCode = side => SIDE_INFO[side]?.code ?? -1;

// Roles. `theater` is where the role spawns; boarding roles fly a boarding craft until they dock inside an enemy cruiser.
export const ROLES = Object.freeze({
  commander: { name: 'Jedi commander', theater: 'interior', group: 'defense', blurb: 'Leads one cruiser: watches the battle from the bridge, gives orders, and defends the ship from inside.' },
  guard: { name: 'Guard platoon', theater: 'interior', group: 'defense', blurb: 'Defends the cruiser interior beside the commander and the trooper garrison.' },
  pilot: { name: 'Starfighter pilot', theater: 'space', group: 'fleet', blurb: 'Dogfights enemy fighters and strips enemy cruiser shields and subsystems.' },
  saboteur: { name: 'Saboteur', theater: 'space', group: 'boarding', mission: 'sabotage', blurb: 'Boarding mission 1: plant charges on the weapons battery and the hyperdrive so the ship cannot fight or escape.' },
  boarder: { name: 'Boarding party', theater: 'space', group: 'boarding', mission: 'assault', blurb: 'Boarding mission 2: take the fight to the defenders head-on.' },
  strike: { name: 'Strike team', theater: 'space', group: 'boarding', mission: 'commander', blurb: 'Boarding mission 3: hunt and defeat the Jedi commander.' },
  ground: { name: 'Ground strike team', theater: 'ground', group: 'ground', blurb: 'Lands on the planet to destroy the enemy communications array.' },
});
export const ROLE_IDS = Object.freeze(Object.keys(ROLES));
export const BOARDING_ROLES = Object.freeze(['saboteur', 'boarder', 'strike']);
export const ROLE_CODES = Object.freeze(Object.fromEntries(ROLE_IDS.map((r, i) => [r, i])));

// How many humans a side may put in each role. Commanders: one per cruiser. The rest are caps, not quotas: overflow and
// "no preference" fly as pilots, so space always holds most of the side.
export function roleCaps(sideSize, cruisers) {
  const n = Math.max(1, sideSize);
  return {
    commander: cruisers,
    guard: cruisers * Math.max(1, Math.floor(n / 12)),
    saboteur: Math.max(1, Math.floor(n / 8)),
    boarder: Math.max(1, Math.floor(n / 8)),
    strike: Math.max(1, Math.floor(n / 8)),
    ground: Math.max(2, Math.min(8, Math.round(n * 0.15))),
    pilot: Infinity,
  };
}

export const MATCH = Object.freeze({
  minPlayers: 100,         // 50 pilots per side, filled by AI when human seats are empty
  maxPlayers: 100,         // 50 vs 50 human seats; extra players join a new match
  fillBots: true,
  minHumans: 1,            // humans needed before the warm-up countdown runs
  cruisersPerSide: 7,      // seven independently positioned capital ships per faction
  tickets: 400,            // fleet reinforcements per side: each pilot / boarder death costs one
  warmupMs: 15000,
  timeLimitMs: 25 * 60000,
  respawnMs: 6000,
  forfeit: true,
  forfeitMs: 60000,        // a side whose humans have all left for this long, while the other side has some, forfeits
  endLingerMs: 30000,
  tickMs: 1000 / 30,       // simulation step
  snapshotEvery: 2,        // ticks per snapshot (15 Hz)
  boardEvery: 30,          // ticks per scoreboard (1 Hz)
  cmdBudgetMs: 400,        // flight command time a client may bank (anti speed-hack, as Quake 3 clamps usercmd msec)
  maxRewindMs: 250,        // lag compensation ceiling for bolts
  interpMs: 100,           // how far behind clients draw other ships (added to the rewind)
  battlefieldRadius: 9500, // spherical arena: ships may fight above and below the cruiser shell
  edgeDps: 30,
  jumpHull: 0.25,          // a cruiser at or under 25% hull with a working hyperdrive may jump out (retreat)
  jumpSpoolMs: 20000,
  pingEveryMs: 1500,
  spendPoints: true,       // ship / trooper levels: points are spent on each deployment (Battlefront II); false = unlocked for good once reached
});

const FIGHTER = Object.freeze({
  id: 'fighter', code: 0, hull: 200, radius: 5, shieldMax: 110,
  minSpeed: 40, maxSpeed: 150, boostSpeed: 290, accel: 90, boostAccel: 230, decel: 120,
  pitchRate: 1.9, yawRate: 1.15, rollRate: 3.2,
  grip: 5.5, boostGrip: 1.6, // how fast velocity follows the nose; low while boosting = the drift
  boostMax: 100, boostDrain: 34, boostRegen: 18, boostDelay: 1.2, boostMin: 15,
  guns: [[-3.2, -0.5, -4.5], [3.2, -0.5, -4.5]],
  lasers: { interval: 0.13, damage: 8, speed: 720, life: 1.5, heat: 7, cool: 32, overheat: 100, lockout: 1.6 },
  missiles: { count: 2, lockTime: 1.2, lockCone: 0.2, lockRange: 1400, speed: 380, turn: 2.6, life: 6, damage: 75, capitalDamage: 520, cooldown: 1 },
});
const BREACHER = Object.freeze({
  ...FIGHTER, id: 'breacher', code: 1, hull: 400, radius: 7, shieldMax: 200,
  minSpeed: 30, maxSpeed: 125, boostSpeed: 240, accel: 70, boostAccel: 170,
  pitchRate: 1.3, yawRate: 0.9, rollRate: 2.2,
  guns: [], lasers: null, missiles: null, canDock: true,
});
// The owner's three ship levels (basic fighter, command ship, Jedi / dark Jedi fighter); the stats are provisional
const COMMAND = Object.freeze({
  ...FIGHTER, id: 'command', code: 2, hull: 420, radius: 7, shieldMax: 230,
  minSpeed: 35, maxSpeed: 130, boostSpeed: 250, accel: 70, boostAccel: 180,
  pitchRate: 1.4, yawRate: 0.95, rollRate: 2.4,
  guns: [[-4.2, -0.6, -5.5], [4.2, -0.6, -5.5], [-2.2, 0.8, -5.8], [2.2, 0.8, -5.8]],
  lasers: { ...FIGHTER.lasers, interval: 0.1, damage: 10, heat: 6 },
  missiles: { ...FIGHTER.missiles, count: 4, capitalDamage: 600 },
});
const JEDI = Object.freeze({
  ...FIGHTER, id: 'jedi', code: 3, hull: 240, radius: 4.5, shieldMax: 150,
  minSpeed: 50, maxSpeed: 175, boostSpeed: 340, accel: 120, boostAccel: 280,
  pitchRate: 2.4, yawRate: 1.5, rollRate: 3.8,
  boostMax: 130,
  lasers: { ...FIGHTER.lasers, interval: 0.12, damage: 11 },
  missiles: { ...FIGHTER.missiles, lockTime: 0.7 }, // the Force guides the lock
});
export const SHIP_CLASSES = Object.freeze({ fighter: FIGHTER, breacher: BREACHER, command: COMMAND, jedi: JEDI });
export const CLASS_BY_CODE = Object.freeze([FIGHTER, BREACHER, COMMAND, JEDI]);
// Shields are onboard every class at launch; one server-validated ability
// refreshes the shield pool after damage. No paid ship tier is required.
export const SHIP_SHIELD_SKILL = Object.freeze({ cooldownMs: 18000, restoreFraction: 0.72 });
export const classForRole = role => (BOARDING_ROLES.includes(role) ? BREACHER : FIGHTER);

// Progression (the owner's design, 2026-10-17, after Battlefront II): points earned in the match buy a better ship or
// trooper when you (re)deploy, on a selection screen that shows each option's cost. Three levels each. Every cost and
// kill requirement is provisional: the owner said they would send the costs.
export const PROGRESSION = Object.freeze({
  pointsPerScore: 1,  // points earned per score point (SCORE below)
  startPoints: 0,
});
export const SHIP_TIERS = Object.freeze([
  { id: 'fighter', level: 1, cls: 'fighter', cost: 0, kills: 0, name: { republic: 'Starfighter', separatist: 'Starfighter' } },
  { id: 'command', level: 2, cls: 'command', cost: 800, kills: 3, name: { republic: 'Command ship', separatist: 'Command ship' } },
  { id: 'jedi', level: 3, cls: 'jedi', cost: 2000, kills: 8, name: { republic: 'Jedi starfighter', separatist: 'Dark Jedi starfighter' } },
]);
// Infantry levels for everyone who fights on foot (boarding parties, guards, the ground team). `kinds` are the hit
// reports the server accepts from that kit; the commander is always a Jedi.
export const TROOPER_TIERS = Object.freeze([
  { id: 'trooper', level: 1, cost: 0, kills: 0, hp: 100, shield: 0, kinds: ['bolt'], name: { republic: 'Trooper', separatist: 'Trooper' }, kit: 'Blaster' },
  { id: 'heavy', level: 2, cost: 600, kills: 2, hp: 100, shield: 100, kinds: ['bolt', 'explosion'], name: { republic: 'Heavy trooper', separatist: 'Heavy trooper' }, kit: 'Grenade launcher, personal shield' },
  { id: 'jedi', level: 3, cost: 1500, kills: 6, hp: 100, shield: 50, kinds: ['saber', 'force', 'bolt'], name: { republic: 'Jedi', separatist: 'Dark Jedi' }, kit: 'Lightsaber, Force' },
]);
export const TIER_LEVEL_CODES = Object.freeze({ trooper: 1, heavy: 2, jedi: 3, commander: 4 });
export const PERSONAL_SHIELD = Object.freeze({ regenPerSec: 10, delayMs: 5000 });

// Capital ships. A cruiser is a yaw-oriented box (long axis = local Z); hardpoints and the hangar are in its local frame.
export const CRUISER = Object.freeze({
  hull: 30000, shields: 8000, shieldRegen: 90, shieldDelayMs: 10000,
  half: [70, 45, 260],
  laserArmor: 0.5,       // fighter lasers do half damage against capital shields and hull
  subsystemShare: 0.5,   // a hit on a hardpoint (shields down) also takes this share off the hull
  subsystems: {
    weapons: { name: 'Weapons battery', hp: 3200, at: [0, 46, 70], r: 30 },
    shields: { name: 'Shield generator', hp: 2600, at: [0, 50, -120], r: 28 },
    hyperdrive: { name: 'Hyperdrive', hp: 3000, at: [0, 0, 250], r: 34 },
    comms: { name: 'Communications', hp: 2000, at: [0, 62, -30], r: 22 },
  },
  hangar: [0, -48, 0],   // where fighters launch from, under the hull
  // The hangar bay (the owner's design, 2026-10-18: "you have to fly inside the ship ... a force field ... you get to a
  // certain point and it loads up the inside of the ship"): a tunnel through the hull at mid-length, open at both sides
  // behind a force field. A boarding craft that reaches the trigger, deep inside, boards and the interior loads.
  bay: { center: [0, -20, 0], half: [70, 15, 35], trigger: 25 },
  turrets: [[-72, 30, -180], [72, 30, -180], [-72, 30, -40], [72, 30, -40], [-72, 30, 100], [72, 30, 100], [0, -46, -200], [0, -46, 160], [-30, 46, -200], [30, 46, 200]],
  turretRange: 1600, turretIntervalMs: 350, turretDamage: 8, turretBoltSpeed: 650, turretSpread: 0.014,
  broadsideRange: 5500, broadsideIntervalMs: 2500, broadsideDamage: 90,
  driftSpeed: 6, holdDistance: 4200,
  spacing: 900,          // between cruisers of one side
  startZ: 3000,          // the sides start at -startZ / +startZ
  explodeMs: 4000,
});
export const SUBSYSTEM_IDS = Object.freeze(Object.keys(CRUISER.subsystems));
// The hangar force field (provisional: the owner said "it might be a force field"). The cruiser's own ships always
// pass. Enemy ships pass while that cruiser's shields are down; flying into a closed field throws the ship back out,
// damaged. Only boarding craft board at the trigger; fighters may fly through an open bay.
export const HANGAR_FIELD = Object.freeze({ repelDamage: 25, repelOffset: 12 });

// The Jedi commander gets stronger while their fleet holds and weaker as it falls.
export const COMMANDER = Object.freeze({
  hp: 300, respawnMs: 60000, maxDefeats: 3, shieldCollapseMs: 30000, strikeBonus: 1.25,
  damageTaken: [0.4, 1.5], damageDealt: [1.3, 0.8], forceRegen: [1.5, 0.6],
  tiers: [[0.75, 'fortified'], [0.5, 'steady'], [0.25, 'strained'], [0, 'broken']],
  leaderlessTurretRate: 0.5,
});
export const TIER_CODES = Object.freeze({ fortified: 0, steady: 1, strained: 2, broken: 3 });
const smoothstep = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const mix = ([a, b], t) => a + (b - a) * t;
// fleet = the side's fleet strength 0..1, hull = the commander's own cruiser hull 0..1
export function commanderModifiers(fleet, hull) {
  const strength = Math.max(0, Math.min(1, 0.5 * (Number(fleet) || 0) + 0.5 * (Number(hull) || 0)));
  const p = smoothstep(1 - strength);
  const tier = COMMANDER.tiers.find(([min]) => strength >= min)[1];
  return {
    strength, tier,
    damageTaken: mix(COMMANDER.damageTaken, p),
    damageDealt: mix(COMMANDER.damageDealt, p),
    forceRegen: mix(COMMANDER.forceRegen, p),
  };
}
// fleet strength: 60% the side's cruiser hull (lost or escaped cruisers count 0), 40% the reinforcements left
export function fleetStrength(cruisers, tickets, maxTickets) {
  const hull = cruisers.length ? cruisers.reduce((s, c) => s + (c.state === 'active' || c.state === 'spooling' ? c.hull / CRUISER.hull : 0), 0) / cruisers.length : 0;
  const reserve = maxTickets > 0 ? Math.max(0, tickets) / maxTickets : 0;
  return 0.6 * hull + 0.4 * reserve;
}

// Combat inside a cruiser and on the planet. Saber and Force contact is resolved by Game 2's combat code on the
// attacker's client (as in the arena); the server checks each report against these limits before it changes HP.
export const BODY = Object.freeze({
  hp: 100,                // Jedi Outcast player health
  spawnProtectMs: 2000,
  respawnMs: 8000,
  moveSpeed: 14,          // m/s, Force Speed included
  moveSlack: 1.5,
  hitCaps: { saber: 72, bolt: 85, force: 40, explosion: 120 }, // largest single hit per kind (Strong special x1.6, x1.5 non-Jedi; charged Bryar 85)
  hitRange: { saber: 4.5, bolt: 80, force: 12, explosion: 10 },
  rangeSlack: 2,
  dpsCap: 220,            // per attacker over any one second
  npcKillEveryMs: 1200,
  npcHurtCap: 30,
});
// The body-state relay aboard a cruiser (and on the planet). Each page reports how its own fighter looks (a pose: yaw,
// animation layers, saber, status, Force held) with its position, and asks another player's page to resolve a Force
// effect on that player's own fighter (a push, a grip...), as the online arena does peer to peer. The server checks
// every report's size and rate and forwards it only to the bodies in the same area. It never takes HP from either
// (blows still arrive as 'hit'), and positions it relays are the ones its own speed check accepted.
// A pose is a list of integers, each checked against [min, max]: angles and animation times are x1000 (radians,
// seconds), the thrown saber x100 (centimetres). The engine side of the layout is fleetAssault/boarding/bodyPose.js.
export const POSE_FIELDS = Object.freeze([
  ['yaw', -7000, 7000], ['ayaw', -7000, 7000], ['syaw', -3200, 3200], ['spitch', -3200, 3200], ['pitch', -3200, 3200], ['legYaw', -3200, 3200],
  ['status', 0, 15], ['flags', 0, 255],
  ['legs', -1, 4095], ['legsT', 0, 600000], ['legsSpeed', -8000, 8000], ['legsLoop', 0, 1],
  ['torso', -1, 4095], ['torsoT', 0, 600000], ['torsoSpeed', -8000, 8000], ['torsoLoop', 0, 1],
  ['move', 0, 255], ['level', 0, 7], ['hilt', 0, 3], ['kit', 0, 2],
  ['hold', 0, 4], ['target', 0, 1e6], ['timed', 0, 31], ['gripBase', 0, 5],
]);
export const POSE_THROWN = Object.freeze([['tx', -45000, 45000], ['ty', -2500, 7000], ['tz', -45000, 45000], ['tang', -7000, 7000]]); // only while the saber is thrown
export const POSE_FLAGS = Object.freeze({ holstered: 1, lit: 2, ducked: 4, onGround: 8, matchPelvis: 16 }); // the 'flags' field
export const POSE_HILTS = Object.freeze(['hand', 'thigh', 'thrown', 'none']); // the 'hilt' field (engine/netgame.js order)
export const RELAY = Object.freeze({
  poseRate: 30, poseBurst: 6,   // 'st' reports a body may send per second (the page sends 20), and the burst on top
  poseFreshMs: 400,             // a pose older than this is not forwarded
  // effects one page asks another to resolve on its own fighter ('to' a player), or shows to everyone aboard (no 'to')
  effects: ['throw', 'grip', 'levitate', 'push', 'pullTo', 'shove', 'stagger', 'electrify', 'shock', 'unlodgeSaber', 'blocked', 'interrupt', 'forceRelease', 'throwRes'],
  shown: ['cast', 'hit', 'taunt'],
  // what an effect needs in the sender's kit (TROOPER_TIERS kinds; a commander has every kind): any one of these. A knock
  // (push / shove / stagger) can follow a saber blow, a Force power or a grenade blast; a trooper's blaster knocks no one
  needs: {
    throw: ['force'], grip: ['force'], levitate: ['force'], pullTo: ['force'], electrify: ['force'], shock: ['force'],
    interrupt: ['force'], forceRelease: ['force'], cast: ['force'], blocked: ['saber'], unlodgeSaber: ['saber'],
    push: ['saber', 'force', 'explosion'], shove: ['saber', 'force', 'explosion'], stagger: ['saber', 'force', 'explosion'],
  },
  hostile: ['throw', 'grip', 'levitate', 'push', 'pullTo', 'shove', 'stagger', 'electrify', 'shock', 'blocked'], // only on the other side
  effectRange: 26,              // m between the two bodies: a fully charged push reaches 21 m (force.js), grips and lightning less
  bladeRange: 6.5,              // m for a saber block ('blocked')
  effectRate: 40, effectBurst: 20, // effects per second per body (lightning ticks each target ten times a second)
  effectBytes: 600,             // JSON size of an effect's arguments
  creditMs: 3000,               // damage a page took from another player's effect (a push's knock, the fall) may be reported
                                // for this long after that player's last effect on it, credited to them (at most hitCaps.force a report)
});
export const INTERIOR = Object.freeze({
  bounds: [[-40, -5, -140], [40, 20, 10]],
  stations: { hangar: [0, 0, 0], weapons: [-24, 0, -40], hyperdrive: [24, 0, -40], shields: [-18, 4, -80], comms: [18, 4, -80], bridge: [0, 8, -120] },
  stationRadius: 3.5,
  garrison: 8, garrisonEveryMs: 20000, garrisonMinHull: 0.5,
});
export const CHARGES = Object.freeze({
  plantMs: { specialist: 6000, other: 12000 }, fuseMs: 15000, defuseMs: 5000,
  subsystemFrac: 0.7, hullDamage: 1500, arrayDamage: 1200,
});
export const GROUND = Object.freeze({
  opensMs: 120000, windowMs: 480000,
  bounds: [[-400, -20, -400], [400, 60, 400]],
  arrayHp: 3000, stationRadius: 4,
  arrays: { republic: [-180, 0, 0], separatist: [180, 0, 0] },
  landing: { republic: [-300, 0, 0], separatist: [300, 0, 0] },
  buff: { laserDamage: 1.15, respawn: 0.75, radar: true },
});

export const SCORE = Object.freeze({
  kill: 100, capitalDamage: 0.05, subsystem: 400, cruiser: 2000, commander: 800, array: 1500,
  boarded: 100, charge: 500, defuse: 300, bodyKill: 100, npc: 25,
});
