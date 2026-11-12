# Wolfveil WS08 — Full Existing Layout vs Batch03 Nature: Source-only Review

**Owner:** Workstream 08 (scenes 21–30 natural scenery only)  
**Task:** [AXE-WOLFVEIL-WS08-001 / #963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963)  
**Branch / PR:** `map/ws08-batch03-nature` / [draft #952](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/952)  
**Existing layout:** `src/components/game3d/wolfveil/WolfveilLayout.js` on `main`, Git blob `b4b10dd15737d62c62a476e500adb433a6d015b6`.  
**Nature input:** 19 `REFERENCE_PROPOSED` targets in `referenceTargets.mjs`.  
**Review status:** **PROVISIONAL SOURCE-ONLY; NOT RUNTIME COLLISION OR GEOMETRY APPROVAL**.

## Exact audit scope

Unlike the earlier *partial* WS08 unit fixture (3 routes / 1 building / 1 housing reservation / a subset of river points), this review evaluated **all source definitions** actually present in the connected Game 3D repository:

| Source definition | Checked count |
| --- | ---: |
| Existing `WOLFVEIL_ROUTES` roads and trails | 10 |
| Existing `WOLFVEIL_BUILDINGS` (functional + residences) | 30 |
| Existing `WOLFVEIL_HOUSING_PLOTS` reserved plots | 24 |
| Existing `WOLFVEIL_RIVER` ordered control points | 17 |
| WS08 natural object footprint proposals | 19 |
| Nature candidates flagged for source-planning review | **8** |
| Positive-area candidate overlaps with existing building rectangles | **0** |
| Positive-area candidate overlaps with existing housing plot rectangles | **0** |

All X/Z calculations use the *unshifted local source* coordinate frame: X east, Z north, metres for existing layout; integer mm for WS08 proposals. The checker uses axis-aligned source object rectangles, continuous route polyline segments (not only nodes), existing route width/2 + **proposed** 2m review buffer, and river width/2 + the same provisional buffer. The optional viewer `originAtMarket` +70m Z is **not applied**. The 2m buffer is a conservative *review convention*, not WS10 approved gameplay clearance.

## Eight review flags, sorted by source reference ID

| Nature source target | Existing source contact | Required owner review |
| --- | --- | --- |
| `S21-CEDAR_01` | `west_woodland_fork` candidate corridor | WS01 / WS10: preserve path and tree collider continuity |
| `S21-MOSS_BOULDER` | `west_woodland_fork` candidate corridor | WS10: approach/path width and natural rock clearance |
| `S22-WOLF_STONE` | `west_woodland_fork` candidate corridor | WS07 / WS10: boss arena space, navigation |
| `S24-BLACK_PINE` | `ridge_path` candidate corridor | WS01 / WS10: mount approach; shares S30 reference *study view*, not object ownership |
| `S26-REED_CLUSTER` | Source `WOLFVEIL_RIVER` buffered channel | WS02 / WS10: reeds may be riparian, must not alter water/physics |
| `S26-PEBBLE_BANK` | Source `WOLFVEIL_RIVER` buffered channel | WS02 / WS07 / WS10: maintain waterfront and lookout access |
| `S28-ROOT_ARCH` | `west_woodland_fork` candidate corridor | WS07 / WS10: cave entrance and two-way portal clearance not built |
| `S30-LANTERN_GROVE` | `ridge_path` candidate corridor | WS07 / WS10: preserve bathhouse/lantern/path access; WS08 owns canopy only |

**No direct building/housing plan overlap** is not a blanket safety clearance. Tall canopies, branch reach, sloped rock surfaces, route turning radii, NPC mounts, procedural forest trunks, true terrain Y, navmesh and 3D collisions are not represented by these horizontal source envelopes.

The eight flagged candidates were already visible in earlier partial source checks; this increment verifies **there are no additional AABB review contacts in the full existing source catalog**. It does not mark any of the eight as approved, relocated or built.

## Unresolved separate architecture/source interactions

- `S24-WILD_GRASS` and **WS07** `S24-TRAIL_STEPS`: **29.7m² exact proposed horizontal overlap** (not a contact with an existing source building). WS08 has **unactivated** hypothetical grass exclusion options: stair-only leaves 122.55m²; an *unapproved* 2m buffer leaves 90.2375m². WS11 supports the **concept** of keeping vegetation off the steps, but neither polygon or additional width is authorized without WS07/WS10/WS12 review.
- Four WS07-proposed 2m proximity review pairs: S26 pebble-bank/lookout; S27 stalagmites/cavern floor; S30 vents/bathhouse; S30 grove/bathhouse. The proposed maple grove starts **1.85m** outside the current bathhouse footprint's eastern X edge. No tree branch/roof/drainage raycast has been performed.
- WS01 has retained ownership of S29 Cliff Stack *connected rock topology* until natural dressing split is approved; WS02 owns S28 lower pool water. **WS08 will not create these missing objects independently.**
- Original `26_eastern_river_wetland.png` was corrupt on reference fetch; image-fidelity acceptance is blocked.

## Verified tests and required pending tests

1. In this session the **exact connected GitHub** main `WolfveilLayout.js` and WS08 `sourceClearanceAudit.mjs`, `architectureSeamAudit.mjs`, and `referenceTargets.mjs` were fetched and executed together through an isolated JavaScript evaluator. **Six direct source assertions passed**, validating: 19 nature references, 10 routes, 30 buildings, 24 plots, 17 river points, the eight exact review IDs and zero existing-building/plot footprint overlaps.
2. The existing local *staging-mirror* Node v22.16.0 command `node --test referenceTargets.test.mjs architectureSeamAudit.test.mjs natureExclusionPlan.test.mjs sourceClearanceAudit.test.mjs natureTileCoverage.test.mjs` was actually rerun this session: **33/33 pass, exit 0**. This local mirror is not an up-to-date private repository checkout; it predates the latest GitHub `referenceTargets.mjs` approval-gate fix.
3. New WS08-only `sourceLayoutFullAudit.test.mjs` uses **direct read-only imports of the genuine production source** `../../../../WolfveilLayout.js` and the WS08 checker. It has **four named Node test cases committed and source-readback verified**; native execution of this specific new test in a full private repository checkout is **NOT RUN** (the isolated staging mirror does not contain the full main `WolfveilLayout.js` file).
4. **NOT RUN:** complete repo `npm ci`, Vite/build/lint/typecheck, Github green CI, real renderer/raycast, model orientation and mountain elevation, player/mount/NPC nav, cave traversal, GPU LOD/frame-time, weather and two-client collision/server authority.

## Stop conditions and next unblocked task

The authoritative WS01 world draft [#948](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/948) remains *provisional*, with Workstream 11 G0 live geometry gate **closed**. WS08 may continue accurate data-only testing, model specification, and ownership-safe cutout planning; **must not modify protected terrain/world, mount geometry, merge the draft, or declare region gameplay ready**. After WS01/11 acceptance, obtain measured routes + Y/collider evidence from WS10 and reference-matched visual signoff from WS12, then implement the approved nature meshes through WS11's single-world adapter.

**Manager ownership:** Only WS11 updates consolidated [#939](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/939). This is an individual WS08 review artifact and does not issue cross-owner approvals.
