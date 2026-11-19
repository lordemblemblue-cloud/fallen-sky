# Wolfveil natural-zone prototype: ZoneRuntime, doorways and full unload (Phase B)

**Date:** 2026-11-18
**Repository:** lordemblemblue-cloud/fallen-sky, branch `claude/wolfveil-doorways-c0d466` (from `main` 38cf79d)
**Follows:** `WOLFVEIL_METROID_STYLE_WORLD_STREAMING_AUDIT_20261118.md` (sections 5 and 6) and `WOLFVEIL_DOORWAY_SURVEY_PROPOSAL_20261118.md`
**Status:** built and measured in a local Play build, **behind a flag that is OFF by default**. Not merged, not deployed. The five-area loader, veils and torii gates are unchanged and remain the rollback.

## 1. What it is

The Jade Lantern Grotto (mouth at local (-360, -400), in the west forest) becomes two natural zones behind two authored doorways:

```
surface (legacy valley, five-area loader) ──[mouth arch: relocate]──► grotto_hall ──[stone door: walk]──► grotto_chamber
```

- **Mouth arch** (`grotto_mouth`): a rock outcrop with a dark 2.8 m throat (`prototype-mouth-facade.jpg`). It replaces that cave's blue region ring. The other three caves keep their rings. The valley heightfield cannot also be a cave roof (the audit's rule), so this doorway commits by moving the player **exactly once** to the hall landing while the screen is sealed, and back out to the threshold on the way out.
- **Entry hall** (`grotto_hall`): buried 4.9 m below the forest floor. It turns twice (a Z-turn), so neither end can be seen from the other (`prototype-hall-landing.jpg`, `prototype-hall-exit-door.jpg`). The sealed exit door shows daylight at its edges.
- **Inner door** (`grotto_inner`): a stone door in a 0.3 m wall at the end of the turn (`prototype-inner-door-closed.jpg`). It opens only after the chamber is built behind it (`prototype-inner-door-open.jpg`). It closes behind the player, and only then is the hall released.
- **Lantern chamber** (`grotto_chamber`): an 18-sided domed room with a jade pool, crystals and lanterns (`prototype-chamber.jpg`, `prototype-chamber-door-closed.jpg`).

Everything cave-side sits under at least 3.0 m of uncut hillside (a test pins ≥ 2.5 m against both terrain samplers).

### Turning it on

- One page load: `/gameview?naturalZones=1`
- Until removed: `localStorage.setItem('game3d.naturalZones', '1')`
- `?naturalZones=0` forces it off. With the flag off nothing under `wolfveil/zones/` is constructed, and the cave ring and every system behave exactly as on `main`.

## 2. Files

