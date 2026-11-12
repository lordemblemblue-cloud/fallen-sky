# WS08 — Original-anchor physical measurement request vs WS01/WS11 G0 catalogs

**Status:** `SOURCE_ONLY_WS08_G0_SURVEY_CROSSWALK`; **0 actual physical measurements**; G0 geometry **CLOSED**.  
**Owner:** Wolfveil WS08 Scenes 21–30 Nature · [Task #963](https://github.com/marcusflow1-arch/atom-x-eve-os/issues/963) · [Draft PR #952](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/952).  
**Scope:** The two **original unmodified** high-risk nature features S21 `MOSS_BOULDER` and S24 `BLACK_PINE`, their **seven distinct physical review parts**, and four **hypothetical unapproved alternate sites** in [NATURE_ROUTE_ALTERNATIVES_REVIEW.md](NATURE_ROUTE_ALTERNATIVES_REVIEW.md).

## Exact read-only source catalog inputs

| Owner catalog | Git blob read | Records | Meaning |
| --- | --- | ---: | --- |
| WS01 `TERRAIN_SURVEY_CONTROL_POINTS_V1.json` | `7d6efa23e8f91ecf51ac9918f4742344708a3046` | 200 | Proposed original source-local X/Z controls, **not measured physical terrain** |
| WS11 `G0_RUNTIME_SURVEY_REQUESTS_V1.json` | `f1ccbe439337be95a1e40cab38f188d085a82b02` | 17 | Manager-prioritized physical survey *requests*, **not measured Y** |
| WS11 `G0_SURVEY_CATALOG_CROSSWALK_V1.json` | `b586e49547125cb4393a9ca7c95970bd43b0dfea` | 17 priority joins + 2 S21 issue notes | Static coordinate membership / owner routing, not approval |
| WS08 original Batch03 natural design targets | `9c6810e75d20f13c6d5534a51ed1a39de1e921f7` | 19 | Reference source proposals, not instantiated scene assets |

All joins require **exact unshifted source-local X/Z integer millimetres**. Source viewer Z+70m is not applied. Matching horizontal X/Z **does not merge raycast surface, bridge deck, cave interior, trunk/branch volume, collider/actor width, screenshot or server-layer evidence**. The combined manager crosswalk already emphasizes that these observations have different source ownership and evidence layers.

## Six WS08 study centers against the actual catalogs

| Location | Source-local X/Z mm | WS01 200 control ID match | WS11 17 priority request ID match | Existing WS11 issue acknowledgement | WS08 proposed physical review layers |
| --- | --- | --- | --- | --- | ---: |
| Original `S21-MOSS_BOULDER` | (−310000,+56000) | None | None | **`S21-MOSS_BOULDER`**, special issue record, not measured G0 request | 3 |
| S21 near, **UNAPPROVED** | (−307000,+59000) | None | None | None | 0 |
| S21 farther, **UNAPPROVED** | (−303000,+59000) | None | None | None | 0 |
| Original `S24-BLACK_PINE` | (−72000,+375000) | None | None | None | 4 |
| S24 near, **UNAPPROVED** | (−77000,+378000) | None | None | None | 0 |
| S24 farther, **UNAPPROVED** | (−79000,+380000) | None | None | None | 0 |

**Verified summary:** **0 of 6** site centers equals a WS01 original 200-point terrain control; **0 of 6** equals a WS11 original 17-site physical priority request. The original S21 boulder appears in WS11's special `scene21_new_issue` section; that is **recognition of a route risk, not an assigned G0 measurement request ID, completed raycast or geometry approval**. All **7** source-rock/pine physical part reviewer questions are **unmeasured**, and the four optional site studies are not eligible to inherit original-root physical measurements.

This comparison does **not** imply all six centers should be added to the manager catalog automatically. WS11/WS01/WS10 should prioritize the two *original* anchors if the original-reference designs remain candidates, and decide separately whether any alternate site is approved for fidelity. Duplicating all alternatives would waste real survey work before the visual choice. WS07's separate 301 proposed structure questions must also **not** be substituted for WS08 root/trunk/collider review.

## New code and rejection semantics

`naturePhysicalSurveyCrosswalk.mjs` receives three explicitly injected, pinned catalog datasets and `makeNaturePhysicalReviewerRequests()`. It rejects unexpected count or SHA, invalid/duplicate request IDs, missing original-anchor volume packets, false current G0 approval or premature physical evidence. For each location it reports exact IDs by catalog, the seven own-layer review IDs only at original anchors, and leaves:
`measuredRuntimeSurfaceYmm:null`, `measuredCollisionLayerYmm:null`, `observedTrunkRootOrStoneVolume:null`, `managerIssuedMeasurementRequestId:null`, `physicalGeometryApproved:false`. Overall `authorizedPhysicalMeasurements:0`, `canMergePhysicalMeasurements:false`, `geometryActivated:false`, `ws11ApprovalGiven:false`.

The pin to the currently observed SHA is a **source-audit revision guard**, not an approval signature; if WS01 or WS11 revises the source catalog, WS08 must re-evaluate rather than silently using stale joins.

## Evidence and explicit runtime blocker

- The actual three GitHub JSON catalogs and current nature target files were read and evaluated together. The exact-source code returned the six rows and zero ID matches above.
- **Eight focused `naturePhysicalSurveyCrosswalk.test.mjs` cases** executed successfully in an isolated V8 assertion harness against the fetched committed module bytes: **8/8 PASS**. Tests cover no measured Y, source issue-vs-priority distinction, actual reference physical layer counts (3+4), exact X/Z join behavior, optional-site noninheritance, stale catalog guards, duplicate identities and lack of mutation.
- Previous same-session focused alternative/physical-volume test suites **20/20 PASS** in the same isolated harness. These numbers are **not native full-repo `node --test` or a green build**.
- **No signed-in Game 3D physical samples have occurred**. Full private-repo `npm ci`/build, GitHub green CI, actual WebGL tree/rock mesh, terrain/collision contact Y, actor/mount/NPC two-way passage, wind/LOD collider consistency, WS12 screenshots/performance and two-client authority remain unverified.

**Required next handoff:** WS11/WS01 review two original-source WS08 asset center requests and seven distinct physical part measurements, without issuing duplicate site IDs or treating the S21 special issue acknowledgment as a measurement. WS10/WS12 must collect real post-G0 data with observed source/build SHAs, mesh/layer/collider IDs, X/Z/Y, actor/mount headroom/pass criteria and independent review commits. Until then no solid boulder, tree trunk, relocated nature object, shared adapter, new road or scene geometry is authorized.
