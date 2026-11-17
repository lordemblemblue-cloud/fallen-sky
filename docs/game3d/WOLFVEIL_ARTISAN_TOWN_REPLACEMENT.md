# Wolfveil artisan town replacement — clone review

This branch replaces **only the old assembled Blender town instance** in the Wolfveil Game 3D world with the user's supplied Japanese-Egyptian twin-wolf fountain diorama, adapted as a reusable Three.js module.

## Files
- `src/components/game3d/wolfveil/AXETownPlaza.js` — procedural fountain, circular brick paving, four artisan shops, eight homes, torii-style gateways, water and magical VFX.
- `src/components/game3d/wolfveil/WolfveilArtisanTownScene.mjs` — connects the new art to the existing Wolfveil ground coordinates and game update loop, preserves patrol NPCs, provides simple obstruction checks and cleanup.
- `src/components/game3d/GameWorld3D.jsx` — switches town instantiation to the new installer.

## World placement
The town remains centered at Wolfveil's market: `x=0`, `z=0` in scene coordinates after the existing +70-meter Z offset. It uses the authoritative `WOLFVEIL_IMPORTED_TOWN_FLOOR_Y` and no second WebGL renderer. The old GLB installer is retained in the repository for rollback but is no longer mounted by `GameWorld3D`.

## Required before merging
1. Test Game 3D > Wolfveil in the clone, check the loading screen and initial spawn at (-7, 8) remain navigable.
2. Walk the basin, each radial path, all shop frontages and the ring of houses. Collision here is deliberately coarse; refine entrance/navmesh collisions before shipping interiors.
3. Verify quest NPC spawn, guard patrols, Services/HUD, camera login placement and collision around bridges and caves.
4. Check desktop/mobile FPS and texture memory: the uploaded diorama contains extensive procedural geometry and lights. Add LOD or streaming if the spawn area stutters.
5. Verify falling-water animations, energy ribbons, lantern emissive materials, and nighttime/graphics modes.

**Status:** Code integrated on a review branch; browser/gameplay validation and deployment are not claimed.
