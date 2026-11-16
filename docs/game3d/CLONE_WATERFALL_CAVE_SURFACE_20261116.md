# Game 3D clone: WATERFALL / WOLFVEIL four-cave surface-fall repair

**Owner repro:** walking on the waterfall mountain surface drops the avatar into the cave. Earlier clone PR #103 repaired **Suigen Abyss** trench over-carving, not the separate Wolfveil cave mouth holes.

## Confirmed source defects and fixes

1. `WolfveilGeometry.buildWolfveilTerrain({caveCutouts:true})` omitted all six indices for an entire heightfield cell whenever its **centre** was inside `isWolfveilCaveMouthCutout`. The 1100m/310 segment grid is ~3.55m across, so a player on the exterior mountain/waterfall could step through a removed cell. **Fixed:** zero terrain-cell deletions; the genuine surface (both triangles in all cells), its color, analytically authored height, BVH raycast and network height contract stay intact. No new invisible floating floor or unrelated tile edit.
2. `WolfveilCaveLayout.sampleWolfveilPlayerCaveFloorY` used only the cave ceiling as a height test. A player above the waterfall could be classified as in a tunnel under the cliff and snapped down to the subterranean stone floor. **Fixed:** explicitly reject normal exterior-height feet, and only let an actively entered cave session consume cave-floor Y.
3. A sealed 2.5D heightfield cannot at the same X/Z be both solid outdoor hillside and an open subterranean roof. The **four existing hand-built stone cave arches** now use **E** to travel onto their existing underground ramps. **E again near that cave's interior entrance** returns outside to the real authored ground. Their tunnels, five original Wolfveil rooms/hub, lights and cave assets stay in place. Character model, camera, inventory, combat and other services are not redesigned.
4. The cave wall resolver no longer permits a free sideways exit past the stone mouth without using E. An explicit inside-session flag gates wall collision and underground foot height; a valid below-ground character checkpoint can restore the cave session. The earlier 7-foot cave-rim and Suigen safety fixes are retained; they do not trap an explorer who intentionally entered the four-cave system.

## Scope and remaining QA

Only **clone repo** `marcusflow1-arch/gitsync-pro`. No edits to original `atom-x-eve-os`, LAND-WS01–15 acceptance ownership, Game2/Game5, combat/reward server authority or original UI.

Unit/source tests: `node --test tests/game3d-clone-waterfall-cave-surface.test.mjs`. Earlier cave and Suigen tests must also continue to pass.

**Required signed-in Play checks:** waterfall x≈142,z≈249 (world +70 on Z); Crystal Vault mouth x≈122,z≈268; Lunar Gate x≈171,z≈222; remaining cave mouths (-216,146),(-312,218),(-82,382). Walk entire 7-ft rim and above each cave, sprint/roll/jump/mount, attempt edge collision and knockout, verify absolutely no unintentional drop. E at each exterior arch, enter underground, traverse cave floors and linked hub; verify no mountain-roof snap, intact collision, E-only exit, correct checkpoint, stable FPS and two-client/server parity.

**Not independently certified:** signed-in clone Base44 Copy playback, actual waterfall VFX/material fidelity, portal anti-cheat/worker parity, native Vite build, server/two-client validation. Do not mark 100% or claim the live Base44 Copy is changed merely because the separate GitHub repo merged: Base44 Copy reports source type `s3` and is not known to follow GitHub main.
