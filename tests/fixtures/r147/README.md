# R147 — actual inventory ledger and gear-tier compatibility

Base main 9034ba14500676930f05b9c9bdccb1f149439698, after PR #425 merged. The five dependency blobs match the inspected main 0b6ca52d43732dc8f729939efcb0126f08927d85 and the previous test branch. No live data or production rules modified.

## Execution status

14/14 compatibility checks passed in a JavaScript V8 harness using the five retrieved source modules, with TypeScript annotations removed via targeted text substitutions, imports/exports rewired in memory, and a small synchronous assertion adapter. This is useful source-logic evidence, NOT an exact Node module execution, TypeScript compiler validation or CI run. Container DNS prevented raw GitHub retrieval; no full local checkout available. The Node test file was committed for reproduction, but the standard runner has NOT been executed this revision. Prior R140–R146: 83 recorded Node passes, not rerun.

Run in an actual checkout on Node 22.16.0:

```sh
node --experimental-strip-types --test tests/fixtures/r147/*.test.mjs
```

One additional TODO regression asserts the desired repeat-correction behavior and is expected to fail until corrected; it is not counted as a pass. Do not mark the TODO resolved without a real runner and end-to-end save-path evidence.

Source blobs:
- axeItemEnhancement.ts 6b02e51f9dab2e012832ebf6ebee70fe5f7533b1
- axeItemAdvancement.ts 62766d9e415b81c6466cbf3a7a8e668c389f2139
- axeServiceEconomy.ts 6e450287618031f40941bd4898831e7939a18f82
- axeGearTiers.ts 6a0879d89b7100c4a6a4b0f02c60be35c103c240
- itemUpgradeLedger.ts a5a80f7818a307f1606a506246a4aad555fe3c2d

The retrieved repository test blob 2632afb3a2e1edb6147200904e4aefd760fb44db matches the authored test file (14 cases); code commit 36a01768a8dd7b11c7fa881e9492001ea27cc73f.

## Source findings

Actual ledger selects legacy duplicate drop IDs as a multiset, corrects stale or edited upgrade records, removes destroyed/consumed gear, clears a consumed active weapon reference, and reconciles restored donors/materials. Actual tier configuration defines 540 unique templates and 192 unique look keys, all templates map to a defined placeholder look; this does not establish actual model availability. Default config enabled=false; runtime flag state not inspected. Tier rules share art within bands, switch tier-system look at a boundary, preserve legacy item identity/art and advancement, enforce hero level when supplied, use configured Upgrade Stones, and preserve instance identity during ledger tier correction. These are current source settings, not changes or owner-approved balance revisions.

## Open regression: material replay

Two legacy units with the same dropId, one spent receipt, and two successive calls to enforceUpgradeLedger on the already-corrected result: material count 2 -> 1 -> 0. Desired idempotent correction is 2 -> 1 -> 1 for a single applied debit. This is a source-level observation using the custom harness, not proof of live player loss. The current API accepts a previous save but the spent-unit removal step does not consult it. An ambiguous legacy ID cannot by itself distinguish a spent unit from an identical unspent one. Do not simply deduplicate all drops or skip all duplicate IDs: that could lose legitimate inventory or permit replay. Investigate actual vault upload/restore flow and client consumption identity, stable per-unit IDs and durable applied-receipt markers, plus migration/reconciliation policy for ambiguous historical saves. Preserve intended restore semantics and existing protected paths. Also inspect the server tier-up behavior when the hero level is unavailable (preview only checks a non-null level). No exploit or fix asserted.

## Next R148

Prioritize reproducing the duplicate-material replay in the real Node runner and through the actual save/ledger path; define and test the narrowest safe correction, with legacy multiset preservation, restore and retry cases. Stop before live schema migration or deployment. Base44 production atomicity and discovery deployment evidence still unresolved. No changes to loot balance, graphics, quests, guest entry or auth.
