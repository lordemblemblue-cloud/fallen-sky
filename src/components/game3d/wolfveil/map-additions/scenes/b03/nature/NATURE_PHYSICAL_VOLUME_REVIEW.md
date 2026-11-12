# WS08 — Original-anchor boulder / pine sub-volume physical review request

**Status:** SOURCE PROFILE + ARTIST REVIEW REQUEST, **NOT LIVE COLLISION, ARTIST GLB, APPROVED LOCOMOTION, OR G0 RELEASE**.  
**Owner:** Workstream 08, 21–30 natural scenery. [Task #963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963), [Draft PR #952](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/952).

This request follows WS11 [five-asset source road crossing classification](https://github.com/marcusflow1-arch/atom-x-eve-os/blob/coord/wolfveil-map-ws11-20261105/docs/game3d/wolfveil-integration/ROAD_ASSET_CENTERLINE_DECISION_V1.md). **The master G0 remains closed.** The two original source X/Z anchors and the existing original Wolfveil source routes must remain unchanged unless WS01 and WS11 expressly approve a separately documented reference tradeoff.

## Confirmed original design data vs proposed asset decisions

Actual original `21_western_cedar_forest.xlsx` and `24_highland_meadow.xlsx` were opened with `artifact_tool`. The `3D Object Placement` rows say `design_target_not_built`, yaw 0°, and the `3D Shape Sections` profiles contain **seven design-target ring rows each**. The rings provide intended artistic cross sections—not verified loaded-GLB triangles, roots, collider bounds, headroom or gameplay mechanics.

| Source feature | Original local X,Z | W×D×H reference envelope | Seven-ring profile | Exact original source-road centerline within full envelope |
| --- | --- | --- | --- | --- |
| `S21-MOSS_BOULDER` | (−310m,+56m) | 5.2×3.9×2.9m | `irregular-rock`, basal radii (1.760,1.320)m | **3.669850m**, `west_woodland_fork` |
| `S24-BLACK_PINE` | (−72m,+375m) | 6.8×5.1×10.4m | `trunk-section`, basal radii (3.400,2.550)m | **6.375000m**, `ridge_path` |

The pine's **original design ring** at Y0 spans a wide X/Z ellipse. Therefore it would be misleading to claim the original spreadsheet confirms a narrow, nonblocking trunk. Equally, the large design ring is **not** proof of its future solid collider: the actual artist mesh, limb volumes and collision profile are not built or verified.

## New machine-readable review packets

`naturePhysicalVolumeRequests.mjs` emits **two immutable source-anchored review packets with seven independent physical-volume questions**:

| Source asset | Proposed layer/question | Responsible decision |
| --- | --- | --- |
| Scene21 boulder | `stone_body`: possible full-solid stone volume | WS08 artist shape; WS01/11 route-preserving design approval; WS10/12 live collision and passage |
| Scene21 boulder | `stone_ground_bearing`: support/contact layer | WS01 terrain Y; WS08 authored rock; WS10 real foothold/collider |
| Scene21 boulder | `moss_surface`: decorative outer material | WS08 surface styling, WS02 shared material rules, cannot erase stone collision |
| Scene24 black pine | `root_flare`: rooted base | WS08 realistic root geometry, WS01 true ground Y, WS10 mount/foot safety |
| Scene24 black pine | `trunk_core`: genuinely solid wood | WS08 physical trunk surface, WS10/12 actor corridor |
| Scene24 black pine | `branches_overhead`: height and lateral reach | WS08 model + WS09 wind treatment, WS10/12 player/mount headroom and camera |
| Scene24 black pine | `leaf_crown`: visual canopy | WS08 realistic dimensional foliage and LOD, WS09 effects, WS10 whether collision is appropriate |

All seven responses intentionally contain `actualLocalBoundsMm:null`, `actualLocalGroundContactYMm:null`, `actualActorClearanceM:null`, `actualMountClearanceM:null`, `actualHeadroomM:null`, `actualSolidColliderId:null`, `collisionDecision:null`, `measuredVolumeProvenance:null`, three `lod*MatchVerified:false` flags, `ws10Approved:false` and `independentWs12Verified:false`.

They are **requests for independent later measurement**, not a ready-to-run collision system or a green-light for invisible barriers, pass-through boulders, auto-collidable tree leaves, procedural wind hitboxes or altered navigation. Global return fields `geometryAuthorized:false`, `noCollisionBypassGranted:true` and `physicsAuthoringPerformed:false` explicitly maintain this distinction.

## Optional research sites — separate from original source

[The six-location source comparison](NATURE_ROUTE_ALTERNATIVES_REVIEW.md) gives the following optional **unapproved** shifts (all original references remain unchanged):

- S21 boulder **near** (−307,+59)m, 4.243m from original: no nominal source road ribbon contact but fails hypothetical +2m margin.
- S21 boulder **farther** (−303,+59)m, 7.616m from original: clears both *source-planning* nominal ribbon and additional provisional 2m rectangle; analytic ground center Y129.439m and footprint span3.329m.
- S24 pine **near** (−77,+378)m, 5.831m from original: no nominal road ribbon but fails hypothetical +2m margin.
- S24 pine **farther** (−79,+380)m, 8.602m from original: clears those source-only XZ study bounds; analytic ground center Y127.216m and footprint span2.512m.

These locations are **not selected** and must not be registered as asset instances. They are susceptible to reference-image mismatch and unmeasured terrain. WS01/11 may keep the original positions and choose a physically valid sculpted solid shape/corridor solution instead. **WS10** defines real actor/mount/headroom criteria; WS12 independently judges fidelity and actual runtime behavior.

## Evidence and gating

- Actual originally uploaded spreadsheets were inspected: seven full records for each target agree exactly with immutable `NATURE_DESIGN_PROFILE_RINGS`; placement W/D/H/Y rows match `referenceTargets.mjs`.
- Exact GitHub-authored `natureRouteAlternatives.mjs` and `natureAlternativeNeighborhood.mjs` test functions: **13/13 PASS** in isolated V8 harness (not native Node full private repository).
- New `naturePhysicalVolumeRequests.mjs` + `naturePhysicalVolumeRequests.test.mjs`: **7/7 PASS** in the same source-derived isolated V8 harness (not native full-repository Node, build or live physics).
- No browser screenshot/source-photo comparison, GPU triangle performance, cloth/wind shader, actual terrain Y and mesh raycasts, actor/nav, LOD scene transition, two-player authority, `npm ci`, Vite build or GitHub green CI has been verified here. Six Wolfveil branch Actions previously failed with unverified runner cause.

**Owner acceptance needed:** WS01/WS11 choose reference-faithful boulder and pine physical design/coordinates after G0, WS08 builds true 3D source asset volumes *only when authorized*, WS10 measures two-way player/mount/AI passage plus overhead clearances, and WS12 certifies image fidelity, source-vs-render positions and runtime perf/physics. The full scene remains unmodified and PR #952 stays draft.
