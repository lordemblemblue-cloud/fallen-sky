# Game 3D systems audit (2026-11-13/14)

**For:** the owner, before funding the remaining work.
**Branch:** `claude/fervent-kowalevski-1f2040`, fast-forwarded to `origin/main` `64dce7e0e` (2026-11-14).
**Compare:** https://github.com/marcusflow1-arch/atom-x-eve-os/compare/main...claude/fervent-kowalevski-1f2040?expand=1
**Method:** source reading of the client (`src/components/game3d`, `src/pages/GameView.jsx`), the Base44
functions and entities (`base44/functions`, `base44/entities`, `base44/shared`), and the private server
(`server/game3d`); the test suites were run and their output is quoted in §2. Nothing was tried against the
signed-in Base44 app, the deployed functions, a Railway worker or a PostgreSQL database (§1.3).

This document records what exists and what it does. It is not an acceptance certificate for anything, and it
authorizes no merge, deployment, migration, economy change or reward.

---

## 0. The short version

Almost every system on the owner's list **exists in some form in the browser**, and almost none of it is
**decided by a server**. The game is a single-player progression simulation that happens to be visible to
other players:

- Progression (level, stats, gear, enchant, cores, halo, wings, titles, capes, mounts, pets, ascension…) lives
  in the browser's `localStorage`, one copy per character. The server keeps a **checked copy** of each
  character (Character Vault: caps, revisions, backups) and rolls **four** upgrade dice itself
  (reinforcement, over-enchant, refine, ultimate). Everything else is rolled and paid in the browser.
- Kills, XP, loot, gold, kill counters and contribution points are computed by the client that made the kill.
  Enemies are simulated by one elected player's browser.
- Social actions are real server functions (friends, parties, duels, world/party chat, clan, block/report,
  consensual Echo Chronicle memories). Trade in the game trades **Luna trading cards**, not game items.
- The things the owner describes as the MMO backbone are **missing or paused**: faction war (client-only code,
  not mounted), free-for-all map, rivalry (private server source only), territory/portals, marriage, housing,
  player shops, a server market (disabled by design until item custody exists), teacher/student, mini-games,
  fishing, relationship ties and quests, the weekly constellation event.
- A large private server (`server/game3d`, ~300 test files, 56 SQL migrations) exists for combat, quests and
  market **as source only**. Its only public surface is an opt-in dedicated duel worker; the quest and
  questbook routes are loopback-only and reachable from the game only through env-flagged Base44 relays
  (default off). Nothing in it decides live gameplay today.

§3 grades each owner system. §4 is the plan, grouped into branch-sized tasks with honest sizes.

---

## 1. How the back end is put together today

### 1.1 Three layers

| Layer | Where | What it decides today |
|---|---|---|
| **Browser client** | `src/components/game3d/**`, `src/pages/GameView.jsx` | Every progression store (per character, `characterStorage.jsx`), kills/XP/loot/gold (`EnemyPlayerSpawner.jsx`, `GameWorld3D.jsx`, `playerHUDStore.jsx`), enemy simulation on the elected host (`network/hostElectionStore.jsx`, `enemySyncBroadcaster.jsx`), movement over a WebRTC mesh (`components/game/MultiplayerSystem.jsx`) |
| **Base44 functions + entities** | `base44/functions/*`, `base44/entities/*.jsonc`, shared rules in `base44/shared/*` | Character Vault (`characterVault`, entities `Game3DCharacterSave`, `Game3DCharacterSaveBackup`), four server-rolled upgrades (`itemUpgrade`, `Game3DItemUpgrade`), duels (`duelSystem`, `DuelSession`, `DuelCombatEvent`), friends/parties/chat (`socialActions`, `partySystem`, `worldChat`), clan (`clanSystem`), block/report/clan invite/competition records/mount-activity records (`game3dWorldInteraction`: `Game3DSocialBlock`, `Game3DSocialReport`, `Game3DCompetition`, `Game3DMountActivity`), consensual shared memories (`game3dEchoChronicle`, `Game3DEchoEncounter`), exploration rewards (`explorationDiscovery`, `Game3DDiscoveryClaim`), card trade (`friendCardTrade`), dedicated-duel tickets/reports (`game3dCombatTicket`, `game3dCombatReport`, `game3dCombatRead`, `game3dCombatHistory`), flag-gated relays to the private server (`game3dQuestbookRead`, `game3dQuestAction174`, `game3dWorldSession180`) |
| **Private server** | `server/game3d` (Node 20, `ws`, `pg`, `esbuild`), `server/game3d/sql/001…056` | A dedicated duel worker (WebSocket `/game3d-duel`, HMAC tickets, opt-in via `GAME3D_COMBAT_*` env on both sides). Everything else (PvE encounter simulation 13.6+, world leases, quest credits/acceptance/turn-in/XP settlement 15.x–18.x, contribution ledger 16.2, faction reputation 16.3, rival consent 16.4, market custody/AGP 17.x–20.0, creator catalog 83.x) is **source + disposable-PostgreSQL tests**, loopback-only, and every dossier in `docs/game3d/COMBAT_*` says so |

Functions the game client actually invokes (grep of `functions.invoke` / `callGameServer` in the game
sources): `duelSystem` (14 sites), `partySystem` (6), `friendCardTrade` (5), `socialActions` (3),
`combatLoadoutPrefabs` (3), `worldChat` (2), `game3dEchoChronicle` (2), `characterVault` (2),
`game3dWorldInteraction`, `clanSystem`, `game3dQuestbookRead`, `game3dQuestAction174`, `game3dCombatTicket`,
`game3dCombatRead`, `game3dCombatHistory`; `itemUpgrade` through `character/characterVault.js`;
`explorationDiscovery` through `exploration/explorationDiscoveryStore.js`.

### 1.2 What `GameView.jsx` mounts, and what it does not

Mounted (live when signed in): `GameWorld3D` (regions `wolfveil`, `lunar-cave`, `astral-dungeon`),
`GameHUD`, `AXEServiceWorkspace` (Blacksmith / Shrine / Appearance / Companion / Spiritual), the social panels
(`FriendsListPanel`, `PartyPanel`, `TradePanel`, `WorldChatPanel`, `IncomingRequestToast`,
`Game3DCompetitionInbox`), `DuelSystem` + `DuelMarkers`, `EchoChronicleOverlay`, `ChronicleBlueprintLibrary`,
`CharacterVaultSync`, `ExplorationDiscoveryMount`, `EnemyPlayerSpawner`, `GameWorldLootLayer`, the VFX layers
(`PlayerHaloAura`, `PlayerAngelWings`, `PlayerBlueEnergyWings`, `SlashEffectLayer`, `PassiveSkillAuraEffects`,
`WindRunEffect`), `AXEMountFusionHUD`, `AXEWeaponIdentityMount`, `AXEWeaponQuickSwitchMount`,
`AXEVerifiedQuestbookMount172` (flag-gated), `ClanOverlay`, `CinematicQuestDialogue`, `DeathFlowController`.

