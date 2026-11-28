# Centralized backlog

Baseline `main` `ab03f50a` (2026-11-27). Sections and statuses follow the owner's directive §12. Each row names its source; details are in the game records. Work packages (WP-…) are in [WORK_PACKAGES.md](WORK_PACKAGES.md); missing-information requests (MI-…) in [MISSING_INFORMATION.md](MISSING_INFORMATION.md).

## Status rules

| Status | Meaning here |
|---|---|
| Verified | On `main`; its tests pass on `ab03f50a`; a live check on the current entry path is recorded |
| Implemented | On `main`; its tests pass on `ab03f50a`; no current live check recorded |
| Testing required | On `main`, but tests fail, are missing, or the code has never been run in a browser |
| In progress | A branch or PR is being worked on |
| Awaiting approval | Built on a branch or PR; waiting for the owner's merge or decision |
| Implementation-ready | Fully specified and approved, not built |
| Blocked | Waits on another named item |
| Awaiting information | Waits on an MI request |
| Awaiting assets | Waits on art, audio, models or animation |

Rows changed on 2026-11-28 were checked against `main` `f5f29677` instead of `ab03f50a`; each such row names its commit.

Nothing in the Fallen Sky world is "Verified" today: the default entry is the 24 m platform (FS-01), so earlier live checks of world features predate it.

## Fallen Sky

