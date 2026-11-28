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
| FB-D6 | **Decided:** the owner answered "Yes, keep it" (relayed by the hub on 2026-11-27) to keeping the archer battle and its Studio on a test page. Built on `claude/fantasy-battle-studio-page-20261127` (`7ab676cf`, pushed, not merged): route `/fantasy-battle-studio` with the debug overlay, sliders and download panel, plus the fix for Record WebM restarting a battle. It opens when `FANTASY_BATTLE_RELEASED` is true or in development, so after a merge it is reachable by URL on the published site (see FB-D3). Pending: merge | [session `local_eeaafc19` message, 2026-11-27; branch checked] |
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
- PR #310's standalone page and Studio (`FantasyBattlePage.jsx`, `StudioPanel.jsx`): not routed on `main`; the owner chose to keep them on a test page (FB-D6), built with the `recordClip()` restart fix on `claude/fantasy-battle-studio-page-20261127` (`7ab676cf`), not merged.

## 10. Open PRs and branches

| PR / branch | State | What it adds | Notes |
|---|---|---|---|
| #423 `fantasybattle-loot-economy` (`2ff60c21`) | **merged 2026-11-27 18:49** (`b25ee6af`), after this record's baseline | first-victory gear for 14 encounters, treasure catalog, 24 planned anchors (transforms `null`), guest checkpoint recovery | 133/133 logic tests passed on the branch [checked by the reader]; its body said CI and visual testing were pending and "do not publish"; rewards provisional |
| `claude/fantasy-battle-20261123` (`feafc2f4`) | merged as #310 | the duel foundation | worktree clean |
| `claude/games-hub-cross-scroll-20261123` (`bfeaae7d`) | merged as #311 | the left/right game menu | memory said "not merged": stale [checked: ancestor of `main`] |

Related, separate project: issue #309 "Artemis 2D idle RPG" (open since 2026-11-23, no implementation in `main`). It is not Fantasy Battle; do not confuse it with Artemis/Diana in Fantasy Battle's family concept.

## 11. Games hub (shared entry, recorded here)

`src/pages/GamesHub.jsx`, catalog `src/components/games/hub/gamesHubCatalog.mjs`, UI `GamesCrossScroll.jsx`. Order: Duelist Adventure (`/duelist`), Fallen Sky Online (`/gameview`, beta-experimental), Fantasy Battle (`/fantasy-battle`, ready). 14/14 tests pass [checked by the reader]. Open: converting the two Base44 hero PNGs to WebP needs the owner's OK [mem `games-hub-cross-scroll-20261123.md`]; open PR #346 (startup hangs in the hub and Duelist) is recorded in the Duelist record.

## 2026-11-27 — Owner-requested exploration HUD cleanup

Owner screenshot and instructions: move the player health/experience status to the upper-left, journal below; hide exploration party in local play and show only actual other human party members in a future online session; remove bottom navigation strip, top-center region banner and nearby-interaction strip; retain minimap and Jump/Skills/+ controls. Implemented on `fix/fantasy-battle-clean-exploration-hud-20261127`, awaiting technical verification and owner merge. Screen 10 uses four isolated crops of the actual original artwork, no full plate or reconstructed ornamental fallback. AI combat roster remains unchanged; no online membership source exists in the current local guest game. Compact touch controls and a contextual E button retain access without the removed strip. Crop boundaries are screenshot-derived and require live visual verification; no changes to saves, combat, rewards, renderer or other games. See regression test `tests/fantasybattle-clean-exploration-hud.test.mjs`.

## 2026-11-27 — Owner follow-up: recovery placement and new goddess appearance

The owner confirmed the merged #456 HUD in a screenshot and requested removal of the entire desktop lower-right action cluster, moving its recovery + to the left of the minimap, and a slightly lower Quest Journal. The branch `fix/fantasy-battle-hud-recovery-20261127` isolates the original + crop, retains existing recovery navigation and eligibility, and moves touch-only jump into the left movement cluster; the Skillbook remains accessible by K or pause. Current portrait in exploration and the original combat HUD is switched to a session-cached 256px capture of the exact owner-supplied goddess GLB from merged #446 (`world/celestialAssets.mjs`). The renderer is disposed after capture, and a neutral initial appears instead of the obsolete face on failure. The capture's orientation and media availability need live validation; no replacement art was invented. Other portrait/palette pages are unchanged.

