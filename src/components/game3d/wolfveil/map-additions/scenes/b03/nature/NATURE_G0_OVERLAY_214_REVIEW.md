# Wolfveil Workstream 08 — Proposed 214-control survey overlay / Nature Hold Audit

**Audit status:** `WS08_PROVISIONAL_214_SOURCE_JOIN_NO_RUNTIME_EVIDENCE` · **G0 CLOSED** · no geometry or physical collider authorized.  
**Owner:** Workstream 08 (natural objects in scenes 21–30).  
**Tracker / draft:** [WS08 #963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963) · [PR #952](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/952).

## Why a new audit was necessary

The older WS08 [NATURE_PHYSICAL_SURVEY_CROSSWALK.md](NATURE_PHYSICAL_SURVEY_CROSSWALK.md) correctly describes the original **200** WS01 general control points and original **17** WS11 priority requests, but is a **V1 historical snapshot**, limited to the six S21 boulder / S24 pine original and alternative centers. Do **not** silently read its 200-point total or its zero-of-six match as the complete current WS01/11 catalog.

WS01 [draft PR #948](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/948) now includes `G0_PRIORITY_17_SURVEY_RECONCILIATION_V1.json`: 14 **proposed** control additions (`WV-CTRL-0201…0214`), 11 of which bring previously missing WS11 priority anchor coordinates into the WS01 draft catalog and three of which are extra torii/bridge line stations. WS11 [draft PR #940](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/940) independently reconciled all **17/17** manager priority anchor IDs against the proposed **214** total in `G0_SURVEY_CATALOG_RECONCILIATION_V2.json`. **No actual terrain/collider Y, screenshot, player or mount traversal, two-client network QA or G0 physical authorization was published.**

## Exact source revisions read and evaluated

| Injected source catalog | Git blob SHA | Records |
| --- | --- | ---: |
| WS01 original terrain controls | `7d6efa23e8f91ecf51ac9918f4742344708a3046` | 200 |
| WS01 proposed 17-priority overlay | `5a352c7ad754ee3d54de4783eb946133858f5d5e` | 14 additions |
| WS11 original priority request list | `f1ccbe439337be95a1e40cab38f188d085a82b02` | 17 |
| WS11 proposal overlay reconciliation V2 | `e9e21dcc2f344b9fadfe94ec4ea2703e832c523e` | 17 exact owner-ID joins |
| WS08 Batch03 nature candidate references | `9c6810e75d20f13c6d5534a51ed1a39de1e921f7` | 19 |

Every entry is compared in **unshifted source-local X/Z integer millimetres**. WS08 applies no extra viewer +70m translation; physical layer Y from bridge decks, caves, trees, roots and actual loaded mesh colliders is not inferred.

## New full 19-reference nature audit

The new pure `natureG0OverlayAudit.mjs` audits all **19** WS08 original source centers against the **214** proposed WS01 control X/Z positions, while independently validating the entire manager **17/17** WS11 priority map.

| Nature reference | Original source X/Z (m) | Proposed WS01 control | Manager priority request | Physical implication |
| --- | --- | --- | --- | --- |
| Scene28 `S28-ROOT_ARCH` | (−324,+140) | **`WV-CTRL-0133`** — original 200 | None | Same horizontal source point, **NOT verified underground cave-roof/floor Y or root collision** |
| Scene30 `S30-LANTERN_GROVE` | (−88,+337) | **`WV-CTRL-0214`** — proposed additional 14 | **`G0-S30-LANTERN-GROVE`** | Proposed source survey ID only; **WS07 built lanterns / bathhouse, WS10 player/service access and WS12 headroom still pending** |
| Scene21 `S21-MOSS_BOULDER` | (−310,+56) | **No exact control ID** | None | Road-centerline solid rock conflict remains **HOLD**; manager's V1 `scene21_new_issue` risk acknowledgement is not a measured survey |
| Scene24 `S24-BLACK_PINE` | (−72,+375) | **No exact control ID** | None | Visual tree envelope vs source `ridge_path` remains separate from **actual solid trunk/root and overhead canopy** QA |

**Summary:** `19` source natural candidates, `2` exact WS01 proposed-or-base control matches, `1` exact WS11 manager priority match, **zero accepted runtime physical measurements**. The other **17** WS08 source anchors are not automatically invalid or missing from the scene: the proposed survey catalog is a *sparse control list*, not an exhaustive asset registry. WS01/WS11/WS10 decide which positions need further measurements rather than adding all 17 automatically.

## Ownership and fail-closed implementation

New `natureG0OverlayAudit.mjs` and `natureG0OverlayAudit.test.mjs`:
- Refuse stale catalogue/blob identifiers, missing or duplicate source-local XZ/IDs, malformed inputs, wrong 200+14/17 counts, changed manager 17-way source join, forged measured Y and premature G0 approval.
- Keep the S28 original base match distinct from any cave interior / collision surface and S30 proposed `WV-CTRL-0214` distinct from WS07 lantern structure approval.
- Emit `sourceEvidence:'PROPOSED_SOURCE_LOCAL_XZ_ONLY'`, `measuredMeshSurfaceYmm:null`, `measuredColliderYmm:null`, `geometryActivationAuthorized:false` and `authorizedPhysicalMeasurements:0`.

Immediately afterward, the existing WS08-owned `natureReviewQueue.mjs` and `natureReviewQueue.test.mjs` were extended to optionally accept this **source-only** catalog report:
- Known root-arch/grove control IDs remain labelled **`WS01_G0_CONTROL_IS_NOT_PHYSICAL_CLEARANCE`**; the grove's WS11 priority is separately **`WS11_PRIORITY_IS_NOT_PHYSICAL_CLEARANCE`**.
- Unmatched boulder/pine rows remain **`NO_EXACT_WS01_G0_CONTROL_AT_NATURE_ANCHOR`** and `WS01_WS11_G0_PHYSICAL_APPROVAL_MISSING`.
- A missing audit fails to silently imply success: `WS01_G0_OVERLAY_JOIN_NOT_PROVIDED`. Forged source X/Z, fake measured Y, activated evidence or incomplete counts cause hard errors.
- All 19 rows remain `AWAITING_OWNER_AND_RUNTIME_QA`. Existing source crossings, cave floors, S24 grass/steps and S30 bathhouse safety holds are unchanged. **Neither the old V1 crosswalk nor any manager/source owner file was modified.**

## Tests and evidence class

1. The **actual connected GitHub** original WS01 control JSON, current WS01 overlay JSON, WS11 priority JSON, WS11 V2 machine reconciliation, WS08 target module and new WS08 audit code were fetched and executed together. Counts verified: **200+14=214**, **17/17** priority ID source equality, **2** WS08 control matches, **1** nature priority match, zero accepted physical Y.
2. New `natureG0OverlayAudit.test.mjs` has **8** focused test cases using synthetic but schema-equivalent 200+14/17 fixture and fail-closed checks. Updated `natureReviewQueue.test.mjs` contains **13** focused cases (previous 9 plus 4 new), exercising old source/road and new overlay hold semantics. Executed all **21/21 exact committed GitHub test functions PASS** in an isolated synchronous V8 JavaScript assertion harness after source readback.
3. **NOT EXECUTED**: native `node --test` in the complete private repository, `npm ci`/full Vite build, signed-in browser/WebGL/GLB, real surface Y raycasts, 3D root/trunk/rock and mount-clearance collisions, actual frame rates/GPU LOD, WS12 screenshots and two-client authority. GitHub Actions remain unverified/failing on previous branch runs; do not equate a source JS pass or a published control-point grid with runtime readiness.

**Next owner actions:** WS11 should register Scene28's original cave-root source control as a distinct *underground geometry-layer* request only if needed, preserve existing S30 planned grove priority ID while keeping canopy/lantern/bathhouse owners separate, and decide whether Scene21's solid rock and Scene24's original pine require additional actual control and measured collider stations. WS01 controls final terrain topology and approved G0 SHA; WS10/12 independently perform authorized runtime measurements after G0. No new survey point IDs or alternate asset placements were issued by WS08.

**STOP:** No terrain, foliage instances, cave/rock collision meshes, shared source-code, water, built structures, physical routes or gameplay modules may be activated or merged merely because these source-control IDs join. PR #952 stays **DRAFT** until the master runtime and independent-QA gates pass.
