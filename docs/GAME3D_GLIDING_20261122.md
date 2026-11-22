# Game 3D: gliding on foot (2026-11-22)

Owner request: "I want to also have the ability to glide and fly like the Legend of Zelda. We can jump off hills,
stuff like that. So I want you to add that. Still stick true to the style of game combat, but you have to control
though."

The glide is a general mechanic with our own glider and our own hanging pose. Nothing is taken from that game.
Combat is unchanged. Mount flight is unchanged.

## Controls

| Input | On foot in the air |
| --- | --- |
| Space while falling or jumping | opens the glider. The hero needs 1.6 m of air above the landing (ground, or the surface of deep water). Lower than that, a notice says "Too low to open the glider"; with Halo Wings, a short hop still opens the wings as before |
| W A S D | steer. The keys point the way, relative to the camera as on foot. The heading turns toward them at up to about 110° a second and the glider banks. With no keys it flies straight on |
| Shift | dive: faster and steeper. Let go and the extra speed holds the glider up for a moment, or climbs a little |
| Space again | closes the glider and the hero falls. With Halo Wings unlocked (Halo level 20), the wings take over instead, with their own air kicks, sky-run and dash |

Running off a ledge or a cliff now falls with the jump's gravity. Before, the feet snapped straight down to the
ground below. Stairs and slopes still walk down as before. A jump that carries over an edge falls on from its arc.

## Numbers

| | |
| --- | --- |
| Trim speed | 7.5 m/s forward, 1.8 m/s down |
| **Reach** | **about 4.2 m forward per metre of height** (`GLIDE_REACH` = 7.5 / 1.8). A 40 m cliff gives about 165 m in still air |
| Dive | +5 m/s² up to 14 m/s, 5.4 m/s down (about 2.6 m forward per metre while diving) |
| Pull-out | the extra speed bleeds at 2.4 m/s², and each m/s of it holds up 0.55 m/s of sink |
| Opening speed | the run carried in: at least 6.4 m/s, at most 14 m/s |
| Turn | 1.9 rad/s at most, bank up to 0.5 rad |
| Opening height | 1.6 m above the landing |
| Ledge | a drop of at least 0.9 m in one frame that is steeper than 1.6 m down per metre across |
| Wall | ground more than 2 m above the hero in the air. An open glider samples the ground 0.6 m plus 0.1 s of travel ahead (1.35 m at trim, 2 m at full dive) |
| Teleport | more than 8 m in one frame, and faster than 20 m/s over that frame's time |

## Decisions

- **Duration**: no stamina and no timer. Height is the only cost.
- **Fall damage**: none. The game has no fall damage, and a long fall lands like a jump.
- **Strikes and skills while gliding**: refused, with the notice "You can't fight while gliding". Dodges, rolls,
  jumps and the bow are refused as well. Close the glider with Space to fall and fight as in a jump.
- **Hits while gliding or falling**: damage applies, but no hit reaction plays, so the hero keeps the glider.
- **Mounted**: nothing changes. Mount flight works as before. The glider never opens while riding, and F in the air
  is refused with the notice "You can't mount in the air".
- **Area borders**:
  - Away from a gate, the border holds the glider like a wall.
  - Through a gate's opening, the glider travels the same way a walker does. Gate travel only checks x and z.
  - The far side puts the hero at the gate's landing point, on that scene's ground, deck or water. So the glide ends
    at the crossing.
  - Carrying the glide over, or holding gliders at gates, would be a change in the gate travel code. That code
    belongs to the Wolfveil doorways session.
- **Cliffs and high ground**: ground more than 2 m above the glider is a wall, never a landing. This was asked for
  because the three-empire work places quests by height.
  - The glider samples the ground ahead. At a face it slides along it (the part of its travel into the face is
    dropped), or it is held there when it meets the face square-on or in a corner. It sinks all the while and lands
    at the foot, or wherever the ground comes up to it.
  - A move that still ends in such ground is taken back to where the hero was, gliding or falling. That covers a long
    frame, since the world's frame time isn't capped, and a fall steered at a cliff.
  - Ground up to 2 m above the glider (a low ledge, a slope it meets) is still landed on.
- **Teleports**: a respawn, recall or other jump of more than 8 m in one frame ends a glide or a fall where the hero
  now stands. It counts only when the jump is also faster than 20 m/s over that frame's time, so a long frame's move
  is not mistaken for one.

## What changed

- **`player/playerGlide.mjs`** (new): the air state, which is ground, fall or glide.
  - GameWorld3D runs it every frame right after the feet are glued to the ground, the same way the swim state runs.
    The glue code is unchanged.
  - It owns the hero's height only in the air. It hands the feet back on touchdown, so the held keys carry on into
    the walk or run.
  - Over water at least 1.45 m deep, it lands on the surface and the swim takes over.
  - It keeps the hero off ground more than 2 m above it, as set out in Cliffs and high ground. The glider samples
    the ground ahead through `groundAt`. A move that ends in such ground comes back as an `x`, `z` to return to.
  - It stops at once when the hero rides, swims, dies, enters a boss fall, flies the Halo Wings, is held by the
    tornado, or plays a dedicated duel.
