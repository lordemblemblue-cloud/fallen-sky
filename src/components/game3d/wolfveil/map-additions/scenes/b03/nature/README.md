# WS08 — Wolfveil Batch03 nature, reference-locked preflight

**Status: DRAFT ONLY / NOT RENDERED / NOT AUTHORITATIVELY PLACED / NOT MERGEABLE.**
No source game scene, global terrain, water, cave traversal, building, server collision or existing forest-generation file was modified. This directory has **no runtime imports**.

## Reference audit
Google Drive: [Batch03 reference folder](https://drive.google.com/drive/folders/1XWKlsBtaU1FKJTvEE2jgC4QlZ9zLAfVo), nested `Batch03/Scene_21` through `Scene_30`.
- Each of the ten folders contains its own PNG, XLSX, DOCX (30 entries total); all ten DOCX contents and ten XLSX workbooks were read.
- XLSX: 100 10m tiles and five *proposed* object envelopes per scene: 1,000 tile records; 50 envelopes. Nineteen source targets are classified as WS08 (see `referenceTargets.mjs`). Architectural, route, terrain and hydrology targets stay outside WS08.
- Scene 26 `26_eastern_river_wetland.png` was fetched twice but fails full PNG decoding; its workbook and DOCX are intact. Request valid replacement before signed visual comparison.
- Source reference images are schematic top-down placement diagrams, **not actual before or after Game 3D screenshots**.

## Scene scopes and boundaries

| Scene | Reference nature work / protected seam |
|---|---|
| 21 cedar forest | Cedar trunk, moss boulder, ferns. Protect `training_forest`, `west_woodland_fork`, WS07 stone lantern and footbridge. |
| 22 wolfstone | Fractured granite wolfstone and alpine pines. Preserve boss combat/nav area; rune cairn, terrace and walkway owned elsewhere. |
| 23 bamboo valley | Real curved bamboo and lichen log. Dry trail, torii and tablet are WS07; **do not invent a creek**. |
| 24 meadow | Grasses, herb cluster, black pine; `ridge_path` open for mounts, WS07 trail steps/marker. |
| 25 south farms | No source-declared WS08 object; crop dressing is *artist-derived only after* WS07 irrigation/terraces and reserved housing cleared. |
| 26 wetlands | Reeds, pebble bank, maple. Existing river water/physics are WS02/WS10; no wetland hydrology rewrite. |
| 27 discovery cave | Stalagmites and optional lichen beyond WS07 cave portal. Never unlock tunnel until WS10 authorizes two-way traversal. |
| 28 root cavern | Twisting root arch, ore. Real cave ceiling, floors, exit shaft and pool remain WS07/WS02/WS10. |
| 29 twin peaks | Alpine pine cluster and subordinate rock details only; source ridge terrain WS01 and switchback/lookout WS07. |
| 30 hot springs | Natural geothermal rock steam-vent envelope; maple grove optional after WS07 lantern/deck/bathhouse clearance. Pool fluid WS02; steam FX WS09. |

## Coordinate and overlap safety

Current reference centers are listed in `referenceTargets.mjs`, each in integer *unshifted local mm*. The existing Three.js Wolfveil builder already conditionally moves its entire parent group +70m along Z when `originAtMarket`. Data-only `viewerPosition` exists **for reporting**, never feed its output back into a group that is already shifted. The analytical Y values are from `wolfveilHeight` snapshots, not browser GPU/physics raycasts. Scene 21/27, 21/28, 22/28 and 24/30 have overlapping 100m coverage squares; scene seams need WS01/WS07 approval. Several scenes lie beyond the bounded 500m precision grid; never clamp to that grid.

## Implementation strategy (approval blocked)
- `referenceTargets.mjs` records 19 proposed nature-only envelopes and unique `WV-Snn-WS08-...` IDs. It is safe to read and cannot register any real mesh.
- `planNatureAnchors` is a non-mutating dry-run; it requires supplied terrain-height and clearance callbacks from an authorized scene integration adapter, rejects unsafe anchors, never moves a reference coordinate to avoid a conflict, and returns `activated:false`.
- Nonactivated concept previews and higher-detail local staging models exist outside this branch for review only. They cannot count as runtime proof. PBR/LOD/colliders/GLBs require further authored material and WS12 validation.
- The authoritative `WS01` world-spec SHA is **not available**, so `APPROVED_WS01_SPEC_SHA=null`. **Do not connect** this module to `WolfveilScene.js` until WS01 publishes the reviewed version and WS11 owns a separate small adapter PR. Existing deterministic forest trunks and server-authoritative collision map must remain in sync.

## Validation, blockers and review handoff

Base `main` SHA: `b205b2e0be421d9e4b3831a8fa2038916df79a88`.
Reference planner's *local staging package* was run under `node --test`: 7 tests passed (different, expanded local module). **This GitHub preflight module has not been executed in a repo checkout**. The required commands to run are `node --test src/components/game3d/wolfveil/map-additions/scenes/b03/nature/referenceTargets.test.mjs`, then `npm ci`, `npm run build`, `npm run lint`, `npm run typecheck`, studio planner, and focused Wolfveil/terrain suites. All remain UNTESTED here. There is no actual rendered Game 3D camera screenshot, GPU performance measure, raycast, signed-in traversal or multiplayer parity. No deployment or release is claimed.

Dependencies: **WS01** approve world scale/overlaps/global grid and pin spec SHA; **WS07** approve nature placement buffers around architecture, caves, farm assets and paths; **WS02** confirm water boundaries, **WS09** steam/lighting; **WS10** clear mount/player/NPC navigation and physics; **WS11** review integration/overlaps; **WS12** test and capture matched before/after runtime screenshots; **owner** sign off prior to merge. [Coordination Issue #939](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/939) has the posted WS08 handoff; [WS11 PR #940](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/940) defines protected shared paths.

No architecture/water/terrain/runtime file changes. This PR is preflight and intentionally draft.

## 2026-11-05 source-only WS07 architecture seam audit (V2 continuation)

**Task:** [WS08 issue #954](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/954). The executable **dry-run audit** and seven focused tests are in the *same exclusive WS08 directory* as this file: `architectureSeamAudit.mjs` and `architectureSeamAudit.test.mjs`. They accept explicit WS07 candidate records as input; they do not import WS07 files, mutate coordinates, create meshes or activate colliders.

Independently inspected current [WS07 PR #950](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/950) proposed object records, and compared **18 WS08 × 29 WS07 = 522** source-local axis-aligned plan-view footprint pairs:

| Type | Nature proposal | WS07 architecture proposal | 2D result | Action |
| --- | --- | --- | --- | --- |
| Positive-area intersection | `S24-WILD_GRASS` | `S24-TRAIL_STEPS` | **29.7 m²** | WS07 + WS08 design adjustment/review; do not independently move trail or terrain |
| 2m provisional setback | `S26-PEBBLE_BANK` | `S26-WATER_LOOKOUT` | 0 m² exact; within review buffer | WS02 waterbank, WS07 lookout, WS10 traversal approval |
| 2m provisional setback | `S27-STALAGMITES` | `S27-SAFE_FLOOR` | 0 m² exact; within review buffer | WS07 portal/floor and WS10 cavern clearance review |
| 2m provisional setback | `S30-STEAM_VENTS` | `S30-BATHHOUSE_EXT` | 0 m² exact; within review buffer | WS07 entry/bathhouse and WS09 geothermal FX review |

**This is not runtime collision evidence.** Rectangles are preliminary spreadsheet envelopes, not surveyed or oriented mesh bounds; the 2m setback is a conservative review parameter, not an approved walkable width. The checker refuses a missing WS07 inventory rather than returning a false all-clear. Fresh architecture data must be re-read after any WS07 branch update.

**Test evidence:** isolated local Node 22.16.0 command `node --test architectureSeamAudit.test.mjs` yielded **7/7 passing**, and the independent previous local prototype's seven staging tests yielded **7/7 passing**. Those local tests used a checked source-manifest mirror, not a full checkout of private main. **GitHub CI, full repository tests, npm build/lint/typecheck, signed-in browser screenshots, terrain raycasts, physics and server parity are still unrun**. Refuse merge or runtime scene registration until WS01/WS11 G0 and independent WS12 acceptance.

**Manager handoff:** #939 remains the consolidated ledger owned by WS11. This WS08 issue #954 is the local workstream task record. WS08 will not update the manager ledger directly.

## 2026-11-05 additional S30 workbook-based natural scope (Protocol V2)

WS11 assigned three unallocated Batch03 objects in [official WS08 task #963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963), superseding duplicate WS08 task #954 as the **manager-designated** progress destination:

- **S28-LOWER_POOL:** Water and lake-surface behavior owned by WS02, cave and playable chamber structure by WS07/WS10. **NOT** claimed as a WS08 nature geometry target.
- **S29-CLIFF_STACK:** Reference-authored jagged 13.2 m × 11.8 m × 24.1 m spire at local (+6m,+477m), ground model estimate Y+178.590 m. **Pending split:** WS01 cliff topology/geologic base; WS08 *only* surface dressing after WS01 approves natural-rock ownership and WS10 traversal. Intentionally **NOT** inserted into WS08 `TARGETS` because it would imply premature scene object ownership.
- **S30-LANTERN_GROVE:** Reference `30_mountain_hot_springs.xlsx` and DOCX identify a proposed 8.3 m × 7.2 m × 8.7 m maple lantern garden centered at local (−88m,+337m), model-estimated Y+106.696m. WS08 now records **maple canopy / leaf vegetation only** as the 19th gated source target; WS07 retains lantern-built elements, pathways and construction. `ownershipGate:WS07_LANTERN_STRUCTURE_SPLIT_PENDING`; its feature is not rendered or accessible.

These changes are source-only and not an accepted geometry allocation. The reference proposal is **1.85 m horizontally east of the existing Bathhouse/WS07 BATHHOUSE_EXT rectangular footprint** (existing X maximum −94m; grove X minimum −92.15m). Therefore it has **no positive-area intersection**, but is **within the provisional 2m architecture review buffer**. The exact source S30 structure remains protected, and there is no speculative manual shift.

The proposed target coverage is now **19 WS08 natural references** and **29 WS07 architectural records**, or **48 of the 50** Batch03 object proposals given their separate owners; S28-LOWER_POOL and S29-CLIFF_STACK remain with WS02/WS01 design coordination. Note that a source-reference item can have a split visual responsibility; counts do not authorize extra independent objects. At the 2m planning buffer: one exact nature/architecture intersection S24 grass/trail steps; **four** advisory proximity contacts after adding S30 grove.

Validation: isolated Node local-mirror `node --test referenceTargets.test.mjs architectureSeamAudit.test.mjs`: **11/11 pass** (local mirror is not a complete checkout); GitHub PR file readback is recorded separately. No new terrain, water, world builder, registered meshes, collisions, in-game visual screenshot or deployment.

## 2026-11-05 continued: proposed nature cutout plan for architectural safety

**Authoring-only opt-in:** New `natureExclusionPlan.mjs` imports **only WS08's existing source data and source-only footprint checker**, and consumes caller-provided WS07 records. It does **not** import WS07 branch code, modify original object positions, apply `originAtMarket`, generate Three.js meshes, place trees, create terrain, or enable collision/physics. `natureExclusionPlan.test.mjs` exercises optional rectangle subtraction. Both files are restricted to WS08's owned namespace, are unreferenced by existing runtime, and preserve the current World Master approval gate.

### S24 meadow / steps: two alternatives requiring review

Original workbook target `S24-WILD_GRASS` is X=-47.000m, Z=+366.000m, W=14.5m, D=10.5m; proposed WS07 `S24-TRAIL_STEPS` is X=-42.000m, Z=+361.000m, W=3.6m, D=16.0m, in the unshifted Wolfveil local frame. No relocation is made.

| Proposed treatment | Original meadow area | Proposed excluded area | Remaining review-only grass envelope |
| --- | ---: | ---: | ---: |
| Exact path-envelope cutout, 0m extra margin | 152.25m² | 29.7m² | 122.55m² in 3 nonoverlapping rectangles |
| Hypothetical 2m margin around steps | 152.25m² | 62.0125m² | 90.2375m² in 2 nonoverlapping rectangles |

A 2m buffer is **only an unapproved design option**, not a validated player/mount path clearance. Rectangles are based on provisional source workbook envelopes; they cannot certify tree roots, grass overhang, slope, camera, player width, steps height, collision, or mount reachability. WS07 must approve the exact constructed stair shape; WS01 retains global path/terrain authority and WS10/12 must check physical access. No plant placement is considered safe simply because it falls outside these rectangles.

### Additional source-only reference flags at hypothetical 2m buffer

- S26 `PEBBLE_BANK` / WS07 `WATER_LOOKOUT`: 2.6975m² would be omitted from bank dressing if the 2m planning buffer were approved; zero exact AABB overlap.
- S27 `STALAGMITES` / WS07 `SAFE_FLOOR`: 0.62m² provisional cutout, zero exact overlap; access remains unbuilt.
- S30 `STEAM_VENTS` / WS07 `BATHHOUSE_EXT`: 0.88m² provisional cutout, zero exact overlap; geothermal atmospheric steam still belongs WS09.
- S30 `LANTERN_GROVE` / WS07 `BATHHOUSE_EXT`: 1.08m² provisional cutout, zero exact overlap; WS08 owns canopy only, lantern structures remain WS07.

**Quality:** Node v22.16.0 isolated source mirror; `node --check natureExclusionPlan.mjs`, `node --check natureExclusionPlan.test.mjs`, then `node --test referenceTargets.test.mjs architectureSeamAudit.test.mjs natureExclusionPlan.test.mjs` passed **20/20**, 0 failed, exit 0. Each of the two new GitHub file blob SHAs matched `git hash-object` for the tested local source verbatim. **This is not an npm checkout build or signed-in gameplay test.** Do not upgrade the PR to review-ready or merge until WS11 approves G0, Scene26 valid visual is supplied, and WS10/12 perform runtime QA.

Management: official workstream task [#963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963), architecture handoff [WS07 #953](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/953), master/world [WS01 draft #948](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/948). This report is **not** an alteration of WS11's consolidated project ledger.

## Source-defined road and river safety audit — 2026-11-05

Added `sourceClearanceAudit.mjs` and `sourceClearanceAudit.test.mjs` inside the exclusive WS08 namespace. **This is unactivated authoring QA, not gameplay collision validation.** The helper requires callers to supply `WOLFVEIL_ROUTES`, `WOLFVEIL_BUILDINGS`, `WOLFVEIL_HOUSING_PLOTS` and `WOLFVEIL_RIVER` from the existing shared `WolfveilLayout.js`. It does not import or alter those protected files, and it deliberately refuses missing source-layout inputs rather than claiming clearance. The 2m proposed setback and axis-aligned inflated rectangles are conservative and need WS10 review; no viewer +70m shift or terrain height is introduced.

The tested fixture samples exact source route/water/building records inspected in `main` `WolfveilLayout.js` blob `b4b10dd15737d62c62a476e500adb433a6d015b6`: west_woodland_fork, training_forest, ridge_path; bathhouse; sun_05 housing plot; existing river near the eastern wetland. **This is a partial source fixture, not every road/building/plot/river segment in a full runtime checkout.** It produced eight review flags among 19 proposed nature targets:

| Reference nature source ID | Existing source relationship requiring review |
| --- | --- |
| `S21-CEDAR_01` | `west_woodland_fork` corridor |
| `S21-MOSS_BOULDER` | `west_woodland_fork` corridor |
| `S22-WOLF_STONE` | `west_woodland_fork` corridor |
| `S24-BLACK_PINE` | `ridge_path` corridor |
| `S26-REED_CLUSTER` | River centerline plus water-width buffer |
| `S26-PEBBLE_BANK` | River centerline plus water-width buffer |
| `S28-ROOT_ARCH` | `west_woodland_fork` corridor |
| `S30-LANTERN_GROVE` | `ridge_path` corridor; separate bathhouse/WS07 buffer already flagged |

The checker does **not** move objects, open caves, authorize flora placement in water, modify existing source forest colliders, or assert that any reviewed rectangle physically blocks a route. In particular, apparent natural-rock silhouettes are not accepted for server-authoritative collisions by these tests.

**Verified execution:** using local staging checkout of the **exact committed source/test blob bytes**, `node --test sourceClearanceAudit.test.mjs architectureSeamAudit.test.mjs referenceTargets.test.mjs ws08-batch03-nature.test.mjs` => **24 passed / 0 failed**, Node v22.16.0. Exact Git blob hashes checked locally and through GitHub readback: module `eb6734b9aca24c591b83d0d858a7a604af80c5c0`, test `3508de11b096f14725db2cc153ee6b79df75069f`. This is not `npm ci`, full repo CI, browser screenshot, GPU LOD, actual height raycast, WS10 traversal, or two-client physics proof.

Continue to keep G0 **CLOSED** until WS11 accepts the WS01 coordinate SHA, Scene26 PNG is restored, WS07/WS10/WS02 review the affected paths/banks, WS12 obtains independent runtime evidence, and the owner authorizes integration. Official WS08 task: [#963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963).

## 2026-11-05 provisional WS01 global tile & study-view seam audit

**New owned files:** `natureTileCoverage.mjs` and `natureTileCoverage.test.mjs`. This read-only WS08 utility takes the **provisional, unapproved** WS01 `COORDINATE_MAP_V1.json` as an explicit parameter and requires its GitHub blob SHA `d84b129f97b2ac23b5d1cfecd0faf9e787a1dbac`. Pinning a source blob for audit is **not** WS01/WS11 permission for mesh creation.

**Exact source-only measurements against WS01 draft #948's 30-view planning map:**

- All **19/19** WS08 proposed X/Z object envelopes are fully inside their nominated 100m × 100m source study rectangles. A study rectangle is a *camera/authoring view*, **not** an independent world chunk.
- **15/19** objects extend outside the bounded 500m authoring core; they must use signed global local 10m keys (e.g. cedar center `G-X-033-Z+007`), not an invented/clamped `Txx-xx` core tile. **0/19** proposals extend beyond the 1,100m X/Z preview rectangle. This does *not* prove they are visible, raycast-valid or collision-safe; caves may still lack interiors.
- Two proposed foliage footprints cross a second detailed scene *study view*: `S24-BLACK_PINE` overlaps the S30 study rectangle; `S30-LANTERN_GROVE` overlaps the S24 study rectangle. These remain **one WS08-owned object each**, with shared-view coordination, not duplicated tree builders.
- Global tile convention is `G-X±NNN-Z±NNN`, with signed floor division on both axes and strict half-open 10m cell edges, including negative-boundary examples. The helper never shifts positions by the optional viewer +70m offset, never generates chunks, and fails closed if the provisional WS01 blob revision changes.

**Verification:** full run of the five WS08 nature-local test modules under Node 22.16.0 in the independent staging mirror, command `node --test referenceTargets.test.mjs architectureSeamAudit.test.mjs natureExclusionPlan.test.mjs sourceClearanceAudit.test.mjs natureTileCoverage.test.mjs` => **33 passed / 0 failed**; `node --check` on both new files passed. The exact authored new file bytes were compared with GitHub readback, matching blob SHAs `8d300f21991b8d69bcb35e45b7006a25dc52e92e` (module) and `a70187831432cc5f22b1563ffc8c1e42cbf39a39` (tests). The test fixture contains ten B03 study-view records; the separate all-30 WS01 source map was evaluated independently for the reported overlap counts. This is **not** a native private repo build/CI, authenticated game rendering, GPU benchmark, physical cave traversal, or client/server physics test.

**G0 remains closed**, original S26 PNG is truncated, and WS07's S24 stairs/S30 bathhouse layout and WS02 water constraints still need approval. Never enable nature geometry or merge this preflight PR on these source-only assertions. Official WS08 progress issue: [#963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963).

## 2026-11-05 fail-closed reference-planner owner approval safety

The `referenceTargets.mjs` `planNatureAnchors` pure dry-run now **separates spatial callback success from actual owner approval**. `S30-LANTERN_GROVE` has `ownershipGate:'WS07_LANTERN_STRUCTURE_SPLIT_PENDING'`, and is added to `blocked` even when injected `heightAt` and `clearanceAt` both report success. Each candidate records `blockedReason` and `evidenceStatus:'SOURCE_ONLY_NOT_RUNTIME_APPROVED'`; the returned report explicitly states `runtimeAuthorized:false` and `sourceClearanceOnly:true`. Invalid non-boolean clearance results fail closed with `TypeError` rather than being treated as truthy. Source center/offset, 19 object reference coordinates and other-workstream files remain untouched.

`referenceTargets.test.mjs` adds two named native Node cases (pending owner cannot bypass, strict boolean results) and corrects the existing expected blocked count to include the known pending grove. **This session** independently executed eight direct in-memory V8 assertions against the exact post-write GitHub source and checked both GitHub blobs by readback. The newly written Node test cases were **not executed in a full private repository checkout**; earlier 33/33 local tests belong to the previous checkpoint and must not be presented as a rerun or as green CI. Other known gates (WS01/WS11 master G0, Scene26 original PNG, WS07/WS10 clearances, WS12 runtime) remain open.

Task tracker: [WS08 #963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963); draft [PR #952](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/952).

## Additional sequential work — full main layout QA and nature visual art contracts

**Increment A:** `sourceLayoutFullAudit.test.mjs` is a new WS08-owned 4-case native Node regression test importing the existing source `../../../../WolfveilLayout.js` *read-only*. This is more complete than the earlier three-road partial fixture. Source-only cross-check against actual layout blob `b4b10dd15737d62c62a476e500adb433a6d015b6`: 19 proposed nature references, all 10 routes, 30 buildings, 24 housing reservations and 17 river control points; eight reviewed candidate contacts (six roads, two wetland riverbank), zero building/housing-plot direct envelope overlaps. Details and source-vs-runtime cautions in [FULL_SOURCE_CLEARANCE_REVIEW.md](FULL_SOURCE_CLEARANCE_REVIEW.md).

**Increment B:** `natureVisualContracts.mjs` and `natureVisualContracts.test.mjs` are source-only fidelity planning files covering **19/19 reference kinds**. They identify *proposed* mesh/detail strategies to meet realistic cedar bark, independent bamboo joints, non-flat ferns/grass, irregular rocks, natural shore pebbles, twisted cave roots and the sumi-e/spiritual atmosphere. The profiles deliberately leave terrain heights, material ownership, collision/forest-server parity and wind/steam physics to their respective owners. The Scene30 garden references **natural maples only**, marks WS07 built lantern ownership pending, and Scene26 marks its three proposed features as missing valid original image visual QA. The module returns `geometryActivated:false`, `assetsMounted:false` and `viewerShiftApplied:false`; **no meshes are created**.

**Verified in the active session:**
- Main-layout source checker: six executed direct JavaScript assertions against exact connector-fetched main and WS08 source; findings match the report.
- Visual profile module: eight executed direct JavaScript assertions against the exact connector-fetched 19 source references; all profiles present, no activation or bypass.
- Existing older **local staging mirror** Node 22.16.0 suite (five focused test files, source mirror not identical to latest GitHub planner): **33/33 PASS, exit 0**.
- Four new full-layout tests and four new visual-contract tests are committed and read back from GitHub; **native execution in a complete private repo checkout NOT RUN**. Do not add these eight cases to the 33-pass tally. Source Git blob readback verified.
- Source runtime, `npm ci`/build/lint/typecheck, signed-in reference screenshots, performance/GPU and player/physics/network QA: **NOT RUN**. CI previously failed before recorded job steps; reason unverified.

**Decision gate:** Workstream 11's [G0 release register](https://github.com/marcusflow1-arch/atom-x-eve-os/blob/coord/wolfveil-map-ws11-20261105/docs/game3d/wolfveil-integration/G0_RELEASE_DECISIONS_2026-11-05.md) explicitly keeps geometry integration CLOSED. Existing Scene26 PNG remains damaged. Authoring plans are not permission to implement or merge live assets. User-approved sequential work continues only within WS08-owned paths and approved preflight scope; future unattended hourly execution was not scheduled because the ChatGPT plan is already at the five-active-task limit.

## 2026-11-05 latest WS08 sequential increments — terrain sample and hold queue

1. `natureAnalyticalGroundSurvey.mjs`, `natureAnalyticalGroundSurvey.test.mjs`, `natureAnalyticalGroundSource.test.mjs` and [ANALYTICAL_GROUND_CONTACT_REVIEW.md](ANALYTICAL_GROUND_CONTACT_REVIEW.md) are **unactivated** source-only analytical terrain-contact audits. Nine planned source-surface points per 19 natural reference envelopes = **171** samples, yielding 16 proposed footprints above a **non-authoritative** 2m variation review threshold, seven above 5m and one above 10m; biggest is S26 Japanese Maple at **14.457m**. Every workbook's center Y reproduces the same original source formula within 1mm, which is expected circular model agreement, **not** actual mesh Y or cave-floor certification.
2. Immediately after completion, `natureReviewQueue.mjs`, `natureReviewQueue.test.mjs` and [SOURCE_REVIEW_QUEUE_HANDOFF.md](SOURCE_REVIEW_QUEUE_HANDOFF.md) added a **fail-closed** combined WS01 height + existing main roads/river/plots + WS07 architecture review queue. All 19 remain `AWAITING_OWNER_AND_RUNTIME_QA` and none can be marked authorized by a partial or missing input. Real connected sources showed: **16** analytical terrain-span flags; **6** route proximity; **2** waterbank proximity; **1** S24 exact architecture overlap; **4** additional WS07 2m margin reviews; **3** damaged-image Scene26 features; **3** cave interior blockers and **1** external S30 grove owner split. These counts overlap and do not mean distinct objects.

**Native local test evidence:** exact GitHub blobs for the two new module/test pairs were reproduced in an isolated local mirror and verified byte-identical by `git hash-object`: ground module `c9f823039e3ab7dc7734b72738da85de6c3da2d9`, ground test `8db4038e9783e4f1709b0fc7f5a4f179c5e92304`; queue module `845588250e6a70f53796b83a346ddd1bdffc00d4`, queue test `d3a20d18e1f288042cbb3e471c797eddd11917eb`. Native Node 22.16.0 focused new tests **12/12 PASS**, combined seven-test-module isolated staging suite **45/45 PASS** (exit 0). An initial test wrongly attempted to mutate a deliberately frozen report and failed; corrected only that test fixture, verified matching GitHub hash, reran PASS. This local mirror does **not** include a checked-out full private repo, is not the latest exact GitHub `referenceTargets.mjs` module, and does not execute the three additional direct-source integration tests from `natureAnalyticalGroundSource.test.mjs`. Full CI/`npm ci`/`npm run build`/browser/GPU/raycast/two-client QA **NOT RUN**; prior CI failures are unresolved.

No live objects or terrain changed. WS11 [G0 decision register](https://github.com/marcusflow1-arch/atom-x-eve-os/blob/coord/wolfveil-map-ws11-20261105/docs/game3d/wolfveil-integration/G0_RELEASE_DECISIONS_2026-11-05.md) keeps world geometry gated, and original Scene26 PNG remains invalid. Full details at permanent [WS08 task #963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963). Only WS11 can integrate the single-world adapter; only WS12 can independently accept runtime visuals/performance/physics.

## Exact source route-centerline audit — new S24 pine finding (2026-11-05)

Independent WS12 [WV-QA-016](https://github.com/marcusflow1-arch/atom-x-eve-os/blob/map/ws12-testing-optimization/docs/game3d/wolfveil-qa/SCENE21_CLEARANCE_AUDIT_2026-11-05.md) escalated the `S21-MOSS_BOULDER` source route intersection. WS08 performed its own **full 19 proposed WS08 rectangles × all 10 existing main-source routes** continuous-segment Liang–Barsky clipping using the original unshifted local X/Z source coordinates. Two original reference AABBs directly contain existing centerline segments:

- `S21-MOSS_BOULDER` ↔ `west_woodland_fork`: **3.669850m** centerline length inside proposed rock footprint, matching WS12's independently calculated `3.66984967m`. A solid rock footprint on the existing route is **not approved**. No alternate coordinates selected, route unchanged.
- `S24-BLACK_PINE` ↔ `ridge_path`: **6.375000m** source centerline length inside the proposed **entire tree envelope**. A source canopy rectangle is **not proof** that the tree trunk or physics collider blocks the route; WS10 must check actual trunk, player/mount headroom, and path width. No tree mesh activated.

This more precise check is separate from the previously known **six provisional route-proximity** source review flags, and the two WS02 wetland river-bank review flags. See [EXACT_NATURE_ROAD_CLEARANCE_REVIEW.md](EXACT_NATURE_ROAD_CLEARANCE_REVIEW.md). New files: `natureRoadCenterlineAudit.mjs` + 6 authored tests; `natureReviewQueue.mjs` was updated to accept optional exact-road evidence, to mark direct solid-footprint conflicts and otherwise explicitly record missing exact-road audits. `natureReviewQueue.test.mjs` now has nine authored tests (six existing, three new). **Every proposal remains G0-held and unplaced.**

**Actual verification:** fetched all current authored GitHub files and executed their test functions in a synchronous isolated V8 harness with strict assertions: **15/15 PASS**, including the two exact crossing lengths, tangent/boundary cases, malformed/stale audit rejection and all 19 being held. Direct native `node --test` in the complete private repository, signed-in scene meshes, real physics, player/mount routes, tree branch/headroom, CI success and 3D performance **NOT RUN**. WS01 #948 and WS11 #940 remain DRAFT; damaged original Scene26 PNG still blocks visual signoff. No new runtime geometry or protected-file edits.

## 2026-11-05 S21 / S24 source-ring alternatives and physical volume review

**WS11 source-only directive / G0 decision 10:** retain the original two Batch03 nature source anchors and propose reference-faithful rock/trunk designs without confusing a full canopy/profile study rectangle with a signed-in collider. The master geometry gate remains CLOSED.

- `natureRouteAlternatives.mjs`, `natureRouteAlternatives.test.mjs`, [NATURE_ROUTE_ALTERNATIVES_REVIEW.md](NATURE_ROUTE_ALTERNATIVES_REVIEW.md): read back **seven actual original worksheet `3D Shape Sections` rings** for each asset using `artifact_tool` (Scene21 `irregular-rock`, Scene24 `trunk-section`, both `DESIGN_TARGET`/GLB unverified). Compare unchanged original source reference and **two temporary location studies per object** against all 10 current road polylines. Original 2D full-envelope road centerline contacts remain boulder **3.669850m**, pine **6.375000m**; source ring maximum line crossings at original are boulder **1.770713m**, pine **5.452637m**. The near alternative for each avoids source nominal road ribbon but not a *proposed* +2m buffer; a farther alternative avoids both source-check rectangles without being approved for visual fidelity, ground or collision.
- `natureAlternativeNeighborhood.mjs`, `natureAlternativeNeighborhood.test.mjs`: separately review six temporary sites against **all 29 WS07 draft architecture records**, other WS08 original nature footprints, original scene study views and nine source-analytic Y samples per footprint. At checked draft heads: all six remain inside study views, no positive-area WS07/other nature envelope contacts under these *specific* proposed alternative sites; all six have >2m analytical terrain-model spread and `proposedBaseYmm:null`. This does **not** validate actual ground-bearing, player/mount route clearance or in-game photo matching.
- `naturePhysicalVolumeRequests.mjs`, `naturePhysicalVolumeRequests.test.mjs`, [NATURE_PHYSICAL_VOLUME_REVIEW.md](NATURE_PHYSICAL_VOLUME_REVIEW.md): **original-anchor** source-only physical reviewer packets for S21 stone body/bearing/moss and S24 root flare, solid trunk, overhead branches and leaf crown: **seven independent unknown/unmeasured physical layers**, each with null bounds/Y/actor/mount/headroom/collider and unapproved LOD/WS10/WS12 verification. Critically, the original S24 `trunk-section` Y0 design ellipse radii 3.4×2.55m are **artist design rings, not measured solid trunk**, and should NOT be silently replaced by an invented narrow trunk to declare a clear path. No collision bypass, object relocation or scene mesh is enabled.

**Executed tests:** exact GitHub module/test source ran via isolated synchronous JavaScript assertion harness. First two new suites **13/13 PASS** (7 alternate-sites, 6 neighborhood source audit), then physical-volume suite **7/7 PASS**. Also directly inspected original XSLX records using `artifact_tool` and reconciled source rings and X/Z/W/D/H. These are **20 focused V8 harness test passes**, NOT native `node --test` in the connected full private repository or a signed-in game. No `npm ci`, project build, GPU/rendering, actual Y raycasts, player/mount/AI traversal, WS12 independent runtime or two-player authority was tested. Current CI still cannot be called green; six Actions fail with root cause unresolved.

[WS11 road source decision](https://github.com/marcusflow1-arch/atom-x-eve-os/blob/coord/wolfveil-map-ws11-20261105/docs/game3d/wolfveil-integration/ROAD_ASSET_CENTERLINE_DECISION_V1.md) explicitly keeps S21 full-solid rock HOLD and S24 trunk-versus-crown physical decision HOLD. Only WS01/11 may approve a different source location; WS10/12 must independently test actual mesh clearance before integration. Any site coordinates in the alternative modules are **study values only**, not updated authoritative `referenceTargets.mjs` coordinates.

## Source-only WS08/WS01/WS11 physical survey catalog crosswalk (2026-11-05)

Follows the three previous S21 boulder/S24 pine **original-reference** and optional-site studies without declaring relocation or creating meshes. Added `naturePhysicalSurveyCrosswalk.mjs` + `naturePhysicalSurveyCrosswalk.test.mjs` and [NATURE_PHYSICAL_SURVEY_CROSSWALK.md](NATURE_PHYSICAL_SURVEY_CROSSWALK.md). The crosswalk consumes **the actual connected WS01 200 terrain X/Z control catalog**, **WS11's 17 physical survey priority request catalog** and WS11's separate 17-site manager coordinate crosswalk, pinned by exact GitHub source blobs. It checks the six S21/S24 original/optional source-local integer-mm centers against those catalogs and the **seven separate unmeasured boulder/pine physical part review questions**.

**Verified exact joins:** **0/6** source/study centers match the 200 WS01 terrain control positions; **0/6** match WS11's 17 prioritized G0 request centers. The original S21 boulder is listed in WS11's `scene21_new_issue` special risk section—**not** a normal assigned physical request ID nor a runtime raycast. Original S21 packet has 3 stone/support/moss part questions; original S24 packet has 4 root/trunk/branch/crown part questions. The **four hypothetical alternative sites inherit no measured geometry or original physical part requests**. All actual local surface/collision Y, rock/trunk volume, manager-issued measurement ID, WS10 approval and WS12 evidence remain **null/false**; `authorizedPhysicalMeasurements:0`.

**Verification:** exact committed module/test source read back from GitHub and **8/8 focused tests passed** in isolated synchronous V8 assertion harness, including immutable source references, stale catalog SHA, original-anchor and G0 status rejection. This is not native private-repo Node/CI, browser/WebGL, collision, multi-client or actor/mount QA. Combined same-session focused checks for optional site/ring, physical component review and this catalog join: **28/28 isolated JS checks passed**; NOT full native suite nor green GitHub Actions. WS01/WS11 have not authorized geometry; source SHA pins are not approval. **Do not bulk-create six manager survey sites** before WS11 decides the actual reference-faithful asset design. Detailed output in [NATURE_PHYSICAL_SURVEY_CROSSWALK.md](NATURE_PHYSICAL_SURVEY_CROSSWALK.md).

## 2026-11-05 V2 proposed 214-point source survey / nature hold reconciliation

**Provisional source ownership update:** WS01's old 200-point catalog now has a **proposed** 14-point overlay on its draft #948; WS11's draft #940 independently maps **17/17** old priority request IDs to the proposed WS01 214 controls, with zero actual raycast/collider measurements or accepted G0 SHA. Earlier [NATURE_PHYSICAL_SURVEY_CROSSWALK.md](NATURE_PHYSICAL_SURVEY_CROSSWALK.md) is a correct *historical V1 snapshot* of six original/optional boulder/pine centers against the original 200+17; it is not a full 19-nature current-source survey audit.

New `natureG0OverlayAudit.mjs`, `natureG0OverlayAudit.test.mjs` and [NATURE_G0_OVERLAY_214_REVIEW.md](NATURE_G0_OVERLAY_214_REVIEW.md) preserve exact owner catalog SHA and source-local mm. Full 19/19 WS08 nature center comparison found:
- **S28 ROOT_ARCH** matches original WS01 **`WV-CTRL-0133`**, but this XZ does NOT verify interior cave floor/roof Y, roots or a valid two-way portal.
- **S30 LANTERN_GROVE** matches WS01 overlay-proposed **`WV-CTRL-0214`** and WS11 priority **`G0-S30-LANTERN-GROVE`**, but WS07 built lanterns/bathhouse, WS10 access, physical trunk/canopy bounds and WS12 QA remain gated.
- Original **S21 MOSS_BOULDER** and **S24 BLACK_PINE** are absent from exact WS01 214 and WS11 17 priority control ID sets, **not** absence of the assets in the reference. WS11 only acknowledges S21 as a special source-road risk; no measured physical survey ID exists yet.
- Overall **2 of 19 WS08 center anchors** are matched to current proposed-or-base WS01 control points and **1 of 19** also has WS11 priority. Zero measured Y, zero verified physical clearance, zero active geometry.

As a **second immediately completed source-only increment**, `natureReviewQueue.mjs` and `natureReviewQueue.test.mjs` now accept this optional validated report without interpreting a matched survey ID as a mesh placement pass. Matched IDs carry `WS01_G0_CONTROL_IS_NOT_PHYSICAL_CLEARANCE`; unmatched IDs carry `NO_EXACT_WS01_G0_CONTROL_AT_NATURE_ANCHOR`; the manager priority match carries `WS11_PRIORITY_IS_NOT_PHYSICAL_CLEARANCE`. Absence/staleness/forged measurements fail closed; all **19** reference nature targets remain held without scene, terrain, physics, shader or shared-module activation.

**Actual tests:** exact GitHub-file readback and isolated V8 execution of the eight new overlay tests plus all thirteen current hold-queue tests **21/21 PASS**; actual source JSON catalog evaluation separately produced 200+14, 17/17 manager joins and 2/19 WS01, 1/19 WS11 nature matches. These are **not** native `node --test` in a complete private repository, signed-in WebGL/actor collision raycasts, physical Y observations, GPU LOD, two-client tests, or green GitHub CI. Source catalog revision pinning is not approval. [Official WS08 task #963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963), draft [PR #952](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/952). G0 remains CLOSED and original Scene26 PNG still corrupt.
