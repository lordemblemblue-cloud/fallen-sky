// The people of The War of Three Roads. Written by the lead session; the cast
// subsystem reads it, nobody else edits it.
//
// `home` is where a person normally stands: { area | region, x, z, facing }
// in LOCAL Wolfveil metres for the five areas (x east, z north; facing in
// radians, 0 = looking north, +z). `homeAfter: { flag, home }` moves them (or
// takes them away: home null) once that story flag is set. `alsoAt` lists
// further places the same person is found in other areas: each area is its
// own scene, so a player only ever meets one of them at a time. A person with
// no home at all only appears when a pledge brings them in.
//
// `giver: true` people can be spoken to for pledges and must be pushed into
// the game's quest-giver list under this `id`. `existing` people are already
// placed by the game itself and are listed here only so the script can name
// them: the cast subsystem does not spawn them.
//
// `look` is a hint for the model until each person has their own:
// body (m | f | child | elder_m | elder_f), build, colours, and what they carry.
export const THREE_ROADS_EMPIRES = Object.freeze({
  akitsu: Object.freeze({ id: 'akitsu', factionId: 'AXE_Faction_1', name: 'Akitsu', title: 'The Resolute', colour: 0x2f4a7a, trim: 0xdcb58a }),
  remoria: Object.freeze({ id: 'remoria', factionId: 'AXE_Faction_2', name: 'Remoria', title: 'The Vigilant', colour: 0x8c2f2f, trim: 0xa5cbe9 }),
  tameri: Object.freeze({ id: 'tameri', factionId: 'AXE_Faction_3', name: 'Tameri', title: 'The Radiant', colour: 0xc9962e, trim: 0xedc18a }),
  valley: Object.freeze({ id: 'valley', factionId: null, name: 'Wolfveil', title: 'The Valley', colour: 0x4a6b4f, trim: 0xe8e2d0 }),
});

// Which empire a player's faction is: 'akitsu', 'remoria', 'tameri' or 'none'.
export function threeRoadsEmpireOfFaction(factionId) {
  for (const empire of Object.values(THREE_ROADS_EMPIRES))
    if (empire.factionId && empire.factionId === factionId) return empire.id;
  return 'none';
}

