# The Conduit — Stage 4 vertical movement shortcut prototype

## Scope and dependencies
Stage 1 lighting is on main; Stage 2 PR #357 remains unmerged and non-mergeable with no new assembled result; Stage 3 PR #358 is an independent draft with successful geometry CI. This draft adds only new files and must not activate or replace any existing map. Keep all 12 staircases, 316 steps, four jump pads, six pickups, existing buildings and the 89.6 m foundation.

## Design
Four rotationally symmetric open maintenance climbing frames between the cardinal stair axes and diagonal building/jump-pad axes. Route starts in the courtyard at radius 20.5 m, climbs three alternating 2.2 x 1.65 m intermediate decks at Y=1.25, 2.5 and 3.75 m, and reaches the existing Ring Walk at radius 29 m and Y=5. Each rise is 1.25 m, deliberately smaller than the shared ordinary jump height of 2.6 m in core/moves.mjs; sim/world.mjs uses gravity 18. Double jumping and air dashes remain optional existing moves; skipping stages and class-specific movement are not certified. No artificial jump impulse, extra charges, teleport, roof or basement hole. Four proposed 3.2 m inner-rail openings require splitting the existing rail visuals and colliders before mounting. Do not remove the rest of the safety rails.

## Performance
12 walkable intermediate decks, 24 frame posts, 12 crossmembers and 12 emissive guide strips; three instanced batches sharing one box geometry when mounted. Borrow existing materials, no new dynamic lights, shadows, textures, renderer or animation loop. Collision records match the prototype solids; the host must append them to the shared collision data and navigation graph only after certification.

## Evidence
Four isolated test groups executed from exact committed source using a JavaScript assertion harness (not Node test runner): 32 bidirectional ballistic segments clear their own prototype shell, all 12 intermediate deck supports/head clearances pass, portal envelope and footprint checks pass. Maximum modeled required horizontal speed is approximately 3.59 m/s; this is an idealized trajectory, not proof of actual class movement or timing. Floor and rail opening assumptions must be checked against the assembled scene. Node CI configured, full browser/GPU/multiplayer tests NOT TESTED.

## Integration gate
Resolve Stage 2 conflict and remaining physical-route failures. Validate this module with the assembled arena, including existing pillars, cover, courtyard and T1 decks, upper railings, ring floor, ceiling, jump pads, vents and spawns. Split only intended rail openings; validate visual/collider parity and railing endcaps. Check actual world jump, directional movement, double jump, air dash, interruption, landing recovery, and bots executing jump actions for all four classes. Verify escape and balance without forcing any player to use jumping. No live registration, server protocol change, merge or deployment in this task.
