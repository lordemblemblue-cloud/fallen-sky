# Game 3D clone — Four-region Wolfveil streaming (first integration pass)

## Scope and owner intent

The owner requested a major reduction in Game 3D map lag by splitting
exploration into four independently loaded areas. Bridges should behave as
**invisible transitions**: when crossing, nearby destination scenery is ready
before the previous bank is retired. A later cave/visible portal can connect
to wholly new regions, e.g. a different 31–70 progression environment. These
level bands are **ideas**, not implemented encounter or admission rules.

This branch is a first-pass, real in-Play *render instance-buffer* stream,
not an assertion that the entire Wolfveil map is four distinct loaded maps.
Existing outer-meadow terrain and grass already use per-tile, disposed-on-exit
streaming (WolfveilLivingMeadow). This adds region-scoped GPU instance buffers
for the Classic Wolfveil builder's known-safe **static architecture, natural
forest and path-edge stones**. Old source instances remain nonrendered; the
next region's instance attributes are created on approach; buffers of distant
regions are detached and disposed. Shared geometry/materials remain
resident in memory until normal world teardown.

### Four regions (authoritative Wolfveil local X/Z; Play shifts +70m Z)

| Region | Approximate territory | Gameplay identity |
|---|---|---|
| town | west of x=122, east of x=-190, below z=240 | Wolfveil home, market, southern gate and early training |
| west | x <= -190, below z=240 | cedar woodland, western exploration and Wolf Stones |
| east | x >= 122, below z=240 | riverbank crossings, quarry, ravine |
| north | z >= 240 | sanctuary, waterfall approaches and highlands |

These are render boundaries, NOT collision walls or PvP authority borders.

### Physical gateways (invisible)

- Market stone bridge: crossing local x=122 near z=-98
- Residential timber bridge: x=122, z=35
- Outrider rope bridge: x=122, z=205
- West cedar trail: x=-190, z=65
- Northern sanctuary pass: z=240, x=4

Five actual trail/bridge gates connect the **four streaming regions**.
Other valid walking routes and workflow teleport positions use coordinate
classification rather than forcing an impossible invisible wall. A 12m
hysteresis prevents camera/area flicker. The next area is prewarmed from
90m before an area boundary, allowing **both banks** to stay visible while
the player crosses. Once outside that safety distance and when the next
area is ready, unused area instance buffers are disposed.

## Never streamed or rewritten by this phase

- **One authoritative 1100m terrain / BVH** (no duplicate collision floors)
- River, bridge rails, water shaders, buildings' analytic collision
- Shared original textures/geometries, imported GLBs, owner replacement foliage
- Dynamic owner-grass replacement: source visibility changes asynchronously,
  and moving those meshes would resurrect retired grass
- Remote player positions, enemies, quests, dungeon portals, server world,
  movement permissions, PvP damage, saved positions and exact LAND squares
- Existing distant meadow tile loader (still handles its own terrain/BVH,
  near-player grass, remote grass contacts and cleanup)

This means **full-map unload and complete CPU/GPU residency reduction is not
yet finished.** Whole-scene systems, independent GLB town roots, all AI, and
some large terrain/foliage batches are still globally owned. No measurable
FPS improvement is claimed without signed-in Play benchmarks.

## Instrumentation / reversible QA

In a signed-in clone Game 3D Play browser console:

```js
window.__gw3dRegionStreamer.getStats()
// {region, loadedRegions, loadedInstances, unloadedInstances, ...}
window.__gw3dRegionStreamer.setEnabled(false) // baseline (original static sources)
window.__gw3dRegionStreamer.setEnabled(true)  // four-region stream
window.__gw3dRenderer.info.render.calls
window.__gw3dRenderer.info.memory.geometries
```

Read-only last report: `window.__gw3dRegionStreamingStatus`.

`game3dWorldRegionChange` announces only an actual area transition.
If the crossing began at the literal bridge and 12m hysteresis delays
the region change, it retains the crossing gateway ID. Workflow teleports
do not fabricate crossing notifications.

Full-map GLB + code export temporarily displays the original *complete*
static instance source rather than exporting just the currently resident
area; the view is restored in a `finally` block even if the export fails.
The controller restores the original meshes and destroys its own buffers
on map teardown.

## QA gates before considering this a complete map streaming overhaul

1. Run `node --test tests/game3d-clone-wolfveil-four-region-streaming.test.mjs`
   and native `npm run build` / repository's appropriate build command.
2. Inspect all five physical gateways from both directions at walking,
   running, mounted and workflow-teleport speeds. No missing assets, visible
   pop, black textures, floating scenery, or unloaded bridge floors.
3. Check shoreline, forest foliage sway, rain/wind grass contacts, owner
   ground-cover swap, house GLB completion and cave/portal round trips.
4. Confirm full GLB export contains the *entire* authored town/forest and
   not just the active region. Compare with streaming disabled.
5. Compare median/p95 frame times, renderer calls and GPU residency (where
   available), plus peak JS heap, in all four regions, with streaming OFF/ON.
6. Check two simultaneous signed-in players in different regions, authoritative
   enemy/quest/loot consistency, interaction collision and reconnect.
7. Reconcile future level-gated map instances with server progression and
   create a separate detailed art/design plan for the proposed 31–70 zone.
8. Do not treat hosted no-step CI failures as proof of code defects. Neither
   source correctness nor UI preview alone proves signed-in visual acceptance.

Until those conditions are met, **leave the PR draft** and do not claim a
fully optimized/unloaded four-map world. This change is clone-only.
