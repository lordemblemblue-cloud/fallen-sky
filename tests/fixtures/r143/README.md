# R143 — multi-character restore reconciliation fixture

Based on main ab03f50a184f9c981f08f579d4f1fc22dbb006be after PR #420 merged. R139 E02 continuation; no production imports, endpoint, schema migration, credentials, or real player data.

Run from repository root:
```sh
node --test tests/fixtures/r143/restore.test.mjs
```
Observed local Node v22.16.0: 10 tests, 10 pass, 0 fail, 0 skipped. SQLite experimental API warning. Exact local Git blob 8d230b3bae917bc606d718700c29f84978d927b8 matched retrieved GitHub content; code commit 8942bfb1f93af1c4a972c53d7eeb9325443fdf59. Historical R140–R142 results 33 passes; not rerun in this pass. Total 43 recorded passes across four suites.

## Scope

Disposable SQLite WAL database, three synthetic identities (two characters sharing an owner, same character label under another owner), composite scope keys and unique active journal per scope. Start captures a backup and original state, stage 0 restores inventory/revision, stage 1 restores the synthetic upgrade/donor state, stage 2 queues absent post-backup discoveries. Each stage and cursor persist together in one SQLite transaction. While the journal is pending the fixture's public read and delivery entry points refuse partial state. Reopen resumes from persisted stage. Duplicate restore requests reuse the same scoped backup/revision key; completion replay cannot reapply state; delivery uses stable item identity. Tests exercise failure injection at all three stages, reopen after stage 0, scoped read/resume, independent identities, stale revision, pending dedup and completion replay.

## Production boundary and limitations

The historical characterVault restore implementation (R142 evidence; inspected prior main ba35f5ff2) intentionally restores donor/upgrade state and separately updates discovery ledgers. Current pinned main base44/shared/explorationDiscoveries.ts blob 1918d8a2, pendingAfterRestore, queues post-backup grant units absent from restored loot data. The fixture illustrates these semantics with simplified item labels and timestamps, not a replacement. No actual authentication, guest authority, live catalog, capacity/overflow handling, equipment save schema, production database CAS, rollback of full restore, or actual simultaneous restore workers tested here. Pending gate only covers fixture entry points; raw internal reads/writes bypass it. Begin-lock exceptions and transaction failure policy need robust adapters. Reopen test uses a second connection; R142 alone tested SIGKILL. Do not infer real production atomicity from SQLite. Preserve approved intentional restoration semantics, not blanket lifetime non-restoration for existing material discoveries. Missing deployed explorationDiscovery handler/schema and Base44 atomicity evidence remain blockers. No live code or deployment.

Next R144: isolate multi-item Blacksmith debit/consumption and revision protection, exercise failure/restore interlocks and real catalog integration boundaries before production proposals. No merge authorization.
