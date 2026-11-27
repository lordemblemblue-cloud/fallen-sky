# R142 — lock contention, process crash and metadata restore

R139 E02 continuation; synthetic disposable SQLite only. Node v22.16.0, Linux, node:sqlite (experimental API warning). Run from repo root:
```sh
node --test tests/fixtures/r142/recovery.test.mjs
```
Observed 6 tests, 6 pass, 0 fail, 0 skipped. Committed test blob 062503d6e628eb5308f9996812da7e1bef30aacf matches the exact locally tested file; code commit a0f261b742e23ffe120f13ce96538c73301f136d. R140/R141 historical 16+11 passes, not rerun here. Total historical passes 33 across three distinct suites. No CI or production app run.

SQLite WAL, synchronous FULL, bounded 50ms busy timeout, begin inside guarded block, uniqueness on owner/reward and owner/item, receipt/item/revision atomic commit. Tests: held write lock returns busy with no mutation then retry; actual child process SIGKILL immediately before and after COMMIT and separate reopen; old metadata backup cannot resurrect removed item; invalid owner/stale revision refused; inventory/ledger fields ignored in metadata restore. SIGKILL tests process crash, not power loss. Metadata restore deliberately restores label only, not production character backup. Synthetic single character and one reward, no actual authentication, no actual server-side completion proof, no production database, no migration. Other SQLite extended lock error codes, rollback failure, crash while restoring full inventory, and multi-character/NG+ authoritative replay remain open; test fixture is not a complete general-purpose adapter.

## E00 source findings — pinned main ba35f5ff2f9dd7276e3e9f4f4758d628c08a83d3

Directory listings base44/functions and base44/entities inspected. explorationDiscovery function and Game3DDiscoveryClaim entity schema not present in those listings; exact path guesses and default branch code search failed. Client invokes explorationDiscovery in src/components/game3d/character/characterVault.js, and characterVault restore refers to Game3DDiscoveryClaim. This is a repo-source discrepancy, not proof the deployed service is absent; obtain deployed manifest/schema via supported access before integrating.

| Source | Finding |
|---|---|
| base44/entities/game3-d-character-save.jsonc (eec873ee) | Owner/character/revision required, owner/admin read, admin-only direct mutations; no visible composite uniqueness or conditional-update guarantee. |
| base44/entities/game3-d-character-save-backup.jsonc (426dc188) | Owner/character/save_revision/data/reason required; owner/admin read, admin-only direct mutations. |
| base44/entities/game3-d-guest-character-save.jsonc (b8bbeaed) | Separate recovery-hash scoped guest save, revision and previous snapshot; admin-only direct entity access. |
| base44/functions/guestCharacterVault/entry.ts (0da4adbe), 87–152 | Recovery code authorization and quota for register/recover, tombstone, revision comparison with explicit overwrite option, save checks then update. No atomic CAS guarantee shown. Do not change guest entry, overwrite or recovery policy. |
| base44/functions/characterVault/entry.ts (ee286110), 200–237 | Restore checks duplicate/deleted and backup owner/character; backup before restore, then save update and separate upgrade/discovery ledger updates. Intentionally restores donor states and re-delivers eligible post-backup discoveries. Actual restore semantics must be preserved or explicitly reconciled; metadata-only prototype must not replace them. Multi-write atomicity and interruption recovery unproven. |
| base44/config.jsonc (96b95b82) | Managed install/build/dev scripts; no deployed discovery registry evident here. |

Next R143: bounded multi-character transaction and restore-reconciliation fixture with explicit pending-operation journal, test interrupted ledger steps and semantic reward identity. Preserve intentional historical restore policy; no silent change to live saves. Need actual deployed discovery function/schema and provider atomicity evidence; no production integration until established. No merge or deploy.
