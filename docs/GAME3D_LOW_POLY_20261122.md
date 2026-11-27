# Game 3D: low-poly world and WebGPU (2026-11-22)

Branch `claude/low-poly-world-20261122`, based on main `51135c89`. Owner's request (2026-11-22): put the land in low
poly so everything loads more easily, convert anything high-poly (including the original town's buildings), and make
sure everything is on WebGPU.

Every converted model keeps its earlier version one switch away: **`?hiPoly=1`** in the page URL loads the earlier
models (and turns the town merge and the meadow thinning off) so the two can be compared. Nothing is deployed and
nothing is merged. `GameWorld3D.jsx` is not changed by this branch.

**In short:** every area draws 0.35-0.93 M fewer triangles (−12 % to −34 %), the town draws ~90 fewer meshes, each
gate hop loads 14 MB less (81 → 67 MB), and the four converted model files went from 20.7 MB to 6.5 MB (elm, bird, plant pack, garden leaves). Gate hops
showed the world 0.5-36 s sooner in this test setting (single runs). GPU time per frame at the town plaza fell
13-16 % back to back on the same server. The town looks the same (pictures below; a test proves the merged town draws
identical triangles). Everything the world draws runs on WebGPU.

## Part 2 (2026-11-23, branch `claude/low-poly-world-2-20261123`): downloads, archers, zombies

Part 1 below was merged as PR #290. Part 2 takes the biggest costs part 1 found outside the scenery:

| What | Before (part 1) | After (part 2) | How |
|---|---|---|---|
| Model files on each gate hop | ~67 MB downloaded again on every hop | **0 MB**: every model comes from memory | `performance/Game3DModelCache.mjs`, installed by `Game3DPerformanceBootstrap.jsx`: three.js's loader cache for model files only (`.glb/.gltf/.fbx/.bin` bytes, http(s) or same-origin), capped at 192 MB (64 MB on phones and devices reporting ≤ 4 GB), least recently used out first. Images, bitmaps and parsed models are never kept across a teardown (each mount still parses its own copy). The tour held 49 files, 123 MB. |
| "World entry interrupted" after a slow gate hop | on every hop over 30 s | **never** in the tour (0 of 5) | `pages/GameView.jsx` watchdog: once a hop has built its new scene it gets up to 150 s; the first entry keeps 30 s; load errors still show at once. |
| Archer quest givers (town) | 4 separate parses, 24 textures of 2048 px (384 MB) | **1 shared parse, 6 textures of 1024 px (24 MB)** | `npc/sharedNpcModel.mjs`: one parse per world mount, each NPC a skeleton clone with its own bones and materials (they tint them) and shared geometry and textures; images scaled to 1024 px as they arrive, before any upload. Used by `npc/axeAnimatedQuestNpcGLB.mjs` and `npc/spawnLivingQuestNPC.jsx`. |
| Archer enemies (camp enemies on the archer rig) | already one shared parse, 6 textures of 2048 px (96 MB) | **6 of 1024 px (24 MB)** | opt-in `lowPolyTextures` in `performance/SharedSkinnedFBXSpawner.mjs` (default off: the Three Roads enemies keep theirs), passed by `GameWorld3D.jsx` line 1885 only. |
| Zombies (west) | 205 draw groups per zombie (2 materials), textures 2048 px | **2 draw groups**, textures 1024 px | `render/consolidateMaterialGroups.mjs`: the triangles are reordered so each material's are contiguous (same vertices, skinning and animation); `wolfveil/WolfveilZombieHordeRuntime.js` applies it and the texture cap once to the shared source. |

`?hiPoly=1` keeps the earlier behaviour for all of it except the model cache and the watchdog (they change no picture).

**Gate hops, part 1 → part 2** (WebGPU, hidden test pane, one run each, same method as below):

| area | draw calls | texture memory | models loaded | shown | settled |
|---|---:|---:|---:|---:|---:|
| town | 1,248 → 1,248 | 737 → **377 MB** | 67.1 → **0 MB** | 58.4 → **40.7 s** | 67.9 → **43.5 s** |
| south | 849 → 849 | 594 → **234 MB** | 67.1 → **0 MB** | 38.5 → 39.2 s | 41.5 → 44.2 s |
| west | 3,338 → **1,106** | 849 → **417 MB** | 67.1 → **0 MB** | 57.5 → **35.2 s** | 61.1 → **40.8 s** |
| east | 1,179 → 1,180 | 764 → **404 MB** | 67.1 → **0 MB** | 63.1 → **32.0 s** | 64.2 → **32.8 s** |
| north | 1,174 → 1,175 | 695 → **335 MB** | 67.1 → **0 MB** | 52.1 → **34.7 s** | 55.4 → **37.4 s** |

- Measured before the archer-enemy texture cap was added: with it, the areas with archer enemies hold about 72 MB less
  (checked live: every archer texture in the east is now 1024 px; the totals were not measured again).
- Texture memory still depends on spawn timing (which NPCs had loaded when counted); the archer and zombie numbers in
  the table above it were counted directly.
- Checked live on WebGPU: the 11 west zombies draw 2 groups each with 1024 px textures and their bones animate; the town's
  four archer quest givers share one set of six 1024 px textures; no page errors; the WebGPU material audit stays clean.
- Raw: `docs/game3d/low-poly/perf-runs/*load-after2-*.json`.
- Pictures (classic renderer, 13:00, clear): `docs/game3d/low-poly/pictures/side-by-side/npc.archer-closeup.jpg` (an archer quest
  giver, 2048 px textures against the shared 1024 px set) and `west.zombie-closeup.jpg` (205 draw groups and 2048 px
  against 2 groups and 1024 px; the zombies walk, so their places differ). The archer stands in a T-pose in both: that
  is how the old build shows it too, not a change here.

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

### Frame time (WebGPU, probe from the perf-baseline session)

Canvas 960×720 at pixel ratio 0.9375, resolution governor pinned, the probe drawing 90 timed frames per view from a
camera at eye height (player hidden). GPU = WebGPU timestamp queries summed over the frame's passes.

**Back to back on the same server (this branch), `?hiPoly=1` then the default, two minutes apart:**

| view | draw calls | triangles | GPU per frame | CPU submit | game loop |
|---|---:|---:|---:|---:|---:|
| town.plaza.N | 648 → 638 | 1.51 M → **1.07 M** | 12.8 → **10.7 ms** (−16 %) | 11.8 → 13.9 ms | 20.6 → 15.1 ms |
| town.plaza.S | 673 → 673 | 1.36 M → **0.92 M** | 11.3 → **9.8 ms** (−13 %) | 11.7 → 12.6 ms | 13.9 → 15.0 ms |

**Main (port 5198) against this branch (port 5197), single runs ~15 minutes apart:**

| view | draw calls | triangles | GPU per frame | CPU submit |
|---|---:|---:|---:|---:|
| town.plaza.N | 645 → 628 | 1.48 M → **1.05 M** | 9.0 → 10.9 ms | 15.6 → 16.8 ms |
| town.plaza.S | 667 → 670 | 1.35 M → **0.90 M** | 8.4 → 10.3 ms | 15.3 → 18.3 ms |
| town.hill.S | 1,281 → **1,201** | 2.42 M → **1.95 M** | 9.2 → 9.3 ms | 20.3 → 22.3 ms |
| east.flats.N | 299 → 298 | 1.98 M → **1.75 M** | 9.2 → **8.8 ms** | 12.3 → 17.9 ms |

How to read these: the triangle cuts are exact and repeatable; the times are not, in this setting. Main and the
branch with `?hiPoly=1` draw practically the same scene, yet their GPU times at the plaza differed by about 40 % (9.0
against 12.8 ms) in runs half an hour apart, in a hidden browser pane on a shared machine. The back-to-back pair is the
fairest comparison: about 13-16 % less GPU time per frame at the plaza. This machine's GPU (Radeon 780M) is
fill-bound on WebGPU (lit pixels cost about twice WebGL's), so triangle cuts show up less in the time than in the
counts; a GPU that is vertex-bound (phones, older laptops) gains more. CPU submit and the game loop moved by amounts
within their own run-to-run spread. Raw: `docs/game3d/low-poly/perf-runs/*frames-*.json` and `*ab-*.json`.

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

## Pictures (same camera spots, before and after)

`docs/game3d/low-poly/pictures/side-by-side/*.jpg` puts each pair next to each other; the single pictures are in
`pictures-hipoly/` (before: `?hiPoly=1`) and `pictures-lowpoly/` (after: the default). Taken on this branch's dev
server, classic renderer (a WebGPU canvas reads back blank), clock fixed at 13:00 and clear weather
(`__worldEnv.setTime(13)`, `setWeather('clear')`), camera 1.7 m above the ground, player hidden.

| picture | what it shows |
|---|---|
| `town.plaza.from-south` | the fountain plaza from the south boardwalk: fountain, lanterns, houses, elms on the hill |
| `town.plaza.to-blacksmith` | from the spawn side toward the blacksmith's house and the Oath Tree spot |
| `town.plaza.to-east` | across the plaza to the east houses |
| `town.hill.S` | the hill above the town, looking south |
| `town.elm-closeup` | one owner elm from 16 m: the low-poly elm against the 88k-triangle one |

The moving mist puffs and birds differ between shots. The first "after" shot on the hill had a grey band on the far
horizon; a second shot at the same spot a few minutes later had none, with the meadow grass shown or hidden, so the
band was a passing streaming or fog moment; the picture used is the second shot.


## Not converted (found while measuring)

- **Zombies in the west: 206 meshes each**, which is most of the west's 3,333 draw calls. Enemy models are not in this
  branch's scope.
- **Characters' textures:** the Erika archer NPCs carry ~290-386 MB of uncompressed textures; the player's own
  character, hair and sword 72 MB.
- **Downloads on every gate hop:** each hop downloads ~81 MB again in the test pane (the CDN sends
  `max-age=31536000, immutable`, so a normal browser cache keeps them; the test pane did not). The largest are
  characters and enemies: the zombie attack FBX 16 MB, `Male_Fused_v2.glb` 11.7 MB, `Artemis_Character_v5.glb`
  11.5 MB, `Getsuga_Tensho_Character_v5.glb` 9.1 MB. This branch cut the four world model files it converted from 20.7 MB to 6.5 MB.
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

- **Whole suite** (`node --test --test-reporter=tap tests/`, 2026-11-23): main `51135c89` 2,389 tests, 107 failing;
  this branch 2,395 tests (the 6 new ones pass), 107 failing. The 107 failing test names are identical: no new
  failures.

## Seen while measuring (not changed here)

- **WebGPU device lost on area remounts, twice, on this machine.** Once `DXGI_ERROR_DEVICE_HUNG` during a gate hop
  while a second game tab was rendering on the same iGPU; once "A valid external Instance reference no longer exists"
  during a hop right after the test pane's viewport emulation changed. After each, the game's fallback to classic WebGL
  also failed in that tab ("World entry interrupted / WebGL could not start"), and the tab remembered the WebGPU failure
  (sessionStorage `fallen_sky_renderer_failed_v1:fallen-sky`). Runs with one game tab and a fixed viewport went through
  every hop. The WebGPU session is working on `src/lib/webgpuSceneRenderer.js`; this branch does not touch it.
- **"World entry interrupted" after gate hops that take over 30 s**: GameView's watchdog fires while the world is
  still loading (seen on main and on this branch in the hidden test pane).
- **Entering the world**: a click on ENTER WORLD while the character screen still says "ENTERING…" is ignored; the
  player stays on the character screen and gate events do nothing.

