# Duelist Adventure — original digital PvP districts (draft)

## Design targets

- Control: Meridian Observatory District — two relay buildings, clear A/B/C pads, lower interior routes and raised decks; avoid capture from roof height when integrating.
- Escort: Meridian Freight District — keep the full existing carrier route and contest circle clear, add two service/loading buildings, cover and rooftop flanking.
- Team deathmatch: Meridian Combat District — rotationally symmetric two-station layout, center cover, two flank routes and reciprocal rooftop approaches.
- Keep current 28 m control/escort and 22 m TDM radii for this blockout. More usable space comes from traversable height, not long empty walks. Revisit dimensions with 8- and 20-player tests, not arbitrary scale increases.
- Original art using the existing dark alloy/cyan palette; one instanced mesh per solid kind, no additional texture loading or lights. Inspired by compact mobile objective arenas, not copying Star Wars assets or exact maps.

## Implementation status

The pure map layout, vertical overlap/landing helpers, instanced mesh factory and geometry tests are implemented. **Not mounted in any live match.** Existing world physics uses flat floors and 2D level blockers; mounting art now would permit clipping or invisible obstacles. The maintenance ducts are open-topped stepped passages, not yet an enclosed crouch/vent system.

## Required integration sequence

1. Integrate shared layout into authoritative match world and local practice without replacing mission level semantics. Coordinate with #333 (match/server), class and WebGPU owners; pin a shared map revision for online clients.
2. Implement swept horizontal and vertical collision, step-up/step-down, grounded jumping from nonzero height, ceiling hits, fall/roof landing, ring boundaries, player separation by vertical overlap, and projectile/melee line of sight. Ground paths stay usable by all classes. Integrate height-aware capture (Control currently checks XZ only).
3. Mount the instanced architecture in the client only when the server/shared physics map agrees. Add camera occlusion and roof/interior visibility. Avoid changes to renderer setup and HUD.
4. Add bot navigation with distinct floor/roof links, stair traversal, payload attack/defend flanks, objective approach and spawn safety.
5. Verify local and WebSocket matches, mobile landscape controls, low/high routes, ability targeting, objective scoring, device performance and fair team routes. Add fully enclosed vent shortcut only after headroom and crouch support exist.

Tests added: tests/duelist-mode-arena-layout.test.mjs. No runtime/CI or mobile QA pass asserted. No merge/deploy.
