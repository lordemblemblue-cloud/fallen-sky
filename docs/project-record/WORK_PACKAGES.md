# Work packages

Packages from the 2026-11-27 baseline (`main` `ab03f50a`), in the format of the owner's directive §10. **Ready** packages can start now; **Approval** packages are finished or nearly finished work that waits for the owner; **Blocked** packages name the missing item. The hub session assigns them to the specialised sessions; one package per branch and PR; follow [AGENT_HANDOFF_PROTOCOL.md](AGENT_HANDOFF_PROTOCOL.md).

Every package keeps the other two games and unrelated pages untouched, runs `npm run lint`, the package's tests and the full suite compared with the current baseline (`f5f29677`, 2026-11-28: 127 failing in `tests/`; 159 on `ab03f50a`), and ends with a hand-back record.

**Update 2026-11-28.** Packages finished since the baseline are marked **Done**, with their hand-back and merge. Each Done package's test file was re-run on `main` `f5f29677` and passes [checked]: the story gate, paired discovery, zero-optional and NG+ display files (1/1 each), `game3d-active-effects-dispose` 13/13, `game3d/r157-old-cap-xp` 7/7, `duel-system-backend` 11/11, `game3d-skill-damage-curve` 17/17, `duelist-push-slide` 3/3, `duelist-mobile-ui` 10/10, `fantasybattle-title-load-ui` 5/5, `fantasybattle-studio-page` 6/6, `fantasybattle-webgpu-faceted-watercolor` 4/4.

## Top packages per game (for the hub)

