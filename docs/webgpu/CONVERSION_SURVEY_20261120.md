# WebGPU conversion: survey before changing code (2026-11-20)

Written before any renderer code changed, from `main` at `18dfa286`. Scope: every three.js renderer and canvas in
the app, what each one uses that `WebGPURenderer` does not run as-is, what the earlier WebGPU work already did, and
how the remaining work is staged. Later stages update the **Status** columns.

## 1. What was already done (and what was not)

All earlier WebGPU work landed on 2026-11-20 as 20+ small PRs by the owner's GitHub account (`#107`-`#146`, branches
`feature/webgpu-*`, `audit/webgpu-*`, `fix/webgpu-*`). It built **infrastructure and inventories only: no live scene
renders with WebGPU** (the handoff file says so too).

| Piece (on `main`) | What it does | Used by a live page? |
|---|---|---|
| `src/lib/gameWebGPURenderer.js` (#107) | async `WebGPURenderer` factory with a classic `WebGLRenderer` fallback (new canvas after a failed init) | no |
| `src/lib/rendererSelection.mjs` (#108, #138) | `selectRendererBackend({webgpuAvailable, sceneWebGPUReady, requested})`, fails closed | no |
| `src/lib/webgpuSceneReadiness.mjs` (#125) | per-scene readiness inventory: `fallen-sky` and `duelist-adventure` both `ready:false` | no |
| `src/lib/webgpuSceneDecision.mjs` (#146) | inventory-gated decision helper | no |
| `src/lib/sceneRendererPreflight.mjs`, `webgpuAdapterProbe.mjs` (#109, #115) | adapter probe before choosing WebGPU | no |
| `src/lib/webgpuDeviceLoss.mjs` (#113) | `observeGPUDeviceLoss(device, onLost)` | no |
| `src/lib/rendererInitGuard.mjs` (#114, #121) | async init guard against unmount races, safe dispose | no |
| `src/lib/rendererCanvasMount.mjs` (#119) | swaps in the fallback renderer's canvas | no |
| `src/lib/frameMetrics.mjs` (#110) | frame-time summaries (p95/p99, 1% low) | no |
| `scripts/webgpu-shader-audit.mjs`, `run-webgpu-shader-audit.mjs` (#111) | static scan of `game3d` + `duelist` for ShaderMaterial / onBeforeCompile / EffectComposer / GLSL | CLI only |
| `scripts/gameworld-webgpu-context-audit.mjs` (#131) | line inventory of GameWorld3D's WebGL context use | CLI only |
| `scripts/webgpu-ink-pass-audit.mjs` (#133) | blockers in the ink-wash pass | CLI only |
| `scripts/duelist-warp-readiness.mjs` (#123), `warpField.mjs` (#117) | Duelist warp blockers; the warp ring/lens state split out of the GLSL pass (renderer-neutral, used by `warp.mjs`) | `warpField.mjs` yes |
| `docs/webgpu/AGENT_HANDOFF.md` | multi-agent ownership notes | doc |

Unmerged: `feature/webgpu-phase2-compatibility` (2 commits, older copies of files already on `main`: superseded) and
`test/webgpu-render-size-guard-20261120` (adds `src/lib/webgpuRendererSizing.mjs` + test, opened 18:07 today: left
alone, nothing here depends on it).

Decisions recorded by that work, kept here: WebGL stays the default until a scene's shaders and effects have parity
and browser QA; unknown scenes fail closed; a failed WebGPU init must not reuse its canvas; use the `three` version in
the lockfile (**0.171.0**) and verify TSL / post-processing APIs against it, not newer docs.

## 2. Every renderer and three.js canvas

No page uses React Three Fiber's `<Canvas>`; every canvas is a hand-made `THREE.WebGLRenderer`. Reachability below is
from an esbuild import graph of each route (dynamic imports included).

| Page / route | Renderer (file) | Notes |
|---|---|---|
| Game 3D world, `/gameview` | `GameWorld3D.jsx:529` (+ `performance/Game3DGpuEfficiency.mjs` makes the WebGL context) | the main game; 924 modules reachable, 51 with shader / renderer constructs |
| Game 3D ink look | `render/inkWashLook.js` (uses the world renderer) | full-screen post pass, on by default (ink "high") |
| Game 3D scout view | `hud/HorizonVisionPanel.jsx` (world renderer) | renders the scene into a 256-px `WebGLRenderTarget`, `readRenderTargetPixels` (sync) |
| Character creator (in `/gameview`) | `onboarding/creatorStageScene.js:85` | PMREM + `RoomEnvironment`, ACES |
| Character viewer / avatar preview | `onboarding/avatarPreviewScene.js:24` | |
| Meshy face draft preview | `onboarding/MeshyFaceDraftPreview.jsx:17` | |
| Companion preview | `game3d/equipment/CompanionPreview3D.jsx:33` | |
| Mini games | `game3d/minigames/MiniGameArenaPreview.jsx:30` | the only three.js canvas of the mini games (`MiniGamesHub.jsx` is DOM) |
| Duelist match / story, `/duelist-next/play` | `duelist/client/DuelistGame.jsx:105` | + `warp.mjs` EffectComposer |
| Duelist menus, `/duelist`, `/duelist-next/*` | `duelist/menu/DuelistHangarStage.jsx:18` | FogExp2 |
| Duelist motion lab, `/duelist-lab` | `duelist/client/MotionLab.jsx:34` | contact sheets via `toDataURL` |
| Old Duelist, `/duelist-classic` | Game 2 engine `game2/engine/gl.js` (**raw WebGL2, not three.js**) + `Game2SelectedCharacterRenderer.js`, `bossWay/dragonRenderer.js`, `Game2CharacterPortrait.jsx` (three.js) | see section 6 |
| Games hub, `/` | none | DOM only |

## 3. Game 3D world: what `WebGPURenderer` does not run as-is

`WebGPURenderer` (three 0.171) renders node materials. Classic built-in materials are converted automatically
(`NodeLibrary.fromMaterial` copies their properties), but: **`onBeforeCompile` is ignored** (the patch silently
disappears), **`ShaderMaterial` / `RawShaderMaterial` are not supported** (error, then a blank NodeMaterial),
`EffectComposer` / `ShaderPass` are WebGL-only, and the WebGL-specific renderer calls listed in 3.4 do not exist.

### 3.1 `onBeforeCompile` patches (reachable from `/gameview`)
"Live" = seen in the town scene's material inventory on `main` (objects / visible).

| File | Patches | Live in town |
|---|---|---|
| `wolfveil/WolfveilLivingSumiEMaterials.mjs` | **decorator**: wraps the hook of every opaque standard/physical/lambert/phong world material with sumi-e pigment (world position, rim contour, wind drift; 7 families) | yes, on most world materials |
| `wolfveil/WolfveilTerrainSplat.js` | 4-layer splat terrain: height blend, triplanar rock, macro normal/cavity/AO maps, roughness + normal override | 274 objects |
| `wolfveil/WolfveilLivingMeadow.js` | instanced wind + footstep grass | 38 |
| `wolfveil/WolfveilPlantCards.js` | baked plant cards, wind | 53 (16) |
| `wolfveil/WolfveilIndividualGrassBlades.js` | curved blade clusters, wind + footstep parting | 190 (off-screen) |
| `wolfveil/WolfveilGroundCover.js` | close grass + path-edge stones | yes |
| `wolfveil/WolfveilOwnerLandscapeModels.js` | owner GLB plants/trees: wind sway | yes |
| `wolfveil/WolfveilNature.js` | forest / courtyard trees (+ ShaderMaterial waterfalls) | area-dependent |
| `wolfveil/WolfveilGrassTileReplacement.js` | owner 2x2 m grass tile instances | area-dependent |
| `wolfveil/WolfveilWestHillsideGround.js` | west hillside dirt/stone layer | west |
| `wolfveil/WolfveilSpawnGroundDetail.js` | moss/soil ground detail | town |
| `wolfveil/WolfveilGuardVisuals.mjs` | owner guard models | town |
| `wolfveil/ambient/WolfveilAmbientBirds.mjs` | instanced distant birds: wing flap in the vertex shader | yes |
| `wolfveil/square-passes/WolfveilSquareX40Z123Visual.mjs`, `WolfveilSquareX46Z116Mount.mjs` | 5 m landscaping squares (grass tips, stones) | yes (off-screen) |
| `render/forestBiomeRuntime.js`, `forestBiomeWildlife.js`, `forestOwnerElmAssets.js`, `Game3DForestLongGrass.js` | Verdant Wilds forest: wind, elm foliage (+ ShaderMaterial) | elm foliage in town |
| `weapons/weaponConstructFx.js` | oil-metal weapon pour (+ ShaderMaterial, PMREM) | on weapon summon |
| `enchantVfx/enchantGlowMaterial.js` | enchant surface light on armor/weapons | with enchanted gear |
| `onboarding/bodyRegions.js`, `creatorMakeup.js`, `creatorHairColor.js`, `creatorNeckTone.js`, `customizationRuntime.js` | character skin regions, makeup, hair recolour, neck tone (also on the in-world player) | player (hair, Skin_Head) |

### 3.2 `ShaderMaterial` effects (reachable from `/gameview`)

| File | Effect | Live in town |
|---|---|---|
| `WorldEnvironmentSystem.js` | sky dome (gradient, sun, moon, stars; display-space colours the ink pass relies on), + Points | yes |
| `wolfveil/WolfveilSilverRiverMaterial.js` | river water | yes |
| `axe/world/Game3DWaterContact.js` | contact wakes, bank foam | yes |
| `wolfveil/WolfveilAreaGates.js` | spirit veils at area borders, torii membranes | yes |
| `wolfveil/WolfveilGeometry.js`, `WolfveilNaturalApproach.js` | Wolfveil water / approach details | yes (4 small) |
| `wolfveil/VortexLakeScene.mjs` | vortex lake water | lake |
| `wolfveil/WolfveilCaveSystem.js` | cave surfaces | caves |
| `dungeons/LunarCaveScene.js`, `AstralDungeonScene.js`, `VortexDungeonEcho.mjs` | dungeon effects | dungeons |
| `enchantVfx/weaponEnchantVfx.js` | weapon enchant aura (+ Points) | enchanted weapons |
| `weapons/weaponConstructFx.js` | weapon pour | weapon summon |
| `render/forestBiomeRuntime.js` | forest effect | forest region |
| `render/inkWashLook.js` | the ink pass itself (section 3.3) | yes |

Not reachable from any route (left as they are): `render/BlazeOfGrassWorld.mjs` + `BlazeGrassStream.mjs` +
`atomicUltraSumiMode.mjs` (retired Ultra-Sumi, the only `EffectComposer` in `game3d`), `WolfveilImportedTownWater.mjs`,
`landscaping/WolfveilSouthGateBlueFire.mjs` (tests only). `mapExport/Game3DFullMapExporter.mjs` only reads
`isShaderMaterial` flags.

### 3.3 Post-processing and render targets
- **Ink wash** (`render/inkWashLook.js`): scene into a `WebGLRenderTarget` (HalfFloat if `EXT_color_buffer_float`,
  `DepthTexture` UnsignedInt, 2x MSAA at "ultra"), then one full-screen `ShaderMaterial` triangle: tone mapping done in
  the shader (`toneMapped:true` gives it the renderer's `toneMapping()`), `#include <packing>`
  (`perspectiveDepthToViewZ`), depth-fold ink lines, luminance edges, mist from fog colour, paper grain, vignette.
  Sky pixels (depth >= 0.99999) are taken as display colours. It toggles `renderer.info.autoReset`.
- **Horizon vision**: 256x144 `WebGLRenderTarget` + `readRenderTargetPixels` (sync, bottom-up rows).
- No `EffectComposer` is live in Game 3D.

### 3.4 WebGL-only calls on the world renderer
| Call | Where | WebGPU equivalent |
|---|---|---|
| `new WebGLRenderer({canvas, context: gl})` after `createGame3DWebGLContext` | `GameWorld3D.jsx:529`, `Game3DGpuEfficiency.mjs:56` | `new WebGPURenderer({canvas, antialias, powerPreference})` + `await init()` |
| `renderer.getContext()` + `WEBGL_debug_renderer_info` | `GameWorld3D.jsx:533`, `describeGame3DGpu` | adapter `info` (vendor/architecture) |
| `getContext().isContextLost()` | GameWorld3D 655, HorizonVision, creator, AdaptiveGraphics, SceneWarmup | device-lost flag |
| `webglcontextlost/restored` | `webglContextGuard.jsx` | `renderer.onDeviceLost` |
| `renderer.capabilities.maxTextureSize` | GameWorld3D 560/652, AdaptiveGraphics, PauseMenu, AXETownPlaza | `device.limits.maxTextureDimension2D` |
| `renderer.extensions.has('EXT_color_buffer_float')` | inkWashLook | always renderable in WebGPU |
| `renderer.compile(obj, cam, scene)` | GameWorld3D 2108 (weapon warm-up) | `compileAsync` |
| `renderer.initTexture` | `performance/SceneWarmup.mjs` | `initTexture` exists (sync, after init) |
| `renderer.shadowMap.autoUpdate=false` + `needsUpdate=true` | GameWorld3D (static sun shadow refresh) | per light: `light.shadow.autoUpdate/needsUpdate` |
| `renderer.info.render.calls` = draw calls | `debug/renderStats.js`, inkWashLook | `info.render.drawCalls` (`calls` counts render() calls) |
| `readRenderTargetPixels` | HorizonVisionPanel | `readRenderTargetPixelsAsync` |
| `PMREMGenerator(renderer)` + `RoomEnvironment` | weaponConstructFx, creator | node `PMREMGenerator` from `three/webgpu` |

### 3.5 Objects that render differently
- **Sized points**: `PointsMaterial` with `size` > 1 draws **1-pixel points** under `WebGPURenderer` (WebGPU has no
  point size; r171's WebGL2 backend also writes `gl_PointSize = 1.0`). Used by: `death/playerDeathAsh.js`,
  `weather/hailLayer.js`, `WorldEnvironmentSystem.js` (stars/precipitation), `vfx/playerMomentEffects.jsx`,
  `axe/progression/AXEMountFusionVisualRuntime.js`, `dungeons/AstralDungeonScene.js`, `weapons/weaponConstructFx.js`,
  `enchantVfx/weaponEnchantVfx.js`. Need instanced quads.
- Sprites, lines (1 px), InstancedMesh, BatchedMesh, skinned + morph meshes, CanvasTexture, Fog: supported.

## 4. Duelist Adventure (`src/components/duelist`)

| File | Construct | Note |
|---|---|---|
| `client/DuelistGame.jsx` | `WebGLRenderer`, PCFSoft shadows, ACES; `toDataURL` film strip (dev) | renderer to convert |
| `client/warp.mjs` | `EffectComposer` + `RenderPass` + `ShaderPass` (GLSL, uniform arrays of 8 vec4) + `OutputPass` | telekinesis bend; state already split into `warpField.mjs` |
| `client/arena.mjs` | ShaderMaterial (floor / ring / sky) | |
| `client/crystalWeapon.mjs` | ShaderMaterial (inner glow, follows Will) | |
| `client/depot.mjs` | 2 ShaderMaterials (deck light lines, door glow) | story missions |
| `client/vfx.mjs` | 4 ShaderMaterials + Points (push cone, grip, sparks) | |
| `client/trails.mjs` | ShaderMaterial ribbon | |
| `client/matchProps.mjs` | ShaderMaterial (bases), sprites | |
| `menu/DuelistHangarStage.jsx`, `client/MotionLab.jsx` | plain materials | renderer only |

## 5. r171 facts that shape the plan (read from the installed source, measured on this PC)

- `three/webgpu` and `three` share `three.core.js` in 0.171, so objects made with `three` render with
  `WebGPURenderer` (no duplicate class copies).
- `WebGPURenderer` falls back to its own **WebGL2 backend** when `navigator.gpu` is missing (`forceWebGL` forces it).
  Both backends need node materials; neither runs GLSL `ShaderMaterial` or `onBeforeCompile`.
- `render()` before `init()` resolves only warns and renders asynchronously: the world must wait for `init()`.
- Rendering to the canvas with tone mapping or sRGB output goes through an internal HalfFloat target plus an output
  pass. With `PostProcessing` the final quad writes the canvas directly.
- Shadow maps refresh per light (`light.shadow.autoUpdate / needsUpdate`); `BasicShadowMap` is supported.
- Converted classic materials get a pipeline cache key from `customProgramCacheKey()` plus property values, **not
  node identity**: nodes attached to classic materials must be shared per shader variant or carry their own key.
- Micro-benchmark on this PC (AMD Radeon 780M, Chrome 156 in the Claude pane, 1,305 draws, 300 materials):
  render() CPU **WebGL 3.0 ms, WebGPU 3.6 ms, WebGPURenderer's WebGL2 backend 4.5 ms; WebGPU with a `BundleGroup`
  (render bundle) 0.9 ms**. So a plain switch costs ~20% more CPU per draw in r171; the speed-up has to come from
  WebGPU-only features (render bundles for static scenery) and from the cheaper GPU passes.

## 6. Old `/duelist-classic` (Game 2 engine)
Its world is drawn by a hand-written **raw WebGL2** engine (`game2/engine/gl.js`, `getContext('webgl2')`), not three.js;
only side views (character portrait, selected character, boss dragon) use three.js. Converting it would mean rewriting
the engine, it is the page the Duelist rebuild replaces (`/duelist` already shows the new hub), and the Game 2 rules in
atom-x-eve-os keep that engine's behaviour as its foundation. **Not converted here**; listed for completeness.

## 7. Baseline on `main` (before)
Method: built-in browser pane (hidden, driven by a MessageChannel frame pump), viewport 1280x720 CSS, Game 3D at
1920x1080 (display 1080p), quality high, ink high, shadows on, GPU profile off (no adaptive changes), fixed midday,
clear weather, fixed cameras, 40 warm-up + 150-200 measured frames, **one frame in flight** (frame time is close to
CPU + GPU). GPU time from `EXT_disjoint_timer_query_webgl2`. Draw calls from `renderer.info` (both ink passes).

| Place | Frame ms (mean / p95) | CPU ms | of which render() | GPU ms | Draws | Triangles |
|---|---|---|---|---|---|---|
| Wolfveil town (market, fountain) | 28.7 / 29.9 | 19.0 | 17.4 | 18.6 | 1,571 | 1.79 M |
| South fields (open wilderness) | 16.9 / 18.2 | 5.1 | 3.7 | 10.1 | 158 | 0.86 M |
| Western cedar wilds (forest) | 20.9 / 26.0 | 5.7 | 4.2 | 13.3 | 207 | 1.42 M |
| Wolfveil caves (gate chamber) | 20.1 / 21.1 | 12.1 | 2.6 | 7.0 | 102 | 0.13 M |
| Duelist "Contraband" story mission (room, 1280x676) | 5.6 / 6.8 | 1.7 | 1.3 | 2.8 | 143 | 0.18 M |

Run-to-run noise is real (a first town run, at dusk, gave CPU 25.2 / render 23.3 ms): compare medians of repeated
runs. The town is CPU-bound by draw calls; the caves spend ~9 ms of CPU outside rendering (game logic).

## 8. Plan: stages (each its own branch from current `main`, stacked in order)

1. **Renderer core** (`claude/webgpu-1-renderer-core-20261120`): one scene-renderer factory on top of the existing
   `src/lib` helpers (backend choice from the readiness inventory + `?renderer=webgpu|webgl2|webgl` override,
   `WebGPURenderer` with its WebGL2 fallback, async init, device loss), a compatibility layer for the WebGL-only calls
   in 3.4, and GameWorld3D wired to it. Classic WebGL stays the default.
2. **Game 3D materials and shaders**: TSL versions of every live `onBeforeCompile` patch (nodes attached to the same
   classic material, so both renderers keep working) and every `ShaderMaterial` (a NodeMaterial twin that the WebGPU
   renderer draws in its place, reading the same uniforms); sized points as instanced quads.
3. **Post-processing**: the ink wash as a TSL `PostProcessing` pass (scene colour + depth from `pass()`), Duelist warp
   likewise; horizon vision read-back made async.
4. **Other pages**: creator, viewers, companion and mini-game previews, Duelist game / hangar / lab; then flip the
   readiness inventory so `WebGPURenderer` is the default where it measured as good or better, with WebGL2 fallback.
   WebGPU-only speed-ups (render bundles for static scenery) are measured here.

Classic `WebGLRenderer` + GLSL stay selectable with `?renderer=webgl` until the owner removes them.

## 9. Stage status

### Stage 1, renderer core (`claude/webgpu-1-renderer-core-20261120`)
- `?renderer=webgpu` (or `webgl2` for WebGPURenderer's WebGL2 backend) runs Game 3D on WebGPURenderer; the default
  stays the classic renderer (`webgpuSceneReadiness.mjs`: `ready:false, preview:true`). `?renderer=auto` forgets the choice.
- What draws on WebGPU after stage 1: every built-in material (buildings, characters, props, terrain geometry). Not
  yet: `ShaderMaterial` effects (skipped, one console note each), `onBeforeCompile` patches (ignored: e.g. the splat
  terrain shows its palette tint only, no sumi-e pigment), the ink look (level 0), the horizon scout picture, sized points.
- Fixed in three r171 at runtime (`webgpuThreeFixes.js`): morph targets were read for every shape key at weight 0;
  25 fused-character meshes cost ~30 ms of GPU in the town (40.3 ms scene pass -> 10.8 ms without them; with the fix
  the whole frame's GPU time fell from 54-71 ms to 13-22 ms).
- First comparison, town view, one game tab, two frames in flight (not final: stages 2-3 change both sides):
  classic WebGL frame 24.2 ms, CPU 21.6 (render 19.8), GPU 15.8 (ink on); WebGPU frame 34.7, CPU 21.7 (render 19.9),
  GPU 18.7 (ink off, 4x MSAA frame target). The ~10 ms gap beyond CPU and GPU time is spent outside the page's own
  JavaScript (WebGPU command submission in Chrome's GPU process: ~1,550 draws, 2,500 bind groups, 2,800 vertex
  buffers, 630 uniform writes a frame). Plain WebGPURenderer is not cheaper per draw than WebGLRenderer in r171, nor in
  three 0.187 (micro-benchmark: 1,305 draws, render() 3.5 / 4.5 ms vs WebGL 1.7 ms); WebGPU render bundles are
  (0.6-0.9 ms). In the town ~700 of ~1,240 drawn items are characters (one character group alone issues 393 draws).
- Tests: `node --test tests/` main 1462 / 100 failing, stage 1 1471 / 100 failing, the same 100.

### Stage 2, Game 3D materials and shaders (`claude/webgpu-2-game3d-materials-20261120`, merged as #170)
- Every live `onBeforeCompile` patch has TSL nodes on the same material (`webgpuNodeKit.js` attachNodes, node setups,
  addMapStageColor for patches after the base texture) and every live `ShaderMaterial` a node twin
  (`webgpuMaterialTwins.js`): sky, splat terrain, living sumi-e pigment, rivers / canals / cistern / lakes, wakes,
  veils, gates, waterfalls, canopy / meadow / blade / tile / card / square grass wind, owner trees and elms, birds,
  guards, character hair / makeup / neck tone / body regions, weapon construct + droplets, enchant surface light,
  weapon aura + sparks, west hillside, caves, lunar / vortex / astral dungeons, the forest fallback environment.
  Not ported because the game never loads them: `WolfveilSouthGateBlueFire` (unmounted), `BlazeOfGrassWorld` /
  `BlazeGrassStream` (`atomicUltraSumiMode` is not imported).
- Look fixes that make WebGPU match WebGL (`webgpuClassicOutput.js`, `webgpuSceneRenderer.js`): r171 tone-mapped and
  sRGB-encoded every pixel in a final pass and fogged in linear space (pale sky, white fog band); each material now
  finishes the classic way (raw-colour shaders like the sky stay raw, fog in output space). Shadow maps now draw
  single-sided materials' back faces and colour-map alpha cut-outs as `WebGLShadowMap` does (r171 drew front faces:
  shadow acne over every lit surface), and the shared shadow material is keyed by the vertex nodes it carries.
- Known r171 behaviours worked around: a material reference stored on the material it references makes the node
  graph contain itself (hashing recursed forever; use the kit's `materialValue` or an object reference); one failing
  draw no longer aborts the frame; the Game 3D render guard no longer stops for good on a WebGPU exception.

### Stage 3, post-processing (`claude/webgpu-3-postprocessing-20261120`)
- The ink wash (the default look) runs on WebGPU: same colour + depth target and full-screen triangle, a TSL twin with
  the same maths (`inkWashNodes.mjs`). Render-target lookups use three's node uv convention (v down). Ultra draws like
  high on WebGPU (no multisampled depth texture to read there).
- Horizon scout: async readback (320 px wide for r171's 256-byte rows, squeezed back), row order per backend.
- Duelist warp: node `PostProcessing` + scene pass with the same bent-space maths (`warpNodes.mjs`).

### Stage 4, other pages (`claude/webgpu-4-other-pages-20261120`)
- `createSceneRenderer(sceneId, options)` gives every page the same choice as the world (classic by default,
  `?renderer=webgpu|webgl2|webgl`): creator (node PMREM), avatar / Meshy / companion / mini-game previews, Duelist
  match + story, hangar menus, motion lab. All Duelist `ShaderMaterial`s have twins (`duelistNodes.mjs`).
- r171 fixes: TSL `atan(y, x)` emits invalid WGSL (use `atan2`); `ShadowMaterial` multiplied by the missing shadow of a
  light that casts none; WGSL compile errors are reported with the line.
- Node graph ids now key WebGPURenderer's own render objects instead of the classic `customProgramCacheKey` (stage 2
  had made WebGLRenderer compile one identical program per patched material; two tests caught it). Also on its own
  branch from `main`: `claude/webgpu-fix-classic-program-key-20261121`.
- Checked live on WebGPU: Game 3D town (ink high), west wilds, caves, Duelist practice match, Duelist hangar.
  Not checked live: creator stage, Meshy / companion / mini-game previews, motion lab, dungeons, forest fallback.
- Tests: `node --test tests/`: stage 4 1471 tests / 100 failing, the same 100 as `main` 18dfa286; on current `main`
  3e9f2f1f (1519 tests) the fix branch removes the 2 failures stage 2 had added.

### After (2026-11-21): the same build, classic vs WebGPU
Same method as section 7 but two frames in flight, one game tab, 200 frames after 40 warm-up, ink high, midday,
stage 4 build served once and switched with `?renderer=`. Single runs on a busy machine: read differences under
~10% as noise.

| Place | Classic frame ms (p95) | WebGPU frame ms (p95) | Classic CPU / render / GPU | WebGPU CPU / render / GPU | Draws (C / W) |
|---|---|---|---|---|---|
| Wolfveil town | 31.7 (41.2) | 35.0 (51.2) | 28.4 / 26.3 / 15.7 | 25.2 / 23.4 / 21.1 | 1,471 / 1,483 |
| South fields | 10.5 (18.0) | 14.3 (24.3) | 7.2 / 5.3 / 5.2 | 9.3 / 7.7 / 7.0 | 138 / 146 |
| Western cedar wilds | 15.9 (23.4) | 27.1 (44.0) | 11.2 / 7.9 / 8.2 | 17.9 / 15.2 / 17.0 | 188 / 189 |
| Wolfveil caves | 22.3 (26.7) | 21.2 (30.7) | 19.5 / 3.7 / 5.3 | 17.0 / 4.7 / 8.1 | 86 / 82 |
| Duelist practice match | 7.6 (13.3) | 5.2 (10.1) | 1.2 / 0.8 / 1.3 | 2.0 / 3.3 / 1.0 | 52 / 53 |

Decision: **classic stays the default for Game 3D** (WebGPU is slower in three of four places, most in the western
wilds, where its GPU time doubles). The Duelist practice match measured faster on WebGPU in this one run; flipping
`duelist-adventure` to `ready: true` in `webgpuSceneReadiness.mjs` is a one-line owner decision after repeated runs
(story mission and menus included). Next speed-ups worth measuring: WebGPU render bundles for static scenery
(`BundleGroup`, 3-5x cheaper per draw in the micro-benchmark) and the western wilds' GPU time.

### Stage 5, where the time goes + fixes (`claude/webgpu-5-performance-20261121`, stage 4 with `main` f4a9ee58)
- Profiled per pass (WebGPU timestamp queries) and per r171 render step. Town: the scene pass is 19.0 ms of GPU, the
  ink pass 1.5 ms, and no shadow map is redrawn per frame; the extra GPU time is spread thinly over all object groups
  (instanced plants and grass the only clearly heavier one). Western wilds: render CPU 10.2 ms vs 6.9 ms classic,
  mostly r171's per-object uniform / binding refresh (~3 ms); the splat terrain is ~3 ms of GPU.
- Fixes: the living meadow and ground-cover grass bend away from footsteps on WebGPU again (r171 silently drops a TSL
  `Loop` built outside a `Fn`); lit materials on geometry without a normal attribute get the zero normal WebGL reads
  (r171 substituted an up normal, so the Wolfveil long-grass tiles came out pale instead of dark strokes); flat-shaded
  materials that show back faces are lit like WebGL's (r171 multiplied their screen-derivative normal, which already
  faces the camera, by the face direction: back faces were lit as if facing away, so the forest long grass came out
  blue-black and the western pines paler); splat terrain lookups use implicit derivatives where
  r171 turns WGSL's derivative-uniformity check off (Chrome / Edge; explicit gradients stay for Firefox): ~3.2 ->
  ~2.6 ms in the western view, close to noise.
- Render bundles (`BundleGroup`) not built: in r171 a bundle holds opaque objects only, keeps the set culled when it
  was recorded, and still refreshes every object's nodes and bindings each frame, the cost measured above.
- Repeated A/B, same method as "After" (town and west measured before this stage's fixes):

| Place | Classic frame ms (p95) | WebGPU frame ms (p95) | Classic CPU / GPU | WebGPU CPU / GPU | Draws (C / W) |
|---|---|---|---|---|---|
| Wolfveil town | 32.4 (43.8) | 32.0 (48.4) | 28.7 / 16.0 | 21.4 / 18.1 | 1,476 / 1,479 |
| Western cedar wilds | 13.3 (20.0) | 18.1 (28.2) | 9.1 / 7.1 | 11.8 / 9.7 | 186 / 194 |
| Duelist practice match | 2.8 (5.4) | 4.6 (8.5) | 1.2 / 1.3 | 2.3 / 1.1 | 77 / 76 |

- Decision update: the town is now even, the western wilds still slower on WebGPU, and the Duelist practice match,
  faster on WebGPU in the first run (5.2 vs 7.6 ms), was slower in this one. **Classic stays the default everywhere**;
  WebGPU stays opt-in with `?renderer=webgpu` (`?renderer=auto` forgets it). No readiness flag was changed.
- Checked live on WebGPU, each against classic: creator stage, lunar cave (portal swirl), astral dungeon, Duelist
  motion lab, companion preview (the shadow wolf mount), vortex lake (north area), the forest region, Wolfveil town
  and western wilds (ink off). The Meshy face-draft and mini-game arena previews were mounted directly on the dev
  server (the real flows need the backend: a Meshy draft, a signed-in user) and render on WebGPU; the forest region
  has no button in the game today and was opened through the login screen's own play handler.
- The western pines' lighter tone (listed as unexplained in an earlier note) was the flat-shading bug above: fixed.
- Once, the first WebGPU trip from the town to the north area froze the page for over 10 minutes (the tab had to be
  closed); no GPU driver reset was logged, and seven later WebGPU trips between the town and the north (one of them
  the same sequence) took 24-40 s. Cause unknown; a first-visit shader compile is the main suspect: a warm WebGPU
  area trip builds ~560 node shaders (6.5 s of script) and creates ~250 GPU pipelines synchronously, in main-thread
  tasks of up to 7.5 s (classic also goes up to 16 s without a frame on the same trip). Worth watching before WebGPU
  becomes a default.
- Expected console note on WebGPU world loads: `[webgpu] draw skipped (Mesh): ... setPipeline ...`, once: the game's
  scene warm-up compiles pipelines asynchronously while frames are drawn, and r171 hands a frame a pipeline that is
  still compiling. That draw is skipped for one frame (0 bad pipelines in the 117 frames measured after it).
- Tests: `node --test tests/` 1570 tests / 100 failing (4 new in `webgpuClassicOutput.test.mjs`); `main` f4a9ee58
  has 1566 / 102: the same failures plus the 2 the key fix repairs.
