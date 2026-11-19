# Wolfveil doorway survey and natural-zone border proposal (Phase A)

**Date:** 2026-11-18
**Repository:** lordemblemblue-cloud/fallen-sky, branch `claude/wolfveil-doorways-c0d466` (from `main` 38cf79d)
**Follows:** `docs/game3d/WOLFVEIL_METROID_STYLE_WORLD_STREAMING_AUDIT_20261118.md` (section 6, Phase A)
**Status:** survey made in a running local Play build; the border/doorway proposal is NOT built, except the Phase B grotto prototype (see `WOLFVEIL_ZONE_RUNTIME_PROTOTYPE_20261118.md`). Nothing here changes the five-area loader, the veils, the torii gates, the server or saves.

All files referenced below are in `docs/game3d/zones-20261118/`.

## 1. How the survey was made

- `vite dev` on this branch, `/gameview` as a guest, Classic Wolfveil, midday (12:30, clear) set through the weather editor, desktop browser pane.
- For every viewpoint the **player was moved there first** and the game ran ~2.6 s, so the five-area loader and the terrain streamer loaded exactly what a player standing there gets (`mode: single`, GPU release off, browser profile).
- Each viewpoint was rendered with the game's own renderer and scene from a separate camera (field of view 50, 16:9): **8 directions** (N, NE, E, SE, S, SW, W, NW) at **three heights**: standing (2.6 m, the shoulder camera), mounted (4.6 m) and gliding (18 m). One contact sheet per viewpoint: `sheet-*.jpg`.
- Viewpoints: the **11 gates** (all three bridge torii included), the **west veil** and the **south veil** at mid-span, and the **4 cave mouths**.
- For every gate, two **approach views** through the gate at standing height, 10 m before it on each side, with the player 25 m back on that side so that side's area is the loaded one: `approach-<gate>-from-<area>.jpg`.
- Map overlays from the layout data: `map-current-five-areas.jpg` (borders, gates, river, roads, bridges, mob areas, zombie camps, caves, tunnels, sightlines) and `map-natural-zone-proposal.jpg`. Script: `scripts/render-wolfveil-doorway-survey-map.mjs`.
- **Sightlines** are terrain-only (`wolfveilHeight`; trees and buildings ignored): from 2.6 m above each gate, 72 rays out to 650 m, recording the farthest terrain point that is still visible. Numbers in `gate-sightlines.json`.
- Loader report at the time of the survey: `survey-metrics.json`.

**Not done:** real mounted riding or gliding through the gates (only the camera heights), fog/night/weather variants, mobile, the post-processing ink pass (captures are the raw renderer), a signed-in Base44 deployment. Camera collision is not applied to the survey camera.

## 2. What the survey shows

### F1. Past every gate the other area's ground does not exist

`WolfveilTerrainAreaStream.mjs` keeps **one** terrain section (and one BVH) at a time: the current area's. The neighbouring area's floor is not drawn at all, while its far scenery (trees, rocks, bridges, the path network) still is. So beyond every border there is a straight-edged hole: trees, rocks and grass tufts float over the sky dome.

- Market Stone Bridge, looking east from the torii: the east bank is sky under floating grass (`sheet-town_east_market_bridge.jpg`, `approach-town_east_market_bridge-from-town.jpg`).
- Outrider Rope Bridge: the deck runs on into a void with boulders hanging over it (`sheet-town_east_outer_trail_bridge.jpg`).
- Training Forest Gate from the west side: the town side is a void under the membrane (`approach-town_west_training_forest-from-west.jpg`). From the town side the lower half of the view is the veil's dense base mist with nothing behind it (`approach-town_west_training_forest-from-town.jpg`).
- Ridge Path Gate (loaded: north): the sanctuary terraces float over a void (`sheet-town_north_ridge_path.jpg`).
- Cedar Spine Gate (loaded: north): the west forest floats over a void (`sheet-west_north_hunters_loop_west.jpg`).
- Southern Fields Way: at glide height the south fields end in a black edge and a void (`sheet-town_south_south_fields_way.jpg`).

The 38 m veil hides this from a distance. It does not hide it from inside a gate opening, from a bridge deck or from above the veil. **This is the most important defect of the current scheme,** and the reason a doorway has to sit behind a real occluder.