| File | Role |
|---|---|
| `src/components/game3d/wolfveil/zones/WolfveilZoneRuntime.mjs` | **ZoneRuntime**: one zone's ownership ledger: root, geometries + BVHs, materials, every texture slot (also shader uniforms), render targets, audio nodes, timeouts/intervals/frame callbacks, event listeners, per-frame updates, custom cleanups. `dispose()` = UNLOAD: stop, unsubscribe, detach, release, break the object graph, report. Reference-counted co-ownership; `share()` for explicit global caches that a zone never disposes. No Three.js import (Node-testable). |
| `.../zones/WolfveilDoorwayStateMachine.mjs` | The audit's **ACTIVE → APPROACH_GATE → OCCLUDE → LOAD → COMMIT → UNLOAD → ACTIVE** machine. One zone owns the player at a time. B is built only in the pocket; A is released only after B is verified and the player is handed over. Abort, failure, timeout, refused move and eviction all return safely. Commit kinds: `relocate` (move once) and `walk` (door opens, door closes behind, then UNLOAD). |
| `.../zones/WolfveilZoneGraph.mjs` | The prototype zone graph (built) and the Phase A natural-zone **proposal** (not built), plus `validateZoneGraph` (reciprocal doorways, reachability). |
| `.../zones/WolfveilGrottoZonePlan.mjs` | Pure layout: cave frame, hall centreline, door, chamber, anchors, walkable space per loaded zone, wall and swept-door collision, facade collision, the four directional doorway volumes. |
| `.../zones/WolfveilGrottoZoneBuilders.js` | Three.js builders: facade, hall, chamber, door halves (one per zone), cave ambience. Unlit materials with baked vertex light, and **no scene lights**: a zone that added lights would recompile every shader program in the scene on each transition. Interiors ignore the valley's fog. CPU geometry arrays can be prefetched into a two-entry cache. |
| `.../zones/WolfveilNaturalZones.js` | Controller: builds the facade, runs the state machine, creates and disposes ZoneRuntimes, registers zone floors and walls in the game's ground-ray list (camera clipping, jump ceilings) and removes them on unload. Also: the sealed-screen overlay, eviction, safe checkpoints, `stats()`. |
| `.../zones/WolfveilNaturalZoneFlag.mjs` | The flag (default OFF). |
| `GameWorld3D.jsx` | Flag-gated wiring only: construction, one `update` per frame, cave ground ahead of the valley ground (3 call sites), cave collision, skipping valley trunk/building/veil collision and the cave-edge step guard while underground, no mounting underground, saves made underground point outside the mouth, OTS camera colliders, dispose. |
| `WolfveilDungeonPortals.js` | `exclude` option: the flag removes only the Jade Grotto ring. |

## 3. The doorway state machine in the grotto

| State | Mouth arch (relocate) | Inner door (walk) |
|---|---|---|
| ACTIVE(A) | valley only; the facade is the only cave object | hall only; door closed |
| APPROACH_GATE | within 16 m of the arch on the valley side; **prefetch** = CPU geometry arrays only (no Three.js objects) | within 7 m of the door |
| OCCLUDE | standing in the throat on foot and grounded; the screen seals over 0.28 s (mounted or airborne: held, with a "Dismount" / "Land first" notice) | standing on the door plate; the Z-turn hides the exit |
| LOAD(B) | build the hall (≈7 ms) | build the chamber behind the closed door (≈7 ms) |
| COMMIT(B) | verify a floor under the landing anchor, then move the player once | open the door (0.55 s); hall and chamber briefly coexist behind it |
| UNLOAD(A) | valley is the legacy zone: **not unloaded in Phase B** (honest no-op) | once the player is 2.2 m past the door: close it, then dispose the hall |
| ACTIVE(B) | hall | chamber; returning reloads the hall fresh |

Leaving the pocket before LOAD costs nothing. Leaving during LOAD aborts and disposes a late-arriving zone. A failed or verified-bad load keeps the player in A. Walking back from an open door (4.5 m) closes it and releases the half-loaded zone. A respawn or teleport away from the cave evicts every cave zone.

## 4. Measurements (one desktop session, same graphics settings)

All numbers were taken in the running game (`roundtrips-30.json`, `roundtrips-gc-final.json`). The trip script set the player's position into each doorway volume in turn and let the real game loop run the state machine, ground and collision code. A separate keyboard test walked the hall (section 5).

**30 full round trips** (valley → hall → chamber → hall → valley), after one warm-up trip. "Baseline" was taken outside the mouth with the west area loaded:

| | Baseline (valley, outside the mouth) | Inside the chamber (every trip) | After each of the 30 exits |
|---|---|---|---|
| `renderer.info.memory.geometries` | 1,248 | 1,266 | **1,248 every time** |
| `renderer.info.memory.textures` | 330 | 331 | **330 every time** |
| shader programs | 251 | 255-257 | 251-253 (valley variance) |
| scene objects | 5,915 | 5,948 | 5,909-5,915 (valley ambience varies) |
| zone ledger (chamber) | — | 36 objects, 27 geometries, 20 materials, 1 texture, 2 BVHs | 0 zones resident |
| JS heap (`performance.memory`) | 1,380 MB | — | 1,404 MB after trip 1 → 686 MB after trip 30; no growth trend |

