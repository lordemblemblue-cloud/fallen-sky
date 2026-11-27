# R132 — P01 bounded implementation tickets and acceptance return
27 November 2026 | Documentation handoff only. Current production main re-confirmed [9da8d909a4332beb36ef6fc3a315379bf86591ae](https://github.com/lordemblemblue-cloud/fallen-sky/commit/9da8d909a4332beb36ef6fc3a315379bf86591ae); documentation PR #402 remains open. Read [R131](R131_P01_PREVIEW_BOUNDARY_AND_FIXTURE_CONTRACT.md), [R130](R130_P01_PINNED_MAIN_TECHNICAL_INTAKE.md), [R129](R129_SOURCE_TO_PRODUCTION_READINESS_MATRIX.md), [R113](R113_WOLFVEIL_OPENING_SOURCE_TO_ACCEPTANCE_WORKSHEET.md), [R87A](R87A_LOW_POLY_WOLFVEIL_M01_M03_CONSTRUCTION_PROMPTS.md), [R87B](R87B_CODE_FIRST_REGION_PREVIEW_AND_QUALITY_VARIANTS.md), [R112](R112_PRODUCTION_READINESS_AND_AGENT_ACCEPTANCE_GATES.md), root AGENTS. Claude owns terrain. No agent assignment, implementation approval, branch creation, paid generation, merge or deployment by this document.
## 1. Runner evidence and constraints
Pinned [package.json](https://github.com/lordemblemblue-cloud/fallen-sky/blob/9da8d909a4332beb36ef6fc3a315379bf86591ae/package.json) (9aff098a) declares dev=vite dev, build=vite build, preview=vite preview, lint=eslint . --quiet, lint:fix, migrate:game3d, verify:game3d-characters. These are actual declared scripts, not tested commands. No general test script or Playwright/Vitest dependency in manifest; targeted GitHub default-branch searches node:test, playwright, preview forest, vite.config.preview returned no results. Search incompleteness means no claim of absent runner or existing harness. Package-lock header read in R131, exact installed dependency versions/Node runtime unverified. [vite.config.js](https://github.com/lordemblemblue-cloud/fallen-sky/blob/9da8d909a4332beb36ef6fc3a315379bf86591ae/vite.config.js) (0400e50e) uses managed Base44/Cloudflare/TanStack Start/React plugins and prebundle; AGENTS (94e42381) says no root index.html; preserve plugin order, routeTree.gen.ts, managed error capture/middleware and guest-only entry. The normal npm dev and preview scripts start the app, not verified isolated forest entry. No shell/browser execution in this revision. No new local launch command claimed; proposed Option A from R131 must be verified on actual checkout. Do not run migrations or lint:fix as a preview prerequisite. No credentials or live account data required.
## 2. Scope and dependency ordering
First authorize T00, then T01. T04 layout preparation may proceed in parallel with T02–03 only if owner authorizes disjoint file ownership, same source and shared manifest; no terrain build until layout gate. T05 waits on approved T04 and T02–03; T06 requires T05; T07 requires actual results from all prior tickets. This is a proposal. P01.0 partial in prior audit, P01.1/2 not accepted. Separate renderer smoke can precede final layout acceptance but is not P01.2 completion. R113 step 07 explicitly N/A. Initial scope stops at isolated Low blockout/controller evidence. Actual M01–03 interactions/encounter and polished assets deferred to next gates; no old map/caves/dungeons, no real M04 transition or D/S objectives, no live reward or production region activation. No asset purchase, shared renderer edits, new dependency or public route without explicit separately approved scope.
## 3. Eight bounded implementation tickets (proposed)
### T00 — Authorization and source pin
Scope: P01.0 / R113:01.
Assignment: Before edits, record owner approval for isolated local-only preview and named implementation owner; pin fresh main, compare R130/R131 paths and current WebGPU work; inspect working tree, dependency installation, actual local runner and lockfile resolved versions. Read AGENTS and all referenced story docs. No feature branch created by this document.
Required return: Actual approval reference, commit, Node/npm versions, dependency paths, conflicting changes and disposition; no guessed command or asset entitlement.
Hold condition: Stop if no authorization, runner, ownership or dependency evidence.

### T01 — Choose isolated entry and verify exclusion
Scope: P01.0 / R113:01.
Assignment: Evaluate R131 A first: independent localhost-only Vite entry outside app routes with explicitly separate configuration if supported by actual installed tooling. Do not add an index.html to app root or modify managed Vite/SSR/route tree. Compare existing dev-only harness if found. Validate source graph before imports; no Base44 plugin/SDK, live auth, saves, cloud, analytics, economy, remote sockets or live GameView mount. No new dependency by default.
Required return: Actual launch command, entry files, host/origin, import graph, production build exclusion check and written allowed path list. Document denied network endpoints/categories and test methodology, not credentials.
Hold condition: Stop if app build contains preview, global live state imports, external requests or unresolved entry support.

### T02 — Minimal renderer smoke scene
Scope: P01.2 prerequisite / R113:03.
Assignment: Mount one canvas and one frame owner, camera, simple primitive floor and labeled synthetic actor. Inspect transitive imports of existing renderer factory/destroy helper before reuse; explicit local host preferences and no live failure-key writes. Show actual backend and ready/error state; fallback uses existing verified behavior only. If helper unsafe to reuse, return blocker, not a competing engine.
Required return: Runnable start/stop, renderer readiness and fallback evidence, actual adapter/renderer label, repeated mount/unmount and init-failure recovery; before/after storage/network snapshot.
Hold condition: Stop on black screen, duplicate loop, leaked canvas/listeners, unsupported backend or live write.

### T03 — Ephemeral state and resource ownership
Scope: P01.2 prerequisite / R113:03.
Assignment: Implement only after approval a test session with deterministic seed/clock, synthetic role, safe anchor, pose validator, encounter epoch and local diagnostics. Explicit reset, close, late-asset cancellation and idempotent disposal. No production checkpoint allowlist, no character selection, no real item/XP. Test teardown during pending renderer/asset init; primitive rig acceptable but labeled.
Required return: Actual schema/module paths, session/reset cases, invalid pose/ID and stale event rejection, resource lease counts, storage/network snapshots.
Hold condition: Stop if fixture persists to live saves, stale callback changes new session or owned/shared resources are misdisposed.

### T04 — Route graph and anchor registry
Scope: P01.1 / R113:02.
Assignment: Build layout manifest first from R113 11 anchor groups and R87A chainage: spawn/root/river/merchant/sky/fork/shared clearing. Use one local coordinate frame; both fork routes and return, dry route; reconcile M03_START and M03_ARENA_START and competing clearing dimensions by controller survey. Mark fixed surface, decorative-only geometry, safe shelves and protected actor holds. No cave (07 N/A).
Required return: Actual proposed transforms/headings, measured scale from blockout, route graph, floor IDs, clear widths/slopes and alias mapping, reviewer acceptance before geometry expansion.
Hold condition: Stop on disconnected route, duplicate clearing, unapproved dimensions/aliases or unsurveyed exit.

### T05 — Low terrain and physical route smoke
Scope: P01.1–2 / R113:04.
Assignment: One bounded region only. Low geometry: root bend, dry river shelf/split boulder, 6×8 m merchant turnout, upper/lower routes and one shared clearing; 3–4 m main/≥2.5 m secondary/≤20° ordinary slope candidates pending controller proof. Explicit floor IDs, solid obstacles and nonphysical decorative silhouette. No old map, procedural endless terrain, portals, caves, water crossing, required jump/glide or new NPC names.
Required return: Code-based geometry, collision-ready spawn, actual measured dimensions and screenshots from identical fixed inspection points; route loop in both directions with explicit controller status.
Hold condition: Stop on null ground, cliff slip, blocked return, false collision surface or footprint disagreement.

### T06 — Movement and collision compatibility adapter
Scope: P01.2 / R113:08 subset.
Assignment: Use inspected pure input semantics and approved existing controller interface, not full GameWorld3D loop with mastery/checkpoint/quest side effects. Validate frame-delta handling, camera 3.8–11 m config, stable foot query, null hit, reachable lower vs overhead floor, long frame, obstacle slide, turn and retreat. Keyboard/remap and mobile bridge only after dependency audit. Stand-in geometry camera or motion clearly labeled; no claim actual controller parity until exercised.
Required return: Actual reusable function signatures, import audit, controls and collision measurements, R131 cases 7–10 results, gaps if actual controller extraction requires separate approved changes.
Hold condition: Stop on unsupported controller binding, hidden floor, clipping or live input/global conflicts; no global tuning.

### T07 — Review package and next-scope gate
Scope: P01.2 / R113:03–04 review.
Assignment: Return exact launch and stop instructions, source and implementation commit, files and scope diff, evidence of production exclusion, actual tests with outcomes, known limitations, route/anchor manifest, local asset provenance, screenshots and measured baseline diagnostics. No art polish, source quest encounter, real rewards, Mid/High, integration or deploy in initial scope. Preserve accepted layout for later R113:05–06/08–12.
Required return: Owner reviews isolated Low blockout and evidence; only next bounded ticket after explicit acceptance. Re-run relevant checks against changed source, record rollback.
Hold condition: No advancement if tests unrun/fail or owner approval absent; render smoke ≠ playable combat or full P01 acceptance.
## 4. Acceptance matrix (ten review gates, unexecuted)
| Gate | Requirement | Ticket | Evidence required |
|---|---|---|---|
| G01 | Authorization and pin | T00 | Approval and exact main/implementation commit; ownership conflict report |
| G02 | Entry / production exclusion | T01 | Actual local command and proof preview entry absent from production routes/artifacts |
| G03 | No live services or storage | T01–03 | Network capture and storage diff, no sensitive payloads in logs; no live writes |
| G04 | Renderer lifecycle | T02–03 | Actual backend/ready status, failure/teardown/reopen evidence; one owned canvas/loop |
| G05 | Fixture integrity | T03 | Malformed/duplicate/stale event and pose tests; reset, no real reward |
| G06 | Anchor coverage | T04 | All 11 source groups, scoped alias mapping, measured proposed transforms and floor IDs |
| G07 | Route continuity | T05–06 | Both fork routes, dry bypass, retreat and return under supported input |
| G08 | Collision and camera | T06 | Null/stacked floor, obstacle, long frame, edge and camera clipping checks |
| G09 | Reproducible handoff | T07 | Commit, command, actual artifacts, test logs, measured baseline and rollback |
| G10 | Owner review | T07 | Explicit accept/reject with requested local changes; no implied release |
All gates currently NOT RUN / NOT APPROVED. These are review checkpoints, not ten additional tests added to R128's 402 planned cases. R113:T01–14 and R131 supplemental 01–16 remain authoritative case IDs. Initial scope covers relevant isolation/traversal subsets; R113 cue/combat/quality cases stay pending, not passed by mock state. No target FPS, device budget or numerical resource threshold without accepted measured baseline.
## 5. Copyable acceptance return template
Fill only with observed data; explicitly NOT RUN / UNKNOWN for unavailable. Provide actual links/paths, not proposed paths as existing files.
```text
Ticket / gate:
Status: BLOCKED | NOT RUN | FAIL | PASS WITH LIMITATIONS | PASS
Owner authorization reference / allowed scope:
Current main SHA / implementation SHA / source docs SHA:
Agent / reviewer / date:
Exact changed paths / excluded production paths:
Dependency versions / Node / npm:
Actual launch command / host / origin / stop command:
Actual renderer/backend / device / browser / resolution / settings:
Network allow/deny evidence / storage before-after diff (redacted):
Asset manifest / provenance / ownership and disposal:
Anchor manifest (source alias, local transform, floor, routes, clearance):
Test ID / command / steps / observed outcome / artifact link:
Repeated route and frame samples / p95-p99 / draws / triangles / memory if available:
Failure/rollback/re-entry evidence:
Remaining blocker / limitations / next permitted scope:
Explicit owner review and accepted commit:
```
Anchor return template: one entry per source alias group, canonical local logical ID, actual transform and bounds, floor/collision owner, approach/return, safe actor hold, source reference, cue quality parity, test and reviewer. Use T04 measured candidate data, not production coordinates. Asset return template: source/license, actual path, bounds/tier, material/mesh refs, collision/decoration, lease owner, dependencies and disposal. Keep mock data and actual runtime evidence visibly distinct.
## 6. Subsequent scope (not authorized by this handoff)
After T07 acceptance, proceed R113:05/06 surface/prop detailing and complete :08 actual controller/camera tests; then :09 local sensory cue and :10 genuine M01 warning/observation, M02 clue+wolf/readiness and M03 actual encounter adapters. Verify source receipts, retreat/retry/defeat and no real reward. R113:11 Low performance, :12 owner review and local fixes, :13–14 Mid/High derived from accepted Low, :15 separately authorized integration and :16 staging/release. R111 chronology/actor decisions and R65/R84 ending/postgame/NG+ remain blocked and out of P01. Main 20/20 + optional 105/105 documented; 311 stages and 402 planned cases unchanged.
## 7. Status and next
R132 contains eight proposed tickets, ten review gates, one return template and explicit runner evidence limits. No actual runner verified, no owner approval for implementation in this documentation task, no terrain, game code, test, live change, merge or deploy. Next action is owner review of bounded T00–T07 authorization, followed by actual isolated preview technical work only if authorized and executable environment available. If not authorized, R133 can prepare source-grounded Low blockout asset/anchor measurement worksheet for Claude without inventing coordinates or claiming a built preview.
