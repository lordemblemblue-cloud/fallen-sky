// The War of Three Roads, band 1: the opening in the town and the Gate Fields.
// Written by the lead session. This file is the story: pledge definitions (for
// pledges/pledgeModel.mjs definePledge), every spoken line, the named points
// the scenes use, and the staging of each step.
//
// Nothing in the reference game is used here. Every person, line and event is
// original.
//
// HOW THE PARTS FIT
//   BAND1_POINTS    named points in LOCAL Wolfveil metres (x east, z north).
//   BAND1_LINES     id -> { speaker, text }. Speakers are ids in cast.mjs.
//   BAND1_PLEDGES   raw definitions, validated by definePledge.
//   BAND1_STAGING   pledge id -> how each step is watched and what the world
//                   does around it. The pledge-world subsystem interprets it.
//
// STAGING VOCABULARY
//   offer / complete: lists of line ids spoken when the pledge is offered and
//     when it is finished. `completeByChoice` picks a line by the option taken.
//   steps[stepId].watch: what in the world finishes the step, by step kind:
//     talk      { npc } or { anyOf: [npc...], distinct: true }
//     go_to     { point, radius } or { trail: [points], legSeconds }
//               (one report per waypoint in order; 'trail_lost' if a leg runs out)
//     defeat    { groupId }            (the enemies subsystem reports each death)
//     use       { point, radius, prompt } or { points: [...], distinct: true, prompt }
//     escort    { people: [...], to: point, radius }
//     pick_up   { point, radius, prompt } or { points: [...], prompt }
//     deliver   { npc }
//     defend    { point, radius, protect: person, waves: [{ at, group }] }
//     choose    (the choice comes from the pledge's own `choices`)
//   steps[stepId].start / .done: cues run when the step begins / ends:
//     { say: lineId }                 { wait: seconds }
//     { castSpawn: id, at: point, facing }   { castDespawn: id }
//     { castMove: id, to: point, speed }     { castFollow: id, target, distance }
//     { spawnGroup: { groupId, kind, count, at, radius, tier } }  (level = the player's)
//     { despawnGroup: groupId }       { sound: name }
//     { sayByEmpire: { akitsu, tameri, remoria, none } }
//     { flagByEmpire: { akitsu, tameri, remoria, none } }
//   steps[stepId].along: for escort and trail steps, lines spoken on the way,
//     one each time another `every` metres have been covered.

export const BAND1_POINTS = Object.freeze({
  // Town: the Oath Tree and the fountain (the fountain basin is 6.55 m in radius at 0, -70)
  oath_tree: Object.freeze({ x: -6.6, z: -70.2 }),
  truce_stone: Object.freeze({ x: -9.6, z: -70.2 }),
  ring_place: Object.freeze({ x: 0, z: -88 }),
  maren_spot: Object.freeze({ x: 0, z: -77.4 }),
  sable_ring_spot: Object.freeze({ x: 2.4, z: -77.6 }),
  envoy_akitsu_ring: Object.freeze({ x: -4.5, z: -81 }),
  envoy_tameri_ring: Object.freeze({ x: 4.5, z: -81 }),
  envoy_remoria_ring: Object.freeze({ x: 0, z: -84.5 }),
  // Town: the ink trail, west along the residential road
  ink_first_sight: Object.freeze({ x: -20, z: -76 }),
  ink_trail_1: Object.freeze({ x: -38, z: -80 }),
  ink_trail_2: Object.freeze({ x: -80, z: -92 }),
  ink_trail_3: Object.freeze({ x: -120, z: -101 }),
  // Town: the three ways out, for the envoys leaving
  way_west: Object.freeze({ x: -180, z: -110 }),
  way_east: Object.freeze({ x: 60, z: -98 }),
  way_north: Object.freeze({ x: 0, z: 10 }),
  // Town: the Lantern Wall
  lantern_wall: Object.freeze({ x: -4, z: -41 }),
  // Town: the Southern Wolf Gate and its wagon yard (P04)
  gate_arch: Object.freeze({ x: 0, z: -225 }),
  gate_bell: Object.freeze({ x: 5, z: -223 }),
  yard_centre: Object.freeze({ x: 70, z: -210 }),
  yard_wagon_akitsu: Object.freeze({ x: 61, z: -212 }),
  yard_wagon_tameri: Object.freeze({ x: 70, z: -205 }),
  yard_wagon_remoria: Object.freeze({ x: 79, z: -212 }),
  // Gate Fields: the Threshing Floor (P08; centre 25, -390; wagons on a 40 m rim)
  floor_centre: Object.freeze({ x: 25, z: -390 }),
  floor_wagon_akitsu: Object.freeze({ x: -10, z: -370 }),
  floor_wagon_tameri: Object.freeze({ x: 60, z: -370 }),
  floor_wagon_remoria: Object.freeze({ x: 25, z: -430 }),
  // Gate Fields: what the gravedigger is short of
  woodpile: Object.freeze({ x: 84, z: -336 }),
  salt_store: Object.freeze({ x: -126, z: -352 }),
  // Gate Fields: the Three Fields (P10)
  graves_centre: Object.freeze({ x: -130, z: -450 }),
  graves_dalla: Object.freeze({ x: -126, z: -442 }),
  graves_unnamed: Object.freeze({ x: -122, z: -456 }),
  graves_ink_west: Object.freeze({ x: -148, z: -452 }),
  graves_ink_south: Object.freeze({ x: -130, z: -468 }),
});

