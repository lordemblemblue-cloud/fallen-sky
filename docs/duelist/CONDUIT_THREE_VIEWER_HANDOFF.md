# The Conduit TDM map — three-viewer import handoff

## Sources and restored work
Reviewed the complete Phase 4 T0 Undercroft (1,556 lines), Phase 7 restoration (1,907 lines), revised Gemini Phase 8 (1,872 lines), and corrected combined Phase 8 (2,131 lines). The combined Phase 8 is the base; do not import the abbreviated 441-line Phase 8 patch. The independent Phase 4 source confirmed missing eight chamber columns, four cover blocks, themed basement props, signs, pipes, tunnel cargo and perimeter copper conduit. Restored these from the original coordinates with matching collision for solid props, while preserving the later floor, ceiling, stair and jump-pad definitions. No duplicate center pickup.

## Import
The new client/maps/conduitArena.mjs creates one group in the supplied existing Three.js scene, using the repository dependency rather than a CDN. It returns collision registry, 32 candidate spawns, six pickup descriptors, four upper jump pads, navigation graph, optional lighting and visual update/disposal hooks. No standalone renderer, animation loop, global UI, replacement classes or match server. Physical geometry is not yet certified. 

## Critical integration gate
Existing TDM uses Meridian Combat through sim/modeArenaLayout.mjs. Its default simulation clamps Y >= 0; Conduit has a negative-elevation basement. Do NOT register the new art without a shared server/client collision adapter (including support, movement, ray/LOS, recovery, spawn validation, and pad launch) and authoritative game-state integration. Derive renderer-independent collision data, validate all 12 staircases in both directions, all four jump trajectories, 32 spawns, three-tier bot routes and six pickups. Use actual class and server systems, not the viewer's local stats. Keep both 4v4 and 5v5 as proposed configurations, reconcile server capacity policy before release.

## Verification
Exact module reconstructed locally, node --check passed; local git blob SHA matched GitHub d8adfe8c98786547489759483506a1df887dcbda. Three.js dependency unavailable in this container, so the new focused runtime tests and full build were not run locally. CI is configured; physical WebGPU/WebGL rendering, mobile, and connected-client match tests are NOT TESTED. No live activation or deployment.

## Coordination
This branch owns only the new Conduit map module, focused test, workflow and this handoff. Avoid overlapping current class, matchmaking and WebGPU PRs. Do not modify shared DuelistGame.jsx, modeArenaLayout.mjs, match or server protocol until ownership is coordinated. No merge/deploy without review.
