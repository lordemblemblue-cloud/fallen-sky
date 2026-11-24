# Duelist Adventure — low-poly digital PvP districts

## Implemented on draft PR #336

| Mode | District | Diameter | Seat cap | Box instances |
| --- | --- | --- | --- | --- |
| Control | Meridian Observatory | 56 m | 8 (4v4) | 60 |
| Transport | Meridian Freight | 56 m | 10 (5v5) | 60 |
| Team Deathmatch | Meridian Combat | 44 m | 8 (4v4) | 61 |

Each uses an original digital-alloy palette, two open ground-floor buildings, 3.2 m roof decks, open maintenance stair ducts and cover. At 12 triangles per box this adds 720–732 triangles, grouped into five instanced meshes; no new textures, lights or shadow-casting passes. Counts exclude existing floor/skyline/objectives/characters. Other modes retain their existing layouts and limits.

The draft now mounts architecture from the authoritative match layout in offline and online game sources. World movement, vertical landing and step climbing, collision-aware separation, attack/target occlusion, projectile height, rooftop jump state, camera clamping and ground bot detours are wired. Control ignores fighters above 1.5 m to avoid rooftop captures. Transport retains its existing ground objective logic. Protocol bumped to 14 so an old client cannot silently join the new simulation. Do not release client and server separately. No UI redesign, renderer backend conversion, or class balance changes.

## Verification performed

Direct execution of the exact pure geometry module confirmed all three map bounds, counts, zero capture-pad/transport-route conflicts, wall collision, tunnel traversal, stair ascent to 3.2 m, roof landing, roof line-of-sight blocking and a ground detour waypoint. These are direct geometry smoke checks, **not** full Node regression or browser results. GitHub workflow added for focused tests and build. Local repository clone failed DNS; do not claim local npm test or build.

## Review gates

- Run focused Node tests, lint, build and broader match regression suite. Confirm old control/escort tests and both protocol ends. 
- Test all four classes with roof combat, knockback, grip/execute, relic, double jump, projectiles and camera occlusion. Check cross-elevation effects and reconciliation on real network. Bot navigation currently provides ground detours; roof pursuit and enclosed crawl vents remain future work.
- Validate on physical mobile WebGPU/graphics devices; geometry budget is not an FPS guarantee.
- Coordinate with #333 direct-join server capacity (20-human draft) and class/WebGPU agents: #336 intentionally uses 8/10/8 caps for these maps; preserve these in any integration. Shared files sim/match.mjs, server/duelist/server.mjs, net/protocol.mjs and client/DuelistGame.jsx require manual conflict review. No merge/deploy.