const line = (speaker, text) => Object.freeze({ speaker, text });

export const BAND1_LINES = Object.freeze({
  // ── M01 Sworn at the Gate ────────────────────────────────────────────
  lyra_m01_01: line('archer_lyra', "Stop there. Nobody walks under the Veil unsworn. I'm Lyra. I keep the count, and you are number four hundred and twelve this month. The month is young."),
  lyra_m01_02: line('archer_lyra', "Three armies drink from this fountain. The only reason the water isn't red is one law, older than the town: no blood within sight of the fountain."),
  lyra_m01_03: line('archer_lyra', "You swear it the way everyone has. Take a ribbon in your people's colour and tie it to the tree. Your hands, your knot. Then it's yours to keep or to break."),
  lyra_m01_04: line('archer_lyra', "Good. Remember how that felt. One day it will be the only thing standing between you and something you badly want to do."),
  lyra_m01_05: line('archer_lyra', "That's the gate bell. Twice means trouble on the road. You're sworn now, so it's your trouble too. Go!"),
  warden_m01_01: line('watch_warden_south', "Ink on the wagons! It came up out of the ditch. There are people under there, three at least, and I can't leave the arch!"),
  warden_m01_02: line('watch_warden_south', "That's the last of them. Get those people out before the axles give."),
  tome_m01_01: line('traveller_tome', "My leg! No. No, it's only the rice. Forty years I've carried it, and today it sat on me. Thank you, soldier."),
  henut_m01_01: line('traveller_henut', "The jar isn't broken. Thank the Sharp One. And thank you. I didn't think anyone would stop."),
  livilla_m01_01: line('traveller_livilla', "Don't fuss. I've been under worse than a wagon. My husband marched twenty years for a field he never saw. I've come to see it for him."),
  tome_m01_02: line('traveller_tome', "They told us in the hills that powder won't burn here. My grandson laughed. Then his rifle clicked like a cricket, and he stopped laughing."),
  henut_m01_02: line('traveller_henut', "At home the river has not risen in three years. I weave, but nobody buys cloth when there's no bread. So I came to where the grain is."),
  livilla_m01_02: line('traveller_livilla', "See those three banners? Each one is sure this valley was promised to it. I buried a man who was sure of things."),
  tome_m01_03: line('traveller_tome', "Is it true about the fountain? A blue coat and a red cloak can stand side by side, and nothing happens?"),
  henut_m01_03: line('traveller_henut', "It's true. I asked the warden. He said the law is older than his grandmother's grandmother."),
  lyra_m01_06: line('archer_lyra', "Three more for the count, and none of them yours. You pulled strangers out from under a wagon an hour after you got here."),
  lyra_m01_07: line('archer_lyra', "You kept the Truce before you understood it. That's the only way anyone ever has."),
  henut_m01_04: line('traveller_henut', "Here. It's only a bead, river blue, from my mother's loom. Where I come from, you give something to the one who opened a door for you."),
  livilla_m01_03: line('traveller_livilla', "Take this. A pebble from the edge of the field he was promised. I carried two. I only need one."),
  tome_m01_04: line('traveller_tome', "For you. A paper charm from the shrine in my village. The bear on it keeps travellers. It kept me today, so now it's yours."),
  lyra_m01_08: line('archer_lyra', "Sable Vey holds the parley at the fountain at noon. The sworn have a place in the ring. Stand in it. You should see what you just swore to."),

  // ── M02 Three Arrows ─────────────────────────────────────────────────
  sable_m02_01: line('sable_vey', "So you're Lyra's four hundred and twelfth. I'm Sable Vey. I keep the stone the Truce is cut into, which mostly means keeping three armies from reading it too closely."),
  sable_m02_02: line('sable_vey', "The envoys meet at noon, as they have every week for a year. Before you stand in the ring, hear them. All three. Anyone can love their own side. I need the sworn to understand the other two."),
  mizuhara_m02_01: line('mizuhara_jun', "Mizuhara, Lieutenant of Engineers. Ask me what Akitsu wants and I'll show you a drawing. One railway, mine to mountain. Iron for a country that will be carved up without it."),
  mizuhara_m02_02: line('mizuhara_jun', "We pay for every tree. I counted them myself. I am told that is not the same as asking."),
  paneb_m02_01: line('paneb_scribe', "Paneb, scribe. I'll save you the speech. There are forty-one days of grain in the Beloved Land. I count them every morning. This morning there were forty-one."),
  paneb_m02_02: line('paneb_scribe', "Tameri asks for the harvest of the Gate Fields at a fair price, and for the river to be left as it runs. That is all. It is everything."),
  aelia_m02_01: line('aelia_sabina', "Aelia Sabina, tribune. Thirty thousand soldiers were promised land for ten years of war. Remoria keeps its promises or it is nothing. The Ninth is here to mark out farms."),
  aelia_m02_02: line('aelia_sabina', "Yes, I know there are people on that land. I have said so in the tent. I will say so again today."),
  sable_m02_03: line('sable_vey', "The ring is closed. Weapons tied. Elder Maren speaks for the valley."),
  maren_m02_01: line('elder_maren', "A year. Fifty-two noons. I have heard each of you say what your people cannot live without. And do you know, I believed every one of you."),
  maren_m02_02: line('elder_maren', "So here is what the valley asks back. Not land. Not iron. Not water. Only that when you take what you need, you look at who is standing..."),
  sable_m02_04: line('sable_vey', "Maren! Nobody moves. NOBODY draws! You, sworn one: it went west, along the lane. Go!"),
  lyra_m02_01: line('archer_lyra', "It's leaving ink! Follow it before it dries!"),
  lyra_m02_02: line('archer_lyra', "Gone. It was never a person. Look at the fletching, though. Crane feather. Goose. Reed. One from every quiver in this valley."),
  sable_m02_05: line('sable_vey', "Three arrows. Three peoples. One old woman who trusted all of them. Whoever did this wanted every one of us to be guilty."),
  aelia_m02_03: line('aelia_sabina', "The Ninth did not do this. But I can't prove it, and by tonight nobody will want me to."),
  paneb_m02_03: line('paneb_scribe', "Forty-one days. And now a war."),
  mizuhara_m02_03: line('mizuhara_jun', "I drew her portrait last week. She asked me to make her look taller."),
  sable_m02_06: line('sable_vey', "They're going back to their camps, and tomorrow they'll send soldiers where they sent envoys. The Truce is dead past the bridges. I am asking you whether it is dead in here."),
  sable_m02_07: line('sable_vey', "Then there are two of us. That's twice what I had this morning."),
  sable_m02_08: line('sable_vey', "Fair. One oath honestly kept is worth more than two given in a hurry."),
  sable_m02_09: line('sable_vey', "Your own people will call you to their camp before dark. Go when they do. And when Kira comes looking for you about the ink, listen to her."),

  // ── V01 The Lantern Count ────────────────────────────────────────────
  bram_v01_01: line('bram_lamplighter', "Every dusk since I was a boy, I've lit one lantern for each soul the valley lost that day. It used to be a slow job. I ran out of oil on Thursday."),
  bram_v01_02: line('bram_lamplighter', "The only oil left is with the armies' wagons, down on the Gate Fields. They won't give it to an old man. They might give it to one of their own, if you told them what it's for."),
  goro_v01_01: line('goro_sergeant', "Lamp oil? For the old lamplighter? He lights one for ours too? Huh. Take the good jar, then. Not the kitchen one."),
  oldvine_v01_01: line('titus_oldvine', "Twenty-five years, and nobody ever lit a thing for a dead legionary but his own tent. Take it. Tell him the Ninth lost a boy called Decius on Tuesday."),
  paneb_v01_01: line('paneb_scribe', "Oil is counted like grain. One lantern for each, whoever they were? Then I'll write it under rites. Nobody questions that column."),
  bram_v01_03: line('bram_lamplighter', "All three? All three gave. Well. Come on, then. You carry the taper. My hands shake."),
  bram_v01_04: line('bram_lamplighter', "Maren, of the valley."),
  bram_v01_05: line('bram_lamplighter', "A boy of the Ninth. Decius, was it? Decius."),
  bram_v01_06: line('bram_lamplighter', "Two of Akitsu. Brothers, they said. One lantern each. They'd have argued over sharing."),
  bram_v01_07: line('bram_lamplighter', "A Tameri carter. Nobody gave me a name, so I say 'the carter', and I mean him."),
  bram_v01_08: line('bram_lamplighter', "And one for whoever loosed those arrows. They're somebody's, too."),
  bram_v01_09: line('bram_lamplighter', "That's today. If you're passing at dusk tomorrow, I could use the hands."),

  // ── V16 The Gravedigger's Three Fields ───────────────────────────────
  dalla_v16_01: line('dalla_gravedigger', "You're standing on Tameri. Two steps left is Akitsu. Behind you, Remoria. I keep them apart because their gods asked for different things. The worms don't care."),
  dalla_v16_02: line('dalla_gravedigger', "Akitsu burns theirs, and I need cedar. Tameri wraps theirs in salt, and I'm out. Remoria wants a coin on each eye for the ferry, and I've been using buttons. Fetch what I'm short of, and I'll show you how each is done."),
  oldvine_v16_01: line('titus_oldvine', "Coins for the ferryman? Who for? Ours and theirs? She buries theirs? Hm. Here. Proper ones, with the wolf on. Don't tell the paymaster."),
  dalla_v16_03: line('dalla_gravedigger', "They come when I dig. The ink wants the dead before the ground has them. Keep it off me. I work fast."),
  dalla_v16_04: line('dalla_gravedigger', "Done. Fire for the hills, salt for the river, a coin for the road. Now. There's one more. No coat, no tags, nothing in the pockets. Somebody's. I don't know whose."),
  dalla_v16_05: line('dalla_gravedigger', "Then they'll have that, and someone who meant it. That's more than most get this year."),
  dalla_v16_06: line('dalla_gravedigger', "All three. Hah. That's how my mother did the ones nobody claimed. She said, let the gods sort out whose turn it is."),
  dalla_v16_07: line('dalla_gravedigger', "The valley's way? We plant a tree on them. In thirty years somebody sits in the shade and doesn't know why it's a good spot."),
});

