# R148 — material receipt replay and legacy migration safety

Continues R147 on PR #434, based on main 9034ba14500676930f05b9c9bdccb1f149439698.

Run `node --test tests/fixtures/r148/material-receipts.test.mjs`. Actual local Node v22.16.0: 12 tests, 12 pass, 0 fail, 0 skipped, 108.046514 ms. Exact executed blob d46b89e188c9749ef8d025bad521c35e5a81e92f matched repository; code commit aeb02ff193a33c0543582fc9fcb258769cdd0b4b. Historical R140–R146 83 Node passes; R148 adds 12 = 95 recorded Node passes. R147 separately recorded 14 transformed-source V8 checks, not standard Node runs. R147 TODO remains unresolved; no full checkout/CI or real server test executed.

## Source trace

- base44/functions/characterVault/entry.ts (ee286110), put lines 129–158: validates save, reads historical ledger, applies corrections before fingerprint and revision checks; restore lines 217–234 intentionally restores inventory and separately reconciles spent/consumed ledger. Repeated uploads may encounter identical legacy IDs; scope and live frequency unknown.
- base44/shared/itemUpgradeLedger.ts (a5a80f78), lines 155–225: counts historical spent drop IDs, removes matching occurrences on each invocation without an applied receipt marker. pickCostUnits also excludes historical counts from the accepted save; potentially hides a remaining legitimate duplicate after prior reconciliation.
- base44/functions/itemUpgrade/entry.ts (5ec123f8): selects costs using saved units minus historical spent counts, stores appended spent IDs in per-item/service row, last transaction result only. No proven atomicity.
- src/components/game3d/lootStore.jsx (4e63da94), lines 238–258: consumeLootUnits removes exact dropId occurrences then may substitute same-type units for a missing unit; returns ok. This is deliberate existing behavior, not proof of duplicate client deduction. Callers were not located by code search; audit before modifying.
- base44/shared/characterSaveRules.ts (4930c9fd), lines 132–138: flags unusually rapid material gains, not authoritative per-unit acquisition.
- base44/entities/game3-d-item-upgrade.jsonc (a9ee3210): spent string array of drop IDs.
- src/components/game3d/character/characterVault.js (ced0888b): flush before roll; existing local-only compatibility fallback. Preserve current guest policy.

## Candidate reference, not production fix

Stable per-occurrence canonical IDs assigned once on a trusted snapshot with unique persisted namespace, preserving old dropId aliases. Historical overlap cannot be reliably allocated from ambiguous ID alone, even if only one unit is still present: return review_required without changing count; no automatic grant or deletion. A scoped server-issued receipt identifies exact units. Matching replay returns prior receipt before revision check; changed intent, missing unit, stale revision or wrong scope/epoch refused. All selected units removed in one proposed atomic state transition; no substitution. Client projection uses trusted current server snapshot instead of replaying debit; rejects stale scope/epoch/revision. Test-only deterministic IDs, no real authorization, persistent storage, provider transactions, actual cost selection, roll, restore, migration, upload or caller integration. Snapshot projection assumes trusted server object and does not validate same-revision conflicting payload; migration is one-shot and must not be called again on already migrated state. These are blockers before any live integration, not a change to actual cost or inventory behavior.

## Next R149

Implement persistent exact-unit identity and receipt application in disposable storage fixture, including one-shot migration retry, same-revision divergent snapshot rejection, full restore policy, competing debits, and explicit material acquisition/consumption ownership. Locate consumeLootUnits caller and trace actual save upload with R147 regression in standard Node runner; never bypass historical spent checks simply to preserve inventory. Base44 atomicity, discovery handler/schema, guest policy and legacy save recovery remain gates. No live data/schema, production source, merge or deployment authorization.
