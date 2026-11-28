# R157 — WP-FS-03 old-cap XP preservation subpackage

Fallen Sky FS-04 / WP-FS-03 / FS-D3. Pinned main 060c1cfe5fc9d5c9943c41e32134b9d8987daedf. Separate branch test/r157-old-cap-xp-bank; R156 weapon points PR #462 remains separate. Approved work package permits building bank, not payout.

## Completed
Ported the prior level-cap branch's bank intent, not its older loader. Only numeric level 100 with explicit xpForNext:null and XP at or beyond the next-level cost migrates; current level and active XP curve are not changed. Example 5000 -> 159 active + 4841 bank. Existing valid bank retained; current cap active XP zero behavior unchanged. Missing marker or already converted saves are not reinterpreted; previously lost XP cannot be reconstructed. The null marker is a historical convention, not cryptographic proof of provenance. Character-scoped HUD load/persist guards retained; bank displayed conditionally in Character workspace and old Attributes tab (also MAX at current cap). Shared validator accepts optional finite nonnegative bank; this does not establish authoritative entitlement or prevent forged positive bank values. No payout consumer, rested conversion, auto-level, new cap, balance or enemy curve changes.

## Evidence
Base44 sandbox Node v24.22.1, git archive pinned source to disposable /tmp only, patched candidate and ran node --experimental-strip-types --test tests/game3d/r157-old-cap-xp.test.mjs tests/game3d-melee-free-aim-level-155.test.mjs. 10 tests, 10 pass, 0 fail/skipped/TODO, 140.692566 ms, exit 0. Seven new tests cover pure migration, conservation, repeat load, marker restriction, valid/invalid bank, actual shared validator and source assertions on HUD load/persist/award guards. Three existing tests cover free aim, manual lock and level-cap source invariants. Not a mounted HUD, UI, real save-write or concurrent sync test. First oversized sandbox command failed before successful compact patch run; no evidence from that attempt. All six candidate blobs verified against repository:
- src/components/game3d/playerHUDStore.jsx cdfba604ce61abe371d60442d67663243bb791a1
- src/components/game3d/axe/services/AXECharacterWorkspace.jsx df840c76c91222b1ff6d7d1bfa6bd290cdaf2dfb
- src/components/game3d/progression/hub/AttributesTab.jsx 2adffaff8c8c58094581f16806d562820f06a922
- base44/shared/characterSaveRules.ts a9fe0127ef9c4f606133e5fd7232e1d2966699c7
- src/components/game3d/progression/oldCapXPBank.mjs c6c7272ab9fa2ed71ba00166a4719bd0bdb02ae6
- tests/game3d/r157-old-cap-xp.test.mjs c630723f926a21989d01700b8699c9872d4d48b2
No live player data, deployed app source, schema, merge or publish changed. Full suite, lint/build, browser, actual scoped save roundtrip not run.

## Remaining / hand-back
Leave payout disabled until FS-D3/MI-FS-P1 owner decision, and require trusted historic entitlement reconciliation before any payout. Saves already converted or missing marker require separate evidence, never infer lost XP. R156/R157 both alter shared validation dependencies, so before authorized deployment verify compatible characterVault and guestCharacterVault validators, existing schema/concurrency gates R151–154, and owner-approved rollout. Older branch private preview level caps/duel tests still need source review; do not overwrite newer combat or par table. Next R158: audit private server level-cap consistency and remaining old-branch tests, preserving public and privileged access boundaries. No assets. Owner review, integration tests and staging pending.