**Paused** (commented out in `GameView.jsx` lines 623–638, "while Game 3D runs the self-contained forest
biome prototype"): `AXEWorldStreamingMount`, `AXEFirstRegionMount`, `AXETraversalSafetyMount`,
`AXEInteractionMount`, `AXECapitalBlockoutMount`, `AXEDungeonMount`, `AXEDungeonRuntime`,
`AXEFactionWarRuntime`. Several owner systems (faction war, AXE caves/dungeons, the faction territory
region, world interactables such as the training chest) live behind these mounts.

### 1.3 What could not be verified from here

- The **signed-in Base44 game**: no account session is available in this environment, so no system was
  exercised in a live browser session. "Live" below means *mounted in GameView and backed by a deployed
  function in the repository*, not "played and observed".
- **Deployed function versions and env flags** (`GAME3D_QUESTBOOK_ENABLED`, `GAME3D_COMBAT_AUTHORITY_ENABLED`,
  `VITE_GAME3D_QUESTBOOK_VERIFIED_READ`, …). The repository defaults every one of them to off.
- **The dedicated duel worker / Railway / PostgreSQL**: `server/game3d` was only unit-tested locally (§2).
- **The owner's back-end link** has not arrived in this session. `marcusflow1-arch/gitsync-pro` is not cloned
  on this machine, so its `docs/GAME3D_BOOK_MIGRATION_STATUS.md` was not read. If the link points to the private
  server deployment or to gitsync-pro, §3's "private server" rows are the ones that change.
- Dev-server play: not attempted, because the Game 3D page requires the Base44 sign-in.

---

## 2. Evidence: what was run

All commands from the worktree root unless noted, Node v26.13.0, Windows 11, `node_modules` as a junction to
the main checkout.

| Command | Result (observed) | Notes |
|---|---|---|
| `node --test tests/duel-system-backend.test.mjs tests/world-chat-backend.test.mjs tests/character-vault-backend.test.mjs tests/item-upgrade-backend.test.mjs tests/exploration-discovery-backend.test.mjs tests/game3d-*.test.mjs` | **2166 tests, 2050 pass, 116 fail** on this branch (`64dce7e0e` + the duel-test change) | On the earlier base `ad20160c9` (unmodified main at the start): 2137 / 2016 / 121. Vault, world chat, item upgrade and exploration backend tests all pass. The 116 are pre-existing: whole-file failures `game3d-animated-glb-quest-spawn` (reads `../../src` from `tests/`), `game3d-owner-long-grass-replacement`, `game3d-remote-mount-presentation`, `game3d-service-workspace-shell`, `game3d-shadow-wolf-house-glb`, `game3d-wolfveil-four-mile-meadow`, `game3d-ws08-x139-z128-drybank` (missing `src/WolfveilWs08X139Z128DryBank.mjs`), plus Chronicle, Services, selection-screen and terrain assertions |
| `node --test tests/game3d/*.test.mjs` (48 files) | **316 tests, 298 pass, 18 fail** on `64dce7e0e` | On `ad20160c9` it was 225 / 201 / 24, because `companionData.jsx` had a missing comma (commit `65f8841cf`, 2026-11-13) that broke esbuild bundling for 14 tests **and `npm run build`**; main fixed it before this branch was fast-forwarded. Remaining failures: `ascension`, `click-to-move`, `mount-fusion`, `skill-mastery`, `service-real-panels`, `service-workspace-transactions`, `spiritual-service-integration`, `kill-flow-counter-channel-aoe` (bundling of extensionless `.mjs` imports / cwd `lucide-react` paths), `build-balance` and `power-budget` par-curve assertions, two Game 1 forest assertions, HUD XP rail, ink-look settings |
| `node --test tests/duel-system-backend.test.mjs` | main: **0/9 pass** (`Cannot read properties of undefined (reading 'get')`). This branch: **5/9 pass** | The function reads `Deno.env` feature flags and, since duel protocol 3, requires a combat intent id per hit and synced positions; the test's Base44 stand-in predates all three. This branch adds the env stub and intent ids (`tests/duel-system-backend.test.mjs`). The four remaining tests need the position-sync protocol rewritten into the test (plan H1) |
| `cd server/game3d && npm install` then `node --test --test-concurrency=4` over the 283 non-`.pg` files, run **from the repository root** | **1604 tests, 1509 pass, 77 fail, 18 skipped** | Run from `server/game3d` instead: 1582 / 1453 / 111 (the creator-catalog tests resolve `server/game3d/sql/*.sql` relative to the repo root). Remaining reasons: `socket hang up` ×18 (TLS loopback fixtures), "22.0 requires original 21.1 ingress" ×14, Windows `EPERM: fsync` ×2, two `TypeError`s in forge/stage previews. None of these were investigated as code defects; the repo's CI runs them with disposable PostgreSQL 16 on Linux (dossiers quote 95–99 passing per milestone). `.pg.test.mjs` files need a database and were not run |
| `npm run build` | **fails on Windows, same as main**: `src/components/game3/Game3Scene.jsx (8:7): "default" is not exported by "src/components/game3/raceVfx.js"` | Game 3 (not Game 3D): a case-insensitive import of `./RaceVfx`. On `ad20160c9` the build failed earlier, on the `companionData.jsx` syntax error |
| `node tools/axe-studio/studio.mjs audit` | `STUDIO BLOCKED: Codex skill frontmatter invalid` | The studio planner the agent definitions ask for does not run on main |

Code paths read for each system are listed in §3. Tests named in §3 as "pass" are from the runs above.

---

## 3. System by system

Status words: **LIVE (client)** = in the game, state in the browser, checked by the Character Vault where
noted; **LIVE (server)** = a deployed-in-repo function decides it; **SOURCE, PAUSED** = code exists, not
mounted; **PRIVATE SERVER** = `server/game3d` source + tests, unreachable from the game; **STUB** = a record or
UI without gameplay; **MISSING** = nothing found.

### 3.1 Equipment

| Owner item | Status | Where | What it does today | Gaps |
|---|---|---|---|---|
| Enchant | LIVE (client), reinforcement and over-enchant **server-rolled** | `base44/shared/axeItemEnhancement.ts` (one copy for game and server), `axe/equipment/AXEItemEnhancementSystem.js` re-exports it, Blacksmith UI `axe/services/AXEBlacksmithWorkflowPanel.jsx`, server `base44/functions/itemUpgrade`, entity `Game3DItemUpgrade` | Reinforcement in 5% steps, safe to 40%, downgrades from 70%, cap by rarity (120 / 150 / 180 / Chosen 200). Enchantment: 4 slots × 10 levels (safe to 5), client-rolled. Each paid attempt is taken from the server's copy of the materials; the Vault overwrites saves that disagree (`docs/game3d/SERVER_UPGRADES.md`) | Enchant slots are client dice; earning the materials is client-side |
| Combine stage | LIVE (client), refine and ultimate **server-rolled**, combine and stage client-rolled | `base44/shared/axeItemAdvancement.ts`, `axe/equipment/AXEItemAdvancementStore.js`, `axe/services/AXECombineInventoryPane.jsx` | Combine: up to 12, same template and grade, donor consumed on success. Stage: Base → Stage IV as four "Ascension" imprints (`AXE_EQUIPMENT_ASCENSION_CONFIG`, bonuses 5.5–13.5% scaled by reinforcement), Stage V legacy. Refine 15 levels (destruction from 12), Ultimate 10 levels for legendary/heroic | Combine and stage rolls happen in the browser |
| Over-enchant | LIVE, **server-rolled** | as Enchant | 10 levels, 72% → 18% success, fracture from level 4 | — |
| Core system ("separate small boards with own stats") | LIVE (client), partial fit | `axe/progression/AXECoreSystem.js`, `AXECoreStore.js`, `axe/services/AXECoreForgePane.jsx`, `progression/hub/CoreSubTab.jsx` | Up to 2 registered cores, level 20, XP per level, five definitions (Assault, Bastion, Precision, Spirit, Divine Balance) with base + per-level bonuses and a rarity multiplier; bonuses feed `playerHUDStore` | No "board" (grid of slots) — it is a list of core instances. No acquisition path found in gameplay: `grantAXECore` / `grantAXECoreEssence` have no callers outside dev/preview |
| Infuse equipment with the mount | LIVE (client) as **Mount Soul Fusion** | `axe/progression/AXEMountFusionSystem.js`, `AXEMountStore.js` (`absorbAXEMount`, `tickAXEMountFusion`), `AXEMountFusionHUD.jsx` (mounted), `AXEMountFusionVisualRuntime.js`, `progression/hub/MountSoulFusionPanel.jsx` | Absorption Pill (60 / 600 min) multiplies equipment stats by 1 + share; share = 25% at full mount growth + 2% per gear slot refined to Stage 20 (7 slots → 39%); clan-coloured aura; soul-skill transformations while absorbed. Test `tests/game3d/mount-fusion.test.mjs` (fails to bundle in this environment, see §2) | Client-rolled and client-timed; pills and gear stages are browser state |

### 3.2 Mount

| Owner item | Status | Where | Today | Gaps |
|---|---|---|---|---|
| Levels up, stat points, abilities | PARTIAL (client) | `axe/progression/AXEMountSystem.js`, `AXEMountStore.js`, `AXELegendaryMountSystem.js`; older companion system `companionProgressionStore.jsx`, `companionAbilityStore.jsx` | AXE mounts grow 0–100% through XP bands (ride, PvE, PvP XP) and scale toward `maxStats`; legendary mounts are crafted with 4 rolled abilities + rerolls. The older **companion** (pet) system has levels, 2 stat points per level and 4 abilities | No mount level with spendable stat points; no per-level ability unlocks on ordinary mounts |
| Gear + cosmetic "variety set" (earpieces…) | PARTIAL / MISSING | fusion gear slots above; `companionData.jsx` saddle/armor/charm; `axe/services/AXECompanionWorkspace.jsx` Vanity/Costumes tab | Seven fusion gear slots (stage 0–20) and three older companion gear slots exist. The Companion Vanity/Costumes tab says: "The game currently provides a character Vanity and Costume inventory, but not a separate validated companion cosmetic loadout" | Mount cosmetics are **missing**; needs an attachment manifest per mount model (art) |
| Mount fusion | LIVE (client) | §3.1 last row; also the older `fusionStore.jsx` (companion fusion: hide pet, levitate 1.2 m, points per kill) | Two fusion systems coexist (AXE Soul Fusion and the older companion fusion) | Consolidate; server-side timing |
| Boost over hands / heart / mind / feet, % stats, max 25 | MISSING | — | No code mentions it | New system |
| Right-click companion/mount: fetch, racing | STUB | `PlayerInteractionMenu.jsx` (mount submenu: follow, fetch a ball, treasure, water play, brush, bond, rest), `GameView.jsx` ~line 352, server `game3dWorldInteraction` `mount_command`, entity `Game3DMountActivity` | The menu writes a server record with status `pending_animation` and toasts "Mount activity recorded — awaiting animation support". Nothing happens in the world | Needs companion AI behaviours + animations + any reward rules |
| Player racing | STUB | `PlayerInteractionMenu.jsx` Compete submenu (race to a waypoint, arm wrestling, most kills, checkpoint sprint, survival, treasure rush), `game3dWorldInteraction` `compete_invite` / `compete_respond`, entity `Game3DCompetition`, `social/Game3DCompetitionInbox.jsx` | Challenge → accept → status `awaiting_setup`; the inbox says "The contest waits for an arena and trusted scoring" | No race runtime, no scoring, no result |
| Fishing | MISSING | — | No code | New system |

### 3.3 Halo

**Status: LIVE (client), different shape from the owner's spec.** `progression/haloData.jsx`,
`progression/haloStore.jsx`, `axe/progression/AXEHaloSystem.js`, `PlayerHaloAura.jsx` +
`AXEHaloVisualRuntime.js` (mounted), Spiritual service panel. Vault caps the level at 200
(`base44/shared/characterSaveRules.ts`).

Today: levels 0–200 in six visual tiers; each attempt costs 10 **HUD kills** (the counter fed by
`EnemyPlayerSpawner.jsx`, i.e. AI "rogue" kills), success 50% → 3% by band; each level gives +0.15 to each
attribute, +0.04% crit chance, +0.15% crit defense, +0.1% crit damage (30 attribute points at 200). Halo also
expands elixir capacity.

Gaps vs the owner: no 0–100% presentation with "+1 to every attribute at 100%"; no halo over-enchant; no
second 100 after max; no halo cosmetic armor sets; progression is PvE kills, not PvP contribution; the dice
and the cost are in the browser.

### 3.4 Titles

**Status: LIVE (client).** `progression/titleData.jsx`, `progression/titleStore.jsx`,
`progression/hub/TitleSubTab.jsx`, Spiritual service. Vault caps 0–15 per path.

Today: five paths (Strength, Vitality, Dexterity, Spirit, Harmony) × 15 stages paid with contribution points
earned per kill type (normal 1, elite 5, boss 100, PvP 10, raid 25); one equipped title gives raw stats plus
attribute points (e.g. Vitality at 15: +450 HP, +35 defense, +10% crit defense, +30 constitution; Strength
at 15: +60 damage, +10% crit damage). Raw-stat titles are what the owner asked for; the numbers are balance
data (`docs/game3d/BUILD_BALANCE.md`), not +800 power / +500 HP. Contribution is earned and spent in the
browser.

### 3.5 Ascension

**Status: LIVE (client).** `axe/progression/AXEAscensionSystem.js`, `AXEAscensionStore.js`,
`AXEAscensionVisualRuntime.js` (in `GameWorld3D.jsx`), `progression/hub/AscensionSubTab.jsx`.
Test `tests/game3d/ascension.test.mjs` (bundling failure in this environment).

Today: at level ≥ 100 (provisional: the game has **no level cap**, `normalLevelCap: null` in
`AXECharacterProgressionConfig.js`) the character ascends, chooses a Nature (Destroyer ×1.35 skill damage +
shockwave visual; Balanced +6% all; Defensive ×1.15 defense + shield bank), **levitates** 0.15 m with ×1.12
movement and wears the Angel Cloak.

Gaps: "with every required piece acquired" is not a condition (level only); the level cap is undecided;
ascension state is browser state (the Vault stores it, no server check of the condition).

### 3.6 Wings

**Status: LIVE (client).** `progression/wingsData.jsx`, `wingsStore.jsx`, `hub/WingsSubTab.jsx`,
`axe/progression/AXEWingReinforcementSystem.js`, meshes `PlayerAngelWings.jsx` / `PlayerBlueEnergyWings.jsx`
(mounted). Vault caps 0–200 per path and reinforcement ≤ 120%.

Today: four wing paths (Endurance, Strength, Precision, Spirit), each levelled 0–200 by 10-kill attempts on
the halo success curve; each level +0.1 to every attribute plus the path's flat stats (Endurance at 200:
+1100 HP, +180 defense, +15% crit defense; Strength: +140 damage…); a separate reinforcement 0–120%
(feathers, essence, stabilizer) scales the stats up to ×1.6; a visual style toggle (classic / blue energy).

