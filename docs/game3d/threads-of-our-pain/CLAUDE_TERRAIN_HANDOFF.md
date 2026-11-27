# Claude terrain handoff — Fallen Sky: The Threads of Our Pain

Owner direction, 2026-11-26. Story Bible v0.4 was the initial baseline; the cumulative source is now v5.6 R60 with R61 repository reconciliation. This directory is the repository-readable narrative/terrain exchange; the story automation supplies successive scripts and briefs. This initial handoff is documentation only, not an implemented map or a request to publish.

## Read order and ownership
1. Root AGENTS.md and this file.
2. [README.md](README.md) for current status, [R61 stable ID index](R61_STABLE_ID_INDEX.md) to locate the specific source, and [R61 continuity ledger](R61_CONTINUITY_LEDGER.md) for chronology, player knowledge and ownership constraints.
3. The relevant quest/discovery brief (including R35–R47 recovered archives) and any later editorial delta, then the latest terrain-agent response. Historical revision counters are superseded; do not infer approved geometry, ending outcomes or post-M05 local event dates from presentation order.
The new story supersedes conflicting War of Three Roads story/map assumptions. Preserve useful prior research, not old geometry by default. The owner is rebuilding the world; do not restore deleted caves, dungeons or world assets automatically. ChatGPT writes narrative, dialogue and constraints; Claude owns terrain layout, technical feasibility, cave/dungeon architecture and implementation within those constraints. Treat proposed measurements, routes and hazards as suggestions, not finalized map coordinates. Do not independently change the story or publish, spend credits or bypass security policy. Keep development work on appropriate feature branches and test before requesting integration.

## Narrative constraints
- Age 15: preserved reality, generally peaceful at first. Age 18: original reality facing planetary invasion. Both are genuinely playable existences; the protagonist mistakes migrations for dreams. Other humans recover memories as war causes convergence, but do not migrate like him.
- Shared silhouettes, geological anchors and vistas are meaningful. A town in the original world may never have existed in the preserved world; natural rocks can echo roads, gates or houses. Fresh markings in one world may be centuries old in the other. Do not simply clone the map or put literal ancient ruins everywhere.
- Paired focus discoveries: age-15 and age-18 views align complementary abstract symbols with voluntary camera control; after both align, reveal a hidden approach. Loss of focus closes the visible entrance, but preserve safe egress, retry and checkpoint access. Aerial reveals must stream collision and safe landing before exposing a mountain; never force a crash or camera zoom.
- The younger hero recovers a relic or skill; the older already owns it and suddenly feels its grip, weight or motion as if newly received. A second focus point after recovery shows the corresponding lived location and triggers an emotional echo in both lives. Do not grant duplicate older equipment. Optional discoveries never gate the main story.
- Hostile goddess pursuit uses older hero's intervention and acquired experience, not Celestial Sight. Keep the truth hidden in player-facing cues. Ending reality is a separate conditional state, not a freely available third world. No finalized names or endings beyond the owner's approvals.

## Required brief for every location
- Stable quest/discovery and location IDs, dependencies, story revision, mandatory story beat vs proposed geometry.
- Regional adjacency, approach silhouettes, terrain contours, relative elevations and scale, biome, traversal from neighboring areas; mark final coordinates TBD until surveyed.
- Both reality variants and any conditional ending variant: same anchors, distinct history/architecture, lighting, weather, materials, sound and environmental clues.
- Entrances/exits: visible/secret, activation, focus viewpoint and target geometry, return and fail-safe, gliding approach/landing, access after closure, accessibility alternatives.
- Cave topology: room/connection diagram, dimensions proposed for blockout, elevation changes, junctions, optional chambers, alternate paths, shortcuts, dead ends with purpose, egress. Mark NPC/enemy positions, combat arenas, trap telegraph/trigger/reset/bypass and recovery routes; identify relic, dialogue, cutscene and second vista anchors.
- Asset kit, collision, walkability/navmesh, camera clearance, checkpoint and save behavior, streaming, occlusion, LOD and WebGPU budget. Reuse geometry/materials; only active reality and needed cave cells should render. Measure rather than claim FPS. Keep security/server-authoritative rewards and existing guest policy.
- Acceptance tests: entry/exit, route reachability, focus on/off and reset, landing/camera, traps, optional branches, quest state persistence, both realities and mobile/desktop performance. No invisible lethal collision or untelegraphed forced damage. No map marker spoilers by default.
 
## Claude's return handoff
For each location, return the source revision, terrain branch/PR, actual blockout diagram and local anchors (position, heading, target geometry), collision/traversal checks, perf measurements with hardware/settings, screenshots if available, unresolved constraints and suggested story corrections. Label draft / ready for blockout / built / verified accurately. Don't claim verification without evidence. Coordinate layout changes with the story writer before moving a story-critical beat.

## Workflow
The hourly story task updates Markdown briefs with scene dialogue and staging and preserves cumulative Word documents separately. Read the latest committed handoff branch if the docs PR is not merged; use main once merged. Update the index as new briefs arrive; maintain stable D01–D50, M01–M20 and S01–S55 IDs. Expansion order is not the same as discovery ID (D01, D25, D36 expanded first; D31 is next). Dialogue first; blockout suggestions accompany it. Do not interpret missing detailed briefs as permission to invent finalized narrative.

## R62 character and quest dependency constraints

Read [R62 character and quest audit](R62_CHARACTER_QUEST_AUDIT.md) before staging recurring actors, the M11/M12/M16 family arc, diplomatic hall or witness scenes. Distinct NPC IDs and knowledge flags per reality; original melody may be shared but faces and histories are not cloned. Mandatory path independent of optional quests; partial/declined/completed variants must reflect actual quest state. Keep evidence provenance and consent, rewards idempotent, and no duplicated older equipment. Return actual actor IDs, camera/route anchors, local ordering annotations, test outcomes and measured performance; do not claim build or final ending approval from narrative specifications.
