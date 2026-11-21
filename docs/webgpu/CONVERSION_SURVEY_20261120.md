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
