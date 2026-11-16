# Game 3D Clone — Cave Edge Safety, Dungeon Exploration & Treasure QA

**Scope:** `marcusflow1-arch/gitsync-pro` only. This is **not** a LAND-WS01–15 tile acceptance or a change to the original `atom-x-eve-os` repository. Source work does **not** mean 100% completion.

## Where the holes were introduced

The Suigen Abyss excavator in `SuigenMountainWayfinding.mjs` removed an entire `Map_Terrain_2400m` triangle whenever *any* of its three vertices was inside the narrow trench at world X≈−440 and Z=320..427. With ~7m source terrain grid spacing, this deleted triangles extending beyond the intended cave wall, leaving holes beside the entrance and canyon. The new rule removes only triangles whose **three** vertices lie in the cut. Original GLB and Classic Wolfveil stay intact.

An additional client-side cave-contact guard compares actual ground raycast hits for each movement step within a **7 ft / 2.1336 m** rim zone. Steps into missing floor or with an abrupt >1.1m change are rejected; gradual legitimate stair treads are not replaced or artificially elevated. The same check covers rogue push collision. The guard does not replace server-authoritative map validation or a real collision-walkthrough.

Also guarded: the Classic Lunar/Celestial mountain approaches and four documented Wolfveil cave sites. The Suigen Lunar/Celestial approaches are included. The intentional vortex water portal remains exempt.

## Five existing Lunar Cave sections

| Chamber | Starting mob levels | Existing enemies | New visual cache |
|---|---:|---:|---|
| Moonstone Threshold | 1–3 | 5 | Threshold Reliquary |
| Echoing Gallery | 5–7 | 5 | Echo Cache |
| Shadowed Vault | 9–11 | 5 | Shadow Chest |
| Runebound Hollow | 13–15 | 5 | Runebound Trove |
| Eclipse Sanctuary | 17–19 | 5 | Eclipse Treasury |

The five actual rooms, their winding collision passages, real GameWorld3D training mobs, torches and designated return portals were already implemented. This patch adds **one inspectable physical chest per chamber**. Use **E** near a chest to open the visible lid and inspect its identity. Chests are intentionally *sealed for persistent rewards*: inspection grants **no items, Silver, XP or completion** without trusted server receipt validation. This is a remaining functional acceptance gap, not a claim that treasure farming works.

The Lunar Dungeon now also clamps post-movement pushes/teleports/knockback to the last valid in-dungeon position so a player cannot walk out through an unregistered cave wall or leave the map without using its intended return portals.

## Local/source checks

`node --test tests/game3d-clone-cave-rim-and-treasure.test.mjs`

Checks: every bank-crossing Suigen triangle remains untouched; correct seven-foot envelope; missing floor and cliff-height changes block movement; ordinary 0.17m stairs remain traversable; five distinct hall/level/encounter groups and sealed server-required chests remain reachable; no client loot grant function added.

## Required **signed-in Play** acceptance (not yet evidenced)

1. Select **Dominion of Suigen**. Walk and sprint a full ring within ~2.13m of both sides and both ends of the Abyss excavation at X≈−440, Z=320–427. Try walking, jumping, rolling, mount traversal, collision pushes, camera movement and logging back in at the rim. No fall-through, floating floor, exposed seams or missing contact.
2. Walk the **actual 156 fine descending treads** from Z≈420 to the deep vault near Z≈328 and back. No blocking overhangs from preserved terrain triangles; no buried steps or floating bank slabs. Observe the intended **E** portal; normal sidewall traversal must never enter a separate cave map.
3. Inspect the Wolfveil Classic Lunar Gate at world (171,222–225), Astral Gate at (197,224–225) and the four recorded local cave mouths (+70m world-Z). Confirm designated portal triggers and every nearby shore/cliff remains walkable where intended.
4. Enter the Lunar Cave. Traverse all five chambers and the water-end passage. Confirm 25 level-appropriate hostile training encounters, no floor gaps, real collision at corners/curves, stable FPS/LOD, and unchanged exit via the **two actual return portals**.
5. Find and inspect each of the five caches with **E**; note that **no inventory rewards are awarded** until server-backed dungeon settlement is implemented and independently validated. Verify it cannot be claimed twice through replay or two-client races once the authority endpoint exists.
6. Repeat with two simultaneous clients and staging server after authoritative map/encounter rules are verified. Keep the 95.2 Combat/Quest release flags unchanged and do not infer production readiness from hosted CI without test logs.

## Guardrails

- No `server/game3d`, reward ledger, XP, quests, LAND-WS square or Game2/Game5 changes.
- The separate 95.2 acceptance tracker (#69) remains incomplete and unchanged.
- **Open blockers**: real signed-in rendering/collision walkthrough, frame-time profiling, visual/material-fidelity approval, server/two-client parity, and trusted treasure grant/replay safety.
