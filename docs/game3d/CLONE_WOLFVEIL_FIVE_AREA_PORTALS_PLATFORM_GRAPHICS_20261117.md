# Wolfveil in five loaded areas, with portals and per-platform graphics (2026-11-17)

**Repository:** `lordemblemblue-cloud/fallen-sky` only.
**State: review branch. Logic tested in Node; NOT yet seen running in the game.**
Supersedes the four-region instance streaming of 2026-11-15
(`CLONE_WOLFVEIL_FOUR_REGION_STREAMING_20261115.md`); that module is left in
place but is no longer mounted.

## What the owner asked for

Divide the map into a town and four sides (front, left, back, right), joined
by portals, with only the side the player is on kept loaded, so the frame rate
holds while the landscape is rebuilt. Give web browser, desktop and mobile
their own graphics settings, including resolution. Tune the web browser first.

## The five areas

Wolfveil local metres (Game 3D adds +70 m world Z). The whole 1,100 m core is
covered with no gap or overlap; each area runs on outward into the outer meadow.

| Area | Side | Bounds (local) | Size | Share |
|---|---|---|---|---|
| Wolfveil Town | centre | x −190…122, z −265…240 | 0.158 km² | 13.0% |
| Southern Gate Fields | front | x −190…122, z below −265 | 0.089 km² | 7.3% |
| Western Cedar Wilds | left | x up to −190, z below 240 | 0.284 km² | 23.5% |
| Eastern Riverlands | right | x from 122, z below 240 | 0.338 km² | 27.9% |
| Northern Highlands | back | z from 240 | 0.341 km² | 28.2% |

West, east and north reuse the earlier streaming borders. The south border is
at −265 rather than at the gate so the south residential road reaches the west
without clipping a corner of the southern area.

## Portals

A portal is every point where an existing road, frontier trail or bridge
crosses an area border. They are computed from `WOLFVEIL_ROUTES`,
`WOLFVEIL_FRONTIER_TRAILS` and `WOLFVEIL_BRIDGES`, not hand-placed. A road
sketch that runs down the river channel is dropped; only bridges cross water.

| Joins | Path | Kind | Local x, z |
|---|---|---|---|
| Town ↔ Right | Market Stone Bridge | bridge | 122, −98 |
| Town ↔ Right | Residential Timber Bridge | bridge | 122, 35 |
| Town ↔ Right | Outrider Rope Bridge | bridge | 122, 205 |
| Town ↔ Front | Southern Fields Way | trail | 9, −265 |
| Town ↔ Left | south residential | trail | −190, −260 |
| Town ↔ Left | west residential | trail | −190, −111 |
| Town ↔ Left | west woodland fork | trail | −190, −64 |
| Town ↔ Left | training forest | trail | −190, 79 |
| Town ↔ Back | ridge path | trail | −22, 240 |
| Left ↔ Back | Hunter's Loop · Cedar Spine | trail | −410, 240 |
| Right ↔ Back | Hunter's Loop · East | trail | 344, 240 |

Each portal is drawn as a slim arch of light across its path
(`WolfveilAreaPortals.js`). Bridge arches stand on the bridge deck. Arches are
decorative: no collider, no raycast target, no trigger. The area a player is
in follows their position (with 12 m of hysteresis), so walking around an arch
changes nothing. Arriving in a new area shows one on-screen notice.

## How loading works (`streaming/WolfveilAreaLoader.mjs`)

The valley stays ONE physical world. Never touched: the terrain and its
raycast BVH, the river, every walkable floor, colliders, cave network,
enemies, NPCs, quests, saved positions and all server code.

1. **Single-area scenery** (a mesh or model wholly inside one area) is drawn
   only while that area is loaded.
2. **Map-wide instanced scenery** (trees, stones, plants) is split into one
   batch per area; only the loaded areas' batches exist on the GPU. Geometry
   and materials stay shared.
3. **Stays loaded everywhere:** anything that straddles a border (terrain,
   river, roads), tall slender landmarks (peaks stay on the skyline), walkable
   floors, the caves, and batches that carry per-instance shader data.
4. **Next area ready first.** Within 90 m of a border (browser default) the
   neighbouring area is loaded before the player reaches the portal; the area
   left behind unloads only once the new one is fully built.
5. **Optional GPU release.** After 20 s unloaded, an area's own meshes and
   textures are freed from the graphics card and re-uploaded by Three.js when
   it is shown again. On for mobile, off for browser and desktop.

The loader never fights another system:

- The owner of an object keeps its `visible` flag. The loader adds a second
  condition on top, so a mesh a system has retired is never shown again.