### F2. The veils read as walls across open ground

From the town side of the west border the whole western view is a pale wall (`sheet-veil-west-midspan.jpg`, W/SW/NW). The same is true of the south border across the fields (`sheet-veil-south-midspan.jpg`). From the market plaza at glide height, white bands stand on the horizon to the SE, S and SW. This confirms the audit: a long bright veil across forest or grass is the wrong default.

### F3. The bridge swaps happen over water

The three bridge torii stand at x = 122 on the decks, about at the east bank. The river runs on under the torii into the unloaded east area, so the water line ends at the hole (F1). The audit's rule is confirmed: put the doorway at a bank landing or gatehouse, never over the water, and keep the river one composition.

### F4. Every gate looks far into the other area

Terrain-only median sightline past the border, standing at the gate (`gate-sightlines.json`):

| # | Gate | Kind | Areas | Median | Notes from the sheets |
|---|---|---|---|---|---|
| 1 | Market Stone Bridge | bridge | town → east | 496 m | east bank is a void; river runs into it |
| 2 | Residential Timber Bridge | bridge | town → east | 584 m | same as 1 |
| 3 | Outrider Rope Bridge | bridge | town → east | 468 m | deck runs into the void; falls and gorge close by |
| 4 | Southern Fields Way | trail | town → south | 540 m | open fields both ways; veil across the meadow |
| 5 | South Residential Gate | trail | town → west | 404 m | road bend country; wooded knolls nearby |
| 6 | West Residential Gate | trail | town → west | 504 m | road meets the woods |
| 7 | Hunter's Loop · East Gate | trail | east → north | 316 m | high slope above the quarry |
| 8 | Hunter's Loop · Cedar Spine Gate | trail | north → west | 160 m | the only naturally screened gate (ridge and trees) |
| 9 | Ridge Path Gate | trail | town → north | 528 m | right above the sanctuary terraces |
| 10 | Training Forest Gate | trail | town → west | 516 m | forest edge; good place for a cedar choke |
| 11 | West Woodland Fork Gate | trail | town → west | 528 m | two trails cross the border near each other |

Trees cut many of these lines in reality. The point stands: none of the 11 gates was placed at an occluder; they were placed where a road crosses a rectangle.

### F5. The caves are rings, not entrances

Game 3D builds the valley with `loadCaves: false`. Each cave mouth is a blue ring (`WolfveilDungeonPortals.js`) that remounts the whole engine into the separate `wolfveil-caves` region (`sheet-cave-*.jpg`). There is no entry hall on the surface, and the remount reloads the player, HUD and world. A cave is still the best first candidate for a genuine full unload (audit section 3): the walls guarantee occlusion. That is what Phase B prototypes.

### F6. Cost of today's scheme (one session, desktop)