Gaps: "wing variety sets" (armor over the wings) are missing — only two visual styles; the armor pipeline
has a `wings` equipment slot and an `azure_seraph` wings set in the loot session's config
(`axe/equipment/AXEArmorPackCatalog.js`, branch `claude/armor-sup-dated-eve`), which is the natural base.
Progression is kills, not contribution. Dice and costs in the browser.

### 3.7 Capes

**Status: LIVE (client), with a different rarity ladder and no way to obtain capes in play.**
`axe/progression/AXECapeSystem.js`, `AXECapeStore.js`, `hub/CapeSubTab.jsx`, Appearance service.

Today: six definitions — Trainee (common, everyone starts with it), Warlord Mantle (elite: +120 HP, +18
damage, +26 defense, 3% crit defense, −2% resource cost, +1 skill level), Sovereign War Mantle (legendary),
Mantle of the Gods (heroic: −6% resource cost, +3 skill levels), Summer and Winter festival capes (rare).
Upgrade recipes Trainee → Warlord → Sovereign → Gods cost cape thread, war crests, divine fragments and gold
with 90 / 72 / 50% success.

Gaps vs the owner: rarities should be rare / epic / legendary / mythical / chosen (no common); a **Chosen**
cape with a large raw-stat block; Warlord as the PvP specialist below Chosen; rare capes as utility (crit
defense, −40% resource consumption, +1 to all skills). Nothing grants capes or cape materials in gameplay
(`grantAXECape`, `grantAXECapeMaterials` have no callers outside the store), so only the starter cape and its
upgrade path exist. Existing saves need a migration when the ladder changes.