- **`player/gliderProp.mjs`** (new): the glider.
  - It has a crescent canopy (8 triangles, indigo with jade tips, vertex colours), a bamboo bar and two struts:
    44 triangles and one material.
  - It sits between the hands' bones, faces the body's way and rolls with the bank.
  - It unfolds in 0.25 s and folds away on landing.
- **`Glide_Hang` clip** (`tools/avatar-motion/mobility-clips.mjs`, authored keys): a 1.6 s loop of the hero hanging
  from the bar, hands above the head and knees drawn up. It is built for both fused bodies into the mobility pack
  (`public/models/animations/mocap/Glide_Hang.glb` 31.9 KB, `female/Glide_Hang.glb` 41.6 KB, manifest updated).
- **Controller** (`LunaDashboardPlayerController`):
  - `setGliding('glide' | 'fall' | 'ground')` plays the glide loop, or the fall or jump loop. It ends the
    controller's own jump, specials and combos.
  - The guards refuse jumps, dodges, strikes, the bow and hit reactions as listed above.
  - `requestWingsFromGlide()` hands the glider over to the Halo Wings' glide at the same height.
- **GameWorld3D**:
  - In the air, Space goes to the glider first. On the ground the existing Space chain (jump, wings, Skywalk,
    putting a weapon away) is unchanged.
  - While gliding, the glider's velocity replaces walking, at its travel speed (less along a face, none when held).
    It goes through the same movement and collision code as walking.
  - `glideGroundAt` hands the glider the ground ahead, found the way the glue finds it from the glider's height.
    After the glide's step, a move into a wall is put back. Both sit in the glide block. The collision chain is not
    touched.
  - The strike and skill guard and the F refusal are added beside the swim ones. The prop updates after the pose.
    Teardown disposes the prop.
- **Remote players** (`RemotePlayersManager`):
  - The local `anim` already names the controller state, so a glider sends `glideHang`, and `jumpLoop` while
    falling.
  - `Glide_Hang` joins the swim loops that are retargeted onto the hosted archer in the browser.
  - Each remote has its own glider, open while its packets say `glideHang`.

The three-empire branch's `?threeRoads=1` collision line and the gate travel code are not touched.

## Verified live

Checked on `/gameview` (vite dev, guest character, keys sent as browser events, WebGPU backend). The place was
Wolfveil's east area by the Residential Timber Bridge: the deck is about 50 m up, over the river.

- **Ledge**: stepping off the deck's edge fell with the jump loop. Space opened the glider, and the hanging pose and
  the glider showed.
- **Trim**: 7.5 m/s forward and 1.8 m/s down, straight on with no keys.
- **Steering**: A turned the heading from 0° to -28° to -81° within a second.
- **Dive**: speed went 7.1 → 9.7 → 11.7 m/s at 4.3-4.7 m/s down. On release it went 11.4 → 10.2 → 8.8 m/s while the
  sink dropped to 1.75 → 0.30 → 0.81 m/s.
- **Space again**: closed the glider (falling at 5.6 m/s), and the next Space reopened it.
- **Water**: landing on the river started the swim, and the swimmer walked out onto the bank.
- **Ground**: landing on the east bank with W held cross-faded from the hanging pose into Walk. The hero walked on
  at 4.0 m/s.
- **Border away from a gate**: at the east area's west edge (x 122), the glider was held as at a wall.
- **Gate in the air**: the glider crossed the Residential Timber Bridge gate (east to town) gliding below the deck.
  - The world switched to the town area.
  - The hero was at the landing point (x 116, z 105), in the river under the bridge (deck 50.6 m, water 10.0 m),
    swimming.
  - That glide also opened at the 14 m/s cap, because the test moved the hero 1.9 m off the deck in one frame.
- **Teleport**: placing a gliding hero onto the town deck ended the glide, and the hero stood on the deck.
- **What others see**:
  - The local broadcast was `jumpLoop` while falling and `glideHang` while gliding.
  - A simulated remote packet with `glideHang` played the retargeted clip on the hosted archer at full weight, with
    the idle faded out. Its glider was open between its hands.
- **Frame time**: this was a hidden pane on this machine with a timer-driven loop, so these are not the owner's
  frame rate. Standing averaged 20.5 ms (p95 30.8). Gliding averaged 22.4 ms (p95 31.8, one 82.6 ms spike); that
  includes the wider view from the air.

### Cliffs (after the wall change)

The town area's steepest terrain face is the river valley's west bank by the timber bridge. It rises 2.5-3 m per
metre, from about 12 m at x 108 to about 50 m at x 92. Scanning the whole town area found no steeper terrain; the
steeper readings were bridge-deck edges. All the glides below started from the deck (50.6 m).

- **Head-on, diving** (14 m/s, square to the bank):
  - The glider stopped at x 97.8, 3.5 m above the ground under it, with the bank rising ahead.
  - It stayed there for about 0.7 s, drifting along the face at 1.6 m/s and sinking from 40.4 to 37.1 m.
  - It landed on the ground straight below at 36.9 m.
