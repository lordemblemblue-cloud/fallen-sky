# Fantasy Battle world interaction handoff

The runtime registry is src/components/fantasybattle/core/worldInteractions.mjs. Preserve the three existing service IDs and positions (Grove x=9, Sanctuary x=191, Moonveil x=226; z=-1.4 for all). Ground height continues to come from the live terrain sampler. Keyboard E, host touch interaction and the world interaction button use existing treasure/encounter priority, then the nearest registered service within 2.4 horizontal units and strictly less than 2 vertical units. The host checks canonical service identity, live mode, position and nearbyService before opening dialogue or authorizing local trade, crafting, enhancement, rest or the Last Escort return. This is client-side consistency, not server authorization.

## Asset delivery / approval

The 24 PLANNED_ANCHORS are design records only. All transforms are null and status is awaiting-approved-map. The IDs and region indices are stable; existingId is an interim association, not permission to move or duplicate a marker. In particular the Last Escort return is still grove_service, even though the proposed traveler belongs in the pilgrimage region. Do not activate or relocate it until the quest return contract is explicitly reviewed.

Claude/Gemini: supply each applicable anchor ID, world-space position [x,y,z], facing (radians), and interaction radius (1–3 units), plus asset reference and evidence of a walkable, accessible approach. The validator checks numeric bounds, section and corridor only, not collision/reachability. After review, integrate approved transforms in code, test against the actual terrain, and preserve existing persistent treasure/discovery/encounter IDs. Do not load unreviewed remote manifests or allow a visual asset to grant progression. NPC identity/roles are provisional; the current three service visuals are markers rather than character meshes. New NPCs, physical chests and cinematic animations are not placed by this change.

## Acceptance checklist
- Existing three service markers remain visible and reachable across quality settings and streaming unload/reload.
- Interaction prompt is visible; keyboard and touch open the same canonical service dialogue.
- Moving away, fighting, wrong service or invalid coordinates do not authorize a transaction.
- Preserve the original screen templates and test desktop/mobile layout.
- Verify no overlap with encounter trigger radius, solid collision or hidden inaccessible ledges before activating new anchors.
- Save/import retains existing quest and treasure states; placement metadata is not stored as player-editable authority.

Last Escort head e3f73d6 passed Fantasy Battle and Base44 security; shared Game 3D failed and WebGPU was still running at check time. Current registry tests added; new head CI, lint and actual device testing pending. Next: guest-save resilience and secure cross-device transfer/synchronization design. No new public save endpoint or login requirement.
