# R139 — Equipment transaction authority and replay contract
27 November 2026 | Read-only source survey and implementation ticket. Main pinned at ba35f5ff2f9dd7276e3e9f4f4758d628c08a83d3; PR #409 open/draft, head 893596667e8bde0baf2147a7987f3b173b942081 at intake. Extends [R138](R138_EQUIPMENT_ASSET_REGISTRY_AND_REWARD_RECONCILIATION.md), [R137](R137_P01_QUESTBOOK_DIALOGUE_AND_REWARD_INTEGRATION.md), [R135](R135_P01_SOURCE_TO_FIXTURE_RECEIPTS_AND_RESET_ACCEPTANCE.md) and [R84](R84_UNIFIED_NEW_GAME_PLUS_PROGRESSION_CONTRACT.md). ChatGPT owns gameplay/backend/UI and asset registration; Claude/Gemini own graphical/map/character design. No live integration, migration, grant, new catalog ID, deployment or merge authorized by this ticket.

## 1. Verified source boundaries
Paths below relative to pinned main; blob prefixes identify inspected files.
| Source | Blob | Finding |
|---|---|---|
| src/components/game3d/axe/equipment/AXEEquipmentInventoryStore.js | 736c8747 | addAXEEquipmentItem accepts raw item, generates ID if absent, deduplicates currently owned instances, emits via unchecked storage.set; switch/preset and legacy batch paths use checked writes. Consume/destroy also emit via unchecked path. |
| src/components/game3d/characterStorage.jsx | 623cc271 | set catches persistence errors; setChecked reports local write success; keys resolve active user/character at call time. |
| src/components/game3d/exploration/explorationDiscoveryStore.js | 52049bdf | applyDiscoveryResult deduplicates current bag dropIds, pushes addLootToInventory results, records claim and emits events; null return handling and identity fence require review. |
| src/components/game3d/character/CharacterVaultSync.jsx | 02ce50ad | Existing vault engine uses explicit identity getter and reload notifications, registers upgrade/discovery sources. |
| src/components/game3d/character/characterVault.js | ced0888b | Discovery claim wrapper captures characterId, flushes, retries not_synced with same transaction ID within invocation; afterApply flushes. Local-only handling exists; audit identity across each await and across independent retries. |
| base44/functions/characterVault/entry.ts | ee286110 | Authenticated vault routes, owner/character scope, revision check, upgrade/discovery ledger enforcement, backup and restore reconciliation. Read-check-update alone does not establish atomic CAS under simultaneous writes; verify provider guarantees. |
| base44/shared/characterSaveRules.ts | 4930c9fd | Existing save validation and fingerprint helpers. No new authority should bypass these. |
| base44/shared/explorationDiscoveries.ts | 1918d8a2 | Existing claim ledger enforcement and pending-after-restore helper; reuse audited behavior rather than inventing second discovery ledger. |
| package.json | 9aff098a | Vite build/dev and lint scripts exist; standalone test runner not configured in scripts. |
Attempted explorationDiscovery handler path base44/functions/explorationDiscovery/entry.ts returned 404; locate actual implementation before connecting to it. These observations establish code paths, not confirmed exploitable behavior, runtime success, or transaction guarantees.

## 2. Authority and durable transaction
Use existing authenticated principal or separately supported guest authority; never derive privilege from client-supplied owner ID, local character label, item image, or quest UI. Preserve local-only play but keep its unverified receipt namespace distinct; do not promote guest items to verified rewards automatically. Validate ownership, catalog revision, legitimate quest/encounter completion, reward policy and eligible cycle on trusted backend. Do not add a general-purpose grant endpoint. Server derives quantity, rarity and item identity from approved definition; no client roll or price. Stable entitlement key tuple: owner, character, reward definition, qualifying occurrence, scope (lifetime or cycle). Use canonical tuple encoding and durable uniqueness; request attempt ID is separate. Lifetime reward scope omits cycle from uniqueness, cycle-specific scope includes actual cycle ID. No new public IDs defined here.
 
Transaction state: eligible -> pending delivery -> committed; invalid requests rejected, conflicts/persistence failure pending or safely refused. Transaction record retains exact server-assigned instance/drop IDs, outcome, revision and receipt even after sale, consumption, destruction or restore. Concurrent requests for same entitlement must converge on same outcome; verify datastore unique constraint/atomic CAS or transaction support, do not rely on UI lock or a read-then-write. If durable atomic mutation unavailable, use durable staged receipt plus idempotent application/reconciliation with explicit failure handling, and block live integration until proved. Persist inventory and consumption together for multi-item operations. If client response is lost, query same receipt; never re-roll. Missing assets cannot modify gameplay data. No new enhancement rates or gear caps.