- Area loader (`getStats()`): mode `single`, one area loaded, GPU release **off**. Triangles by area: town 1.38 M, west 1.37 M, east 0.85 M, north 0.40 M, south 0.10 M. Always loaded: 64 draw calls / 400 k triangles (far forest batches, bridges, path network).
- At the gates the standing views drew 226-1,691 calls (226-4,518 counting the two Hunter's Loop gates, which look over the north forest) and 1.1-3.9 M triangles, depending on direction. JS heap was 0.8-1.4 GB over the session.
- Underground, the valley is still drawn (Phase B measurement): 249 draw calls in the prototype hall against 28 with the valley hidden.

### F7. Things near the borders

From the map: zombie camps Z7 (Wolfstone Reach, L35) and Z6 (Northern Rift, L30) sit close to gates 8 and 7; mob areas lie along the eastern loop near the quarry choke. The Jade Lantern Grotto mouth is in the west area, about 210 m from the nearest zombie camp (Z10, Southwest Ruins). Doorways should not put a camp inside a transition pocket.

## 3. Proposal: natural zones joined by authored doorways

`map-natural-zone-proposal.jpg` and `src/components/game3d/wolfveil/zones/WolfveilZoneGraph.mjs` (`WOLFVEIL_NATURAL_ZONE_PROPOSAL`, status `proposal`).

**Zones (candidates, not polygons yet):** Wolfveil Town & Market; Southern Gate Fields; Western Trailheads & Training Grounds; Deep Bluewood / Cedar Wilds; Wolf Stones & Cedar Spine; East Bank & River Housing; Quarry & Shadow Ravines; Highfall & Vortex Basin (falls, upper river and lake as one composition); Sanctuary Approach; Wolf-Ear Highlands; and the caves, starting with the Jade Lantern Grotto (entry hall + chamber, built in Phase B).

**Doorways**: each replaces one or more of today's gates, and every one of the 11 gates has a replacement (a test pins this).

| Doorway | Between | Kind | Replaces | Occluder | Phase |
|---|---|---|---|---|---|
| grotto_mouth | town ↔ grotto hall | cave mouth | Jade Grotto ring | rock arch, dark throat, buried hall with a Z-turn | **B (built)** |
| grotto_inner | grotto hall ↔ chamber | stone door | — | closed door at the end of the Z-turn | **B (built)** |
| training_forest_choke | town ↔ west trailheads | forest choke | gate 10, west veil | curving cedar corridor, dark trunks, small spirit arch | C |
| market_bridge_east_landing | town ↔ east bank | bridge landing | gate 1, east veil | bank gatehouse; deck and river continuous | D |
| south_wolf_gatehouse | town ↔ south fields | gatehouse | gate 4, south veil | existing South Wolf Gate + winding embanked road | E |
| west_residential_trailhead | town ↔ west trailheads | trailhead lodge | gates 6, 11 | lodge + rock cut | E |
| south_residential_bend | town ↔ west trailheads | road bend | gate 5 | embanked bend, wooded knoll | E |
| footbridge_east_landing | town ↔ east bank | bridge landing | gate 2 | landing gate between bank rocks | E |
| rope_bridge_east_landing | town ↔ east bank | bridge landing | gate 3 | torii in the gorge rocks | E |
| sanctuary_procession_arch | town ↔ sanctuary | procession arch | gate 9 (part), north veil | shrine wall behind a turn of the stair | E |
| ridge_saddle | sanctuary ↔ highlands | saddle | gate 9 | rocky switchback above the shrine | E |
| cedar_spine_saddle | wolf stones ↔ highlands | saddle | gate 8 | saddle cut | E |
| hunters_loop_east_cut | quarry ↔ highlands | gorge cut | gate 7 | narrow cut with a switchback | E |
| bluewood_trunk_gate, wolf_stones_switchback, quarry_choke, highfall_gorge_bend | inner zone edges | forest/rock chokes, gorge bend | — | as named | E |

**Rules the proposal follows** (from the audit, confirmed by the survey):

1. A doorway is a place, not a line: an occluder (bend, choke, gatehouse, cave throat, closed door) must block the real camera line of sight, including mounted and gliding heights, before the old zone is released.
2. Bridges hand over at the **far bank landing**; the deck, the river and its reflections are never cut.
3. The river, the falls and the vortex lake stay one composition (Highfall is one zone).
4. Sky, sun, weather and haze stay global; only playable ground, water, props and AI belong to zones.
5. What a zone looks like from its neighbours is a separate, cheap facade (ridge shells, impostor tree lines, a continuation of the river surface). It is never the neighbouring zone itself.

## 4. Recommended order

- **Phase B: done on this branch, behind a flag.** The Jade Lantern Grotto prototype with a ZoneRuntime, a zone graph and the doorway state machine. See `WOLFVEIL_ZONE_RUNTIME_PROTOTYPE_20261118.md`.
- **Phase B.2 (small, recommended next):** while the player is inside a sealed zone, stop drawing the legacy valley (render suspension, not disposal). Measured potential in the hall: 249 → 28 draw calls.
- **Phase C: Training Forest trailhead (`training_forest_choke`).** It is the clearest open-ground veil (F2), the forest gives natural occluders, and the training clearings can stay whole on the town side. This needs real level art (the cedar corridor) and the first surface zone split: the terrain streamer must keep the town's own ground plus a forest facade, instead of a hole.
- **Phase D: the market bridge east landing.** It proves continuous water and bridge decks.
- **Phase E:** the rest, one doorway at a time, each with its own camera checks and tests.

## 5. Not validated

The proposed zone extents, every doorway position except the two built in Phase B, all facade art, mounted and gliding traversal, multiplayer and server movement rules, mobile memory, and the owner's visual approval in the running app.