**Combat actor replacement: blocked for visual calibration/rig retargeting.** #446 confirms that the 20,848-triangle skinned goddess has Mixamo-named bones and zero animation clips. `FantasyBattleStage.js` currently drives a 2D textured puppet via `PuppetView`, `SkillPlayer`, sockets, hitboxes and frame events; changing the URL is insufficient. Use the exact goddess, separate celestial bow and quiver from #446. Deliver calibrated face-forward/floor transform, animation clips or a verified layer export from the exact asset, weapon grip and back placement, idle/aim/release/guard/hurt/victory/defeat motion; preserve the existing timing, hit and action authority, opponent/companion visuals, combat mechanics and renderer lifecycle. Test WebGPU/WebGL, mobile, restart, missing assets and pose correctness before replacing the fighter. Do not introduce T-pose, guessed identity or unrelated artwork. Current battle actor remains unchanged; portrait code is implemented but not live-verified. No merge/publish.

## 2026-11-27 — Load Game and Continue glass redesign, recovery follow-up

Owner requested right-aligned shaded glass information and visible Continue loading progress. Supersedes conflicting #463 on a fresh main base, preserving main's corrected companion-gift and exploration tests. Screens 02/35 use existing clean scenic artwork and one right glass pane, actual local slots and metadata, new goddess portrait, real three-stage readiness bar (not byte percentage), backup and cancel controls. Additional eight-second explanatory hint never advances progress; timeout/error uses matching glass retry or title panel, delayed startup timer cleared on failure, late duplicate error and premature restore ignored, battle arena acknowledgement scoped to active load. Prior checkpoint/retry logic and saved profile schema retained. Eleven focused tests included in existing CI suite. Previous head bd1805f passed 9/9 loading, 137/138 Fantasy Battle, build/security; new head needs fresh CI and visual verification. No merge or publish.

## 2026-11-27 — Owner-requested UI-wide sapphire glass refinement

All 48 registered screen IDs now have an explicit glass presentation family (4 title/creation, 7 right-side, 24 workspace, 1 pause, 2 HUD, 9 event, 1 toast). Load/Continue remain in the right-hand panel introduced by merged #471; Settings, NPC dialogue, Save Game, Confirmation and general Error now use the same right-side layout, with actual data and existing callbacks. Save retains slot choice, overwrite confirmation, combat restriction, export/backup, and secondary navigation; settings retains all six categories and existing controls. Original plates remain registered and are used for complex workspaces, title, pause, events and combat/exploration when applicable; fallback panels share the glass finish, original live detail regions receive a subtle contrast layer, focus indicators and compact notifications. No art regeneration, full-frame blur on live HUDs, new gameplay, save schema or combat authority changes. UI 41 uses non-blocking status card; existing original save plaque remains. Branch `fix/fantasy-battle-ui-glass-system-20261127`; eight new targeted tests included in the existing regression entrypoint. Source checks only at handoff; full CI and visual acceptance pending. Title/creation and blacksmith-specific structural changes remain on other PRs; coordinate before merging. Review all 48 screens at desktop, narrow landscape and missing-art fallback; verify keyboard/touch, real save/load, overwrite/cancel, equipment comparison, merchant and recovery actions, combat/exploration readability, no cropping or duplicate controls.

### UI glass second pass
Initial #475 head 7f7079b verified 148/148 Fantasy Battle tests, production build and Base44 gate. Added compact fallback flow at original-media breakpoint (under 850 px width, 500 px height, or 4:3 aspect), hides only generated fallback frame at those sizes, leaves loaded original geometry and HUD untouched. Right-side glass content cannot shrink into adjacent rows, long strings wrap, portrait margins and settings input widths constrained, scroll gutters stable, touch controls at least 44 px in new compact menus. Seven previously legacy live small hero portrait call sites use existing shared one-shot celestial GLB capture; actual combat fighter and appearance tint/full body previews not changed. Three new tests added, fresh CI and actual visual verification pending. Original plate letterboxing is separately owned by #449; do not duplicate its geometry changes. No deployment, save or economy changes.

### Character workspaces refinement (2026-11-27)
Merged #475 baseline: 151/151 Fantasy Battle tests and build/security passed, separate Game 3D failure remains. New branch `fix/fantasy-battle-character-workspaces-20261127` refines screen 05 current goddess portrait and accessible HP/XP bars, 06 equipment category/selection parity between original and compact fallback (hidden selection cannot equip/remove, current slot opens matching all-items view), explicit now/after/signed stat differences from existing comparison functions, shared equip/remove controls with existing combat and ownership restrictions; 12 learned/locked ability inspection and real progress; 21 selected name overflow/announcement. Existing original plate geometry, full-body appearance preview, weapon rules, progression and saves unchanged. Six new source regression tests included in CI. Browser pixel QA and current-head build/security pending; actual combat actor integration and #449 plate alignment remain separate.