- **Glancing, diving** (about 45° to the face): its travel toward the bank stopped (x held at 99.1-99.4). It slid
  north along the face at 9-10 m/s (14 × cos 45° ≈ 9.9), then landed where the ground came up to it, 0.1 m below its
  height.
- **16° off square, at trim**: it slid south along the face at 1.9 m/s (7.5 × sin 16°). It landed on the bank 0.3 m
  below its last gliding height.
- **Slope landing** (square to the bank, at trim): on a face this steep, the look-ahead only triggers once the
  glider meets the slope faster. At trim it met the bank at its own height and landed there (43.86 m, gliding at
  43.98).
- **Long frames** (a busy wait in the page right before the bank):
  - A 900 ms frame took the glider about 6.7 m into the bank in one move, and the move was taken back. The same
    hitch over the low valley carried the glider 7.1 m ahead.
  - Before the teleport refinement, a 1.3 s frame (about 9.7 m) counted as a teleport. It ended the glide and set
    the hero on the bank top at 52.7 m, 7 m above its gliding height.
  - After the refinement, the same 1.3 s frame was taken back. The glider carried on and landed on the slope at
    43.8 m.
- **Water**: a dive north along the river landed on the surface at 17.3 m (about 2 m deep), and the swim took over.
- **Cost**: sampling the ground costs about 0.016 ms. The look-ahead takes one sample a frame in open air and six
  at a face. Script time per frame averaged 0.93 ms in a free glide and 0.88 ms in the run with the hold at the
  bank.

## Tests

`node --test --test-reporter=tap tests/`, compared by failing test name with unmodified `origin/main` 354dfc7c:

| | tests | pass | fail |
| --- | --- | --- | --- |
| origin/main 354dfc7c | 1951 | 1844 | 107 |
| this branch (with the wall change) | 1962 | 1854 | 108 |

The same 107 tests fail on both. The extra failure on the branch run is a Duelist server test, "online story crews
claim their own supplies…". It failed on a timing value (95.13 against 95) and passed three times out of three
when run alone. It touches no glide code; before the wall change the branch run had the same 107 as main.

The 11 new tests are in `tests/game3d-glide.test.mjs`:

- reach and steady sink;
- ledges against slopes, stairs and jumps;
- steering and bank;
- dive and pull-out;
- touchdown on ground and water, and teleports;
- walls:
  - held head-on at a 30 m face;
  - sliding along it at a glancing angle;
  - never above the starting height;
  - a 1.1 m ledge landed on, a 2.5 m one held;
  - a slope met;
  - a long frame and a fall into the face taken back, including a 1.3 s frame past the teleport distance;
- the opening rules;
- both bodies' hanging pose;
- the prop: triangles, hands, bank and fold;
- the real controller in the air, including the Halo Wings handoff;
- the world and remote wiring.

Some pins in three existing tests were widened where the wiring changed on purpose:

- `game3d-swimming`: the strike guard, the run flags and the remote pose list;
- `game3d-dodge-flight-moments`: the mobility pack list;
- `game3d-eight-way-dodge-roll-20261117`: the dodge guard.

ESLint on the 11 changed and new files reports the same 2 errors as main's versions (`URL` in two tests), and none
new. After the wall change, the three files it touched report no errors.

## Not verified

- The Halo Wings handoff live: the test character's wings are locked. It is covered in the tests only.
- The female body live: tests only.
- Two real clients, mobile, a signed-in account, the owner's device frame rate, and the Base44 preview.
- Touch: Game 3D has no touch jump, so the glider is keyboard-only, like the jump.

## Known limits

- An earlier version of this write-up said that gliding into a cliff higher than the glider lifted the hero onto
  its top. That was broader than what the old code did, and the wall change covers every case:
  - On continuous terrain, the old touchdown happened at the first frame where the ground reached the glider, so
    the lift was the ground's rise over one frame of travel. Worked out for this bank at 60 frames a second, that is
    about 0.3 m at trim and 0.7 m in a full dive. This was not measured with the old code.
  - The real way onto a top was a long frame: an uncapped frame time carried the glider far into the cliff, and a
    move of over 8 m also read as a teleport. That was seen live: 7 m up onto the bank top.
  - A vertical face in the ground meshes could also have done it.
- The look-ahead sees what the glue sees. A face whose ground the glue doesn't find from the glider's height is not
  a wall to it; for example, a bridge deck seen from below is not one, and the glider passes under it. Building and
  wall colliders still apply as for walking. The area border held the glider live; buildings were not tried.
- There is no wind and there are no updrafts.
- A gate crossing ends the glide; see Area borders above.
- Remote avatars show falls as their idle, as they already did for jumps.

## For the Base44 preview

Merge `claude/glide-20261122` into `main`. Everything is client code plus two small static GLBs and the mobility
manifest under `public/models/animations/mocap/`. There are no Base44 functions, entities or secrets to deploy.
