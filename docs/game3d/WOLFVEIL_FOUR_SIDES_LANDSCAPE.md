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
| forest    | 480 cedars, 60 maples       | 100      | 560           | 120           | 220    |
| grassland | 8 lone maples               | 11       | 36            | 560           | 0      |
| wilds     | 230 pines, 60 maples        | 460      | 340           | 220           | 0      |

4,519 pieces, 978 of them trees. Today the valley has about 40 trees.

- Forest: cedars stand in groves with glades between them; ferns keep to the
  shade, flowers to the glades, bamboo to the low ground.
- Mountain: boulders gather on the steep ground; pines stop at the tree line.
- Grassland: flowers in wide drifts, open grass between, the view to the gate
  kept clear.
- Wilds: a pine grove rings every monster camp; boulders line the ravines; the
  trail between camps stays open.

Nothing is placed on a road or trail, in the river, in the town, on a fighting
ground, inside a monster camp, or within 16 m of a portal or 18 m of a cave
mouth. Trees stand at least 6.5 m apart. The tests check every placement.

## What it will cost to draw

With a light tree of about 300 triangles, instanced by kind: the forest about
190,000 triangles and 12 draw calls, the wilds about 140,000, the mountain
about 105,000, the grassland about 10,000. One loaded side stays inside the
browser budget (500 draw calls, 1.5 M triangles) measured on PR #49.

## What building it needs

1. **Tree colliders on the server.** Trees block the way, and the server
   shares the trunk list (`wolfveilForestTrunkColliders`). It tests every
   trunk on every step; 978 trees need a grid there first.
2. **Light models.** The owner's uploaded tree is 4,920 triangles: right for a
   few hero trees, too heavy for a forest. Until light models arrive the
   valley's own retired low-poly cedar, pine and maple can stand in.
3. **Everything that reads the tree list** (ground cover, grass, birds, spawn
   detail, cave approaches, server collision and combat tests) is checked
   against the new trees.

Order: forest, then wilds, mountain, grassland; one side per pull request,
each measured with the report from #49.

## Assets that would lift it (owner can have these built)

One viewer file per kit, like the town and corridor files:

1. Light trees: a cedar (13 to 19 m), a pine (8 to 13 m), a maple (7 to 10 m),
   each at most 300 triangles with separate trunk and crown; a bamboo clump of
   at most 60.
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
