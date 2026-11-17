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

## Tests

```sh
node --test tests/game3d-clone-wolfveil-five-area-loading.test.mjs \
            tests/game3d-clone-platform-graphics.test.mjs
```

45 tests, all passing: areas tile the core exactly; landmarks, fighting
grounds and all 14 mob areas fall where expected; 11 portals on real paths,
each arch facing along its path;
load-before-unload across the market bridge; owner visibility preserved;
changing batches and moving objects handed back; lights untouched; late
models; full-map export; A/B switch; GPU release limits; three platform
profiles isolated from each other; budgets; the wiring in the game world,
menu, notice and diagnostics overlay.

Whole suite in this workspace (no `three`, `esbuild` or `ws` installed):
`main` at `5aa9dac` 2,235 tests / 136 failing; this branch 2,280 tests / the
identical 136 failing; 45 new passing. Edited JS and JSX files parse.

## Not verified

- **Not run in the game.** No signed-in Play, preview, WebGL or build was
  possible in the authoring workspace (package installs were unavailable).
  `npm run lint` and `npm run build` were not run.
- The loader was driven by stand-in scene objects, not real Three.js objects.
  Its behaviour on the real scene is the first thing to check with
  `getReport()`.
- No frame-rate, draw-call or memory measurement exists yet for any area.
- Portal arch size, height and brightness have not been seen on screen.
- GPU release re-upload has not been exercised on a real device.

## Known limits of this pass

- **The town's own draw calls are not reduced while standing in town.** The
  961 calls at the spawn come from the town's models and need batching inside
  the town. Unloading the town helps only the four sides.
- Beyond a border the ground still shows, bare. Unloaded sides have no trees,
  props or buildings until the player is within range; there is no baked
  low-detail skyline for them yet.
- The terrain is still one 192,200-triangle grid drawn whole. Per-area ground
  detail (the high-poly to smart-mesh work) is the next step.
- Enemies, NPCs, grass that streams around the player and the outer meadow
  are unchanged; they already follow the player or are owned by other systems.
- A cave session keeps using the surface area above the player.
