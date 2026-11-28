# R151 — Base44 provider intake and correction gates

WP-FS-09 analysis-only / FS-22 / FS-D14 / MI-FS-P4. Main inspected 048ba1703131dad8f9399078039eb17e6d866796; continues draft PR #451 and R150. No runtime patch, schema write, entity record access, deployment or merge. Existing project policy requires implementation-ready package before changing production.

## 1. Read-only provider inspection

Base44 app AtomxEveGames (app identified by list_user_apps; app main inspected). Base44 list_entity_schemas returned 78 schemas; filtered request for Game3DCharacterSave, Game3DCharacterSaveBackup, Game3DGuestCharacterSave, Game3DItemUpgrade, Game3DDiscoveryClaim and RewardGrant returned only RewardGrant. Direct GET entity schema for Game3DCharacterSave, Game3DItemUpgrade and Game3DDiscoveryClaim separately returned explicit not-found messages. This establishes absence in the inspected schema API, not absence of every historical database record or alternative deployment. No player records were queried.

Base44 main sandbox has repo-style entity files game3-d-character-save.jsonc, game3-d-character-save-backup.jsonc, game3-d-guest-character-save.jsonc, game3-d-item-upgrade.jsonc; no discovery schema in inspected directory. Source files characterVault, guestCharacterVault and itemUpgrade are present; explorationDiscovery/entry.ts returned file-not-found. Deployed backend-function list API response was truncated, so actual deployed function presence/version cannot be concluded. Base44 main and duelist-hq-v4-test branch listed; latter is not an authorized disposable Fallen Sky datastore. No schema repair, global schema sync, function redeploy, or data mutation attempted.

Existing account RewardGrant schema requires user_id/grant_key, admin-only direct mutations; existing rewardJournal.ts uses SDK 0.8.51 updateMany/upsert wrapper, not multi-record transaction. Character Vault and itemUpgrade source still import 0.8.23. Provider connector exposes filtered update operations but no proof of CAS/unique upsert behavior for missing Game3D schemas; do not extrapolate from account rewards. Deployed function list and provider sandbox/production distinctions remain to be verified.

## 2. Actual standard Node test execution (read-only app sandbox)

Base44 sandbox Node v24.22.1. Ran:
```sh
node --experimental-strip-types --test tests/fixtures/r147/*.test.mjs
```
Raw counts: 15 tests, 14 pass, 0 ordinary fail, 1 TODO assertion failure (0 !== 1), 0 skipped, 0 cancelled; exit 0 due to TODO. Duration 182.018045 ms. This confirms R147 repeated material removal in the actual module runner; TODO is NOT resolved. No changed files reported.

R150 fixture file not in app checkout yet; retrieved exact PR test blob ad544a0b878f999ed84c13476c0a7f324293e8df and ran via node --input-type=module stdin in app root, replacing only source path resolution (readFileSync(path,'utf8') instead of URL relative to test file). Six diagnostics matched, 6 pass, 0 fail, 0 TODO, 19.266932 ms, exit 0. Three positive protections and three reproduced safety gaps, not six safety requirements passed. Actual source function excerpts with injected I/O; no provider gameplay endpoints invoked. Verified source hashes from sandbox:
- itemUpgradeLedger.ts a5a80f7818a307f1606a506246a4aad555fe3c2d
- axeGearTiers.ts 6a0879d89b7100c4a6a4b0f02c60be35c103c240
- axeItemEnhancement.ts 6b02e51f9dab2e012832ebf6ebee70fe5f7533b1
- axeItemAdvancement.ts 62766d9e415b81c6466cbf3a7a8e668c389f2139
- axeServiceEconomy.ts 6e450287618031f40941bd4898831e7939a18f82
- rewardJournal.ts bb36229cfd2200aa4dbd91e6bd32ee11e4ec484c
- AXEServiceTransactionGateway.js 99a1fc28988379b731c421883b261afee9bf3e46
- lootStore.jsx 4e63da945696de7ce47a2e40aac62c8c5155f78b
- characterVault.js ced0888b96cefb5f21927f608509adced6501a44
- R147 compatibility test 2632afb3a2e1edb6147200904e4aefd760fb44db
- R147 TODO test 95cc7e3d7182254797e77fb720095ebb71973a0f

Local container GitHub DNS still unavailable. App sandbox is now an alternative for read-only tests of existing code; do not write files there (changes can automatically affect app). Historical 106 Node passes not rerun. R147 14 now verified in Node, no double-counting of earlier V8 checks; R150 diagnostic six reported separately. No full suite or Windows run.

## 3. Correction work packages proposed, not approved

A. Provider recovery preflight: implementation lead obtains exact deployed function inventory, confirms schema names/permissions and correct app/environment, verifies deployment order and rollback, establishes disposable scope. No blanket schema sync (could overwrite unrelated definitions) and no guessing discovery schema. Verify backup/export and owner approval before deploying missing entities. Existing schema files are not proof of deployed availability.

B. Minimal client session/flush fence: preserve guest and legacy supported policy. For server-verified upgrade require a successful flush of captured identity, recheck session generation before/after flush, retry wait and roll; no late local writes or automatic local fallback for verified operations. Define pending/unavailable UI state and explicit retry. Tests: false/throw flush no roll; switch A→B→A before or during await no side effect; old generation busy cleanup cannot clear new generation; legitimate guest behavior unchanged. Needs scoped implementation approval and integration with actual change notifications.

C. Receipt/application recovery: do not merely skip debit on repeated=true; that can leave an unpaid operation when first response was lost. Preserve returned stable transaction identity and server result, prove checked journal/snapshot projection and reconciliation; reject conflicting intent; suppress success until payment and item/donor state reconciled; no duplicate debit after restart/cache eviction. R147 legacy ID ambiguity requires server-owned per-occurrence identity or separately approved historical reconciliation. No client receipt is an authority to grant items. Tests: loss before/after local debit, partial local write, same and old retry, material already spent, restore epoch, distinct legitimate duplicate and competing devices. No production migration until provider guarantees verified.

D. Storage proof on disposable non-player records only: exact SDK and schema; conditional update 0/1 result, stale revision, two concurrent calls, keyed upsert uniqueness, lost reply, fail-closed error, rollback/restore interlock. Single-record predicate does not prove multiple-record atomicity. Require evidence of atomic state/receipt or recoverable staged journal before real integration. No authorization to mutate live records or create staging schemas inferred.

## 4. Hand-back

Completed: R147 exact Node compatibility run and TODO reproduction; R150 Node diagnostic execution with path-only adaptation; read-only app schema/source inspection. Source references, raw counts and gaps above. Approved: analysis-only WP-FS-09, no runtime implementation inferred. Left incomplete: actual deployed function manifest (truncated), missing schema reconciliation, provider atomicity, discovery source, approved correction scope. Next: implementation lead verifies provider deployment state and a disposable staging environment, then owner approves B/C separately; proceed with unrelated ready packages meanwhile. Assets: none. Live/visual check: not run. Missing information: MI-FS-P4 stays open. Preserve current balance, guest-only entry and intentional restore/redelivery. No live data or app files changed.
