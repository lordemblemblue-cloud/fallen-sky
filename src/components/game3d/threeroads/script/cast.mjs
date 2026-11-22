// The people of The War of Three Roads. Written by the lead session; the cast
// subsystem reads it, nobody else edits it.
//
// `home` is where a person normally stands: { area | region, x, z, facing }
// in LOCAL Wolfveil metres for the five areas (x east, z north; facing in
// radians, 0 = looking north, +z). A person with no `home` only appears when
// a pledge brings them in. `giver: true` people can be spoken to for pledges
// and must be pushed into the game's quest-giver list under this `id`.
// `existing` people are already placed by the game itself and are listed
// here only so the script can name them: the cast subsystem does not spawn them.
//
// `look` is a hint for the model until each person has their own:
// body (m | f | child | elder_m | elder_f), build, colours, and what they carry.
export const THREE_ROADS_EMPIRES = Object.freeze({
  akitsu: Object.freeze({ id: 'akitsu', factionId: 'AXE_Faction_1', name: 'Akitsu', title: 'The Resolute', colour: 0x2f4a7a, trim: 0xdcb58a }),
  remoria: Object.freeze({ id: 'remoria', factionId: 'AXE_Faction_2', name: 'Remoria', title: 'The Vigilant', colour: 0x8c2f2f, trim: 0xa5cbe9 }),
  tameri: Object.freeze({ id: 'tameri', factionId: 'AXE_Faction_3', name: 'Tameri', title: 'The Radiant', colour: 0xc9962e, trim: 0xedc18a }),
  valley: Object.freeze({ id: 'valley', factionId: null, name: 'Wolfveil', title: 'The Valley', colour: 0x4a6b4f, trim: 0xe8e2d0 }),
});

const person = data => Object.freeze({ giver: false, existing: false, home: null, ...data });

