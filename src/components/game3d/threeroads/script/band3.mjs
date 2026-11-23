// The War of Three Roads, band 3: the first half of the main story after the
// opening. Chapters 3 to 6: the Jade Lantern Grotto, the Wolf Stones, Whispering
// Root Hollow and the Sunken Inkstone Cistern. Written by the lead session.
// Same parts and the same staging vocabulary as band1.mjs and band2.mjs (read
// their headers first).
//
// Every person, line and event is original.
//
// WHAT THIS BAND ASKS OF THE BUILDERS (none of it is built yet; the band is
// `staged: false` in index.mjs, so it is not offered even in the preview)
//   Points under the valley. BAND3_POINT_REGIONS maps a point-name prefix to a
//     region id. Those points lie in that region's own scene (the four caves
//     are one scene, 'wolfveil-caves'), in the same LOCAL metres as the valley.
//     A cue or a watch on such a point belongs to that scene only, exactly as a
//     point in another area does today.
//   People who stand for someone else. `own_commander` and `rival_champion` are
//     roles (cast.mjs, THREE_ROADS_ROLES): wherever a person id is expected, a
//     role means the person it names for the player's empire.
//   One body, three looks. The standard-bearer wears the colours of the
//     player's own empire (`look.byEmpire` in cast.mjs).
//   Monsters the game cannot show yet. A group may carry `name` (what is shown
//     over the health bar) and `becomes` (a kind in BAND3_KINDS). `kind` stays
//     one of today's three; when the kind in `becomes` exists it replaces it.
//   A mural lit by the fight. A `defeat` watch may carry `stroke: <cave id>`:
//     each death puts one stroke of light back on that cave's mural. Decoration
//     only: nothing waits for it.
//   Sounds new to this band: ink_wash, root_roar, murals_dark, water_rising,
//     water_closes.
//
// WHAT THE REAL GROUND SAID (measured 2026-11-22)
//   A ring at a cave's mouth takes the player into the caves' scene at the Wolf
//     Rotunda, not into that cave: the Jade Grotto's painted chamber is then
//     580 m of tunnel away. These chapters are written for arriving in the hall
//     of the cave you entered.
//   The only path to Whispering Root Hollow passes 12 m from the edge of a camp
//     of level 35 dead (Wolfstone Reach). The muster stands on the shelf south
//     of the Cedar Spine Gate, 45 m clear of both camps beside it.
//   The Sunken Inkstone Cistern's mouth lies 20 m beyond the edge a player can
//     walk to, and its path crosses its own terraces at 50 to 79 degrees. The
//     doorways session is moving that path's bend (branch
//     claude/wolfveil-north-route-20261122), which turns the ledge it used to
//     reach into a cliff; the mouth stays beyond the edge either way. So the
//     surface points of chapter 6 stop at the Wolf-Ear Vigil, where the trail
//     leaves the ridge path: ground measured walkable on both versions.

import { WOLFVEIL_EXPLORABLE_CAVES } from '../../wolfveil/WolfveilCaveLayout.mjs';

const line = (speaker, text) => Object.freeze({ speaker, text });
const point = (x, z) => Object.freeze({ x, z });

// Where a cave's ring sets a player down: this far in from the mouth, along the cave's own
// direction. Taken from the cave layout rather than written out, so that a hall follows
// its mouth when the caves' owner moves one (the Cistern's mouth is being moved inside
// the edge of the walkable ground).
export const BAND3_HALL_METRES_IN = 16;
const hall = caveId => {
  const cave = WOLFVEIL_EXPLORABLE_CAVES.find(entry => entry.id === caveId);
  const at = axis => Math.round((cave.mouth[axis] + cave.dir[axis] * BAND3_HALL_METRES_IN) * 100) / 100;
  return point(at(0), at(1));
};

export const BAND3_POINTS = Object.freeze({
  // West: the path's end below the Jade Lantern Grotto (P44). Captain Arlen stands 4 m on.
  jade_gate: point(-349, -386),
  // West: the Wind-Carved Wolf Stones (P18). The game's own camp of echoes lives here
  // (spawns at -338,230  -324,222  -314,243); the cairn stands 25 m clear of all three.
  echo_approach: point(-322, 198),
  echo_touch: point(-327, 233),
  echo_stand: point(-323, 229),
  echo_wave_west: point(-350, 222),
  echo_wave_east: point(-305, 232),
  echo_wave_south: point(-330, 205),
  echo_cairn: point(-300, 214),
  // West: the muster, on the level shelf south of the Cedar Spine Gate (-409.5, 240)
  muster_truce: point(-386, 228),
  muster_akitsu: point(-382, 221),
  muster_tameri: point(-379, 228),
  muster_remoria: point(-382, 235),
  muster_trail: point(-402, 236),
  // North: the bench in front of Whispering Root Hollow's mouth (P45)
  hollowpath_mouth: point(-492.6, 292.5),
  // North: the Wolf-Ear Vigil (P40), where the trail to the Sunken Inkstone Cistern (P46)
  // leaves the ridge path, and a spot 18 m along that trail
  peaks_vigil: point(2, 470),
  peaks_rival: point(-16, 470),
  // Under the valley: Jade Lantern Grotto (hall, then a chamber 15 m in radius round -376.4, -425.1)
  grotto_hall: hall('jade_lantern_grotto'), // (-368.76, -413.39) today
  grotto_hares: point(-374.2, -421.8),
  grotto_mural: point(-384, -420.2),
  grotto_stag: point(-379.7, -430.1),
  grotto_socket: point(-382.5, -434.3),
  grotto_brush: point(-378.8, -434.3),
  // Under the valley: Whispering Root Hollow (chamber 16 m in radius round -522.5, 322.8)
  hollow_hall: hall('whispering_root_hollow'), // (-511.23, 311.39) today
  hollow_embers: point(-518.2, 318.5),
  hollow_pyre: point(-526.7, 327.1),
  hollow_mural: point(-530.2, 330.6),
  // Under the valley: Sunken Inkstone Cistern (chamber 16.5 m in radius round -51.6, 580)
  cistern_hall: hall('sunken_inkstone_cistern'), // (-45.44, 563.04) today; (-42.29, 515.84) once the mouth moves to (-40, 500)
  cistern_koi: point(-50.2, 576.2),
  cistern_page_1: point(-60, 576.9),
  cistern_page_2: point(-43.1, 583),
  cistern_page_3: point(-59.2, 583.6),
  cistern_pool: point(-54.6, 588.4),
  cistern_edge: point(-48, 587.7),
});

