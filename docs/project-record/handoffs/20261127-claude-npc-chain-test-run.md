# WP-FS-S5 hand-back: native test run of the NPC-phase branch chain

Hand-back record (AGENT_HANDOFF_PROTOCOL §5). No merge, no fixes.

```
Project / feature:            Fallen Sky / The Threads of Our Pain NPC-phase chain, Phases 44–67 (backlog FS-S04, package WP-FS-S5)
Branch / head commit / PR:    docs/fallen-sky-npc-phase67-m18-intake at f58c30e6 (head of the stack, PR #433, open);
                              63 commits ahead of main 9034ba14, 402 behind
Completed:                    native run in a full checkout (detached worktree of f58c30e6, node_modules junction to the shared clone),
                              Node v26.13.0, Windows 11, 2026-11-27
Approved:                     not applicable (verification only; the merge is the owner's decision FS-S-D10)
Left incomplete:              nothing in scope; no browser run (the modules are not mounted)
Next step:                    owner decides the merge; then WP-FS-S2 / WP-FS-S3 can reuse Phase 45's adapter and Phase 61's framework
Files changed:                none in the chain; this record only
Decisions to preserve:        the modules stay disabled and unmounted until integration is approved (R130, R137, Phase 43)
Assets required:              none
Unresolved dependencies:      R111 P0 for the chronology-dependent parts; actor identities (MI-FS-S5)
Remaining problems:           see "Results" (lint errors in test and script files)
Missing information filed:    none new
```

## What the chain adds outside `docs/`

`git diff --name-only origin/main...f58c30e6`, excluding `docs/`:
- 8 modules in `src/components/game3d/narrative/`: `m01MerchantBridge.mjs`, `m02ClearingBridge.mjs`, `m03EncounterModel.mjs`, `m03QuestBridge.mjs`, `openingFixtureHost.mjs`, `openingQuestAdapter.mjs`, `originalRealityBridge.mjs`, `wolfveilBridge.mjs`.
- 9 test files: `tests/fallenSkyM01MerchantBridge`, `fallenSkyM02ClearingBridge`, `fallenSkyM03Encounter`, `fallenSkyNpcDraftRegistry`, `fallenSkyOpeningFixtureHost`, `fallenSkyOpeningQuestAdapter`, `fallenSkyOpeningRegion`, `fallenSkyOriginalRealityBridge`, `fallenSkyWolfveilBridge` (`.test.mjs`).
- 4 scripts: validators `scripts/validate-fallen-sky-npc-draft.mjs`, `validate-fallen-sky-opening-region.mjs`, `validate-fallen-sky-middle-campaign.mjs`, and the runner `scripts/test-fallen-sky-opening.mjs`.

## Results

| Check | Command | Result |
|---|---|---|
| The 9 test files | `node --test --test-reporter=tap <the 9 files>` | **64 tests, 64 pass, 0 fail.** Per file: M01 1, M02 1, M03 1, NPC draft registry 37, fixture host 1, quest adapter 1, opening region 20, original-reality bridge 1, Wolfveil bridge 1 (seven files wrap many scenarios in one test) |
| Validator: NPC draft | `node scripts/validate-fallen-sky-npc-draft.mjs` | exit 0 |
| Validator: opening region | `node scripts/validate-fallen-sky-opening-region.mjs` | exit 0 |
| Validator: middle campaign | `node scripts/validate-fallen-sky-middle-campaign.mjs` | exit 0, "171/171 static checks passed" |
| Opening runner | `node scripts/test-fallen-sky-opening.mjs` | exit 0 |
| Lint, the 8 narrative modules | `npx eslint --quiet src/components/game3d/narrative/` | clean |
| Lint, the 9 tests and 4 scripts | `npx eslint --quiet <files>` | **19 errors, all `no-undef`**: `URL` 12, `process` 4, `console` 3. This is the repo's known ESLint gap (no Node or browser globals for `.mjs`); the same rule fires on `main`'s own `.mjs` tests (for example `tests/fixtures/r140/`). `npm run lint` would fail on these files until they declare the globals (`/* global */` or `globalThis.`) |
| Import graph | grep of `src/`, `server/`, `base44/` for the 8 module names and `narrative/` | **Nothing outside `narrative/` imports them** (two hits are the unrelated identifier `wolfveilBridgeBankTerrainGrade`, in files the chain does not change). The 8 modules have no import statements of their own. Nothing is mounted live |
| Merge with `main` | `git merge --no-commit --no-ff origin/main` (9034ba14) in the detached worktree | clean, no conflicts (not committed, not pushed) |

## Full suite: `main` versus the chain merged with `main`

`node --test --test-reporter=tap tests/`, run one after the other on the same machine:

| Tree | Tests | Pass | Fail |
|---|---|---|---|
| `main` `9034ba14` | 3104 | 2947 | 157 |
| chain `f58c30e6` merged with `9034ba14` (uncommitted) | 3168 | 3012 | 156 |

Compared by failing test name (file plus test title): **no test fails with the chain that passes on `main`.** The 64 extra tests are the chain's own, all passing. The one difference is `tests/duelist-server.test.mjs` "Online quick-match chooses only TDM, CTF or Three-Point Control and lets bots fill seats", which failed in the `main` run and passed in the merged run; it is flaky (it also failed in the `ab03f50a` full run and passes when run alone), and the chain does not touch Duelist files.

## Verdict for the owner's merge decision (FS-S-D10)

From these checks the chain can merge without breaking anything that runs: its code is isolated (pure modules, no importers, nothing mounted), its tests and validators pass, and the full suite shows no new failure. Before `npm run lint` can pass on the merged tree, its 9 tests and 4 scripts need the missing-globals fix (19 `no-undef` errors). Not checked here: CI, `npm run build`, and whether the chain's story content is approved (most of it is draft until R111 and the cast decisions; see FALLEN_SKY_RECORD Part A).

## Clean-up

The detached worktree `fallen-sky-worktrees/npc-chain-check` was used for this run; the trial merge was aborted, its `node_modules` junction deleted first, and the worktree removed.
