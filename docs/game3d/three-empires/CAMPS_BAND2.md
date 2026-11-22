# Band 2: the three army camps

Written 2026-11-22 by the lead. This is the brief for building the home of each empire: the Camp of the Western Road (Akitsu), the Landing (Tameri) and Castra Lupa (Remoria). Nothing here is built yet. The numbers live in two files, and this page says why they are what they are:

- `src/components/game3d/threeroads/kits/empireKitPieces.mjs`: the pieces of the three kits.
- `src/components/game3d/threeroads/land/campPlans.mjs`: where every piece of every camp stands.
- `tests/game3d-three-roads-camp-plans.test.mjs` checks both against the game's own ground.

## 1. What the owner's second video changed

The uncut walkthrough was studied for forts and camps (`research/REFERENCE_LAND_NOTES.md`, sections 2c, 2g and 2i). Five things came out of it, and each camp below answers all five. They are craft only: no place, name or piece of that game is used.

1. **A fort stands across the road, not beside it.** The road runs in at one gate and out at the other, and someone stands in the road and speaks before anything else happens.
2. **A camp is built on levels.** A flat ring of tents reads as scatter; a camp that climbs reads as a place.
3. **Count small.** A handful of tents, 4 to 8 m apart, round an open middle of 10 to 15 m with one thing in it.
4. **One tall thing announces it** from about 150 m.
5. **There is a second way out**, and on the first walk to it there is something to see every 50 to 120 m.

The video never enters a real army camp, and its country is northern. So the three camps are drawn from each people's own way of making camp instead: a Meiji-era field camp, a New Kingdom river army, a marching camp.

## 2. What the ground said

The plan was first written from a map. Before drawing the camps the lead surveyed the game's own ground (the terrain functions in `wolfveil/WolfveilLayout.js`), and three things in the plan were wrong:

| Plan said | The ground says | What changed |
| --- | --- | --- |
| The Landing: 80 m of flat ground with a jetty on the river | The river runs in a gorge about 30 m deep the whole length of the valley. At the Landing the water is at −23.5 m and the east bank at +5 m | The Landing is a camp on the gorge's east rim. The barge moors below, a lever hoist lifts the grain to a stage on the lip |
| Castra Lupa at (30, 330) "commands the pass" | That spot is a bare slope 107 m from any trail | The fort stands across the ridge path at (−66, 383), 19 m below the crossroads with the Hunter's Loop |
| The High Road tops out at (160, 522) | That is a cliff face at 227 m. The ridge path north of the peak is no better: a cave entrance's terraces cut it with slopes of 30 to 80 degrees | The High Road is the Hunter's Loop across the highlands east of the crossroads, with its arch at (150, 428): on a trail, never steeper than 17 degrees |

A test now holds every story point and every home to ground no steeper than 22 degrees and clear of the river (`tests/game3d-three-roads-script.test.mjs`).

**One trap in surveying.** The game's ground is `wolfveilHeight` plus the terraces that the cave entrances install into it when `wolfveil/WolfveilCaveAccessPlan.mjs` is loaded. A script that does not import that file sees smooth hillside where the game has ledges of 10 to 14 m. The first survey made that mistake at the crest of the ridge path; the places session found it in the running game. Every check that measures ground now imports the file.

The ground at each camp:

| Camp | Centre | Ground | Slope | Road |
| --- | --- | --- | --- | --- |
| Camp of the Western Road | (−297, −136) | 11 m in a hollow; 20 m on the slope 40 m west | 4° on the flat east of the trail, 8 to 16° west of it | the west trail runs through it |
| The Landing | (272, −424) | +5 m at the rim, +12 m at the top of the yard, water at −23.5 m | 12 to 16° in the yard, a cliff at the lip | none yet (section 6) |
| Castra Lupa | (−66, 383) | 96 m at the south gate, 103 m at the north | 7 to 12° along the path | the ridge path runs through it |

**No ground is reshaped for band 2.** Every piece carries a `skirt`: posts, a plinth or a bank's foot that continue below the piece, so it stands on a slope with no gap under its downhill side. The terrain hook (`land/threeRoadsLandforms.mjs`) is not in the height chain yet, and the camps do not wait for it.

## 3. The three kits

One GLB each, one atlas, one lit and one glowing material, built like the valley kit (`BUILD_RULES.md`, section 7) but smaller: at most 18 pieces, 3,000 triangles a piece, 30,000 a kit, 2.5 MB.

