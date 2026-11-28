# R152 — Base44 schema reconciliation preflight

FS-22 / WP-FS-09 analysis only / FS-D14 / DP-03 / MI-FS-P4. Main inspected 048ba1703131dad8f9399078039eb17e6d866796; continues R151 and draft PR #451. No live schema, records, app source, auth, function deployment or merge changed.

## Read-only inventory, actual app AtomxEveGames

Node v24.22.1 app sandbox, strict JSON.parse of all 84 .json/.jsonc entity files: 84 parsed, zero parse errors, 83 distinct schema names. Base44 main schema API returned 78 registered names. Set comparison: exactly five source-only names and zero registry-only names. Duplicate source name RewardGrant appears in RewardGrant.jsonc and reward-grant.jsonc; registered RewardGrant exists. File naming alone is not established as cause. Do not delete or rename either definition or infer that duplicate names caused other omissions.

| Source file | Declared name | Registry evidence / role |
|---|---|---|
| game3-d-character-save.jsonc eec873ee | Game3DCharacterSave | direct GET not found R151; account save |
| game3-d-character-save-backup.jsonc 426dc188 | Game3DCharacterSaveBackup | direct GET not found R152; account backup |
| game3-d-guest-character-save.jsonc b8bbeaed | Game3DGuestCharacterSave | direct GET not found R152; private guest recovery |
| game3-d-item-upgrade.jsonc a9ee3210 | Game3DItemUpgrade | direct GET not found R151; upgrade ledger |
| game3-d-companion-loadout.jsonc e4f76c31 | Game3DCompanionLoadout | absent from full listing; unrelated companion preference deployment, separate work |
| no source found | Game3DDiscoveryClaim | direct GET not found R151; required by account vault put/restore |
| GuestVaultQuota.jsonc 39c07777 | GuestVaultQuota | direct GET found, admin-only all actions |
| RewardGrant.jsonc and reward-grant.jsonc | RewardGrant | registered, unrelated account reward journal |

Direct GET of four kebab-case filenames without extension also returned not found. This rules out those exact alias names, not all possible legacy deployments. The full listing comparison excludes discovery claim because it is absent from both sets. Exact root cause of missing registration is unproven. No player records queried. git status --short --untracked-files=no output empty after read-only sandbox commands. No app checkpoint needed because no app changes made.

## Dependency and security map

- characterVault/entry.ts ee286110: auth.me; account owner from authenticated identity unless admin; Game3DCharacterSave, Game3DCharacterSaveBackup, Game3DItemUpgrade and Game3DDiscoveryClaim referenced. Put reads both ledgers, restore updates both. Registering only four available schemas is insufficient to establish complete account vault functionality.
- itemUpgrade/entry.ts 5ec123f8: auth.me; character save and item upgrade ledger; uses server roll and costs. Preserve existing service restrictions, no anonymous privilege escalation.
- guestCharacterVault/entry.ts 0da4adbe: GuestVaultQuota for register/recover, Game3DGuestCharacterSave private entity, recovery hash proof, revision, previous snapshot, tombstone. Existing README and docs/game3d/GUEST_PASSWORDLESS_CLOUD_SAVE.md d489dcfe distinguish local guest entry from deployed cloud recovery. Public invocation of guest vault only with existing recovery checks; no public direct entity RLS. Do not treat guest recovery as entitlement to privileged account economy.
- Existing four schema files parse and contain required fields plus owner/admin reads and admin-only mutation for account entities, admin-only all operations for guest entity. No visible composite uniqueness or transaction guarantee.
- Game3DCompanionLoadout defines owner-scoped preferences, immutable owner/character fields, no direct delete; not authoritative combat/currency. Flag separately for companion owner, do not deploy in this reward package.
- SERVER_UPGRADES.md and CHARACTER_VAULT.md referenced by source but exact paths returned 404 on pinned main; recovery guide and source files remain available.

## Narrow remediation plan — awaiting approval, not executed

1. Confirm correct app and environment, deployed function inventory and deployment mechanism; backend-function list previously truncated. GitHub connection endpoint documents automatic repair attempt, so not invoked in this strictly read-only pass. Confirm exact revision and any historic schemas/data with authorized backup/export process. Do not assume absent schema means no underlying data. Do not run full entity sync: platform catalog defines it as replacing the complete set.
2. On disposable approved staging only, use individual schema registration with exact reviewed names and definitions, preserving permissions. First validate GuestVaultQuota and guest save in isolation; account save/backup/upgrade separately. DiscoveryClaim missing contract is a hard gate for complete account vault: recover authoritative handler/schema or obtain separately approved design; never invent schema from callsites alone.
3. Verify registered readback matches expected fields, required fields and RLS; use non-player synthetic data only. Test guest recovery ownership, invalid recovery refusal, revision conflict, tombstone, local guest access unaffected. Test account authorization, upgrade material accounting, replay, backup/restore and conditional update/upsert in actual provider with deployed SDK. No real user save writes during proof.
4. Obtain explicit deployment and migration approval, backup existing data/configuration, deploy only approved targeted pieces in dependency order; stop if existing definition differs or discovery dependency missing. Preserve current guest policy, account security and gameplay balance. Rollback must preserve any data already written: do not delete a created schema containing data; disable/revert new function use and restore prior validated code/config under owner-approved procedure.
5. Keep R147/R150 regressions open until verified corrected. R151 tests remain current evidence, not rerun here. No security certification or production repair asserted.

## Hand-back

Completed: exact source/registry inventory, two direct missing-schema confirmations and four alias checks, existing quota verification, dependency mapping and bounded recovery sequence. Approved: analysis-only work, no runtime changes. Incomplete: cause, deployed functions manifest, exact discovery contract, historic data preservation plan, disposable staging and provider transaction evidence. Next: owner/implementation lead confirm deployment environment and authorize staging/targeted recovery; meanwhile take implementation-ready packages unrelated to blocked authority. Files: this report and project-record status references. Assets: none. Tests: read-only Node JSON parse and set comparison; no gameplay tests in R152, no full build, no live/visual checks. MI-FS-P4 and DP-03 remain open; companion discrepancy separate.