// Which area each group of surface points lies in (checked by the script test).
export const BAND3_POINT_AREAS = Object.freeze({
  jade_: 'west', echo_: 'west', muster_: 'west',
  hollowpath_: 'north', peaks_: 'north',
});

// Which region's scene each group of points under the valley lies in.
export const BAND3_POINT_REGIONS = Object.freeze({
  grotto_: 'wolfveil-caves', hollow_: 'wolfveil-caves', cistern_: 'wolfveil-caves',
});

// The monsters this band means. `standIn` is the kind the game can show today.
// `shape`: which skeleton it shares (03_QUEST_PLAN.md, section 12).
export const BAND3_KINDS = Object.freeze({
  ink_hare: Object.freeze({ name: 'Ink Hare', shape: 'four-legged', standIn: 'ink_shade', boss: false }),
  painted_stag: Object.freeze({ name: 'The Painted Stag', shape: 'four-legged', standIn: 'ink_shade', boss: true }),
  old_soldier_akitsu: Object.freeze({ name: 'Banner-man of the Old War', shape: 'two-legged', standIn: 'echo', boss: false }),
  old_soldier_tameri: Object.freeze({ name: 'Pennant-bearer of the Old War', shape: 'two-legged', standIn: 'echo', boss: false }),
  old_soldier_remoria: Object.freeze({ name: 'Red Shield of the Old War', shape: 'two-legged', standIn: 'echo', boss: false }),
  root_ember: Object.freeze({ name: 'Root Ember', shape: 'two-legged', standIn: 'ink_shade', boss: false }),
  root_pyre: Object.freeze({ name: 'The Root Pyre', shape: 'shape and light', standIn: 'ink_shade', boss: true }),
  ink_koi: Object.freeze({ name: 'Ink Koi', shape: 'water', standIn: 'ink_shade', boss: false }),
  drowned_ink: Object.freeze({ name: 'The Drowned Ink', shape: 'water', standIn: 'ink_shade', boss: true }),
  grasping_water: Object.freeze({ name: 'Grasping Water', shape: 'water', standIn: 'ink_shade', boss: false }),
});

// A group of one of this band's kinds: today's stand-in, with the name and the kind it becomes.
const group = (becomes, rest) => ({ kind: BAND3_KINDS[becomes].standIn, name: BAND3_KINDS[becomes].name, becomes, ...rest });

// What the socket of chapter 3 holds, by the player's empire: a thing that points at one of
// the other two (the one whose keepsake the player does NOT carry). Chapter 4 shows what it is.
export const BAND3_TOKENS = Object.freeze({
  akitsu: Object.freeze({ accuses: 'remoria', flag: 'tr_token_remoria', thing: "a bronze cloak pin with a wolf's head" }),
  tameri: Object.freeze({ accuses: 'akitsu', flag: 'tr_token_akitsu', thing: 'an iron crest, a bear in a ring' }),
  remoria: Object.freeze({ accuses: 'tameri', flag: 'tr_token_tameri', thing: 'a blue glazed star on a cord' }),
});