### 3.8 Combat

| Owner item | Status | Where | Today | Gaps |
|---|---|---|---|---|
| Single-hit and multi-hit attacks | LIVE (client) | `axe/skills/AXECoreSkillLadder.js` (`AXE_SKILL_PATTERNS`: 2/3/4-hit sequences, single, AoE, strong AoE, divine single), `skills/skillExecutor.jsx` (timed hits, charged finishers), `combat/*` (counter, channel, continuous AoE, action queue), `axe/combat/AXECombatMath.js` + `axe/balance/AXEPowerBudget.js` | Tests `tests/game3d/combat-foundation-2-*.test.mjs` pass | Hits are resolved in the attacker's browser (PvE); server resolution only in duels |
| Three weapon roles (damage / defense / range) | LIVE (client) | `axe/factions/AXEFactionWeaponConfig.js` (`offensive`, `defensive`, `ranged`; families blade / polearm / bow), `axe/weapons/AXEWeaponRoleSlots.js` (HUD role slots), `AXEWeaponQuickSwitch*` (Shift+1/2), `AXEWeaponArchetypes.js` + `AXEWeaponAffinityStore.js` (×2 specialisation) | Tests `tests/game3d/three-role-weapon-inventory.test.mjs`, `weapon-affinity.test.mjs` | — |
| Weapon mastery that levels by use and can be raised with currency | PARTIAL (client) | `progression/weaponMasteryStore.jsx` + `weaponSynergyData.jsx` (kills → mastery level ≤ 20, per-weapon trees), `skills/skillMasteryStore.jsx` (skills level by use, `docs/game3d/SKILL_MASTERY.md`), `progression/weaponMastery/weaponUpgradeStore.jsx` (gold + iron shards raise a weapon **upgrade** level) | Mastery by use: yes (weapons by kills, skills by use). Currency: pays weapon upgrades, not mastery | No currency path for mastery itself; "unlock stronger bows": gear carries `mastery`/`tier` fields that are only displayed (`GearDetailPanel.jsx`); no mastery gate on equipping or on loot. Server: `Game3DDuelMastery` entity and `base44/shared/duelMasteryPolicy.mjs` attest **duel** mastery only; `server/game3d/combatMasteryRules.mjs` is private |
| Authority | — | `base44/functions/duelSystem` (server dice, clamped client stats, protocol 3 intents + position sync), `server/game3d` dedicated worker (opt-in) | Duels: server-resolved. Open-world PvE: client. Players can only hit other players inside an accepted duel (`window.__activeDuel` gating in `GameWorld3D.jsx`); the "enemy players" in the world are AI rogues | The earning side (kills → XP/loot/contribution) is unverified client state everywhere |

