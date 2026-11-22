// The War of Three Roads, band 2: each empire's camp and the first two
// chapters of its own story. Written by the lead session. Same parts and the
// same staging vocabulary as band1.mjs (read its header first), with two
// additions:
//   watch for a `carry` step: { from, to, radius, prompt, sayEach } : pick the
//     thing up at `from` with E, walk it to `to` on foot; one report per
//     arrival; 'carry_dropped' if the player dies, mounts or is knocked down.
//   watch for a `defeat` step may carry `sayEach`: one line spoken at each death.
// An optional step is open only alongside the required step listed before
// it, so an optional look-around is listed after the talk it may precede.
//
// Every person, line and event is original. Monsters named here are the kinds
// the game can already show (ink_shade, old_dead, echo); the four-legged ink
// beasts the story describes replace them where noted once they exist.

const AKITSU = 'AXE_Faction_1';
const REMORIA = 'AXE_Faction_2';
const TAMERI = 'AXE_Faction_3';

export const BAND2_POINTS = Object.freeze({
  // West: the Camp of the Western Road (P13)
  camp_fire: Object.freeze({ x: -296, z: -134 }),
  camp_drill: Object.freeze({ x: -283, z: -148 }),
  camp_post_1: Object.freeze({ x: -286, z: -151 }),
  camp_post_2: Object.freeze({ x: -283, z: -153 }),
  camp_post_3: Object.freeze({ x: -280, z: -151 }),
  camp_picket: Object.freeze({ x: -311, z: -166 }),
  camp_cedars: Object.freeze({ x: -340, z: -156 }),
  camp_armoury: Object.freeze({ x: -290, z: -128 }),
  // West: House Asagiri's Hall (P14) and the Wolf Stones (P18)
  hall_door: Object.freeze({ x: -235, z: -60 }),
  hall_grave: Object.freeze({ x: -242, z: -52 }),
  stones_approach: Object.freeze({ x: -326, z: 205 }),
  stones_banner: Object.freeze({ x: -331, z: 228 }),
  // East: the Landing (P24)
  landing_jetty: Object.freeze({ x: 265, z: -426 }),
  landing_stack: Object.freeze({ x: 279, z: -416 }),
  landing_tally: Object.freeze({ x: 275, z: -409 }),
  landing_reeds: Object.freeze({ x: 268, z: -442 }),
  landing_bowcase: Object.freeze({ x: 266, z: -432 }),
  // East: the old battle camp and Shadow Ravine (P26)
  scarred_blade: Object.freeze({ x: 318, z: -252 }),
  ravine_gate: Object.freeze({ x: 332, z: -150 }),
  ravine_chant: Object.freeze({ x: 340, z: -168 }),
  ravine_dead: Object.freeze({ x: 343, z: -173 }),
  ravine_ink: Object.freeze({ x: 352, z: -183 }),
  ravine_sixth: Object.freeze({ x: 350, z: -160 }),
  // North: the First Furrow on the Howling Plateau (P36)
  furrow_cart: Object.freeze({ x: -264, z: 406 }),
  furrow_1: Object.freeze({ x: -262, z: 410 }),
  furrow_2: Object.freeze({ x: -247, z: 416 }),
  furrow_3: Object.freeze({ x: -232, z: 421 }),
  furrow_end: Object.freeze({ x: -218, z: 426 }),
  furrow_stone: Object.freeze({ x: -216, z: 429 }),
  furrow_mist_w: Object.freeze({ x: -268, z: 430 }),
  furrow_mist_e: Object.freeze({ x: -214, z: 410 }),
  // North: the High Road (P43) down to Castra Lupa (P35)
  road_top: Object.freeze({ x: 150, z: 428 }),
  road_ambush: Object.freeze({ x: 104, z: 430 }),
  fort_gate: Object.freeze({ x: -46, z: 409 }),
  fort_tent: Object.freeze({ x: -61, z: 400 }),
  fort_overhear: Object.freeze({ x: -66, z: 410 }),
});

// Which area each group of points lies in (checked by the script test).
export const BAND2_POINT_AREAS = Object.freeze({
  camp_: 'west', hall_: 'west', stones_: 'west',
  landing_: 'east', scarred_: 'east', ravine_: 'east',
  furrow_: 'north', road_: 'north', fort_: 'north',
});

const line = (speaker, text) => Object.freeze({ speaker, text });