- Transitions: 124 commits, 124 loads, 124 unloads, **0 aborts, 0 failures, 0 evictions**.
- Zone build time: 6.7-10 ms (hall or chamber). From the outside anchor to standing in the hall: 0.47-0.87 s, mostly the 0.28 s seal and the frame rate (~45-55 fps in the test tab). A full round trip: 4.1-5.1 s of scripted moves.
- **Proof the old zone is gone, in the game:** every ledger root is registered with a `FinalizationRegistry`, and the controller keeps only a `WeakRef` per released cave zone. 94 ledgers were released in the session: 93 cave zones, plus the facade of a first mount that React discarded. After the 30 trips, 88 had already been garbage-collected naturally. After allocation pressure (a major GC), 93 were finalized and **0 of the 93 cave-zone WeakRefs still resolved**. The one "live" runtime is the doorway's own facade ledger, which stays while the flag is on.
- **Proof in Node** (`tests/game3d-wolfveil-zone-runtime.test.mjs`): 30 round trips with the real builders, then forced `gc()`: **0 of 3,240** zone objects (roots, geometries, materials) reachable; every geometry, material and texture received its `dispose` event.

**Draw calls inside the cave (game camera, 960×540):**

| View | Valley still drawn (Phase B) | Valley hidden (experiment only, not shipped) |
|---|---|---|
| Valley, outside the mouth | 341 calls / 1.85 M triangles | — |
| Entry hall | 249 / 1.51 M | **28 / 69 k** |
| Chamber | 237 / 1.52 M | **22 / 69 k** |
| Hall or chamber, looking towards the town | 1,548-1,580 / 3.0 M | — |

The cave itself costs about 20-30 draw calls. About 90% of the draws and 95% of the triangles underground are spent on a valley that cannot be seen. Phase B.2 (stop drawing the legacy valley while the player is inside a sealed zone) is the cheapest large win available.

Before the flag (flag off, outside the same mouth, a different session): 225 calls / 1.53 M triangles, 1,373 geometries, 452 textures, 513 programs (`prototype-before-flag-off-mouth.jpg`). Absolute counts differ between sessions because the valley streams differently. That is why the round-trip comparison above stays within one session.

## 5. What was verified in the game, and what was not

**Verified** (local dev build, guest, desktop browser pane, flag on):

- Entering through the arch: seal, build, single move onto the hall floor (y 6.2), hall resident, valley ring gone for this cave only.
- Keyboard walking in the hall (synthetic W/A/D/S key events): the player stays on the cave floor; the walls stop sideways movement at ±1.48 m (hall half-width minus body radius); walking back into the exit door carried the player out to the threshold outside.
- Inner door: opens only after the chamber exists; brief two-zone overlap; closes behind; the hall is released; the reverse direction works.
- 30 full round trips with flat GPU counts and full garbage collection (section 4).
- A save made underground stores the threshold outside the mouth, not the underground position.
- No console message from the zone code during the whole session (the only errors are the expected local Base44 406s and the missing Luna palace sources). React's development double-mount built and then disposed a first controller on every page load (ledgers created 2 / disposed 1 on entry), so the unmount path ran in the browser too. A full controller `dispose()` with cave zones loaded is tested only in Node: Fast Refresh did not re-run the world effect.
- Flag off: no zone code runs. The cave ring and all systems are unchanged; `/gameview` without the flag was used for the survey and the flag-off baseline.

**Not verified:**

- Mounting, gliding, Skywalk, dodging and combat inside the cave. These are guarded in code (no mounting underground, the doorway refuses mounted or airborne players, jumps meet the cave roof through the ground rays) but were not played.
- Enemies, companions and remote players: the AI is not zone-aware. An enemy on the surface above could still path towards the player by X/Z; the companion stays on the surface. These are follow-ups.
- Multiplayer, the server's movement validation of the one-time move, reconnect inside the cave, death underground (eviction is tested only in Node).
- Audio: the ambience nodes and drip timer are created and released (ledger and Node tests), but the test tab was muted, so nobody listened to it.
- Mobile, other browsers, fog/night, and the post-processing ink pass (captures are the raw renderer).
- Visual quality: the rock art is a placeholder (baked vertex light, a procedural texture). It needs the owner's eye and real assets.
- A Base44 deployment.

