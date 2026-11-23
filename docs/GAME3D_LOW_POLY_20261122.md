# Game 3D: low-poly world and WebGPU (2026-11-22)

Branch `claude/low-poly-world-20261122`, based on main `51135c89`. Owner's request (2026-11-22): put the land in low
poly so everything loads more easily, convert anything high-poly (including the original town's buildings), and make
sure everything is on WebGPU.

Every converted model keeps its earlier version one switch away: **`?hiPoly=1`** in the page URL loads the earlier
models (and turns the town merge and the meadow thinning off) so the two can be compared. Nothing is deployed and
nothing is merged.

## The numbers, per area (WebGPU, before = main `51135c89`, after = this branch)

Each row is one gate hop into that area: the game's own `game3dPortalTravel` event remounts the world as that area's
scene (as a gate does), and the area is counted once it has settled. Counts are of everything visible in the area's
scene, not one camera view.

| area (gate hop) | draw calls | triangles | models + textures loaded | shown | settled |
|---|---:|---:|---:|---:|---:|
| town | 1,334 → **1,248** | 2.59 M → **1.88 M** (−27 %) | 81.4 → **67.1 MB** | 73.0 → **58.4 s** | 75.4 → **67.9 s** |
| south | 827 → 849 | 2.28 M → **1.51 M** (−34 %) | 81.4 → **67.1 MB** | 48.0 → **38.5 s** | 49.2 → **41.5 s** |
| west | 3,333 → 3,338 | 2.84 M → **2.49 M** (−12 %) | 81.4 → **67.1 MB** | 58.0 → **57.5 s** | 71.3 → **61.1 s** |
| east | 1,174 → 1,179 | 4.32 M → **3.39 M** (−22 %) | 81.4 → **67.1 MB** | 99.5 → **63.1 s** | 100.4 → **64.2 s** |
| north | 1,169 → 1,174 | 3.74 M → **2.99 M** (−20 %) | 81.3 → **67.1 MB** | 66.6 → **52.1 s** | 68.2 → **55.4 s** |

- **shown** = from the gate event until the game lifts its loading curtain (`game3dWorldAvatarReady`, after the new
  scene's WebGPU shaders are compiled); **settled** = until the counted scene stops changing. Measured in a hidden
  browser pane that downloads every file again on each hop, so absolute times are far slower than a player's machine
  with a browser cache; read them as before against after. One run each; the south "after" hop was repeated from a
  settled town (the first one overlapped the world entry), as the "before" one was.
- The draw calls outside the town and the texture memory differ by spawn timing, not by this branch: archer NPCs
  (≈290–386 MB of textures, about 5 meshes each) and birds were counted when they had finished loading. The scenery
  this branch changed, counted alone:

| area | piece | draw calls | triangles | textures (MB, uncompressed) |
|---|---|---:|---:|---:|
| town | valley scenery (elms, grass tiles, rocks, bridges) | 261 → 261 | 1.48 M → **1.12 M** | 149 → 149 |
| town | meadow grass | 27 → 27 | 586k → **208k** | 0 |
| town | town plaza (buildings) + guards | 282 → **190** | 55k → 55k | 66 → 66 |
| town | ambient birds | 4 → 5 | 21k → 28k | 64 → **1** |
| south | meadow grass | 59 → 59 | 1.74 M → **0.86 M** | 0 |
| west | valley scenery | 153 → 153 | 1.16 M → **1.11 M** | 128 → 128 |
| west | meadow grass | 140 → 140 | 985k → **668k** | 0 |
| east | valley scenery | 152 → 152 | 797k → **748k** | 141 → 141 |
| east | meadow grass | 152 → 152 | 2.89 M → **1.98 M** | 0 |
| north | valley scenery | 122 → 122 | 556k → **510k** | 73 → 73 |
| north | meadow grass | 209 → 209 | 2.64 M → **1.92 M** | 0 |
| every area | ambient birds | — | — | 64 → **1** |

Raw results: `docs/game3d/low-poly/perf-runs/*load-before-*.json` and `*load-after-*.json`
(`node scripts/game3d-load-compare.mjs docs/game3d/low-poly/perf-runs --md`).

<!-- FRAMES -->

## What the town and the land were made of (measured before any change)

Counted on main `51135c89`, WebGPU, in the whole scene each area loads (`Game3DSceneInventory.mjs`; everything
visible in the scene, not only what one camera sees). Heaviest pieces:

| What | Where | Draw calls | Triangles | Note |
|---|---|---:|---:|---|
| Streamed meadow grass (`WV_4MileRadius_StreamingSolidMeadow`) | every area | 27-209 | 0.54 M (town), 1.74 M (south), 0.99 M (west), **2.89 M (east)**, **2.64 M (north)** | each clump is the owner's 720-triangle long-grass tile, 32-180 clumps per 48 m square |
| Owner elm trees (`/game3d/elm-owner-optimized.glb`) | town, valley | 6 per area copy | ~0.5 M in the town scene | one elm was 15-39k triangles (bark 11-30k + single-triangle leaf cards) |
| Owner long-grass tiles in the valley (far ring) | valley | ~40 | ~0.6 M | split near/far around the market, not around the player (left as is, see below) |
| Town plaza buildings (`AXETownPlaza.js`) | town | **~355** | ~23k in view | already low in triangles; the cost was the number of separate meshes |
| Ambient birds | every area | 4 | 28k | one 4096 px texture for a distant bird (64 MB of GPU memory) |
| Plant pack + garden leaves (owner route-side models) | valley | 8 | 45k | 12 MB of PNG textures to download |

The original town is the procedural artisan plaza (`AXETownPlaza.js`, installed by `WolfveilArtisanTownScene.mjs`):
the fountain, the four shops, the eight residences, the gates. The older assembled-town GLB
(`461493b8c_game3d_town_assembled.glb`, 8.4 MB) and the samurai house GLB are no longer loaded by the world, and the
Luna palace has no source in this build ("Lakeside manor sources are not available", the same on main).

## What changed

| Piece | Before | After | How |
|---|---|---|---|
| Owner elms | 88,362 triangles, 6.46 MB | **24,122 triangles, 3.12 MB** | headless Blender (`tools/low-poly/elm_lowpoly.py`): bark collapse-decimated to 20 % (the smallest twig triangles go first, trunk and main branches keep their outline); half of the leaf cards kept, each scaled by 1/√0.5 about its centre so the canopy covers the same area. Same node names, transforms, materials (alpha mask 0.13), textures and UV channels. |
| Town plaza buildings | 525 draw calls at the fountain (355 in the "doors closed" state the live game shows) | **279** (190) | `AXETownStaticMerge.mjs`: one mesh per material inside each part the town moves, hides or animates; nothing merges across a room, proxy, roof, ceiling, gate, lantern, noren, mount, hoist or animated mesh. Footprints, doors, heights and collision unchanged (collision is analytic). |
| Meadow grass, 85-145 m from the player | 720 triangles per clump | **360** | `WolfveilGrassClumpLod.mjs`: half the blades, each widened about its centre line (height and bend kept). |
| Meadow grass, beyond 145 m | 720 per clump | **180** | a quarter of the blades. Near squares (< 85 m) keep the full clump. |
| Ambient bird | 2.14 MB, 4096 px texture | **0.45 MB, 512 px** | `scripts/game3d-glb-textures.mjs` (geometry and rig untouched). |
| Plant pack | 6.69 MB | **1.87 MB** | same geometry and 1024 px textures, PNG → WebP (`EXT_texture_webp`). |
| Garden leaves | 5.44 MB | **1.01 MB** | same. |

Files: `public/game3d/elm-owner-lowpoly.glb`, `public/game3d/lowpoly/{ambient-bird-512,plant-pack-webp,garden-leaves-webp}.glb`;
the switch is `src/components/game3d/render/lowPolyWorld.mjs`.

## The land and gameplay ground

- **Gameplay heights come from the drawn ground meshes.** `sampleGroundY` in `GameWorld3D.jsx` casts a ray down
  against `groundMeshes`: the streamed terrain area mesh, the meadow's near terrain tiles, house floors, bridge decks
  and cave floors (`walkableSurfaces`), then takes the imported town's analytic floor where it is higher. The glider's
  2 m wall rule, quests and pinned anchors read the same function. So **the terrain mesh was not touched**: lowering
  its density would move the ground the player stands on. It is also already modest (the town area floor is 25,916
  triangles).
- Nothing that changed is a ground or collision mesh: elms, meadow grass clumps, birds and plants are decorative
  (their trunk colliders are a fixed list, `WolfveilTrunkColliders.mjs`); the town's walls and floors are analytic.
- The height functions (`WolfveilLandscapeDesign.mjs`, `WolfveilLayout.js`) are unchanged.
- Not changed, on purpose: the valley's own long-grass tiles. They are split into near and far around the market, not
  around the player, so a thinned "far" tile would be seen up close when the player walks there. Making them follow
  the player is the next step for the land (it needs the area loader's per-area copies to follow too).

## WebGPU

- WebGPU is the world's renderer wherever the browser offers it (main since `b79cb242`). The only `WebGLRenderer`
  constructions left are the classic fallback paths (`GameWorld3D.jsx` classic branch, `lib/webgpuSceneRenderer.js`,
  `lib/gameWebGPURenderer.js`): used only without WebGPU, after a WebGPU failure, or with `?renderer=webgl`.
- **Runtime audit, all five areas (`auditWebGPUMaterials`): no material the world draws is GLSL-only.** Every
  `ShaderMaterial` has a node twin (`lib/webgpuMaterialTwins.js`) and every `onBeforeCompile` hook has its TSL nodes
  attached (`lib/webgpuNodeKit.js`), on visible and hidden objects alike.
- Post effects: the ink pass picks a WebGPU `RenderTarget` (`render/inkWashLook.js`); the Horizon Vision panel has a
  WebGPU readback path. The only `EffectComposer` is in `render/BlazeOfGrassWorld.mjs` (the retired
  "atomic-ultra-sumi" art style): nothing imports it any more and the pause menu migrates players off that style.
- The new models load on WebGPU: the WebP textures go through three.js's `EXT_texture_webp` support.

<!-- PICTURES -->

## Not converted (found while measuring)

- **Zombies in the west: 206 meshes each**, which is most of the west's 3,333 draw calls. Enemy models are not in this
  branch's scope.
- **Characters' textures:** the Erika archer NPCs carry ~290-386 MB of uncompressed textures; the player's own
  character, hair and sword 72 MB.
- **Downloads on every gate hop:** each hop downloads ~81 MB again in the test pane (the CDN sends
  `max-age=31536000, immutable`, so a normal browser cache keeps them; the test pane did not). The largest are
  characters and enemies: the zombie attack FBX 16 MB, `Male_Fused_v2.glb` 11.7 MB, `Artemis_Character_v5.glb`
  11.5 MB, `Getsuga_Tensho_Character_v5.glb` 9.1 MB. This branch cut the world's own models from 22.3 MB to 6.5 MB.
- Loading curtain: after a gate hop the game lifts the curtain on `game3dWorldAvatarReady`; when that takes over 30 s
  (it did in the hidden test pane every time, before and after) GameView shows "World entry interrupted" while the
  world finishes loading behind it.

## How it was measured, and how to rerun

- **Counts and load times:** `src/components/game3d/performance/Game3DAreaLoadTiming.mjs` (dev only). It enters the
  world, then hops to each area with the game's own `game3dPortalTravel` event, and records: **shown** = from the
  click / gate event until the game's own `game3dWorldAvatarReady` (when it lifts the loading curtain; on WebGPU after
  the new scene's shaders are compiled), **settled** = until the counted scene has not changed for three readings
  0.8 s apart, the counted draw calls, triangles and texture memory (uncompressed RGBA) of everything visible in the
  scene, and the model and texture files fetched. Results: `docs/game3d/low-poly/perf-runs/*load-before-*.json`
  (main) and `*load-after-*.json` (this branch). `node scripts/game3d-load-compare.mjs docs/game3d/low-poly/perf-runs --md`
  prints the table.
- **Frame time:** the perf-baseline session's probe (`Game3DPerfProbe.mjs`, brought in unchanged from
  `claude/perf-baseline-20261121`), same viewpoints, WebGPU, governor pinned, the probe drawing 90 timed frames per
  view. `node scripts/game3d-perf-compare.mjs <before>.json <after>.json`.
- **Model numbers:** `node scripts/game3d-glb-stats.mjs <file.glb>`; CDN originals: `node scripts/game3d-fetch-world-models.mjs <dir>`.
- **Conditions:** the in-app browser pane was hidden, with the probe's rAF pump; this machine is an AMD Radeon 780M
  (RDNA 3) iGPU where Chrome's WebGPU costs about twice as much per lit pixel as WebGL (see
  `webgpu-conversion` notes). Load times include full downloads every time (no cache in the pane) and are slow in a
  hidden pane; compare before with after, not with a player's machine.

## Tests

- `tests/game3d-low-poly-world-budgets.test.mjs`: triangles, draw calls, texture sizes and file sizes of every
  low-poly model; the elm keeps its names, materials, alpha mode, UV channel and authored transforms; `?hiPoly=1`
  reaches the earlier files; the meadow clump thinning.
- `tests/game3d-low-poly-town-merge.test.mjs`: the town plaza built twice from one seed, with and without the merge;
  every visible triangle (per material and 2 m cell) identical in eight states, and the draw-call budget at the
  fountain (290).

<!-- SUITE -->
