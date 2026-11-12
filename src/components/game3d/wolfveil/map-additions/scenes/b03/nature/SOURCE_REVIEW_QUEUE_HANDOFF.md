# Workstream 08 — Unified source-only nature approval queue

**Status:** `SOURCE_ONLY_HOLD_QUEUE`; **geometryAuthorized: false**. This is a cross-owner handoff report, **not** a decision to place meshes, enable collision or merge.  
**Workstream:** 08, exclusive directory `src/components/game3d/wolfveil/map-additions/scenes/b03/nature/**`.  
**Task:** [#963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963) · **Draft PR:** [#952](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/952).  
**G0:** WS01 #948 remains DRAFT and WS11 has NOT approved live geometry integration. Source-preview approval and reference metadata are not acceptance of physical terrain/colliders.

## Why this queue exists

One feature can satisfy a provisional horizontal clearance but still have dangerous or unverified **ground contact**, a missing original reference image, an unbuilt **cave floor**, or another owner’s architectural footprint. Treating one successful review as a complete clearance would be incorrect. `natureReviewQueue.mjs` joins three independent reports by stable nature ID and **fails closed** on missing/stale/activated inputs:

- Original source `wolfveilHeight` via WS08 nine-point analytical ground survey (171 evaluations).
- Existing live-code *source definitions* for all ten routes, 30 buildings, 24 reserved plots and 17-point river, via WS08 `sourceClearanceAudit.mjs`. These are not live physics.
- WS07's complete, still-DRAFT 29-object architectural proposal, via `architectureSeamAudit.mjs`. WS08 never imports or mutates WS07 files; the WS07 proposals are explicitly provided by caller.

The queue never converts a zero-overlap candidate into an `approved` item; **all 19 remain `AWAITING_OWNER_AND_RUNTIME_QA`**, with `active:false`, `meshPlaced:false`, `collisionAuthorized:false` and global `geometryAuthorized:false`. Same X/Z original anchors and integer-mm frames are retained. No +70m viewer shift or terrain sculpting is performed.

## Cross-owner planning matrix, actual source evaluated

| Review category | Affected nature targets | Required action |
| --- | ---: | --- |
| Source analytical span greater than 2m across 9 survey points | **16** | WS01/WS08/WS10 actual mesh ground-contact sampling, choose roots/patch support; 2m is only a review threshold |
| Original source route proximity at width/2 + proposed 2m | **6** | WS01/WS10 walkable player/mount clearance and forest/rock collision; no path edits |
| Existing river corridor review | **2** | WS02/WS10 shoreline and water behavior; WS08 decor only |
| Exact WS07 proposed object envelope overlap | **1** | S24 grass versus trail steps (29.7m²), decide planting exclusion with WS07/10 |
| Additional WS07 2m provisional buffer contacts | **4** | S26 bank/lookout, S27 stalagmites/floor, S30 vents/bathhouse, S30 grove/bathhouse |
| Original Scene26 PNG corrupt / visually unverified | **3** | WS01/WS11 obtain and decode replacement actual image; no reconstructed substitute |
| Cave interior not proven by exterior source-height model | **3** | WS07 cave shell/floor, WS10 two-way portal + actual interior raycasts |
| Pending external ownership split | **1** | WS07 retains built lanterns and bathhouse, WS08 only natural maple canopy |
| WS01/WS11 G0 physical approval missing | **19** | **Do not place, activate, merge or deploy any asset** |

Categories overlap and **must not** be added together as if they are distinct objects. The source audit found **zero** positive-area intersections with *existing* buildings or protected reserved player-housing plots; the WS07 draft S30 bathhouse proposal nonetheless has a separate provisional buffer review. A 2D empty footprint does not prove full volumetric branch, ledge, water or player clearance.

## Reference-specific next approvals

**Scene21 western cedar forest:** cedar and moss boulder lie near `west_woodland_fork`’s draft planning corridor. Fern patch spans **7.804m** analytically and must ground individual clumps rather than one flat card.  
**Scene22 wolfstone:** granite/pine groups require per-object ground and boss-route review.  
**Scene23 bamboo valley:** source bamboo patch spans **6.212m**, fallen lichen log **5.133m**, preventing automatic flat-root placement. No creek should be invented.  
**Scene24 alpine meadow:** WS07 steps overlap the proposed 14.5×10.5m wild grass envelope by **29.7m²**. Preserve the existing `ridge_path`; grass cutout options remain unmounted and require WS07/10 clearance.  
**Scene26 eastern riverbank:** reeds and pebbles contact the source river corridor. `S26-JAPANESE_MAPLE` has the largest terrain-model span (**14.457m**) despite no same-object river centerline flag: this is a separate slope and shoreline QA dependency. The missing original PNG blocks final image fidelity.  
**Scenes27–28 caves:** stalagmites, root arch, and ore seam require actual underground geometry; their exterior ground sample is **not a cave-floor Y datum**.  
**Scene29 twin peaks:** wind-pruned pine group needs actual ridge terrain and wind/LOD checks; WS01 owns large `CLIFF_STACK` topology and WS08 does not add it here.  
**Scene30 hot springs:** geothermal rock is WS08 nature, steam visual effect belongs WS09, pool belongs WS02, built bathhouse and lanterns belong WS07. Grove source footprint begins **1.85m** horizontally outside existing bathhouse east edge, below *proposed* 2m review margin; 3D canopy clearance is unverified.

## Sources and verification class

At the time of this report, the actual connected GitHub source blobs used together were:

| Source | Git blob |
| --- | --- |
| Main `WolfveilLayout.js` | `b4b10dd15737d62c62a476e500adb433a6d015b6` |
| WS08 `referenceTargets.mjs` | `9c6810e75d20f13c6d5534a51ed1a39de1e921f7` |
| WS08 `architectureSeamAudit.mjs` | `02090ae283388541dd55d14226bda8c7c2ff6eaf` |
| WS08 `sourceClearanceAudit.mjs` | `eb6734b9aca24c591b83d0d858a7a604af80c5c0` |
| WS08 `natureAnalyticalGroundSurvey.mjs` | `c9f823039e3ab7dc7734b72738da85de6c3da2d9` |
| WS08 `natureReviewQueue.mjs` | `845588250e6a70f53796b83a346ddd1bdffc00d4` |
| WS07 `reference-proposals.mjs` | `75be035dba46f7603fff5e13cc2d1f669a9fcb99` |

**Executed in current session:** all connected sources evaluated in one isolated JS process using the actual code from those blobs. Verified the complete 19-target matrix and all category counts above. Separately, the exact two **new** module/test pairs were re-created byte-for-byte in the local staging mirror and their `git hash-object` values matched committed GitHub blob hashes. Node v22.16.0 ran **12/12 focused tests PASSED** (6 analytical-ground + 6 queue); running the full **seven-module local staging suite** yielded **45/45 PASSED**. One queue fixture test initially attempted to mutate a frozen survey result and failed; corrected the test to make an immutable replacement and reran, **all passed**. This is an isolated mirror with the same source reference rows, not the full private repo checkout.

**NOT RUN / NOT ACCEPTED:** the 3 newly written direct-`WolfveilLayout.js` native test cases (`natureAnalyticalGroundSource.test.mjs`), new full-main-layout native tests, full private repository `npm ci`/build/lint/typecheck, latest GH Actions green, signed-in rendered screenshots, terrain mesh raycasts, water shader, gameplay/mount/AI/quest, cave portals, GPU/LOD and two-client collision. Source model values and schema tests must not be used as runtime proof.

**Next permissible work:** re-read WS11 G0 release decision and WS07/WS02/WS10 review responses; construct independent reference-backed nature asset source packages only after exact owner geometry authorization. WS08 never edits WS11 manager ledger or shared runtime entrypoint.
