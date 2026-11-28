# R150 — reward authority runtime gap map

WP-FS-09 / FS-22 / FS-D14. Pinned main 9bd3ff2302c14d63d170f7afe7b5c8cff6c4cc82. The new project-record protocol makes WP-FS-09 analysis-only, not authority to change production. R139 remains the contract; R140–R149 fixtures remain supporting evidence. R149 PR #447 is separate and open at intake. No asset, balance, guest entry, schema, runtime or deployment changes.

## Actual-source diagnostic evidence

The companion [test](../../../tests/fixtures/r150/gateway-source.test.mjs) reads the real gateway, loot functions and server-dice wrapper from a checkout. Source function bodies unchanged except removing export declarations; injected I/O (storage, engine, server responses, readiness, gear changes, audit) is synthetic. Three source blobs verified at intake:
- src/components/game3d/axe/services/AXEServiceTransactionGateway.js 99a1fc28988379b731c421883b261afee9bf3e46
- src/components/game3d/lootStore.jsx 4e63da945696de7ce47a2e40aac62c8c5155f78b
- src/components/game3d/character/characterVault.js ced0888b96cefb5f21927f608509adced6501a44

Six assertions executed in connector V8 harness with retrieved source strings and synchronous assertion adapter, all matched expected diagnostic outcomes; not a Node module run. First harness attempt failed because structuredClone was unavailable; JSON clone for JSON-only fixture inputs resolved harness issue. Committed test blob ad544a0b878f999ed84c13476c0a7f324293e8df read back exact, commit 6123b311a678baed747ebf1715463fb08761c021. Standard Node runner NOT RUN (container git ls-remote failed DNS); reproduce in actual checkout with `node --test tests/fixtures/r150/gateway-source.test.mjs`. R147 direct-import TODO also NOT RUN in Node this pass. Do not add diagnostic observations to the 106 historical Node passes. Project record also reports R142 Windows SIGKILL failures; cross-platform verification remains open.

| Diagnostic | Observed |
|---|---|
| same-session retry | one material spent, cached receipt, one server request |
| reload with persisted receipt | replay blocked from charging |
| failed receipt persistence then reload | two materials spent with same simulated server roll; exact first unit gone, fallback consumes second |
| character A to B during await | CHARACTER_CHANGED; no debit |
| character A to B to A | scope equality does not detect intervening session change |
| flush returns false | dice wrapper still sends roll request |

The last three gap observations reproduce the present behavior in the harness, not passing safety requirements. The replay case intentionally supplies same request ID after reload, with server replay and no intervening Vault correction simulated; no claim of real UI frequency or live inventory loss. Actual server response includes repeated at top level, but createServerDice extracts result only. Gateway applies debit before recording receipt; receipt cache persists latest 200 entries with unchecked set. characterStorage.jsx 623cc271 swallows set errors; lootStore.consumeLootUnits emits before same-type fallback and returns ok. Gateway checks owner/character equality, not generation. Vault sync has generation for upload responses but apply writes separate keys; flush can return false, and createServerDice ignores it. A server may still reject an out-of-date roll; this was not tested against provider.

## R139 acceptance gap map (20/20)

Status describes source coverage, not production acceptance. 'Partial' means existing relevant implementation but evidence/semantics incomplete. Prior prototype references do not establish production behavior.