// `hail` names one line (in a band's lines) the person says, unasked, to a traveller who comes near.
const person = data => Object.freeze({ giver: false, existing: false, home: null, hail: null, ...data });

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
    look: { body: 'elder_m', build: 'stooped', colours: [0x5a4632, 0xd0a040], carries: "a lamplighter's pole" } }),
  person({ id: 'watch_warden_south', name: 'Gate Warden', role: 'Fountain Watch, Southern Wolf Gate', empire: 'valley',
    home: { area: 'town', x: 4, z: -221, facing: 0 },
    look: { body: 'm', build: 'broad', colours: [0x4a6b4f, 0x2a2d36], carries: 'a bow and a coil of cord' } }),

  // The three envoys. In the town they stand at their lodges; at the parley
  // they stand around the fountain. Once the war is open they leave the town.
  person({ id: 'mizuhara_jun', name: 'Lieutenant Mizuhara Jun', role: 'Akitsu envoy, engineer and surveyor', empire: 'akitsu', giver: true,
    home: { area: 'town', x: -24, z: -92, facing: Math.PI * 0.25 },
    homeAfter: { flag: 'tr_war_open', home: { area: 'west', x: -288, z: -140, facing: Math.PI * 0.5 } },
    look: { body: 'm', build: 'slight', colours: [0x2f4a7a, 0xdcb58a], carries: 'a map case' } }),
  person({ id: 'paneb_scribe', name: 'Paneb the Scribe', role: 'Tameri envoy and quartermaster', empire: 'tameri', giver: true,
    home: { area: 'town', x: 24, z: -92, facing: Math.PI * 1.75 },
    homeAfter: { flag: 'tr_war_open', home: { area: 'south', x: 57, z: -368, facing: Math.PI * 1.25 } },
    alsoAt: [{ area: 'east', x: 275, z: -409, facing: Math.PI * 1.5 }],
    look: { body: 'm', build: 'thin', colours: [0xe8dcc0, 0xc9962e], carries: 'a writing board and tally cords' } }),
  person({ id: 'aelia_sabina', name: 'Tribune Aelia Sabina', role: 'Remorian envoy', empire: 'remoria', giver: true,
    home: { area: 'town', x: 0, z: -100, facing: 0 },
    homeAfter: { flag: 'tr_war_open', home: { area: 'north', x: -62, z: 392, facing: Math.PI } },
    look: { body: 'f', build: 'strong', colours: [0x8c2f2f, 0xa5cbe9], carries: 'a short sword, tied with cord' } }),

  // Chapter one: the three strangers at the gate. Brought in by the pledge.
  person({ id: 'traveller_tome', name: 'Tome', role: 'Rice merchant from Akitsu', empire: 'akitsu',
    look: { body: 'elder_m', build: 'round', colours: [0x2f4a7a, 0x8a7a5a], carries: 'a carrying pole' } }),
  person({ id: 'traveller_henut', name: 'Henut', role: 'Weaver from Tameri, with a water jar', empire: 'tameri',
    look: { body: 'f', build: 'slight', colours: [0xe8dcc0, 0xc9962e], carries: 'a water jar' } }),
  person({ id: 'traveller_livilla', name: 'Livilla', role: "A veteran's widow from Remoria", empire: 'remoria',
    look: { body: 'f', build: 'tall', colours: [0x8c2f2f, 0x6b6b6b], carries: 'a bundle and a boundary stone' } }),

  // The Gate Fields. Each empire keeps a wagon line on the Threshing Floor.
  person({ id: 'goro_sergeant', name: 'Sergeant Gorō', role: 'Akitsu sergeant, "Old Kettle"', empire: 'akitsu', giver: true,
    home: { area: 'south', x: -13, z: -368, facing: Math.PI * 0.75 },
    alsoAt: [{ area: 'west', x: -285, z: -146, facing: Math.PI }],
    look: { body: 'm', build: 'stocky', colours: [0x2f4a7a, 0x5a4632], carries: 'a rifle slung muzzle down, and a kettle' } }),
  person({ id: 'titus_oldvine', name: 'First Centurion Titus Petronius', role: 'Remorian first centurion, "Old Vine"', empire: 'remoria', giver: true,
    home: { area: 'south', x: 28, z: -427, facing: 0 },
    alsoAt: [{ area: 'north', x: -259, z: 407, facing: Math.PI * 0.5 }],
    look: { body: 'elder_m', build: 'broad', colours: [0x8c2f2f, 0x8a8a8a], carries: 'a vine staff' } }),
  person({ id: 'edda_miller', name: 'Edda', role: 'Miller of the Gate Fields', empire: 'valley', giver: true,
    home: { area: 'south', x: -124, z: -344, facing: Math.PI * 0.5 },
    look: { body: 'f', build: 'strong', colours: [0x7a6a4a, 0xe8e2d0], carries: 'a grain sack' } }),
  person({ id: 'dalla_gravedigger', name: 'Dalla', role: 'Gravedigger of the Three Fields', empire: 'valley', giver: true,
    home: { area: 'south', x: -126, z: -442, facing: Math.PI * 0.5 },
    look: { body: 'f', build: 'wiry', colours: [0x3b3b3b, 0x6b7a5a], carries: 'a spade' } }),
  person({ id: 'tolliver_beekeeper', name: 'Tolliver', role: 'Beekeeper', empire: 'valley', giver: true,
    home: { area: 'south', x: 86, z: -326, facing: Math.PI * 1.5 },
    look: { body: 'm', build: 'tall', colours: [0xd9c98a, 0x5a4632], carries: 'a smoker and a veil' } }),

  // Akitsu: the Camp of the Western Road and House Asagiri's Hall.
  person({ id: 'hayasaka_colonel', name: 'Colonel Hayasaka Sōichirō', role: 'Commander of the Western Road Regiment', empire: 'akitsu', giver: true,
    home: { area: 'west', x: -319, z: -139, facing: Math.PI * 0.5 },
    look: { body: 'm', build: 'lean', colours: [0x1f3358, 0xdcb58a], carries: 'a sabre he has not drawn here, and a folded telegram' } }),
  person({ id: 'asagiri_tomoe', name: 'Lady Asagiri Tomoe', role: 'Head of House Asagiri, mistress of the Moon-Ring school', empire: 'akitsu', giver: true,
    home: { area: 'west', x: -233, z: -58, facing: Math.PI * 1.5 },
    look: { body: 'elder_f', build: 'upright', colours: [0x2a2d36, 0xe8e2d0], carries: 'two swords, worn the old way' } }),
  person({ id: 'ren_swordswoman', name: 'Ren', role: "Lady Asagiri's last student", empire: 'akitsu',
    look: { body: 'f', build: 'quick', colours: [0x2a2d36, 0x8c2f2f], carries: 'a practice sword and a real one' } }),

  // Tameri: the Landing.
  person({ id: 'nakhtamun_general', name: 'General Nakhtamun', role: 'Lord of Chariots, Division of the Sharp Star', empire: 'tameri', giver: true,
    home: { area: 'east', x: 286, z: -420, facing: Math.PI * 1.5 },
    look: { body: 'm', build: 'heavy', colours: [0xc9962e, 0x3b5a8c], carries: 'a khopesh and a fly-whisk' } }),
  person({ id: 'meresankh_priestess', name: 'Lector-Priestess Meresankh', role: 'Of the House of Life', empire: 'tameri', giver: true,
    home: { area: 'east', x: 289, z: -432, facing: Math.PI * 1.5 },
    look: { body: 'f', build: 'slender', colours: [0xf2ead8, 0x3b7a6a], carries: 'a scroll case and an empty blade sheath' } }),
  person({ id: 'sabu_tracker', name: 'Sabu', role: 'Tracker of the scouts, with a half-grown sun-cat', empire: 'tameri', giver: true,
    home: { area: 'east', x: 268, z: -436, facing: Math.PI * 1.5 },
    look: { body: 'm', build: 'rangy', colours: [0x8a5a2e, 0xe8dcc0], carries: 'a bow, a throwing stick' } }),

  // Remoria: Castra Lupa and the First Furrow.
  person({ id: 'corvinus_legate', name: 'Legate Gaius Vettius Corvinus', role: 'Commander of the Ninth, the Wolf-Sworn', empire: 'remoria', giver: true,
    home: { area: 'north', x: -61, z: 400, facing: Math.PI * 0.5 },
    look: { body: 'm', build: 'spare', colours: [0x8c2f2f, 0xc9c9c9], carries: 'a wax tablet and a sealed order' } }),
  person({ id: 'veranius_augur', name: 'Augur Decimus Veranius', role: 'Reader of signs to the Ninth', empire: 'remoria',
    home: { area: 'north', x: -252, z: 406, facing: Math.PI * 0.5 },
    look: { body: 'elder_m', build: 'thin', colours: [0xf2f2f2, 0x6b3a8c], carries: 'a curved augur staff' } }),
  person({ id: 'courier_dexter', name: 'Marcus Dexter', role: 'Senate courier', empire: 'remoria',
    look: { body: 'm', build: 'wiry', colours: [0x6b4a2e, 0x8c2f2f], carries: 'a sealed case on a strap' } }),

  // The sentries who stand in the road at each camp (land/campPlans.mjs gives the spots).
  // Each faces the way a traveller comes.
  person({ id: 'akitsu_picket_town', hail: 'hail_akitsu_picket_town', name: 'Picket Guard', role: 'Akitsu picket, the town side', empire: 'akitsu',
    home: { area: 'west', x: -282.5, z: -120.93, facing: 0.56 },
    look: { body: 'm', build: 'strong', colours: [0x2f4a7a, 0xdcb58a], carries: 'a spear where a rifle used to be' } }),
  person({ id: 'akitsu_picket_wilds', hail: 'hail_akitsu_picket_wilds', name: 'Picket Guard', role: 'Akitsu picket, the wilds side', empire: 'akitsu',
    home: { area: 'west', x: -308.29, z: -168.53, facing: 3.7 },
    look: { body: 'm', build: 'strong', colours: [0x2f4a7a, 0xdcb58a], carries: 'a spear and a signal whistle' } }),
  person({ id: 'tameri_gate_spear_north', hail: 'hail_tameri_gate_spear_north', name: 'Spearman of the Landing', role: 'Tameri guard at the flagstaffs', empire: 'tameri',
    home: { area: 'east', x: 299.5, z: -423, facing: Math.PI * 0.5 },
    look: { body: 'm', build: 'strong', colours: [0xe8dcc0, 0xc9962e], carries: 'a spear and a hide shield' } }),
  person({ id: 'tameri_gate_spear_south', hail: 'hail_tameri_gate_spear_south', name: 'Spearman of the Landing', role: 'Tameri guard at the flagstaffs', empire: 'tameri',
    home: { area: 'east', x: 299.5, z: -427, facing: Math.PI * 0.5 },
    look: { body: 'm', build: 'strong', colours: [0xe8dcc0, 0xc9962e], carries: 'a spear and a hide shield' } }),
  person({ id: 'remoria_gate_south_left', hail: 'hail_remoria_gate_south_left', name: 'Gate Sentry', role: 'Legionary of the Ninth, the south gate', empire: 'remoria',
    home: { area: 'north', x: -85.88, z: 359.16, facing: 3.79 },
    look: { body: 'm', build: 'strong', colours: [0x8c2f2f, 0x8a8a8a], carries: 'a javelin and a tall shield' } }),
  person({ id: 'remoria_gate_south_right', hail: 'hail_remoria_gate_south_right', name: 'Gate Sentry', role: 'Legionary of the Ninth, the south gate', empire: 'remoria',
    home: { area: 'north', x: -83.32, z: 357.24, facing: 3.79 },
    look: { body: 'm', build: 'strong', colours: [0x8c2f2f, 0x8a8a8a], carries: 'a javelin and a tall shield' } }),
  person({ id: 'remoria_gate_north', hail: 'hail_remoria_gate_north', name: 'Gate Sentry', role: 'Legionary of the Ninth, the north gate', empire: 'remoria',
    home: { area: 'north', x: -46.12, z: 406.84, facing: 0.64 },
    look: { body: 'm', build: 'strong', colours: [0x8c2f2f, 0x8a8a8a], carries: 'a javelin and a tall shield' } }),
]);

