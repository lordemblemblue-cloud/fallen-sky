# Phase 43 — Fallen Sky existing runtime source audit

27 November 2026. Read-only inspection of main (individual source reads; not a pinned full checkout). This file is a design/integration gap report, not a comprehensive security audit or a claim of runtime readiness. Follow root AGENTS.md, current story index and Phase 42 handoff. PR #404 was open, draft and mergeable when rechecked. No game code or saved data changed.

## Reuse map

| Source path | Observed implementation | Next integration boundary |
|---|---|---|
| src/routes/index.jsx | GamesHub root, not direct Game3DHost | Preserve hub; /gameview direct game entry |
| src/routes/gameview.jsx; src/components/game3d/Game3DHost.jsx | Public client-only game route, lazy host and nested router compatibility | Reuse existing selection and entry; no new login |
| src/pages/GameView.jsx | Mounts GameWorld3D, verified Questbook, trail, discovery, guest vault, HUD, Services, cinematic dialogue | Integrate through existing mount boundaries; avoid editing renderer owners' files without coordination |
| src/components/game3d/worlds/temporaryPlatform.mjs | FALLEN_SKY_PLATFORM_MODE=true; 24 m plane and bounded position | Leave enabled; replacement terrain not surveyed |
| src/components/game3d/GameWorld3D.jsx | Existing NPC labels/dialogue, quest event/reward hooks, boss controller, combat, checkpoints, audio and render systems | Reuse verified adapters, not a second world or combat loop |
| src/components/game3d/questData.jsx | Five legacy archer actors, including archer_lyra; legacy IDs, AXE_QUESTS and living Artemis quest | Review mapping to stable story actors; never infer goddess identity or overwrite legacy IDs |
| src/components/game3d/axe/quests/AXEQuestFramework.js | Data-driven campaigns, objective types, flags, prerequisites, optional objectives | Extend via adapter after review; no duplicate quest engine |
| src/components/game3d/useQuestStore.jsx | axe_quest_state_v2 character-scoped store, accepted/completed IDs, objectiveProgress, choices, flags, counts, pledges | Add versioned narrative context without overwriting legacy records; review unknown definitions and legacy migration |
| src/components/game3d/questRewards.jsx | Client reward effects and skill/class unlock handling | Separate canonical completion from unique reward receipt; do not use client completion as server proof |
| src/components/game3d/axe/quests/AXEVerifiedQuestbookMount172.jsx; AXEVerifiedQuestbookRuntime172.js | Opt-in read-only verified presentation, rejects anonymous/default/dev identity | Retain privileged boundary; guest journal needs clearly local presentation, not impersonation |
| src/components/game3d/npc/CinematicQuestDialogue.jsx | Living quest-specific cinematic camera/typewriter/audio integration | Reuse presentation contract; do not repurpose Artemis/Kali story as new canon or invoke paid audio |
| src/components/game3d/exploration/ExplorationDiscoveryMount.jsx; explorationDiscoveryStore.js | Existing material/skill discoveries, claims, events and server/local sources | Paired D01–D50 are distinct authored discoveries; separate first observations, claim, second vista, safe exit |
| src/components/game3d/characterStorage.jsx; worldCheckpointStore.js | Character/user scopes, guest namespace, checkpoint adapter | Introduce campaign/reality state separately; explicit migration and isolation |
| src/components/game3d/character/GuestCharacterCloudSync.jsx; characterVault.js; guestCharacterCloud.js | Guest vault client, recovery-code ownership, revision-based conflict/recovery | Keep local-first guest play and private recovery code; inspect backend and deployed policy before adding privileged writes |
| base44/shared/characterSaveRules.ts | Existing save limits and validation, suspicious rate changes flagged rather than universally rejected | Do not treat uploaded guest save as authoritative reward evidence; budget new state and verify limits |
| src/lib/auth-middleware.js | Token forwarding distinct from requireUser / requireUserRoute | Keep authorization and ownership checks on restricted functions |
| docs/webgpu/AGENT_HANDOFF.md | Renderer ownership and validation procedures; historical status entries | Coordinate changes; actual hardware/browser evidence remains required |

## Concrete risks to investigate (not confirmed deployed exploits)

1. Quest store acceptQuest resolves passed definition, AXE registry or pledge, otherwise null. No unknown-definition rejection in the inspected function; completeQuest only checks objectives when def exists. Legacy callers may intentionally pass definitions. Before exposing new story IDs, use a fail-closed canonical adapter, preserve legacy caller contracts, and test unknown/disabled IDs, accepted incomplete objectives and repeatability. Do not silently change legacy functions in this docs PR.
2. loadState falls back to unscoped wwm_quest_state_v1 if scoped state missing. Verify two-character isolation and migration ownership; never copy legacy completed IDs into unrelated slots. Preserve data until fixtures and migration plan exist.
3. Local completion and reward side effects are distinct in inspected code. Review callers and actual server receipts; do not assert atomicity or a vulnerability without transaction/concurrency tests. Living quest q_living_bleeding_moon explicitly sets reward XP/points to zero because no trusted writer exists; do not reenable it as a shortcut.
4. Existing archer_lyra is a mapping candidate for Lyra, not proof of approved identity equivalence. Keep new FS_NPC IDs as draft aliases; all 29 other mappings unresolved. Source has old NPCs and older story content; do not delete them based on this audit.
5. Current verified Questbook runtime rejects __anon__, __default__, __dev_test__. Preserve that fence. Existing guest cloud vault is a separate capability; inspect actual recovery-code validation, private entity access, throttling, revision conflict and deployed status. No public service-role bypass for unrelated operations.
6. README/guest-save guide still describe root as direct game entry, while actual index.jsx mounts GamesHub. Treat route source as current for this inspection; no route change requested.
7. Existing Base44 shared .ts files are real repository files; respect AGENTS.md JavaScript/JSX guidance for new app code; don't convert existing shared modules wholesale.
8. Story R66 requires two initial focus observations then unique claim then second perspective alignment, preserving safe exit and legacy missing-vista annotations; S29 counts distinct eligible evidence, not blanket S27 completion; latest source-level reviews aren't runtime coverage. R65/R75/A ending and progression policy remain blocked pending decisions.

## Phase 44 acceptance contract

First implement a disabled, data-only registry validator with no runtime imports, no UI changes, no reward grants and no platform-mode changes. Validate exact M01–M20/S01–S55/D01–D50 ID sets, 30 unique draft proposed actor IDs, every S ID exactly once in coordination overlay, allowed reality/status values, no invalid references, and no enabled draft. Distinguish coordination from physical presence and quest ownership. Explicitly map existing actors only after source review. Reject a hostile goddess as actual quest giver and Hesper as verifier of his own investigation. Include tests for duplicate/missing IDs, bad references, unsupported status, malformed input and accidentally enabled proposals. No new canonical quest or migration. Re-read current main and source index before code changes; separate feature PR from docs.

## Validation and blockers

Executed: GitHub source reads and PR metadata inspection only. Search returned no matches, so followed explicit imports and known file paths instead; directory-wide inventory, Base44 function/entity implementation, authoritative Node server, existing test inventory, current CI and deployment not exhaustively inspected. No npm lint/build, runtime test, Base44 scan or hardware benchmark executed. Source paths linked by repo-relative references above. Next: inspect actual server quest/reward paths and existing tests before runtime adapter; Phase 44 may validate draft data in isolation. No merge/deployment authorization implied.
