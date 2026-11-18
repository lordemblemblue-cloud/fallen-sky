# Wolfveil's four sides: mountain, forest, grassland, wilds (2026-11-17)

Owner's direction: three sides of the map each show one kind of country (a
mountain, a forest, a grassland); the fourth is free, as long as it has a
direction to it: monsters to farm, places to go, ground to explore. The caves
are to be finished from the owner's corridor file. The town stays the hub.

This note and `wolfveil/WolfveilFourSidesPlan.mjs` are the **design**. Nothing
is planted yet and no scenery, collision or server file is changed.

## Which side is which, and why

| Side          | Theme     | Name                 | Monster levels | Why this side                                                        |
|---------------|-----------|----------------------|----------------|----------------------------------------------------------------------|
| back (north)  | mountain  | Howling Heights      | 30 to 35       | highest and steepest: 143 m on average, peaks to 306 m, 62% steep    |
| left (west)   | forest    | Bluewood             | 40 to 50       | holds the hillside grove and the camps named for cedar and bluewood  |
| front (south) | grassland | Southern Gate Fields | training field | flat: 2 m on average, 6 degree slopes; the fighting field is here    |
| right (east)  | wilds     | Shadow Ravines       | 2 to 25        | eight of the fourteen monster camps, ravines, quarry, the river gorge|

Heights and slopes are measured from the terrain function; the camps and
their levels are the ones already in `WolfveilLandscapeDesign.mjs`.

## The direction: one loop that only gets harder

The fourteen camps already form a loop. Out over the river into the wilds
(levels 2 to 25, south to north), across the mountain (30, 35), and home
through the forest (40, 45, 50). `planWolfveilHuntingLoop()` returns the stops
in that order. One easy pocket (levels 5 to 8) sits in the north-west corner
of the forest, by the portal to the mountain.

## What each side gets

`planWolfveilSidePlanting(side)` places every piece, the same way every time:

| Side      | Trees                       | Boulders | Shrubs, ferns | Flower drifts | Bamboo |
|-----------|-----------------------------|----------|---------------|---------------|--------|
| mountain  | 140 pines, below 215 m only | 700      | 180           | 34            | 0      |
| forest    | 1,000 cedars, 60 red maples | 100      | 700           | 160           | 220    |
| grassland | 8 lone maples               | 11       | 36            | 560           | 0      |
| wilds     | 230 pines, 60 maples        | 460      | 340           | 220           | 0      |

5,219 pieces, 1,498 of them trees. Before this the valley had about 40 trees.

- Forest: cedars stand in thick stands with glades between them; red maples
  mark the roads and trails; ferns keep to the shade, flowers to the glades,
  bamboo to the low ground; the mountain's rocky foot gets boulders only.
- Mountain: boulders gather on the steep ground; pines stop at the tree line.
- Grassland: flowers in wide drifts, open grass between, the view to the gate
  kept clear.
- Wilds: a pine grove rings every monster camp; boulders line the ravines; the
  trail between camps stays open.

Nothing is placed on a road or trail, in the river, in the town, on a fighting
ground, inside a monster camp, within 16 m of a portal or 18 m of a cave
mouth, on a path to a cave, or within 8 m of one of the owner's own trees.
Ground other work finished by hand is left alone; the one exception is the
100 m forest-floor square, which gets trees and nothing else. Trees stand at
least 6.5 m apart. The tests check every placement.

## Built so far: the forest

The western forest is planted (`WolfveilFourSidesScenery.js`), drawn from
light shapes made for it (`WolfveilSideSceneryShapes.mjs`):

| Kind        | Pieces | Triangles each | Triangles |
|-------------|--------|----------------|-----------|
| cedar       | 1,000  | 92             | 92,000    |
| red maple   | 60     | 80             | 4,800     |
| bamboo      | 220    | 72             | 15,840    |
| fern        | 700    | 22             | 15,400    |
| boulder     | 100    | 80             | 8,000     |
| flower drift| 160    | 70             | 11,200    |

2,240 pieces, 147,240 triangles, seven draw calls (the cedars are two batches
so each stays light enough to be kept on the horizon from every area).
Measured in the real valley, one camera view in the forest's worst direction
is 255 draw calls and 1.34 M triangles, inside the browser budget (500 and
1.5 M). Counting every direction at once the west is over on triangles, as it
was before the forest (1.68 M then, 1.83 M now), and the east crosses the line
(1.55 M) because the forest stays drawn on its horizon.

Trees block the way. The 1,060 planted trunks are one list
(`WolfveilTrunkColliders.mjs`) used by the scene and by the server, and the
server now looks trunks up in a grid instead of testing every one on every
step. A trunk is as thick as its tree is tall (0.28 m to 0.75 m). Adding
trunks changes the server's map fingerprint, as any map change does: a saved
private-world session made on the old map is asked to start again.

`node scripts/render-wolfveil-planted-sides.mjs` draws study pictures of a
side from the real ground, plan and shapes without a browser (`--sides
north,east` draws a side that is not built yet). They are for judging layout
and shapes; the game adds grass, textures and the owner's models.

## What the other sides will cost

At the same weight of piece: the wilds about 82,000 triangles, the mountain
about 73,000, the grassland about 42,000. Order: wilds, mountain, grassland;
one side per pull request, each measured the same way.

## Assets that would lift it (owner can have these built)

One viewer file per kit, like the town and corridor files:

1. Trees to replace the stand-in shapes: a cedar (14 to 22 m), a pine (8 to
   13 m), a maple (7 to 10 m), each at most 150 triangles in one piece with
   colours painted on (no textures); a bamboo clump of at most 80.
2. Mountain kit: three boulders (at most 80 triangles), two cliff pieces (at
   most 250), a dead pine.
3. Grassland kit: three flower drifts, a hay rick, a field fence.
4. Wilds kit: a ruined wall, a broken watchtower, a camp palisade with banner,
   a quarry cart; at most 400 triangles each.

## Caves: finish them from the corridor file

`ancient_sumi_e_corridor_3d_viewer (3).html` holds six pieces: a hall with a
treasure vault and a cave branch, a straight hall, a T-junction, a canyon
(river and lake basin 162 x 38 m, cliff road, rock bridge, ways back up,
cliff walls, half-sunk ruins), a **sanctuary** (fortress walls 156 x 156 m,
reflection pools, a rotunda with ribs and arches, aqueduct falls; new in this
version) and a parts kit. It builds about 230 kinds of mesh in loops.

What is in the game from version 1 is the floor plan only
(`WolfveilModularCaveKit.mjs`): floors, paths and collision at the right
size, without the file's walls, vaults, canyon or sanctuary.

Next: bring each piece's real geometry in, at reduced detail, merged into one
mesh per material, placed on the existing floor plan, and drawn only while
the player is underground (the cave draw budget from #47 already does that).

## Town

The attached town file is the one already in the game: `AXETownPlaza.js`
(#48), with walk-in interiors (#50) and low-poly tiers (#52). Nothing in it is
missing from main.