const BY_ID = new Map(THREE_ROADS_CAST.map(entry => [entry.id, entry]));

export const threeRoadsPerson = id => BY_ID.get(id) || null;

// Where a person's main home is given the story so far. `flags` are the quest
// store's story flags; a person with `homeAfter` moves (or leaves: home null)
// once that flag is set.
export function threeRoadsHomeOf(entry, flags = {}) {
  if (!entry) return null;
  if (entry.homeAfter && flags && flags[entry.homeAfter.flag]) return entry.homeAfter.home || null;
  return entry.home || null;
}

// The areas whose places have been built. People whose home lies in an area
// that has no camp yet are not brought in: they would stand in open country.
// Add an area here when its band lands.
export const THREE_ROADS_BUILT_AREAS = Object.freeze(['town', 'south']);

// Who stands in this scene without being brought in by a pledge. Each result
// is the person with `home` already resolved for these flags and this scene
// (their main home, or the `alsoAt` entry that lies in it). People in areas
// not built yet are left out unless `includeUnbuilt` is set.
export function threeRoadsCastAtHome({ area = null, region = null, flags = {}, includeUnbuilt = false } = {}) {
  if (area && !includeUnbuilt && !THREE_ROADS_BUILT_AREAS.includes(area)) return [];
  const here = home => !!home && ((area && home.area === area) || (region && home.region === region));
  const result = [];
  for (const entry of THREE_ROADS_CAST) {
    if (entry.existing) continue;
    const home = [threeRoadsHomeOf(entry, flags), ...(entry.alsoAt || [])].find(here);
    if (!home) continue;
    result.push(home === entry.home ? entry : Object.freeze({ ...entry, home }));
  }
  return result;
}
