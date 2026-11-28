# R155 — WP-FS-01 skill damage curve test correction

Project Fallen Sky / FS-06. Branch test/r155-skill-curve-loadout, based on 6d78647f6a2da93dc41410a7bb6be6d6a82d016f. Initial analysis and runtime test on 1a8a64cfc2ab6d0c990354a26602a2f392e935fc. Prior reward audit PR #451 remains separate and blocked on staging/owner decision. Story-side Phase 75/76 packages already have PRs #444/#445, not duplicated.

## Completed

Native Node v24.22.1 baseline on Base44 app sandbox: 17 tests, 13 pass, 4 fail, 2004.402529 ms, exit 1. All four failed at test helper hold() calling switchAXEInventoryWeapon on newly owned, unequipped gear. Inventory store correctly rejects WEAPON_NOT_EQUIPPED. Commit e12a77b8 changed the equip/switch contract to three real equipped instances. addAXEEquipmentItem defaults equipped=false; equipAXEInventoryItem handles explicit slot replacement; switch draws an already equipped item. No cast/damage failure proven.

Changed only tests/game3d-skill-damage-curve.test.mjs hold(): inspect owned item, explicitly equip if needed, replace active slot when all three occupied, then call the real switch function. Existing assertions preserved. This models valid current loadout interaction rather than weakening runtime restrictions. Approved skill curve configuration, default OFF, gameplay code, equipment rules and balance unchanged. Candidate code commit 6517242a7bab05cc9b7ad975a37b9b9e4e1a5ae7, verified test blob ac46b1c642a688a334a277a965f97f572ff247c8.

## Test evidence and limitations

Candidate executed via node --input-type=module stdin in app sandbox, with only two path adaptations (relative import rooted at app and root=process.cwd()), against original main 1a8a64cf. 17/17 passed, 0 fail/skipped/TODO, 1145.538285 ms, exit 0. Includes real esbuild-bundled inventory/registry/executor, existing fake timers and offline Base44 shim. Both runs left no tracked app modifications. Test blob on new branch exact candidate before path adaptation. Main advanced before branch creation; original test blob unchanged; exact branch checkout run still pending. No claim that newer main runtime or CI is verified. Full suite comparison, lint, build and live/browser not run, so package completion criteria not fully met. No production source or data, no merge/publish. Assets: none.

## Hand-back

Owner-approved scope: WP-FS-01, retain default OFF and numbers, correct failures. Decision: fixture-only correction because observed runtime refusal is correct; not a gameplay bug fix. Left incomplete: full suite/lint and exact branch verification. Next: implementation lead run node --test tests/game3d-skill-damage-curve.test.mjs and full suite/lint in branch checkout, compare current baseline; owner reviews PR. Keep pending reward authority staging MI-FS-P4 separate. No additional owner question required for this test correction.