## 3. Projection, capacity and UI
Capture owner, character and session generation at request time. Before every local projection, callback, event, or flush, ensure exact captured identity is still current; otherwise do not write to active character and reconcile original receipt on its next authorized load. Use a checked local write and only emit item-collected/equipment/quest UI on confirmed projection, no success toast for a null bag insert. Existing loot 200-unit bag/400-unit vault policy is separate from equipment capacity. If eligible loot cannot be delivered, retain durable pending entitlement with original IDs; UI offers retry after space is available, not a new claim. Distinguish pending, confirmed, already claimed, conflict, full, local-only, unknown definition and failed persistence. Never auto-equip a loaner over existing valid weapon. M03 fixture equipment stays synthetic; loaner permanent disposition and reward quantities remain undecided.
 
For service operations (enhance, combine, ascend, socket, consume, sale), validate actual instance ownership, current revision, lock/equip restrictions, donor uniqueness and authoritative costs. Commit debits, item updates and receipt together or reconcile without partial debit; replay cannot charge again. Preserve existing server dice/upgrade ledger and approved rules. No changes to blacksmith probabilities, stat scaling or save restore policy without separate compatibility review.

## 4. Endings, two lives and NG+
Both endings retain legitimate earned gear and actual advancement. Paired younger/older discovery projects a single lifetime item entitlement unless explicitly approved otherwise; older hero's memory/visual response cannot grant a second instance. Lifetime receipt survives cycle reset, missing asset, item removal and restoration. Cycle-scoped rewards only repeat after approved actual objective in new cycle. Chapter-exclusive missed rewards need genuine opportunity in new cycle, not fabricated retroactive completion. R84 permits repeated optional NG+ and twice corresponding normal enemy XP, but gold/material/quest XP and gear repeat policy remain open. Do not blanket-double rewards or overwrite history. Distinguish intentional administrative restore of historical inventory from a new reward grant; audit existing restore ledger contract and approve migration semantics before enforcement.

## 5. Bounded engineering assignments (ChatGPT gameplay lane)
- E00: Locate actual discovery/guest/reward authority and datastore uniqueness/transaction guarantees. Return source paths, role checks, schema and concurrency evidence; no new live endpoint.
- E01: Implement dependency-free pure reference reducer in separate fixture branch, with synthetic identity, approved fixture catalog, eligibility receipt, stable semantic key, pending/delivered outcomes, expected revision and stale-session projection guard. No network, live storage or import into main app. Use Node built-in test runner if available, pin tested version and command.
- E02: Implement storage adapter tests using injected failing writes, full containers, lost responses and concurrent requests; prove durable atomic or recoverable semantics before proposing backend migration. Memory simulation is not proof of production concurrency.
- E03: Map existing inventory/Questbook/reward notification UI to confirmed receipts and pending statuses; no duplicate inventory, no forced equip, no live-store import in preview.
- E04: Only after review, propose narrow production integration on separate feature branch, preserve current guest policy, validate legacy saves and backup/restore behavior; no merge or release in this ticket.
 
## 6. Acceptance evidence (planned; not run)
| Case | Expected outcome |
|---|---|
| T01 repeated identical claim | Same receipt and instance IDs; one grant |
| T02 simultaneous devices | One committed entitlement under actual storage concurrency |
| T03 lost reply after commit | Query existing receipt, no second roll |
| T04 failed write before commit | No success projection or partial debit |
| T05 bag full, vault room | Confirm exact vault location and original drop ID |
| T06 both full | Durable pending; retry same entitlement |
| T07 character switch during await | No write/notification to new character |
| T08 session closes and reopens | Old callback rejected; authorized reconcile only |
| T09 unauthorized owner or forged objective | Reject without mutation |
| T10 unknown catalog or client quantity | Reject without mutation |
| T11 consumed/sold/destroyed unique gear | Prior receipt prevents resurrected reward |
| T12 same definition, separate approved occurrence | Distinct legitimate instances |
| T13 restore older backup | Reconcile existing ledger and approved restore policy, no accidental double grant |
| T14 younger/older paired discovery | One lifetime entitlement, older visual echo only |
| T15 either ending | Actual owned gear/advancement preserved |
| T16 legitimate approved NG+ repeat | New cycle receipt only where policy permits |
| T17 failed multi-donor service | No partial debit; protected/locked state respected |
| T18 local-only and conflict | No silent server-to-local fallback or fabricated authoritative grant |
| T19 missing/broken art | Ownership and stats unchanged |
| T20 preview isolation | No live writes, network, grants or production imports |

Return actual commit, test command/results, synthetic vs real datastore distinction, storage and event traces, identity/cycle cases, failed cases and rollback plan. No claim of passing unexecuted scenarios.

## 7. Status
Nine inspected source paths; five bounded engineering tickets; twenty planned cases. Actual discovery handler path, guest authority, catalog mapping, atomic datastore guarantees, restore semantics and runtime tests remain unverified. No production implementation or tests executed. Next R140: E01 isolated executable reward-transaction fixture and tests, separate from live game; E00 source discovery remains prerequisite for production integration.
