# R158 — WP-FS-03 private preview level-cap consistency

Fallen Sky FS-04 / WP-FS-03. Pinned main 060c1cfe5fc9d5c9943c41e32134b9d8987daedf. Separate branch test/r158-private-level-cap; PR #462 weapon points and #465 XP bank remain independent. Ported the three previously authored private-preview files from claude/level-cap-155-20261119. No public mounting, database migration, reward grants, new combat formula, par table edits or balance changes.

## Completed
All three literal 100-level caps now refer to shared AXE_LEVEL_CAP (155). Private XP derivation keeps 100+25*(level-1) per level; this is the existing private preview formula, NOT the live hero XP curve. At 155 it reports capped, retains excess committed XP in preview, no XP credited by this function. Existing private base-stat growth preserved. Private PvE validates both actor sheets against the same cap before private RNG and uses the existing shared outcome engine, no equipment/skill multipliers authorized. Existing policy version strings retained from prior candidate; compatibility/versioning must be reviewed before any deployment because derived levels from previously capped committed totals can now change. Private consumers include trusted sheets, seed provisioning, quest acceptance/settlement, progression read and stat allocation; not all covered by these tests. No live access or ranked permission added.

## Evidence
Baseline on actual app sandbox Node v24.22.1: combat104,107,143 and duel-system-backend suites 17 total, 11 pass, 6 fail (all duel failures: trusted baseline level 1 vs old expectation 100, HP baseline 182, reflect, position_stale). Do not port the old duel test's literal 155 expectation: current authority ignores supplied client stats; separate WP-FS-06 harness/authority review needed. No change to duel source or tests here.

Candidate ran in disposable pinned-main archive with old branch's three files and new boundary tests. First attempt missing src game3d dependencies produced two import failures; four new tests and two original tests passed. Retried with src/components/game3d included and existing node_modules symlink: node --experimental-strip-types --test server/game3d/tests/combat104.test.mjs server/game3d/tests/combat107.test.mjs server/game3d/tests/combat143.test.mjs server/game3d/tests/combat148.test.mjs server/game3d/tests/r158-level-cap.test.mjs. 17/17 passed, 0 failed/skipped/TODO, 979.831202 ms, exit 0. Four new cases exercise all 155 XP and stat level boundaries, old formula preservation, both combat directions at 100/101/155 for three rolls, reject invalid level before rolling and preserve private-only/competitive flags. Exact tested blobs confirmed:
- server/game3d/progressionLevelPolicy.mjs 76c6b374532a5d705c9f53d8756087504fa1bc49
- server/game3d/combatStatsPreview.mjs 1b801e41d869d450e5e8768250be82899fd20873
- server/game3d/privateAXEPveResolver143.mjs 9cf166239a523307332d6a071503c3d1e83fe867
- server/game3d/tests/r158-level-cap.test.mjs efd67b9d7db1f2987fe2b0660cdfab843489c3bd
No full-suite, lint, build, PostgreSQL, deployed gateway or browser run. No live player data or app files modified. No merge or deployment.

## Remaining
WP-FS-03 integration review across R156–158, full suite and actual HUD/save roundtrip pending. Bank payout FS-D3 not approved; cloud schema/concurrency evidence remains blocked. Private progression consumers above 100 and policy versioning need review before production use. Six duel tests require separate authority-aware fixture work rather than relaxing runtime protections. Next R159: targeted duel harness audit and correction package or independently ready work, keeping owner-approved security semantics and no guest bypass. No assets.
