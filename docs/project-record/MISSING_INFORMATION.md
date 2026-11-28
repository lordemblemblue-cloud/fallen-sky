# Missing-information requests

Written 2026-11-27 from the recovery baseline (`main` `ab03f50a`). Each request follows the owner directive's §11 format. Connected questions are grouped so one return to the right AI conversation can answer a whole group. Nothing below was invented to fill a gap: where the record says "missing", no source reachable from here contains it ([SOURCES.md](SOURCES.md)).

**How to answer:** reply in any form (text, file, export, screenshot). Each answer gets committed with its date and "owner-approved", and the dependent backlog rows move to Implementation-ready ([AGENT_HANDOFF_PROTOCOL.md](AGENT_HANDOFF_PROTOCOL.md) §7).

| Group | Requests | Unblocks |
|---|---|---|
| 0. Conversation exports | MI-00 | Most of the groups below |
| FS-S. Fallen Sky story, quests, world | MI-FS-S1 to S8 | The campaign, the world rebuild, cinematics |
| FS-P. Fallen Sky progression and balance | MI-FS-P1 to P3 | Gear tiers, curve, achievements |
| FS-W. Fallen Sky world and bosses | MI-FS-W1, W2 | The platform switch-off, dungeons, bosses |
| FB. Fantasy Battle | MI-FB-01 to 07 | Story, dungeons, skills, rewards, assets |
| DA. Duelist Adventure | MI-DA-01 to 08 | Ranked, Custom, shop, progression, story, armour, animation |
| X. Cross-project | MI-X-01, 02 | Canon scope, multiplayer identity |

---

## Group 0. Conversation exports