export const THREE_ROADS_CAST = Object.freeze([
  // The Fountain Watch: already in the game, placed by the game.
  person({ id: 'archer_lyra', name: 'Lyra the Seeker', role: 'Captain of the Fountain Watch', empire: 'valley', giver: true, existing: true }),
  person({ id: 'archer_vex', name: 'Vex the Hunter', role: 'Fountain Watch', empire: 'valley', giver: true, existing: true }),
  person({ id: 'archer_kira', name: 'Kira the Scout', role: 'Fountain Watch', empire: 'valley', giver: true, existing: true }),
  person({ id: 'archer_noor', name: 'Noor the Wanderer', role: 'Fountain Watch', empire: 'valley', giver: true, existing: true }),
  person({ id: 'archer_zephyr', name: 'Zephyr the Silent', role: 'Fountain Watch', empire: 'valley', giver: true, existing: true }),

  // The town.
  person({ id: 'sable_vey', name: 'Sable Vey', role: 'Keeper of the Truce Stone', empire: 'valley', giver: true,
    home: { area: 'town', x: 7, z: -64, facing: Math.PI * 1.25 },
    look: { body: 'f', build: 'tall', colours: [0x2a2d36, 0xb8a36a], carries: 'a staff of office' } }),
  person({ id: 'elder_maren', name: 'Elder Maren', role: 'Truce-Speaker', empire: 'valley',
    look: { body: 'elder_f', build: 'small', colours: [0xe8e2d0, 0x6b7a5a], carries: 'a walking stick' } }),
  person({ id: 'master_hesper', name: 'Master Hesper', role: 'Master of the Brush Keepers', empire: 'valley', giver: true,
    home: { area: 'town', x: 68, z: 188, facing: Math.PI * 1.5 },
    look: { body: 'elder_m', build: 'thin', colours: [0x3b3b3b, 0xd9d2c0], carries: 'a brush; ink to the elbows' } }),
  person({ id: 'bram_lamplighter', name: 'Bram', role: 'Lamplighter', empire: 'valley', giver: true,
    home: { area: 'town', x: -4, z: -44, facing: Math.PI },
    look: { body: 'elder_m', build: 'stooped', colours: [0x5a4632, 0xd0a040], carries: 'a lamplighter\'s pole' } }),
  person({ id: 'watch_warden_south', name: 'Gate Warden', role: 'Fountain Watch, Southern Wolf Gate', empire: 'valley',
    home: { area: 'town', x: 4, z: -221, facing: 0 },
    look: { body: 'm', build: 'broad', colours: [0x4a6b4f, 0x2a2d36], carries: 'a bow and a coil of cord' } }),

  // The three envoys. In the town they stand at their lodges; at the parley
  // they stand around the fountain.
  person({ id: 'mizuhara_jun', name: 'Lieutenant Mizuhara Jun', role: 'Akitsu envoy, engineer and surveyor', empire: 'akitsu', giver: true,
    home: { area: 'town', x: -24, z: -92, facing: Math.PI * 0.25 },
    look: { body: 'm', build: 'slight', colours: [0x2f4a7a, 0xdcb58a], carries: 'a map case' } }),
  person({ id: 'paneb_scribe', name: 'Paneb the Scribe', role: 'Tameri envoy and quartermaster', empire: 'tameri', giver: true,
    home: { area: 'town', x: 24, z: -92, facing: Math.PI * 1.75 },
    look: { body: 'm', build: 'thin', colours: [0xe8dcc0, 0xc9962e], carries: 'a writing board and tally cords' } }),
  person({ id: 'aelia_sabina', name: 'Tribune Aelia Sabina', role: 'Remorian envoy', empire: 'remoria', giver: true,
    home: { area: 'town', x: 0, z: -100, facing: 0 },
    look: { body: 'f', build: 'strong', colours: [0x8c2f2f, 0xa5cbe9], carries: 'a short sword, tied with cord' } }),

  // Chapter one: the three strangers at the gate. Brought in by the pledge.
  person({ id: 'traveller_tome', name: 'Tome', role: 'Rice merchant from Akitsu', empire: 'akitsu',
    look: { body: 'elder_m', build: 'round', colours: [0x2f4a7a, 0x8a7a5a], carries: 'a carrying pole' } }),
  person({ id: 'traveller_henut', name: 'Henut', role: 'Weaver from Tameri, with a water jar', empire: 'tameri',
    look: { body: 'f', build: 'slight', colours: [0xe8dcc0, 0xc9962e], carries: 'a water jar' } }),
  person({ id: 'traveller_livilla', name: 'Livilla', role: 'A veteran\'s widow from Remoria', empire: 'remoria',
    look: { body: 'f', build: 'tall', colours: [0x8c2f2f, 0x6b6b6b], carries: 'a bundle and a boundary stone' } }),

  // The Gate Fields.
  person({ id: 'edda_miller', name: 'Edda', role: 'Miller of the Gate Fields', empire: 'valley', giver: true,
    home: { area: 'south', x: -124, z: -344, facing: Math.PI * 0.5 },
    look: { body: 'f', build: 'strong', colours: [0x7a6a4a, 0xe8e2d0], carries: 'a grain sack' } }),
  person({ id: 'dalla_gravedigger', name: 'Dalla', role: 'Gravedigger of the Three Fields', empire: 'valley', giver: true,
    home: { area: 'south', x: -126, z: -442, facing: Math.PI * 0.5 },
    look: { body: 'f', build: 'wiry', colours: [0x3b3b3b, 0x6b7a5a], carries: 'a spade' } }),
  person({ id: 'tolliver_beekeeper', name: 'Tolliver', role: 'Beekeeper', empire: 'valley', giver: true,
    home: { area: 'south', x: 86, z: -326, facing: Math.PI * 1.5 },
    look: { body: 'm', build: 'tall', colours: [0xd9c98a, 0x5a4632], carries: 'a smoker and a veil' } }),
]);

const BY_ID = new Map(THREE_ROADS_CAST.map(entry => [entry.id, entry]));

export const threeRoadsPerson = id => BY_ID.get(id) || null;

// Who stands in this scene without being brought in by a pledge.
export function threeRoadsCastAtHome({ area = null, region = null } = {}) {
  return THREE_ROADS_CAST.filter(entry => !entry.existing && entry.home &&
    ((area && entry.home.area === area) || (region && entry.home.region === region)));
}