### 3.9 Social

| Owner item | Status | Where | Today | Gaps |
|---|---|---|---|---|
| Right-click a player: friend, party, guild invite, duel | LIVE (server) | `PlayerInteractionMenu.jsx` (opened from `GameWorld3D.jsx`), `social/friendRequest.jsx` → `socialActions`, `partyInvite.jsx` → `partySystem`, `duelChallenge.jsx` → `duelSystem`, clan invite → `game3dWorldInteraction clan_invite` (`ClanInvite`) with `ClanOverlay` in game, block/report → `Game3DSocialBlock` / `Game3DSocialReport`. Tests `tests/game3d/social-routing.test.mjs` (bundling failure here), `tests/world-chat-backend.test.mjs` pass | One friends list and party shared with the Luna dashboard (`docs/game3d/BACKEND_AUDIT.md` §2) | Trade request trades **Luna cards** (`friendCardTrade`), not game items; party has no gameplay effect (no shared XP) |
| Become their teacher (student XP bonus) | MISSING | — | No code (the only "teacher" is a card/achievement category) | New server function + XP hook |
| Arm-wrestle and other mini-games that raise relationship | STUB | Compete submenu → `Game3DCompetition` (`race`, `arm_wrestle`, `kill_contest`, `checkpoint_sprint`, `survival`, `treasure_rush`) | Records a challenge and an acceptance; "waits for an arena and trusted scoring" | No mini-game runtime; **no relationship value exists anywhere** (`game3dEchoChronicle` deliberately refuses to infer one) |

### 3.10 Relationship quests (shared boss kills → tie → cutscene → party XP → relationship quests)

**Status: PARTIAL in a different form; the owner's chain is MISSING.**

- Echo Chronicle (`social/echoChronicle*.js`, `EchoChronicleOverlay.jsx`, server `game3dEchoChronicle`,
  entity `Game3DEchoEncounter`): two players who meet in the same world can talk, make gestures, **propose an
  adventure** (one of the two optional echo side quests) and save a **mutual-consent shared memory**. The
  server explicitly records no relationship, reward or quest completion.
- Rival relationship: private server 16.4 (`server/game3d/privateStoryRivalConsent164.mjs`, SQL 044) offers a
  `rival` / `friendly_rival` / `decline` choice to two characters after **three verified defeats in three
  matches** — but the trusted PvP outcome source it needs is not installed (`docs/game3d/COMBAT_QUEST_STORY_RIVAL_CONSENT_16_4.md`).
  The client shows the statuses in Services → Quest Logbook → Social Leads when the verified questbook flags
  are on (`axe/services/AXEQuestbookSocialLeads173.jsx`).
- Fractured Divinity (`fracturedDivinity/*`, 10 arcs, 113 quest/arc entries with branching choices,
  "mentor_bond" rewards) is an authored script + viewer with no world triggers
  (`docs/game3d/INTEGRATION_AUDIT_2026-11-02.md`).

Missing: shared-boss-kill bond, the cutscene, party XP bonus, the two-player relationship quest line (the
soul / physical-world dungeon story).

### 3.11 Quest web (50–70 quests, random encounters, branches that feed the main story)

**Status: PARTIAL — about 31 reachable quest definitions, no random road encounters, no branch feedback.**

| Source | Count | Reachable in the live world? |
|---|---|---|
| `questData.jsx` (`QUESTS`, five archer NPCs: Lyra, Vex, Kira, Noor, Zephyr) + the living quest `q_living_bleeding_moon` (Artemis, `npc/CinematicQuestDialogue.jsx`) | 20 + 1 | Yes (client quest store `useQuestStore.jsx`, HUD questbook). Completion comes from client kill events |
| `axe/quests/AXEQuestFramework.js` (`AXE_QUESTS`) | 4 | Through the AXE quest framework; the private 15.4 acceptance catalog covers only the opening patrol and elite quests |
| `axe/quests/AXEEchoChapters.js` (chapters 1.4–1.8 + two side quests) | 7 | Through the **verified questbook** only (`AXEVerifiedQuestbookMount172`, env flags default off) |
| `npc/questData.jsx` (NPC network prototype) | 2 | Not mounted |
| `fracturedDivinity/fracturedDivinityQuests.jsx` + arcs 2–10 | 113 entries | Script and viewer only |

Random encounters: `social/echoLivingEncounters.js` turns recent discoveries/kills into optional adventure
leads; nothing like a mugger on the road or a tomb-robbing cave scene exists, and no outcome feeds back into a
main chapter. The three quest systems (client `questData`, AXE framework, verified server questbook) are not
one definition format.

### 3.12 Constellation event (weekly, at night, one constellation per friendship)

**Status: different feature exists; the event is MISSING.** `livingChronicles/echoConstellation.mjs` projects
the seven echo chapters of **one character** as a "minor constellation" in Services
(`axe/services/AXEConstellationsWorkspace.jsx`); `social/EchoChronicleConstellation.jsx` is a paged star-map
timeline of saved memories. Neither is weekly, night-only, in the sky, or per friendship. A real starlit night
sky exists (`sky/`, `docs/game3d/GLOBAL_STARLIGHT_SKY_COVERAGE_20261111.md`) to draw it in; it needs the
relationship ledger of §3.10 first.

### 3.13 Marriage, housing, player shops, server market

