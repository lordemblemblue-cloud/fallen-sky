# Fantasy Battle: development record

Baseline: `lordemblemblue-cloud/fallen-sky` `main` at `ab03f50a` (2026-11-27 18:03 -0500). Written 2026-11-27 by the project-recovery session. Legend and method: [README.md](README.md).

Source labels: **[code]** a file on `main`; **[doc]** a repo document; **[PR #n]** a pull request (merged by the owner's account unless marked open); **[note]** a Claude session hand-over note in the hub's shared notes folder; **[mem]** a hub memory note (dated; re-checked against `main` where it says so). **checked** = the recovery session or its reader opened the code or ran the test on `main` itself; **claimed** = stated in a PR body or note and not re-run.

## 0. Where it stands

- `/fantasy-battle` is no longer the small archer duel of PR #310. It renders **Sapphire Adventure**: a 3D exploration world (Sapphire Wilds and Sanctuary) with turn-based 2D layered-puppet battles, a four-member party, a six-chapter campaign, equipment and guest saves [code `src/routes/fantasy-battle.jsx`, `src/components/fantasybattle/SapphireAdventure.jsx`; PR #398, #399, #403, #411; checked].
- The hub flag `FANTASY_BATTLE_RELEASED = true` (commit `8046cf04`, 2026-11-27 05:50) makes the route and hub tile live outside dev [code `src/components/games/hub/gamesHubCatalog.mjs:13`; checked]. No browser, mobile or GPU acceptance evidence exists for any chapter [doc `docs/fantasybattle/SAPPHIRE_UI_INTEGRATION.md` QA matrix "pending"; PR bodies].
- The owner's own design conversations for this game (story, campaign, party, skills, saves, menu, and the approved UI kit as source files) are **not in the repository and were not reachable** from this machine [see [SOURCES.md](SOURCES.md)]. The only owner words that reached a Claude session are listed in §1 [note `fantasy-battle/OWNER_INPUT_VS_DEFAULTS.md`].
- Logic tests: 121/121 pass on `ab03f50a` (5 files), 133/133 on PR #423's branch (merged into `main` at 18:49 as `b25ee6af`); hub 14/14 [checked by the reader, `tests/fantasybattle-*.test.mjs`, `tests/games-hub-cross-scroll.test.mjs`]. The full-suite run for this record had no Fantasy Battle failures [checked, see [BACKLOG.md](BACKLOG.md) testing section].

## 1. Approved and implemented

Owner-specified (relayed by the hub 2026-11-23; quoted in [note `fantasy-battle/OWNER_INPUT_VS_DEFAULTS.md`]): KOTOR-inspired "wait and attack" turn-based combat; a live 2D art image of combat; start with a female archer; the owner's archer parts sheet (`tools/fantasybattle/source/archer-parts-sheet.webp`); and the engine spec.

The engine spec itself was found during this recovery as the owner's Google Doc "2D Mesh-Warping & Combat Animation Engine: Master Interactive Prompt & Spec" (owner's Google Drive, 2026-11-23; read-only, not copied into the repo). It asks for: a parent-child layered rig with explicit joint pivots and dynamic Z-order; triangle-mesh warping toward a look target with 2.5D parallax and velocity smear; procedural breathing, spring-damper hair, cloth and weapon trails; auto-blink and the expressions `neutral`, `focused`, `attackShout`, `hurt`; skills as JSON (`id`, `name`, `totalDuration`, `blendOutTime`, `cancelWindowStart`, phases anticipation / active / hitStop / recovery with easing, per-bone rotation, offset, `smearStretch`, `zIndex`, and events `onHitFrame`, `spawnSlashArc`, `screenShake`, `playSFX`, `expression`); a hitbox active only in active frames; cancel windows with an input buffer; `onAudioEvent`; `setLayerTexture`; the API `setLookTarget`, `triggerExpression`, `playSkill`, `loadSkillJSON`; a debug overlay with sliders; and a download panel (PNG layers or zip, rig and skill JSON, standalone HTML player, GIF or WebM). Its three sample skills are sword skills on hotkeys 1–3; the hub asked #310 for three bow skills instead, which is a hub choice, not the owner's. It names TypeScript as one option; the repository allows JavaScript only (AGENTS.md), so #310 used JavaScript.

