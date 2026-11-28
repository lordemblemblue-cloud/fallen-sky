# Work packages

Packages from the 2026-11-27 baseline (`main` `ab03f50a`), in the format of the owner's directive §10. **Ready** packages can start now; **Approval** packages are finished or nearly finished work that waits for the owner; **Blocked** packages name the missing item. The hub session assigns them to the specialised sessions; one package per branch and PR; follow [AGENT_HANDOFF_PROTOCOL.md](AGENT_HANDOFF_PROTOCOL.md).

Every package keeps the other two games and unrelated pages untouched, runs `npm run lint`, the package's tests and the full suite compared with the `ab03f50a` baseline (159 failing in `tests/`), and ends with a hand-back record.

## Top packages per game (for the hub)

| Game | Package | Kind | Why first |
|---|---|---|---|
| Fallen Sky | WP-FS-S1 P01 opening slice M01–M03, isolated low-poly blockout | In progress (assigned by the hub on 2026-11-27 to session `local_cb70a7c5`) | The owner's first priority is the story; P01 is the only slice with a full source-to-acceptance chain |
| Fallen Sky | WP-FS-S2 story-ID adapter; WP-FS-S3 paired-discovery state model | Ready (isolated, disabled modules) | Story-side foundations that bind no unknown content |
| Fallen Sky | WP-FS-S5 native test run of the NPC-phase branch chain | Done 2026-11-27 (see its hand-back) | 62 files of story work wait outside `main` |
| Fallen Sky | WP-FS-01 skill damage curve failures | Ready | A real behaviour failure on `main` |
| Duelist | WP-DA-05 push rework | Ready | Owner request 2026-11-22, fully specified, not built |
| Duelist | WP-DA-01 triage the 24 failing tests | Ready | Keeps corrected problems from coming back |
| Duelist | WP-DA-02, WP-DA-03 rebase #361 and #346 | Approval | Small, valid fixes |
| Fantasy Battle | WP-FB-01 browser acceptance pass | Ready | The game is live (`FANTASY_BATTLE_RELEASED = true`) with no browser evidence |
| Fantasy Battle | WP-FB-03 UI-level tests for Continue/Load | Ready | Directive §6 names exactly this logic |

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

### WP-FS-S2 Story-ID adapter in front of the quest store — Ready (isolated module)
- Requirement: R130 §5, R137 §1, NPC_PHASE43_RUNTIME_AUDIT risk 1 (today `useQuestStore.jsx` `acceptQuest` accepts an unknown ID when no definition resolves); Phase 45's adapter exists on the branch chain and should be reused, not rewritten.
- Dependencies: none for the isolated module; the owner for integration. Keep story IDs apart from `tr_m01…` (Three Roads), AXE and legacy IDs (Phase 62).
- Completion: unknown and disabled IDs rejected; definitions passed in by callers refused; legacy callers unchanged; tested with two characters in isolation.

### WP-FS-S3 Paired-discovery state model with the second vista — Ready (disabled model)
- Requirement: the owner's rule that every paired discovery needs a second vista after the relic (R66 §1, OWNER); the Phase 61 framework (PR #427, on the branch chain); R76 §4.
- Completion: works in both observation orders; a claim before the vista works; legacy "done" states marked; one claim only; safe exit independent of the vista. No terrain or reward integration.

### WP-FS-S4 Zero-optional completion test — Ready
- Requirement: the main path can be finished with no optional content (R85 §2, R76 §2, Phase 42 acceptance). A data-level test over the story registry; no gameplay change.

### WP-FS-S5 Native test run of the NPC-phase branch chain — Done 2026-11-27
- Result: [handoffs/20261127-claude-npc-chain-test-run.md](handoffs/20261127-claude-npc-chain-test-run.md). 64/64 tests, validators pass (171/171), nothing mounted live, clean merge with `main` `9034ba14` and no new failing test; 19 `no-undef` lint errors in the chain's tests and scripts.
- Requirement: the owner decides whether Phases 44–67 enter `main` (FS-S-D10). Run the chain head's 9 test files and 3 validators with `node --test` in a full checkout, plus lint and the import graph (nothing mounted live), and report. On a copy they passed 64/64 and 171/171 [reader].
- Completion: a hand-back record with raw results; no merge.

