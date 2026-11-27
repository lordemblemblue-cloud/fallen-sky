# R141 — disposable SQLite reward storage evidence

Extends R140 and R139 E02 on the same isolated test branch. No game imports, real character data, network, production endpoint, migration, or permissions changes.

Run from repository root:
```sh
node --test tests/fixtures/r141/reward-storage.test.mjs
```
Observed local Node v22.16.0: 11 tests, 11 pass, 0 fail, 0 skipped. node:sqlite emitted its experimental API warning. Actual local Git blob 7de7e23d5e6f8670e6e6bb2a9d2094e18d7b813a matched the retrieved GitHub file; code commit a0926ee82945558334d32f5987e3061d6d073ac9. R140 previously passed 16 cases; not rerun in R141.

Real disposable SQLite file, WAL, two independent worker connections with BEGIN IMMEDIATE and revision-guarded UPDATE. One successful claim and one identical already-claimed receipt. Injected exception before COMMIT rolls back both item and receipt; injected lost response after COMMIT is recovered through another connection. Pending prior-cycle receipt can be resumed by exact recorded key, distinct from a newly earned cycle reward. Consumed item stays removed. Async projection tests reject wrong scope and generation, while injected synchronous scoped commit rejects older revisions. Notifications are session-only. Synthetic single character, catalog reward and trusted evidence; no actual auth, live guest authority or production item IDs. No multi-character DB implementation, real process-crash test, backup restore, service debit, full multi-device network integration, production build or CI validation. BEGIN contention timeout outside try is a remaining robustness gap; projection relies on synchronous injected commit, no live implementation. SQLite semantics cannot establish Base44 transaction guarantees.

E00 source recheck at ba35f5ff2f9dd7276e3e9f4f4758d628c08a83d3: base44/functions/characterVault/entry.ts lines 45–57, 158–197 use auth.me, scoped service entities, expectedRevision and update. No atomic conditional update guarantee established. src/components/game3d/character/characterVault.js lines 99–111 confirms explorationDiscovery claim invocation and local-only handling; actual handler path still not located. No live authorization or fallback change. Next R142: locate handler and entity definitions, test bounded lock contention and crash/reopen, audit real vault semantics and prepare scoped adapter only after provider guarantees established. No merge/deploy.
