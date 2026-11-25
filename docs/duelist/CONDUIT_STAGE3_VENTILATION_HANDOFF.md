# The Conduit — Stage 3 ventilation prototype

Stage 2 PR #357 remains unmerged and not mergeable; its latest corrected full-map result was unavailable when this draft was prepared. This separate branch is based on main and adds only new files. Do not mount or activate these ducts until Stage 2 is green and reviewed.

## Geometry
Four symmetrical, enclosed, two-leg T2 connectors at Y=5: Armory–Med-Bay, Med-Bay–Barracks, Barracks–Reactor and Reactor–Armory. Each is approximately 40.25 m between interior approach points, with 2.4 m clear width, 2.5 m clear height and a shallow elbow to break long sightlines. Outer footprint unchanged. The new shell box corners lie between radii 34.79 and 38.13 m, beyond the 32.2 m Ring Walk. Eight portal descriptors and wall-split dimensions retain the remainder of the original side walls. Existing portal walls and facade decoration are NOT yet cut; the module is not mounted in the arena. Actual connected passage traversal, all existing colliders and line of sight must be tested before release.

## Performance
32 solid box descriptors, 16 emissive guide-strip descriptors, four instanced batches when mounted using existing materials; one shared box geometry. No extra lights, renderer, textures, frame loop or shadow-casting passes. No special class restrictions or teleportation; all classes should be able to use the same route, subject to full character clearance validation. No vents are added to a live map by this draft.

## Evidence
Three committed-source fixture groups passed in an isolated JavaScript assertion harness (not a Node test runner). Includes all four route envelopes, 1,608 sampled centerline checks of the prototype shell, and eight proposed wall cuts. These do not test the assembled arena, character movement, WebGPU rendering, actual draw calls or network sync. CI Node syntax and tests configured. Physical visual test and GPU benchmark NOT TESTED.

## Integration gate
Resolve PR #357 conflict, rerun assembled checks and correct remaining routes. Then mount ducts with shared materials, replace original side-wall geometry and colliders with portal pieces, clip overlapping decoration, ensure entry deck and seam continuity, and add bidirectional collision-checked waypoints. Revalidate all existing stairs, pads, spawns, ring routes, doors, actual player capsule, bot movement, LOS, multiplayer collision and physical rendering. Test route balance (approximate length is not a proven time advantage), escape routes and corner visibility. Do not modify existing mode registration or server protocol until coordinated with its owners. No merge/deployment.
