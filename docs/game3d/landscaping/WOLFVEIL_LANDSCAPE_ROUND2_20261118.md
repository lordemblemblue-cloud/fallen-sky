# Wolfveil landscaping, round 2: high-poly → baked textures → low-poly (2026-11-16/18)

Follows [WOLFVEIL_LANDSCAPE_DESIGN_20261116.md](WOLFVEIL_LANDSCAPE_DESIGN_20261116.md) (round 1: the map design, ranges, trails, river).
Owner's round-2 brief: upgrade everything (grass, landscaping, pathways, bricks, landscaping around the washed-out
"breakaway" trail stretches, mountains). Use the workflow **sculpt high-poly → bake textures from it → put
those textures on the low-poly game meshes**, and make vegetation respond to **live wind** ("wind sheets").

Branch: `claude/landscape-whole-map-20261116` (same branch as round 1). No merge, no deploy.

## 1. What changed, by request

| Request | What was built | Where |
|---|---|---|
| High-poly → texture → low-poly | **Terrain:** the shared height function evaluated at 2048² (0.54 m; the game mesh is 3.55 m) plus a droplet hydraulic-erosion pass on the ranges, baked to a world normal/cavity map and an AO / water-flow / scree map. **Ground materials:** real 3D scatter baked in Blender. **Rocks:** 327,680-triangle sculpts baked onto 900/270/76-triangle LODs. | `scripts/bake-wolfveil-terrain-macro.mjs`, `tools/landscape-bake/*.py` |
| Mountains | Range ledges reshaped from uniform contour terraces into patchy cliff bands broken by couloirs. The macro bake adds erosion gullies, ridges and scree fans. The terrain shader gives per-pixel rock/snow/scree boundaries, valley sky AO and damp flow streaks. The cliff rock is a baked wall of fractured blocks (20 m tile). Distant cliffs relax toward their mean so they never alias into stripes. 160 baked outcrops are bedded into steep flanks in clusters. | `WolfveilLandscapeDesign.mjs`, `WolfveilTerrainSplat.js`, `WolfveilRangeOutcrops.mjs` |
| Grass | The meadow ground texture is baked from about 42k individual curved blades in tufts. Grass blades no longer render black on back faces. Broad lush, sun-dried and deep-green meadow patches show from a distance. | `bake_materials.py`, `WolfveilTerrainSplat.js`, `WolfveilIndividualGrassBlades.js`, `WolfveilLivingMeadow.js` |
| Pathways, bricks | The main public road is **granite setts**. The residential lanes are **herringbone brick**. Both are baked from real 3D stones and bricks set in sandy, mossy joints, and both get dressed-granite **kerbstones** on both edges. Paving turns the corners (bend wedges filled), and kerbs that would stand on another road at a junction are dropped. Every trail uses **baked packed dirt** (pebbles, grit, straw) instead of the procedural texture. | `WolfveilPavedRoads.js` (hooked into `addWolfveilPaths`) |
| Landscape around the breakaway path | At each of the 7 washed-out stretches the soil turns to gravel. A line of flat **stepping stones** carries the old trail line across, **boulders** frame both washout edges, and a **scree fan** runs across the trail where the run-off crossed. | `WolfveilTrailBreakLandscape.mjs` |
| Rocks / landscaping everywhere | One **baked rock field** replaces every procedural valley stone: about 2,600 trail-shoulder and wild-ground stones, 422 wayfinding stones and the wet riverbank stones, plus the break rocks and outcrops. It is 3,199 instances in ≤ 18 draw calls, with distance LOD buckets and size-based draw distances (pebbles to 140 m, stones to 320 m, boulders and outcrops always). On the ranges the stones take the weathered cliff tone. The 232 river-gorge boulders draw as a baked twin: their own mesh keeps its raycasts and stops writing colour and depth. | `WolfveilBakedRocks.js` |
| Plants (shrubs, ferns, reeds, flowers, tufts) | Twelve plants are modelled at high poly in Blender, 700 to 37,000 triangles of real leaves, pinnae, petals and blades each: green, dry and flowering shrubs, a fern, cattail reeds, daisy, buttercup, lupine, poppy, clover, and green and dry tufts. They are baked side-on into one card atlas (albedo + alpha, normal, AO, with dilated edges). In game, all 5,258 plants are 3 crossed cards (6 triangles each) in one instanced draw per region, with a per-instance atlas cell, and they sway with the live wind and its gust fronts. The procedural plants stay as the loading fallback. Fallen logs are smooth 14-sided cylinders instead of faceted prisms. | `tools/landscape-bake/bake_plants.py`, `WolfveilPlantCards.js`, `WolfveilPlantCardAtlas.mjs` |
| Trees | The owner's elm model (`public/game3d/elm-owner-optimized.glb`, 6.7 MB) was missing from the clone, so all 18 elms rendered as lollipop placeholders. It was copied unchanged from the owner's original repo (that repo was not modified), and the real elms now load. | `public/game3d/elm-owner-optimized.glb` |
| Live wind ("wind sheets") | One shared live-wind field. It reads the live weather (`windDir` on a 16-point compass, `windMph` as a number or "5 to 10 mph"), eases direction and speed, adds gusts and integrates a travelling gust-front phase. The Blaze meadow grass and the streamed meadow clumps lay over as each front sweeps downwind, with a sheen on the bent blades. Trees and individual blades get the same eased direction and gust through the scene frame. Before this, the Blaze grass never saw the live wind because it read different keys, and the scene only knew 8 compass points. | `render/liveWind.mjs`, `BlazeGrassShaders.mjs`, `BlazeOfGrassWorld.mjs`, `WolfveilScene.js`, `WolfveilLivingMeadow.js` |