- Scenery is accepted only after two scans agree on it (async models), and a
  batch only after 3 s unchanged. A batch whose owner edits it afterwards, or
  any object that moves, is handed back untouched and never managed again.
- Scenery that carries lights is hidden mesh by mesh so the number of active
  lights never changes (that would recompile every lit material).
- Full-map export shows every original object for the duration of the export.
- **Fail open.** If the real scene holds something the loader did not expect
  and it throws, it switches itself off, draws the whole valley as built and
  logs one warning. `getStats().failed` then holds the reason.

## Platform graphics (`performance/Game3DPlatformGraphics.mjs`)

Three profiles, each with its own saved settings. Escape → Graphics →
**Platform Graphics** picks the profile (Auto follows the device). Every other
control on that page is saved to the active profile only.

| Setting | Web browser | Desktop app | Mobile |
|---|---|---|---|
| 3D resolution | Adaptive | Native pixels | 720p |
| Quality preset | High | Ultra | Low |
| Dynamic shadows | On | On | Off |
| Frame rate cap | 60 | 120 | 30 |
| GPU render profile | Auto | Quality | Performance |
| World loading | One area | One area | One area |
| Next area loads within | 90 m | 140 m | 60 m |
| Free GPU memory of unloaded areas | Off | Off | On |

Web browser "Adaptive" renders at the screen's own resolution (1920 × 1080 on
a 1080p display, never upscaled on a smaller one) and only steps down, to 70%
at the lowest, when frames run slow.

Detection: phone or handheld → mobile; installed app window → desktop;
otherwise browser. `?platform=mobile|desktop|browser` forces one for testing.
A small touchscreen laptop (up to 1450 × 1000) counts as a handheld, as it
already did for the mobile resolution default; pick Web browser in the menu.
First run keeps whatever the player had already chosen on that device. There
is no desktop installer yet; the desktop profile is ready for when there is.

## Per-area budget (`performance/Game3DAreaBudget.mjs`)

| At the busiest view | Web browser | Desktop app | Mobile |
|---|---|---|---|
| Draw calls (of which scenery) | 500 (350) | 1,000 (700) | 200 (140) |
| Triangles (of which scenery) | 1.5 M (1.0 M) | 2.0 M (1.4 M) | 0.75 M (0.5 M) |
| Frame rate target / floor | 60 / 30 | 60 / 30 | 30 / 24 |

The whole valley measured 222–961 draw calls and 1.97–2.86 M triangles of
scenery per view on 2026-11-16, before this change.

## Checking it in the game

Escape → Graphics → turn on **Performance metrics**. The overlay now shows the
loaded area, the budget line and how much scenery is in and out. In the
browser console:

```js
window.__gw3dAreaLoader.getStats()    // area, loaded areas, triangles in/out
window.__gw3dAreaLoader.getReport()   // per-area totals, what stays loaded and why
window.__gw3dAreaLoader.setEnabled(false) // A/B: draw the whole valley as built
window.__gw3dAreaLoader.setEnabled(true)
window.__gw3dAreaLoader.setMode('all')    // or 'single', 'neighbors'
```

`getReport().alwaysLoaded.largest` is the to-do list: the biggest things still
drawn in every area, with the reason each one could not be assigned.

## Rollback

- In game: Graphics → World loading → **Whole valley**, or
  `window.__gw3dAreaLoader.setEnabled(false)`.
- In code: in `GameWorld3D.jsx`, remount `createWolfveilFourRegionRuntime` in
  place of `createWolfveilAreaLoader`, or pass `mode:'all'`.

## Measured on the real valley (CI, Three.js r171)

`scripts/report-wolfveil-area-loading.mjs --town` builds the real valley and
the town the game mounts, mounts the real loader and portals, and counts
everything handed to the renderer. It counts all directions at once, so the
numbers are an upper bound on what one camera view draws. The job
"Real valley under real Three.js, lint and production build" runs it on every
pull request, then lints the new files and runs `npm run build`.

Draw calls / triangles standing deep inside each area (browser budget: 500
draw calls, 1.5 M triangles). All four owner models (tree, grass, plants,
garden) load in this run.

| Area  | Whole valley, as it was built | One area loaded, now |
|-------|-------------------------------|----------------------|
| town  | 4,558 / 3.44 M                | 790 / 1.63 M         |
| south | 4,591 / 4.40 M                | 303 / 1.75 M         |
| west  | 4,591 / 4.32 M                | 490 / 2.38 M         |
| east  | 4,586 / 4.09 M                | 450 / 1.92 M         |
| north | 4,591 / 4.30 M                | 437 / 1.91 M         |

- All 11 portals pass walking both ways: arrival notice, both sides loaded
  during the crossing, arch shown.
