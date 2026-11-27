# Fallen Sky (Game 3D): development record

Baseline: `lordemblemblue-cloud/fallen-sky` `main` at `ab03f50a` (2026-11-27). Written 2026-11-27 by the project-recovery session. Legend and method: [README.md](README.md). Labels: [code], [doc], [PR #n], [commit], [issue #n], [mem], [note]; **checked** = opened or run on `main` for this record; **claimed** = from a PR body or note, not re-run.

Part A covers story, quests and world (the owner's first priority). Part B covers gameplay and technical systems.

## 0. Where it stands

- **The default entry is a 24 m empty platform, not the world.** `FALLEN_SKY_PLATFORM_MODE = true` [code `src/components/game3d/worlds/temporaryPlatform.mjs:2`; checked], merged with PR #382 on 2026-11-25 (commit `a8e84cf0`). With it on, `GameView.jsx` forces the `temporary-platform` region and `GameWorld3D.jsx` (`flatPlatform`) suppresses enemies, quest NPCs, bosses, companions, Three Roads, weather, the admin Quest Test menu, checkpoint resume and world sync [reader-checked `GameView.jsx:132,293,372,804–812`]. The PR calls it "temporary, reversible"; its build, browser smoke test and deployment were not verified [PR #382 body].
- **Caves, dungeons and the vortex were deleted on purpose on 2026-11-25** (commits `f939845d` "Remove legacy dungeon and cave scene geometry and reject old entries", −3,760 lines, and `8511617b` [checked]). The story-driven terrain hand-off explains the direction: "The owner is rebuilding the world; do not restore deleted caves, dungeons or world assets automatically", and the new story supersedes conflicting War of Three Roads story and map assumptions [doc `docs/game3d/threads-of-our-pain/CLAUDE_TERRAIN_HANDOFF.md` §"Read order and ownership"; AGENTS.md 2026-11-26 section, commit `e2c05717`].
- **The campaign "The Threads of Our Pain" exists as documentation, not as playable content** (Part A).
- Tests: full `tests/` run on `ab03f50a`: 3010 tests, 2851 pass, 159 fail, of which 129 are Fallen Sky files; about 45 fail because the cave geometry they test was deleted, about 45 are source-pattern tests of the older Clone UI; a few are real behaviour failures (skill damage curve, remote weapon combos, companion XP, two Three Roads tests) [checked; families from the reader's run]. Server folders: 1748 tests, 1610 pass, 88 fail; most failing files are network/TLS, PostgreSQL-readiness and market suites that appear to need services absent on this machine (not investigated) [checked].

<!-- PART A (story, quests, world) is inserted below. -->

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
| Skill damage curve | Implemented, flag off | `skills/skillDamageCurve.mjs`, `skillRegistry.jsx` | `enabled=false`, `?skillCurve=1` (dev) | `game3d-skill-damage-curve` 13 pass, **4 fail** (`WEAPON_NOT_EQUIPPED`) | owner approved the curve [mem `blacksmith-combat-handoff-v2.md`]; 5 balance questions open [doc `SKILL_DAMAGE_CURVE_20261118.md`] |
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
| Low-poly world | Part 1 merged and default; part 2 on a branch; part 3 started 2026-11-27 | `render/lowPolyWorld.mjs` | `?hiPoly=1` | budget tests 6/6 | PR #290; [note `low-poly-world-handover.md`] |
| Guest cloud vault | Implemented | `base44/functions/guestCharacterVault` | public function, recovery code | not run singly | [doc `docs/game3d/GUEST_PASSWORDLESS_CLOUD_SAVE.md`] |
| Character creation, fused bodies | Implemented | `character/*`, `onboarding/avatarAssetRuntime.js` | — | not run singly | PR #291; [mem `adam-fused-body-repair.md`] |

### B2. Approved and implemented

Blacksmith v2 core; enchantment VFX; gear-tier data, loot and tier-up (flag off); skill damage curve (flag off); weapon feel and montages; death, ash and nearby respawn; gliding; swimming; the WebGPU conversion with device-loss policy and the late-compile fix; low-poly world part 1; manual-only melee lock and hero level cap 155; the Base44 security hardening [doc `docs/security/BASE44_SECURITY_HARDENING_20261123.md`; not re-tested]; the Adam fused-body repair, player/mount animation port (#92) and effects dispose (#93). Evidence per row in B1.

### B3. Approved and implementation-ready

- Weapon skill points to 155, the XP bank and par rows 110–155 from `claude/level-cap-155-20261119` (`5e98b0cd`, owner "carry on to 155"); needs a reconcile with `main`'s own cap change `02e89b96` first [mem; checked `WEAPON_SKILL_CAP = 100`].
- The hub-verified WebGPU branches and low-poly part 2 (B5): approved and verified, waiting for the owner's merge.
- Effects light pool: `claude/effects-dispose-20261119` (`6104562a`, 4 commits not in `main`) needs a new PR [mem `effects-dispose-20261119.md`].
- Weapon charge and Weapon Animation Studio remainder: `claude/weapon-charge-20261119` (`bbb97df7`, 1 commit) [mem `weapon-charge-studio-20261119.md`].

### B4. Partially implemented, blocked, assets, verification

- **Partially implemented:** skill curve (Skill Book still shows linear numbers when on); gear tiers (192 placeholder looks); companions and mounts (hands/heart/mind/feet boosts missing, mount cosmetic sets need models); faction governance (server APIs absent); PvP (no trusted server zone config); quest/questbook server stack (built, flags off).
- **Blocked by dependencies:** every world-dependent system while the platform mode is on; Three Roads band 3 (needs caves that were deleted) [note `three-empires/band3-needs-from-the-caves.md`]; blacksmith server Combine/Ascend (the owner deploys `Game3DItemUpgrade`, `itemUpgrade` and `characterVault` together); secure guest multiplayer (guest identity design) [issue #298]; real reward authority (R140–R145 are isolated fixtures).
- **Awaiting assets:** gear-tier models and icons; the Painted Fan weapon model; armor gaps (Nightscale/Frostwarden chests and pants show skin; Adam has no Moonfeather; Crescent Moon pieces unplaced) [mem `armor-pipeline-decisions.md`]; the original Luna mansion geometry (`buildLakesideManor.js` always throws) [issue #261]; real world art to replace the platform.
- **Awaiting technical verification:** platform-mode build, smoke test and deploy; gliding and swimming on the female body, two clients and the owner's device; WebGPU physical-GPU benchmark and the preview/live matrix; the black-world race after character creation (fix candidate `claude/webgpu-morph-texture-key-20261123`, not in `main`) [note `webgpu-black-world-avatar-dispose-20261123.md`]; R142 SIGKILL tests on Windows; issue #260 (`usedTimes` crash, cause unproven); the death/respawn live check.

### B5. The seven hub-verified branches (approved and verified by the hub, not merged)

All are based on `96c0c70a` (2026-11-23), 1,128 commits behind `main`; none is an ancestor of `main`; `git merge-tree` is clean for six [reader-checked]. Each needs a fresh merge and test run before landing.

| Branch | Head | Ahead | Merge check | What it does | Note |
|---|---|---|---|---|---|
| `claude/webgpu-device-loss-recovery-20261123` | `cfeead4d` | 1 | clean | recover from a lost WebGPU device while the GPU process restarts | — |
| `claude/webgpu-morph-texture-key-20261123` | `70710779` | 1 | clean | one built shader per shape-key geometry (fixes the destroyed morph texture behind the black world) | — |
| `claude/webgpu-late-compile-stuck-only-20261123` | `9eda0d3f` | 1 | clean | background compile only when the GPU is stuck, at most 2 per frame | — |
| `claude/webgpu-first-load-slices-20261123` | `62109065` | 7 | clean | cold-load shaders built in slices; shared morph geometry kept on body swap | contained in low-poly part 2 |
| `claude/low-poly-world-2-20261123` | `60b95b5a` | 13 | clean | model-bytes cache (0 MB per gate hop), shared archer NPC parse, zombie draw groups 205 → 2, 150 s hop watchdog | merge instead of the slices branch; gate hops matter only once the platform mode is off |
| `claude/three-empire-war-20261121` | `f792899e` | 3 | clean | Three Roads band 3 hall follows its cave mouth | band 3 needs caves (deleted) and Three Roads is off on the platform: likely superseded by the story rebuild |
| `claude/wolfveil-cave-mouths-20261123` | `7754c5dd` | 4 | **conflict** (`WolfveilCaveAccessPlan.mjs`, `WolfveilDungeonPortals.js`) | cave mouths travel in and out | `main` deleted the cave geometry it builds on: superseded unless the owner says caves return |

Suggested landing order if the owner approves: device-loss, morph-key, late-compile, then low-poly part 2 (which brings the slices).

### B6. Known bugs and open PRs

- Failing behaviour tests: skill-curve cast path returns `WEAPON_NOT_EQUIPPED` (4); `duel-system-backend` (6; reads `Deno.env`); `game3d-three-roads-world` hook count and `three-roads-script` walkable ground (1 each); remote weapon combos (4) and weapon montage (1); `companion-shared-player-xp` (1); Faction 3 wing rig (5); `games-hub-gpu-beta` (1). `WEAPON_SKILL_CAP` 100 versus hero cap 155. The full per-file list is in [BACKLOG.md](BACKLOG.md) §Testing.
- Open PRs: #425 (R143–R145 fixtures; evidence only); #320 (admin Quest Test teleport for Three Roads; partly landed, disabled by the platform mode); #252 (frame-count guard already in `main`: likely superseded); #73 (old weapon summon port, 4 conflicts: stale); #44 and #3 (cave work: superseded by the deletion).
- Issues: #298 (secure guest multiplayer), #261 (Luna mansion source absent), #260 (`usedTimes` crash), #71 (legacy migration; 21 of 94 Crescent Moon changes never migrated [mem `fallen-sky-migration.md`]).

### B7. Awaiting owner decisions (systems)

| # | Decision | Source |
|---|---|---|
| FS-D1 | When the platform mode switches off, and with which world | PR #382; `temporaryPlatform.mjs` |
| FS-D2 | Confirm caves and dungeons stay deleted until rebuilt from the story; retire `wolfveil-cave-mouths`, band 3's cave work, PRs #3 and #44 | commits `f939845d`, `8511617b`; terrain hand-off |
| FS-D3 | Level cap remainder: merge weapon skill points to 155 and the XP bank; pay out banked XP or not; should ascension open above 100 | [mem `level-cap-155-20261119.md`] |
| FS-D4 | Gear tiers: the 8 questions in `GEAR_TIERS_20261119.md`, then whether to turn the flag on | [doc] |
| FS-D5 | Skill damage curve: the 5 questions in `SKILL_DAMAGE_CURVE_20261118.md`, then whether to turn it on | [doc] |
| FS-D6 | Blacksmith v2 open choices (Mythic enchant cap 120 %, Stabilizer protecting failures, armor perk +4 defense, Chosen's Evolution-Stone path, other rarities' ascension) and the deploy order of the Base44 pieces | [mem `blacksmith-combat-handoff-v2.md`] |
| FS-D7 | Weapon charge: full-mastery hold double damage as a passive, PvE only; merge the Weapon Studio branch | [mem `weapon-charge-studio-20261119.md`] |
| FS-D8 | Audit decisions D1–D5: backend target, Halo/wings economy, cape ladder, faction names and maps, ascension requirement set | [doc `SYSTEMS_AUDIT_2026-11-13.md`] |
| FS-D9 | Guest multiplayer design: server-issued guest identity; guest progress versus account progression | [issue #298] |
| FS-D10 | Luna mansion: does an authored source exist elsewhere, or is it rebuilt? | [issue #261] |
| FS-D11 | Landing order of the seven branches (B5) | hub brief |
| FS-D12 | WebGPU default-on without a speed test: keep; is physical-GPU QA required before deploy | [mem `webgpu-conversion-20261120.md`] |
| FS-D13 | Crescent Moon stays DEV-only; real armor sets and art for the gear tiers | [mem `armor-pipeline-decisions.md`] |
| FS-D14 | Reward authority: do the R140–R145 fixtures drive a real server implementation, and on which datastore | PR #420, #425 |
| FS-D15 | Achievements: none designed; wanted? | — |
