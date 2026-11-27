# R140 — isolated equipment reward transaction fixture

Source: [R139 contract at reviewed documentation head](https://github.com/lordemblemblue-cloud/fallen-sky/blob/d426743f6efb254765eab3ede9007d263353eee4/docs/game3d/threads-of-our-pain/R139_EQUIPMENT_TRANSACTION_AUTHORITY_AND_REPLAY_CONTRACT.md). Branch based on main ba35f5ff2f9dd7276e3e9f4f4758d628c08a83d3. Synthetic E01 reference only, no runtime import, endpoint, permissions, real catalog, migration or assets.

## Reproduction and evidence

Run from repository root:
```sh
node --test tests/fixtures/r140/reward-transaction.test.mjs
```
Local Node v22.16.0: 16 tests, 16 pass, 0 fail, 0 skipped. Git blob a0fc9fc4a92d959b2acdce0fe37db6e12a26e1fb matches the locally executed file; code commit f90532b1bd2d12584ec4fb5ded43cc040ea4c7f5. GitHub CI and live application not run here.

## Implemented scope

Pure reference reducer uses synthetic trusted principal, evidence and catalog, canonical tuple entitlement, revision conflict handling, pending or committed receipt, stable item IDs, all-or-nothing delivery, bag then vault, isolated copies. In-memory harness simulates failed writes and lost replies. Projection checks identity and generation, checked write result, and deduplicates committed notifications when supplied the same session-scoped Set. Synthetic capacity and quantity are not final game policies.

R139 T01, T03–T10, T11, T14 and T16 have representative fixture tests, not production acceptance. T02 simultaneous datastore writes, T12 distinct legitimate occurrences, T13 real backup restore, T15 ending integration, T17 actual donor/debit transaction, T18 guest/conflict UI integration, T19 visual loading and T20 live isolation verification remain open. No real persistence, network, actual inventory projection, async generation fencing or authoritative evidence acquisition is exercised. The projection callback is a synchronous placeholder for snapshot reconciliation, not a working adapter. Session notification Set is ephemeral and must be shared by callers; no durable notification guarantee. Pending cycle-specific receipts across cycle transitions and trusted occurrence normalization must be resolved before integration. Fixture IDs are deterministic for test reproducibility, not production identifiers.

## Next R141 / E00–E02

Locate actual deployed discovery and guest authority, entity schemas and supported atomic operations. Expand fixture with explicit concurrent compare-and-swap adapter simulation, interrupted delivery recovery, cross-cycle pending receipt retrieval, revision and asynchronous identity fencing, and notification reconciliation. Then test against a disposable real datastore only after separate authorization. Do not infer production security from a passing in-memory test. No merge or deployment.