### WP-FS-S6 NG+ level display formatter — Ready (pure function)
- Requirement: R76D (OWNER: earned level never resets; show the level with a blue plus, e.g. "155+"); R84 §3. A pure formatter with tests from 155+ up to the proposed 310+; no cycle state or live use until the cycle-state contract exists.

## Fallen Sky: systems (Part B)

### WP-FS-01 Skill damage curve: fix the `WEAPON_NOT_EQUIPPED` failures — Ready
- Requirement: the curve as approved [mem `blacksmith-combat-handoff-v2.md`; doc `docs/game3d/SKILL_DAMAGE_CURVE_20261118.md`]; tests in `tests/game3d-skill-damage-curve.test.mjs`.
- Status: code merged behind a flag; 13 pass, 4 fail on `main` [checked].
- Dependencies: none. Assets: none.
- Steps: find why the cast path's equip check disagrees with the inventory read; fix without changing the approved numbers; keep the flag off.
- Tests: the 17 tests in the file; full-suite comparison.
- Done when: 17/17 pass, no new failures, the flag still defaults off.

### WP-FS-02 Live re-check of the five merged WebGPU and performance branches — Blocked (FS-01)
- Merged by the owner's account on 2026-11-27 18:27 (FALLEN_SKY_RECORD B5). What is left is the live part: the morph-key fix on the create-character flow in a real browser, gate hops at 0 MB, slices on a cold load. Gate hops and the world need the platform mode off; the create-character check can run now.
- Done when: a hand-back record with the observed results.

### WP-FS-03 Level cap remainder — Ready for the approved part
- Requirement: weapon skill points continue to 155 (owner, [mem `level-cap-155-20261119.md`]); hero cap 155 already in `main` (`02e89b96`).
- Status: `WEAPON_SKILL_CAP = 100` on `main` [checked]; branch `claude/level-cap-155-20261119` (`5e98b0cd`) holds the work but predates `main`'s own cap change.
- Dependencies: FS-D3 for paying out banked XP (build the bank, leave payout off until answered).
- Steps: port the weapon-skill cap and XP bank onto `main`'s cap implementation; keep par rows 1–100 byte-identical; list the Base44 functions to deploy before the site.
- Tests: the branch's tests ported; `game3d-melee-free-aim-level-155`; `game3d/weapon-skill-points`.
- Done when: `WEAPON_SKILL_CAP` equals `AXE_LEVEL_CAP`, par rows 1–100 unchanged, tests pass.

### WP-FS-04 Effects light pool — Ready
- Requirement: effects dispose follow-up [mem `effects-dispose-20261119.md`]; branch `claude/effects-dispose-20261119` (`6104562a`, 4 commits not in `main`).
- Steps: rebase, open a new PR. Tests: `game3d-active-effects-dispose` and the shared-light tests. Done when: tests pass and a live check shows the light count staying flat during skill casts (once a world is reachable).