| Game | Package | Kind | Why first |
|---|---|---|---|
| Fallen Sky | WP-FS-S1 P01 opening slice M01–M03, isolated low-poly blockout | In progress (assigned by the hub on 2026-11-27 to session `local_cb70a7c5`) | The owner's first priority is the story; P01 is the only slice with a full source-to-acceptance chain |
| Fallen Sky | WP-FS-S2 story-ID adapter, WP-FS-S3 paired discovery, WP-FS-S4 zero-optional test, WP-FS-S6 NG+ display | Done 2026-11-27 by ChatGPT (Phases 73–76, PRs #441, #443, #444, #445, in `main`) | Isolated modules and tests; hooking any of them up needs the owner |
| Fallen Sky | WP-FS-S5 native test run of the NPC-phase branch chain | Done 2026-11-27 (see its hand-back) | The chain entered `main` at `6d4afcde` (2026-11-27 19:10, not mounted live) |
| Fallen Sky | WP-FS-01 skill damage curve failures | Done 2026-11-28 (`5249f3c7`, in `main` `faedf8c9`) | The four failures were the test's own equip helper; no game code changed |
| Fallen Sky | WP-FS-04, WP-FS-06, WP-FS-09; part of WP-FS-03 | Done 2026-11-27 by ChatGPT (R161, R159, Phase 77, R157; in `main`) | See each package below |
| Duelist | WP-DA-05 push rework | Done 2026-11-28 (`87c9bc62`, in `main` `faedf8c9`) | Owner request 2026-11-22 |
| Duelist | WP-DA-01 triage the failing tests; WP-DA-06 mobile settings | Done 2026-11-28 (`fa19b28b`, in `main` `faedf8c9`) | 14 fixed; the 4 `duelist-levels` failures wait for WP-DA-09 |
| Duelist | WP-DA-10 Conduit bot navigation | Ready | About a third of bots still freeze in a 2-minute free-for-all (triage hand-back) |
| Duelist | WP-DA-02, WP-DA-03 rebase #361 and #346 | Approval | Small, valid fixes |
| Fantasy Battle | WP-FB-01 browser acceptance pass | First pass done 2026-11-28 (`e79e5d41`, in `main`); steps left | The WebGPU battle failed (fixed by `faef5d01`, not re-run in a browser); level-up, 13 encounters' loot and a real phone not run |
| Fantasy Battle | WP-FB-02 README; WP-FB-03 UI-level tests for Continue/Load | Done 2026-11-28 (`c4754432`, in `main`) | Directive §6 names exactly this logic |

## Fallen Sky: story, quests and world (Part A)

Ownership follows the terrain hand-off and R112 §2: the story agent supplies dialogue and location constraints; Claude owns terrain layout, cave and dungeon architecture and implementation within them; the owner approves consequential rules. None of these packages may resolve an intentional mystery (FALLEN_SKY_RECORD A4) or bind an unknown actor lifetime, chronology, reward policy or final position (R112 §6).

### WP-FS-S1 P01: the opening slice M01–M03 as an isolated low-poly blockout — In progress
- Assignment: the hub gave the R132 tickets, low-poly first, to the story session `local_cb70a7c5` on 2026-11-27, with R136's open decisions to go to the owner as one request. R136 §1 in the repo still records "No owner approval recorded"; that session records the owner's answer there.
- Original requirements: R112 §4 (P01 work order), R113 (source-to-acceptance worksheet, 11 landmark rows, 16 stages, 14 planned tests), R130 (pinned-main technical intake), R131 (preview isolation; preferred option: a separate local dev entry with ephemeral fixtures, no live stores, quest rewards or platform changes), R132 (tickets T00–T07, ten review gates, evidence template), R133 (eleven landmark groups, 20 logical asset modules), R134 (cue, character and encounter presentation, later scope), R135 (receipts and reset acceptance), R136 (approval and evidence package), R87/R87A/R87B (low-poly-first standard and prompts). Scripts `M01.md`–`M03.md`.
- Status: fully specified; not authorized: R136 §1 records "No owner approval recorded"; eight decisions D01–D08 open (FS-S-D6).
- Dependencies: the owner's T00 scope record; a runner and preview path verified (R131); no edits to the platform mode or live stores.
- Assets available: R133's module list (none produced); missing: final characters (hero at 15, the Moon Goddess, the beast), voice, music.
- Steps: T00 authorization and runner verification; then T01–T07 as R132 lists, stopping at isolated low-poly blockout and controller evidence.
- Testing: R113's 14 planned tests; R131's 16 supplemental checks; EV01–EV10 evidence rows (R136).
- Completion: the owner reviews the low-poly build (R136 milestone C) with the evidence template filled; nothing merged into the live entry.

### WP-FS-S2 Story-ID adapter in front of the quest store — Done 2026-11-27 (isolated module, not hooked up)
- Result: ChatGPT's Phase 73, PR #441 (`8ef14cb0`): `src/components/game3d/narrative/storyQuestGate.mjs` and `tests/fallenSkyStoryQuestGate.test.mjs`, reusing Phase 45's adapter unchanged. Left open: authoritative event and owner validation, full catalog approval, the legacy dispatcher; production hookup needs the owner [handoffs/20261127-chatgpt-phase73-story-id-guard.md].
- Requirement: R130 §5, R137 §1, NPC_PHASE43_RUNTIME_AUDIT risk 1 (today `useQuestStore.jsx` `acceptQuest` accepts an unknown ID when no definition resolves); Phase 45's adapter exists on the branch chain and should be reused, not rewritten.
- Dependencies: none for the isolated module; the owner for integration. Keep story IDs apart from `tr_m01…` (Three Roads), AXE and legacy IDs (Phase 62).
- Completion: unknown and disabled IDs rejected; definitions passed in by callers refused; legacy callers unchanged; tested with two characters in isolation.

### WP-FS-S3 Paired-discovery state model with the second vista — Done 2026-11-27 (disabled model)
- Result: Phase 74, PR #443 (`d25e9046`): `narrative/pairedDiscoveryModel.mjs` and `tests/fallenSkyPairedDiscoveryModel.test.mjs`; all 50 discovery IDs known and disabled unless a fixture enables them. Its fixture API is a proposal, not production authorization [handoffs/20261127-chatgpt-phase74-paired-discovery.md].
- Requirement: the owner's rule that every paired discovery needs a second vista after the relic (R66 §1, OWNER); the Phase 61 framework (PR #427, on the branch chain); R76 §4.
- Completion: works in both observation orders; a claim before the vista works; legacy "done" states marked; one claim only; safe exit independent of the vista. No terrain or reward integration.

### WP-FS-S4 Zero-optional completion test — Done 2026-11-27 (data level)
- Result: Phase 75, PR #444 (`dd24a460`): `tests/fallenSkyZeroOptionalCampaign.test.mjs` with `tests/fixtures/fallenSkyPhase75Finale.json`; the M01–M06 quest adapter is enabled only inside the fixture. Left open: scene and bridge execution, combat, XP and gear solvability [handoffs/20261127-chatgpt-phase75-zero-optional.md].
- Requirement: the main path can be finished with no optional content (R85 §2, R76 §2, Phase 42 acceptance). A data-level test over the story registry; no gameplay change.

### WP-FS-S5 Native test run of the NPC-phase branch chain — Done 2026-11-27
- Result: [handoffs/20261127-claude-npc-chain-test-run.md](handoffs/20261127-claude-npc-chain-test-run.md). 64/64 tests, validators pass (171/171), nothing mounted live, clean merge with `main` `9034ba14` and no new failing test; 19 `no-undef` lint errors in the chain's tests and scripts.
- Requirement: the owner decides whether Phases 44–67 enter `main` (FS-S-D10). Run the chain head's 9 test files and 3 validators with `node --test` in a full checkout, plus lint and the import graph (nothing mounted live), and report. On a copy they passed 64/64 and 171/171 [reader].
- Completion: a hand-back record with raw results; no merge.

### WP-FS-S6 NG+ level display formatter — Done 2026-11-27 (pure function, not shown anywhere)
- Result: Phase 76, PR #445 (`a455e6a6`): `narrative/ngPlusLevelDisplay.mjs` and `tests/fallenSkyNgPlusLevelDisplay.test.mjs`. Left open: saved level and cycle validation, the exact blue style, HUD, nameplate and character-screen use [handoffs/20261127-chatgpt-phase76-ngplus-level-display.md].
- Requirement: R76D (OWNER: earned level never resets; show the level with a blue plus, e.g. "155+"); R84 §3. A pure formatter with tests from 155+ up to the proposed 310+; no cycle state or live use until the cycle-state contract exists.

## Fallen Sky: systems (Part B)

### WP-FS-01 Skill damage curve: fix the `WEAPON_NOT_EQUIPPED` failures — Done 2026-11-28
- Result: `5249f3c7` (branch `claude/skill-curve-equip-fix-20261127`, merged at `dbe15516`): since `e12a77b8` (three weapon slots) a weapon must be equipped before it can be drawn; the test's helper now equips it. Test-only: no game code or approved numbers changed, and the flag still defaults off. 17/17 on `f5f29677` [checked].
- Requirement: the curve as approved [mem `blacksmith-combat-handoff-v2.md`; doc `docs/game3d/SKILL_DAMAGE_CURVE_20261118.md`]; tests in `tests/game3d-skill-damage-curve.test.mjs`.
- Status: code merged behind a flag; 13 pass, 4 fail on `main` [checked].
- Dependencies: none. Assets: none.
- Steps: find why the cast path's equip check disagrees with the inventory read; fix without changing the approved numbers; keep the flag off.
- Tests: the 17 tests in the file; full-suite comparison.
- Done when: 17/17 pass, no new failures, the flag still defaults off.

### WP-FS-02 Live re-check of the five merged WebGPU and performance branches — Blocked (FS-01)
- Merged by the owner's account on 2026-11-27 18:27 (FALLEN_SKY_RECORD B5). What is left is the live part: the morph-key fix on the create-character flow in a real browser, gate hops at 0 MB, slices on a cold load. Gate hops and the world need the platform mode off; the create-character check can run now.
- Done when: a hand-back record with the observed results.

### WP-FS-03 Level cap remainder — Partly done (the XP bank)
- Result so far: ChatGPT's R157, PR #465 (`38427acc`): the old-cap XP bank is in `main`, as a bank only with no payout. A level-100 save with `xpForNext: null` and XP at or beyond the next level's cost migrates; the level and XP curve are unchanged [handoffs/20261127-chatgpt-r157-old-cap-xp-bank.md]. The weapon points (R156, PR #462) are not merged, and `WEAPON_SKILL_CAP` is still 100 on `f5f29677` [checked].
- Requirement: weapon skill points continue to 155 (owner, [mem `level-cap-155-20261119.md`]); hero cap 155 already in `main` (`02e89b96`).
- Status: `WEAPON_SKILL_CAP = 100` on `main` [checked]; branch `claude/level-cap-155-20261119` (`5e98b0cd`) holds the work but predates `main`'s own cap change.
- Dependencies: FS-D3 for paying out banked XP (build the bank, leave payout off until answered).
- Steps: port the weapon-skill cap and XP bank onto `main`'s cap implementation; keep par rows 1–100 byte-identical; list the Base44 functions to deploy before the site.
- Tests: the branch's tests ported; `game3d-melee-free-aim-level-155`; `game3d/weapon-skill-points`.
- Done when: `WEAPON_SKILL_CAP` equals `AXE_LEVEL_CAP`, par rows 1–100 unchanged, tests pass.

### WP-FS-04 Effects light pool — Done 2026-11-27 (live check left)
- Result: ChatGPT's R161, PR #476 (`7b858de1`): a fixed four-light pool for companion spells, level-up and weapon summons; two shared player cast lights; lightning material reuse; a steady loot light count; one shared light for the nearest forge [handoffs/20261127-chatgpt-r161-effects-light-pool.md]. The live check (light count flat during casts) waits for a reachable world (FS-01).
- Requirement: effects dispose follow-up [mem `effects-dispose-20261119.md`]; branch `claude/effects-dispose-20261119` (`6104562a`, 4 commits not in `main`).
- Steps: rebase, open a new PR. Tests: `game3d-active-effects-dispose` and the shared-light tests. Done when: tests pass and a live check shows the light count staying flat during skill casts (once a world is reachable).

### WP-FS-05 Test triage — Ready
- Requirement: directive §15 (don't reintroduce corrected problems) and TB-03.
- Steps: sort the 129 Fallen Sky failures into real bugs, stale assertions (deleted caves, old Clone UI) and environment-only; fix real ones in their own packages; retire stale ones only after FS-D2 for the cave set; record the new baseline.
- Done when: every failing test is fixed, retired with a stated reason, or listed as blocked; the baseline number is written in BACKLOG.md.

### WP-FS-06 `duel-system-backend` harness — Done 2026-11-27, with a changed criterion
- Result: ChatGPT's R159, PR #473 (`d71ee313`, test commit `1013c03f`). The harness already stubbed `Deno.env`; the six failures were outdated client-authority expectations, so the test was aligned with the existing server-owned authority instead of being kept unchanged; 11/11 on `f5f29677` [checked]. R160 (PR #474, analysis and a test only) found that the legacy duel reads the account avatar level (cap 50), so a level-155 Fallen Sky character is not a level-155 duel combat sheet [handoffs/20261127-chatgpt-r159-duel-authority-harness.md, r160-character-authority.md].
- The six failures read `Deno.env` [reader]. Make the test run under Node with a stub environment without weakening the server rules it tests. Done when: the file passes and its assertions are unchanged.

### WP-FS-07 Platform-mode QA override — Approval (proposal, not owner-approved)
- A dev-only query override so QA can test the world without code edits, default unchanged. Touches `GameView.jsx` (a hot file). Needs the owner's OK and FS-D1 first.

### WP-FS-08 Base44 permissions review — Ready
- Requirement: AGENTS.md server security; `docs/security/BASE44_SECURITY_HARDENING_20261123.md`.
- Steps: list every Base44 function and entity with anonymous or guest write access; check each against the hardening doc; report, don't loosen anything.
- Done when: the list is empty or each entry is explained, as a doc in `docs/security/`.

### WP-FS-09 Reward authority gap map — Done 2026-11-27 (analysis only)
- Result: ChatGPT's Phase 77, PR #450 (`048ba170`): `docs/game3d/threads-of-our-pain/R139A_REWARD_AUTHORITY_GAP_MAP.md` maps all 20 R139 cases to inspected sources or to missing implementation. No exploit was confirmed, and native, CI and live runs were not done. FS-D14 is now the owner's to decide [handoffs/20261127-chatgpt-phase77-reward-authority.md].
- Requirement: R139 contract (20 planned acceptance cases), fixtures R140–R145.
- Steps: map each R139 case to the real vault, `itemUpgrade` and reward code (or "none"). No runtime changes. Done when: the map is committed beside R139 and FS-D14 can be decided on it.

## Duelist Adventure

### WP-DA-01 Triage the 24 failing Duelist tests — Done 2026-11-28
- Result: branch `claude/duelist-test-triage-20261127` (`fa19b28b`, merged at `f5a5f541`). 14 of the 18 failures on `df514c34` resolved: one game fix (the Conduit bot route fallback, `7063f145`, which needs the owner's review), one stylesheet clean-up, and twelve tests brought in line with behaviour already in `main` (each commit names the commit that changed it). The 4 `duelist-levels` failures are left to WP-DA-09 [handoffs/20261128-claude-duelist-test-triage.md].
- Source: the reader's per-file run on `main` (DUELIST_RECORD §8). Leave the four `duelist-levels` failures to WP-DA-09.
- Done when: each is fixed or updated to an owner-approved rule with the reason in the commit.

### WP-DA-02 Healer Levitate fix (#361) — Approval
- Rebase on `sim/world.mjs`; `duelist-healer-levitate-fall` must pass on current `main`; check the online snapshot shows the state.

### WP-DA-03 Startup hang guards (#346) — Approval
- 0 conflicts [reader]. Confirm it weakens no protection (the 15 s intro bypass included); build and startup tests pass.

### WP-DA-04 Announcer and clash sounds — Approval
- Branch `claude/duelist-feel-20261122` (`295c5f4a`). Open a PR; listen in game (66 announcer lines, judge voices Alice/Daniel/off, clash sounds); tests pass.

### WP-DA-05 Push rework — Done 2026-11-28
- Result: branch `claude/duelist-push-wind-20261127` (`87c9bc62`, merged at `506b9e1f`). The knockback goes from 4.5 m to 6.5 m; a knocked-down body slides along the floor; the bright flash is replaced by faint wind, streaks, wisps and dust. `PROTOCOL` is unchanged. Tested by `tests/duelist-push-slide.test.mjs` (3/3 on `f5f29677`, checked) and checked live in practice [doc `docs/duelist/KIT_FIXES_20261122.md` §push rework; claimed]. The slide plays a synthesized skid until WP-DA-04's recording is merged.
- Requirement (owner, 2026-11-22, [mem `duelist-kit-fixes-20261122.md`]): translucent visible wind with no bright flash; harder hit (knockback from 4.5 to about 6.5); the knocked-down body slides along the floor instead of the `vy 3.5` hop (`sim/world.mjs` collect); wire the recorded `pushSlide.mp3`.
- Dependencies: none (do it after WP-DA-02 if both touch `sim/world.mjs`). Assets: the sound exists.
- Tests: push tests plus a new slide test; server authority unchanged; practice live check.
- Done when: the four points are visible and audible in practice, tests pass.

### WP-DA-06 Mobile settings regression — Done 2026-11-28
- Result: in the triage branch (`c3103d14`): the glass Settings redesign owns the phone layout, so the dead overrides in `duelistMobileUI.css` were removed and the test checks the glass layout instead. Checked in the built-in pane at 667×375 and 844×390; not on a real phone [handoffs/20261128-claude-duelist-test-triage.md].
- `duelist-mobile-ui` fails on `main` (settings tabs at 667 and 844 wide); it passed 31/31 on `96c0c70a` [note `mobile-duelist-ui-20261123/HANDOVER.md`]. Done when: the test passes and live checks at 667×375 and 844×390 match the hand-over.

### WP-DA-07 Two-player online check, all four classes — Ready (verification)
- Two real clients against a local match server; every class's abilities and specials; record what the other player sees (the Execution tether and Sanctuary glow are known gaps). Done when: a written result per class.

### WP-DA-08 Docs refresh — Ready
- Bring REBUILD_PLAN, CLASSES_PLAN and COMBAT_DIRECTIONAL in line with `main`; update issue #103's status. Docs only.

### WP-DA-09 Class progression reconcile — Blocked (DA-D2, MI-DA-04)

### WP-DA-10 Conduit bot navigation — Ready
- Source: the triage hand-back's remaining problems. After the route fallback, about a third of bots still freeze in a 2-minute free-for-all on The Conduit: two fighters on a ramp at different heights, bots wedged in corners, an empty route when the target is behind a wall, two bots one above the other. A plain "steer at the target" rule was tried and dropped (bots pushed into walls). Online and offline bots share this code.
- Done when: the seeded 120 s free-for-all (seeds 1–12) shows fewer frozen bots than the hand-back's 23 of 72, with no new test failures.

## Fantasy Battle

### WP-FB-01 Browser acceptance pass — First pass done 2026-11-28; steps left
- Result: [handoffs/20261128-claude-fantasy-battle-acceptance.md](handoffs/20261128-claude-fantasy-battle-acceptance.md), the production build of `df514c34`, built-in pane hidden (no screenshots). PASS: title, save, load, continue, equipment and quest journal at 1280×720 on WebGPU and at 667×375 on `?renderer=webgl`; new game on WebGPU; the WebGL battle. FAIL: every WebGPU battle (invalid render pipelines), fixed afterwards by `faef5d01`, which is in `main` but not re-checked in a browser. NOT RUN: level-up, a new game at 667×375 or on WebGL, the cross combinations, a real phone. `npm run build` passed. It also found the hero alone at level 1 winning 1 fight in 5, on unapproved defaults (FB-D8).
- Left: re-run the WebGPU battle and the steps not run, on the current `main`.
- Requirement: every Fantasy Battle doc lists browser QA as pending; directive §6 backend-logic list.
- Steps: `npm run build`, `npm run lint`, the `fantasybattle-adventure` workflow; live run of title, new game, save, load, continue, battle, level-up, equipment, quest journal on desktop and at 667×375, with WebGPU and `?renderer=webgl`; screenshots and console logs.
- Done when: a hand-back record lists each step as PASS, FAIL or NOT RUN with evidence. No fixes in this package; failures become their own packages.

### WP-FB-02 README reconcile — Done 2026-11-28 (`c4754432`)
- `src/components/fantasybattle/README.md` still describes the duel only. Bring it in line with Sapphire Adventure and the release flag. Docs only.

### WP-FB-03 UI-level tests for Continue and Load — Done 2026-11-28 (`c4754432`)
- Result: `tests/fantasybattle-title-load-ui.test.mjs` renders the real title and Load screens from the game's own saves (valid, damaged, empty); 5/5 on `f5f29677` [checked].
- Only the state functions are tested today. Add tests that the Continue button is disabled without a valid save and that Load lists exactly the valid slots. Done when: the tests pass and fail if the gating is removed.

### WP-FB-04 Visual QA of the merged loot economy (#423) — Partly done 2026-11-28
- Result (in WP-FB-01's pass): PASS for first-victory gear on encounter 1 (`wilds_grove_01`), no grant from practice, nothing extra from finishing the quest. NOT RUN: the other 13 encounters and replay. The items show inline SVG icons with no broken images; their look was not checked.
- #423 was merged at 18:49 with CI and visual testing still pending (its body). Include it in WP-FB-01's browser pass: first-victory gear on the 14 encounters, no duplicate grant on replay or practice, the art fallbacks. Report to the owner for FB-D7.

### WP-FB-05 Original plates on every screen size — Blocked (FB-D4, MI-FB-01)
- Needs the original source files committed (or the owner's acceptance of the current hosting) before the SVG fallback can be dropped.