export const BAND3_LINES = Object.freeze({
  // ── M03 The First Stroke ─────────────────────────────────────────────
  kira_m03_01: line('archer_kira', "You're the one who chased it. Good. Smell this. It's the ink off Sable's three arrows, and it is still wet. Ordinary ink dries in an hour. This hasn't dried since the day Maren died."),
  kira_m03_02: line('archer_kira', "Only one place in the valley bleeds ink that stays wet: the Jade Lantern Grotto, far south-west, past the deserters' fires. Master Hesper is down there, renewing the first mural. Ask him what could draw an archer out of a wall."),
  arlen_m03_01: line('jade_watch_captain', "Hold. Jade Watch. Kira sent you? Then go down, and go armed. The hares came off the wall four nights ago, and they don't behave like hares."),
  arlen_m03_02: line('jade_watch_captain', "The old master is still in there. He wouldn't come out. He said the mural needs him more than he needs his legs."),
  hesper_m03_01: line('master_hesper', "Is that someone on the stair? Mind the hares, child. They were only grass strokes until last week. I painted half of them myself."),
  hesper_m03_02: line('master_hesper', "There. Look at the wall. Each one you put down goes back where it belongs, as one stroke of light. You fight very neatly. I could never teach that."),
  hesper_m03_03: line('master_hesper', "Ah. Now you have woken the stag. It guards the socket. Stand away from me, please. I am too old to be trampled, and I have a line to finish."),
  hesper_m03_04: line('master_hesper', "Gently done. It will be back on the wall by morning, a little thinner. They all come back thinner."),
  hesper_m03_05: line('master_hesper', "Come under the lamp. This is the first mural: a wolf in grass strokes, with one tooth missing. Someone drew that tooth a year ago. That was the night your roads opened."),
  hesper_m03_06: line('master_hesper', "The Keepers have left the wolf unfinished on purpose for longer than there has been a town. A finished god chooses a people. An unfinished one belongs to everyone. I have said that sentence all my life."),
  hesper_m03_token_remoria: line('master_hesper', "What did the socket give you? Show me. A bronze pin with a wolf's head. The legions wear those on their cloaks. Oh dear. I had hoped it would be nobody."),
  hesper_m03_token_akitsu: line('master_hesper', "What did the socket give you? Show me. An iron crest, a bear in a ring. The blue coats wear that on their caps. Oh dear. I had hoped it would be nobody."),
  hesper_m03_token_tameri: line('master_hesper', "What did the socket give you? Show me. A blue glazed star on a cord. The river soldiers wear those at the throat. Oh dear. I had hoped it would be nobody."),
  hesper_m03_07: line('master_hesper', "Don't take it to your commander yet. A thing like that starts a battle before it finishes a sentence. Take it to the Wolf Stones first. The stones remember hands. Noor walks out that way. Ask her."),
  hesper_m03_08: line('master_hesper', "Go on. I will be here. There is always one more stroke."),
  hesper_m03_09: line('master_hesper', "That? Mine. I drop them everywhere. An old man's hands. Leave it, child. The floor has more of my brushes than the wall has strokes."),

  // ── M04 What the Wolf Stones Remember ────────────────────────────────
  noor_m04_01: line('archer_noor', "Hesper sent you to me? Then he has finally run out of answers. Let me see it. Old. Older than it looks. Somebody has polished it."),
  noor_m04_02: line('archer_noor', "I walk the whole valley, and the Wolf Stones are the one place I never sleep. Things are still happening there. Touch that to the tallest stone and stand your ground. Whatever you see has already ended. It won't feel that way."),
  bearer_m04_01: line('thrown_standard_bearer', "You. Where is your company? Never mind. Stand with me, back to the stone. They come in three colours, and they all cut the same."),
  bearer_m04_blue: line('thrown_standard_bearer', "The mountain banners. Good soldiers. They bow before they kill you. It doesn't help."),
  bearer_m04_own_akitsu: line('thrown_standard_bearer', "Those were my own. Third company. I taught two of them to tie their sandals. Don't stop. They won't."),
  bearer_m04_gold: line('thrown_standard_bearer', "The river people. They sing as they come up the hill. I still hear the song. I never learned what it meant."),
  bearer_m04_own_tameri: line('thrown_standard_bearer', "Those were my own. My sister's husband stood in that line. Don't stop. He wouldn't have."),
  bearer_m04_red: line('thrown_standard_bearer', "The red shields. They never break a line. You have to break every man in it."),
  bearer_m04_own_remoria: line('thrown_standard_bearer', "Those were my own. I carried their standard eleven years. Don't stop. Nobody ever taught them how."),
  bearer_m04_02: line('thrown_standard_bearer', "Enough. Look at them. Three days of this, and the hill is the same hill. Show me the thing you carry."),
  bearer_m04_token_akitsu: line('thrown_standard_bearer', "A wolf's head pin. I killed the man who wore it, there, where you are standing. He had his daughter's ribbon tied inside his shield. He was the last. After him I put the banner down."),
  bearer_m04_token_tameri: line('thrown_standard_bearer', "A bear in a ring. I killed the boy who wore it, there, where you are standing. He had a poem folded in his sleeve. He was the last. After him I put the standard down."),
  bearer_m04_token_remoria: line('thrown_standard_bearer', "A river star on a cord. I killed the woman who wore it, there, where you are standing. She had bread in her belt for somebody. She was the last. After her I put the standard down."),
  bearer_m04_03: line('thrown_standard_bearer', "Four hundred years in the ground, and somebody has dug it up and polished it to start the same fight. Whoever left that for you did not lose it. Come. I'll show you what I did instead."),
  bearer_m04_04: line('thrown_standard_bearer', "I planted the standard here and sat down under it. A man from the other line sat down beside me. Then a woman from the third, with a child. By the snow there were forty of us. We built a wall round a spring so the children had water."),
  bearer_m04_05: line('thrown_standard_bearer', "That wall is your fountain. This valley was never anybody's promised land. It is what was left when three armies went home without us."),
  bearer_m04_06: line('thrown_standard_bearer', "Take a strip of the cloth. It has no colour now. That is the point of it. And look north-west, along the ridge. That red is not sunset. The roots are burning. It is starting again."),
  noor_m04_03: line('archer_noor', "You saw him. I can tell. Nobody comes back from the stones talking. My grandmother said the first of us was a soldier who sat down. I thought it was a story for children."),
  noor_m04_04: line('archer_noor', "Keep what they left you in that socket. Only know what it is now: a dead soldier's, dug up and polished. Somebody in this valley wants a war, and knows where the old ones are buried."),
  noor_m04_05: line('archer_noor', "And the glow on the north-west ridge is Root Hollow. Vex has watched it for two nights. All three camps have seen it too. Find him before they march."),

  // ── M05 Root Fire ────────────────────────────────────────────────────
  vex_m05_01: line('archer_vex', "You've been to the stones. Good. Then you'll believe me. Root Hollow has burned from the inside for two nights. There's a second Tooth in that cave, and all three camps know it. They marched at dawn."),
  vex_m05_02: line('archer_vex', "Three columns, one cave mouth, and a path one cart wide. Sable has gone up to stand in the middle with a stick. The muster is on the shelf below the Cedar Spine Gate. Go and stand where you think you should."),
  sable_m05_01: line('sable_vey', "You came. Look at them. A year of noons at the fountain, and this is the first time all three have stood in one place under arms. I am holding it together with a staff and a bad temper."),
  sable_m05_02: line('sable_vey', "Go to your own standard. I won't ask you not to. Only remember that there are three, and that you could count them all from here."),
  hayasaka_m05_01: line('hayasaka_colonel', "You are the one the Watch speaks of. Good. Akitsu needs that iron more than it needs my regiment. When the mouth opens, you go in first. Bring it to me and to nobody else."),
  nakhtamun_m05_01: line('nakhtamun_general', "The scribe says you can carry and the priestess says you can stand. Then you go in first. A star fell for the Beloved Land. Bring me the piece of it, and my soldiers eat."),
  corvinus_m05_01: line('corvinus_legate', "Old Vine has given me your name twice. The Senate wants that shard inside our lines by nightfall. You go in first. Bring it to me, and say nothing to anyone on the way down."),
  sable_m05_03: line('sable_vey', "No colours? Then you stand with me. When the mouth opens you go in first, because nobody here will loose at someone who belongs to none of them. I think."),
  sable_m05_04: line('sable_vey', "Fire in the trees! It's coming down the trail from the cave! Shields, spears, anything you have. All of you, face north!"),
  sable_m05_05: line('sable_vey', "Did you see that? Blue, gold and red in one line, and nobody gave the order. I counted ninety breaths. I am going to remember every one of them."),
  sable_m05_06: line('sable_vey', "You have it. Every eye on this shelf is on your hands. Before it goes into anybody's strongbox, hold it up. Let the other two see that it is real, and that it is one small shard and not a miracle. It might buy the valley a week."),
  hayasaka_m05_02: line('hayasaka_colonel', "So that is what the mountain sent us for. It is smaller than the telegram made it sound. Keep it wrapped and put it in my hand. Not theirs. Mine."),
  nakhtamun_m05_02: line('nakhtamun_general', "A tooth of the Sharp One. The priestess wants it for the river and the smiths want it for blades. Tonight it is mine. Wrapped, into my hand, and quickly."),
  corvinus_m05_02: line('corvinus_legate', "Thirty thousand land grants ride on a thing the size of a dagger. Keep it wrapped. Into my hand, and then you will forget how much it weighed."),
  sable_m05_07: line('sable_vey', "It should sleep under the Truce Stone, where no general can count it. Held high or kept wrapped, that is where I will carry it. How you hand it to me is yours to choose."),
  sable_m05_08: line('sable_vey', "You held it up. Three armies looked at one small piece of iron, and nobody cheered. That silence was worth more than my staff. Go and find Lyra. Something woke under the northern peaks when that wall went dark."),
  sable_m05_09: line('sable_vey', "You kept it close. At your age and in your coat, so would I. Go and find Lyra. Something woke under the northern peaks when that wall went dark."),

  // ── M06 The Drowned Ledger ───────────────────────────────────────────
  lyra_m06_01: line('archer_lyra', "Four hundred and twelve. I've moved you up my count, onto the short list of people I'd miss. When the second Tooth left its wall, a mural lit under the northern peaks. A koi, under water."),
  lyra_m06_02: line('archer_lyra', "That is the Sunken Inkstone Cistern. The Keepers kept their records there before the spring drowned it. If this has happened before, somebody wrote it down. Climb to the Wolf-Ear Vigil, take the trail up from there, and read me what is left."),
  tiaa_m06_01: line('tiaa_archer', "A blue coat. Of course. I'm here for the same thing you are, and I have the longer legs. Try to keep up."),
  casca_m06_01: line('brenna_casca', "River soldier. You're late. The Ninth sent one optio for this, and she is already at the door. Stay out of my way down there."),
  ren_m06_01: line('ren_swordswoman', "A red cloak. My mistress says your people march well and climb badly. Race you to the bottom."),
  ledger_m06_01: line('drowned_ledger', "In the year the star fell lower, three hosts came by three roads: banners from the mountains, standards from the plain, pennants from the river. They fought nine days for the spring. Then nobody was left to hold it."),
  ledger_m06_02: line('drowned_ledger', "Two hundred years on, three hosts again. The banners held the west wood and the pennants the east bank. The harvest burned in the ninth week. After that, nobody could remember what the quarrel had been."),
  ledger_m06_akitsu: line('drowned_ledger', "Four hundred years ago: the third company of the mountain banners, sent for iron, four hundred strong. Forty answered the roll at the first snow. Their standard-bearer is listed among neither the dead nor the living."),
  ledger_m06_tameri: line('drowned_ledger', "Four hundred years ago: a grain column of the river host, sent in a dry year, four hundred strong. Forty answered the roll at the first snow. Their standard-bearer is listed among neither the dead nor the living."),
  ledger_m06_remoria: line('drowned_ledger', "Four hundred years ago: a cohort of the red shields, sent to mark out farms, four hundred strong. Forty answered the roll at the first snow. Their standard-bearer is listed among neither the dead nor the living."),
  ledger_m06_03: line('drowned_ledger', "Every war in this book turned at the harvest. Whoever holds the fields in the ninth week holds nothing by the tenth. Set down by the keeper of the brush, who has copied this page before."),
  tiaa_m06_02: line('tiaa_archer', "Blue coat! The Tooth is in the wall, under the water. I can see it and I can't reach it. You're nearer. Go. I'll keep the edge clear."),
  casca_m06_02: line('brenna_casca', "River soldier! The Tooth is in the wall, under the water. I can see it and I cannot reach it. You are nearer. Go. I have the edge."),
  ren_m06_02: line('ren_swordswoman', "Red cloak! The Tooth's in the wall, under the water. I can see it and I can't reach it. You're nearer. Go. I'll hold the edge."),
  tiaa_m06_03: line('tiaa_archer', "It has you by the arm. Don't you dare let go of that thing. Give me your other hand. Now!"),
  casca_m06_03: line('brenna_casca', "It has your arm. Hold the shard. Hold it! Other hand, soldier. That is an order, and I don't care whose army you are."),
  ren_m06_03: line('ren_swordswoman', "It's got your arm! Don't drop it. Don't you dare. Other hand. Give me your other hand!"),
  tiaa_m06_04: line('tiaa_archer', "We are not going to talk about this. I pulled, you cut, the water lost. If you see me across a field next week, aim badly. I'll do the same. Once."),
  casca_m06_04: line('brenna_casca', "This did not happen. I would have to report it, and I am not going to. Take your shard to your people. I will take the bruises to mine."),
  ren_m06_04: line('ren_swordswoman', "My mistress would say a debt was made here. So I won't tell her. Go on. Next time we meet I'll be trying, and I hope you will be too."),
  hayasaka_m06_01: line('hayasaka_colonel', "A second one. The telegram will say I am to be congratulated. Sit down. You are shaking, and you have not told me everything. I will not ask."),
  nakhtamun_m06_01: line('nakhtamun_general', "Two teeth of the Sharp One. For once the count goes up. You are wet through, and somebody held your arm in there. I can see the marks. I did not see them."),
  corvinus_m06_01: line('corvinus_legate', "Two. The Senate will want four. You have a rope burn on one wrist and you are not going to explain it. Good. I have no use for the explanation."),
  sable_m06_01: line('sable_vey', "Another for under the stone. You are wet through, and somebody's fingers have left marks on your wrist. Whoever it was, I hope they got home too."),
  lyra_m06_03: line('archer_lyra', "Three wars. Nine days, then nine weeks, then a column of four hundred that answered forty at the snow. And every one turned at the harvest. Say that part again, so I know I heard it."),
  lyra_m06_04: line('archer_lyra', "The Gate Fields are ripe this week, and all three quartermasters have been counting wagons. If the old book is right, this war is about to stop being about a shard and start being about bread."),
});

