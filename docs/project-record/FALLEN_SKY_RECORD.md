# Fallen Sky (Game 3D): development record

Baseline: `lordemblemblue-cloud/fallen-sky` `main` at `ab03f50a` (2026-11-27). Written 2026-11-27 by the project-recovery session. Legend and method: [README.md](README.md). Labels: [code], [doc], [PR #n], [commit], [issue #n], [mem], [note]; **checked** = opened or run on `main` for this record; **claimed** = from a PR body or note, not re-run.

Part A covers story, quests and world (the owner's first priority). Part B covers gameplay and technical systems.

## 0. Where it stands

- **The default entry is a 24 m empty platform, not the world.** `FALLEN_SKY_PLATFORM_MODE = true` [code `src/components/game3d/worlds/temporaryPlatform.mjs:2`; checked], merged with PR #382 on 2026-11-25 (commit `a8e84cf0`). With it on, `GameView.jsx` forces the `temporary-platform` region and `GameWorld3D.jsx` (`flatPlatform`) suppresses enemies, quest NPCs, bosses, companions, Three Roads, weather, the admin Quest Test menu, checkpoint resume and world sync [reader-checked `GameView.jsx:132,293,372,804–812`]. The PR calls it "temporary, reversible"; its build, browser smoke test and deployment were not verified [PR #382 body].
- **Caves, dungeons and the vortex were deleted on purpose on 2026-11-25** (PR #381, whose description calls it an "Owner-requested clean slate"; commits `f939845d` "Remove legacy dungeon and cave scene geometry and reject old entries", −3,760 lines, and `8511617b` [checked]). The story-driven terrain hand-off explains the direction: "The owner is rebuilding the world; do not restore deleted caves, dungeons or world assets automatically", and the new story supersedes conflicting War of Three Roads story and map assumptions [doc `docs/game3d/threads-of-our-pain/CLAUDE_TERRAIN_HANDOFF.md` §"Read order and ownership"; AGENTS.md 2026-11-26 section, commit `e2c05717`].
- **The old map is not used any more.** The owner said on 2026-11-27: "we are recreate the map we are not using the old map for fallen sky" [owner's words relayed by the hub session, 2026-11-27; also recorded in `docs/game3d/three-empires/OWNER_REQUESTS.md`]. Rule for this record: everything tied to the old Wolfveil map (the cave fixes, the Three Roads placements, the north route, the Luna mansion, the old-town and per-area low-poly work) is old geometry and superseded unless the new story docs place it again. Map-independent engine work (renderer, model cache, shared NPC parse, movement mechanics) is not affected.
- **The campaign "The Threads of Our Pain" exists as documentation, not as playable content** (Part A).
- **War of Three Roads: retired.** Later on 2026-11-27 the owner chose "Retire, keep tools": merge `96e886bc` [checked in `main`] removes the story from `src` (it survives as the tests' sample in `tests/fixtures/three-roads-sample`) and keeps its quest, scene, people, monster and place tools behind four empty registries [mem `three-empire-war-20261121.md`]. Before that, the owner had answered "Keep it switched off": It stays in the game as it is, off unless `?threeRoads=1` or the admin test menu; nothing more of it is built; its chapters 3–6 stay unplayable. Still open: whether its systems and assets may be reused for The Threads of Our Pain (its request 4). The same day the owner said the old map is not used and the map is being recreated [doc `docs/game3d/three-empires/OWNER_REQUESTS.md`, commits `07138159`, `554d32bc`, merged into `main` at `0b6ca52d`].
- **Update after the baseline:** at 18:27 the owner's account merged five of the seven hub-verified branches into `main`, and at 18:39 the Three Roads branch; `main` is now `0b6ca52d` (B5).
- Tests: full `tests/` run on `ab03f50a`: 3010 tests, 2851 pass, 159 fail, of which 129 are Fallen Sky files; about 45 fail because the cave geometry they test was deleted, about 45 are source-pattern tests of the older Clone UI; a few are real behaviour failures (skill damage curve, remote weapon combos, companion XP) [checked; families from the reader's run]. On `0b6ca52d`: 3040 tests, 2884 pass, 156 fail, no new failure; the two Three Roads failures are fixed by the merged branch [checked]. Server folders: 1748 tests, 1610 pass, 88 fail; most failing files are network/TLS, PostgreSQL-readiness and market suites that appear to need services absent on this machine (not investigated) [checked].

## Part A. Story, quests and world: "The Threads of Our Pain"

Sources: `docs/game3d/threads-of-our-pain/` (172 files on `main`; index `README.md`, stable IDs `R61_STABLE_ID_INDEX.md`, handbook `R85_MASTER_STORY_BIBLE_IMPLEMENTATION_HANDBOOK.md`, verification `R86_REPOSITORY_VERIFICATION_AND_DEVELOPMENT_HANDOFF.md`). These documents were written by the story agent (ChatGPT, per the terrain hand-off: "ChatGPT writes narrative, dialogue and constraints") and merged by the owner's account (#397, #400–#402, #404, #409). A merge is not a canon sign-off (R85 §1, R86 §5). Labels: **OWNER** = a repo document records an owner decision (the owner's own words are not in the repo); **DRAFT** = an agent proposal not signed off.

### A0. Where it stands

- **None of the campaign runs in the game** [checked by the reader: no chapter title or story ID in `src/`, `server/` or `base44/` except the Three Roads pledges; no `narrative/` module on `main`]. `main` holds the 172 documents, a disabled 30-NPC registry (`NPC_PHASE42_REGISTRY.json`) and synthetic reward fixtures. The default entry is the platform (§0).
- **All 125 story IDs are documented** (R86): 20 main chapters M01–M20, 50 discoveries D01–D50, 55 side adventures S01–S55. M01–M14 have their own files; the primary scripts of M15–M18 are in `R35-R38_RECOVERED_SOURCE.md` and of M19–M20 in `R39-R41_RECOVERED_SOURCE.md`; the current finale is R65 (it keeps R39's M19 scenes 1–3 and replaces the rest) [reader].
- **Update 2026-11-28: the NPC-phase chain is in `main`.** It was merged at `6d4afcde` (2026-11-27 19:10, "not mounted live") [checked: `f58c30e6` is an ancestor of `main`]. ChatGPT's Phases 73–77 followed (PRs #441, #443, #444, #445, #450: story-ID gate, paired-discovery model, zero-optional test, NG+ display formatter, R139A reward-authority gap map), all isolated modules, tests or docs. On 2026-11-28 `0272597b` declared the missing Node globals in 11 story tests and scripts. The paragraph below is the state at the baseline.
- **At the baseline, the NPC-phase implementation work was not in `main`.** Phases 44–67 (pure fixture modules for M01–M06, validators, 9 test files, M07–M18 intakes) live on a stacked chain of branches rooted at `docs/fallen-sky-npc-phase42-handoff`: PRs #405–#432 were each merged into the branch below them, not into `main`; the head, PR #433 (phase 67, M18), is open; the chain is 62 files and +7,976 lines ahead of `main` [checked: `git merge-base`, `git diff --stat`, PR base refs]. On a copy of the phase-64 branch its 9 test files pass 64/64 and the middle-campaign validator 171/171 [reader]; never run in a full checkout, CI, lint or build.
- **The biggest story blocker is the R111 P0 writer decision**: where the later original-world (age 18) scenes sit relative to the canonical M05 death, and how far the M10 and M19 links reach. Until it is answered, chronology-dependent original-world scenes from M07 to M19 cannot ship (R111 §7–8; R112 §3, waves W03–W06).
- **The old world is gone by the owner's request:** PR #381 (merged 2026-11-25) describes the cave, dungeon and vortex removal as an "Owner-requested clean slate" [checked]; the terrain hand-off says the owner is rebuilding the world and the new story supersedes conflicting War of Three Roads story and map assumptions; the owner then kept the War of Three Roads switched off (2026-11-27, §0).

### A1. Main campaign M01–M20

P15 = the preserved reality, hero aged 15; O18 = the original reality, hero aged 18. Every chapter has a primary script, editorial and voice passes, and a construction prompt; none is implemented, recorded or built [reader, R129].

| ID | Title | Reality and site (R129) | Script | Construction | State |
|---|---|---|---|---|---|
| M01 | The Journey Home | P15, forest road | `M01.md` | R87A, R113, R133 | DRAFT; P01 opening slice |
| M02 | The Broken Seal | P15, lunar clearing | `M02.md` | R87A, R113 | DRAFT; P01 |
| M03 | The Fractured Beast | P15, clearing boss and defence | `M03.md` | R113, R133–R135 | DRAFT; P01; boss phases proposed only |
| M04 | The Forgotten War | O18, city outskirts, evacuation | `M04.md` | R114 | DRAFT |
| M05 | The Silver Path | O18, evacuation road, barrier | `M05.md` | R114 | DRAFT; the death in this chapter is fixed canon |
| M06 | A Life Forgotten | P15, Wolfveil, Oath Tree | `M06.md` | R115 | DRAFT |
| M07 | The Mark of a Forgotten Age | both, twin caves | `M07.md` | R115 | DRAFT; O18 visit waits on R111 |
| M08 | The Missing History | both, archive | `M08.md` | R115 | DRAFT; R111 |
| M09 | Beneath the Silver Veil | both, sanctuary | `M09.md` | R116 | DRAFT; R111 P0 |
| M10 | Against the Divine | both, shared sanctuary (two rigs on screen) | `M10.md` | R116 | DRAFT; R111 P0 |
| M11 | Those Left Behind | O18, mining refuge | `M11.md` + R31 | R117 | DRAFT; R111 |
| M12 | A Song I Know | both, family home, mine revisit | `M12.md` | R117 | DRAFT; R111 |
| M13 | The Sanctuary That Remembers | both, Hollow Mountain monument | `M13.md` | R118 | DRAFT; R111 |
| M14 | Three Arrows | both, Wolfveil hall, three camps | `M14.md` | R118 | DRAFT; R111 |
| M15 | A War That Should Not Be | both, Gate Fields | R35-R38 §M15 | R119 | DRAFT; R111 |
| M16 | When the Forgotten Speak | both, border town | R35-R38 §M16 | R119 | DRAFT; R111; who speaks is open |
| M17 | Two Skies, One Wound | both, ridge observatory | R35-R38 §M17 | R120 | DRAFT; R111 |
| M18 | The Twelve and the Price | both, deity sanctuaries | R35-R38 §M18 | R120 | DRAFT; R111 |
| M19 | The Last Silver Thread | both, threshold ring | R39-R41 §M19 scenes 1–3 + R65 | R121 | DRAFT; R111, R65/R84 gates |
| M20 | Where Pain Becomes Peace | ending A (restored) or B (fused, about-20-year coda) | R65 | R121 | ending direction OWNER (R64A); script DRAFT |

### A2. Discoveries D01–D50 and side adventures S01–S55

Every one of the 105 has a script and a provisional terrain brief "ready for blockout review, not built or verified" (R60, R61), a provisional availability class (persistent, conditional, event-exclusive or unresolved; R77–R82), a voice selection (R108–R110) and a construction packet (R123–R128). None has been run [reader].

Exceptions to watch: 26 IDs exist only inside recovered archives (D02, D39–D50, S01, S13, S19, S25, S26, S29, S35, S36, S38, S39, S41, S43, S55), and R80 is a reconstruction, not original wording (R85 §1); the owner's second-vista rule (R66 §1) conflicts with older "vista optional" wording in D02, D25, D36 and D44–D50; lane policies await approval for S27/S29, S39, S53, S55, S34 and S09 (R104); S42 and S54 are bounded cross-reality exceptions needing R111 P1; D49 needs a flight ability (the existing halo flight helper is not proof of it, R130); D50 needs its history recorded before the player commits [reader].

### A3. The nine categories (story, quests, world)

- **Approved and implemented:** the platform staging (PR #382); the clean-slate removal of the old caves, dungeons and vortex (PR #381, owner-requested); base level cap 155 (R76C, `02e89b96`); gliding (owner "Yes, merge it"); the story documentation R01–R141 in `main` (documentation only).
- **Approved and implementation-ready:** strictly none (no story item is both explicitly approved for implementation and free of blockers). Nearest, preparing without binding unknowns: the P01 opening slice M01–M03 as an isolated low-poly blockout (fully specified in R112 §4, R113, R130–R136, R132 tickets T00–T07; R136 §1 in the repo records "No owner approval recorded"; on 2026-11-27 the hub assigned the R132 tickets, low-poly first, to the story session `local_cb70a7c5`, which sends R136's open decisions to the owner as one request: now In progress); a paired-discovery state model with the second vista (rule OWNER, R66 §1); a story-ID adapter that rejects unknown IDs in front of the quest store (R130 §5, R137 §1, Phase 43 risk 1; today `useQuestStore.jsx` `acceptQuest` accepts an unknown ID); a test that the main path completes with zero optional content (R85 §2, R76 §2). Packages WP-FS-S1 to S4.
- **Approved but partially implemented:** progression: cap 155 in code; the proposed 310 NG+ cap, the blue "155+" display (R76D, OWNER), 2× enemy XP (R76E, OWNER) and cycle state have no code [reader searched `newGamePlus|ngPlus|campaignCycle`]; since 2026-11-27 a pure "155+" display formatter exists (Phase 76, `narrative/ngPlusLevelDisplay.mjs`), shown nowhere yet. The M01–M06 fixtures (Phases 44–53) were only on the branch chain at the baseline; they are in `main` since `6d4afcde`. Reward and transaction authority: fixtures R140–R145 only.
- **Approved but blocked by missing dependencies:** R76 (gear kept and quests continue after either ending; OWNER) needs the endings, an inventory authority (R139) and verified objective availability; R76A/B/D/E (NG+ entry, display, scaling; OWNER) need the cycle-state contract (R84 §2), an enemy-stat baseline and a reward authority; R64A endings (OWNER direction) need R111, the R83 actor ledger, R65's open items and the R84 save contract; R66 second vista needs a paired-focus mechanic, terrain and an authoritative claim (`ExplorationDiscoveryMount` handles material discoveries only, R130 §5). Every live chapter is blocked by: no world (platform mode); checkpoint v1 allows only `wolfveil` and `forest` (`worldCheckpoint.mjs` `WORLD_CHECKPOINT_REGIONS`); the unknown-ID quest acceptance; no trusted reward writer; no actor mapping (29 of 30 NPC registry entries unresolved).
- **Incomplete design (do not invent):** the R111 P0 chronology and causality; open and close windows for the 105 optional IDs (R85 §8, R104); actor lifetimes and a survivor ledger (R83 §3); ending A's exploration scope, ending B's start relative to its coda, the third reality, the expansion (R64A, R65); combat numbers (M03's three boss phases, M10's defence, enemy stats, NG+ curves, rewards and drop rates); the 30 NPCs' personal quests; who speaks in M16 (R62); the hostile goddess's identity and motive and who the Twelve are (R62, R85 §2); the lullaby and the S39 song; every coordinate in the briefs (all provisional).
- **Awaiting assets:** the hero at 15 and at 18 (both rigs on screen in M10); the Moon Goddess and the unnamed goddess; the wolf and beast with its transformation (R134 C05); both families, the merchant, the historian, Lyra, Sable, Tome, Henut, Livilla, guards, civilians, the D31/S46 guardian; R133's 20 low-poly modules for P01 and R122's 20 shared families; reward items (for example D07 Miner's Gloves, D06 Courier Belt, D11 Herbalism Satchel, D22 Remnant Bracer, D37 Supply Bag; intake per R138); voice (R106–R110 are selections only); music (none).
- **Awaiting owner decisions:** A5.
- **Awaiting technical verification:** the branch chain's tests (64/64 and 171/171 on a copy only); R142 on Windows (2 of 6 fail on POSIX-signal assumptions); the planned acceptance cases never executed (R113 14, R131 16, R135 18, R137 14, R128 402 in total, the R76/R84 tables, R112 Q01–Q08); performance and security (never run, R86 §1).
- **Superseded or rejected:** earlier ending proposals replaced by R64A/R65 (the Separation/Rebirth matrix, mandatory amnesia, an inhabited village of 15-year-olds after the ending, R40's active older avatar after separation); R39's M19 scenes 4–5 and R40's M20 branch scenes (replaced by R65); R75/R75A proposals that blocked postgame quests or stripped gear (replaced by R76); R76's "every missed objective can be recovered" (replaced by R76A); a playable age-38 coda (not approved, R83 §5); the old R31 (archived for R31a); the README's historical counters (replaced by R61); the old caves, dungeons and Wolfveil map (not to be restored by default); the War of Three Roads geometry, map and quest structure (compulsory oath, faction allegiance and PvP, the 68 pledges, the attack reconstruction, the painted-Wolf origin, old coordinates; R53 l.105), while its empires' ordinary needs, the neutral fountain and several characters and place names carry into the Threads (R53) and its code stays dormant by the owner's "Keep it switched off".

### A4. Intentional mysteries versus unwritten information

Concealed from the player on purpose (keep; do not resolve): the older life stays hidden in M01–M05 and the hero takes his migrations for dreams; no cosmology is explained early, and M18 tells only what is known (R111 §3); the hostile goddess has no name for the player and the Moon Goddess cannot say who caused the invasion (R65); no deity is named early (Phase 42); the M14 assassination has no established culprit, and Hesper is investigated, never shown guilty (R85 §2, R50); at M10 the older hero does not recognize the child as himself (R111 §1); the melody and emblem the two families share stay ambiguous, with no confirmed reincarnation (R83 §5, M12); only the writer knows that the hostile goddess manipulates the war (R62).

Not yet written (missing, not mystery; R85 §1: "an unresolved writer decision is not an intentional mystery"): the original-world chronology and its mechanism (R111 P0); the origin of the shared life force (A1 recommended, not approved); the hostile goddess's identity and motive and who the Twelve are (hidden from the player and also undecided); individual fates, the third reality, ending scopes and the expansion; exact dates (about 1,000 years is illustrative only, R64A); who speaks in M16, who carved D48, who wrote S36's letters, who S20's spirit is, who the S46/D31 guardian is (R66 §4: "identity remains unresolved", unclear whether meant as a mystery); the 30 NPCs' personal quests and any new NPC names.

### A5. Pending owner and writer decisions (story)

| # | Decision | Source |
|---|---|---|
| FS-S-D1 | R111 P0: are the later original-world scenes before the M05 death in local time (candidates A, B, C); does M05 preserve an existing link or create it (A1, A2, A3); what causal reach M10 and M19 have | R111 §7, R112 §6, R129 |
| FS-S-D2 | R111 P1: how S42's voices and S54's reply work; then the exact windows for original-world opportunities | R111, R99–R104 |
| FS-S-D3 | Endings: ending A's free exploration; ending B's start relative to its coda and whether the coda is playable; the cast and survivor ledger; the third reality and the shrine of the Twelve; the expansion | R64A, R65, R83 |
| FS-S-D4 | Optional lane policies: S27/S29, S39, S53, S55, S34, S09; record or echo for D31/S46 | R66, R104 |
| FS-S-D5 | Progression: is 310 the permanent ceiling; which of gold, materials, quest XP and consumables carry into NG+; gear caps, the difficulty formula, enemy XP rounding; archiving before the finale; replaying the other ending | R76 §5, R84 §1, R75/R75A |
| FS-S-D6 | P01 scope: the owner's record under R136 §1 (accept, change or hold; owner and reviewer; permitted paths and runner; test devices) and R136 D01–D08 (runner; renderer and controller; transforms; asset rights and clips; baseline device; burst and reward tuning; quest authority; the M04 destination); whether Gemini may compare pilot previews | R136, R87B, R112 §2 |
| FS-S-D7 | Cast: Phase 42's proposed names and their mapping to existing actors (is `archer_lyra` the Lyra of the Threads); personal-quest scripts and reward stats; reuse of the eight Three Roads models (FS-D16); voice casting | Phase 42, R62 |
| FS-S-D8 | Small canon points: D26's crest distinct from M08's (README R28); the optional "R111.A" lines for M09, M10, M18–M20 | README, R111 §5 |
| FS-S-D9 | Legacy quests alongside the Threads: keep, re-dress or retire the archer quests in `questData.jsx`, `AXE_QUESTS`, the Echo Chronicle chapters (`server/game3d/privateQuestbookProjection167.mjs`), the living Artemis quest (Phase 43 risk 4 says not to delete them) | NPC_PHASE43_RUNTIME_AUDIT |
| FS-S-D10 | Merge the NPC-phase branch chain (Phases 44–67) into `main`, after a native test run. **Settled:** merged at `6d4afcde` (2026-11-27 19:10) after the native run (WP-FS-S5); hooking any module up live still needs the owner | PR #405–#433 |

These requests are written out for the owner in [MISSING_INFORMATION.md](MISSING_INFORMATION.md) group FS-S.

## Part B. Gameplay and technical systems

### B1. System status table

"Reachable" means reachable from the default entry, given the platform mode above.

| System | Status | Where | Flag | Tests on `main` | Latest decision (source) |
|---|---|---|---|---|---|
| World entry / platform staging | Implemented; testing required | `worlds/temporaryPlatform.mjs`, `GameWorld3D.jsx` `flatPlatform` | `FALLEN_SKY_PLATFORM_MODE=true` | `fallen-sky-temporary-platform` 3/3 | PR #382 "temporary, reversible" |
| Caves, dungeons, vortex | Superseded (deleted) | `dungeons/*Scene.js`, `wolfveil/WolfveilCaveSystem.js`, `VortexLakeScene.mjs` are stubs | — | ~45 stale tests fail | commits `f939845d`, `8511617b`; terrain hand-off "owner is rebuilding the world" |
| Character and equipment progression | Implemented (browser state per character; vault validates caps) | `axe/progression/*`, `axe/equipment/*`, `base44/functions/characterVault`, `guestCharacterVault` | — | not run singly | [doc `docs/game3d/SYSTEMS_AUDIT_2026-11-13.md`] |
| Level cap | Partially implemented: hero cap 155, weapon skill points still capped at 100 | `base44/shared/axePowerBudget.ts:11` `AXE_LEVEL_CAP = 155`; `base44/shared/weaponSkillPoints.mjs:12` `WEAPON_SKILL_CAP = 100` [both checked] | — | `game3d-melee-free-aim-level-155` 3/3 | commit `02e89b96` (2026-11-21); the owner's "carry on to 155" for weapon skill points exists only on unmerged branch `claude/level-cap-155-20261119` (`5e98b0cd`) [mem `level-cap-155-20261119.md`] |
| Gear tiers 1–155 | Implemented, flag off | `base44/shared/axeGearTiers.ts`, `axe/loot/AXEGearTierFlag.mjs`, `AXEGearTierLoot.mjs` | `?gearTiers=1` (localhost), `VITE_GAME3D_GEAR_TIERS`, config `enabled=false` | `game3d-gear-tiers` 12/12 | PR #99; 8 owner questions open [doc `docs/game3d/GEAR_TIERS_20261119.md`]; looks are placeholder keys |
| Weapon categories and roles | Implemented | `axe/factions/AXEFactionWeaponConfig.js`, `axe/weapons/AXEWeaponRoleSlots.js` | — | one stale UI test fails | [doc `docs/game3d/EQUIPABLE_WEAPONS.md`] |
| Weapon mastery / skill points | Partially implemented (cap 100) | `progression/weaponMasteryStore.jsx`, `skills/weaponSkillPointsStore.jsx` | — | `game3d/weapon-skill-points` 5/5 | see level cap |
| Combat core (melee, bow, hit rules, weapon feel, montages) | Implemented | `combat/*`, `player/*`, `axe/combat` | melee lock manual only | some bow and remote-combo tests fail (B6) | WEAPON_FEEL and WEAPON_MONTAGE merged; hold-to-charge and the Weapon Studio remainder on unmerged `claude/weapon-charge-20261119` (`bbb97df7`) |
| Skill damage curve | Implemented, flag off | `skills/skillDamageCurve.mjs`, `skillRegistry.jsx` | `enabled=false`, `?skillCurve=1` (dev) | `game3d-skill-damage-curve` 13 pass, 4 fail (`WEAPON_NOT_EQUIPPED`) at the baseline; **17/17 on `f5f29677`** after the test-only fix `5249f3c7` [checked] | owner approved the curve [mem `blacksmith-combat-handoff-v2.md`]; 5 balance questions open [doc `SKILL_DAMAGE_CURVE_20261118.md`] |
| Skillbooks | Implemented | `axe/services/AXECloneSkillTreeWorkspace.jsx`, `AXEAcquiredSkillsPanel.jsx` | — | several stale UI tests fail | [doc `SKILLBOOK_ACQUISITION_AND_SERVICES_HOTKEYS_20261119.md`] |
| Blacksmith v2 (combine, enchant 0–200 %, ascend, tier up; server-rolled `itemUpgrade`) | Implemented; server pieces need deployment | `axe/services/AXEBlacksmith*`, `base44/functions/itemUpgrade`, `base44/shared/axeItemEnhancement.ts` | — | `game3d-blacksmith-v2` 21/21; 3 layout test files fail | merged `d1c550ba`; the owner approved all 12 audit recommendations; 5 v2 questions open [mem `blacksmith-combat-handoff-v2.md`; doc `BLACKSMITH_V2_20261118.md`] |
| Enchantment VFX | Implemented | `enchantVfx/*` | — | `game3d-enchant-vfx` 17/17 | owner: glow follows total enhancement % [mem `enchant-vfx-decisions.md`; PR #80] |
| Ascension, equipment sets | Implemented (client) | `axe/progression/AXEAscensionSystem.js`, `axe/equipment/AXESetAscensionRules.mjs`, `AXESetBonusSystem.js` | ascension opens at level 100 | `clone-equipment-farming-ascension` 9/9 | v2 rules [doc `BLACKSMITH_V2_20261118.md`] |
| Inventory | Implemented | `equipment/inventoryData.jsx`, `axe/equipment/AXEEquipmentInventoryStore.js` | — | some UI tests fail | Crescent Moon set is DEV-only by owner order [mem `armor-pipeline-decisions.md`] |
| Companions | Partially implemented | `companion/*`, `axe/progression/AXEPetSystem.js` | — | `companion-shared-player-xp` 1 fail; several UI tests fail | audit: boosts and some activities missing [doc `SYSTEMS_AUDIT_2026-11-13.md`] |
| Mounts | Implemented (client); animation port merged | `axe/progression/AXEMountSystem.js`, `AXEMountFusionSystem.js` | — | gait tests pass | PR #92 |
| Spirituality | Implemented (client) | `axe/progression/AXEMountSpiritualSystem.js`, `AXEEquipmentAuraSystem.js` | — | not run singly | docs SPIRITUALITY_VIEWER_PREVIEW_TESTING, SET_ASCENSION_SPIRITUAL_AURA |
| Statistics, power budget, enemy scaling | Implemented to level 100 measured; 110–155 extrapolated | `base44/shared/axePowerBudget.ts`, `axe/balance/*` | — | no dedicated enemy-scaling test | par rows 1–100 must never change [mem `level-cap-155-20261119.md`] |
| Bosses | Partially implemented; unreachable | `boss/*`, private encounters in `server/game3d/` | spawn only off-platform | vortex-dragon tests fail (map removed) | no boss tuning decision recorded |
| Dungeon progression | Superseded in `main` (geometry deleted); data remnants | `axe/dungeons/AXEDungeonSystem.js` | — | cave suites fail | see §0 |
| Death and respawn | Implemented | `death/*` | one checkpoint in platform mode | death-sequence 3/3, nearby-respawn 5/5 | [doc `DEATH_RESPAWN_HANDOFF_20261120.md`]; live check not recorded |
| Rewards and loot | Client-side; server authority exists only as reference fixtures | `axe/loot/*`, `base44/shared/rewardEngine.ts`, `tests/fixtures/r140–r142` | — | R140 16/16, R141 11/11, R142 4/6 (2 SIGKILL tests fail on Windows: the child's signal is `null`, not `'SIGKILL'`) [checked] | R137–R139 contracts; PR #420 says real datastore concurrency and gameplay integration are unverified |
| Achievements | **No design or code found** | — | — | — | — |
| Quest tracking | Implemented (client) plus a private server stack, default off | `axe/quests/*`, `useQuestStore.jsx`, `base44/functions/game3dQuest*`, `server/game3d/privateQuest*` | `VITE_GAME3D_QUESTBOOK_VERIFIED_READ`, `VITE_GAME3D_QUEST_ACTION_*` | two Three Roads tests fail | [doc `SYSTEMS_AUDIT_2026-11-13.md` §3.11] |
| Multiplayer | Partially implemented; guests cannot join the public world | `network/*`, `social/*`, `base44/functions/partySystem`, `worldChat` | auth-gated join | `duel-system-backend` 6 fail | [issue #298] |
| PvP, PK, announcements | Rules and a reference authority; server not wired | `pvp/WorldPvpRules.mjs`, `server/game3d/worldPvpAuthority.mjs` | announcements off | not run singly | voluntary opt-in, both sides flag [doc `WORLD_PVP_PK_AND_ANNOUNCEMENTS_20261120.md`] |
| Faction governance | Read-only UI; server APIs missing | `axe/factions/*` | — | not run | [doc `FACTION_GOVERNANCE_HANDOFF_20261120.md`] |
| Gliding | Implemented; world-dependent | player glide module | — | `game3d-glide` 12/12 | owner "Yes, merge it" 2026-11-22 [mem `glide-20261122.md`] |
| Swimming | Implemented; world-dependent | `player/playerSwimState.mjs`, `axe/world/game3dWaterSurface.mjs` | — | `game3d-swimming` 11/11 | merged [mem `swim-20261121.md`] |
| WebGPU renderer | Implemented, default wherever the browser offers it | `src/lib/webgpuSceneRenderer.js`, `render/liveRendererRecovery.mjs` | `?renderer=webgl` forces classic | targeted suites pass; 4 matrix/CLI tests fail | owner 2026-11-21: WebGPU everywhere, no speed test [mem `webgpu-conversion-20261120.md`]; no physical-GPU benchmark [doc `docs/webgpu/FRAME_METRICS_VALIDATION_20261125.md`] |
| Low-poly world | Part 1 merged (its town merges and per-area conversions are old-map geometry: superseded); part 2's map-independent engine pieces merged 2026-11-27 (`032897d9`); part 3 (per-area budgets for the five old areas, started 2026-11-27) targets the old map | `render/lowPolyWorld.mjs`, `performance/Game3DModelCache.mjs`, `npc/sharedNpcModel.mjs` | `?hiPoly=1` | budget tests 6/6 | PR #290; [note `low-poly-world-handover.md`]; the hub decides whether part 3 moves to the new map |
| Guest cloud vault | Implemented | `base44/functions/guestCharacterVault` | public function, recovery code | not run singly | [doc `docs/game3d/GUEST_PASSWORDLESS_CLOUD_SAVE.md`] |
| Character creation, fused bodies | Implemented | `character/*`, `onboarding/avatarAssetRuntime.js` | — | not run singly | PR #291; [mem `adam-fused-body-repair.md`] |

### B2. Approved and implemented

Blacksmith v2 core; enchantment VFX; gear-tier data, loot and tier-up (flag off); skill damage curve (flag off); weapon feel and montages; death, ash and nearby respawn; gliding; swimming; the WebGPU conversion with device-loss policy and the late-compile fix; low-poly world part 1; manual-only melee lock and hero level cap 155; the Base44 security hardening [doc `docs/security/BASE44_SECURITY_HARDENING_20261123.md`; not re-tested]; the Adam fused-body repair, player/mount animation port (#92) and effects dispose (#93). Evidence per row in B1.

### B3. Approved and implementation-ready

- Weapon skill points to 155, the XP bank and par rows 110–155 from `claude/level-cap-155-20261119` (`5e98b0cd`, owner "carry on to 155"); needs a reconcile with `main`'s own cap change `02e89b96` first [mem; checked `WEAPON_SKILL_CAP = 100`].
- Effects light pool: `claude/effects-dispose-20261119` (`6104562a`, 4 commits not in `main`) needed a new PR [mem `effects-dispose-20261119.md`]. **Done 2026-11-27:** ChatGPT's R161 (PR #476) rebuilt it on `main`; `game3d-active-effects-dispose` 13/13 on `f5f29677` [checked]; live check still to do (FS-01).
- Weapon charge and Weapon Animation Studio remainder: `claude/weapon-charge-20261119` (`bbb97df7`, 1 commit) [mem `weapon-charge-studio-20261119.md`].

### B4. Partially implemented, blocked, assets, verification

- **Partially implemented:** skill curve (Skill Book still shows linear numbers when on); gear tiers (192 placeholder looks); companions and mounts (hands/heart/mind/feet boosts missing, mount cosmetic sets need models); faction governance (server APIs absent); PvP (no trusted server zone config); quest/questbook server stack (built, flags off).
- **Blocked by dependencies:** every world-dependent system while the platform mode is on; Three Roads band 3 (needs caves that were deleted) [note `three-empires/band3-needs-from-the-caves.md`]; blacksmith server Combine/Ascend (the owner deploys `Game3DItemUpgrade`, `itemUpgrade` and `characterVault` together); secure guest multiplayer (guest identity design) [issue #298]; real reward authority (R140–R145 are isolated fixtures).
- **Awaiting assets:** gear-tier models and icons; the Painted Fan weapon model; armor gaps (Nightscale/Frostwarden chests and pants show skin; Adam has no Moonfeather; Crescent Moon pieces unplaced) [mem `armor-pipeline-decisions.md`]; real world art for the recreated map. (The original Luna mansion geometry, issue #261, belongs to the old map: superseded unless the new story places it.)
- **Awaiting technical verification:** platform-mode build, smoke test and deploy; gliding and swimming on the female body, two clients and the owner's device; WebGPU physical-GPU benchmark and the preview/live matrix; the black-world race after character creation (fix candidate `claude/webgpu-morph-texture-key-20261123`, not in `main`) [note `webgpu-black-world-avatar-dispose-20261123.md`]; R142 SIGKILL tests on Windows; issue #260 (`usedTimes` crash, cause unproven); the death/respawn live check.

### B5. The seven hub-verified branches

At the baseline (`ab03f50a`) none was merged: all were based on `96c0c70a` (2026-11-23), about 1,128 commits behind, with a clean `git merge-tree` for six [reader-checked]. During this recovery the owner's account merged six of them [checked: `git merge-base --is-ancestor` against `origin/main` `0b6ca52d`].

| Branch | Head | What it does | State on `main` `0b6ca52d` |
|---|---|---|---|
| `claude/webgpu-first-load-slices-20261123` | `62109065` | cold-load shaders built in slices; shared morph geometry kept on body swap | merged 18:27 (`fe1fe750`) |
| `claude/webgpu-late-compile-stuck-only-20261123` | `9eda0d3f` | background compile only when the GPU is stuck, a few per frame | merged 18:27 (`64070750`) |
| `claude/webgpu-morph-texture-key-20261123` | `70710779` | one built shader per shape-key geometry (fixes the destroyed morph texture behind the black world) | merged 18:27 (`308b49f6`) |
| `claude/low-poly-world-2-20261123` | `60b95b5a` | model-bytes cache (0 MB per gate hop), shared archer NPC parse, zombie draw groups 205 → 2, 150 s hop watchdog | merged 18:27 (`032897d9`) |
| `claude/webgpu-device-loss-recovery-20261123` | `cfeead4d` | recover from a lost WebGPU device while the GPU process restarts | merged 18:27 (`90430f32`) |
| `claude/three-empire-war-20261121` | `3e772b07` | band 3 hall follows its mouth; tests in line with `main`; "on hold" and the owner's answer | merged 18:39 (`0b6ca52d`, commit message: "Approved by the owner in session on 2026-11-27. No game behaviour changes"); Three Roads stays switched off and its placements are old-map |
| `claude/wolfveil-cave-mouths-20261123` | `7754c5dd` | cave mouths travel in and out | **not merged**; conflicts (`WolfveilCaveAccessPlan.mjs`, `WolfveilDungeonPortals.js`); it re-grades the paths `main` removed on 2026-11-25, so merging it would bring back what the rebuild took out: superseded unless the owner says caves return (FS-D2) |

The merged five still need their live re-checks once a world is reachable (gate hops and shader warm-up matter only off the platform).

### B6. Known bugs and open PRs

- Failing behaviour tests at the baseline: skill-curve cast path returns `WEAPON_NOT_EQUIPPED` (4, fixed 2026-11-28 by `5249f3c7`, test only); `duel-system-backend` (6; fixed 2026-11-27 by R159, which aligned it with server-owned authority); still failing on `f5f29677` [checked]: remote weapon combos (4) and weapon montage (1); `companion-shared-player-xp` (1); Faction 3 wing rig (5); `games-hub-gpu-beta` (1). `WEAPON_SKILL_CAP` 100 versus hero cap 155. The full per-file list is in [BACKLOG.md](BACKLOG.md) §Testing.
- Open PRs: #425 (R143–R145 fixtures; evidence only); #320 (admin Quest Test teleport for Three Roads; partly landed, disabled by the platform mode); #252 (frame-count guard already in `main`: likely superseded); #73 (old weapon summon port, 4 conflicts: stale); #44 and #3 (cave work: superseded by the deletion).
- Issues: #298 (secure guest multiplayer), #261 (Luna mansion source absent), #260 (`usedTimes` crash), #71 (legacy migration; 21 of 94 Crescent Moon changes never migrated [mem `fallen-sky-migration.md`]).

### B7. Awaiting owner decisions (systems)

| # | Decision | Source |
|---|---|---|
| FS-D1 | When the platform mode switches off, and with which world | PR #382; `temporaryPlatform.mjs` |
| FS-D2 | The removal itself was owner-requested ("Owner-requested clean slate", PR #381): confirm that the stale cave tests, the cave-mouths branch and PRs #3 and #44 can be retired | PR #381; commits `f939845d`, `8511617b`; terrain hand-off |
| FS-D3 | Level cap remainder: merge weapon skill points to 155 and the XP bank; pay out banked XP or not; should ascension open above 100 | [mem `level-cap-155-20261119.md`] |
| FS-D4 | Gear tiers: the 8 questions in `GEAR_TIERS_20261119.md`, then whether to turn the flag on | [doc] |
| FS-D5 | Skill damage curve: the 5 questions in `SKILL_DAMAGE_CURVE_20261118.md`, then whether to turn it on | [doc] |
| FS-D6 | Blacksmith v2 open choices (Mythic enchant cap 120 %, Stabilizer protecting failures, armor perk +4 defense, Chosen's Evolution-Stone path, other rarities' ascension) and the deploy order of the Base44 pieces | [mem `blacksmith-combat-handoff-v2.md`] |
| FS-D7 | Weapon charge: full-mastery hold double damage as a passive, PvE only; merge the Weapon Studio branch | [mem `weapon-charge-studio-20261119.md`] |
| FS-D8 | Audit decisions D1–D5: backend target, Halo/wings economy, cape ladder, faction names and maps, ascension requirement set | [doc `SYSTEMS_AUDIT_2026-11-13.md`] |
| FS-D9 | Guest multiplayer design: server-issued guest identity; guest progress versus account progression | [issue #298] |
| FS-D10 | Luna mansion (old map): close issue #261, or does the recreated map need it | [issue #261] |
| FS-D11 | The cave-mouths branch (the only one of the seven still unmerged): close it, or keep it for a cave return | B5 |
| FS-D16 | War of Three Roads request 4: may its systems (ordered-step quests, staging, waves, the eight modelled people, the four low-poly kits, the voice pipeline) be reused for The Threads of Our Pain, and are the Sable Vey and Hesper models acceptable for the Threads' Sable and Hesper | [doc `docs/game3d/three-empires/OWNER_REQUESTS.md`] |
| FS-D12 | WebGPU default-on without a speed test: keep; is physical-GPU QA required before deploy | [mem `webgpu-conversion-20261120.md`] |
| FS-D13 | Crescent Moon stays DEV-only; real armor sets and art for the gear tiers | [mem `armor-pipeline-decisions.md`] |
| FS-D14 | Reward authority: do the R140–R145 fixtures drive a real server implementation, and on which datastore | PR #420, #425 |
| FS-D15 | Achievements: none designed; wanted? | — |