## 2. Bake pipeline (re-run when the design changes)

All bakes are deterministic and seeded. Blender 5.2 runs headless (`-b --factory-startup`, never the owner's open session).

```bash
node scripts/bake-wolfveil-terrain-macro.mjs --preview docs/game3d/landscaping/bake-20261116
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/landscape-bake/bake_materials.py -- public/game3d/landscape --preview docs/game3d/landscaping/bake-20261116
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/landscape-bake/bake_rocks.py -- public/game3d/landscape docs/game3d/landscaping/bake-20261116
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/landscape-bake/bake_textures.py -- public/game3d/landscape wv_snow
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/landscape-bake/bake_plants.py -- public/game3d/landscape --preview docs/game3d/landscaping/bake-20261116
```

- **Plants** (`bake_plants.py`, about 65 s):
  - Each plant is rendered with an orthographic camera through three unlit passes: albedo with alpha, camera-space normal (back faces flipped, which equals card tangent space) and AO.
  - Renders are float EXR at 2× resolution, averaged down with premultiplied alpha, and edge-dilated.
  - Output: `wv_plants_albedo.webp`, `wv_plants_normal.webp` and `wv_plants.json`.
  - After a re-bake, copy the card sizes into `WolfveilPlantCardAtlas.mjs`; a test compares the two.

- **Terrain macro maps** (about 12 s): `wv_terrain_macro_normal.webp` (2048², 0.49 MB), `wv_terrain_macro_mask.webp` (1024², 0.13 MB) and `wv_terrain_macro.json`.
  - The JSON stores a checksum of the height function. A test fails when the design changes without a re-bake.
  - Erosion is shading only: the mesh, BVH and server collision keep the analytic height.
  - The erosion detail is high-passed and gain-limited (P99 depth 1.7 m), so it never contradicts the mesh.
- **Ground materials** (`bake_materials.py`, about 45–100 s each): each material is a seamlessly tiling high-poly patch. Instances crossing an edge are duplicated on the opposite edge, and colour variation is periodic. Each patch is baked top-down onto a flat plane (selected → active): tangent normal, diffuse colour, AO and height, at 2× resolution and averaged down.

  | Map | Tile | Faces | High-poly content |
  |---|---|---|---|
  | dirt | 3.4 m | 1.46 M | pebbles, grit, straw |
  | grass | 3.2 m | 0.89 M | blades |
  | rock | 20 m in game | 0.71 M | fractured convex blocks |
  | cobble | 2.34 m | 0.99 M | granite setts |
  | brick | 2.1 m | 0.91 M | herringbone pavers |

  Shader bump (fractal roughness, fine cracks) is baked into the normal maps.
- **Rocks** (`bake_rocks.py`, about 45 s):
  - Six variants (boulder, flat, block, standing, slab, rubble), each an icosphere of 327,680 triangles sculpted with layered displacement.
  - Decimated to 900 triangles with smart UVs in a shared atlas, then baked (normal, colour, AO).
  - LOD1 (270) and LOD2 (76) keep LOD0's UVs.
  - Output: `wv_rocks.glb` (1.7 MB, WebP atlas, tangents).
  - Fixed during this round: the earlier bake shadowed later rocks with already-baked ones (all at the origin), and Z-up axes were wrong.

Evidence images of the bakes are in [bake-20261116/](bake-20261116/): the sculpts versus the game meshes, the atlases, every high-poly patch next to its baked maps, and erosion before/after with relief and flow.

## 3. Evidence

- **Comparisons** ([screenshots-round2-20261118/](screenshots-round2-20261118/)): `cmp-*` images show main | round 1 | round 2 from identical game cameras, across 14 views. `new-*` images show the new roads, the brick lane, two washed-out stretches, live wind and more.
- **Tests:** `tests/game3d-clone-wolfveil-landscape-bakes.test.mjs` adds 17 tests covering:
  - the stale-bake checksum
  - shader injection and tint cap
  - the GLB contents parsed from the file (names, LOD triangle budgets, tangents, WebP)
  - rock grounding and outcrop placement rules
  - field assembly and fallback, including a failed load keeping the old stones
  - paving width and fitted kerbs, and decorative-only meshes
  - break landscaping and the gravel mask
  - wind parsing, easing and gust fronts, and wiring
- **Full suite**, run the same way on both checkouts (`node --test tests/`):
  - branch: 490 tests, 443 pass, 47 fail
  - `main` (eee8147, clean checkout): 457 tests, 410 pass, 47 fail
  - The 47 failing tests are identical by name on both, so there are no regressions; the 33 extra tests all pass. The failures on main come from CRLF string checks, `document.createElement` in the cave test and similar.
- **Plant cards** add 4 tests:
  - the atlas table matches the bake
  - cards are hidden until loaded, with the fallback kept
  - shader injection
  - the scene wiring and the restored owner elm
- **Lint** (`eslint --quiet` on every file touched): clean, except 8 errors in `BlazeOfGrassWorld.mjs` that are identical on `main` (unchanged lines).
- **Cost:**
  - Rock field: ≤ 18 draw calls, plus 1 for the gorge twin. Paving: 3 (setts, brick, kerbs). Plant cards: one draw per region per plant layer, replacing the same number of procedural draws.
  - With draw distances, about 900 of the 3,199 rocks draw at a typical view, about 94k triangles; the old chiselled stones were about 88k. Plant cards are 6 triangles each.
  - New textures: about 10 MB on disk in `public/game3d/landscape/`. The restored elm GLB adds 6.7 MB.

## 4. Porting (if the GitHub repository changes)

Round 2 is self-contained.
- **New modules:** `WolfveilTerrainMacro.mjs`, `WolfveilTerrainSplat.js`, `WolfveilBakedRocks.js`, `WolfveilRangeOutcrops.mjs`, `WolfveilPavedRoads.js`, `WolfveilTrailBreakLandscape.mjs`, `WolfveilPlantCards.js`, `WolfveilPlantCardAtlas.mjs`, `render/liveWind.mjs`.
- **Owner elm:** if the target repository is the original one, the owner's elm GLB is already there.
- **New assets:** `public/game3d/landscape/*`.
- **Integration points:**
  - `WolfveilScene.js`: splat material with the macro rect, the baked rock field, live wind in `update()`.
  - `WolfveilGeometry.js`: splat weights and break gravel in `buildWolfveilTerrain`; the paving collector and dirt upgrade in `addWolfveilPaths`.
  - `WolfveilLivingMeadow.js`: splat material and live wind.
  - `BlazeOfGrassWorld.mjs` / `BlazeGrassShaders.mjs`: live wind and sheets.
  - `WolfveilLandscapeMarkers.js`, `WolfveilTrailLandscaping.js`, `WolfveilLivingLandscape.js`: each now also returns its rock plan.
- **Game 3D only:** everything is gated on `originAtMarket` (and `groundCover` for breaks and paving), so the non-landscape path is untouched.
- **Re-bakes:** the scripts above regenerate every asset from source.

## 5. Known limitations / not verified

- Screenshots come from the local harness (the game renderer, environment and Blaze world with the real scene modules), not the full deployed app. The browser pane was hidden, so there are no frame-time numbers, only draw-call and triangle counts.
- The rendered height in the harness uses the real terrain; the server collision fingerprint changes because the range ledges changed. Anchors and all round-1 continuity tests are unchanged.
- Bends get one bevel wedge of paving and no kerb on the outer side; corners are not filleted.
- The ground-cover module's `SWV_Natural_Path_Edge_Weathered_Stones` are still the old faceted stones. They carry owner-claimed precision-tile and square tints and tests, so they were left alone.
- Plant cards are vertical, so from straight above (aerial views) they thin out.
- A still image shows the live-wind gust fronts only as subtle sheen bands; they read clearly in motion. Live NWS wind is not reachable in the harness, so a fixed W 12 mph override was used.
- The imported town's plaza, the palace stairs and Game 1 / Game 2 were not touched.