## 6. Tests

```
node --test tests/game3d-wolfveil-zone-runtime.test.mjs tests/game3d-wolfveil-doorway-state-machine.test.mjs tests/game3d-wolfveil-grotto-natural-zone.test.mjs
```

22 tests: ledger ownership and disposal (every texture slot, BVH, timers, listeners, audio, cleanups, shared and co-owned resources); the GC proof; no scene lights and no valley fog in zone materials; the state-machine sequence, abort, async late load, failure, timeout, refused move, mounted/airborne hold, walk-through door, evict; 30 round trips through the real grotto doorway volumes; rock cover; connectivity; the Z-turn sightline; the swept closed-door check; doorway volumes (no ping-pong); proposal coverage of all 11 gates; the flag default; the controller end to end in a real scene graph (10 trips, eviction, mounted hold, checkpoints, dispose); and the GameWorld3D wiring (flag guard, five-area loader and gates still built, ring exclusion).

Full suite: `node --test --test-reporter=tap tests/` → 1,053 tests, 84 failing. `main` 38cf79d gives 1,031 / 84 with the **identical failing names**: no new failures.

## 7. Phase B.2: the valley is not drawn underground (built, same flag)

UNLOAD(surface) now **suspends drawing** of the legacy valley (nothing is disposed; raycasts, AI and server state are untouched), and LOAD(surface) draws it again, still behind the sealed screen. Every way out restores it: exit, abort, eviction and dispose. A runtime switch is available for measurement and rollback: `__gw3dNaturalZones.setSurfaceSuspension(false)`.

- **Hidden:** GameWorld3D's existing `classicWorldRoots` (valley, town, meadow, vortex lake, lunar/astral gates: the same roots the world-variant switch hides), the named valley layers (Blaze grass, Suigen accent trees, birds, cave rings, respawn shrines, quest trail, discovery nodes, far outlines) and the doorway facade.
- **NPCs:** quest NPCs are neither drawn nor talkable underground. `npcSuppressed` also becomes true while `naturalZones.isInside()`.
- **Re-showing:** if another system re-shows a hidden root, the controller hides it again the next frame. The only one seen was the area loader's east far outline, twice per entry.

| Game camera, 960×540 | Before B.2 | B.2 |
|---|---|---|
| Entry hall | 227 calls / 1.62 M triangles | **31 / 70 k** |
| Chamber | 212 / 1.41 M | **20-27 / 69 k** |
| Chamber, looking towards the town | 983 calls (two town NPC models: 503 + 422) | **31 / 10.5 k** |
| Valley, outside the mouth after the exit | 317 / 1.60 M | 323 / 1.75 M (everything back) |

10 in-game round trips with B.2 (`b2-roundtrips-10.json`): every trip hid the valley and NPCs underground and showed them again on exit. GPU geometries, textures and programs were flat (1,151 / 273 / 242). Screenshots: `b2-hall-game-camera.jpg`, `b2-chamber-toward-town.jpg`, `b2-valley-after-exit.jpg`. Test: `Phase B.2: the valley is not drawn underground and comes back on every way out`.

**Still drawn underground:** the companion (it stays on the surface above), enemies and remote players. CPU updates of the valley (grass streaming, area loader, NPC animation mixers) keep running.

## 8. Next steps (owner's decision)

1. Make enemies, companions and remote players zone-aware (the audit's "do not keep every remote renderer or AI clone in the active scene").
3. Art pass on the grotto (rock kit, real lanterns, sound) before showing it to players.
4. Phase C: the Training Forest trailhead as the first surface doorway (see the survey doc).