export const BAND2_LINES = Object.freeze({
  // ── The camps' sentries, hailing whoever comes up the road (cast.mjs names each one's line) ──
  hail_akitsu_picket_town: line('akitsu_picket_town', "Hold there. This is the camp of the Western Road. Keep to the trail, and mind the drill yard: they are new to spears."),
  hail_akitsu_picket_wilds: line('akitsu_picket_wilds', "Coming in from the wilds? Slowly. Out there, things have started wearing the shapes of people."),
  hail_tameri_gate_spear_north: line('tameri_gate_spear_north', "Between the staffs, friend. The Landing counts everything that passes them, and now it has counted you."),
  hail_tameri_gate_spear_south: line('tameri_gate_spear_south', "Mind the rim. The river keeps what it is given."),
  hail_remoria_gate_south_left: line('remoria_gate_south_left', "Stand and be seen. The road runs through the Ninth's fort, and so do you, at a walk."),
  hail_remoria_gate_south_right: line('remoria_gate_south_right', "Blades stay tied. The Truce comes this far up the hill; we would like it to go back down with you."),
  hail_remoria_gate_north: line('remoria_gate_north', "The crossroads is watched. If you met anything on the High Road, tell the Legate, not me."),
  // ── A01 A Farmer's Son in a Blue Coat ───────────────────────────────
  goro_a01_01: line('goro_sergeant', "You. Ever held a spear? Good. Because that is what these are now. Powder's dead under this sky. My boys were taught to shoot. Somebody has to show them the other end."),
  goro_a01_02: line('goro_sergeant', "They're farmers. So was I. First time in their lives anyone handed them a coat and said they counted. I'd like them to live long enough to believe it."),
  goro_a01_03: line('goro_sergeant', "Lower. Lower! You're not presenting it to the Emperor, Kenta. You're stopping a thing that wants to eat you."),
  goro_a01_04: line('goro_sergeant', "Better. Feet apart. The ground's your friend. It's the only one that never runs."),
  goro_a01_05: line('goro_sergeant', "There. That's a spear line. Ugly, but it's a line."),
  goro_a01_06: line('goro_sergeant', "Sun's going. Take the west picket with them. If it comes, it comes out of the cedars."),
  goro_a01_07: line('goro_sergeant', "Count them. All eleven? All eleven! Put the kettle on, Kenta. We're alive."),
  goro_a01_08: line('goro_sergeant', "One peg empty. Shrine bows don't walk off. Somebody has been in my armoury, and it wasn't the ink."),
  goro_a01_09: line('goro_sergeant', "A proper soldier's answer. The Colonel would be pleased. Drink your tea."),
  goro_a01_10: line('goro_sergeant', "A farmer's answer. Don't say it where the Colonel can hear. Drink your tea."),
  goro_a01_11: line('goro_sergeant', "Lady Asagiri's hall is the tent by the duelling field. She says she won't teach conscripts. Go and see whether she'll say it to your face."),

  // ── A02 The Sword Mistress's Price ──────────────────────────────────
  asagiri_a02_01: line('asagiri_tomoe', "You are the one Gorō sent. You hold that blade like a farm tool. Do not apologise. A farm tool feeds people."),
  asagiri_a02_02: line('asagiri_tomoe', "My house has one banner. My grandson carried it to the Wolf Stones nine days ago, to ask the mountain whether we still had a place in the world. He was sixteen. The stones kept him."),
  asagiri_a02_03: line('asagiri_tomoe', "Bring me the banner and his two swords. Then I will teach your conscripts. Not before. A house that leaves its banner in the dirt has nothing to teach."),
  ren_a02_01: line('ren_swordswoman', "She sent you? She wouldn't let me go. She said one of us was enough to lose. It's there, by the tall stone. The thing holding it wears his face."),
  ren_a02_02: line('ren_swordswoman', "It's only ink now. He's been gone nine days. I keep telling myself that."),
  ren_a02_03: line('ren_swordswoman', "He was better than me. Faster. He'd have hated that I'm the one left to say so."),
  ren_a02_04: line('ren_swordswoman', "When the court took our stipends, she sold the garden to keep the school. When they banned the swords, she went on teaching with sticks."),
  ren_a02_05: line('ren_swordswoman', "Don't tell her I cried. She knows. Don't tell her anyway."),
  asagiri_a02_04: line('asagiri_tomoe', "Slowly. He was never in a hurry unless he was late."),
  asagiri_a02_05: line('asagiri_tomoe', "The banner is torn. Good. It was too clean. It had never been anywhere."),
  asagiri_a02_06: line('asagiri_tomoe', "Your grip. Here, and here. The cut begins in the hip. Again. Tomorrow at dawn, bring your farmers. Tell them to eat first."),
  asagiri_a02_07: line('asagiri_tomoe', "You did not say you were sorry. Everyone says it. Thank you for not saying it."),

  // ── T01 The Count ───────────────────────────────────────────────────
  paneb_t01_01: line('paneb_scribe', "You're late. The barge isn't. Four jars to the stack before the reeds wake up. Each jar is a village's bread for a day. Don't drop one. I would have to write it down."),
  paneb_t01_02: line('paneb_scribe', "One."),
  paneb_t01_03: line('paneb_scribe', "Two. Mind the plank."),
  sabu_t01_01: line('sabu_tracker', "Down! In the reeds, there, the black shapes. They come for the smell of grain. Keep them off the plank!"),
  sabu_t01_02: line('sabu_tracker', "That's the last. Miu, leave it. It isn't food. It isn't anything."),
  paneb_t01_04: line('paneb_scribe', "Three."),
  paneb_t01_05: line('paneb_scribe', "Four. All four."),
  paneb_t01_06: line('paneb_scribe', "Forty-one days of grain at home this morning. With this barge sent back full, forty-three. Look at the board. That number is the only general I serve."),
  sabu_t01_03: line('sabu_tracker', "That's a chariot archer's bow case. Tiaa's, by the stitching. Empty. She is going to skin someone, and I'd like it not to be me."),
  paneb_t01_07: line('paneb_scribe', "You'll look at that number differently now. Everyone does, once they've carried it."),
  paneb_t01_08: line('paneb_scribe', "The Priestess has asked for hands in the ravine. It isn't grain work. Go anyway. It's the other thing we cannot afford to run out of."),

  // ── T02 Opening of the Mouth ────────────────────────────────────────
  meresankh_t02_01: line('meresankh_priestess', "Sit. You carried the grain. Good. Now the other count. Thirty-one of ours have died in this valley. I have opened the mouths of nineteen. The rest are in the ravine, and at night they stand up."),
  meresankh_t02_02: line('meresankh_priestess', "A person whose mouth is not opened cannot speak their own name to the judges. They cannot eat. They wander. Here, under this sky, they wander with their bodies."),
  meresankh_t02_03: line('meresankh_priestess', "The blade for the rite is sky-iron. A shade took it from my tent three nights ago and carried it to the old battle camp south of here. Bring it back, and bring it to me in the ravine."),
  meresankh_t02_04: line('meresankh_priestess', "You have it. Then we begin. They will come at us. They do not know us. When one falls I will say who it was. Listen to the names. Someone should."),
  meresankh_t02_05: line('meresankh_priestess', "Ahmose, spearman, third company. He sang badly and often."),
  meresankh_t02_06: line('meresankh_priestess', "Nebi, shield-bearer. He owed Paneb four measures of beer."),
  meresankh_t02_07: line('meresankh_priestess', "Senmut, who drove the grain carts and never once lost a jar."),
  meresankh_t02_08: line('meresankh_priestess', "Khay, archer. Seventeen. He lied about his age."),
  meresankh_t02_09: line('meresankh_priestess', "Teti. I did not know Teti. Someone did."),
  meresankh_t02_10: line('meresankh_priestess', "Hold the blade to the east. Do not lower it. Your mouth is opened. You speak, you eat, you go west. Your mouth is opened."),
  meresankh_t02_11: line('meresankh_priestess', "The ink smells a rite. Keep it from the circle until I finish. If I stop, they are lost for good."),
  meresankh_t02_12: line('meresankh_priestess', "It is done. Five walk west tonight who would have walked this ravine for ever."),
  meresankh_t02_13: line('meresankh_priestess', "For that one too? The rite does not ask whose soldier. I had forgotten that I knew that. Hold it out."),
  meresankh_t02_14: line('meresankh_priestess', "As you say. Its own people have their own ways. I will tell their envoy where it lies."),
  meresankh_t02_15: line('meresankh_priestess', "The General will want that blade melted into a hundred others before the month is out. He is not a bad man. He is a man with thirty-one dead and an enemy at the river mouth. Remember what you held tonight when he asks."),

  // ── R01 Old Vine's Furrow ───────────────────────────────────────────
  oldvine_r01_01: line('titus_oldvine', "Twenty-five years I've walked behind a standard. Today I walk behind a plough, and gods help me, I'm more nervous. Take the handles. I'll lead."),
  oldvine_r01_02: line('titus_oldvine', "One furrow, all the way round, and it's a colony. That's been the law since the twins. It's cold up here and the soil's thin as a quartermaster's soup. But inside the line, it's ours."),
  oldvine_r01_03: line('titus_oldvine', "Straight! A furrow is like a marching line. Nobody remembers the straight ones. Everybody remembers the crooked."),
  oldvine_r01_04: line('titus_oldvine', "I've a daughter I have met four times. She's thirty. I thought I'd build the house facing south."),
  veranius_r01_01: line('veranius_augur', "Wolves! Wolves from the mist, on the day of the furrow! Do you see? Do you all see?"),
  oldvine_r01_05: line('titus_oldvine', "I see ink with teeth, Augur. Shields! You, with me!"),
  oldvine_r01_06: line('titus_oldvine', "Back on the handles. A furrow left half done is a curse, they say. I say it's just embarrassing."),
  veranius_r01_02: line('veranius_augur', "Again she tests her children! Rejoice!"),
  oldvine_r01_07: line('titus_oldvine', "If that is the Mother's love, I'd hate to see her cross."),
  oldvine_r01_08: line('titus_oldvine', "Set it deep. There. First stone of the colony. Somebody ought to say something."),
  veranius_r01_03: line('veranius_augur', "The Mother walked the furrow with us and tried our courage twice. It is the best omen of my life."),
  oldvine_r01_09: line('titus_oldvine', "That's an island archer's case, and it's empty. He'll say the wolves took it. Wolves don't undo buckles."),
  oldvine_r01_10: line('titus_oldvine', "You see those roofs down the valley? People. On my twenty acres, or near enough. Nobody mentioned people when they read us the grant."),
  oldvine_r01_11: line('titus_oldvine', "The Legate wants a steady pair of hands for a courier job. He asked me for a name, and I gave him yours. Don't make a liar of an old man."),

  // ── R02 The Crack ───────────────────────────────────────────────────
  corvinus_r02_01: line('corvinus_legate', "Old Vine gave me your name. He does not give names. A courier is coming down the High Road with a case under the Senate's seal. Meet him. Bring him in. Do not open the case. Do not ask about the case."),
  corvinus_r02_02: line('corvinus_legate', "I would send a century. But a century makes people ask what is worth a century."),
  courier_r02_01: line('courier_dexter', "The Ninth? Thank the gods. Four days I've ridden, and something has kept pace with me since the pass."),
  courier_r02_02: line('courier_dexter', "They wanted the case. Things made of ink, wanting a sealed case! What is in this valley?"),
  courier_r02_03: line('courier_dexter', "I don't know what is in it. I know it was handed to me at night, by a senator, and his hand was shaking."),
  courier_r02_04: line('courier_dexter', "In the city they say the Sky Shield has been taken down for cleaning. It has never been taken down for cleaning."),
  corvinus_r02_03: line('corvinus_legate', "Cracked. Rim to boss. The night the star dimmed."),
  courier_r02_05: line('courier_dexter', "They have hidden it, Legate. If the people learn the Pledge is broken before it is mended..."),
  corvinus_r02_04: line('corvinus_legate', "Then 'find star-iron' is not an order. It is a prayer. Leave the case. Speak to no one."),
  aelia_r02_01: line('aelia_sabina', "You brought the courier in. You stood by the tent wall for some time. I am the soldiers' voice in that tent, and I am not being told something. What did you hear?"),
  aelia_r02_02: line('aelia_sabina', "The Pledge. Cracked. Thank you. I will not use your name. I do not yet know what I will do with the rest."),
  aelia_r02_03: line('aelia_sabina', "Nothing. Of course. You are a good soldier, and he chose you well. I will find out another way."),
  corvinus_r02_05: line('corvinus_legate', "You did well. The Ninth marks its ground and waits. As for you: the Watch in the town has been asking after you. Something about ink."),
});

