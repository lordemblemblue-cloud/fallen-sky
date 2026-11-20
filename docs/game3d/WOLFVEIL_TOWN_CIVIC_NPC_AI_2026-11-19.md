# Wolfveil living town — collision-aware civic NPCs (development draft)

## Problem verified in current Fallen Sky

The actively loaded Game 3D Wolfveil artisan town had `architectureEnabled:false`, deliberately removing duplicate procedural houses. Unfortunately, the earlier living-quarter NPC loop created homeowners/vendors only by iterating those same removed house plots. **The guards survived but the shopkeepers and residents did not.** Existing guards interpolated directly between long-distance route endpoints, checking only the resulting position each frame, so a route could collide with a thin wall, doorway, shop or fountain.

The current actual town already has **four separately registered shops and eight enterable homes**, installed through `createAXETownPlaza` and `makeWolfveilTownNavigation`, including wall-with-door-gap rather than whole-house AABB collision. That existing scene, not a duplicate level, is now the civic AI input.

## Implemented in this draft branch

- A **pure NPC planning/navigation module** `WolfveilTownCivicAI.mjs` creates shopkeepers inside **actual** installed shops, residents at their actual homes and guards along existing patrol streets. It does not create buildings, terrain or duplicate lore NPCs.
- Up to **four vendor staff, eight residents and four patrol guards** can exist, subject to collision-safe spawn placement (some placements can be deliberately omitted when obstructed). Merchants remain near counters; residents walk short home/porch routes; guards reverse their assigned sidewalk patrol after resting.
- Bounded grid A* route selection uses the actual oriented shop/home wall collision, town fountain, walkable floor height and body radius. It sweeps the whole route against walls, checks slope/step transitions, prohibits diagonal corner cuts and uses small movement steps. When navigation is blocked by another NPC or new geometry, it waits and replans instead of teleporting through walls. Paired guards pause to converse, while the existing authored dialogue/speech bubbles remain.
- Existing `WolfveilArtisanTownScene` passes `town.rooms.shops` and `town.rooms.homes` transforms directly to the living-quarter runtime. No full-building colliders, extra root map, mountains, shaders, combat/persistence edits or user inventory grants were added.
- Two **world-backed local civic retrieval objectives** are provided: Yuki's mint/willow bundle and Sera's lost dispatch. Their item/source identifiers, target positions, interact radius and actual physical pickup props are registered together. A pickup exists only if safe floor and an entrance-to-object route are available. E near a registered object progresses the local evidence; returning to the corresponding NPC marks it `awaiting_server`. Nothing is awarded or counted as an authoritative server quest.
- The existing real questgiver handoff (`archer_*`) remains available for registered quest objectives and validated progression; small civic sidequests are **client-local prototypes** until the trusted server adds their acceptance, per-character persistence, objective proof and atomic turn-in. No independent NPC can print XP, Silver, rare drops, crafting materials or boss rewards.

## Uploaded 3D asset review

13 GLBs attached to this conversation were directly inspected at binary glTF JSON level. Combined payload is ~**613 MiB**. **12 models have zero skin bindings and zero animations.** The 4.6 MiB `tripo_convert_2c8a015c-c27c-4b9b-b62c-e66b167de7d7.glb` has one skin and approximately 19,702 triangles, but **no embedded animation clips**. Most larger static models are 40–67 MiB with ~1.3–2.0 million triangles each, inappropriate for simultaneous nearby moving pedestrians without rigging, LOD and compression. The two `ddab794a...` uploads appear same-size duplicate variants. The models are **not assigned to NPC IDs, uploaded to GitHub, or silently swapped for working animated sprites** in this change. Existing small procedural townsfolk remain a reliable fallback. Model-specific rigging, walking animations and source-to-NPC assignments require a separate reviewed asset pipeline.

## Verification completed and still required

**Actually executed locally:** Node 22 native `node --test` on ten isolated logic tests covering rotated/scale-correct room positions, vendors tied to real rooms, swept wall collision, detour routing, blocked goals, pedestrian separation, real spatial object sources, acceptance/pickup/return state and zero fabricated rewards — **10 PASS, 0 FAIL, 0 SKIP**. This was a pure module fixture with an authored guard-layout stand-in, **not** a full checkout/native build of the connected GitHub repository. A dedicated `tests/wolfveil-town-civic-ai.test.mjs` is included in the branch for direct repository CI.

**Must still execute before merge:** `node --test tests/wolfveil-town-civic-ai.test.mjs tests/wolfveil-artisan-town-navigation.test.mjs`, `npm ci` and the actual Vite build, original quest/UI regression suite, signed-in Wolfveil Play screenshot and walkthrough. Verify 4 shops/8 homes open, guards turn without walking through doors/fountain/players, residents never appear in solid rooms, zero teleporting, no AI spike/stuttering near full crowd, E only collects reachable object after offered objective, no duplicate/unauthorized XP or inventory grants, two-client authoritative server behavior, scene unloading and source cleanup.

**Boss tiers:** Normal enemies, mini-bosses and world-boss drop proportions are **not** changed in this NPC-only PR. Design requires trusted combat receipts and reward pool definitions; no client-side loot policy is inferred. **Armor set modification** was left alone because the user did not finish specifying which set and what change.

**Deployment:** draft PR only. No claim of a live town or server reward system until real browser/server QA has passed.
