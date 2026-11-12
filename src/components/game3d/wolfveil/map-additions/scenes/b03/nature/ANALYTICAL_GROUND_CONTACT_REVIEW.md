# Wolfveil Workstream 08 — Nine-point nature analytical terrain-contact preflight

**Status: PROVISIONAL SOURCE-ONLY / NOT GPU OR PHYSICS QA / G0 CLOSED.**  
**Owner:** WS08, scenes 21–30 natural decoration.  
**Source of the elevation function:** connected `main` `src/components/game3d/wolfveil/WolfveilLayout.js`, Git blob `b4b10dd15737d62c62a476e500adb433a6d015b6`.  
**Nature references:** `referenceTargets.mjs` blob `9c6810e75d20f13c6d5534a51ed1a39de1e921f7`, 19 source-proposed objects from the separate Batch03 XLSX/DOCX inventory.  
**Survey implementation:** `natureAnalyticalGroundSurvey.mjs`, injected `heightAt=wolfveilHeight`. No existing Game 3D file was modified.

## Review method and limits

At each nature candidate's *unchanged* original unshifted local X/Z reference rectangle, sample **nine** source-analytic terrain heights: center, four corners and four edge midpoints. Total **171 analytic height calls**. The survey reports the maximum-minus-minimum Y span, but it does not prescribe terrain grade, model root height, water elevation, collision bounds or vertical asset position. It makes **zero** changes to source terrain, generates **zero** meshes, and does **not** apply `originAtMarket`'s optional +70m viewer Z offset.

The provisional **2m span flag** is a deliberately conservative *design review threshold*, not an approved 2m mount/player slope limit and not evidence of a real traversable mesh. A multi-tree/grass **envelope** spanning elevation is often normal and may require multiple independent ground contacts; a cave ore seam/cavern root is not supposed to mount on the aboveground analytical surface.

## Nine-point results from actual existing Wolfveil height formula

| Scene / natural reference | Analytical min–max span (m) | 2m review flag | Additional cross-owner constraint |
| --- | ---: | --- | --- |
| 21 `S21-CEDAR_01` | 0.226 | No | Existing woodland road corridor review |
| 21 `S21-MOSS_BOULDER` | 2.147 | Yes | Woodland footpath/rock margin |
| 21 `S21-FERN_PATCH` | 7.804 | Yes | Individual fern ground contact, no flat sheet |
| 22 `S22-WOLF_STONE` | 3.574 | Yes | Boss navigation / irregular rock profile |
| 22 `S22-PINE_RIDGE` | 4.625 | Yes | Each pine roots independently |
| 23 `S23-BAMBOO_C01` | 6.212 | Yes | Bamboo culms at separate soil levels |
| 23 `S23-LICHEN_LOG` | 5.133 | Yes | Curved log must not float or bridge path |
| 24 `S24-WILD_GRASS` | 5.440 | Yes | WS07 steps grass-free cutout, WS10 passage |
| 24 `S24-HERB_CLUSTER` | 1.378 | No | Herbs individually touch sampled soil |
| 24 `S24-BLACK_PINE` | 2.480 | Yes | Ridge path clearance / shared Scene30 view |
| 26 `S26-REED_CLUSTER` | 0.510 | No | WS02 water level/shore ownership; damaged original PNG |
| 26 `S26-PEBBLE_BANK` | 8.115 | Yes | WS02 riverbank / WS07 lookout clearances |
| 26 `S26-JAPANESE_MAPLE` | **14.457** | Yes | Biggest model elevation spread; WS02 bank; PNG invalid |
| 27 `S27-STALAGMITES` | 3.585 | Yes | Exterior height is NOT a cave-floor datum |
| 28 `S28-ROOT_ARCH` | 8.793 | Yes | Exterior surface is NOT cavern interior roof/floor |
| 28 `S28-ORE_VEIN` | 2.513 | Yes | Wall-bound ore requires actual WS07 cave shell |
| 29 `S29-PINE_CLUSTER` | 3.112 | Yes | WS01 northern ridge topology, WS10 traversal |
| 30 `S30-STEAM_VENTS` | 2.336 | Yes | WS02 geothermal pool / WS09 steam FX |
| 30 `S30-LANTERN_GROVE` | 3.741 | Yes | WS07 natural-canopy / built-lantern split still pending |

**Summary:** 19 candidates, nine samples each = **171 source-height evaluations**; **16** candidates have an analytical span greater than 2m, **7** greater than 5m, **1** greater than 10m. All nineteen center analytical Y values reproduce the spreadsheet-derived center within 1mm (expected: both use the same original `wolfveilHeight` formula). That self-consistency **does not** independently verify a rendered terrain mesh, raycast height, player foothold, cave chamber or source-photo fidelity.

**Highest-priority handoff:** Scene 26 Japanese maple `S26-JAPANESE_MAPLE` spans 14.457m across its source design footprint according to the exterior surface equation. This may be riverbank hillside terrain, not an error: request WS01/WS02/WS10 real corner/center mesh Y and riparian placement acceptance; do **not** change the reference X/Z, carve terrain or sink a trunk without explicit approval and a valid original Scene26 PNG. Cave Scenes 27 and 28 require actual WS07 chamber/WS10 portal geometry rather than this formula.

## Exact evidence and tests

- In the active session, connected GitHub blobs for actual `main` `WolfveilLayout.js`, WS08 `referenceTargets.mjs` and new `natureAnalyticalGroundSurvey.mjs` were evaluated together. **Ten direct V8 assertions passed**: 19 references, 171 points, 16/7/1 above provisional span thresholds, all center model values within 1mm, no mesh/collider/terrain alteration and explicit water/cave/owner gates, fail-closed nonfinite samples.
- New `natureAnalyticalGroundSurvey.test.mjs`: **six authored native Node tests** of symmetric nine-sample positions, synthetic grade review, owner handoffs, strict input validation, no mutation/activation. New `natureAnalyticalGroundSource.test.mjs`: **three authored native Node tests** that directly import real `../../../../WolfveilLayout.js` and require expected reference/source numerical summaries. These tests are committed and GitHub-readback verifiable but **have not been executed inside a complete private repository checkout**.
- Full `npm ci`, `npm run build`, any project-wide CI green, actual game renderer, signed-in raycast/physics, high/low graphics/screenshots, NPC/mount movement and server/client parity **NOT RUN** in this increment. GitHub Actions prior zero-step failures remain of unknown cause; no CI pass is inferred.

## Owner dependencies / implementation stop conditions

1. **WS01/WS11:** approve exact authoritative frame/G0 geometry gate and verify real terrain elevations, particularly the northern preview and riverbank.
2. **WS02:** hydrology/shore and hot spring pool contact; any wet-ground material implementation belongs to WS02.
3. **WS07:** future cave shell/floor vs exterior analytic heights, S24 stair envelope, Scene30 bathhouse and built lanterns.
4. **WS09:** wind/weather and steam visual systems, not WS08.
5. **WS10:** two-way player/mount/cave, tree/boulder road-clearance, fall prevention and eventual collider agreement.
6. **WS12:** independent browser before/after fidelity, native tests, performance LOD, actual mesh raycasts and multiplayer acceptance.

**Until those reviews are granted: do not create or mount geometry, do not change existing shared terrain/roads/river/caves, do not adjust source X/Z/Y to hide errors, and do not merge draft [PR #952](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/952).** WS08's permanent progress tracker is [issue #963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963); only WS11 edits the consolidated manager ledger.