const MAIN = 200; // above every quest the five archers already offer

export const BAND1_PLEDGES = Object.freeze([
  {
    id: 'tr_m01_sworn_at_the_gate',
    npcId: 'archer_lyra',
    title: 'Sworn at the Gate',
    description: 'Lyra of the Fountain Watch swears every newcomer to the Truce at the Oath Tree. Then the gate bell rings.',
    unlockLevel: 1,
    priority: MAIN,
    category: 'chapter',
    storyFlagsOnComplete: ['tr_truce_sworn'],
    pledge: {
      line: 'main',
      chapter: 1,
      swornTo: 'Lyra of the Fountain Watch, at the Oath Tree',
      cause: 'Nobody walks under the Veil unsworn, and the people at the gate have no one else.',
      cost: 'A sworn hand may never draw blood within sight of the fountain, whatever is done in front of it.',
      steps: [
        { id: 'oath', kind: 'use', text: 'Tie your ribbon to the Oath Tree.', target: 'tr_oath_tree', placeId: 'P01', seconds: 2 },
        { id: 'gate', kind: 'go_to', text: 'Run to the Southern Wolf Gate.', placeId: 'P04' },
        { id: 'shades', kind: 'defeat', text: 'Drive the ink shades off the wagons.', target: 'tr_m01_gate_shades', placeId: 'P04', count: 6 },
        { id: 'free', kind: 'use', text: 'Free the three travellers pinned under the wagons.', target: 'tr_m01_trapped', placeId: 'P04', count: 3, seconds: 2 },
        { id: 'walk', kind: 'escort', text: 'Bring them up the road to the Oath Tree.', target: 'tr_m01_travellers', placeId: 'P01', failsOn: 'escort_failed' },
        { id: 'lyra', kind: 'talk', text: 'Speak with Lyra.', target: 'archer_lyra' },
      ],
      standings: { kept: { trust: 5, regard: 1 }, broken: { trust: -2 } },
      rewardPreview: { kinds: ['experience', 'trust', 'keepsake'] },
    },
  },
  {
    id: 'tr_m02_three_arrows',
    npcId: 'sable_vey',
    title: 'Three Arrows',
    description: 'Sable Vey asks the newly sworn to hear all three envoys and stand in the ring at the noon parley.',
    unlockLevel: 1,
    recommendedLevel: 2,
    priority: MAIN,
    category: 'chapter',
    requires: 'tr_m01_sworn_at_the_gate',
    storyFlagsRequired: ['tr_truce_sworn'],
    storyFlagsOnComplete: ['tr_war_open'],
    pledge: {
      line: 'main',
      chapter: 2,
      swornTo: 'Sable Vey, Keeper of the Truce Stone',
      cause: 'Someone has to stand in the ring who has heard all three sides.',
      cost: 'To stand in the ring you tie your weapon, whatever happens in front of you.',
      steps: [
        { id: 'hear', kind: 'talk', text: 'Hear the three envoys at their lodges.', target: 'tr_m02_envoys', count: 3 },
        { id: 'ring', kind: 'go_to', text: 'Take your place in the ring at the fountain.', target: 'tr_m02_ring', placeId: 'P01' },
        { id: 'chase', kind: 'go_to', text: 'Follow the ink trail before it dries.', target: 'tr_m02_ink_trail', count: 3, failsOn: 'trail_lost' },
        { id: 'arrows', kind: 'pick_up', text: 'Pick up what the archer left.', target: 'tr_three_arrows' },
        { id: 'sable', kind: 'deliver', text: 'Bring the arrows to Sable Vey.', target: 'sable_vey' },
        { id: 'again', kind: 'choose', text: 'Answer Sable Vey.' },
      ],
      choices: {
        again: {
          prompt: 'Sable Vey holds out the Truce Stone.',
          options: [
            { id: 'swear', text: 'Swear it again, on the stone.', flags: ['tr_truce_twice_sworn'] },
            { id: 'silent', text: 'Keep your first oath, and say nothing more.', flags: ['tr_truce_once_sworn'] },
          ],
        },
      },
      standings: { kept: { trust: 6, renown: 2 }, broken: { trust: -3 } },
      rewardPreview: { kinds: ['experience', 'trust', 'title'] },
    },
  },
  {
    id: 'tr_v01_lantern_count',
    npcId: 'bram_lamplighter',
    title: 'The Lantern Count',
    description: 'Bram lights one lantern at dusk for each soul the valley lost that day. He has run out of oil.',
    unlockLevel: 1,
    recommendedLevel: 2,
    category: 'side',
    requires: 'tr_m02_three_arrows',
    pledge: {
      line: 'valley',
      swornTo: 'Bram the lamplighter, at the Lantern Wall',
      cause: 'So that everyone who died today is counted the same, whatever they wore.',
      cost: 'You ask three armies for a favour on the day they went to war.',
      steps: [
        { id: 'oil', kind: 'talk', text: 'Ask for lamp oil at each of the three wagon lines on the Threshing Floor.', target: 'tr_v01_wagon_masters', placeId: 'P08', count: 3 },
        { id: 'back', kind: 'deliver', text: 'Bring the oil to Bram at the Lantern Wall.', target: 'bram_lamplighter' },
        { id: 'light', kind: 'use', text: 'Light five lanterns with him.', target: 'tr_lantern_wall', placeId: 'P03', count: 5, seconds: 1.5 },
      ],
      standings: { kept: { trust: 4, regard: 1 }, broken: { trust: -1 } },
      rewardPreview: { kinds: ['experience', 'trust', 'keepsake'] },
    },
  },
  {
    id: 'tr_v16_three_fields',
    npcId: 'dalla_gravedigger',
    title: "The Gravedigger's Three Fields",
    description: 'Dalla buries the dead of all three peoples, each in their own way, and she is short of what each way needs.',
    unlockLevel: 1,
    recommendedLevel: 3,
    category: 'side',
    requires: 'tr_m02_three_arrows',
    pledge: {
      line: 'valley',
      swornTo: 'Dalla, gravedigger of the Three Fields',
      cause: 'So that every people here is buried with the care its own would give.',
      cost: 'You stand guard over the dead of the armies that are trying to kill you.',
      steps: [
        { id: 'cedar', kind: 'pick_up', text: "Fetch two bundles of cedar from the farmsteads' woodpile.", target: 'tr_cedar_bundle', count: 2 },
        { id: 'salt', kind: 'pick_up', text: 'Fetch a sack of salt from the granary.', target: 'tr_salt_sack' },
        { id: 'coins', kind: 'talk', text: "Ask Old Vine at the Remorian wagons for the ferryman's coins.", target: 'titus_oldvine' },
        { id: 'bring', kind: 'deliver', text: 'Bring it all to Dalla.', target: 'dalla_gravedigger' },
        { id: 'guard', kind: 'defend', text: 'Keep the ink off Dalla while she buries the day\'s dead.', target: 'tr_v16_guard', placeId: 'P10', seconds: 60, failsOn: 'defend_failed' },
        { id: 'last', kind: 'choose', text: 'Decide how the last one is buried.' },
      ],
      choices: {
        last: {
          prompt: 'Dalla holds out the spade.',
          options: [
            { id: 'own', text: 'Bury them the way your own people would.', flags: ['tr_v16_own_rite'] },
            { id: 'all', text: 'Cedar, salt and a coin. All three.', flags: ['tr_v16_all_three'] },
            { id: 'hers', text: 'Ask Dalla how the valley buries its own.', flags: ['tr_v16_valley_rite'] },
          ],
        },
      },
      standings: { kept: { trust: 5 }, broken: { trust: -2 } },
      rewardPreview: { kinds: ['experience', 'trust'] },
    },
  },
]);