const EMPIRE = 150; // above the older quests, below the main chapters

export const BAND2_PLEDGES = Object.freeze([
  {
    id: 'tr_a01_farmers_son',
    npcId: 'goro_sergeant',
    title: "A Farmer's Son in a Blue Coat",
    description: "Sergeant Gorō's recruits were taught to shoot. Under the Veil nothing shoots, and tonight something comes over the picket.",
    unlockLevel: 1,
    recommendedLevel: 3,
    priority: EMPIRE,
    category: 'chapter',
    factionId: AKITSU,
    requires: 'tr_m02_three_arrows',
    storyFlagsOnComplete: ['tr_a01_done'],
    pledge: {
      line: 'akitsu',
      chapter: 1,
      swornTo: 'Sergeant Gorō, at the drill yard of the Western Road camp',
      cause: 'His recruits are farmers who were handed rifles that will not fire here, and they have one evening to learn a spear.',
      cost: 'You teach boys to kill with the other end of a rifle, and tonight some of them will have to.',
      steps: [
        { id: 'drill', kind: 'use', text: 'Show three recruits how a rifle is held when it is a spear.', target: 'tr_a01_drill', placeId: 'P13', count: 3, seconds: 2 },
        { id: 'picket', kind: 'go_to', text: 'Take the west picket.', target: 'tr_a01_picket' },
        { id: 'raid', kind: 'defeat', text: 'Hold the picket against what comes out of the cedars.', target: 'tr_a01_raid', placeId: 'P13', count: 5 },
        { id: 'report', kind: 'talk', text: 'Report to Sergeant Gorō at the fire.', target: 'goro_sergeant' },
        { id: 'peg', kind: 'pick_up', text: 'A quiver is missing from the armoury tent. Look at the empty peg.', target: 'tr_a01_empty_peg', optional: true },
        { id: 'wagon', kind: 'choose', text: 'Answer the Sergeant.' },
      ],
      choices: {
        wagon: {
          prompt: 'Gorō pours you tea. "Two wagons back there tonight. Powder and rice. If you could stand by only one?"',
          options: [
            { id: 'powder', text: 'The powder. Those are the orders.', flags: ['tr_a01_powder'] },
            { id: 'rice', text: 'The rice. Dead powder feeds nobody.', flags: ['tr_a01_rice'] },
          ],
        },
      },
      standings: { kept: { renown: 4 }, broken: { renown: -2 }, optional: { peg: { regard: 1 } } },
      rewardPreview: { kinds: ['experience', 'renown'] },
    },
  },
  {
    id: 'tr_a02_sword_mistress_price',
    npcId: 'asagiri_tomoe',
    title: "The Sword Mistress's Price",
    description: 'Lady Asagiri will not teach the conscripts while her house banner lies at the Wolf Stones, where her grandson carried it.',
    unlockLevel: 1,
    recommendedLevel: 6,
    priority: EMPIRE,
    category: 'chapter',
    factionId: AKITSU,
    requires: 'tr_a01_farmers_son',
    storyFlagsOnComplete: ['tr_a02_done'],
    pledge: {
      line: 'akitsu',
      chapter: 2,
      swornTo: 'Lady Asagiri Tomoe, head of House Asagiri',
      cause: 'Her grandson carried the banner to the Wolf Stones and did not come back, and the conscripts will not be taught until it is home.',
      cost: "You carry a dead boy's swords home on foot, and you are the one who hands them to her.",
      steps: [
        { id: 'stones', kind: 'go_to', text: 'Go to the Wind-Carved Wolf Stones.', target: 'tr_a02_stones', placeId: 'P18' },
        { id: 'echo', kind: 'defeat', text: 'Take the banner from the echo that holds it.', target: 'tr_a02_banner_echo', placeId: 'P18' },
        { id: 'carry', kind: 'carry', text: 'Carry the banner and the two swords to the hall, on foot.', target: 'tr_asagiri_banner', placeId: 'P14', failsOn: 'carry_dropped' },
        { id: 'water', kind: 'use', text: 'Pour the water at his grave.', target: 'tr_asagiri_grave', seconds: 3 },
        { id: 'asagiri', kind: 'talk', text: 'Stand before Lady Asagiri.', target: 'asagiri_tomoe' },
      ],
      standings: { kept: { renown: 4, trust: 1 }, broken: { renown: -2 } },
      rewardPreview: { kinds: ['experience', 'renown', 'lesson'] },
    },
  },
  {
    id: 'tr_t01_the_count',
    npcId: 'paneb_scribe',
    title: 'The Count',
    description: 'A relief barge is in at the Landing, the reeds are full of ink, and Paneb counts every jar.',
    unlockLevel: 1,
    recommendedLevel: 3,
    priority: EMPIRE,
    category: 'chapter',
    factionId: TAMERI,
    requires: 'tr_m02_three_arrows',
    storyFlagsOnComplete: ['tr_t01_done'],
    pledge: {
      line: 'tameri',
      chapter: 1,
      swornTo: 'Paneb the Scribe, at the Landing',
      cause: "Every jar that reaches the stack is a day's bread for a village at home.",
      cost: 'From now on you will know the number, and you will not be able to stop counting.',
      steps: [
        { id: 'jars_a', kind: 'carry', text: 'Carry two grain jars up from the landing stage to the stack.', target: 'tr_t01_grain_jar_a', placeId: 'P24', count: 2, failsOn: 'carry_dropped' },
        { id: 'reeds', kind: 'defeat', text: 'Drive off what comes out of the reeds.', target: 'tr_t01_reed_shades', placeId: 'P24', count: 4 },
        { id: 'jars_b', kind: 'carry', text: 'Carry the last two jars.', target: 'tr_t01_grain_jar_b', placeId: 'P24', count: 2, failsOn: 'carry_dropped' },
        { id: 'tally', kind: 'talk', text: 'Hear the count.', target: 'paneb_scribe' },
        { id: 'case', kind: 'pick_up', text: 'A bow case on the landing stage lies open and empty. Look at it.', target: 'tr_t01_empty_case', optional: true },
      ],
      standings: { kept: { renown: 4 }, broken: { renown: -2 }, optional: { case: { regard: 1 } } },
      rewardPreview: { kinds: ['experience', 'renown', 'keepsake'] },
    },
  },
  {
    id: 'tr_t02_opening_of_the_mouth',
    npcId: 'meresankh_priestess',
    title: 'Opening of the Mouth',
    description: "Tameri's dead lie in Shadow Ravine without their rites, and at night they stand up. Each of them has a name.",
    unlockLevel: 1,
    recommendedLevel: 6,
    priority: EMPIRE,
    category: 'chapter',
    factionId: TAMERI,
    requires: 'tr_t01_the_count',
    storyFlagsOnComplete: ['tr_t02_done'],
    pledge: {
      line: 'tameri',
      chapter: 2,
      swornTo: 'Lector-Priestess Meresankh of the House of Life',
      cause: 'A soldier whose mouth is not opened cannot pass on, and under the Veil the ones left unburied get up.',
      cost: 'You have to strike down your own people before you can free them.',
      steps: [
        { id: 'thief', kind: 'defeat', text: 'At the old battle camp, bring down the shade that stole the blade.', target: 'tr_t02_blade_thief' },
        { id: 'blade', kind: 'pick_up', text: 'Take up the sky-iron blade.', target: 'tr_sky_iron_blade' },
        { id: 'ravine', kind: 'go_to', text: 'Bring it to the Priestess in Shadow Ravine.', target: 'tr_t02_ravine', placeId: 'P26' },
        { id: 'names', kind: 'defeat', text: 'Free five of the unrested dead.', target: 'tr_t02_unopened', placeId: 'P26', count: 5 },
        { id: 'rite', kind: 'use', text: 'Hold the blade to the east while she speaks the rite.', target: 'tr_t02_rite', placeId: 'P26', seconds: 6 },
        { id: 'guard', kind: 'defend', text: 'Keep the ink out of the circle until she finishes.', target: 'tr_t02_circle', placeId: 'P26', seconds: 40, failsOn: 'defend_failed' },
        { id: 'sixth', kind: 'choose', text: 'Decide about the sixth body.' },
      ],
      choices: {
        sixth: {
          prompt: "Under the overhang lies a sixth body. Its coat is not Tameri's.",
          options: [
            { id: 'free', text: 'Hold out the blade for this one too.', flags: ['tr_t02_sixth_freed'] },
            { id: 'leave', text: 'Leave it for its own people.', flags: ['tr_t02_sixth_left'] },
          ],
        },
      },
      standings: { kept: { renown: 4, trust: 1 }, broken: { renown: -2 } },
      rewardPreview: { kinds: ['experience', 'renown'] },
    },
  },
  {
    id: 'tr_r01_old_vines_furrow',
    npcId: 'titus_oldvine',
    title: "Old Vine's Furrow",
    description: 'A colony begins with one furrow ploughed around it. The Ninth ploughs its first on the Howling Plateau.',
    unlockLevel: 1,
    recommendedLevel: 3,
    priority: EMPIRE,
    category: 'chapter',
    factionId: REMORIA,
    requires: 'tr_m02_three_arrows',
    storyFlagsOnComplete: ['tr_r01_done'],
    pledge: {
      line: 'remoria',
      chapter: 1,
      swornTo: 'First Centurion Titus Petronius, called Old Vine',
      cause: 'The Ninth was promised this land ten years ago, and it will not feel like theirs until a plough has been through it.',
      cost: 'The furrow goes where the Senate drew it, across ground other people already walk.',
      steps: [
        { id: 'plough', kind: 'go_to', text: 'Take the plough handles and walk the furrow line.', target: 'tr_r01_furrow', placeId: 'P36', count: 3, failsOn: 'trail_lost' },
        { id: 'mist', kind: 'defeat', text: 'Stand off what comes out of the mist.', target: 'tr_r01_mist_1', placeId: 'P36', count: 4 },
        { id: 'finish', kind: 'go_to', text: 'Finish the furrow.', target: 'tr_r01_furrow_end', placeId: 'P36' },
        { id: 'again', kind: 'defeat', text: 'They are back. Hold the line.', target: 'tr_r01_mist_2', placeId: 'P36', count: 4 },
        { id: 'stone', kind: 'use', text: 'Set the boundary stone.', target: 'tr_r01_boundary_stone', placeId: 'P36', seconds: 3 },
        { id: 'vine', kind: 'talk', text: 'Speak with Old Vine.', target: 'titus_oldvine' },
        { id: 'case', kind: 'pick_up', text: "An archer's case on the plough cart is empty. Look at it.", target: 'tr_r01_empty_case', optional: true },
      ],
      standings: { kept: { renown: 4 }, broken: { renown: -2 }, optional: { case: { regard: 1 } } },
      rewardPreview: { kinds: ['experience', 'renown', 'keepsake'] },
    },
  },
  {
    id: 'tr_r02_the_crack',
    npcId: 'corvinus_legate',
    title: 'The Crack',
    description: "A courier is coming down the High Road with a case under the Senate's seal. The Legate wants him met quietly.",
    unlockLevel: 1,
    recommendedLevel: 6,
    priority: EMPIRE,
    category: 'chapter',
    factionId: REMORIA,
    requires: 'tr_r01_old_vines_furrow',
    storyFlagsOnComplete: ['tr_r02_done'],
    pledge: {
      line: 'remoria',
      chapter: 2,
      swornTo: 'Legate Gaius Vettius Corvinus, commander of the Ninth',
      cause: 'The road from the pass is not safe, and what the courier carries must reach the Legate unseen.',
      cost: 'You will be trusted with something you were not meant to know.',
      steps: [
        { id: 'meet', kind: 'go_to', text: 'Meet the courier at the top of the High Road.', target: 'tr_r02_road_top', placeId: 'P43' },
        { id: 'ambush', kind: 'defeat', text: 'Break the ambush on the road.', target: 'tr_r02_ambush', count: 5 },
        { id: 'escort', kind: 'escort', text: 'Bring the courier down to Castra Lupa.', target: 'tr_r02_courier', placeId: 'P35', failsOn: 'escort_failed' },
        { id: 'tent', kind: 'go_to', text: 'Wait outside the command tent.', target: 'tr_r02_tent_wall', placeId: 'P35' },
        { id: 'aelia', kind: 'talk', text: 'The Tribune wants a word.', target: 'aelia_sabina' },
        { id: 'answer', kind: 'choose', text: 'Answer the Tribune.' },
      ],
      choices: {
        answer: {
          prompt: '"What did you hear?"',
          options: [
            { id: 'truth', text: 'Tell her what you heard.', flags: ['tr_r02_told_aelia'] },
            { id: 'nothing', text: '"Nothing, Tribune."', flags: ['tr_r02_kept_quiet'] },
          ],
        },
      },
      standings: { kept: { renown: 4 }, broken: { renown: -2 } },
      rewardPreview: { kinds: ['experience', 'renown'] },
    },
  },
]);

