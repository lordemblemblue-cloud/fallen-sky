// The people of the War of Three Roads as they stood when the story was retired (2026-11-27):
// the sample cast the story tools are tested on. The fields are described in
// src/components/game3d/threeroads/script/cast.mjs.
// `hail` names one line (in a band's lines) the person says, unasked, to a traveller who comes near.
const person = data => Object.freeze({ giver: false, existing: false, home: null, hail: null, ...data });

export const SAMPLE_CAST = Object.freeze([
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

  // The Jade Watch: already in the game, placed by the game outside the Jade Lantern Grotto.
  person({ id: 'jade_watch_captain', name: 'Captain Arlen', role: 'Captain of the Jade Watch, at the Jade Lantern Grotto', empire: 'valley', existing: true }),

  // Chapter 4: the echo at the Wolf Stones. One body; he wears the colours of the player's own
  // empire as they were four hundred years ago (`look.byEmpire`), washed nearly grey.
  person({ id: 'thrown_standard_bearer', name: 'The Standard-Bearer', role: 'A soldier of the last war, four hundred years dead, who put his standard down', empire: 'valley',
    look: { body: 'm', build: 'strong', colours: [0x8a8f96, 0xd9d2c0], carries: 'a standard with no colour left in it', echo: true,
      byEmpire: {
        akitsu: { colours: [0x5f6f8c, 0xd9d2c0], wears: 'lacquered plates laced with cord, a banner pole at his back' },
        tameri: { colours: [0xa8956a, 0xd9d2c0], wears: 'a quilted linen corselet and a striped headcloth, a pennant staff' },
        remoria: { colours: [0x8c6a6a, 0xd9d2c0], wears: 'a bronze breastplate over a red tunic gone pale, a standard pole' },
      } } }),

  // The champions the other empires keep meeting (Ren, above, is Akitsu's).
  person({ id: 'tiaa_archer', name: 'Tiaa', role: "Chariot archer of the Sharp Star, Tameri's champion", empire: 'tameri',
    look: { body: 'f', build: 'wiry', colours: [0xe8dcc0, 0x3b5a8c], carries: 'a long bow and a nearly empty quiver' } }),
  person({ id: 'brenna_casca', name: 'Optio Brenna Casca', role: "Optio of the Ninth, Remoria's champion", empire: 'remoria',
    look: { body: 'f', build: 'strong', colours: [0x8c2f2f, 0xc9c9c9], carries: "an optio's staff and a short sword" } }),
]);

// Things that speak a line but have no body: what is written, read aloud.
export const SAMPLE_VOICES = Object.freeze([
  person({ id: 'drowned_ledger', name: 'The Drowned Ledger', role: "The Keepers' record of every war fought in the valley", empire: 'valley', voiceOnly: true }),
]);

// Roles: a name a pledge can use wherever it would name a person, standing for a different
// person of the cast depending on the player's empire.
//   own_commander    who the player answers to. A player of no empire answers to the Truce.
//   rival_champion   the champion of the empire whose keepsake the player was given in chapter 1.
export const SAMPLE_ROLES = Object.freeze([
  person({ id: 'own_commander', name: 'Your commander', role: "The commander of the player's own empire", empire: 'valley',
    standsFor: Object.freeze({ akitsu: 'hayasaka_colonel', tameri: 'nakhtamun_general', remoria: 'corvinus_legate', none: 'sable_vey' }) }),
  person({ id: 'rival_champion', name: 'A rival champion', role: 'The champion of the empire that gave the player a keepsake', empire: 'valley',
    standsFor: Object.freeze({ akitsu: 'tiaa_archer', tameri: 'brenna_casca', remoria: 'ren_swordswoman', none: 'tiaa_archer' }) }),
]);

// The areas whose places had been built.
export const SAMPLE_BUILT_AREAS = Object.freeze(['town', 'south']);