export const BAND1_STAGING = Object.freeze({
  tr_m01_sworn_at_the_gate: {
    offer: ['lyra_m01_01', 'lyra_m01_02', 'lyra_m01_03'],
    complete: ['lyra_m01_06', 'lyra_m01_07', 'lyra_m01_08'],
    steps: {
      oath: {
        watch: { point: 'oath_tree', radius: 3.5, prompt: 'Tie your ribbon' },
        done: [{ say: 'lyra_m01_04' }, { wait: 2 }, { sound: 'gate_bell' }, { say: 'lyra_m01_05' }],
      },
      gate: {
        start: [
          { castSpawn: 'traveller_tome', at: 'yard_wagon_akitsu', facing: 0 },
          { castSpawn: 'traveller_henut', at: 'yard_wagon_tameri', facing: 0 },
          { castSpawn: 'traveller_livilla', at: 'yard_wagon_remoria', facing: 0 },
          { spawnGroup: { groupId: 'tr_m01_gate_shades', placeId: 'P04', kind: 'ink_shade', count: 6, at: 'yard_centre', radius: 12, tier: 'normal' } },
        ],
        watch: { point: 'gate_arch', radius: 14 },
        done: [{ say: 'warden_m01_01' }],
      },
      shades: {
        watch: { groupId: 'tr_m01_gate_shades' },
        done: [{ say: 'warden_m01_02' }],
      },
      free: {
        watch: {
          points: ['yard_wagon_akitsu', 'yard_wagon_tameri', 'yard_wagon_remoria'],
          distinct: true, radius: 3, prompt: 'Lift the wagon',
          sayAt: { yard_wagon_akitsu: 'tome_m01_01', yard_wagon_tameri: 'henut_m01_01', yard_wagon_remoria: 'livilla_m01_01' },
        },
        done: [
          { castFollow: 'traveller_tome', target: 'player', distance: 3 },
          { castFollow: 'traveller_henut', target: 'player', distance: 4.5 },
          { castFollow: 'traveller_livilla', target: 'player', distance: 6 },
        ],
      },
      walk: {
        watch: { people: ['traveller_tome', 'traveller_henut', 'traveller_livilla'], to: 'oath_tree', radius: 8 },
        along: { every: 28, lines: ['tome_m01_02', 'henut_m01_02', 'livilla_m01_02', 'tome_m01_03', 'henut_m01_03'] },
        done: [
          { castFollow: 'traveller_tome', target: null },
          { castFollow: 'traveller_henut', target: null },
          { castFollow: 'traveller_livilla', target: null },
        ],
      },
      lyra: {
        watch: { npc: 'archer_lyra' },
        done: [
          { sayByEmpire: { akitsu: 'henut_m01_04', tameri: 'livilla_m01_03', remoria: 'tome_m01_04', none: 'henut_m01_04' } },
          { flagByEmpire: { akitsu: 'tr_keepsake_tameri', tameri: 'tr_keepsake_remoria', remoria: 'tr_keepsake_akitsu', none: 'tr_keepsake_tameri' } },
        ],
      },
    },
  },
  tr_m02_three_arrows: {
    offer: ['sable_m02_01', 'sable_m02_02'],
    complete: ['sable_m02_09'],
    completeByChoice: { step: 'again', lines: { swear: 'sable_m02_07', silent: 'sable_m02_08' } },
    steps: {
      hear: {
        watch: {
          anyOf: ['mizuhara_jun', 'paneb_scribe', 'aelia_sabina'], distinct: true,
          sayAt: {
            mizuhara_jun: ['mizuhara_m02_01', 'mizuhara_m02_02'],
            paneb_scribe: ['paneb_m02_01', 'paneb_m02_02'],
            aelia_sabina: ['aelia_m02_01', 'aelia_m02_02'],
          },
        },
        done: [
          { castMove: 'mizuhara_jun', to: 'envoy_akitsu_ring', speed: 1.6 },
          { castMove: 'paneb_scribe', to: 'envoy_tameri_ring', speed: 1.6 },
          { castMove: 'aelia_sabina', to: 'envoy_remoria_ring', speed: 1.6 },
          { castMove: 'sable_vey', to: 'sable_ring_spot', speed: 1.6 },
          { castSpawn: 'elder_maren', at: 'maren_spot', facing: Math.PI },
        ],
      },
      ring: {
        watch: { point: 'ring_place', radius: 4 },
        done: [
          { say: 'sable_m02_03' }, { wait: 3 },
          { say: 'maren_m02_01' }, { wait: 7 },
          { say: 'maren_m02_02' }, { wait: 6 },
          { sound: 'three_arrows' },
          { castDespawn: 'elder_maren' },
          { say: 'sable_m02_04' },
          { spawnGroup: { groupId: 'tr_m02_ink_archer', kind: 'ink_shade', count: 1, at: 'ink_first_sight', radius: 1, tier: 'normal', passive: true } },
        ],
      },
      chase: {
        watch: { trail: ['ink_trail_1', 'ink_trail_2', 'ink_trail_3'], radius: 5, legSeconds: 22 },
        along: { every: 30, lines: ['lyra_m02_01'] },
        done: [{ despawnGroup: 'tr_m02_ink_archer' }, { sound: 'ink_burst' }],
      },
      arrows: {
        watch: { point: 'ink_trail_3', radius: 3, prompt: 'Pick up the arrows' },
        done: [{ say: 'lyra_m02_02' }],
      },
      sable: {
        watch: { npc: 'sable_vey' },
        done: [
          { say: 'sable_m02_05' }, { wait: 6 },
          { say: 'aelia_m02_03' }, { castMove: 'aelia_sabina', to: 'way_north', speed: 1.8 }, { wait: 4 },
          { say: 'paneb_m02_03' }, { castMove: 'paneb_scribe', to: 'way_east', speed: 1.8 }, { wait: 3 },
          { say: 'mizuhara_m02_03' }, { castMove: 'mizuhara_jun', to: 'way_west', speed: 1.8 }, { wait: 4 },
          { say: 'sable_m02_06' },
        ],
      },
      again: {},
    },
  },
  tr_v01_lantern_count: {
    offer: ['bram_v01_01', 'bram_v01_02'],
    complete: ['bram_v01_09'],
    steps: {
      oil: {
        watch: {
          anyOf: ['goro_sergeant', 'paneb_scribe', 'titus_oldvine'], distinct: true,
          sayAt: { goro_sergeant: ['goro_v01_01'], paneb_scribe: ['paneb_v01_01'], titus_oldvine: ['oldvine_v01_01'] },
        },
      },
      back: { watch: { npc: 'bram_lamplighter' }, done: [{ say: 'bram_v01_03' }] },
      light: {
        watch: { point: 'lantern_wall', radius: 4, prompt: 'Light a lantern',
          sayEach: ['bram_v01_04', 'bram_v01_05', 'bram_v01_06', 'bram_v01_07', 'bram_v01_08'] },
      },
    },
  },
  tr_v16_three_fields: {
    offer: ['dalla_v16_01', 'dalla_v16_02'],
    complete: [],
    completeByChoice: { step: 'last', lines: { own: 'dalla_v16_05', all: 'dalla_v16_06', hers: 'dalla_v16_07' } },
    steps: {
      cedar: { watch: { point: 'woodpile', radius: 3, prompt: 'Take a bundle of cedar' } },
      salt: { watch: { point: 'salt_store', radius: 3, prompt: 'Take a sack of salt' } },
      coins: { watch: { npc: 'titus_oldvine', sayAt: { titus_oldvine: ['oldvine_v16_01'] } } },
      bring: { watch: { npc: 'dalla_gravedigger' }, done: [{ say: 'dalla_v16_03' }] },
      guard: {
        watch: {
          point: 'graves_centre', radius: 16, protect: 'dalla_gravedigger',
          waves: [
            { at: 2, group: { groupId: 'tr_v16_ink_1', placeId: 'P10', kind: 'ink_shade', count: 3, at: 'graves_ink_west', radius: 5, tier: 'normal' } },
            { at: 30, group: { groupId: 'tr_v16_ink_2', placeId: 'P10', kind: 'ink_shade', count: 3, at: 'graves_ink_south', radius: 5, tier: 'normal' } },
          ],
        },
        done: [{ despawnGroup: 'tr_v16_ink_1' }, { despawnGroup: 'tr_v16_ink_2' }, { say: 'dalla_v16_04' }],
      },
      last: {},
    },
  },
});

// Which line gives the keepsake, and which empire it comes from, for a player
// of each empire. The same rule is used again in chapter 6.
export const BAND1_KEEPSAKES = Object.freeze({
  akitsu: Object.freeze({ from: 'tameri', giver: 'traveller_henut', flag: 'tr_keepsake_tameri', thing: 'a river-blue bead' }),
  tameri: Object.freeze({ from: 'remoria', giver: 'traveller_livilla', flag: 'tr_keepsake_remoria', thing: 'a pebble from a promised field' }),
  remoria: Object.freeze({ from: 'akitsu', giver: 'traveller_tome', flag: 'tr_keepsake_akitsu', thing: 'a paper charm with a bear on it' }),
});
