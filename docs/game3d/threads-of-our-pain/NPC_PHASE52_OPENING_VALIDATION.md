# Phase 52 — Opening campaign consolidation and review
27 November 2026. **Isolated fixture verification only. Not a production acceptance report.** Pinned tested head [6f615b66](https://github.com/lordemblemblue-cloud/fallen-sky/commit/6f615b66f0a5398116588095812e2457985f09ba) (Phase 51, PR #414). Current main story index R132. Read root AGENTS.md and current [R132 bounded gates](R132_P01_BOUNDED_IMPLEMENTATION_TICKETS_AND_ACCEPTANCE_RETURN.md). No terrain, app route, renderer, migration, economy, permissions or live save changes. No merge/deploy or paid generation. Claude owns terrain.

## Re-executed committed tests
Fetched the exact eight test files, imported pure module bodies and five JSON documents at the pinned head. Executed the test bodies in an isolated JS runtime with compatible synchronous test/assert/readFileSync bindings, in three batches due to connector call limits. No native Node runner or dependency checkout used. All 63 registered test callbacks passed, comprising 260 named scenarios (including 1 region/quest-adapter compatibility scenario not executed in Phase 46). These are scenario counts, not 260 independent Node test entries.

| Suite | Callbacks | Scenarios |
|---|---:|---:|
| NPC registry | 37 | 37 |
| Quest adapter | 1 | 32 |
| Opening region | 20 | 20 |
| M01 | 1 | 29 |
| M02 | 1 | 35 |
| M03 | 1 | 39 |
| M04/M05 | 1 | 37 |
| M06 | 1 | 31 |
| Total | 63 | 260 |

Six disabled main definitions contain 27 proposed required objective identifiers: M01=3, M02=5, M03=2, M04=7, M05=5, M06=5. Fixtures deliberately enable copies. S01–S08 runtime objectives are not supplied and no D/S quest is activated. M01–M06 path including skip, no optional help or oath, prior history, scope and serialization validated in fixture; actual gameplay, real migration and inventory preservation not tested.

## Branch dependency review (observed at review time)
| PR | State | Target |
|---|---|---|
| #404 | closed, merged | main |
| #405 | closed, merged | Phase 42 docs branch |
| #406 | closed, merged | Phase 44 branch |
| #407 | open draft, mergeable | Phase 45 branch |
| #408 | open draft, mergeable | Phase 46 branch |
| #410 | open draft, mergeable | Phase 47 branch |
| #412 | open draft, mergeable | Phase 48 branch |
| #413 | open draft, mergeable | Phase 49 branch |
| #414 | open draft, mergeable | Phase 50 branch |

The registry was retrieved on main; the adapter was not retrieved there. Merges into intermediate branches do not establish inclusion on main. Do not automatically merge a chain of stacked PRs. Review actual ancestry, diff against fresh main, source revisions, conflicts, CI and approvals. Prepare one coherent integration candidate or approved rebased increments; preserve all independent WebGPU/story/Duelist changes. No claim main contains the tested code.

## Additional boundary probes
At pinned head, two deliberately adversarial fixture probes demonstrated that the raw quest adapter accepts out-of-order M01 objectives and can complete M01 without scene bridge, and that M03 model accepts one host-reported damage event from full HP to zero. This is consistent with their explicit local assertion interfaces, but blocks treating them as authoritative runtime validation. The raw M01 bridge read rejected null, empty and null-snapshot bundles in three malformed-input probes. Passing tests do not close these authority gaps.

| Blocker | Required resolution |
|---|---|
| Event authority | One reviewed host dispatch path; no UI/client direct completion or reward grant. Validate actual cue, actor, position, scene and combat evidence; use correct bridge rather than unrestricted reducer. |
| Damage/AI | Bind actual combat engine, validate hits, role and enemy state, test phase teaching and cancellation; no arbitrary HP reports. |
| Persistent saves | Versioned atomic commit/single writer or actual compare-and-swap; validate both revisions; interruption/recovery and cross-character tests. No auto legacy migration. Bounded journals need safe compaction/attempt separation without restricting retry. |
| Independent lives | Actual age-specific inventory/XP/loadout and NPC identities, safe transition, M05 authored death distinct from ordinary defeat. Do not wipe or duplicate items. |
| Terrain/host | R132 T00–T07 approval and evidence, physical layout/anchors, actual controller and collision, WebGPU/fallback; no actual playable preview acceptance yet. |
| Security | Inspect real backend endpoints, permissions, guest storage and receipts; Base44 scan and concurrency tests. No auth bypass, no privileged access or client-authoritative economy. |
| Presentation | Actual animations, controls, subtitles, audio, dialogue fallback and service availability. Optional Oath Tree never blocks access. |
| Source drift | Reconcile Phase 42–51 overlay with R132+ current main; maintain disabled definitions and review proposed alias mappings. |

## Native runner and next steps
Added `scripts/test-fallen-sky-opening.mjs` to invoke only these eight existing Node tests with built-in Node runner, no npm dependencies or shell, on a checkout containing all stacked files. Command: `node scripts/test-fallen-sky-opening.mjs`. This new runner and native Node suite have not been executed in a full checkout; no claim of native success. Do not run migrations or use lint:fix. Run native suite then repository-declared lint/build in a clean candidate checkout; report actual exit codes and failures. R132 gates continue to govern actual P01 preview, owner review and future activation. Next: resolve the host/persistence authority boundaries, and source-only M07–M13 intake in a separate nonactivating package. No scope expansion to live M07–M13 or actual gameplay without approval and evidence.
