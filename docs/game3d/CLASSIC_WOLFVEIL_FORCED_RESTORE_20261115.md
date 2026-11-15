# Game 3D Clone — Forced Classic Wolfveil restore (November 15, 2026)

**Owner confirmation:** Dominion of Suigen was still visible in the clone after PR #82 changed the *default* map selection. The user explicitly asks to return to **the original Classic Wolfveil map** and keep **only selected Suigen trees, bamboo and rocks**.

## Why the previous rollback was insufficient

- PR #82 made Classic the default, but `game3d_clone_world_variant_v2=suigen` could remain saved in a given browser.
- GameWorld3D still imported `loadSuigenWorld` and allowed the entire 2400 m map, new 60-house town, mountain terrain cuts and replacement vortex to mount if that saved choice or a settings event selected Suigen.
- Consequently, the user could continue to see the wrong world despite the code's new default.
- Merely clearing localStorage was not an acceptable architectural fix: the live Game 3D renderer must be correct regardless of stale preferences.

## Applied fix

1. **Classic Wolfveil is now the only active gameplay scene** in the clone. `GameWorld3D.jsx` no longer imports or invokes `loadSuigenWorld`. The full imported Suigen GLB, its terrain, its new town, its altered cliffs and its replacement lake cannot be mounted in the Game 3D Play renderer.
2. A new `v3_classic_locked` world preference forces old v1/v2 Suigen selections to Classic. Even a `game3dWorldVariantChanged` event requesting Suigen is normalized back to Classic. Character, armor, inventory and quest data are untouched.
3. **Escape → Graphics → World Map** shows **Classic Wolfveil · Restored** as the sole active option. Full Dominion source GLB shards and procedural upgrade code are still in the repository/assets for explicit future recovery, but no longer selectable in the live game.
4. The **only imported Suigen geometry** in Classic is the existing 406 KB extracted asset pack: 18 mesh parts forming cherry, oak, maple, bamboo, moss boulders and basalt. The placement layer has 30 curated candidates; real-world placement still depends on existing road, river, reserved tile, town, POI, terrain ground, and playable-bound checks.
5. The new Suigen-only merchant overlay is unmounted in `GameView.jsx`; Classic's original shops, towns, portals, dungeon scenes, water tornado, camera, character and physics remain.
6. We updated the existing tests to assert that no full Suigen map loader is reachable, including under stale saved preferences.

## Deployment and QA caveat

- The clone's GitHub source can be merged and verified by reading `main`. This **does not prove** that Base44's hosted preview has received the new code; the user already reported seeing older/newer map behavior despite previous GitHub merges.
- Direct Base44 sandbox file read/edit requires an upgraded Builder workspace. A fallback Base44 AI builder edit was requested, but its status returned **error** on this attempt, so the connected Base44 preview is **not verified updated**.
- Final acceptance requires an actual signed-in fresh page load of the hosted Game 3D clone, confirmation that the original Wolfveil town and mountains return, actual appearance of selected imported vegetation, collision/path checks and the map staying Classic after page reload.
- Do not claim that the map is fixed **in the hosted preview** until a successful Base44 build/deployment is visible. The fix is complete at the repository source level, with real preview verification outstanding.

## Simple confirmation once deployment lands

Open Game 3D clone → Escape → Graphics → World Map. There should only be **Classic Wolfveil · Restored**, not a playable Dominion option. In world view, Classic's original town/river/terrain and old vortex should remain; the Suigen 60-building imported town should be absent. The extracted cherry/maple/oak/bamboo/rocks remain cosmetic and should not block quests or collision.