| Case | Actual source path / observed gap | Evidence / status |
|---|---|---|
| T01 identical claim | itemUpgrade entry latest_transaction_id; gateway local 200 receipts; discovery handler unavailable | partial; R140/R145; R150 same-session and persisted replay work, lost receipt gap |
| T02 simultaneous devices | Vault put read revision then update; itemUpgrade reads rows then appends | blocked on provider predicate/uniqueness tests; R141/R145/R149 SQLite only |
| T03 lost response | itemUpgrade latest-result replay, createServerDice strips repeated flag; receipt applied after debit | partial; R150 duplicate debit diagnostic; older server attempts not covered |
| T04 failed write | characterStorage.set unchecked; loot add uses setChecked, consume emits unchecked; equipment writes separately | partial; R150 injected receipt failure; R144 transaction fixture only |
| T05 bag full, vault room | lootStore addLootToInventory + game3dStorageModel 200/400 limits; overflow returns location | partial; discovery apply dedups bag only; server projection of vault not verified |
| T06 both full | loot add returns null; explorationDiscoveryStore pushes return and records claim; enforceDiscoveryLedger appends pending into bag without capacity check | partial; no end-to-end pending delivery capacity/ack test |
| T07 character switch | gateway transactionIdentity equality and Vault upload generation; discovery wrapper capture characterId | partial; R150 direct switch protected, ABA gap, discovery async fence unverified |
| T08 session closes | Vault stop generation and gateway cache persist; no shared session generation proven | partial; R150 reload checks, old receipt failure |
| T09 unauthorized owner / objective | itemUpgrade and Vault auth.me, scoped owner; discovery deployed handler unavailable; verified questbook read model not writer | partial; no trusted Threads reward writer/objective verifier found |
| T10 unknown catalog/quantity | itemUpgrade service/item validators and server upgradeCost; shared discovery definitions | partial; no authoritative Threads catalog grant endpoint located |
| T11 consumed/sold/destroyed gear | itemUpgrade consumed/refine checks; enforceUpgradeLedger removes item; current owned-instance dedup only | partial; lifetime entitlement after sale/destroy absent for Threads; R147 source checks |
| T12 distinct approved occurrence | exploration rows per discovery and generated drop IDs; equipment instanceId | partial; durable semantic per-occurrence Threads entitlement absent from inspected path |
| T13 restore backup | Vault restore backup owner checks, save update then ledgerRecordsFor and pendingAfterRestore separate writes | partial; R143 journal simulation, actual restore interruption unverified; R147 legacy duplicate TODO |
| T14 paired lives | R66/R139 rules, current material discovery store not paired story claim | no live implementation identified; preserve one lifetime entitlement |
| T15 either ending | R64A/R65/R76; no runtime ending path established in project record | blocked MI-FS-S1/S2; gear preservation not verified |
| T16 NG+ repeat | R84 cycle policy; no approved runtime cycle ledger identified | blocked FS-S08 and MI-FS-S4; cycle-state contract still required; no fabricated XP/rewards |
| T17 failed donor service | itemUpgrade server roll, cost and consumed arrays, gateway per-character lock; material and upgrade local writes separate | partial; R144–146 and R150, real multi-device atomicity unproven |
| T18 local-only/conflict | createServerDice returns local for local_only and legacy unsupported newer services; conflict refuses; flush false ignored | partial; distinguish intended guest-only and compatibility fallback from verified authority; no silent policy change |
| T19 missing art | equipment store owns instance; AXEAscendedGearVisualRuntime reads advancement, disposes materials/geos | partial; no missing-art runtime invariance test |
| T20 preview isolation | fixtures not mounted; R131 preview boundary; actual isolated entry still separate assigned work | partial; no live build exclusion/runtime isolation evidence |

## Provider candidate discovered

base44/shared/rewardJournal.ts bb36229cfd2200aa4dbd91e6bd32ee11e4ec484c implements conditionalUpdate via SDK 0.8.51 updateMany predicates, checks updated count 0/1, and ensureKeyedRecord via upsert. base44/shared/rewardEngine.ts 492da968438a56135c74537aa5927a837f19434c uses it for account-level cards/XP; not Game3D inventory authority. Current characterVault/itemUpgrade import SDK 0.8.23. Candidate reuse of single-record predicates after version/deployment compatibility tests; helper explicitly not multi-record transaction. Do not migrate endpoints or reuse account card grant as gear grant. Verify deployed updateMany/upsert uniqueness/response semantics on disposable scope; provider credentials/access not established.

## FS-D14 decision and narrow correction proposal (not approved)

1. First establish scoped operation/receipt authority and recoverable atomic debit, upgrade and receipt state. Do not fix by simply ignoring spent units, suppressing fallback when a repeated flag appears, or marking receipt before payment: all can hide unpaid or partially applied upgrades. Preserve legitimate duplicate materials and existing intentional restore/redelivery. Resolve legacy overlap with auditable reconciliation rather than automatic deletion.
2. For the client, propose one server-verified projection or durable scoped application journal, with checked writes and explicit pending status before allowing further economy operations. Session-generation fence must account for A→B→A and stale callbacks. Need proof of restart/retry/rollback, no silent local substitute for verified operations, and defined same-revision/restore epoch reconciliation. Server response must carry stable request identity and original receipt; older history must survive cache eviction. Never assume a local marker grants privileges.
3. Verify actual Vault get/put/restore and discovery acknowledgement/capacity semantics, including the R147 double-correction TODO, pending restore and full bag/vault, and Windows/desktop baseline tests. Require non-mutating staging then disposable datastore, no live player writes.
4. Separate approval for provider SDK change, schema migration and guest/legacy compatibility policy (MI-FS-P4 proposed below). Existing balance, protection, deployment sequence and guest-only policy untouched. No production patch authorized by WP-FS-09. Request implementation-ready package after review; next R151 should be exact checkout Node run and provider contract verification, not another unrelated synthetic SQLite suite.
