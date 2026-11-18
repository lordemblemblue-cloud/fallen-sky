# Wolfveil caves from the owner's corridor file (2026-11-17)

The owner's "Ancient Sumi-e Corridor & Cavern 3D Viewer" (version 3) is the
kit for finishing the caves: two hallways, a T-junction, a cave and canyon,
and a sunken sanctuary. This note records how it was brought in, what it
costs, and what is still to place.

## The file is far too heavy as written

It builds one solid shape for every brick, every upright joint and every
seam of every wall. Measured under the game's Three.js:

| Piece              | As written (meshes / triangles) | Light, baked (draw calls / triangles) |
|--------------------|---------------------------------|---------------------------------------|
| 24 m hallway       | 810 / 184,928                   | 10 / 1,576                            |
| hallway with vault | about 3,300 / 727,000           | 44 / 11,974                           |
| T-junction         | about 2,500 / 561,000           | 11 / 4,834                            |
| cave and canyon    | 1,432 / about 65,000            | 25 / 38,852                           |
| sunken sanctuary   | about 24,000 / 5,800,000        | 36 / 46,016                           |

All five light pieces together: 103,252 triangles. (The "as written" rows
other than the first were counted with a stand-in for the library and are
approximate; the first row and every light row are measured.)

## How it was made light

1. **The owner's builder code is used as it is.**
   `scripts/extract-sumi-corridor-kit.mjs <viewer.html>` writes
   `caves/SumiCorridorKit.js`: the materials and the five pieces, without the
   viewer page's renderer, camera, lights and buttons. For a new version of
   the file, run the script again.
2. **Brick walls are painted, not built** (`caves/SumiWallPaint.mjs`). A wall
   is one flat panel with a picture of the same wall: the owner's own seam
   curve, the same running bond, the same gold and silver inlay. The walls
   were 99% of the weight. One picture per wall height in the kit (3.9 m,
   6.4 m, 7.4 m and the sanctuary's 38 m).
3. **Leaner shapes** (`caves/SumiCaveLightKit.js`): fewer sides on cylinders,
   spheres, rings and rocks; no bevels; no clear-coat shader; the see-through
   resin layer over the floors is left out.
4. **Each piece is baked**: every still mesh of one material becomes one
   mesh. What the owner's file animates (water, the armillary rings, the
   waterfalls, the floating stairs and relics, the secret door) is kept
   moving; the bricks of the door are merged so it slides as one.
5. Gold and silver are near-mirrors in the file. Underground, with a few
   lamps and nothing to reflect, a mirror is black, so they are toned to hold
   their colour. The file's own torch lights are listed and left out; the
   caves' existing lights are used.

## In the game now: the hallway in the tunnels

`caves/WolfveilSumiHallPlan.mjs` lays the hallway along the three modular
tunnels, which were cut to the hallway's width when the caves were first laid
out: rotunda to the three-way junction, junction to the treasure vault,
junction toward the canyon. Four straight runs, 194 m:

- the stem leaves the rotunda's rim and walks into the crossbar through a
  doorway in its wall, so the junction is closed on every side;
- at the two bends the outer wall runs on, the inner wall stops short, and
  the floors stop at the corner;
- a gold and silver frame stands where a hall opens into the rotunda, the
  vault and the canyon.

Cost: 10 draw calls and 11,406 triangles, drawn only underground (on the
surface the caves cost what they did: 65 draw calls). Inside a cave the whole
network is now 160 draw calls and 64,236 triangles.

It is scenery. The cave's stone floor and tunnel walls still decide where a
player can walk; the tiles stand 8 cm proud of the stone floor so their gold
rims show.

## Still to place

1. **Treasure vault.** The file's vault is a walled room with a sliding
   secret door and chests; the cave's vault is a round chamber. Needs the
   chamber's walls to follow the room.
2. **Cave and canyon.** 210 x 173 m with 74 m of relief: a river and lake,
   a shelf road, a high rock bridge over a ford, ramps and landings. The
   cave's canyon is a flat floor. Paths that cross over each other need a
   floor that knows which level a player is on.
3. **Sunken sanctuary.** New in version 3: 158 x 171 m inside 38 m walls,
   raised walkways, a rotunda, pools, waterfalls. Needs its own place and a
   way in.

## Known, not from this work

Two tests in `tests/game3d-clone-four-cave-connected-route.test.mjs` fail on
main: they expect five tunnels and find nine since the modular tunnels were
added.