export const BAND2_STAGING = Object.freeze({
  tr_a01_farmers_son: {
    offer: ['goro_a01_01', 'goro_a01_02'],
    complete: ['goro_a01_11'],
    completeByChoice: { step: 'wagon', lines: { powder: 'goro_a01_09', rice: 'goro_a01_10' } },
    steps: {
      drill: {
        watch: { points: ['camp_post_1', 'camp_post_2', 'camp_post_3'], distinct: true, radius: 2.5, prompt: 'Show the grip',
          sayEach: ['goro_a01_03', 'goro_a01_04', 'goro_a01_05'] },
        done: [{ say: 'goro_a01_06' }],
      },
      picket: {
        watch: { point: 'camp_picket', radius: 5 },
        done: [{ spawnGroup: { groupId: 'tr_a01_raid', placeId: 'P13', kind: 'ink_shade', count: 5, at: 'camp_cedars', radius: 7, tier: 'normal' } }],
      },
      raid: { watch: { groupId: 'tr_a01_raid' }, done: [{ say: 'goro_a01_07' }] },
      report: { watch: { npc: 'goro_sergeant' } },
      peg: { watch: { point: 'camp_armoury', radius: 3, prompt: 'Look at the empty peg', sayAt: { camp_armoury: 'goro_a01_08' } } },
      wagon: {},
    },
  },
  tr_a02_sword_mistress_price: {
    offer: ['asagiri_a02_01', 'asagiri_a02_02', 'asagiri_a02_03'],
    complete: ['asagiri_a02_07'],
    steps: {
      stones: {
        start: [{ castSpawn: 'ren_swordswoman', at: 'stones_approach', facing: 0 }],
        watch: { point: 'stones_approach', radius: 8 },
        done: [
          { say: 'ren_a02_01' },
          { spawnGroup: { groupId: 'tr_a02_banner_echo', placeId: 'P18', kind: 'echo', count: 1, at: 'stones_banner', radius: 2, tier: 'champion' } },
        ],
      },
      echo: { watch: { groupId: 'tr_a02_banner_echo' }, done: [{ say: 'ren_a02_02' }, { castFollow: 'ren_swordswoman', target: 'player', distance: 3 }] },
      carry: {
        watch: { from: 'stones_banner', to: 'hall_grave', radius: 6, prompt: 'Take up the banner and the swords' },
        along: { every: 90, lines: ['ren_a02_03', 'ren_a02_04', 'ren_a02_05'] },
        done: [{ castFollow: 'ren_swordswoman', target: null }],
      },
      water: { watch: { point: 'hall_grave', radius: 3, prompt: 'Pour the water', sayAt: { hall_grave: 'asagiri_a02_04' } } },
      asagiri: { watch: { npc: 'asagiri_tomoe' }, done: [{ say: 'asagiri_a02_05' }, { wait: 5 }, { say: 'asagiri_a02_06' }] },
    },
  },
  tr_t01_the_count: {
    offer: ['paneb_t01_01'],
    complete: ['paneb_t01_07', 'paneb_t01_08'],
    steps: {
      jars_a: {
        watch: { from: 'landing_jetty', to: 'landing_stack', radius: 4, prompt: 'Lift a grain jar', sayEach: ['paneb_t01_02', 'paneb_t01_03'] },
        done: [
          { say: 'sabu_t01_01' },
          // River-jaws once they exist; ink shades from the reeds until then.
          { spawnGroup: { groupId: 'tr_t01_reed_shades', placeId: 'P24', kind: 'ink_shade', count: 4, at: 'landing_reeds', radius: 6, tier: 'normal' } },
        ],
      },
      reeds: { watch: { groupId: 'tr_t01_reed_shades' }, done: [{ say: 'sabu_t01_02' }] },
      jars_b: {
        watch: { from: 'landing_jetty', to: 'landing_stack', radius: 4, prompt: 'Lift a grain jar', sayEach: ['paneb_t01_04', 'paneb_t01_05'] },
      },
      tally: { watch: { npc: 'paneb_scribe' }, done: [{ say: 'paneb_t01_06' }] },
      case: { watch: { point: 'landing_bowcase', radius: 3, prompt: 'Look at the bow case', sayAt: { landing_bowcase: 'sabu_t01_03' } } },
    },
  },
  tr_t02_opening_of_the_mouth: {
    offer: ['meresankh_t02_01', 'meresankh_t02_02', 'meresankh_t02_03'],
    complete: ['meresankh_t02_15'],
    completeByChoice: { step: 'sixth', lines: { free: 'meresankh_t02_13', leave: 'meresankh_t02_14' } },
    steps: {
      thief: {
        // A jackal shade once four-legged ink beasts exist; a champion ink shade until then.
        start: [{ spawnGroup: { groupId: 'tr_t02_blade_thief', kind: 'ink_shade', count: 1, at: 'scarred_blade', radius: 2, tier: 'champion' } }],
        watch: { groupId: 'tr_t02_blade_thief' },
      },
      blade: { watch: { point: 'scarred_blade', radius: 4, prompt: 'Take up the blade' } },
      ravine: {
        start: [{ castDespawn: 'meresankh_priestess' }, { castSpawn: 'meresankh_priestess', at: 'ravine_chant', facing: Math.PI * 0.5 }],
        watch: { point: 'ravine_gate', radius: 8 },
        done: [
          { say: 'meresankh_t02_04' },
          { spawnGroup: { groupId: 'tr_t02_unopened', placeId: 'P26', kind: 'old_dead', count: 5, at: 'ravine_dead', radius: 9, tier: 'normal' } },
        ],
      },
      names: {
        watch: { groupId: 'tr_t02_unopened',
          sayEach: ['meresankh_t02_05', 'meresankh_t02_06', 'meresankh_t02_07', 'meresankh_t02_08', 'meresankh_t02_09'] },
      },
      rite: {
        watch: { point: 'ravine_chant', radius: 4, prompt: 'Hold the blade to the east', sayAt: { ravine_chant: 'meresankh_t02_10' } },
        done: [{ say: 'meresankh_t02_11' }],
      },
      guard: {
        watch: {
          point: 'ravine_chant', radius: 14, protect: 'meresankh_priestess',
          waves: [
            { at: 2, group: { groupId: 'tr_t02_ink_1', placeId: 'P26', kind: 'ink_shade', count: 3, at: 'ravine_ink', radius: 5, tier: 'normal' } },
            { at: 20, group: { groupId: 'tr_t02_ink_2', placeId: 'P26', kind: 'ink_shade', count: 3, at: 'ravine_gate', radius: 5, tier: 'normal' } },
          ],
        },
        done: [{ despawnGroup: 'tr_t02_ink_1' }, { despawnGroup: 'tr_t02_ink_2' }, { say: 'meresankh_t02_12' }],
      },
      sixth: {},
    },
  },
  tr_r01_old_vines_furrow: {
    offer: ['oldvine_r01_01', 'oldvine_r01_02'],
    complete: ['oldvine_r01_11'],
    steps: {
      plough: {
        start: [{ castFollow: 'titus_oldvine', target: 'player', distance: 3 }],
        watch: { trail: ['furrow_1', 'furrow_2', 'furrow_3'], radius: 4, legSeconds: 90 },
        along: { every: 14, lines: ['oldvine_r01_03', 'oldvine_r01_04'] },
        done: [
          { say: 'veranius_r01_01' }, { say: 'oldvine_r01_05' },
          // Ink-strays once four-legged ink beasts exist; ink shades until then.
          { spawnGroup: { groupId: 'tr_r01_mist_1', placeId: 'P36', kind: 'ink_shade', count: 4, at: 'furrow_mist_w', radius: 6, tier: 'normal' } },
        ],
      },
      mist: { watch: { groupId: 'tr_r01_mist_1' }, done: [{ say: 'oldvine_r01_06' }] },
      finish: {
        watch: { point: 'furrow_end', radius: 4 },
        done: [
          { say: 'veranius_r01_02' },
          { spawnGroup: { groupId: 'tr_r01_mist_2', placeId: 'P36', kind: 'ink_shade', count: 4, at: 'furrow_mist_e', radius: 6, tier: 'normal' } },
        ],
      },
      again: { watch: { groupId: 'tr_r01_mist_2' }, done: [{ say: 'oldvine_r01_07' }] },
      stone: {
        watch: { point: 'furrow_stone', radius: 3, prompt: 'Set the boundary stone', sayAt: { furrow_stone: 'oldvine_r01_08' } },
        done: [{ say: 'veranius_r01_03' }, { castFollow: 'titus_oldvine', target: null }],
      },
      vine: { watch: { npc: 'titus_oldvine' }, done: [{ say: 'oldvine_r01_10' }] },
      case: { watch: { point: 'furrow_cart', radius: 3, prompt: "Look at the archer's case", sayAt: { furrow_cart: 'oldvine_r01_09' } } },
    },
  },
  tr_r02_the_crack: {
    offer: ['corvinus_r02_01', 'corvinus_r02_02'],
    complete: ['corvinus_r02_05'],
    completeByChoice: { step: 'answer', lines: { truth: 'aelia_r02_02', nothing: 'aelia_r02_03' } },
    steps: {
      meet: {
        start: [{ castSpawn: 'courier_dexter', at: 'road_top', facing: Math.PI * 1.5 }],
        watch: { point: 'road_top', radius: 8 },
        done: [
          { say: 'courier_r02_01' },
          { castFollow: 'courier_dexter', target: 'player', distance: 3 },
          { spawnGroup: { groupId: 'tr_r02_ambush', kind: 'ink_shade', count: 5, at: 'road_ambush', radius: 8, tier: 'normal' } },
        ],
      },
      ambush: { watch: { groupId: 'tr_r02_ambush' }, done: [{ say: 'courier_r02_02' }] },
      escort: {
        watch: { people: ['courier_dexter'], to: 'fort_gate', radius: 8 },
        along: { every: 60, lines: ['courier_r02_03', 'courier_r02_04'] }, // about 200 m along the High Road, past the crossroads and down to the north gate
        done: [{ castFollow: 'courier_dexter', target: null }, { castMove: 'courier_dexter', to: 'fort_tent', speed: 1.8 }],
      },
      tent: {
        watch: { point: 'fort_overhear', radius: 3 },
        done: [
          { say: 'corvinus_r02_03' }, { wait: 4 },
          { say: 'courier_r02_05' }, { wait: 5 },
          { say: 'corvinus_r02_04' }, { wait: 4 },
          { say: 'aelia_r02_01' },
        ],
      },
      aelia: { watch: { npc: 'aelia_sabina' } },
      answer: {},
    },
  },
});