- Nothing lost or duplicated: with every area loaded the triangle total equals
  the whole valley; full-map export sees exactly the original objects; dispose
  restores every object.
- **Caves** (`wolfveil/WolfveilCaveDrawBudget.mjs`): 791 draw calls as built,
  drawn from anywhere. Now 65 on the surface and 150 inside a cave, with the
  same triangles per material and the same bounds.
- **Town** (`performance/Game3DStaticMerging.mjs`): the artisan plaza is 3,555
  draw calls for 139,468 triangles as built. Merged: 399 draw calls, the same
  139,468 triangles, bounds unchanged. 3,212 parts became 56 meshes; 224
  moving parts, 64 tagged, 33 see-through and 13 one-of-a-kind parts were left
  alone; none had to be handed back in ten seconds of town animation.
- **Distant scenery** (below): 1 to 5 draw calls and 46,000 to 69,000
  triangles per area, included in the table.

What is still over budget, in measured order:

1. Triangles in every area: grass that follows the player (0.85 to 1.17 M)
   and the owner's long-grass tiles (95,000 to 660,000 per area).
2. Draw calls in town (790): town parts left unmerged because they move,
   are tagged or are see-through (about 340), long-grass tiles (148), caves
   (65).
3. Lights: 20 to 26 lights are switched on wherever the player stands. Their
   cost shows only in a real frame-rate reading.

## Distant scenery (what an unloaded area still shows)

Setting: Graphics menu, "Distant scenery", per platform (browser and desktop
on, mobile off). Loader options `farScenery`, `farProxy`.

Two parts, both in `streaming/WolfveilAreaLoader.mjs`:

1. **Kept whole.** Tall, cheap instanced scenery (instances 4 m and taller,
   at most 60,000 triangles per batch) is never split or unloaded. One draw
   call per batch for the whole valley, the same as one area's copy cost. On
   the real valley: 5 batches, 460 instances, 51,096 triangles (the gorge's
   rock terraces and the fallback trees).
2. **Outline.** Tall scenery that does unload with its area is baked into one
   coarse mesh per area (`performance/Game3DFarProxy.mjs`, vertex clustering
   on a 0.75 m grid, at most 30,000 triangles, flat colours taken from the
   real materials; `wolfveil/WolfveilFarOutline.js` builds the mesh). It is
   shown while its area is unloaded, hidden with the loader off and during a
   full-map export, and rebaked when the scenery or an owner's visibility
   changes. On the real valley:

   | Area | Stands for                         | Outline        | Bake  |
   |------|------------------------------------|----------------|-------|
   | town | 16 tall meshes, 66,736 triangles   | 10,734 tris    | 20 ms |
   | west | the owner's trees, 108,240 tris    | 22,646 tris    | 27 ms |

   South, east and north hold no tall scenery that unloads, so they have no
   outline. Their ground cover (grass, flowers, shrubs, stones) is still
   absent beyond 90 m.

## Tests

```sh
node --test tests/game3d-clone-wolfveil-five-area-loading.test.mjs \
            tests/game3d-clone-platform-graphics.test.mjs \
            tests/game3d-clone-wolfveil-cave-draw-budget.test.mjs \
            tests/game3d-clone-static-merging.test.mjs \
            tests/game3d-clone-far-proxy.test.mjs
```

76 tests with stand-in scene objects, all passing. The real-valley test
(`tests/game3d-clone-wolfveil-area-loading-real-world.test.mjs`) runs where
`three` is installed, which is CI.

## Not verified

- **Not seen in a browser.** No frame rate, GPU time or memory reading exists
  for any area. Draw calls and triangles are counted, not timed.
- Portal arch size, height and brightness have not been seen on screen.
- The merged town, the caves and the distant outlines have not been looked at
  in the game; the checks compare triangles, materials and bounds, not
  pixels. The outline's flat colours and coarse shape are the part most
  likely to need tuning by eye.
- GPU release re-upload has not been exercised on a real device.

## Known limits of this pass

- Town parts that move together (a swaying lantern is several meshes) are
  still drawn one by one: about 224 draws that could be merged per moving
  group.
- Beyond a border the ground cover is still missing: grass, flowers, shrubs
  and stones of an unloaded area are not drawn and have no stand-in.
- An outline pops to the real scenery when its area loads (90 m before the
  border). There is no cross-fade.
- The terrain is still one 192,200-triangle grid drawn whole. Per-area ground
  detail (the high-poly to smart-mesh work) is the next step.
- Enemies, NPCs, grass that streams around the player and the outer meadow
  are unchanged; they already follow the player or are owned by other systems.
- A cave session keeps using the surface area above the player: inside a
  cave the surface area is still drawn (568 draw calls in total).
