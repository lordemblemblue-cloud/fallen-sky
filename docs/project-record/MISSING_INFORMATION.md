# Missing-information requests

Written 2026-11-27 from the recovery baseline (`main` `ab03f50a`). Each request follows the owner directive's §11 format. Connected questions are grouped so one return to the right AI conversation can answer a whole group. Nothing below was invented to fill a gap: where the record says "missing", no source reachable from here contains it ([SOURCES.md](SOURCES.md)).

**How to answer:** reply in any form (text, file, export, screenshot). Each answer gets committed with its date and "owner-approved", and the dependent backlog rows move to Implementation-ready ([AGENT_HANDOFF_PROTOCOL.md](AGENT_HANDOFF_PROTOCOL.md) §7).

| Group | Requests | Unblocks |
|---|---|---|
| 0. Conversation exports | MI-00 | Most of the groups below |
| FS-S. Fallen Sky story, quests, world | MI-FS-S… (from the story reader) | The campaign, the world rebuild, cinematics |
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
    2. Fantasy Battle: the design conversation(s) for story, campaign, party, skills, saves and the main menu; the conversation where the UI templates were approved, with the original image files (the 48-screen kit, the "Fantasy Adventure UI Design Atlas" and the "modular template batches 01–18").
    3. Fantasy Battle: who or what "Aoi", "Lyria", "Warden of Tides", "Moonlit Saber" and "Sapphire Blossom" are (they appear only as image names).
    4. Duelist Adventure: the conversations behind the Gemini HQ, escort-map, CTF and arena packages, and any original class, ranked, custom-game or shop design.
  - **C. Let a Claude session read the signed-in conversations in the app's built-in browser**, read-only: no sending, no settings, no downloads. Only with your explicit "yes" for each service.
- **Required files or assets:** the export zips, or the PDFs and files listed in B.
- **Other systems affected:** every "Awaiting information" row in [BACKLOG.md](BACKLOG.md).
- **Work that can continue without this information:** all Ready packages in [WORK_PACKAGES.md](WORK_PACKAGES.md) (fixes, tests, verification, branch landings).

---

## Group FS-S. Fallen Sky story, quests and world

<!-- FS-S requests inserted here -->

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

## Group FS-W. Fallen Sky world and bosses

### MI-FS-W1 The world that replaces the platform
- **Project:** Fallen Sky. **Feature:** world entry after `FALLEN_SKY_PLATFORM_MODE`.
- **Completed:** the platform staging (PR #382); deletion of the old caves, dungeons and vortex (2026-11-25); the story-driven terrain hand-off (`CLAUDE_TERRAIN_HANDOFF.md`); low-poly construction standards and prompts (R87, R87A/B, R113–R128).
- **Missing:** the go-ahead and order for rebuilding: which region first (the docs prepare the M01–M03 opening forest as P01), when the platform turns off, whether any old Wolfveil geometry returns, the spawn point.
- **Why required:** every world-dependent system (quests, enemies, bosses, gliding off cliffs, swimming, gates) is unreachable until a world loads.
- **Questions:** (1) Is P01 (M01–M03 opening forest) the first region to build? (2) Does the platform stay until P01 is accepted? (3) Do any old Wolfveil areas stay as they were?
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
- **Missing:** the owner's story, campaign, party, skills, saves and menu design; the original UI image files; who Aoi, Lyria and the Warden of Tides are and what the Moonlit Saber and Sapphire Blossom are; how the family concept (Father, Artemis/Diana, Sinala, Son) maps to the playable party.
- **Why required:** the six chapters are an agent proposal; the directive forbids inventing story; the approved images must be used directly on every screen.
- **Questions:** Is the six-chapter arc acceptable as canon, or replaced? Are those names characters, items or places? Is the family the party? Which recruit names replace "Grove Archer", "Pilgrim Warden", "Mist Scout"?
- **Files:** the original kit images, the design conversation (MI-00 B.2–3). **Affected:** story, party, quests, UI text. **Can continue:** WP-FB-01 to 03.

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
