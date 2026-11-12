# Wolfveil WS08 — Scene21 boulder / Scene24 pine alternative study

**Evidence status:** SOURCE-ONLY, not approved geometry, physical collision, or route relocation.  
**Owner:** WS08 Batch03 Nature · [Official issue #963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963) · [Draft PR #952](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/952).  
**Coordination:** WS11 [five-crossing manager decision](https://github.com/marcusflow1-arch/atom-x-eve-os/blob/coord/wolfveil-map-ws11-20261105/docs/game3d/wolfveil-integration/ROAD_ASSET_CENTERLINE_DECISION_V1.md) classifies S21 full-solid rock **HOLD** and S24 trunk-versus-crown **HOLD**. G0 remains CLOSED. All original Wolfveil routes and reference target X/Z coordinates remain unchanged.

## Source provenance and exact original intent

The actual original `21_western_cedar_forest.xlsx` and `24_highland_meadow.xlsx` were read and checked using `artifact_tool`, specifically `3D Object Placement` and `3D Shape Sections` sheets. Both source rows are `design_target_not_built`, yaw 0 degrees; section rows are `DESIGN_TARGET; artist/GLB must verify exact mesh sections`. They are **not actual mesh triangles, trunk colliders, branch reach or tested geometry**. Original scene PNGs are available, but no side-by-side signed-in rendered acceptance occurred.

| Field | S21 `MOSS_BOULDER` | S24 `BLACK_PINE` |
|---|---|---|
| Source local X/Z | (−310,+56)m | (−72,+375)m |
| Source local analytic center Y | 133.010m | 124.930m |
| Full design AABB width × depth × height | 5.2×3.9×2.9m | 6.8×5.1×10.4m |
| Design ring type | `irregular-rock` | `trunk-section` |
| Source ring count | 7 | 7 |
| Base ellipse radii (X,Z) | (1.760,1.320)m | (3.400,2.550)m |
| Original whole-AABB route centerline overlap | **3.669850m** `west_woodland_fork` | **6.375000m** `ridge_path` |
| Max source ring centerline crossing among seven sections | **1.770713m** | **5.452637m** |

**Interpretation:** WS12 independently verified 3.66984967m for S21 original boulder. Source rock rings can suggest a variable silhouette, but cannot justify invisibility, no-collision illusion or moving an original full-solid boulder onto an existing path. The source S24 pine's *trunk-section design profile* has a wide Y0 ellipse, so **do not claim the source workbook proves a narrow physical trunk**. WS11 requires distinct proposed root, physical trunk, noncolliding crown, branches, walkable corridor, headroom and LOD-consistent collider specifications **without moving the original reference** pending review. This study does not provide those as approved real dimensions.

## Six unapproved location comparisons

`natureRouteAlternatives.mjs` uses real main `WolfveilLayout.js` 10 source routes, exact continuous line clipping, elliptic proposed design rings, full reference envelopes, original nominal half-road widths, and a separately **unapproved** additional 2m review margin. All positions use unshifted source-local X/Z and preserve the separately recorded originals in `TARGETS`.

| Study key | Candidate source-local X/Z (m) | Shift from original (m) | Max design-ring line crossing (m) | Nominal route ribbon contact? | Proposed +2m margin contact? |
| --- | --- | ---: | ---: | --- | --- |
| `S21_REFERENCE` | (−310,+56) | 0 | 1.770713 | **Yes** woodland fork | **Yes** |
| `S21_NEAR_TRAIL_CLEARING` | (−307,+59) | 4.243 | 0 | No | **Yes**, woodland fork |
| `S21_EASTERN_CLEARING` | (−303,+59) | 7.616 | 0 | No | No |
| `S24_REFERENCE` | (−72,+375) | 0 | 5.452637 | **Yes** ridge path | **Yes** |
| `S24_WESTERN_SLOPE` | (−77,+378) | 5.831 | 0 | No | **Yes**, ridge path |
| `S24_UPHILL_PINE` | (−79,+380) | 8.602 | 0 | No | No |

A zero result means only that sampled 2D source profiles do not meet the route centerline / planning ribbon; it is **not WS10 foot, mount, NPC, trunk, root or visibility clearance**. The planning 2m increment is not an approved gameplay requirement. No alternative is silently substituted for the reference or activated.

## Independent WS07/other nature and analytical ground preflight

`natureAlternativeNeighborhood.mjs` separately checked **all six candidates against 29 WS07 original architecture proposals**, all other 18 WS08 reference rectangles, original 100×100m home study rectangles and nine original `wolfveilHeight` analytic samples per candidate. Each stays inside its *home study view*, with **zero exact or 2m WS07 structure envelope contacts and zero other WS08 reference-rectangle overlaps** under these *specific* supplied proposals. The analytic center and nine-point span outputs are:

| Study key | Proposed-only analytic center Y (m) | Nine-point analytic Y span (m) |
| --- | ---: | ---: |
| `S21_REFERENCE` | 133.010 | 2.147 |
| `S21_NEAR_TRAIL_CLEARING` | 131.472 | 2.865 |
| `S21_EASTERN_CLEARING` | 129.439 | 3.329 |
| `S24_REFERENCE` | 124.930 | 2.480 |
| `S24_WESTERN_SLOPE` | 126.291 | 2.507 |
| `S24_UPHILL_PINE` | 127.216 | 2.512 |

These numbers come from the same **source analytical model**, not actual loaded mesh/collider Y. Different Y values at alternates mean they **cannot be approved as drop-in transforms** without ground bearing and photo matching. `proposedBaseYmm` deliberately remains `null` for every candidate. Existing original coordinates and the WS07 proposal set remain untouched.

## Verification and pending decisions

- **Executed:** the exact fetched GitHub `natureRouteAlternatives.mjs` + `natureAlternativeNeighborhood.mjs` and their two test files were run in an isolated JavaScript assertion harness, **13/13 test functions passed** (7 + 6). These test functions verify six source ring comparisons, road clearance categories, immutable source coordinates, fail-closed inputs, WS07 geometry screening and no invented physical Y.
- **Not yet performed:** native `node --test` in a full private repository, full `npm ci` / Vite build / green Actions, actual mesh/collider Y or underground surfaces, in-game route/mount/AI traversal, real root/canopy/branch colliders, LOD physical consistency, original PNG vs signed-in scene screenshot matching and WS12 independent performance/network QA.
- **Owner action:** WS01/WS11 must decide whether any alternate source site is reference-faithful or whether a differently sculpted rock allows a legitimate *actual passage* at original S21 source X/Z. For S24, WS08 next prepares a **separate proposed trunk/root/branch/canopy collision-class contract at the original source location**, not an assumed narrow core, and coordinates this with WS10/WS12. WS10 later sets actor/mount clear width and vertical headroom acceptance; WS12 independently tests in real runtime after G0.
- **No game changes:** zero meshes, routes, world tiles, scene roots, hydrology, colliders, global tree builders, architecture or shared asset adapters added. PR #952 stays **draft and unmerged**, G0 CLOSED, Scene26 original PNG still corrupt.

**Do not merge or activate anything on the strength of 2D model ring / analytic Y comparisons.**
