# Wolfveil gates, unloaded far side, bridges and the brick lane

**Date:** 2026-11-21
**Repository:** lordemblemblue-cloud/fallen-sky, branch `claude/wolfveil-gate-travel-20261121` (from `main` d8817383, `main` c64e39d9 merged in)
**Owner report 1 (recording `2026-11-21 09-51-34.mp4`):** "You can also see that you can't go through the portals, and that's a problem." Level 38, riding the Fantasy Bear, held at the red torii on the Market Stone Bridge between Wolfveil Town and East Wilds (16–33 s). Both "East Wilds · Optional PvP" and "Wolfveil Town · PvE" banners on screen; sky and fog flicker on alternate frames.
**Owner report 2 (recording `2026-11-21 09-52-59.mp4`):**
- "a pathway that's not supposed to be there ... it's kind of sticking out";
- "when you walk ... under the bridge again, appearing over the bridge, and it's happening all over the world";
- the barrier "has a weird teeth-like rippling effect across the map ... we have to make it to where that side of the map is unloaded. We only doing this until we figure out a way to get the whole game to run smoothly without actually relying on a portal system";
- the portals still don't work.

Sections 1–4 cover the portals; section 5 covers the second recording's items.

## 1. Was the earlier gates work in `main`?

No. Branch `claude/wolfveil-area-streaming-20261119` (ground streaming plus a gate "carry", tip 34dd317) was pushed but **never opened as a pull request and never merged**. `main` instead took PR #102 (`fix/isolated-wolfveil-portal-scenes`, e39c730b, merged 2026-11-19): every area became its own scene. Only that area's ground, gates and veils are built, and travel remounts `GameWorld3D` into the next area. The Base44 preview runs `main`, so it never had the carry. That older branch no longer fits `main`'s design and should be closed, not merged.

## 2. Why nobody could get through (measured on `main` d8817383, local `vite dev`)

Each area is its own scene, with `mode:'single'` and `preloadMeters:0`. Travel only started when the area loader switched area, and the loader switches **12 m past a border** (hysteresis). In a single-area scene there is no ground 12 m past a border, and `moveWorldActor` refuses any step onto missing ground. So:

| Crossing on `main` | Where the player stopped | Travel |
|---|---|---|
| Market Stone Bridge, on foot, town → east | x = 133.96, 11.96 m past the border (deck end) | never |
| Market Stone Bridge, riding the Fantasy Bear, town → east | x = 129.45, 7.45 m past | never |
| Market Stone Bridge, on foot, east → town | 10.4 m past (deck end on the town side) | never |
| Ridge Path (trail gate), on foot, town → north | 0.13 m before the gate plane (the trail's ground ends at the border) | never |

- **Mounted vs on foot:** both stop. A rider stops sooner, so riding never got past the gate either.
- **Area state:** in a single live world the loader's area does not flip at the border. It stays on the scene's area (hysteresis), and nothing travels.
- **World status:** it used the raw position. Every step across the border line at a gate switched it between "Wolfveil Town · PvE" and "East Wilds · Optional PvP", and each switch posted a banner. That is why both banners were on screen.
- **Arrival:** a scene loaded after travel briefly placed its loader at the town centre while the player model loaded. That posted "Entering Wolfveil Town" while arriving in East.

## 3. What changed

- **`wolfveil/streaming/WolfveilGateTravel.mjs` (new, pure, no three.js).** It decides when the player goes through a gate:
  - `wolfveilGateTravel` fires when the player crosses a gate's plane inside its opening, towards an area that isn't loaded. This covers bridge decks, which run on through the gate.
  - `wolfveilGatePush` fires when the player walks or rides into the opening, within 5 m in front of the gate and heading into it (within 60°), and the world holds them up. On a trail the ground ends at the border, which can be a few metres short of a gate turned along its path.
  - Walking freely towards a gate, beside it or along it, stepping back, a teleport, or the area already loaded never travels.
  - The landing is on the gate's axis, 6 m past its plane and inside the destination area, facing on.
- **`GameWorld3D.jsx`:**
  - Both checks run on every live frame: the plane check after the gates update, the push check after the player's WASD or click-to-move step, on foot or mounted.
  - They never run on the title screen, in caves, natural zones or duels, or after travel has already started.
  - A pass posts the usual "Entering … · <gate>" notice and mist flash, then `game3dPortalTravel` to the destination area. The loader's 12 m switch stays as the fallback.
  - While the arriving player model loads, the loader and gates use the arrival point instead of the town centre.
  - A rider who went through a gate rides on: once the scene's mount has loaded, it is placed under the player and mounted through the ordinary F path, with the same checks.
- **`GameView.jsx`:** the landing keeps `heading` and `mounted` through the scene swap. The world-status panel is given the loaded area.
- **`pvp/WorldPvpRules.mjs`, `pvp/WorldPvpControl.jsx`:** the panel shows the status of the loaded area scene (`resolveWorldPvpSceneZone`). It changes once when you go through a gate, not on every step across the line. The server's `resolveWorldPvpZone` is unchanged: it still resolves the trusted position and ignores any area field.
- **Unchanged:** the one-area-per-scene design (PR #102), gate and veil positions and collision, the loader, server movement and saves, and the renderer and render loop.

## 4. Results in the running game

**Setup.** This is the final build: `main` c64e39d9 merged in, the far side unloaded, bridges ending at their torii. It ran locally under `vite dev`, as a guest, with sound muted. The renderer was WebGPU (`main`'s new default). Each run started 8 m before the gate and walked or rode in with steering keyboard input. Frames were driven by a Worker tick because the app's browser pane was hidden.

**On foot, all 22 crossings (every gate, both ways): 22 travelled through the gate.**

| Gate | Town/area → area | Triggered at (m from the plane; − = held up short) | Arrived |
|---|---|---|---|
| Market Stone Bridge | town → east / east → town | −0.03 / −0.02 (the bridge now ends at the torii) | 6 m past, on the deck |
| Residential Timber Bridge | town → east / east → town | −0.10 / −0.07 | 6 m past, on the deck |
| Outrider Rope Bridge | town → east / east → town | −0.11 / −2.58 | 6 m past, on the deck |
| Hunter's Loop · East | east → north / north → east | +0.13 / +0.27 | 6 m past |
| Ridge Path | town → north / north → town | −0.99 / +0.53 | 6 m past |
| Southern Fields Way | town → south / south → town | −2.06 / −2.07 | 6 m past |
| South Residential | town → west / west → town | −2.07 / −2.42 | 6 m past |
| West Residential | town → west / west → town | −1.76 / −0.23 | 6 m past |
| Training Forest | town → west / west → town | −4.60 / −4.29 (held up in the opening) | 6 m past |
| Hunter's Loop · Cedar Spine | west → north / north → west | +0.28 / +0.14 | 6 m past |
| West Woodland Fork | town → west / west → town | +0.70 / −0.49 | 6 m past |

- **Every crossing:**
  - The player arrived on the ground (0.00 m above it, no drop) in the right area, 4–28 s after the gate.
  - There was exactly one area change (via the gate), one travel, and one world-status banner, which was the right one ("East/North/South/West Wilds · Optional PvP" or "Wolfveil Town · PvE").
  - The "Entering … · <gate>" notice showed.
- **Riding the Fantasy Bear:** Market Stone Bridge both ways and Ridge Path both ways all travelled. The rider arrived still mounted each time, 6 m past, on the ground.
- **Whole-world switch (`?wholeWorld=1`):**
  - The ground was one section of 192,200 triangles. The loader was off with all five areas loaded (319 of 319 units).
  - All 11 torii were present, with no veil and no cut.
  - Walking west through the Market Stone gate stayed in the same scene, with no travel: the loader switched East → Town with the usual "Entering" notice.
  - Walking the deck from its east end to x = 89.7 stayed on the deck for all 269 frames.
- **Test-harness pitfall (not a game bug):** a `requestAnimationFrame` → `setTimeout` patch without a matching `cancelAnimationFrame` keeps the previous scene's loop alive after travel. Two worlds then alternate and flip the world status every frame. With the browser's own `requestAnimationFrame`, travel left exactly one world running.

## 5. Second recording: the far side, bridges and the brick lane

### 5.1 The "teeth" and the barrier: the far side is now unloaded, not walled off

**What it was.**
- Each area scene keeps whole terrain triangles chosen by their centre, so its ground ends in a sawtooth along every border. The white spirit veil stood on top of that edge, and the sawtooth showed against it as teeth.
- Behind the veil, a lot of the far side was still drawn, floating over nothing:
  - Anything that straddles a border stays whole in every area: the trail network, the brick roads, the river, the far half of each bridge, and the outer cliff skirt.
  - The baked grass, flower, fern and reed cards, the baked rock field and the living meadow's grass are placed without regard to area (47,397 instances in the Town scene).
  - 74 reused trees, bamboo and rocks, the Wolf-Ear peaks, a waterfall sheet, and 308 tiles of the meadow's horizon ground.

**What changed.**
- **`WolfveilTerrainAreaStream.mjs`.** An area's ground is cut exactly along its border (`WolfveilAreaClip.mjs`). The edge is straight, and the five areas tile the valley with no gap or overlap. A dark earth face hangs 14 m down from the cut edge, like the existing outer-edge cliff; it is decorative and takes no raycasts.
- **`WolfveilAreaClip.mjs` (new), wired in `GameWorld3D.jsx`.**
  - Every plain mesh that reaches past the border is cut at it. In the Town scene that is 20 meshes, including all parts of the three east bridges, which now end at their torii. Meshes wholly outside are emptied.
  - Instances outside the area are scaled to nothing whenever their owner rewrites them, for example the streaming meadow.
  - Groups that arrive later are cut on a 2 s rescan.
  - It never touches the torii gates, the streamed ground, skinned meshes, or anything marked `wolfveilAreaKeepWhole`.
- **`WolfveilAreaGates.js`.** `veil:false` draws no veil wall, and `GameWorld3D` passes it. The veil collision is unchanged (you still cross only at a gate). The membranes now track the camera for their colours and labels.
- **Whole-world switch (`WolfveilAreaScenes.mjs`).** This is the owner's stopgap: portal scenes are on by default.
  - `?wholeWorld=1` (this tab) or `localStorage game3d.wolfveilWholeWorld=1` (this device) loads the whole valley in one scene again: all ground, the loader drawing everything, every torii decorative, no veils and no travel.
  - `?wholeWorld=0` forces portal scenes.

**Result (Town scene, local).** From the Market Stone Bridge and from above the Ridge Path, the bridge or trail ends at the torii's portal and there is only sky beyond. There is no wall, no sawtooth, and no floating grass, rocks or trees.

### 5.2 Walking under a bridge put you on top of it

**What it was.**
- `sampleGroundY` casts down from 1,500 m and took the highest surface. Under a bridge deck, that is the deck, so the player's feet snapped up onto it.
- The rail guard (`resolveWolfveilBridgeRailing`) is 2D. Under a deck it also held the walker inside the rails, so they couldn't walk out sideways.

**What changed.**
- **`sampleGroundY(x, z, referenceY)` (meaning changed).** With `referenceY` (the feet, as the feet glue passes it), on the classic Wolfveil map it returns the highest floor at most 1.1 m above the feet. If no floor is in reach, it returns the nearest floor above. Without `referenceY` it is unchanged (the highest). Suigen keeps its own 0.72 m rule. Under a bridge over water it now returns the river bed, not the deck.
- **Rail guard.** `WolfveilTown.js` keeps each deck plan (`world.bridgeDecks`). The guard skips a walker whose feet are more than 1.2 m below the deck.

**Result.** All three bridges were checked on foot.

| Bridge | Walk under (feet stayed at) | Onto the deck from its town end |
|---|---|---|
| Market Stone Bridge | 13.0 m, deck at 21 m; walked straight across | on the deck, 21.6 m |
| Residential Timber Bridge | 43.3 m, deck at 51.1 m; walked across | on the deck, 51.1 m |
| Outrider Rope Bridge | 73.8 m, deck at 77.3 m; walked across | on the deck, 77.3 m |

A scan of the Town area found no other walkable surface more than 2.4 m above the ground than these decks.

### 5.3 The brick path sticking out

**What it was.**
- The residential lane `river_housing_loop` fords the river beside the Market Stone Bridge, (72,−105) → (139,−122), and again by the Timber Bridge.
- Path strips were only dropped within 12 m of the river's centre line, at the water's edge. So the brick paving ran down a 26 m bank into the water (22.5 m high 32 m from the river, −4 m at the water). The east end also hung past the border.

**What changed.** `WolfveilPavedRoads.js` paves no strip within 26 m of the river, which is the top of the bank. The dirt trail still runs down to the water, and the border cut removes the east part in the Town scene.

### 5.4 Does the area flip every frame at a gate?

The WebGPU session read the two banners as the area flipping every frame. This was measured frame by frame with classic WebGL, the owner's renderer. Signals sampled: the loader's area, world status, crossing-mist opacity, fog, sun and ambient light, exposure, and the camera's side of the gate.

- **Owner's build (`main` d8817383), riding.**
  - Standing in the Market Stone torii for 3 s (0.2–0.4 m short of the plane): the area, world status, fog, lights and exposure never changed. The mist held near-white at 0.78–0.86, bobbing slightly with the mount.
  - Riding back and forth across the line four times: the area never changed (the loader needs 12 m), and nothing travelled. The world status changed once per crossing, which posted four banners (East Wilds, Town, East Wilds, Town). That is why both banners were on screen.
  - So the white comes from the steady crossing mist. Whole-frame white, pink and dark alternation, also seen in Town far from any gate, is the renderer, composited under that steady mist.
- **This branch.** Standing 0.71 m before the torii on foot (95 frames) and 1.38 m before it riding (97 frames), then going through:
  - The area, world status, fog, sky, lights, exposure and camera side showed 0 changes and 0 frame-to-frame flips.
  - The mist rose smoothly and held (0.73 and 0.57).
  - Going through gave exactly one area change, one travel and one banner.
- **Floating rocks and grass.** They do not come from what the area loader loads. They are scenery the loader never manages, standing over areas whose ground is not loaded:
  - instanced baked grass, flower, fern and reed cards;
  - the baked rock field (in the Town scene, 194 of 269 boulder instances stood outside Town);
  - the streaming living meadow;
  - the reused trees, bamboo and rocks group.

  The area scope in 5.1 now cuts or hides them.

### 5.5 Not handled here

- **Swimming:** the Game 3D animations session.
- **Black or dark frames at 3.9, 15.8, 31.7 and 39.6 s:** the WebGPU session.
- **Ambient birds and discovery markers** may still be seen past a border (6 birds and one tablet in the Town scene). They are small, moving or interactive, so they were left alone.

## 6. Tests

`tests/game3d-wolfveil-gate-travel.test.mjs` (9 tests) covers:

- Every gate, both ways: the plane crossing travels to the far side with a valid landing and heading.
- Every gate, both ways: being held up in the opening travels, both walking and riding. A free step does not.
- No travel beside a gate, along it, too far in front, heading away, after a teleport, or into the loaded area.
- The world status holds the scene's area, and the server rule still ignores any client area.
- The wiring in `GameWorld3D` and `GameView`.

`tests/game3d-wolfveil-area-edge.test.mjs` (10 tests) covers:

- The exact border cut: tiling, attributes, placed meshes and groups.
- The scene cut and the area scope: instances, rewrites and late meshes.
- Straight-edged ground for all five areas, with the earth face only on cut edges.
- The whole-world switch.
- No veil mesh, with the membranes still tracking the camera.
- The rail guard under and on a deck.
- The `sampleGroundY` rule.
- Paving stopping at the bank.
- The `GameWorld3D` wiring.

Also updated:

- `game3d-wolfveil-area-gates` now matches the area-filtered, veil-less gates. Its old assertion already failed on `main`.
- `game3d-clone-wolfveil-five-area-loading` matches the whole-world switch.
- `game3d-pvp-inline-weather-quest` allows the new `area` prop.

**Full suite against `main` c64e39d9:**
- On this branch: 1,715 tests, 117 failing.
- On `main`: 1,696 tests, 119 failing.
- No test fails on this branch that passes on `main`. The two that fail only on `main` are the gate wiring assertion fixed here and an online quick-match test.

ESLint reports no more errors than `main` on any changed file, and the new files are clean. `vite build` succeeds.

## 7. Not verified

- **A deployed Base44 build.** This was a local `vite dev` in the desktop app's hidden browser pane, so frames came from a Worker tick and the views were captured off the canvas. A visible window at 60 fps was not checked.
- Gliding or flying through a gate.
- Remote players watching someone go through.
- Mobile and the desktop app.
- The whole-world switch beyond the checks in section 4: its frame rate and memory with the whole valley loaded were not measured.
- **The flicker.** Both recordings show whole-frame flicker away from any gate: town street then a green field at 9 s in the first, and black or dark frames at 3.9, 15.8, 31.7 and 39.6 s in the second. That is the renderer or render loop, not the area or gate code. Locally, a single world had one player-position publisher and no per-frame area flip. It is with the WebGPU session and was not edited here.

## 8. For other sessions

- **`sampleGroundY(x, z, referenceY)` meaning changed** on the classic Wolfveil map. With `referenceY` (the feet), it returns the highest floor at most 1.1 m above the feet; if none is in reach, the nearest floor above. Without it, the highest, as before. Its arguments are unchanged, and the feet-glue `if/else` block was not restructured.
- **`resolveWolfveilBridgeRailing`** takes an optional sixth argument, `{deckHeightAt}`.
- **`createWolfveilAreaGates`** takes `veil:false`.
- **Gate landings** are never in deep water: bridge landings are on the deck, trail landings on the trail. The arrival auto-mount sits just above the "Companion mount toggle (F)" comment and sets `mountToggleRef`, like a key press.

## 9. What the owner has to do

1. Open a PR from `claude/wolfveil-gate-travel-20261121` into `main`, review it and merge it.
2. Publish the app in Base44 (or let the preview pick up `main`), then hard-refresh the preview.
3. Close the unmerged `claude/wolfveil-area-streaming-20261119` branch. It conflicts with the one-area-per-scene design.
4. Optional, to try the whole valley in one scene: open the game with `?wholeWorld=1`.

## 10. Rollback

- **Whole valley without reverting:** `?wholeWorld=1`, or `localStorage game3d.wolfveilWholeWorld=1`.
- **Bring back the veil look:** pass `veil:true` (the default) to `createWolfveilAreaGates`.
- **Remove the border cut:** drop the `createWolfveilAreaScope` block.
- **Undo the bridge floor rule:** revert the `floorY` lines in `sampleGroundY`.
- **Undo the bank rule:** revert `wolfveilPavingNearRiver`.
- **Everything:** revert the commits.