### MI-00 Export the browser AI conversations
- **Project:** all three games.
- **Feature or section:** the design conversations held in ChatGPT, Gemini and claude.ai.
- **What has already been completed:** every repository, local folder, Google Drive file and Claude Code transcript reachable from this machine was searched ([SOURCES.md](SOURCES.md)). No export of any service exists on the machine, and no Word manuscript of "The Threads of Our Pain".
- **What information is missing:** the conversations themselves, and the files they produced that never reached the repository.
- **Why it is required:** the directive asks to recover whole conversations, including later corrections and rejected designs. The story docs themselves note that "earlier chat-only wording" was not recovered (R95) and that the latest Word manuscript was unavailable (R85, R86). Fantasy Battle's story, party, skills, saves, menu and the approved UI kit as source files came from browser conversations that no Claude session has seen (FANTASY_BATTLE_RECORD §0).
- **Specific questions / steps (pick A, B or C):**
  - **A. Export everything (preferred).**
    - ChatGPT: profile menu → **Settings → Data controls → Export data → Confirm export**. An email arrives with a download link (it expires after about 24 hours). The zip holds `conversations.json` and `chat.html`.
    - claude.ai: **Settings → Privacy → Export data**. An email arrives with a download link; the zip holds `conversations.json` (and projects, if any).
    - Gemini: go to takeout.google.com → **Deselect all** → tick **My Activity** → click "All activity data included" → **Deselect all** → tick **Gemini Apps** → OK → **Next step** → "Export once", `.zip` → **Create export**. If Gemini wrote documents to Google Docs, they are already in Drive; say which.
    - Put the downloaded zips, unopened, in a new folder such as `%USERPROFILE%\Downloads\ai-exports\` and say when they are there. They will be read, not extracted into the repo; only the game-relevant decisions get written into the record, with dates.
  - **B. Export only the conversations that matter most** (print each to PDF or copy into a `.md` file):
    1. Fallen Sky: "The Threads of Our Pain" story conversations, the latest Word manuscript (`.docx`), and the conversations that produced the R-series story docs and the NPC phase docs.
    2. Fantasy Battle: the design conversation(s) for story, campaign, party, skills, saves and the main menu. (The approved UI plates themselves are already used by the game: 47 plates and a save plaque load from Base44 media, labelled with your original file names; only their source files are not in git. See MI-FB-01 for what is still needed about them.)
    3. Fantasy Battle: who or what "Aoi", "Lyria", "Warden of Tides", "Moonlit Saber" and "Sapphire Blossom" are (they appear only as image names).
    4. Duelist Adventure: the conversations behind the Gemini HQ, escort-map, CTF and arena packages, and any original class, ranked, custom-game or shop design.
  - **C. Let a Claude session read the signed-in conversations in the app's built-in browser**, read-only: no sending, no settings, no downloads. Only with your explicit "yes" for each service.
- **Required files or assets:** the export zips, or the PDFs and files listed in B.
- **Other systems affected:** every "Awaiting information" row in [BACKLOG.md](BACKLOG.md).
- **Work that can continue without this information:** all Ready packages in [WORK_PACKAGES.md](WORK_PACKAGES.md) (fixes, tests, verification, branch landings).

---

## Group FS-S. Fallen Sky story, quests and world

These come from the story documents' own open questions (`docs/game3d/threads-of-our-pain/`). They can be answered in the story conversation that produced the R-series, then committed as decision records. Answer MI-FS-S1 first: it unblocks most of the campaign after M06.

### MI-FS-S1 Original-world chronology and causality (R111 P0)
- **Project:** Fallen Sky, The Threads of Our Pain.
- **Feature or section:** the original-world (age 18) scenes from M07 to M19 that come after the M05 death; the overlap in M10; the interleaving in M19.
- **What has already been completed:** the fixed facts (R111 §1); candidate models A, B, C and A1, A2, A3 with tests (R111 §1–4); dependency audits (R97, R98); drafted clarifying lines (R111 §5).
- **What information is missing:** the approved local order of the later original-world scenes relative to M05; where the link between the two lives comes from; how far its causal reach may go.
- **Why this information is required:** without it, living original-world characters could contradict the canonical death; it blocks waves W03–W06 and the ending contracts (R112 §3).
- **Specific questions that must be answered:** (1) Approve A (all later original-world scenes happen before the death in local time), or name another mechanism? (2) Does M05 preserve a connection that already existed (A1) or create it? (3) May the rescue in M10 physically help the younger hero survive? (4) Is it confirmed that the brace in M19 has no causal link to the tether? (5) Which R111.A lines are approved?
- **Required files or assets:** a written decision (a reply in the story conversation, or an R111 decision record).
- **Other systems affected:** NPC lifetimes (Phases 54–67), the save and phase model, objective windows for 105 IDs, the endings, NG+.
- **Work that can continue without this information:** P01 (M01–M03); local art for M04–M05; the preserved-side town and archive; validators; the terrain survey.

### MI-FS-S2 Endings and the postgame world
- **Project:** Fallen Sky. **Feature or section:** M19, M20, endings A and B, the postgame.
- **What has already been completed:** the owner's direction (R64A); the R65 draft script; the rules for keeping gear and continuing quests (R76, R84).
- **What information is missing:** how far the player can roam in ending A; when and at what age ending B starts relative to the coda of about 20 years; a survivor ledger per character; where the third reality fits, and the shrine of the Twelve; the expansion rules; the exact time that passes.
- **Why this information is required:** it decides spawn points, which NPCs appear, which map variants exist and what the save commits.
- **Specific questions that must be answered:** (1) In ending A, what can the player explore? (2) Does ending B's play start right after the fusion at age 18, with the coda as a cutscene only? (3) Which named NPCs are alive in ending B? (4) Does the third reality appear in the base game? (5) Is carrying over more than gear approved (skill ranks, currency, cosmetics, achievements)?
- **Required files or assets:** the owner's decision; a survey of the destination map.
- **Other systems affected:** terrain, quest availability, NG+, backend transactions (R139).
- **Work that can continue without this information:** R65 staging studies; the ending-transaction fixture design; the NG+ display formatter (WP-FS-S6).

### MI-FS-S3 Optional quest lane policies and small canon confirmations
- **Project:** Fallen Sky. **Feature or section:** S27/S29, S39, S53, S55, S34, S09, D31/S46, S42/S54, the D26/M08 crest, D48, S36, S50.
- **What has already been completed:** the scripts; the R66 and R104 proposals; the R77–R82 availability classes.
- **What information is missing:** approval of each lane policy; who wrote or made each named item.
- **Why this information is required:** it decides when a quest counts as complete and who grants the reward, so nobody gets false credit.
- **Specific questions that must be answered:** (1) Can S29 count S27's verified receipt before S27's repairs are done? (2) Is the exchange the core of S39, with the song optional? (3) Is S53 complete on delivery plus scouting, with the inscription optional? (4) Does S55 need both gardens? (5) Can S34 be completed late? (6) Is D26's crest distinct from M08's? (7) Who carved D48, and who wrote S36's letters? (8) Are S50's geometry and marker approved? (9) Does D31/S46 use a record or an echo?
- **Required files or assets:** the owner's reply.
- **Other systems affected:** the quest adapter, rewards, NPC schedules.
- **Work that can continue without this information:** every other optional ID; data models with these lanes flagged pending.

### MI-FS-S4 Encounter and progression numbers
- **Project:** Fallen Sky. **Feature or section:** the M03 boss, the M10 survival fight, the defence waves in M13, M15 and M19, NG+.
- **What has already been completed:** proposed phases and telegraphs (M03, R134); proposed defences (Phases 57, 60, 64); the owner's NG+ direction (R76B–E).
- **What information is missing:** enemy stats and HP, phase thresholds, wave sizes; XP and items per reward; the permanent level ceiling and which categories carry over; the difficulty curve; animation requirements (timings, damage windows) for each encounter.
- **Why this information is required:** the directive forbids inventing combat timings, damage windows or ability mechanics.
- **Specific questions that must be answered:** (1) Which existing enemy templates and level bands apply in each chapter? (2) Are M03's three phases approved? (3) Is 310 the final cap? (4) What happens to gold, materials and quest XP in NG+?
- **Required files or assets:** a balance sheet; animation specifications for the RGB MoCap → Cascadeur → Blender pipeline.
- **Other systems affected:** combat, the economy, the R139 authority, the animation studio.
- **Work that can continue without this information:** encounter state models whose interfaces need no placeholder numbers (the Phase 49 pattern); arena terrain.

### MI-FS-S5 Cast and NPC identities
- **Project:** Fallen Sky. **Feature or section:** the 30-NPC overlay (Phase 42), the families, the legacy characters.
- **What has already been completed:** a disabled registry (30 IDs, a coordinator for each of the 55 S quests) and a validator.
- **What information is missing:** the source conversation for NPC Phases 01–41; approval of the proposed names; mapping to `archer_lyra` and to the Three Roads cast; personal-quest scripts and rewards.
- **Why this information is required:** no NPC can be placed or voiced without an identity and a lifetime.
- **Specific questions that must be answered:** (1) Approve or rename the proposed NPCs? (2) Is `archer_lyra` the Lyra of the Threads? (3) Are the Three Roads' Sable Vey, Hesper, Tome, Henut and Livilla the Threads characters, and may their models be reused (FS-D16)? (4) Who speaks in M16?
- **Required files or assets:** the NPC design conversation export; character models and rigs; voice casting.
- **Other systems affected:** world placement, dialogue, quest givers, voice.
- **Work that can continue without this information:** validators; staging by role without binding a character.

### MI-FS-S6 P01 authorization, the replacement world and the region layout
- **Project:** Fallen Sky. **Feature or section:** the replacement world, the P01 preview.
- **What has already been completed:** R113 and R130–R137 specifications; the platform; the construction prompts R113–R128 for every chapter and optional ID.
- **What information is missing:** the owner's T00 scope record (R136 §1); the region layout and connections; for each place (still TBD in the briefs): dimensions, entry and exit points, elevation, cave connections, enemy, NPC and quest placement, hazards, boss arenas; the M04 destination.
- **Why this information is required:** no chapter can run on a 24 m platform, and the briefs' measurements are suggestions, not coordinates (terrain hand-off).
- **Specific questions that must be answered:** (1) P01 is now in progress (the hub assigned it on 2026-11-27); answer R136's D01–D08 when the story session sends them, and confirm R131's separate local-only entry. (2) Terrain owner: Claude, with Gemini only for comparison previews? (3) When does the platform mode switch off: after P01 is accepted? (4) Is there an approved map sketch for the region order after P01?
- **Required files or assets:** the owner's record; any map sketch.
- **Other systems affected:** the checkpoint allowlist, streaming, NPC placement, every quest.
- **Work that can continue without this information:** WP-FS-S2 to S6; story-side contracts; data models; tests.

### MI-FS-S7 Story source materials
- **Project:** Fallen Sky. **Feature or section:** the Word Story Bible and the source conversations.
- **What has already been completed:** the repository holds 125 of 125 IDs (R86).
- **What information is missing:** the latest cumulative Word master (later than v5.6 / R60; only an older v0.1 was found by the story agent); the conversation history of the hourly story task; the conversation for NPC Phases 01–41; the owner's own words behind R64A, R76 and R66.
- **Why this information is required:** to check the manuscript (R85 §8, R86 §3) and confirm the owner decisions were recorded accurately.
- **Specific questions that must be answered:** Where is the latest master? Can the conversations be exported (MI-00)?
- **Required files or assets:** the `.docx`; the exports.
- **Other systems affected:** none at runtime.
- **Work that can continue without this information:** everything that uses the repository as its source.

### MI-FS-S8 Voice, music and animation for the campaign
- **Project:** Fallen Sky. **Feature or section:** the lines selected in R106–R110, the lullaby, the S39 song, character animation for story beats.
- **What has already been completed:** draft line selections.
- **What information is missing:** an approved script per beat; casting; permission to record and to spend voice credits; the melodies; the clip lists.
- **Why this information is required:** none of these exist yet.
- **Specific questions that must be answered:** Are the selections approved? Who is cast? Who composes the music?
- **Required files or assets:** voice and music files; animation clips through the studio pipeline.
- **Other systems affected:** cinematics, captions.
- **Work that can continue without this information:** captions and text stand-ins (the R134 contract).

---

## Group FS-P. Fallen Sky progression and balance

### MI-FS-P1 Balance answers already asked in the repo
- **Project:** Fallen Sky. **Feature:** gear tiers, skill damage curve, Blacksmith v2, level cap remainder, weapon charge.
- **Completed:** code and data with defaults, all behind flags or unmerged (FALLEN_SKY_RECORD B1).
- **Missing:** answers to the questions already written in the repo: 8 in `docs/game3d/GEAR_TIERS_20261119.md` (five tiers with Unique as uncommon; tier-up cost 1 + 1 stones at 100 % with progress kept; drop cadence; what happens to existing items; jewelry crit); 5 in `docs/game3d/SKILL_DAMAGE_CURVE_20261118.md` (back-loaded curve, dagger +30 % cap, the 33 ladder skills, Skill Book display, gear review); Blacksmith v2's open choices (Mythic enchant cap 120 %, Stabilizer protecting failures, armor perk +4 defense, Chosen's Evolution-Stone path, ascension for other rarities); whether banked XP at the old cap is paid out and whether ascension opens above 100; whether full-mastery hold double damage is a passive and PvE only.
- **Why required:** the repo forbids silent rebalancing; flags stay off until answered.
- **Questions:** as listed; then "turn gear tiers on?" and "turn the curve on?".
- **Files:** none. **Affected:** loot, Blacksmith, combat, saves, vault deploy order.
- **Can continue:** WP-FS-01, WP-FS-03 (approved part), tests under the flags.

### MI-FS-P2 Assets for gear, armor, mounts and companions
- **Project:** Fallen Sky. **Feature:** gear-tier looks (192 placeholder keys), the Painted Fan weapon, armor gaps (Nightscale and Frostwarden chests and pants show skin; Adam has no Moonfeather; Crescent Moon pauldrons, pendant, gems and hair unplaced), mount cosmetic sets, companion boosts.
- **Completed:** integration points and placeholder keys.
- **Missing:** the models, icons and rigs; which sets are final; the companion boost rules (hands, heart, mind, feet; max 25).
- **Why required:** placeholders never count as finished assets (directive §7).
- **Questions:** which armor sets ship; who makes the art (Meshy, Blender, another agent); companion boost numbers.
- **Files:** GLB models and icons. **Affected:** equipment, Blacksmith, character screen. **Can continue:** everything else.

### MI-FS-P3 Achievements
- **Project:** Fallen Sky. **Feature:** achievements. **Completed:** nothing (no design or code found).
- **Missing:** whether the game has achievements; the list; rewards; display.
- **Why required:** the directive lists achievements; there is nothing to implement.
- **Questions:** wanted at all? If yes, which categories and rewards?
- **Files:** none. **Affected:** quests, rewards, UI. **Can continue:** everything.

---

### MI-FS-P4 Reward transaction integration and provider evidence (open)
- **R152 evidence update:** [R152 schema reconciliation](../game3d/threads-of-our-pain/R152_BASE44_SCHEMA_RECONCILIATION_PREFLIGHT.md). All 84 source definitions parse, 83 distinct names vs 78 registered; five source-only (four reward/vault definitions and companion preferences). Discovery absent from both sets; root cause and historic data status unknown. Targeted staging registration and rollback approval needed; no blanket sync.
- **R151 evidence update:** [R151 Base44 intake](../game3d/threads-of-our-pain/R151_BASE44_PROVIDER_INTAKE_AND_CORRECTION_GATES.md). Actual Node runs completed (14 compatibility passes, 1 failing TODO, 6 diagnostic observations); app schema API omits five Game3D entities and confirms three named schemas not found. Deployed function listing truncated. Provider guarantees, schema reconciliation and disposable scope remain open.
- **Project:** Fallen Sky. **Feature:** FS-22 / WP-FS-09 / FS-D14, Blacksmith and quest reward authority.
- **Completed:** R139 contract; R140–R149 isolated fixtures; [R150 gap map](../game3d/threads-of-our-pain/R150_REWARD_AUTHORITY_RUNTIME_GAP_MAP.md) maps all 20 cases and reproduces three client-path gaps using actual source excerpts with injected I/O.
- **Missing:** deployed SDK and conditional-update/upsert guarantees for Game3D entities; actual discovery function/schema; disposable staging scope and checkout runner; approval of legacy ambiguous-ID reconciliation, restore semantics, and client/server application strategy.
- **Why required:** no proof of multi-record atomicity or safe legacy migration; local receipt replay can double-charge in the diagnostic harness. Preserve guest-only entry and existing upgrades.
- **Questions:** Can the implementation lead verify deployed provider capabilities on disposable records, obtain the exact discovery source and run the R147/R150 Node suites? After evidence, does owner authorize a narrowly scoped implementation-ready package (no live migration until separately reviewed)?
- **Files:** provider/deployment evidence and test outputs; no credentials in repo. **Affected:** Character Vault, itemUpgrade, material inventory, discovery claims, quest rewards, NG+ and backup restore. **Can continue:** exact checkout tests, non-mutating provider review, other ready packages.

## Group FS-W. Fallen Sky world and bosses

### MI-FS-W1 The world that replaces the platform
- **Project:** Fallen Sky. **Feature:** world entry after `FALLEN_SKY_PLATFORM_MODE`.
- **Completed:** the platform staging (PR #382); deletion of the old caves, dungeons and vortex (2026-11-25); the story-driven terrain hand-off (`CLAUDE_TERRAIN_HANDOFF.md`); low-poly construction standards and prompts (R87, R87A/B, R113–R128).
- **Missing:** the rebuild order after P01 (the M01–M03 opening forest, now in progress), when the platform turns off, and the spawn point. (Answered on 2026-11-27: the old map is not used; the map is being recreated.)
- **Why required:** every world-dependent system (quests, enemies, bosses, gliding off cliffs, swimming, gates) is unreachable until a world loads.
- **Questions:** (1) Which region follows P01? (2) Does the platform stay until P01 is accepted? (3) Where does a new character spawn?
- **Files:** none needed for (1)–(3). **Affected:** all world systems, WebGPU and low-poly checks. **Can continue:** platform-safe work, fixtures, tests, the WebGPU branches.

### MI-FS-W2 Dungeons and bosses
- **Project:** Fallen Sky. **Feature:** dungeon progression and boss difficulty.
- **Completed:** dungeon and boss engine remnants (`axe/dungeons/AXEDungeonSystem.js`, `boss/*`, dragon patterns); the old scenes are deleted.
- **Missing:** for each dungeon: entrance and exit, traversal, encounters, traps, boss mechanics and phases, completion conditions, environment description, rewards, level gate; the "secret mountain boss" named in the 2026-11-13 audit.
- **Why required:** boss mechanics must not be invented (directive §4).
- **Questions:** which dungeons the campaign uses and where (see the story group for any dungeon named in the chapters); which bosses; their phases.
- **Files:** a written spec or the originating conversation. **Affected:** rewards, achievements, NG+ scaling. **Can continue:** engine hooks that need no content.

---

## Group FB. Fantasy Battle

### MI-FB-01 Story canon, names and the UI kit sources
- **Project:** Fantasy Battle. **Feature:** story, party identities, UI templates.
- **Completed:** a six-chapter arc wired as text, marked "proposed narrative expansion" (`docs/fantasybattle/SAPPHIRE_CAMPAIGN_FOUNDATION.md` l.3); 47 plates plus a save plaque drawn from Base44-hosted images.
- **Missing:** the owner's story, campaign, party, skills, saves and menu design; who Aoi, Lyria and the Warden of Tides are and what the Moonlit Saber and Sapphire Blossom are; how the family concept (Father, Artemis/Diana, Sinala, Son) maps to the playable party; confirmation that the 47 hosted plates are the approved originals (the code labels them with the owner's file names, `sapphireArt.mjs`), and whether their source files should be committed so phones show the originals too (FB-D4).
- **Why required:** the six chapters are an agent proposal; the directive forbids inventing story; the approved images must be used directly on every screen.
- **Questions:** Is the six-chapter arc acceptable as canon, or replaced? Are those names characters, items or places? Is the family the party? Which recruit names replace "Grove Archer", "Pilgrim Warden", "Mist Scout"? Are the hosted plates the approved set, and is plate 05's label removal acceptable?
- **Files:** the design conversation (MI-00 B.2–3); the plates' source files only if they should be committed. **Affected:** story, party, quests, UI text. **Can continue:** WP-FB-01 to 03.

### MI-FB-02 Dungeons
- **Missing:** the dungeon list; for each: region and entrance, traversal, encounters, traps, boss mechanics, completion conditions, rewards, environment description. Is the "Warden of Tides" a dungeon boss? **Completed:** an encounter-entrance screen (23) only. **Why:** none designed. **Affected:** map, encounters, rewards. **Can continue:** wilds encounters.

### MI-FB-03 Skill upgrades and progression
- **Missing:** skill-upgrade rules (ranks, costs, effects, persistence); skill sets for the Warden, the Scout and the leader; level cap; stat curves; class identities. **Completed:** four bow skills unlock by level; attribute points persist. **Why:** "skill upgrades persist" (directive §6) has nothing to persist yet. **Affected:** skillbook screen 12, combat, saves.

### MI-FB-04 Quests and rewards
- **Missing:** the reward for each quest (claims give nothing today, by the proposal's design); NPC identities and places (Trail Keeper, travelers); "The Last Escort" objectives and ledger item; dialogue approval; branching and consequences. **Affected:** progression, inventory, journal. **Can continue:** encounter rewards as they are.

### MI-FB-05 Assets
- **Missing:** final character, companion, enemy and boss art and rigs; item icons per item id (`public/fantasybattle/sapphire/items/<id>.webp`); map geometry and the 24 anchor transforms (PR #423); audio (all battle sounds are synthesized defaults); cinematics. **Who makes them:** the docs assign environment and character art to Claude and Gemini; confirm. **Can continue:** the integration points exist.

### MI-FB-06 Achievements, relationships, tutorial, bestiary
- **Missing:** the content and rules behind screens 28, 30, 34 and 24. **Completed:** UI shells. **Can continue:** everything else.

### MI-FB-07 Economy and enemy scaling
- **Missing:** approved prices, drops, XP, gold and difficulty curves (all provisional). **Affected:** PR #423, equipment, shop.

---

## Group DA. Duelist Adventure

### MI-DA-01 Ranked
- **Completed:** five placeholder cards ("Ranked servers are not deployed", `menu/templateCatalog.mjs`). **Missing:** rating model (Elo or tiers), placement, seasons, rewards, matchmaking rules, identity requirements, ladders per mode. **Why:** server-authoritative ranking needs accounts and persistence. **Affected:** `server/duelist/progress.mjs`, menus, gold, mastery. **Can continue:** unranked servers, bots, practice.

### MI-DA-02 Custom games
- **Completed:** placeholder cards (browse lobbies, tournament room, rulesets). **Missing:** lobby visibility and codes, host controls, tunable rules (bots, score limit, class limits, map, friendly fire), tournament format, ranked or not. **Why:** the server must enforce the rules. **Affected:** `server.mjs`, protocol, menus. **Can continue:** private story crews (the existing room-code pattern).

### MI-DA-03 Battle Shop beyond Damage I–II
- **Completed:** Damage I and II, 50 item ids with art. **Missing:** tier stats, prices and effects for Defense, Ability, Health, Tenacity, Hybrid, Support, Counter and Relic; confirmation of the provisional numbers. **Why:** effects need server handlers and counterplay. **Can continue:** nothing beyond Damage II.

### MI-DA-04 Class progression
- **Completed:** two implementations (per-class levels 1–20; mastery 1–25 plus a match boost, now in `main`). **Missing:** which one the owner wants; rewards per level; whether online and offline progress merge. **Why:** 4 tests fail and the server store depends on it.

### MI-DA-05 Story missions
- **Completed:** Contraband and Saltmarch; rewrite PR #340. **Missing:** the final plot and names (the current ones are agent inventions "for owner review"), casting and recordings for #340's 27 lines, a third mission outline, whether classes are used in missions. **Files:** the owner's guard and enemy models. **Can continue:** voice and engine work.

### MI-DA-06 Animation requirements
- **Completed:** clips with timings in `core/cuts.mjs` and KIT_FIXES. **Missing:** frame timings, contact and damage windows, root motion and loop points for: strafe and backpedal loops, Levitate (caster and victim), Mend, Quickstep aura, Sanctuary, Leap Strike, Repulse, Grip, double jump, air dash, per-class finishers, death and knockdown variety, a bow set, a held-in-grip pose. **Why:** the animation pipeline must not invent combat timings (directive §14). **Can continue:** the archer package in the studio session.

### MI-DA-07 Armour
- **Missing:** armour sets per class, visual rules, LOD budgets, stat-neutral or not. **Files:** armour GLBs. **Can continue:** PR #384's quality profiles.

### MI-DA-08 Training demonstration scripts
- **Completed:** a demonstration catalog per class. **Missing:** approved scripts and timings for each ability, special and finisher. **Can continue:** the existing catalog.

---

## Group X. Cross-project

### MI-X-01 Which stories are canon
- **Project:** all. **Completed:** the older repo holds the "Fractured Divinity" quest script for Game 3D (10 arcs; "script and viewer only" per `docs/game3d/SYSTEMS_AUDIT_2026-11-13.md`) and a "Night Run" street-racer story bible; Issue #309 proposes an "Artemis 2D idle RPG".
- **Missing:** whether "Fractured Divinity" is part of Fallen Sky's canon, superseded by "The Threads of Our Pain", or a separate project; whether #309 is a fourth game.
- **Why required:** to avoid importing or ignoring material by guess.
- **Questions:** keep, merge or retire each? **Affected:** Fallen Sky quests. **Can continue:** everything.

### MI-X-02 Guest identity for public multiplayer
- **Project:** Fallen Sky and Duelist. **Completed:** local servers, a guest public host, reference authority (issue #298). **Missing:** hosting target and `VITE_DUELIST_WS_URL`, a server-issued guest identity with abuse limits, capacity (20 or 100 per mode), and how guest progress relates to future accounts. **Why:** spoofable identities would break server authority. **Can continue:** local play, bots, reference tests.
