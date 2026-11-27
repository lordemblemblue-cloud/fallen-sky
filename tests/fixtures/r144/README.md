# R144 — isolated Blacksmith atomic debit and replay

Continues R143 in draft PR #425, based on main ab03f50a184f9c981f08f579d4f1fc22dbb006be. Run `node --test tests/fixtures/r144/blacksmith.test.mjs` from root. Local Node v22.16.0: 12 tests, 12 pass, 0 fail, 0 skipped (experimental node:sqlite warning). Tested Git blob 957364863ee416d1cf8917a5318b187fcec93e61 matched retrieved GitHub file, code commit a0862ae5ed7e5ee692767a7fa6513cb271d06931. Historical R140–143: 43 recorded passes, not rerun here; total 55 across five suites.

## Source review

- `base44/functions/itemUpgrade/entry.ts` (5ec123f8): existing server rolls, authenticated scope, material selection, donor consumption, latest transaction replay and ledger write. The last_transaction_id/last_result pair covers the latest transaction on the item/service row; older transaction replay and simultaneous operations across rows require separate verification. No datastore atomicity established.
- `base44/shared/itemUpgradeLedger.ts` (a5a80f78): server-rolled services include reinforcement, over_enchant, refine, ultimate, combine, stage, tier_up; donor services combine and stage. Existing rules govern cost and outcome.
- `base44/entities/game3-d-item-upgrade.jsonc` (a9ee3210): stage means Ascension; records spent drop IDs and consumed donor instance IDs, owner/admin read and admin-only direct mutation.

## Scope and limitations

SQLite in-memory single synthetic scope; transaction contains debit, material removal, donor consumption, advancement and persistent-within-connection receipt. Duplicate older transaction returns original result after later operation. Request identity conflict and stale revision are rejected; simulated restore flag blocks new or replayed operations. Injected failure before commit rolls back all changes. Costs (2 gold and one material on either result), lock rules, advancement counter and trusted outcome injection are intentionally synthetic, not production balance or final policy. In particular this is not an implementation of actual Combine failure cost, Ascension set-bonus math, enchant loss or protection rules. No real roll, user authentication, real catalog, protection item, over-enchant/refine/ultimate/tier-up, concurrent workers, disk durability, complete restore integration, or live database tests. Prior R143 journal is separate; flag is not integrated with it. Begin lock failures not handled in this fixture. No production changes, grants, merge or deploy. Base44 atomicity and deployed discovery service remain unverified.

Next R145: test simultaneous Blacksmith operations with competing donor/material claims on disposable persistent SQLite, request replay across connections, and inspect real catalog/outcome contracts before proposing production integration. No changes to gameplay balance or live services.
