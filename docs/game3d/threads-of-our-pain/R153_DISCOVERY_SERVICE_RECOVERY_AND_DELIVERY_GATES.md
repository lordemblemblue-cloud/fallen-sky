# R153 — discovery service recovery and delivery gates

FS-22 / WP-FS-09 analysis-only / FS-D14 / DP-03 / MI-FS-P4. Main pinned 1a8a64cfc2ab6d0c990354a26602a2f392e935fc. Continues R152, draft PR #451. No live code, data, registration or deployment.

## 1. Recovery result

The Base44 app sandbox HEAD matches pinned main; git reports non-shallow. Read-only git log --all -- paths for base44/functions/explorationDiscovery, base44/entities/game3-d-discovery-claim.jsonc, base44/entities/Game3DDiscoveryClaim.jsonc and docs/game3d/EXPLORATION_DISCOVERIES.md produced no entries. A historical filename search under functions/entities/docs also returned no matching discovery service/schema paths. GitHub default-history path queries were empty; commit and PR keyword searches did not identify original service (unrelated Fantasy Battle results excluded). Branch search found Phase 61 and 74 paired discovery, not original server source. Exact path checks in marcusflow1-arch/atom-x-eve-os and marcusflow1-arch/Fallen-sky- main returned 404. Search limited to accessible history/paths, not all external archives or unpushed work. Deployed function list API was truncated in R151. Cannot conclude original never existed.