| ID | Item | Status | Source | Next step |
|---|---|---|---|---|
| FS-01 | Default entry stages an empty 24 m platform (`FALLEN_SKY_PLATFORM_MODE = true`) | Testing required | PR #382; `temporaryPlatform.mjs:2` | Owner decides when it turns off (FS-D1); WP-FS-07 adds a QA override |
| FS-02 | Caves, dungeons, vortex removed ("Owner-requested clean slate") pending the story-first rebuild | Implemented | PR #381; commits `f939845d`, `8511617b`; CLAUDE_TERRAIN_HANDOFF | Rebuild per Part A (MI-FS-W1); retire stale tests (TS-02) |
| FS-03 | Hero level cap 155 | Implemented | `02e89b96`; `axePowerBudget.ts:11` | — |
| FS-04 | Weapon skill points to 155, XP bank, par rows 110–155 | Awaiting approval (the XP bank part is in `main`) | XP bank: R157, PR #465 (`38427acc`), bank only, no payout; 7/7 on `f5f29677` [checked]. Weapon points: R156, PR #462, not merged; `WEAPON_SKILL_CAP` still 100 [checked]. Par rows: branch `claude/level-cap-155-20261119` `5e98b0cd` | WP-FS-03 after FS-D3 |
| FS-05 | Gear tiers 1–155 (flag off) | Awaiting information | PR #99; GEAR_TIERS_20261119.md (8 questions) | MI-FS-P1 |
| FS-06 | Skill damage curve (flag off) | Testing required (tests pass; never run in a browser with the flag on) | PR #83; the 4 `WEAPON_NOT_EQUIPPED` failures were the test's equip helper, fixed by `5249f3c7` (in `main` 2026-11-28, test only); 17/17 on `f5f29677` [checked] | The Skill Book still shows linear numbers when the flag is on (FALLEN_SKY_RECORD B4) |
| FS-07 | Blacksmith v2 (combine, enchant, ascend, tier up) | Implemented | `d1c550ba`; 21/21 | Owner deploys the Base44 pieces (DP-03); 5 questions MI-FS-P1 |
| FS-08 | Enchantment VFX | Implemented | PR #80; 17/17 | — |
| FS-09 | Weapon feel, montages | Implemented | WEAPON_FEEL, `208aa68e` | remote-combo tests fail (TS-01) |
| FS-10 | Hold-to-charge remainder and Weapon Animation Studio | Awaiting approval | branch `claude/weapon-charge-20261119` `bbb97df7` | FS-D7 |
| FS-11 | Effects light pool | Implemented (no live check: FS-01) | R161, PR #476 (`7b858de1`, 2026-11-27, ChatGPT) rebuilt the branch's work on `main`; `game3d-active-effects-dispose` 13/13 on `f5f29677` [checked] | Live check of the light count during casts once a world is reachable |
| FS-12 | Gliding | Implemented | 12/12; owner "Yes, merge it" 2026-11-22 | Live re-check once the world returns |
| FS-13 | Swimming | Implemented | 11/11 | Live re-check once the world returns |
| FS-14 | Death, ash, nearby respawn | Implemented | 3/3, 5/5 | Live check not recorded |
| FS-15 | Companions (boosts and some activities missing) | Testing required | audit; 1 XP test fails | MI-FS-P2 |
| FS-16 | Mounts, spirituality, ascension, sets | Implemented | tests listed in the record | Mount cosmetic models AS-03 |
| FS-17 | Quest tracking and the private questbook stack (flags off) | Implemented | audit §3.11 | Needs approved quest content (Part A) |
| FS-18 | Bosses and boss difficulty | Awaiting information | audit 3.16 | MI-FS-W2 |
| FS-19 | Achievements | Awaiting information | none found | MI-FS-P3 |
| FS-20 | Multiplayer: secure guest world join | Blocked | issue #298 | SE-02 |
| FS-21 | PvP/PK rules, faction governance | Testing required | WORLD_PVP_PK…, FACTION_GOVERNANCE…; `duel-system-backend` 11/11 since R159 (PR #473) aligned it with server-owned authority [checked]; R160 (PR #474): the legacy duel reads the account avatar level (cap 50), so a level-155 hero is not a level-155 duel sheet [handoff] | Server APIs; FS-D8 |
| FS-22 | Reward authority (R137–R145 contracts and fixtures) | In progress | PR #420 and #425 merged (#425 at 18:49); fixtures only, no runtime. The R139A gap map is done (Phase 77, PR #450, analysis only); the R147 and R149 test PRs (#434, #447) are merged too [merge titles only, not reviewed] | FS-D14, to be decided on R139A |
| FS-23 | Luna mansion geometry (old map) | Superseded unless the recreated map needs it | issue #261; owner 2026-11-27 "not using the old map" | FS-D10 |
| FS-24 | War of Three Roads | Superseded: retired by the owner on 2026-11-27 ("Retire, keep tools"); the story left `src` (kept as a test sample), its quest, scene, people, monster and place tools stay behind four empty registries | merge `96e886bc` [checked in `main`]; [mem `three-empire-war-20261121.md`] | Whether the Threads builds on those tools and models: FS-D16 |
| FS-25 | Cave-mouths branch `claude/wolfveil-cave-mouths-20261123` | Awaiting approval | conflicts with the 2026-11-25 removals | Close or keep (FS-D11) |

### Fallen Sky: story, quests and world (The Threads of Our Pain)

| ID | Item | Status | Source | Next step |
|---|---|---|---|---|
| FS-S01 | Story documentation for all 125 IDs (M01–M20, D01–D50, S01–S55) | Implemented (documentation only) | R61, R85, R86 | — |
| FS-S02 | Chronology and causality decision (R111 P0) | Awaiting information | R111 §7 | MI-FS-S1 |
| FS-S03 | P01 opening slice M01–M03, isolated low-poly blockout (R132 T00–T07) | In progress (assigned by the hub 2026-11-27 to session `local_cb70a7c5`): the T00 return and the owner request are on `claude/top-p01-opening-forest-20261127` (`169c7634`, docs only); no ticket is approved until the owner fills R136's owner record | R112 §4, R113, R130–R136; [mem `threads-of-our-pain-p01.md`; branch checked] | Owner answers R136 D01–D08 (MI-FS-S6); WP-FS-S1 |
| FS-S04 | NPC-phase work, Phases 44–67 (fixtures, validators, M07–M18 intakes) | Accepted into `main` (merge `6d4afcde`, 2026-11-27 19:10, "not mounted live"); its own content stays DRAFT where it says so. Verified 2026-11-27: 64/64, validators pass, nothing mounted, no new suite failure; `0272597b` (2026-11-28) declared the missing Node globals in 11 of its story tests and scripts, and ESLint is clean on them on `f5f29677` [checked] | head PR #433 `f58c30e6` [checked ancestor of `main`]; [handoffs/20261127-claude-npc-chain-test-run.md](handoffs/20261127-claude-npc-chain-test-run.md) | FS-S-D10 answered by the merge; hooking modules up needs the owner |
| FS-S05 | Story-ID adapter rejecting unknown IDs (quest store accepts unknown IDs today) | Implemented as an isolated module, not hooked up | Phase 73, PR #441: `narrative/storyQuestGate.mjs`; test passes on `f5f29677` [checked] | Hooking it up needs the owner (WP-FS-S2) |
| FS-S06 | Paired-discovery state model with the second vista (OWNER rule R66 §1) | Implemented as a disabled model | Phase 74, PR #443: `narrative/pairedDiscoveryModel.mjs`; test passes on `f5f29677` [checked] | Terrain and reward integration (WP-FS-S3) |
| FS-S07 | "Main path completes with zero optional content" test | Implemented (data level) | Phase 75, PR #444: `tests/fallenSkyZeroOptionalCampaign.test.mjs`, passes on `f5f29677` [checked] | Scene, combat and XP solvability not covered (WP-FS-S4) |
| FS-S08 | NG+ (unlimited cycles, blue "155+", 2× enemy XP; 310 cap proposed) | Blocked | R76B–E, R84 (OWNER direction); only the display formatter exists (Phase 76, PR #445, `narrative/ngPlusLevelDisplay.mjs`, not shown anywhere) | Cycle-state contract; MI-FS-S5 |
| FS-S09 | Endings A and B, postgame continuation with gear kept | Blocked | R64A, R65, R76 (OWNER direction) | MI-FS-S2, FS-S02 |
| FS-S10 | Optional lane policies and small canon confirmations | Awaiting information | R104, R66 | MI-FS-S3 |
| FS-S11 | Encounter and progression numbers (M03 boss, M10, defence waves, NG+ curves) | Awaiting information | M03, R134, Phases 49/57/60/64 | MI-FS-S4 |
| FS-S12 | Cast: 30-NPC registry identities, families, legacy characters, reuse of Three Roads models | Awaiting information | Phase 42/43 | MI-FS-S5 |
| FS-S13 | World rebuild: region layout, connections, dimensions; checkpoint regions beyond `wolfveil`/`forest` | Awaiting information | terrain hand-off, R113–R128 | MI-FS-W1, MI-FS-S6 |
| FS-S14 | Characters, rigs, low-poly modules, reward items, voice, music for the campaign | Awaiting assets | A3 | MI-FS-S7, MI-FS-S8 |
| FS-S15 | Legacy quests (archer quests, `AXE_QUESTS`, Echo Chronicle, living Artemis) alongside the Threads | Awaiting approval | NPC_PHASE43_RUNTIME_AUDIT risk 4 | FS-S-D9 |
| FS-S16 | Source materials: latest Word Story Bible, the hourly story task and NPC design conversations | Awaiting information | R85 §8, R86 §3 | MI-00, MI-FS-S7 |

## Fantasy Battle

| ID | Item | Status | Source | Next step |
|---|---|---|---|---|
| FB-01 | Turn-based archer battle engine and puppet rig (owner engine spec) | Implemented | PR #310; 26/26 core tests | Browser check (FB-06) |
| FB-02 | 48 UI screens using the owner's approved plates directly, live controls on top | Testing required | PR #398, #403; 62/62 | Wide-only and remote hosting (FB-D4) |
| FB-03 | Main menu, guest saves (Continue only with a valid save, Load lists real saves), backups | Verified for title, save, load and continue (live check on `df514c34`); backups not checked live | `adventureState.mjs:115`; 33/33; UI-level tests `fantasybattle-title-load-ui` 5/5 (`c4754432`, in `main`) [checked]; browser pass 2026-11-28: title, save, load and continue PASS on WebGPU and WebGL [handoff `20261128-claude-fantasy-battle-acceptance.md`] | A real phone |
| FB-04 | Six-chapter campaign text, three side quests | Awaiting approval | SAPPHIRE_CAMPAIGN_FOUNDATION ("proposed") | FB-D2, MI-FB-01 |
| FB-05 | Party, equipment, accessories, bows, enhancement | Implemented | PR #399, #411 | Balance provisional (FB-D5) |
| FB-06 | Browser acceptance of `/fantasy-battle` on desktop and phone, WebGPU and WebGL | Testing required (first pass done) | 2026-11-28 pass on `df514c34`'s production build: 8 of 10 steps PASS on at least one setup; every WebGPU battle FAILED (invalid render pipelines), fixed by `faef5d01` (in `main` `faedf8c9`, WGSL test 4/4 [checked]) but not re-run in a browser; level-up NOT RUN [handoff `20261128-claude-fantasy-battle-acceptance.md`] | Re-run the WebGPU battle and the steps not run (WP-FB-01) |
| FB-07 | Loot economy and 24 world anchors | Testing required | PR #423 merged 18:49 (133/133 on the branch); browser pass 2026-11-28: encounter 1's first-victory gear, no grant from practice or the quest PASS; the other 13 encounters and replay NOT RUN | FB-D7; anchors wait for map geometry |
| FB-08 | Dungeons | Awaiting information | none designed | MI-FB-02 |
| FB-09 | Skill upgrades | Awaiting information | not designed | MI-FB-03 |
| FB-10 | Quest rewards, Last Escort quest | Awaiting information | claims are acknowledgement only | MI-FB-04 |
| FB-11 | Final character, enemy, boss art and rigs; item icons; audio | Awaiting assets | shared archer rig, SVG layers | AS-01, AS-02 |
| FB-12 | Engine-spec Studio and download panel on a test page `/fantasy-battle-studio`, with the Record WebM fix | Implemented (no browser check recorded). Owner: "Yes, keep it" (2026-11-27) and, on whether it should be public when next published, "Yes, keep it public" (2026-11-28) | branch `claude/fantasy-battle-studio-page-20261127` `7ab676cf`, merged at `2d2ba9ed` (in `main` `faedf8c9`); opens where `FANTASY_BATTLE_RELEASED` is true (`routes/fantasy-battle-studio.jsx:23`, `studioPageGate.mjs`), and that flag is `true` on `main` [checked]; `fantasybattle-studio-page` 6/6 [checked] | Public once the owner publishes (DP-01); no code change needed |
| FB-13 | Release flag on before QA | Awaiting approval | `gamesHubCatalog.mjs:13`; a first browser pass ran on 2026-11-28 (FB-06) | FB-D3 |
| FB-14 | Owner direction 2026-11-28: "play like child of light" (mechanics reference only: side-view exploration, timeline battles with cast interrupts; no use of that game's name, characters, art, music or look) | Awaiting information | FANTASY_BATTLE_RECORD §0a | MI-FB-08; part 2 stays on hold |

## Duelist Adventure

| ID | Item | Status | Source | Next step |
|---|---|---|---|---|
| DA-01 | Four classes with kits, specials, passives | Implemented | `core/classes.mjs` | Two-player online check (DA-13) |
| DA-02 | Directional combat, movement, guard, dodge, air moves | Implemented | `core/cuts.mjs`, `moves.mjs` | Per-direction look DA-D10 |
| DA-03 | Modes Duel, TDM, CTF, Football, Control, Escort; bots | Testing required | the FFA test passes since the Conduit bot route fallback (`7063f145`, in `main` `faedf8c9`; new behaviour the owner has not reviewed); about a third of bots still freeze in a 2-minute free-for-all [handoff `20261128-claude-duelist-test-triage.md`] | WP-DA-10 |
| DA-04 | Server authority, prediction, reconnect (local) | Implemented | server 23/23 | Deployment DP-02 |
| DA-05 | Class progression (two designs; 4 tests fail) | Awaiting information | `core/progression.mjs` vs [mem] | MI-DA-04 |
| DA-06 | Practice, demonstrations, story supplies | Implemented | every Duelist test file except `duelist-levels` passes on `f5f29677` [checked] | Demonstration scripts MI-DA-08 |
| DA-07 | Story missions; rewrite PR #340 | Awaiting approval | PR #340 | DA-D4 |
| DA-08 | Battle Shop Damage I–II; further tiers | Awaiting information | BATTLE_SHOP ledger | MI-DA-03 |
| DA-09 | Ranked, Custom games | Awaiting information | placeholder cards | MI-DA-01, MI-DA-02 |
| DA-10 | Public online play (guest host, capacity #333/#338) | Blocked | issue #298 | SE-02, DP-02 |
| DA-11 | Healer Levitate fix | Awaiting approval | PR #361 | WP-DA-02 |
| DA-12 | Startup hang guards (hub and Duelist) | Awaiting approval | PR #346 (0 conflicts) | WP-DA-03 |
| DA-13 | Two real players online, all four classes | Implementation-ready | never done [mem] | WP-DA-07 |
| DA-14 | Announcer and clash sounds | Awaiting approval | branch `claude/duelist-feel-20261122` `295c5f4a` | WP-DA-04 |
| DA-15 | Push rework (owner request 2026-11-22) | Verified (live practice check recorded; no two-player check) | `87c9bc62`, in `main` `faedf8c9`; `duelist-push-slide` 3/3 on `f5f29677` [checked]; live check in `docs/duelist/KIT_FIXES_20261122.md` [claimed] | The recorded `pushSlide` sound waits for WP-DA-04 |
| DA-16 | Armour optimisation | Awaiting approval | PR #384 (2 conflicts) | DA-D1 |
| DA-17 | Mobile settings regression (667/844) | Verified in the built-in pane (not on a real phone) | `c3103d14` in the triage branch (in `main` `faedf8c9`); `duelist-mobile-ui` 10/10 on `f5f29677` [checked]; pane checks at 667×375 and 844×390 [handoff `20261128-claude-duelist-test-triage.md`] | A real phone |
| DA-18 | Blend styles (#230), held jump (#232) | Awaiting approval | PR bodies name other games (DA-D9) | Reword and review origin first |

## Shared infrastructure

| ID | Item | Status | Source | Next step |
|---|---|---|---|---|
| SH-01 | Games hub (left/right menu; three tiles) | Implemented | PR #311; 14/14 | Hero PNG → WebP needs owner OK |
| SH-02 | WebGPU renderer and recovery utilities shared by the games | Implemented | `src/lib/webgpu*`; targeted suites pass; the four hub-verified fixes merged 2026-11-27 | Physical-GPU check (PF-01) |
| SH-03 | Mobile touch controls (shared component) | Implemented | `MobileTouchControls`; writes layout to localStorage on mount [mem] | — |
| SH-04 | Guest saves: Fallen Sky vault, Fantasy Battle local slots, Duelist progress file | Testing required | three separate stores | Keep separate (directive §8); no forced sharing |
| SH-05 | Project record and hand-off protocol | In progress | this folder | Owner review |

## Animation production

| ID | Item | Status | Source | Next step |
|---|---|---|---|---|
| AN-01 | Local studio: RGB MoCap → Cascadeur → Blender, first archer package (10 clips) | In progress | owner spec 2026-11-27 (`animation-studio/OWNER_SPEC_20261127.md`); session `local_49f2a304` | That session reports to the hub |
| AN-02 | Duelist clips without specified timings (strafe, backpedal, Levitate, Mend, Sanctuary, Leap Strike, Repulse, Grip, double jump, air dash, finisher variants, death variety, bow set, held grip) | Awaiting information | DUELIST_RECORD §11 | MI-DA-06 |
| AN-03 | Fallen Sky clips for approved story beats and encounters | Awaiting information | depends on Part A scenes | MI-FS-S4, MI-FS-S8 |
| AN-04 | Existing clip packs (Duelist 144, Fallen Sky weapon clips) are working, not final | Awaiting approval | directive §7, §14; the 2026-11-28 audit lists which clips are real and which are code-made placeholders ([ANIMATION_AUDIT_20261128.md](ANIMATION_AUDIT_20261128.md)) | Owner decides which get re-made in the pipeline |
| AN-05 | Fallen Sky jump take-off, airborne, landing and fall clips for both fused bodies (roadmap Phase 1, batch 1) | Verified on the temporary platform, except `Fall_Loop` (not seen live: the platform has no edge) | branch `claude/locomotion-jumps-20261128` `621054bd`, merged at `3a45ba24` (in `main` `faedf8c9`); made in Blender only; `game3d-locomotion-jump-pack` 4/4 on `f5f29677` [checked]; live check in `docs/game3d/LOCOMOTION_BATCH1_JUMPS_20261128.md` [claimed] | The roadmap's next batches |
| AN-06 | Animation audit and prioritised roadmap for all three games | Implemented (docs) | `a55b101a`, merged at `359fa047`: [ANIMATION_AUDIT_20261128.md](ANIMATION_AUDIT_20261128.md), [ANIMATION_ROADMAP_20261128.md](ANIMATION_ROADMAP_20261128.md) | Roadmap Phase 0 owner decisions |

## Asset production

| ID | Item | Status | Source | Next step |
|---|---|---|---|---|
| AS-01 | Fantasy Battle final characters, companions, enemies, bosses, item icons, audio | Awaiting assets | FANTASY_BATTLE_RECORD §6 | MI-FB-05 |
| AS-02 | Fantasy Battle approved UI plates: in use from Base44 media (47 plates + save plaque, wide screens only); source files not in git | Awaiting approval | `sapphireArt.mjs`; PR #403 | Confirm the set and whether to commit the sources (MI-FB-01, FB-D4) |
| AS-03 | Fallen Sky gear-tier looks (192), Painted Fan, armor gaps, mount cosmetics | Awaiting assets | B4 | MI-FS-P2 |
| AS-04 | Fallen Sky world art for the rebuilt regions | Awaiting information | Part A | MI-FS-W1 |
| AS-05 | Duelist guard and enemy models, armour sets, #340 voice recordings | Awaiting assets | DUELIST_RECORD §6 | MI-DA-05, MI-DA-07 |

## Missing information

All requests are in [MISSING_INFORMATION.md](MISSING_INFORMATION.md). The first, MI-00 (export the browser conversations), unblocks most of the others.

## Technical blockers

| ID | Item | Status | Source |
|---|---|---|---|
| TB-01 | Fallen Sky world-dependent systems unreachable while FS-01 is on | Blocked | PR #382 |
| TB-02 | Public multiplayer for both 3D games needs a deployed WebSocket host, `VITE_DUELIST_WS_URL` and guest identity | Blocked | issue #298 |
| TB-03 | `main` has failing tests (127 in `tests/` on `f5f29677`; 159 on `ab03f50a`), so CI cannot act as a green release gate | Testing required | TS-01 |
| TB-04 | Luna mansion source missing (`buildLakesideManor.js` always throws) | Awaiting assets | issue #261 |

## Testing

| ID | Item | Status | Source |
|---|---|---|---|
| TS-01 | Triage the failing tests on `ab03f50a` into real bugs, stale assertions (deleted caves, old Clone UI) and environment-only failures | In progress: the Duelist part is done (WP-DA-01; `duelist-levels` waits on DA-D2), and `duel-system-backend` (R159), the skill curve (`5249f3c7`) and five old-map tests (`df514c34`) were fixed; the Fallen Sky part (WP-FS-05) is open | this record's runs (below) |
| TS-02 | Retire or rewrite the tests tied to the old map: the ~45 cave/vortex/lunar suites and the old Wolfveil suites (world overhaul, forest trail, palace steps, north route, grotto, landscape bakes and design, five-area loading, live map, town bridge seams, Suigen) | Implementation-ready once the owner confirms (FS-D2) | PR #381; owner 2026-11-27 "not using the old map" |
| TS-03 | R142 SIGKILL tests assume POSIX signals; on Windows the child's signal is `null` | Implementation-ready | `tests/fixtures/r142/recovery.test.mjs:40` |
| TS-04 | Browser acceptance passes: Fantasy Battle (FB-06), Duelist two-player (DA-13), Fallen Sky once FS-01 is off | Implementation-ready | records |

**On `f5f29677` (2026-11-28), checked:** `node --test --test-reporter=tap tests/` = 3339 tests, 3211 pass, 127 fail, 1 todo (34 s). Compared with `9034ba14` by failing test name, 30 tests no longer fail and none newly fails:
- `duel-system-backend` (6): R159 (`1013c03f`, PR #473);
- 14 Duelist tests in 14 files: the triage (`fa19b28b`);
- `game3d-skill-damage-curve` (4): `5249f3c7`;
- `game3d-clone-wolfveil-cave-draw-budget` (1), `game3d-clone-wolfveil-five-area-loading` (1) and `game3d-town-bridge-park-seams` (3): `df514c34`;
- `duelist-server`'s quick-match test (1). It fails now and then when other files run at the same time (real websockets), so passing here is not a fix.

The hub's run of `tests/` plus `server/game3d/tests/` [hub message 2026-11-28; claimed] gave 4995 tests with 228 failing on `df514c34`, and 5017 tests with 210 failing on `faedf8c9`. No test that passes on `df514c34` fails on `faedf8c9`, and ESLint is clean on the 46 changed code files. Nobody has yet run `npm run build` on the merged `main` or checked it live in a browser.

`tests/` on `f5f29677`, failing tests per file: tests/duelist-levels.test.mjs (4), tests/fixtures/r142/recovery.test.mjs (2), tests/game3d-appearance-companion-live-preview.test.mjs (1), tests/game3d-appearance-sidebar-doubleclick.test.mjs (1), tests/game3d-avatar-swap-no-rebuild.test.mjs (1), tests/game3d-blacksmith-chat-connection-layout-20261120.test.mjs (3), tests/game3d-blacksmith-compact-auto-ingredients-20261120.test.mjs (3), tests/game3d-blacksmith-screenshot-layout-20261120.test.mjs (2), tests/game3d-blacksmith-two-slot-redesign-20261120.test.mjs (1), tests/game3d-book-cave-interior.test.mjs (1), tests/game3d-bow-camera-aim-spirit-bird.test.mjs (2), tests/game3d-bow-centre-mouse-aim.test.mjs (1), tests/game3d-bow-feedback-contract.test.mjs (1), tests/game3d-clean-splash-services-shortcuts-20261117.test.mjs (1), tests/game3d-clone-approved-combat-tree-ui.test.mjs (2), tests/game3d-clone-bow-movement-during-charge.test.mjs (2), tests/game3d-clone-cave-approach-landscaping-companion.test.mjs (2), tests/game3d-clone-cave-rim-and-treasure.test.mjs (3), tests/game3d-clone-cave-sealed-roof-access.test.mjs (4), tests/game3d-clone-cave-sumi-floors.test.mjs (1), tests/game3d-clone-classic-companion-nav.test.mjs (2), tests/game3d-clone-claude-combo-bridge.test.mjs (1), tests/game3d-clone-columnar-basalt.test.mjs (1), tests/game3d-clone-combo-motion.test.mjs (1), tests/game3d-clone-companion-overview-vanity-migration.test.mjs (4), tests/game3d-clone-enhancement-ownership.test.mjs (1), tests/game3d-clone-four-cave-connected-route.test.mjs (3), tests/game3d-clone-level-gear-progression.test.mjs (2), tests/game3d-clone-living-vortex-lake-dragon.test.mjs (5), tests/game3d-clone-modular-cave-canyon.test.mjs (2), tests/game3d-clone-mounts-mastery-roster.test.mjs (1), tests/game3d-clone-shared-skill-scroll-and-equip.test.mjs (2), tests/game3d-clone-skillbook-companion-95-2-isolation.test.mjs (1), tests/game3d-clone-unified-character-appearance.test.mjs (3), tests/game3d-clone-waterfall-cave-surface.test.mjs (3), tests/game3d-clone-weapon-modes-services-layout.test.mjs (1), tests/game3d-clone-wolfveil-landscape-bakes.test.mjs (1), tests/game3d-clone-wolfveil-landscape-design.test.mjs (2), tests/game3d-clone-wolfveil-live-map.test.mjs (1), tests/game3d-clone-wolfveil-sumi-caves.test.mjs (2), tests/game3d-companion-profile-specialization-20261116.test.mjs (1), tests/game3d-companion-shared-player-xp-20261116.test.mjs (1), tests/game3d-concept-d-original-image-20261117.test.mjs (1), tests/game3d-faction3-forward-motion.test.mjs (1), tests/game3d-faction3-tiger-tail-wing-rig.test.mjs (4), tests/game3d-imported-town.test.mjs (1), tests/game3d-jade-hud-outline-2027.test.mjs (4), tests/game3d-lunar-portal-overhead-crystal-removal.test.mjs (3), tests/game3d-menu-hotkeys.test.mjs (1), tests/game3d-meshy-face-draft.test.mjs (1), tests/game3d-remote-weapon-combos.test.mjs (4), tests/game3d-skillbook-acquired-and-service-shortcuts-20261119.test.mjs (1), tests/game3d-skillbook-tome.test.mjs (1), tests/game3d-suigen-map-variant.test.mjs (1), tests/game3d-suigen-town-upgrade.test.mjs (2), tests/game3d-universal-skill-layout.test.mjs (2), tests/game3d-uploaded-animation-montage.test.mjs (1), tests/game3d-vanity-hud-layout.test.mjs (2), tests/game3d-weapon-clip-pack.test.mjs (1), tests/game3d-weapon-montage.test.mjs (1), tests/game3d-wolfveil-forest-trail-landscape.test.mjs (1), tests/game3d-wolfveil-grotto-natural-zone.test.mjs (2), tests/game3d-wolfveil-north-route.test.mjs (1), tests/game3d-wolfveil-palace-approach-steps.test.mjs (1), tests/game3d-wolfveil-world-overhaul.test.mjs (1), tests/game3d/jade-soul-hud.test.mjs (4), tests/game3d/three-role-weapon-inventory.test.mjs (1), tests/games-hub-gpu-beta.test.mjs (1), tests/webgpuDrawSubmissionHostileAccessors.test.mjs (1), tests/webgpuFreshDeploymentMatrixCli.test.mjs (3).

On `0b6ca52d` (3040 tests, 2884 pass, 156 fail) the list below holds except that `game3d-three-roads-script`, `game3d-three-roads-world` and `duelist-server` now pass; no new failure appeared.

`tests/` on `ab03f50a` (3010 tests, 159 fail) — failing tests per file: tests/duel-system-backend.test.mjs (6), tests/duelist-battle-shop-reference.test.mjs (1), tests/duelist-controls.test.mjs (1), tests/duelist-idle-class-rail.test.mjs (1), tests/duelist-levels.test.mjs (4), tests/duelist-match.test.mjs (1), tests/duelist-mobile-ui.test.mjs (1), tests/duelist-online-class-entry.test.mjs (1), tests/duelist-online-server-browser.test.mjs (1), tests/duelist-play-reference.test.mjs (1), tests/duelist-server.test.mjs (1 in the full run; 23/23 when run alone), tests/duelist-special-contract-regression.test.mjs (1), tests/duelist-special-meter-invariants.test.mjs (1), tests/duelist-special-target-safety.test.mjs (1), tests/duelist-stamina-stagger-immunity.test.mjs (1), tests/duelistReferenceMenus.test.mjs (1), tests/duelistTemplateHub.test.mjs (1), tests/fixtures/r142/recovery.test.mjs (2), tests/game3d-appearance-companion-live-preview.test.mjs (1), tests/game3d-appearance-sidebar-doubleclick.test.mjs (1), tests/game3d-avatar-swap-no-rebuild.test.mjs (1), tests/game3d-blacksmith-chat-connection-layout-20261120.test.mjs (3), tests/game3d-blacksmith-compact-auto-ingredients-20261120.test.mjs (3), tests/game3d-blacksmith-screenshot-layout-20261120.test.mjs (2), tests/game3d-blacksmith-two-slot-redesign-20261120.test.mjs (1), tests/game3d-book-cave-interior.test.mjs (1), tests/game3d-bow-camera-aim-spirit-bird.test.mjs (2), tests/game3d-bow-centre-mouse-aim.test.mjs (1), tests/game3d-bow-feedback-contract.test.mjs (1), tests/game3d-clean-splash-services-shortcuts-20261117.test.mjs (1), tests/game3d-clone-approved-combat-tree-ui.test.mjs (2), tests/game3d-clone-bow-movement-during-charge.test.mjs (2), tests/game3d-clone-cave-approach-landscaping-companion.test.mjs (2), tests/game3d-clone-cave-rim-and-treasure.test.mjs (3), tests/game3d-clone-cave-sealed-roof-access.test.mjs (4), tests/game3d-clone-cave-sumi-floors.test.mjs (1), tests/game3d-clone-classic-companion-nav.test.mjs (2), tests/game3d-clone-claude-combo-bridge.test.mjs (1), tests/game3d-clone-columnar-basalt.test.mjs (1), tests/game3d-clone-combo-motion.test.mjs (1), tests/game3d-clone-companion-overview-vanity-migration.test.mjs (4), tests/game3d-clone-enhancement-ownership.test.mjs (1), tests/game3d-clone-four-cave-connected-route.test.mjs (3), tests/game3d-clone-level-gear-progression.test.mjs (2), tests/game3d-clone-living-vortex-lake-dragon.test.mjs (5), tests/game3d-clone-modular-cave-canyon.test.mjs (2), tests/game3d-clone-mounts-mastery-roster.test.mjs (1), tests/game3d-clone-shared-skill-scroll-and-equip.test.mjs (2), tests/game3d-clone-skillbook-companion-95-2-isolation.test.mjs (1), tests/game3d-clone-unified-character-appearance.test.mjs (3), tests/game3d-clone-waterfall-cave-surface.test.mjs (3), tests/game3d-clone-weapon-modes-services-layout.test.mjs (1), tests/game3d-clone-wolfveil-cave-draw-budget.test.mjs (1), tests/game3d-clone-wolfveil-five-area-loading.test.mjs (1), tests/game3d-clone-wolfveil-landscape-bakes.test.mjs (1), tests/game3d-clone-wolfveil-landscape-design.test.mjs (2), tests/game3d-clone-wolfveil-live-map.test.mjs (1), tests/game3d-clone-wolfveil-sumi-caves.test.mjs (2), tests/game3d-companion-profile-specialization-20261116.test.mjs (1), tests/game3d-companion-shared-player-xp-20261116.test.mjs (1), tests/game3d-concept-d-original-image-20261117.test.mjs (1), tests/game3d-faction3-forward-motion.test.mjs (1), tests/game3d-faction3-tiger-tail-wing-rig.test.mjs (4), tests/game3d-imported-town.test.mjs (1), tests/game3d-jade-hud-outline-2027.test.mjs (4), tests/game3d-lunar-portal-overhead-crystal-removal.test.mjs (3), tests/game3d-menu-hotkeys.test.mjs (1), tests/game3d-meshy-face-draft.test.mjs (1), tests/game3d-remote-weapon-combos.test.mjs (4), tests/game3d-skill-damage-curve.test.mjs (4), tests/game3d-skillbook-acquired-and-service-shortcuts-20261119.test.mjs (1), tests/game3d-skillbook-tome.test.mjs (1), tests/game3d-suigen-map-variant.test.mjs (1), tests/game3d-suigen-town-upgrade.test.mjs (2), tests/game3d-three-roads-script.test.mjs (1), tests/game3d-three-roads-world.test.mjs (1), tests/game3d-town-bridge-park-seams.test.mjs (3), tests/game3d-universal-skill-layout.test.mjs (2), tests/game3d-uploaded-animation-montage.test.mjs (1), tests/game3d-vanity-hud-layout.test.mjs (2), tests/game3d-weapon-clip-pack.test.mjs (1), tests/game3d-weapon-montage.test.mjs (1), tests/game3d-wolfveil-forest-trail-landscape.test.mjs (1), tests/game3d-wolfveil-grotto-natural-zone.test.mjs (2), tests/game3d-wolfveil-north-route.test.mjs (1), tests/game3d-wolfveil-palace-approach-steps.test.mjs (1), tests/game3d-wolfveil-world-overhaul.test.mjs (1), tests/game3d/jade-soul-hud.test.mjs (4), tests/game3d/three-role-weapon-inventory.test.mjs (1), tests/games-hub-gpu-beta.test.mjs (1), tests/webgpuDrawSubmissionHostileAccessors.test.mjs (1), tests/webgpuFreshDeploymentMatrixCli.test.mjs (3).

`server/game3d/tests/` and `server/game2/tests/` on `ab03f50a` (1748 tests, 88 fail; most failing files need network/TLS, PostgreSQL or market services; not investigated): server/game2/tests/fleet-match (1), matchmaking (2), public-rotation-websocket (1); server/game3d/tests/combat-native-local (1), combat108 (1), combat120 (1), combat138 (1), combat184.writefence (1), combat185.atomic (2), combat221.privateSocket (14), combat233.privateLoopback (1), combat244.twoPlayerNetwork (8), combat362.socketLease.network (5), combat392.replacement.network (5), combat413.recoveryContinuity (1), combat950.ci-release-gate (2), combat953.world-entry-trigger (3), creatorCatalogPgGuard831 (1), creatorCatalogPgReadiness835 (18), forge161 (1), handoff (2), instanceOutbox (2), mapCollision (5), market179 (2), market189 (1), market190 (1), market192 (3), ticket (2).

## Security

| ID | Item | Status | Source |
|---|---|---|---|
| SE-01 | Keep guest-only entry and server-side authorization (no login redirects, no service-role bypass) | Implemented | AGENTS.md; BASE44_SECURITY_HARDENING_20261123.md |
| SE-02 | Guest identity design for public multiplayer (abuse-resistant, server-issued) | Awaiting information | issue #298; MI-X-02 |
| SE-03 | Reward ownership and idempotency server-side (R139 contract) | In progress | R139–R145 |
| SE-04 | Review Base44 functions' anonymous-write permissions against the hardening doc | Implementation-ready | WP-FS-08 |
| SE-05 | Fantasy Battle saves are local only; stale-stamp protection not atomic across tabs | Testing required | `adventureState.mjs` |

## Performance

| ID | Item | Status | Source |
|---|---|---|---|
| PF-01 | WebGPU physical-GPU benchmark and preview/live matrix | Implementation-ready (needs a GPU and a deployment) | FRAME_METRICS_VALIDATION_20261125.md |
| PF-02 | Low-poly part 2 (0 MB gate hops, draw-call cuts) and the four WebGPU fixes (slices, late compile, morph key, device loss) | Implemented (merged 2026-11-27 18:27) | merges `032897d9`, `fe1fe750`, `64070750`, `308b49f6`, `90430f32`; live re-check once a world is reachable |
| PF-03 | Low-poly part 3 (per-area budgets for the five old areas) | Superseded: stopped 2026-11-28 because the old map is not loaded; branch `claude/low-poly-world-3-20261123` (`1b6b549f`) kept unmerged; its budgets (500 draw calls, 1.5 M triangles) carry to the new map under R87 | [mem `low-poly-world-20261122.md`; branch checked] |
| PF-04 | Duelist armour performance | Awaiting approval | PR #384 |
| PF-05 | Startup hangs (hub, Duelist) | Awaiting approval | PR #346 |

## Deployment

| ID | Item | Status | Source |
|---|---|---|---|
| DP-01 | Base44 publish of `main` | Awaiting approval | the owner publishes; no deployed state is recorded in the repo |
| DP-02 | Duelist match server hosting | Awaiting information | issue #298 |
| DP-03 | Fallen Sky Base44 functions deploy order (`Game3DItemUpgrade`, `itemUpgrade`, `characterVault`, `guestCharacterVault`, `duelSystem`) | Awaiting approval | [mem `blacksmith-combat-handoff-v2.md`] |
| DP-04 | Fantasy Battle live with `FANTASY_BATTLE_RELEASED = true` before browser QA | Awaiting approval | FB-D3 |