| Item | Status | Evidence |
|---|---|---|
| Marriage | MISSING | Only a "Partner / Marriage" label in `social/EchoChronicleBook.jsx` and the word in `axe/core/axeFoundation.js` |
| Player housing | MISSING | `AXEImplementationManifest.js` prompt 40 "Settlement / housing: MISSING"; `Region_SettlementReserve` ("Future Player Settlement") is a placeholder in the paused streaming manifest; Wolfveil houses are scenery |
| Player shops | MISSING | Market stalls were retired from Wolfveil (`docs/game3d/WOLFVEIL_RETIRE_MARKET_STALLS_20261108.md`); no shop entity or UI |
| Server market (list, buy, trade, bid) | **DISABLED by design** | `base44/functions/marketplace/entry.ts` returns 503 `marketplace_settlement_unavailable` for list / purchase / bid and empty preview lists ("Trading is disabled until verified item custody and AGP settlement are available"). `tradePostMarket` lists Luna **cards**. Entities `MarketTransaction`, `Bid` belong to the dashboard marketplace and have no access rules. The private server has Market Foundation 16.5–20.0 (custody intents, title-transfer drafts, AGP wallet/funding candidates; SQL 021–025; `docs/game3d/MARKET_FOUNDATION_*.md`) as **read-only audits**. Root cause stated in `BACKEND_AUDIT.md` §3.A: items are not server-owned, so they cannot be transferred |

### 3.14 PvP

| Owner item | Status | Where | Today | Gaps |
|---|---|---|---|---|
| Faction war every 25–30 min, teleport to a war map | SOURCE, PAUSED, client-only | `axe/factions/AXEFactionWarSystem.js`, `AXEFactionWarStore.js`, `AXEFactionWarRuntime.jsx` (not mounted) | A 60-minute cycle (10 registration / 35 battle / 5 resolution) computed from the wall clock, four power brackets, five war "maps" that are prototype positions inside the same world (Convergence Field, three invasion routes, Faction Homeland), shield / tower / core defenses with 25k–90k HP, rewards in contribution and war tokens; join / kill / capture / damage / resolve are **local** state | No server; no teleport or separate map; wrong cycle length; no cross-player state. Factions are placeholders "Faction 1–3" (`AXE_FACTIONS`); faction mounts/pets exist per faction (`AXEFactionMountAssets.mjs`) |
| Free-for-all map without timer | MISSING | — | Player-vs-player hits are gated to an accepted duel | New region + rule flag + server kill validation |
| Contribution points from kills | LIVE (client) / PRIVATE SERVER | `progression/titleStore.jsx` (title contribution per kill type), `progression/contributionStore.jsx` (**starts every character at 10,000 CP** — preview balance), server `privateContributionLedger162.mjs` (SQL 042, private) | Earned in the browser | Needs verified kills |

### 3.15 Rivalry (repeated kills → cinematic choice → scar, rivalry quests)

**Status: PRIVATE SERVER only for the consent step; everything the player would see is MISSING.**
`server/game3d/rivalQuestCandidate151.mjs` (ephemeral candidate tracker), `privateStoryRivalConsent164.mjs`,
`privateRivalEvidence166.mjs` (durable PvP evidence, SQL 046); client display in Social Leads 173. No
cinematic, no yield / help-up interaction, no facial scar (appearance flag), no rivalry quest line. Depends on
real faction-war kills (§3.14).

### 3.16 Dungeons

| Owner item | Status | Where | Today | Gaps |
|---|---|---|---|---|
| Mountain dungeon with a secret boss | PARTIAL (live), no boss | `dungeons/LunarCaveLayout.mjs`, `LunarCaveScene.js`, `hud/LunarCaveMinimap.jsx`; entered from the Wolfveil waterfall cave gate (`wolfveil_lunar_mountain_gate`) | A separate `lunar-cave` region with chambers of **training spawns whose XP reward is 0** ("preview-only training roster") | No boss, no secret boss, no rewards |
| Underground caves with materials, monsters, mini-bosses | SOURCE, PAUSED + partial live | AXE: `axe/dungeons/AXEDungeonSystem.js` (Stone Vein Caverns: open-world cave, Three-Way Fork, Deep Chamber boss "Cavern Warden", SOS Vault; Sealed Sanctum: party instance behind the `AXE_Item_SOS_Access` item), `AXEDungeonStore.js` (sessions, checkpoints, rooms), mounts paused. Live: material nodes via `exploration/ExplorationDiscoveryMount.jsx` → server `explorationDiscovery` (`Game3DDiscoveryClaim`) | The AXE caves are complete as data + session logic but not in the world. Discovery nodes are the only **server-granted** material source; their positions are authored for `AXE_Region_FirstTerritory` coordinates — whether they land sensibly in Wolfveil was not verified | Mount the caves or author a live cave region; place nodes; mini-bosses |
| Portal dungeon for uninterrupted farming | LIVE-ish | `dungeons/AstralDungeonLayout.mjs` ("Moonfall Expanse", `astral-dungeon` region, entered by the second mountain gate), `AstralDungeonScene.js` | Four spine pads (levels 45–70, 6–9 monsters each, the last of each pad an elite) plus flank pads, regular XP, 10 s respawn (`enemyRespawnManager.jsx`) | No boss, no loot table of its own, no portal cosmetics; XP and kills are client-side |

World bosses: Quarry Dragon in Wolfveil (`boss/`, `docs/game3d/QUARRY_DRAGON_AERIAL_SLAM.md`) and a full boss
framework (phases, telegraphs, adaptive brain) exist to build dungeon bosses from.

### 3.17 Territory (three faction maps + middle map, break the portal's HP, enter their land and town)

**Status: MISSING as designed.** The live world is one map (Wolfveil) plus the two dungeon regions. The AXE
streaming manifest (`axe/world/AXEWorldStreamingSystem.js`, paused) has **one** faction territory with
capital, forest, cave, settlement, contested-pass and boss-basin reserves. The faction-war invasion routes
with shield HP (§3.14) are the closest thing to "a portal with HP", but there are no per-faction maps, no
middle map, no enemy town and no faction identities.

### 3.18 Attack VFX and sound (the owner's additional request)