| Kit | Drawn from | Pieces | Its tall mark | What makes it its own |
| --- | --- | --- | --- | --- |
| `akitsu` | a Meiji-era field camp | 17 | a timber watchtower, 10 m, with a signal drum | white bell tents on plank decks, a camp curtain with the bear crest (a paw print in a ring) round the command post, tall narrow banners, rice-bale breastworks, rifles stacked under oilcloth because powder is dead under this sky, dead telegraph poles |
| `tameri` | a New Kingdom river army | 17 | two flagstaffs, 13 m, with long pennants | a palisade of hide shields on a rail, the House of Life pavilion on a mud-brick platform, grain under nets, jars in racks, a great lever hoist, a barge and reed boats |
| `remoria` | a marching camp | 16 | a pair of gate towers, 9 m, at each gate | an earth bank with a fence of stakes and rounded corners, leather tents in rows, the wolf standard where the two streets cross, the tribunal, a plough and a boundary stone for the colony |

## 4. The camps

### Camp of the Western Road (P13, west)

- **Across the road.** Two pickets of rice bales with a lifted bar close 50 m of the west trail: one toward the town, one toward the wilds. A sentry stands in the road at each and speaks first. Both ends are ways out.
- **Three levels.** The drill yard is on the only flat ground, east of the trail (11 m). Seven tents stand in two rows up the slope west of it (12 to 14 m). Above them is the command post inside its curtain (15 m), looking down on everything.
- **The middle** is the drill yard, about 12 by 18 m, with the three straw posts Goro's recruits are taught on.
- **By the trail:** the cook fire and its kettle, the stores, and the armoury where one peg is empty.
- **Seen first:** three dead telegraph poles following the trail in from the town, then the watchtower standing over the town-side picket. It was first planned up among the cedars, where the forest hid it.
- **Story spots:** `camp_fire`, `camp_drill`, `camp_post_1` to `_3`, `camp_picket` (the picket toward the wilds), `camp_cedars` (up the slope, where the raid comes from), `camp_armoury`.
- **People:** Sergeant Goro at the yard, Colonel Hayasaka at the map table, Lieutenant Mizuhara once the war opens.
- 53 pieces of 18 kinds.

### The Landing (P24, east)

- **A camp on a cliff.** The river is 30 m down. The barge and two reed boats lie on the water; the hoist's arm reaches out over the drop and the landing stage stands on the lip. Everything the player walks to is on the rim.
- **Three levels.** The rim with its rail of shields (5 m), the yard with the grain stacks, the jar racks and the scribe's awning (7 to 10 m), and the House of Life at the top (12 m).
- **The middle** is the yard between the stage and the stacks: the 17 m the player carries each jar, uphill.
- **The way in** is at the top, between the two flagstaffs, where two sentries stand. The rim is closed by the rail except at the stage.
- **Seen first:** the two flagstaffs and their pennants.
- **Story spots:** `landing_jetty` (the head of the plank, where the hoist sets the jars down), `landing_stack`, `landing_tally`, `landing_reeds` (where the shades come over the rim), `landing_bowcase`.
- **People:** Paneb at the tally, Sabu watching the rim, General Nakhtamun in the yard, the priestess Meresankh by the pavilion.
- 61 pieces of 17 kinds: 28 runs of shield rail are one batch.

### Castra Lupa (P35, north)