### WP-FS-05 Test triage — Ready
- Requirement: directive §15 (don't reintroduce corrected problems) and TB-03.
- Steps: sort the 129 Fallen Sky failures into real bugs, stale assertions (deleted caves, old Clone UI) and environment-only; fix real ones in their own packages; retire stale ones only after FS-D2 for the cave set; record the new baseline.
- Done when: every failing test is fixed, retired with a stated reason, or listed as blocked; the baseline number is written in BACKLOG.md.

### WP-FS-06 `duel-system-backend` harness — Ready
- The six failures read `Deno.env` [reader]. Make the test run under Node with a stub environment without weakening the server rules it tests. Done when: the file passes and its assertions are unchanged.

### WP-FS-07 Platform-mode QA override — Approval (proposal, not owner-approved)
- A dev-only query override so QA can test the world without code edits, default unchanged. Touches `GameView.jsx` (a hot file). Needs the owner's OK and FS-D1 first.

### WP-FS-08 Base44 permissions review — Ready
- Requirement: AGENTS.md server security; `docs/security/BASE44_SECURITY_HARDENING_20261123.md`.
- Steps: list every Base44 function and entity with anonymous or guest write access; check each against the hardening doc; report, don't loosen anything.
- Done when: the list is empty or each entry is explained, as a doc in `docs/security/`.

### WP-FS-09 Reward authority gap map — Ready (analysis only)
- Requirement: R139 contract (20 planned acceptance cases), fixtures R140–R145.
- Steps: map each R139 case to the real vault, `itemUpgrade` and reward code (or "none"). No runtime changes. Done when: the map is committed beside R139 and FS-D14 can be decided on it.

## Duelist Adventure

### WP-DA-01 Triage the 24 failing Duelist tests — Ready
- Source: the reader's per-file run on `main` (DUELIST_RECORD §8). Leave the four `duelist-levels` failures to WP-DA-09.
- Done when: each is fixed or updated to an owner-approved rule with the reason in the commit.

### WP-DA-02 Healer Levitate fix (#361) — Approval
- Rebase on `sim/world.mjs`; `duelist-healer-levitate-fall` must pass on current `main`; check the online snapshot shows the state.

### WP-DA-03 Startup hang guards (#346) — Approval
- 0 conflicts [reader]. Confirm it weakens no protection (the 15 s intro bypass included); build and startup tests pass.

### WP-DA-04 Announcer and clash sounds — Approval
- Branch `claude/duelist-feel-20261122` (`295c5f4a`). Open a PR; listen in game (66 announcer lines, judge voices Alice/Daniel/off, clash sounds); tests pass.

### WP-DA-05 Push rework — Ready
- Requirement (owner, 2026-11-22, [mem `duelist-kit-fixes-20261122.md`]): translucent visible wind with no bright flash; harder hit (knockback from 4.5 to about 6.5); the knocked-down body slides along the floor instead of the `vy 3.5` hop (`sim/world.mjs` collect); wire the recorded `pushSlide.mp3`.
- Dependencies: none (do it after WP-DA-02 if both touch `sim/world.mjs`). Assets: the sound exists.
- Tests: push tests plus a new slide test; server authority unchanged; practice live check.
- Done when: the four points are visible and audible in practice, tests pass.

### WP-DA-06 Mobile settings regression — Ready
- `duelist-mobile-ui` fails on `main` (settings tabs at 667 and 844 wide); it passed 31/31 on `96c0c70a` [note `mobile-duelist-ui-20261123/HANDOVER.md`]. Done when: the test passes and live checks at 667×375 and 844×390 match the hand-over.

### WP-DA-07 Two-player online check, all four classes — Ready (verification)
- Two real clients against a local match server; every class's abilities and specials; record what the other player sees (the Execution tether and Sanctuary glow are known gaps). Done when: a written result per class.

### WP-DA-08 Docs refresh — Ready
- Bring REBUILD_PLAN, CLASSES_PLAN and COMBAT_DIRECTIONAL in line with `main`; update issue #103's status. Docs only.

### WP-DA-09 Class progression reconcile — Blocked (DA-D2, MI-DA-04)

## Fantasy Battle

### WP-FB-01 Browser acceptance pass — Ready (verification)
- Requirement: every Fantasy Battle doc lists browser QA as pending; directive §6 backend-logic list.
- Steps: `npm run build`, `npm run lint`, the `fantasybattle-adventure` workflow; live run of title, new game, save, load, continue, battle, level-up, equipment, quest journal on desktop and at 667×375, with WebGPU and `?renderer=webgl`; screenshots and console logs.
- Done when: a hand-back record lists each step as PASS, FAIL or NOT RUN with evidence. No fixes in this package; failures become their own packages.

### WP-FB-02 README reconcile — Ready
- `src/components/fantasybattle/README.md` still describes the duel only. Bring it in line with Sapphire Adventure and the release flag. Docs only.

### WP-FB-03 UI-level tests for Continue and Load — Ready
- Only the state functions are tested today. Add tests that the Continue button is disabled without a valid save and that Load lists exactly the valid slots. Done when: the tests pass and fail if the gating is removed.

### WP-FB-04 Visual QA of the merged loot economy (#423) — Ready (verification)
- #423 was merged at 18:49 with CI and visual testing still pending (its body). Include it in WP-FB-01's browser pass: first-victory gear on the 14 encounters, no duplicate grant on replay or practice, the art fallbacks. Report to the owner for FB-D7.

### WP-FB-05 Original plates on every screen size — Blocked (FB-D4, MI-FB-01)
- Needs the original source files committed (or the owner's acceptance of the current hosting) before the SVG fallback can be dropped.