**VFX today:** `SlashEffect.jsx`, `vfx/CombatImpactFeedback.jsx`, `vfx/CombatWeaponTrails.jsx`,
`vfx/DuelDefenseFeedback.jsx`, `vfx/playerCastLightBeam.jsx` (every `playerSkillStrike` draws a cast beam),
skill-specific effects (`FrostTornadoEffect`, `LightningStrikeEffect`, `LifeDrainEffect`, `HealEffect`,
`BiteEffect`, `ShadowTeleportEffect`, `WindRunEffect`), boss VFX (`boss/bossAbilityVfx.jsx`,
`raidAerialStrikeVfx.jsx`), mount-fusion / ascension / halo visual runtimes. Skill strikes otherwise reuse
the basic swing; `docs/game3d/WUXIA_BLUEPRINT_GAP_MAP.md` §12 already grades "realistic skill effects" as
partial.

**Unmerged weapons work:** branch `claude/weapon-oil-construct` (session failed; four commits on top of
`cefb3e2d0`, 35 files): a six-weapon GLB pack with manifest (`public/game3d/weapons/`),
`weapons/playerWeaponRuntime.js`, `playerWeaponSummon.js` (summon into the hand), `weaponConstructFx.js`
(oil / liquid-metal forming), `weaponGripMath.js`, `weaponSummonGesture.js`, trail changes, 51 lines in
`GameWorld3D.jsx`, tests. Not reviewed or run here.

**Sound today:** the owner's sound pack is merged on main (`public/game3d/audio/`, 21 MP3s;
`audio/defaultSoundPack.mjs`, `combatAudioStore.jsx` with keys for swings, impacts, combo finisher, hits,
enemy hits/death, armor break, chest, level up, quest, victory, ambience; `audio/GameEventSoundBridge.mjs`;
`combat/CombatSoundRouter.mjs`). Per-skill authored sounds exist for two skills (`skills/skillSoundEffects.jsx`).
Gaps: no per-skill or per-role sound sets for the nine skill patterns, no enemy/boss attack sound set beyond
hits, no UI sounds beyond the pack.

---

## 4. Plan: branch-sized tasks, in priority order

Sizes are working days for one engineer who knows this codebase, excluding art and the owner's review
cycles; S ≤ 2 days, M 3–7, L 8–15, XL 15+. "Needs" lists hard dependencies. Everything is additive to the
current client and keeps the Character Vault as the save of record; nothing here flips the private server on.
Each row is one branch and one PR.

### 4.0 Decisions the plan depends on (owner)