const MAIN = 200; // above every quest the five archers already offer

export const BAND3_PLEDGES = Object.freeze([
  {
    id: 'tr_m03_the_first_stroke',
    npcId: 'archer_kira',
    title: 'The First Stroke',
    description: 'The ink on the three arrows has never dried. Kira knows one place where ink stays wet: the Jade Lantern Grotto, where Master Hesper is renewing the first mural.',
    unlockLevel: 6,
    recommendedLevel: 8,
    priority: MAIN,
    category: 'chapter',
    requires: 'tr_m02_three_arrows',
    storyFlagsRequired: ['tr_war_open'],
    storyFlagsOnComplete: ['tr_m03_done'],
    pledge: {
      line: 'main',
      chapter: 3,
      swornTo: 'Kira the Scout, of the Fountain Watch',
      cause: 'Whoever killed Elder Maren used ink that has not dried, and the only ink like it comes off the wall of the first mural.',
      cost: 'What you find in the socket will point at somebody, and you will have to decide who is told.',
      steps: [
        { id: 'mouth', kind: 'go_to', text: 'Go to the Jade Lantern Grotto, in the far south-west.', target: 'tr_m03_grotto_gate', placeId: 'P44' },
        { id: 'descend', kind: 'go_to', text: 'Go down into the grotto.', target: 'tr_m03_grotto_hall', placeId: 'P44' },
        { id: 'hares', kind: 'defeat', text: 'Go down through the Ink Hares to the painted chamber.', target: 'tr_m03_ink_hares', placeId: 'P44', count: 6 },
        { id: 'stag', kind: 'defeat', text: 'Bring down the Painted Stag at the empty socket.', target: 'tr_m03_painted_stag', placeId: 'P44' },
        { id: 'socket', kind: 'pick_up', text: 'Take what was left in the socket.', target: 'tr_socket_token', placeId: 'P44' },
        { id: 'hesper', kind: 'talk', text: 'Speak with Master Hesper under the mural.', target: 'master_hesper' },
        { id: 'brush', kind: 'pick_up', text: 'A brush lies beside the socket, its hairs still wet. Look at it.', target: 'tr_m03_wet_brush', optional: true },
      ],
      standings: { kept: { trust: 5 }, broken: { trust: -2 }, optional: { brush: { regard: 1 } } },
      rewardPreview: { kinds: ['experience', 'trust', 'lesson'] },
    },
  },
  {
    id: 'tr_m04_what_the_stones_remember',
    npcId: 'archer_noor',
    title: 'What the Wolf Stones Remember',
    description: 'Hesper says the Wolf Stones remember hands. Noor, who walks the whole valley, will not sleep there.',
    unlockLevel: 8,
    recommendedLevel: 9,
    priority: MAIN,
    category: 'chapter',
    requires: 'tr_m03_the_first_stroke',
    storyFlagsRequired: ['tr_m03_done'],
    storyFlagsOnComplete: ['tr_m04_done', 'tr_keepsake_thrown_standard'],
    pledge: {
      line: 'main',
      chapter: 4,
      swornTo: 'Noor the Wanderer, of the Fountain Watch',
      cause: 'The thing from the socket accuses one of the three empires, and only the stones can say whose hands really held it.',
      cost: 'You will stand in a battle your own people fought here and lost, and you will not be able to stop any of it.',
      steps: [
        { id: 'stones', kind: 'go_to', text: 'Carry the token to the Wind-Carved Wolf Stones.', target: 'tr_m04_stones', placeId: 'P18' },
        { id: 'touch', kind: 'use', text: 'Touch the token to the tallest stone.', target: 'tr_m04_tallest_stone', placeId: 'P18', seconds: 3 },
        { id: 'wave_one', kind: 'defeat', text: 'Hold the stones against the mountain banners.', target: 'tr_m04_old_banners', placeId: 'P18', count: 4 },
        { id: 'wave_two', kind: 'defeat', text: 'Hold against the river pennants.', target: 'tr_m04_old_pennants', placeId: 'P18', count: 4 },
        { id: 'wave_three', kind: 'defeat', text: 'Hold against the red shields.', target: 'tr_m04_old_shields', placeId: 'P18', count: 4 },
        { id: 'cairn', kind: 'go_to', text: 'Follow the standard-bearer to the cairn.', target: 'tr_m04_cairn' },
        { id: 'cloth', kind: 'pick_up', text: 'Take a strip of the standard from under the top stone.', target: 'tr_thrown_standard' },
        { id: 'noor', kind: 'talk', text: 'Return to Noor.', target: 'archer_noor' },
      ],
      standings: { kept: { trust: 6, regard: 1 }, broken: { trust: -2 } },
      rewardPreview: { kinds: ['experience', 'trust', 'keepsake'] },
    },
  },
  {
    id: 'tr_m05_root_fire',
    npcId: 'archer_vex',
    title: 'Root Fire',
    description: 'Whispering Root Hollow is burning from the inside, the second Tooth is in it, and all three armies marched for its mouth at dawn.',
    unlockLevel: 12,
    recommendedLevel: 14,
    priority: MAIN,
    category: 'chapter',
    requires: 'tr_m04_what_the_stones_remember',
    storyFlagsRequired: ['tr_m04_done'],
    storyFlagsOnComplete: ['tr_m05_done'],
    pledge: {
      line: 'main',
      chapter: 5,
      swornTo: 'Vex the Hunter, of the Fountain Watch, and your own commander',
      cause: 'Three armies are about to meet at one cave mouth, and whoever brings the Tooth out decides whether they fight over it there.',
      cost: 'When the Tooth leaves the wall the murals go dark behind you, and every eye on the hill is on your hands.',
      steps: [
        { id: 'muster', kind: 'go_to', text: 'Go to the muster on the shelf below the Cedar Spine Gate, in the north-west.', target: 'tr_m05_muster' },
        { id: 'standard', kind: 'talk', text: 'Stand under your own standard and hear your commander.', target: 'own_commander' },
        { id: 'line', kind: 'defeat', text: 'Fire is coming down the trail. Hold the line with all three columns.', target: 'tr_m05_trail_embers', count: 6 },
        { id: 'mouth', kind: 'go_to', text: 'Go through the Cedar Spine Gate and climb to the mouth of Whispering Root Hollow.', target: 'tr_m05_hollow_mouth', placeId: 'P45' },
        { id: 'enter', kind: 'go_to', text: 'Go into the hollow.', target: 'tr_m05_hollow_hall', placeId: 'P45' },
        { id: 'embers', kind: 'defeat', text: 'Cut through the Root Embers.', target: 'tr_m05_root_embers', placeId: 'P45', count: 6 },
        { id: 'pyre', kind: 'defeat', text: 'Put out the Root Pyre.', target: 'tr_m05_root_pyre', placeId: 'P45' },
        { id: 'tooth', kind: 'use', text: 'Draw the second Tooth from the mural.', target: 'tr_second_tooth', placeId: 'P45', seconds: 4 },
        { id: 'down', kind: 'go_to', text: 'Carry the Tooth out and down to the muster.', target: 'tr_m05_muster_return' },
        { id: 'commander', kind: 'talk', text: 'Bring the Tooth to your commander.', target: 'own_commander' },
        { id: 'show', kind: 'choose', text: 'Decide how the Tooth changes hands.' },
      ],
      choices: {
        show: {
          prompt: 'Three columns are watching your hands.',
          options: [
            { id: 'raise', text: 'Hold the Tooth up where all three can see it, then hand it over.', flags: ['tr_m05_tooth_shown'] },
            { id: 'wrap', text: "Keep it wrapped, and put it in your commander's hand.", flags: ['tr_m05_tooth_hidden'] },
          ],
        },
      },
      standings: { kept: { renown: 5, trust: 2 }, broken: { renown: -2 } },
      rewardPreview: { kinds: ['experience', 'renown', 'lesson'] },
    },
  },
  {
    id: 'tr_m06_the_drowned_ledger',
    npcId: 'archer_lyra',
    title: 'The Drowned Ledger',
    description: 'A mural has lit under the northern peaks: a koi, under water. The Keepers kept their records in that cistern before the spring drowned it.',
    unlockLevel: 18,
    recommendedLevel: 21,
    priority: MAIN,
    category: 'chapter',
    requires: 'tr_m05_root_fire',
    storyFlagsRequired: ['tr_m05_done'],
    storyFlagsOnComplete: ['tr_m06_done', 'tr_keepsake_ledger_pages'],
    pledge: {
      line: 'main',
      chapter: 6,
      swornTo: 'Lyra the Seeker, Captain of the Fountain Watch',
      cause: 'If the Roads have opened before, the Keepers wrote down how it ended, and nobody alive has read it.',
      cost: 'Somebody you are at war with will hold your arm in the dark, and neither of you may ever say so.',
      steps: [
        { id: 'climb', kind: 'go_to', text: "Climb the ridge path to the Wolf-Ear Vigil, where the cistern's trail begins.", target: 'tr_m06_vigil', placeId: 'P40' },
        { id: 'enter', kind: 'go_to', text: 'Go down into the Sunken Inkstone Cistern.', target: 'tr_m06_cistern_hall', placeId: 'P46' },
        { id: 'koi', kind: 'defeat', text: 'Fight down through the Ink Koi to the flooded archive.', target: 'tr_m06_ink_koi', placeId: 'P46', count: 6 },
        { id: 'pages', kind: 'use', text: 'Read two pages of the drowned ledger.', target: 'tr_m06_ledger_pages', placeId: 'P46', count: 2, seconds: 3 },
        { id: 'last_page', kind: 'use', text: 'Read the third page.', target: 'tr_m06_ledger_last', placeId: 'P46', seconds: 3 },
        { id: 'drowned', kind: 'defeat', text: 'Bring down the Drowned Ink.', target: 'tr_m06_drowned_ink', placeId: 'P46' },
        { id: 'tooth', kind: 'use', text: 'Reach under the water and draw the third Tooth.', target: 'tr_third_tooth', placeId: 'P46', seconds: 4 },
        { id: 'hand', kind: 'talk', text: 'Take the hand held out to you.', target: 'rival_champion' },
        { id: 'loose', kind: 'defeat', text: 'The water has turned on the one who pulled you out. Cut them loose.', target: 'tr_m06_grasping_water', placeId: 'P46', count: 3 },
        { id: 'commander', kind: 'deliver', text: 'Take the third Tooth to your commander.', target: 'own_commander' },
        { id: 'lyra', kind: 'talk', text: 'Tell Lyra what the ledger said.', target: 'archer_lyra' },
      ],
      standings: { kept: { trust: 6, renown: 3 }, broken: { trust: -2 } },
      rewardPreview: { kinds: ['experience', 'trust', 'lesson', 'keepsake'] },
    },
  },
]);