- **Across the road.** 56 m along the ridge path and 40 m across it. The path to the peak climbs in at the south gate and out at the north; 19 m further up it meets the Hunter's Loop at a crossroads with a milestone. Everyone on the pass walks through the fort.
- **Levels.** The path climbs 7 m inside the walls. Gate towers and the wall's walk stand above it; the tribunal is a raised platform.
- **The middle** is where the cross street meets the path: the wolf standard on its plinth, the tribunal facing it, a brazier either side of the road.
- **Rows.** Eight leather tents in two rows in the lower half; the legate's tent in the upper corner, with 3.7 m between its back wall and the palisade, which is where the player stands to overhear.
- **Seen first:** the gate towers, from the hot springs below and from the crossroads above.
- **Story spots:** `fort_gate` (the north gate's approach: the courier is brought along the High Road, past the crossroads and down), `fort_tent`, `fort_overhear`, `road_top` (under the High Road's arch, 200 m east along the Hunter's Loop), `road_ambush` (halfway back along it).
- **People:** Legate Corvinus at his tent, Tribune Aelia by the standard once the war opens.
- 71 pieces of 14 kinds: 38 runs of palisade are one batch.

Each plan also lists where its sentries stand. They need entries in the cast table, which the lead adds when a camp is built.

### The three smaller places

Band 2's other three chapters happen away from the camps. Each place is dressed from kits already made, and its plan is in `BAND2_PLACE_PLANS` in the same file as the camps.

- **House Asagiri's Hall (P14, west).** A sword school under canvas: the hall tent facing the door spot, the students' tent, a rack of practice swords, the house's banner pole, a curtain along the north side, and the grandson's grave stone at `hall_grave`. 10 pieces.
- **Shadow Ravine (P26, east).** Where the Priestess speaks the rite: four fire bowls squared round `ravine_chant`, five markers for the five dead who can be named, and at the ravine's mouth an awning with the rite's stores and one flagstaff so the place is seen from the trail. 17 pieces.
- **The First Furrow (P36, north).** The plough waiting at the furrow's start, the plough cart with the archer's case, the boundary stone ready where the furrow ends, the colony's first standard, a rack of arms and a fire. 7 pieces. The furrow had been drawn along the Hunter's Loop, which is a road; it now runs 18 m north of it and beside it, from (−262, 410) to (−218, 426).

The Wind-Carved Wolf Stones (P18), where the house banner is taken back, are an existing place and get nothing new.

## 5. Gliding at the camps

The glide is built (branch `claude/glide-20261122`, not in main yet). What it does, as its own session measured it:

- **Reach:** about 4.2 m forward for each metre of height, 7.5 m/s forward and 1.8 m/s down; diving about 2.6 m for each metre. Read `GLIDE_REACH` in `src/components/game3d/player/playerGlide.mjs`; do not copy the number into code.
- **Walls:** ground more than 2 m above the glider holds it or turns it along the face; it never lifts a glider onto a higher shelf. A glide ends on ground at or below the height it arrives at.
- **Borders:** away from a gate, an area's border is a wall. Through a gate the hero arrives on the far side on the ground.
- No fighting while gliding. A mounted player does not glide. Landing in deep water starts the swim.

**One thing follows from the reach that the plan had not counted on.** A glider sinks 1 m for every 4.2 m it travels, which is a slope of about 13 degrees. Over ground that falls more gently than that, the ground comes up to meet the glider and it lands again within a few metres. So a glide carries only off an edge: a cliff, a gorge rim, the side of a ridge. It does not carry down a road.

What that gives at the three camps:

| From | The ground below | What happens |
| --- | --- | --- |
| the Landing's rim (+5 m) | a cliff: the river is 28 m down and about 30 m out | the one real leap of band 2: off the rim and down to the barge, with up to about 120 m of reach in hand. The hero lands in the river and swims, because the barge is not ground. The far rim is as high as the near one, so nobody glides across |
| the peak above the fort (119 m) toward the north gate (103 m) | the pass falls 7 to 12 degrees | no glide: the path is gentler than the glide, and the hero touches down at once. The way down the pass is on foot |
| the command terrace of the western camp (15 m) | 8 to 16 degrees | a hop of a few metres at most |

Not while carrying a jar and not while walking the courier down: a pledge's carry and escort steps stay on foot, as section 15 of the quest plan says.

## 6. What band 2 leaves for later

- **The grain road.** No trail reaches the Landing. The nearest is the Hunter's Loop at (310, −252), about 175 m north. A new track is the owner's decision 7 and touches the roads the doorways session owns. Until then the two flagstaffs are the guide.
- **The way down to the water.** A stair on the gorge wall and a jetty at the bottom need walkable ground, so they wait for the terrain hook.
- **The Pontoon Bridge (P25)** was planned as a floating bridge. In a gorge it has to be a rope bridge from rim to rim. To re-plan before it is built.
- **The Aqueduct Works (P39)** ran toward the fort's old site. Its line has to be drawn again.
- **Pads under the tents.** With the terrain hook, three small level pads (previewed in `tests/game3d-three-roads-landforms.test.mjs`) would let the tents lose their decks. Not needed.

## 7. Building it

| Step | Who | Where it stands on 2026-11-22 |
| --- | --- | --- |
| Model the three kits | the kit session | Done: `remoria.glb`, `akitsu.glb`, `tameri.glb` in `public/game3d/threeroads/kits/` |
| Lay out the three camps and fit each piece to the ground in the running game | the places session | Done with the real kits, behind the preview switch. Each camp draws in about five calls and adds 27,000 to 35,000 triangles seen from near |
| Add the sentries to the cast, and let the preview switch bring the camps' people home and offer band 2's pledges | the lead | Done: seven sentries; `?threeRoads=1&threeRoadsPreview=1` |
| Play the six chapters in the running game with the preview on, one character of each faction | the pledge-world session | To do |
| Mark band 2 built, so players who turn the story on get it | the lead | After the play-through, and after the owner has seen it |

Not walked yet by a real player or a mount: the path through the fort and the trail through both pickets (checked by calculation only).

A piece is moved from its planned spot only where the ground says so, and the report says which.
