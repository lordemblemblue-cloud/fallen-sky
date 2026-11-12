# WS08 — Exact road-centerline / nature reference footprint handoff

**Status: SOURCE-ONLY, NOT AUTHORIZED FOR GEOMETRY OR COLLISION.**  
**Owning workstream:** 08, Wolfveil scenes 21–30 nature.  
**Main world source:** \`src/components/game3d/wolfveil/WolfveilLayout.js\`, Git blob \`b4b10dd15737d62c62a476e500adb433a6d015b6\`.  
**WS08 source reference:** \`referenceTargets.mjs\`, Git blob \`9c6810e75d20f13c6d5534a51ed1a39de1e921f7\`.  
**Independent corroboration:** [WS12 WV-QA-016](https://github.com/marcusflow1-arch/atom-x-eve-os/blob/map/ws12-testing-optimization/docs/game3d/wolfveil-qa/SCENE21_CLEARANCE_AUDIT_2026-11-05.md).  
**WS08 task / draft PR:** [#963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963) / [#952](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/952).

## What was actually verified

The new pure \`natureRoadCenterlineAudit.mjs\` examines all **19** proposed natural-source AABBs against **all 10** existing source route polylines, using unshifted local X/Z metres and parametric Liang–Barsky clipping of entire segments (not just route endpoints). No geometry is generated. Clipped entry/exit points are rounded for reporting to the nearest micrometre; intersection distances are rounded to six decimal places. Nominal route width is reported but is **not** automatically translated into a valid player/mount passage. The independent \`sourceClearanceAudit.mjs\` retains its separate provisional width/2 + 2m broader proximity warnings; the two audits have different meanings.

### Two exact source-plan centerline crossings

| Nature proposal | Existing route | AABB X/Z (local metres) | Entry (X,Z)m | Exit (X,Z)m | Line inside AABB |
| --- | --- | --- | --- | --- | ---: |
| \`S21-MOSS_BOULDER\` | \`west_woodland_fork\` (nominal width 2.7m) | X[−312.6,−307.4], Z[+54.05,+57.95] | (−310.145,+54.05) | (−312.600,+56.777778) | **3.669850m** |
| \`S24-BLACK_PINE\` | \`ridge_path\` (nominal width 2.8m) | X[−75.4,−68.6], Z[+372.45,+377.55] | (−73.1625,+372.45) | (−69.3375,+377.55) | **6.375000m** |

**Scene21 significance:** WS12 previously independently computed the boulder intersection as **3.66984967m** using the original workbook and source route. The reproduced six-decimal result here agrees. The proposed **solid boulder** has a credible planning conflict with the path centerline. Do not mount a solid AABB/rock collider at that footprint or change the existing road. WS08 should propose a reference-compatible alternative **only** after WS01/WS11 coordinate and WS10 path-footing clearance; reference anchors are intentionally unchanged for now.

**Scene24 significance:** The second 6.375m direct crossing is newly quantified beyond the earlier generic \`ridge_path\` proximity warning. A pine's reference envelope includes branches/canopy and is **not necessarily the final solid trunk AABB**. This result therefore requires WS08+WS10 to resolve actual trunk footprint versus noncolliding crown, sightlines, mount headroom and route width. Do not claim that the pine already blocks actual gameplay. Scene24 separately has \`S24-WILD_GRASS\` vs WS07 \`S24-TRAIL_STEPS\` 29.7m² overlap, which is not this pine-versus-road finding.

Among the **six** earlier provisional **route-proximity** flags, only **two** intersect an actual source centerline using the full reference envelopes; the other four are nearby, not centerline-confirmed. River wetland contacts (two) remain WS02 hydrology review and are not part of the 10-route centerline scan. This is source geometry arithmetic, not a signed-in navmesh/renderer/physics test.

## Code safety and combined approval guard

- \`natureRoadCenterlineAudit.mjs\` exposes pure \`clipNatureRoadSegment\`, \`natureRectangleLocalMeters\`, and \`auditNatureRoadCenterlines\`; it validates safe integer-mm reference coordinates, nonempty road catalogs, duplicate IDs, finite width and polyline points. Each report explicitly carries \`solidColliderAuthorized:false\`, \`routeModified:false\`, \`centerShiftApplied:false\`, \`actorTravelVerified:false\`, \`geometryActivated:false\`.
- Updated \`natureReviewQueue.mjs\` accepts an **optional separately validated** \`roadCenterlineAudit\`. If supplied it merges direct crossings under \`WS10_SOLID_NATURE_CENTERLINE_CONFLICT\`, retaining intersection length and route identity without moving the reference. If absent it adds \`EXACT_ROAD_CENTERLINE_AUDIT_MISSING\` and holds every candidate against inferred placement approval. Stale, foreign, artificially activated or invalid hit evidence is rejected.
- **All 19 nature proposals remain unplaced and physically unapproved** regardless of a zero direct-overlap result. Nothing authorizes mounts, player/AI collider clearance, cave travel, water levels, source terrain Y, snow ridge chunk extension, merged PRs or deployment.
- Workstream 01 owns shared world/road/terrain coordinates; Workstream 10 owns real route and collider QA; Workstream 11 owns shared adapter and signoff; Workstream 12 independently verifies physical two-way traversal after a mesh exists. The S21 boulder and S24 pine are only future WS08 nature asset shapes.

## Verification

At this checkpoint, the exact source modules and exact new/updated test module bytes were fetched back from GitHub. Executing their authored test bodies in an isolated synchronous **V8 JavaScript assertion harness** produced **15/15 PASS**: six new \`natureRoadCenterlineAudit.test.mjs\` tests and nine \`natureReviewQueue.test.mjs\` tests (six older + three new). These execute the actual commit source logic but are **not** native \`node --test\` in the full private repository; that native test and its broader import graph remain **NOT RUN**. Source arithmetic against the *real* main route definition, not a guessed road, reproduced exactly two crossings and the WS12 boulder length.

**Still NOT RUN:** real 3D mesh raycasts/colliders, foot/mount/NPC two-way traversal, signed-in screenshots/lighting/GPU/FPS, private repo full \`npm ci\`/Vite/CI, game server authority or a restored Scene26 original image. Workstream 01 #948 and WS11 #940 remain draft; geometry G0 still **CLOSED**.

**Next owner review:** WS10 should prioritize both exact crossings before any solid trunk/rock mesh registration. WS01/WS11 should approve any reference-compatible placement/shape resolution, preserving all original route IDs/coordinates. WS12 should confirm physical path width and headroom in actual runtime after authorization. No individual workstream can clear these conditions from source-only analysis.