// The muster below the Cedar Spine Gate: Sable Vey in the middle, a commander under each
// standard behind her, all looking west to the trail. Hayasaka's own camp is in this area,
// so he leaves it first.
const MUSTER = Object.freeze([
  { castSpawn: 'sable_vey', at: 'muster_truce', facing: Math.PI * 1.5 },
  { castDespawn: 'hayasaka_colonel' },
  { castSpawn: 'hayasaka_colonel', at: 'muster_akitsu', facing: Math.PI * 1.5 },
  { castSpawn: 'nakhtamun_general', at: 'muster_tameri', facing: Math.PI * 1.5 },
  { castSpawn: 'corvinus_legate', at: 'muster_remoria', facing: Math.PI * 1.5 },
]);

export const BAND3_STAGING = Object.freeze({
  tr_m03_the_first_stroke: {
    offer: ['kira_m03_01', 'kira_m03_02'],
    complete: ['hesper_m03_08'],
    steps: {
      mouth: {
        watch: { point: 'jade_gate', radius: 8 },
        done: [{ say: 'arlen_m03_01' }, { wait: 6 }, { say: 'arlen_m03_02' }],
      },
      descend: {
        // He paints with his back to the room and does not turn round to talk.
        start: [
          { castSpawn: 'master_hesper', at: 'grotto_mural', facing: 5.29 },
          { spawnGroup: group('ink_hare', { groupId: 'tr_m03_ink_hares', placeId: 'P44', count: 6, at: 'grotto_hares', radius: 6, tier: 'normal' }) },
        ],
        watch: { point: 'grotto_hall', radius: 5 },
        done: [{ say: 'hesper_m03_01' }],
      },
      hares: {
        watch: { groupId: 'tr_m03_ink_hares', stroke: 'jade_lantern_grotto' },
        done: [
          { say: 'hesper_m03_02' }, { wait: 6 }, { say: 'hesper_m03_03' },
          { spawnGroup: group('painted_stag', { groupId: 'tr_m03_painted_stag', placeId: 'P44', count: 1, at: 'grotto_stag', radius: 3, tier: 'elite' }) },
        ],
      },
      stag: { watch: { groupId: 'tr_m03_painted_stag' }, done: [{ say: 'hesper_m03_04' }] },
      socket: { watch: { point: 'grotto_socket', radius: 3, prompt: 'Reach into the socket' } },
      hesper: {
        watch: { npc: 'master_hesper' },
        done: [
          { say: 'hesper_m03_05' }, { wait: 8 },
          { say: 'hesper_m03_06' }, { wait: 9 },
          { sayByEmpire: { akitsu: 'hesper_m03_token_remoria', tameri: 'hesper_m03_token_akitsu', remoria: 'hesper_m03_token_tameri', none: 'hesper_m03_token_remoria' } },
          { flagByEmpire: { akitsu: 'tr_token_remoria', tameri: 'tr_token_akitsu', remoria: 'tr_token_tameri', none: 'tr_token_remoria' } },
          { wait: 8 },
          { say: 'hesper_m03_07' },
        ],
      },
      brush: { watch: { point: 'grotto_brush', radius: 2.5, prompt: 'Look at the brush', sayAt: { grotto_brush: 'hesper_m03_09' } } },
    },
  },
  tr_m04_what_the_stones_remember: {
    offer: ['noor_m04_01', 'noor_m04_02'],
    complete: ['noor_m04_03', 'noor_m04_04', 'noor_m04_05'],
    steps: {
      stones: { watch: { point: 'echo_approach', radius: 8 } },
      touch: {
        watch: { point: 'echo_touch', radius: 3.5, prompt: 'Touch the token to the stone' },
        done: [
          { sound: 'ink_wash' },
          // His back to the tallest stone, looking out over the hill.
          { castSpawn: 'thrown_standard_bearer', at: 'echo_stand', facing: Math.PI * 0.75 },
          { say: 'bearer_m04_01' },
          { spawnGroup: group('old_soldier_akitsu', { groupId: 'tr_m04_old_banners', placeId: 'P18', count: 4, at: 'echo_wave_west', radius: 6, tier: 'normal' }) },
        ],
      },
      wave_one: {
        watch: { groupId: 'tr_m04_old_banners' },
        done: [
          { sayByEmpire: { akitsu: 'bearer_m04_own_akitsu', tameri: 'bearer_m04_blue', remoria: 'bearer_m04_blue', none: 'bearer_m04_own_akitsu' } },
          { spawnGroup: group('old_soldier_tameri', { groupId: 'tr_m04_old_pennants', placeId: 'P18', count: 4, at: 'echo_wave_east', radius: 6, tier: 'normal' }) },
        ],
      },
      wave_two: {
        watch: { groupId: 'tr_m04_old_pennants' },
        done: [
          { sayByEmpire: { akitsu: 'bearer_m04_gold', tameri: 'bearer_m04_own_tameri', remoria: 'bearer_m04_gold', none: 'bearer_m04_gold' } },
          { spawnGroup: group('old_soldier_remoria', { groupId: 'tr_m04_old_shields', placeId: 'P18', count: 4, at: 'echo_wave_south', radius: 6, tier: 'normal' }) },
        ],
      },
      wave_three: {
        watch: { groupId: 'tr_m04_old_shields' },
        done: [
          { sayByEmpire: { akitsu: 'bearer_m04_red', tameri: 'bearer_m04_red', remoria: 'bearer_m04_own_remoria', none: 'bearer_m04_red' } },
          { wait: 5 }, { say: 'bearer_m04_02' }, { wait: 6 },
          // The thing from the socket, by the empire it accuses (BAND3_TOKENS).
          { sayByEmpire: { akitsu: 'bearer_m04_token_akitsu', tameri: 'bearer_m04_token_tameri', remoria: 'bearer_m04_token_remoria', none: 'bearer_m04_token_akitsu' } },
          { wait: 10 }, { say: 'bearer_m04_03' },
          { castMove: 'thrown_standard_bearer', to: 'echo_cairn', speed: 1.5 },
        ],
      },
      cairn: {
        watch: { point: 'echo_cairn', radius: 5 },
        done: [
          { say: 'bearer_m04_04' }, { wait: 11 },
          { say: 'bearer_m04_05' }, { wait: 8 },
          { say: 'bearer_m04_06' }, { wait: 9 },
          { sound: 'ink_wash' },
          { castDespawn: 'thrown_standard_bearer' },
        ],
      },
      cloth: { watch: { point: 'echo_cairn', radius: 3, prompt: 'Take a strip of the standard' } },
      noor: { watch: { npc: 'archer_noor' } },
    },
  },
  tr_m05_root_fire: {
    offer: ['vex_m05_01', 'vex_m05_02'],
    complete: [],
    completeByChoice: { step: 'show', lines: { raise: 'sable_m05_08', wrap: 'sable_m05_09' } },
    steps: {
      muster: {
        start: [...MUSTER],
        watch: { point: 'muster_truce', radius: 12 },
        done: [{ say: 'sable_m05_01' }, { wait: 9 }, { say: 'sable_m05_02' }],
      },
      standard: {
        watch: { npc: 'own_commander' },
        done: [
          { sayByEmpire: { akitsu: 'hayasaka_m05_01', tameri: 'nakhtamun_m05_01', remoria: 'corvinus_m05_01', none: 'sable_m05_03' } },
          { wait: 9 }, { sound: 'root_roar' }, { say: 'sable_m05_04' },
          { spawnGroup: group('root_ember', { groupId: 'tr_m05_trail_embers', count: 6, at: 'muster_trail', radius: 6, tier: 'normal' }) },
        ],
      },
      line: { watch: { groupId: 'tr_m05_trail_embers' }, done: [{ say: 'sable_m05_05' }] },
      mouth: { watch: { point: 'hollowpath_mouth', radius: 8 } },
      enter: {
        start: [{ spawnGroup: group('root_ember', { groupId: 'tr_m05_root_embers', placeId: 'P45', count: 6, at: 'hollow_embers', radius: 6, tier: 'normal' }) }],
        watch: { point: 'hollow_hall', radius: 5 },
      },
      embers: {
        watch: { groupId: 'tr_m05_root_embers', stroke: 'whispering_root_hollow' },
        done: [
          { sound: 'root_roar' },
          { spawnGroup: group('root_pyre', { groupId: 'tr_m05_root_pyre', placeId: 'P45', count: 1, at: 'hollow_pyre', radius: 3, tier: 'elite' }) },
        ],
      },
      pyre: { watch: { groupId: 'tr_m05_root_pyre' } },
      tooth: {
        watch: { point: 'hollow_mural', radius: 3.5, prompt: 'Draw the Tooth from the wall' },
        done: [{ sound: 'murals_dark' }],
      },
      down: {
        start: [...MUSTER],
        watch: { point: 'muster_truce', radius: 12 },
        done: [{ say: 'sable_m05_06' }],
      },
      commander: {
        watch: { npc: 'own_commander' },
        done: [{ sayByEmpire: { akitsu: 'hayasaka_m05_02', tameri: 'nakhtamun_m05_02', remoria: 'corvinus_m05_02', none: 'sable_m05_07' } }],
      },
      show: {},
    },
  },
  tr_m06_the_drowned_ledger: {
    offer: ['lyra_m06_01', 'lyra_m06_02'],
    complete: ['lyra_m06_03', 'lyra_m06_04'],
    steps: {
      climb: {
        // The rival is already on the cistern's trail ahead, looking back down it.
        start: [{ castSpawn: 'rival_champion', at: 'peaks_rival', facing: Math.PI * 0.5 }],
        watch: { point: 'peaks_vigil', radius: 6 },
        done: [
          { sayByEmpire: { akitsu: 'tiaa_m06_01', tameri: 'casca_m06_01', remoria: 'ren_m06_01', none: 'tiaa_m06_01' } },
          { wait: 6 }, { castDespawn: 'rival_champion' },
        ],
      },
      enter: {
        start: [{ spawnGroup: group('ink_koi', { groupId: 'tr_m06_ink_koi', placeId: 'P46', count: 6, at: 'cistern_koi', radius: 6, tier: 'normal' }) }],
        watch: { point: 'cistern_hall', radius: 5 },
      },
      koi: { watch: { groupId: 'tr_m06_ink_koi', stroke: 'sunken_inkstone_cistern' } },
      pages: {
        watch: {
          points: ['cistern_page_1', 'cistern_page_2'], distinct: true, radius: 2.5, prompt: 'Read the page',
          sayAt: { cistern_page_1: 'ledger_m06_01', cistern_page_2: 'ledger_m06_02' },
        },
      },
      last_page: {
        watch: { point: 'cistern_page_3', radius: 2.5, prompt: 'Read the last page' },
        done: [
          // The third war in the book is the one the player's own people marched into.
          { sayByEmpire: { akitsu: 'ledger_m06_akitsu', tameri: 'ledger_m06_tameri', remoria: 'ledger_m06_remoria', none: 'ledger_m06_akitsu' } },
          { wait: 11 }, { say: 'ledger_m06_03' }, { wait: 9 },
          { sound: 'water_rising' },
          { spawnGroup: group('drowned_ink', { groupId: 'tr_m06_drowned_ink', placeId: 'P46', count: 1, at: 'cistern_pool', radius: 3, tier: 'elite' }) },
        ],
      },
      drowned: {
        watch: { groupId: 'tr_m06_drowned_ink' },
        done: [
          { sound: 'water_rising' },
          { castSpawn: 'rival_champion', at: 'cistern_edge', facing: 4.82 },
          { sayByEmpire: { akitsu: 'tiaa_m06_02', tameri: 'casca_m06_02', remoria: 'ren_m06_02', none: 'tiaa_m06_02' } },
        ],
      },
      tooth: {
        watch: { point: 'cistern_pool', radius: 3.5, prompt: 'Reach down for the Tooth' },
        done: [
          { sound: 'water_closes' },
          { sayByEmpire: { akitsu: 'tiaa_m06_03', tameri: 'casca_m06_03', remoria: 'ren_m06_03', none: 'tiaa_m06_03' } },
        ],
      },
      hand: {
        watch: { npc: 'rival_champion' },
        done: [
          { sound: 'water_rising' },
          { spawnGroup: group('grasping_water', { groupId: 'tr_m06_grasping_water', placeId: 'P46', count: 3, at: 'cistern_edge', radius: 3, tier: 'normal' }) },
        ],
      },
      loose: {
        watch: { groupId: 'tr_m06_grasping_water' },
        done: [
          { sayByEmpire: { akitsu: 'tiaa_m06_04', tameri: 'casca_m06_04', remoria: 'ren_m06_04', none: 'tiaa_m06_04' } },
          { wait: 9 }, { castDespawn: 'rival_champion' },
        ],
      },
      commander: {
        watch: { npc: 'own_commander' },
        done: [{ sayByEmpire: { akitsu: 'hayasaka_m06_01', tameri: 'nakhtamun_m06_01', remoria: 'corvinus_m06_01', none: 'sable_m06_01' } }],
      },
      lyra: { watch: { npc: 'archer_lyra' } },
    },
  },
});