Recovered source is base44/shared/explorationDiscoveries.ts blob 1918d8a20be5a0c7c6ae5f482881c5ba4688eca3; introduced in [a61b4e77](https://github.com/lordemblemblue-cloud/fallen-sky/commit/a61b4e770c58fc98ad7ce0661c87ac3e5b2fd463), restoring shared dependencies. It is a shared rule module, not a server handler. Existing five First Territory definitions (three timed nodes, one lifetime material cache, one placeholder elite find), 8 material definitions and current roll/availability rules are source facts, not authorized new-world placement. Client-reported position reach test is explicitly not trusted movement proof. Keep original coordinates dormant pending terrain approval; do not use the placeholder as a real skill. The current paired-discovery model (Phase 74, blob 3714746d, PR #443) is an isolated narrative journal, not a server reward writer. No conflation with Fantasy Battle or paired story entitlement.

## 2. Recovered interface (not a new schema)

| Source | Observed contract |
|---|---|
| characterVault.js ced0888b, 93–119 | createServerDiscoveryClaims passes characterId, discoveryId, position and transactionId to explorationDiscovery claim; unwraps result; local_only and conflict paths, one not_synced retry after 800ms; flush result ignored; afterApply flush. |
| explorationDiscoveryStore.js 52049bdf, 80–131 | Server result fields ok, discoveryId, kind, units, skills, claim; refusal reason and nextAvailableAt; updates claim on refusal if present. Current dedup only sees bag; unchecked claim write; pushes null insertion then may throw on u.id. Async session fence absent in this function. |
| explorationDiscoveries.ts 1918d8a2 | DiscoveryRow: id optional, discovery_id, claims, first_claimed_at, last_claimed_at, next_available_at, skills, pending, granted. Unit: id/name/rarity/icon/category/dropId/source/collectedAt. One row per character/discovery described, no uniqueness guarantee. Restore scans granted history. |
| characterVault/entry.ts ee286110 | Owner/character filter, max 1000 rows; pending cleared via separate get/update after save; delivered_at, restored_at fields used; restore merges pending from history. |
| game3dStorageModel.mjs 29980b84 and game3dStorageStore.js 144b959b | Bag cap 200, storage cap 400, key axe_game3d_storage_v1, version 1 items, checked overflow writes. |

Required missing original fields, permission rules, transaction replay behavior, retained history bounds, evidence source, and actual deployment contract must be recovered or separately approved. Existing row type is not sufficient to create a production entity. Do not allow client-selected quantities, position-only verified rewards, or guess the original handler. Preserve separate local guest and authenticated paths.

## 3. Actual source diagnostic run

Base44 app sandbox Node v24.22.1, ran node --experimental-strip-types --input-type=module with test body via stdin and app-root relative imports (no app file writes). Four tests, four expected diagnostic outcomes, zero ordinary failures, zero skipped or TODO; 10.701418 ms reported. Committed test file reproduces body with checkout-relative import paths, not byte-identical stdin. Blob 91e28109ad711f336567c1f0eb0773e2af60181c, commit 7bc299b801631ba96161717139eb5e1ae0ebe821. Run from checkout: node --experimental-strip-types --test tests/fixtures/r153/discovery-delivery.test.mjs. This path itself not run in sandbox. Three tests intentionally assert current defective behavior, not passing safety acceptance. Historical R140–R151 counts not rerun or added to these diagnostics.

- Positive: pending unit recovered into empty bag, same pending ledger applied again keeps one instance in bag.
- Gap: bag 200 + vault 400 normal units, pending one: bag becomes 201 and delivered contains row ID; function ignores available capacity.
- Gap: pending unit already in vault, empty bag: same dropId appears in both containers after enforceDiscoveryLedger.
- Gap: backup containing grant only in vault, post-backup timestamp relative to chosen cutoff: pendingAfterRestore queues same unit despite vault presence. Artificial input to reproduce lookup behavior, not evidence of actual historic save timing.
- Source observation only: client applyDiscoveryResult handles bag dedup but does not check overflow null before event dispatch; session switch and lost acknowledgement path need exact gateway tests. No live call/records.

## 4. Dependency-ordered package — proposed and blocked

D0 environment: actual deployed function list and correct app/branch, historic schemas/backups, disposable scope, owner-approved rollback. R151/R152 discrepancies remain.
D1 guest recovery independently: existing GuestVaultQuota registered, private Game3DGuestCharacterSave definition reviewed; verify approved staging registration and recovery proof/ownership, no guest privileged economy. No account schema required for this isolated track.
D2 account economy staging: reviewed Game3DCharacterSave/Backup/ItemUpgrade definitions, original Game3DDiscoveryClaim schema and original handler still required before complete account vault put/restore. Register targeted definitions only after D0 approval and authoritative contract recovery. No bulk sync or data deletion. Companion loadout is separate preference work.
D3 discovery receipt and projection: server-owned entitlement identity, exact scoped units, durable pending before acknowledgement; use existing rules when appropriate, validated world/quest evidence instead of client position alone. Must reconcile bag + vault together and preserve both capacities and per-key size limit, no duplication across categories/containers. A full pair stays pending, a successful vault delivery is acknowledged only after checked save, and restore recognizes owned units in either container. Partial deliveries need exact per-unit receipt state; no blanket row acknowledgement. Prevent stale session and repeated grant, preserve intentional post-backup redelivery and avoid unauthorized resurrection. Design not approved; no source mutation.
D4 acceptance: real provider predicate/uniqueness/atomic or recoverable write proof, legacy receipt reconciliation and corrected R147/R150/R153 assertions; test lost response, interrupted save/ack, capacity full and frees space, storage write failure, move bag↔vault, restore with pending/consumed, session A→B→A, unknown/unauthorized claim, local-only, actual approved world scope. Keep 200/400 caps unchanged. No security certification until evidence.
D5 owner-authorized staged release with rollback that preserves any written data. Do not enable story rewards or change the map automatically.

## Hand-back

Completed: accessible history/path recovery attempt, exact interface/source map, 4 read-only Node diagnostic observations, staged dependency plan. Approved scope analysis only; no deployment, schema or gameplay changes. Missing MI-FS-P4: original discovery handler/schema or separately approved replacement contract; actual deployed function list, historic data reconciliation, disposable provider proof, explicit scope approval. No art assets required for this packet. Live/visual checks not run. Next: seek missing source/deployment evidence from implementation lead or owner, then review D0/D1 separately. Do not keep generating synthetic tests as substitute for these gates; proceed with unrelated implementation-ready work while blocked.