| # | Decision | Why it gates work |
|---|---|---|
| D1 | **Which back end is the target**: keep Base44 functions + Character Vault and add functions per system (assumed below), or fund the cutover of the private `server/game3d` world/quest authority, or move to gitsync-pro. | Every "server-validated" row below is written for Base44 functions. A private-server cutover is its own XL programme (realtime authority, migrations 028–056, deployment) and would replace rows A2, E1–E3 |
| D2 | Halo / wings economy: PvP contribution (owner's spec) or kills (today). | B1, B2 |
| D3 | Cape ladder and numbers (rare / epic / legendary / mythical / chosen). | B3 |
| D4 | Faction names, identities and the three maps. | E1, F4 |
| D5 | Level cap and the ascension requirement set. | B6, B1 ("a further 100 after max") |

### 4.1 Track A — make the browser systems trustworthy (foundation)

| ID | Task | Size | Needs |
|---|---|---|---|
| A1 | **Server-rolled prestige dice**: halo, wing, pet and cape attempts rolled and paid by a function (extend `itemUpgrade` / `Game3DItemUpgrade` or a sibling `prestigeUpgrade`), Vault reconciliation like `SERVER_UPGRADES.md`, tests like `tests/item-upgrade-backend.test.mjs` | M (5) | — |
| A2 | **Verified kills → XP, kill counter, contribution**: the host client submits kill receipts; a function validates rate, level gap and enemy tier against the Vault copy and credits XP / kills / contribution server-side; the client reconciles. Reuses `base44/shared/rewardEngine.ts` / `rewardJournal.ts`. This is the single most important gap: every "progressed by…" system sits on it | L (10) | D1 |
| A3 | **Vault coverage audit**: every store in §3 (cores, capes, mounts + fusion gear, titles, ascension, costumes, vanity, companions) is in the save with caps in `characterSaveRules.ts`; add the missing caps and tests | S (2) | — |
| A4 | **Item custody**: server-owned item instances (ids, provenance) for equipment and materials so items can move between players; prerequisite for trade, market, shops. Reuse the private market's custody-intent design (`MARKET_FOUNDATION_17_1.md`) as a Base44 function + entity | XL (20) | A2 |

### 4.2 Track B — progression systems to the owner's spec (client + Vault)

| ID | Task | Size | Needs |
|---|---|---|---|
| B1 | **Halo to spec**: 0–100% scale with "+1 to every attribute at 100%", halo over-enchant ladder, a second 100 after max, cost switched to PvP contribution, migration of existing levels; cosmetic halo sets as an appearance manifest (art) | M (5) + art | D2, D5, A1 for server dice |
| B2 | **Wings to spec**: contribution cost; wing variety sets as armor-over-wings using the armor pipeline's `wings` slot (`azure_seraph` first) | M (4) + art | D2, armor branch merged |
| B3 | **Capes to spec**: new rarity ladder, Chosen and Warlord definitions, rare utility capes (crit defense, −40% resource, +1 all skills), drop/grant sources in `AXEEquipmentLootSystem.js`, save migration | S–M (3) | D3 |
| B4 | **Mount levels, stat points, abilities; hands/heart/mind/feet boost**: mount level 1–N with points and ability unlocks on `AXEMountStore`; four boost slots × 25 levels of % stats; Companion workspace UI | M (6) | A1 |
| B5 | **Mount cosmetic sets**: attachment manifest per faction mount (earpieces etc.), slots, hide/show; needs the models | M (4) + art | — |
| B6 | **Core boards**: board UI with slots over `AXECoreSystem`, core drops / essence sources | S–M (3) | — |
| B7 | **Ascension requirement set**: required pieces, level cap, server check in the Vault | S (2) | D5 |
| B8 | **Titles balance pass**: owner's raw-stat scale, contribution hook from A2 | S (1) | A2 |
| B9 | **Weapon mastery currency path and gear gates**: spend currency to raise mastery; enforce `mastery`/`tier` on bows and loot tiers | S (2) | — |

### 4.3 Track C — social and relationship

| ID | Task | Size | Needs |
|---|---|---|---|
| C1 | **Relationship ledger**: a `Game3DRelationship` entity (pair, score, tier, events) written only by functions; events from duels, echo adventures, competitions, shared kills | M (5) | A2 for shared kills |
| C2 | **Teacher / student**: `socialActions` extension, teacher status, student XP bonus applied in the A2 credit path | M (3) | A2, C1 |
| C3 | **Mini-games runtime**: race to a waypoint (client race + server result on `Game3DCompetition`), arm-wrestling (timed input duel through `duelSystem`-style function), kill contest; relationship credit | L (10) | C1 |
| C4 | **Party XP sharing** in the credit path; range rule | S (2) | A2 |
| C5 | **Relationship quests**: shared boss kill → tie → cutscene (reuse `CinematicQuestDialogue` + `livingquest/cinematicCamera`) → party XP bonus → the two-player dungeon storyline (one quest line first) | L (12) + writing | C1, D1 (quest format) |
| C6 | **Constellation event**: weekly night-sky constellation per friendship from the ledger, drawn in `sky/` | M (5) | C1 |
| C7 | **Marriage**: entity, proposal / ceremony UI, shared buffs | M (5) | C1 |

### 4.4 Track D — quest web

| ID | Task | Size | Needs |
|---|---|---|---|
| D1 | **One quest format**: merge `questData.jsx`, `AXEQuestFramework.js` and the echo chapters into one definition with branches, flags and encounter triggers; keep `useQuestStore` as the client store; server acceptance/turn-in through A2's credit path | M (6) | A2 |
| D2 | **Random road encounters**: encounter table (mugger, suspicious party → tomb robbing…) with spawn, dialogue and outcome flags that feed main chapters | M (5) | D1 |
| D3 | **Content to 50–70 quests**: ~40 new quests plus world triggers for the Fractured Divinity arcs; budget 0.5–1 day each including spawns and dialogue | XL (25–40) + writing | D1, D2 |

### 4.5 Track E — PvP

| ID | Task | Size | Needs |
|---|---|---|---|
| E1 | **Faction war, live**: a war-state function (cycle 25–30 min, registration, opt-in **teleport** to a dedicated war region, defenses with HP, server kill contribution, rewards) reusing `AXEFactionWarSystem` data; mount the runtime; faction identities | XL (20) + map art | D1, D4, A2 |
| E2 | **Free-for-all region**: a region flag that lifts the duel gate, server-validated player kills, no timer | M (5) | A2 |
| E3 | **Rivalry**: trusted PvP outcomes from E1 feed the consent step (port 16.4 to a Base44 function or cut the private server over), cinematic choice, yield / help-up, facial scar as an appearance flag, rivalry quest line | L (12) + writing | E1, C1 |

### 4.6 Track F — dungeons and territory

| ID | Task | Size | Needs |
|---|---|---|---|
| F1 | **Dungeon bosses + secret boss**: boss rooms in Lunar Cave and Moonfall from the boss framework; a hidden trigger for the secret boss; rewards through A2 | M (6) | A2 |
| F2 | **Caves with materials and mini-bosses**: mount the AXE cave system (or author the caves into the live world), place discovery nodes, add mini-bosses | M (7) | — |
| F3 | **Portal farming dungeon polish**: Moonfall loot table, respawn tuning, portal visuals | S (2) | A2 |
| F4 | **Territory**: three faction maps + middle map, portal objects with HP, enemy towns; un-pause and extend the streaming system | XL (30+) + map art | D4, E1 |

### 4.7 Track G — attack VFX and sound (requested)

| ID | Task | Size | Needs |
|---|---|---|---|
| G1 | **Recover the weapons branch**: review `claude/weapon-oil-construct` (weapon pack, summon, liquid-metal construct, trails), rebase on main, run its tests and a browser check, PR | M (3) | — |
| G2 | **Skill VFX pass**: one effect per core pattern × role (multi-hit flashes, single-hit impact, AoE rings, divine single), hit-stop / shake through `CombatImpactFeedback`, mount-soul and ascension variants kept | L (10) | G1 |
| G3 | **Sound pass**: per-skill sounds (`AUTHORED_SKILL_SOUNDS`), per-role swing/impact sets, enemy and boss attack sounds, UI; extend `tools/game3d/sound-pack/` and the admin audio manager | M (5) + recordings | — |
| G4 | **Enemy / boss attack VFX** matching telegraphs | M (5) | G2 |

### 4.8 Track H — hygiene (small, any time)

| ID | Task | Size |
|---|---|---|
| H1 | Rewrite `tests/duel-system-backend.test.mjs` for protocol 3 (position sync) so the duel function has a passing test again | S (1) |
| H2 | Fix the Game 3 `RaceVfx` import case so `npm run build` passes on Windows | S (0.5) |
| H3 | Server tests: resolve SQL fixture paths from the package dir; skip TLS-loopback fixtures cleanly on Windows | S (1) |
| H4 | `tools/axe-studio/studio.mjs audit` frontmatter | S (0.5) |
| H5 | A CI job for the Game 3D test subset of §2 so regressions like the `companionData.jsx` comma are caught at PR time | S (1) |

### 4.9 Suggested order and rough totals

1. **A2, A1, A3** (foundation, ~17 days) — without them every system below stays browser state.
2. **G1, G3, B3, B9, B6, B7, H1–H5** (quick visible wins, ~16 days).
3. **B1, B2, B4, B5, B8** (progression to spec, ~20 days + art).
4. **C1–C4, D1, D2** (social + quest framework, ~31 days).
5. **E1, E2, F1–F3, G2, G4** (PvP and dungeons, ~48 days + art).
6. **C5–C7, D3, E3, F4, A4** (content and the largest systems, ~110 days + writing + map art).

Total engineering: roughly **240 working days** before art, writing, owner review and the signed-in QA that
this environment cannot do. If D1 chooses the private-server cutover instead of Base44 functions, add its own
programme (deployment, migrations, realtime authority) and re-plan A2, E1–E3.

---

## 5. Small fixes in this branch

- `tests/duel-system-backend.test.mjs`: the Base44 stand-in now provides `Deno.env.get` and sends a protocol-3
  intent id and sequence with every hit. Main: 0/9 passing; this branch: 5/9. The last four need the
  position-sync rewrite (H1); they are left failing rather than weakened.

No source, balance, entity, function or economy change was made.

---

## 6. Open questions for the owner

1. The back-end link (gitsync-pro or a deployment) has not reached this session; §3's private-server rows
   are written from the repository only.
2. D1–D5 above.
3. Should the two fusion systems (AXE Soul Fusion and the older companion fusion) and the two companion
   progressions (AXE mounts and `companionProgressionStore`) be consolidated before B4?