| Item | Evidence | Verification |
|---|---|---|
| Turn-based archer battle engine with puppet rig and JSON skill timelines | [PR #310] `FantasyBattleStage.js`, `core/puppetCore*`, `core/skillTimeline.mjs`, `data/archerRig.json`, `data/bowSkills.json` | logic tests pass (puppet-rig 8/8, skill-timeline 9/9, battle-rules 9/9) [checked]; browser NOT RUN |
| The owner's approved UI images drawn directly with live controls on top, 48 screen ids | [PR #398, #403] `sapphireArt.mjs` `STAGED_ORIGINAL_ART` (47 plates + save plaque, 48 Base44 media URLs), `SapphireAdventure.jsx` `useStagedOriginal` | sapphire-art 62/62 [checked]; 48 URLs counted [checked]; only on wide screens, see §3 |
| Main menu with New / Continue / Load / Settings; Continue only with a valid save; Load lists real saves | `SapphireAdventure.jsx` (Continue `disabled={!recent}`), `core/adventureState.mjs:115` `mostRecent()` filters `status==='valid'`, `readSlots()` | logic test "corrupted saves never become loadable" passes [checked]; UI-level test missing |

Approval caveat: the owner merged #398–#411, but their docs call the story and balance proposals (§7). Merged is recorded here as "accepted into main", not as design approval of the proposed content.

## 2. Approved and implementation-ready

None fully owner-specified was found that is not already built. The ready packages are verification and hardening work (FB-WP1 to FB-WP4 in [WORK_PACKAGES.md](WORK_PACKAGES.md)), not new content.

## 3. Approved but partially implemented

- **Approved UI templates used directly:** the originals show only when the viewport is wide (`wideOnly`, aspect ≥ 4:3 and at least 850×500) and the remote image loads; phones and load failures fall back to SVG reconstructions (`uiCatalog.mjs` `makeSapphireTemplate`) [code `SapphireAdventure.jsx:89`; checked]. The directive (§6) says to use the original image, not a recreation. The plates are hosted on Base44 media, not committed [PR #403; checked: 48 remote URLs].
- **Owner's engine spec, debug and download features:** the overlay, sliders and download panel (PNG layers, JSON, standalone player, WebM) were built in #310's Studio, which is no longer routed, so they exist but players and the owner cannot reach them; the spec's sword sample skills were never built (bow skills were, at the hub's request) [note `fantasy-battle/HANDOVER.md`; code `StudioPanel.jsx`, `exportKit.js`, `standalone/`]. Decision FB-D6.
- **Plate 05 (character statistics)** was edited to remove baked example labels [PR #403 body; claimed]. Needs the owner's acceptance (§7).
- **Campaign:** six chapters (Whispering Grove → The Last Unsent Message) are wired as journal and dialogue text with encounter-based objectives; no physical NPC or relay placement in the world [doc `SAPPHIRE_CAMPAIGN_FOUNDATION.md`; code `core/campaignQuests.mjs`, `core/groveStory.mjs`; reader-checked].
- **Equipment art:** generic procedural/vector icons; the item-art registry is empty by design [code `core/itemArtwork.mjs`; doc `EQUIPMENT_EXPANSION.md`].

## 4. Approved but blocked by missing dependencies

- 24 world interaction anchors (PR #423 `worldInteractions` registry, merged; all transforms `null`): need approved map geometry from the environment owner [doc `WORLD_INTERACTION_HANDOFF.md`, added by #423].
- Item icons per item id (`public/fantasybattle/sapphire/items/<id>.webp`): need delivered art [doc `EQUIPMENT_EXPANSION.md`].
- Unique character, companion, enemy and boss models: everything shares the archer rig with tinted SVG layers [doc `SAPPHIRE_UI_INTEGRATION.md`; assets `public/fantasybattle/companions/`, `enemies/`].

## 5. Incomplete design (do not invent; see [MISSING_INFORMATION.md](MISSING_INFORMATION.md) group FB)

- Story beyond the proposed arc; the family concept (Father, Artemis/Diana, Sinala, Son) is explicitly "not a completed identity mapping" [doc `SAPPHIRE_CAMPAIGN_FOUNDATION.md`].
- Names that exist only as image file labels: Aoi, Lyria, Warden of Tides, Moonlit Saber, Sapphire Blossom [code `sapphireArt.mjs` `source` fields].
- Dungeons: none designed; screen 23 "Dungeon Entrance" is an encounter preview [code `SapphireAdventure.jsx` ~l.514].
- Skill upgrades: not designed; skills unlock by level only, so "skill upgrades persist" (directive §6) has nothing to persist yet [code `adventureState.mjs` `availableActions`].
- Quest rewards: claims are acknowledgement only, by design of the proposal [doc `SAPPHIRE_CAMPAIGN_FOUNDATION.md`]; side quest "The Last Escort" is design-only.
- Achievements (screen 28), relationships (30), tutorial (34), bestiary (24): UI shells exist; content and rules unconfirmed.
- Economy and enemy scaling: all numbers marked provisional [doc `EQUIPMENT_EXPANSION.md`; PR #423 body].

## 6. Awaiting assets

Final character, companion, enemy and boss art and rigs; item icons; map geometry; audio (all battle sounds are synthesized defaults); cinematics; the original 48-screen kit, the "Fantasy Adventure UI Design Atlas" and the "modular template batches 01–18" as source files (git holds only 6 backgrounds and 4 illustrations under `public/fantasybattle/sapphire/`) [reader-checked].

## 7. Awaiting owner decisions

| # | Decision | Source |
|---|---|---|
| FB-D1 | Confirm the game's scope: the Sapphire Adventure RPG now in `main`, or the smaller duel the 2026-11-23 brief described | [code] vs [mem `fantasy-battle-20261123.md`] |
| FB-D2 | Approve or replace the proposed six-chapter story; map the family concept to the playable party; confirm recruit names (Grove Archer, Pilgrim Warden, Mist Scout are placeholders) | [doc `SAPPHIRE_CAMPAIGN_FOUNDATION.md` l.3] |
| FB-D3 | Was `FANTASY_BATTLE_RELEASED = true` intended before browser QA? | [code `gamesHubCatalog.mjs:13`, commit `8046cf04`] |
| FB-D4 | Original-image policy: keep Base44-hosted, wide-only plates with SVG fallback, or commit the originals and use them on every screen size; accept the plate 05 label removal | [PR #403] |
| FB-D5 | Quest-claim rewards, loot tables, XP, gold and prices | [PR #423 body; doc `EQUIPMENT_EXPANSION.md`] |
| FB-D6 | Restore the owner's engine-spec Studio and download panel (unrouted since Sapphire took the route) or leave it out | [note `fantasy-battle/HANDOVER.md`] |
| FB-D7 | PR #423 (loot economy) was merged at 18:49 although its body said CI and visual testing were pending and "do not publish": confirm it may be published as it is, and confirm its provisional rewards | [PR #423] |
| FB-D8 | Implementer defaults from #310 (action names Quick Shot / Radiant Shot / Triple Volley / Guard, Focus 0–3, damage formula, the "Shade Archer" rival, look and sounds): keep or replace with the recovered design | [note `OWNER_INPUT_VS_DEFAULTS.md`] |

## 8. Awaiting technical verification

- Browser acceptance on `/fantasy-battle` (title, new game, save, load, continue, battle, level-up, equipment, quest) on desktop and phone, WebGPU and WebGL: NOT RUN by anyone with recorded evidence [doc `SAPPHIRE_UI_INTEGRATION.md`].
- `npm run build` and `npm run lint` for the Fantasy Battle changes: NOT RUN for this record.
- Base44 deployment and availability of the Base44-hosted plates.
- Save integrity across tabs: stale-stamp protection is not atomic across tabs; no cloud save [reader-checked `adventureState.mjs`].

## 9. Superseded or rejected

- The two-ally prototype: superseded by the four-member roster [doc `SAPPHIRE_UI_INTEGRATION.md`].
- The hub's invented "part 2" list (party, wolf enemies, progression): withdrawn 2026-11-27; part 2 is on hold until the owner's design is recovered [note `fantasy-battle/HANDOVER.md`].
- PR #310's standalone page and Studio (`FantasyBattlePage.jsx`, `StudioPanel.jsx`): no longer routed; known bug left unfixed there (`FantasyBattleStage.recordClip()` restarts a battle in progress) [note `HANDOVER.md`]. Decision FB-D6.

## 10. Open PRs and branches

| PR / branch | State | What it adds | Notes |
|---|---|---|---|
| #423 `fantasybattle-loot-economy` (`2ff60c21`) | **merged 2026-11-27 18:49** (`b25ee6af`), after this record's baseline | first-victory gear for 14 encounters, treasure catalog, 24 planned anchors (transforms `null`), guest checkpoint recovery | 133/133 logic tests passed on the branch [checked by the reader]; its body said CI and visual testing were pending and "do not publish"; rewards provisional |
| `claude/fantasy-battle-20261123` (`feafc2f4`) | merged as #310 | the duel foundation | worktree clean |
| `claude/games-hub-cross-scroll-20261123` (`bfeaae7d`) | merged as #311 | the left/right game menu | memory said "not merged": stale [checked: ancestor of `main`] |

Related, separate project: issue #309 "Artemis 2D idle RPG" (open since 2026-11-23, no implementation in `main`). It is not Fantasy Battle; do not confuse it with Artemis/Diana in Fantasy Battle's family concept.

## 11. Games hub (shared entry, recorded here)

`src/pages/GamesHub.jsx`, catalog `src/components/games/hub/gamesHubCatalog.mjs`, UI `GamesCrossScroll.jsx`. Order: Duelist Adventure (`/duelist`), Fallen Sky Online (`/gameview`, beta-experimental), Fantasy Battle (`/fantasy-battle`, ready). 14/14 tests pass [checked by the reader]. Open: converting the two Base44 hero PNGs to WebP needs the owner's OK [mem `games-hub-cross-scroll-20261123.md`]; open PR #346 (startup hangs in the hub and Duelist) is recorded in the Duelist record.
