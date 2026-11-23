# Game 3D character screens: why they lagged, what changed (2026-11-22)

Owner report: creating a character and entering Game 3D was "very, very glitchy and laggy". Path measured:
open `/gameview` → CREATE NEW CHARACTER (or ENTER SERVER → New Character) → choose a faction → creator (drag the
character, sliders, hair) → name → Create character → select → ENTER WORLD.

Branch `claude/character-screen-perf-20261122`, based on main `b31aa141`.

## How it was measured

- Dev server (`vite dev`, React development mode with its double mount) on a fresh port, in the desktop app's own
  browser pane at 1280×720. The pane was hidden, so the page got no animation frames of its own: a 60 Hz
  `MessageChannel` pump stood in for `requestAnimationFrame` and timed every frame callback.
- **CPU per frame** = main-thread time of all frame callbacks in one frame: `animate` is the world (GameWorld3D),
  `tick` is the creator stage. This is what makes the page stutter. GPU time is not included, and frame
  *intervals* show the pump, not a real display.
- A `PerformanceObserver` watched for long tasks (it stopped reporting in later runs, so per-frame CPU and gaps
  between frames are used instead). `getContext` and `GPUAdapter.requestDevice` were wrapped to count WebGL
  contexts and GPU devices. Heap is `performance.memory`.
- WebGPU is the default renderer; WebGL is `?renderer=webgl` (the stored choice was removed afterwards).
- These numbers come from one machine, a dev build and a hidden pane. Compare before against after; the absolute
  numbers are not what players see.

## What was wrong

1. **The world kept redrawing at full rate behind the open creator.** The creator is a full-screen overlay with a
   transparent character stage over the live world. The world's `animate` cost 25–260 ms per frame on WebGL and
   25–120 ms on WebGPU behind it, with spikes of 0.4–2.3 s while it compiled shaders for newly visible objects. The
   creator's own `tick` cost only 0.5–3 ms. Dragging the character, the sliders and hair changes all waited on the
   world.
2. **Every creator stage opened its own renderer.** The creator and the select-screen preview each called
   `createSceneRenderer` on every mount, and React's development double mount doubles that. On WebGPU each one is a
   new GPU device, and `dispose()` never destroyed it: **7 GPU devices were alive after one pass**. That is 4
   creator/select devices, 2 world devices from the dev double mount and 1 from a world rebuild. The heap reached
   about 1 GB. On WebGL each one is a new context, and the world's own
   unmount left its context alive too.
3. **The creator compiled its shaders at its first draw.** On WebGPU (three r171) the first frame of a new stage
   compiled every pipeline synchronously: **a 3.9 s frame** when the creator opened. On WebGL the first select or
   creator frames took up to 2 s.
4. **Not fixed here (see "Left"):** the world's first load, and a **whole-world rebuild** when the new character's
   body differs from the backdrop avatar. The main GameWorld3D effect depends on `avatarConfig.model_url`.

## What changed

| Change | Files |
|---|---|
| Once the creator has been open 1.6 s (the menu camera has eased into its creator framing), the world **holds its last frame**: no update or redraw behind the creator. Start, faction and select still draw at full rate; gameplay is untouched; a resize redraws the held frame (`redrawAfterResize`). | `src/components/game3d/player/game3dEntryBackdropHold.mjs` (new); `GameWorld3D.jsx`: one import, `const entryBackdrop` next to `menuCameraHeld`, one line in the entry branch of `animate` |
| **One shared renderer for all creator stages** (creator and select preview), with its studio environment map kept alongside. A stage opened while it is busy gets a private renderer, as before. The shared renderer is destroyed 4 s after the last stage closes, so entering the world leaves no creator renderer, device or context behind. | `src/components/onboarding/creatorRendererPool.mjs` (new), `creatorStageScene.js` |
| A stage **compiles its shaders before its first draw**: `precompileSceneObjects` on WebGPU (pipelines built off the main thread, and later objects such as a new hair compile in the background), `compileAsync` on WebGL. The stage shows its loading line meanwhile. | `creatorStageScene.js` |
| `destroySceneRenderer()` frees a renderer's GPU device (WebGPU), its WebGL2-backend context, or a classic WebGL context at once, without waiting for garbage collection, and a device destroyed on purpose is not reported as lost. A classic world now frees its context when it unmounts (Retry world, gates, dungeons). | `src/lib/webgpuSceneRenderer.js`; `GameWorld3D.jsx` teardown (one line) |

The creator stage was already on the same renderer path as the world: `createSceneRenderer('fallen-sky')` gives
WebGPU wherever the world uses it, with the same WebGL fallback and the same `?renderer=` override. It now also
uses the world's precompile.

Characters are created, saved and loaded through the same code as before (`CharacterCreationModal`,
`characterStore`): appearance, faction and name are untouched. Remote players' avatars are untouched. The only
visible change: **the world behind the open creator is now a still image.** Its slow camera sway (±0.7°), water
and birds stop under the creator's tint, and resume when the creator closes.

## Numbers: before → after

### WebGPU (default)

| Step | Before | After |
|---|---|---|
| Creator open: CPU per frame (P50 / P95 / max) | 142 / 3 899 / 3 899 ms (only 7 frames in 3 s) | **1.2 / 3.4 / 21 ms** (179 frames) |
| Creator: world `animate` per frame | 75–122 ms | **0.1 ms** (held) |
| Creator: first drawn frame of the character | a 3.9 s frozen frame about 2.3 s after opening | model shown at 3.0 s, no frozen frame (largest gap 1.3 s, while loading) |
| Drag-rotate: CPU per frame P50 / P95 / max | 24.3 / 147.6 / 199 ms (26 of 87 frames over 50 ms) | **1.3 / 6.5 / 23 ms** (none over 50 ms) |
| Body-weight slider, 30 changes: P50 / P95 / max | 17.7 / 95 / 162 ms | **0.8 / 2.3 / 6 ms** |
| Hair change: largest frame / world per frame | 211–444 ms / 32–122 ms | 99–172 ms / 0.1 ms |
| ENTER WORLD → first world frame you control ¹ | 2.6 s (2.1 s of long tasks) | **0.83 s** (largest frame 51 ms) |
| GPU devices created in the flow / alive after entering the world ¹ | 7 / **7**: 2 world (dev double mount), 1 world rebuild, 4 creator/select | 3 / **2**: both the world's (dev double mount); the creator's 1 was destroyed after entering |
| Creator renderers made for select + creator + double mounts | one per mount (4) | **1**, reused 5 times |
| JS heap in the world after the flow ¹ | 986 MB | 612 MB |

¹ Not like for like. In the before run, Create character also changed the backdrop's body (the default avatar →
Eve), so the world was rebuilt just before ENTER WORLD (item 1 under "Left"). In the after run, the new character
had the same body as the active one. The device count still shows what the pool changes: one creator device, not
one per mount, and none left after entering.

### WebGL (`?renderer=webgl`)

| Step | Before | After |
|---|---|---|
| Creator idle: CPU per frame | 2 frames in 3 s, about 2 s each | **P50 0.6 / max 1 ms** (169 frames) |
| Drag-rotate: P50 / P95 / max | 134 / 840 / 2 259 ms | **0.5 / 1.0 / 2 ms** |
| Body-weight slider: P50 / P95 / max | 27 / 219 / 1 702 ms | **0.6 / 1.1 / 2 ms** |
| Faction chosen → creator model ready | 5.1 s | **2.85 s** |
| WebGL contexts while in the creator: created / not yet lost | 6 / 3 (one world context leaked) | 3 / 2 |
| WebGL contexts after entering the world | world + the leaked world context | **world only** (the creator contexts were lost or garbage-collected; the double-mount world context was lost) |

The world backdrop on start, faction and select is unchanged by design. It costs about 18–33 ms CPU per frame
once settled (WebGPU ~29 ms, WebGL ~18 ms).

## Tests

- New: `tests/game3d-character-screen-renderers.test.mjs` (14 tests, all pass). It covers: one renderer across
  stages that follow each other; a private renderer while the shared one is busy; destroy after the idle period,
  and a cancelled destroy when a stage arrives in time; a lost renderer is never handed out again;
  `destroySceneRenderer` for classic, WebGPU and the WebGL2 backend; the backdrop hold rules (start, faction and
  select keep drawing, and the creator holds only after it settles); and source checks that the hold sits only in
  GameWorld3D's entry branch and that stages take their renderer from the pool.
- Whole suite, `node --test --test-reporter=tap tests/`: `origin/main` b31aa141 ran 2410 tests with 108 failing.
  This branch ran 2424 tests with 107 failing. Compared by failing test name, **no new failures**. The one extra
  pass is a Duelist server test that fails now and then ("online story crews claim their own supplies…").

## Checked live, and not

- Checked live, on WebGPU and WebGL, in the hidden pane with the frame pump:
  - start → select → creator (drag, slider, hair) → Create character → select → ENTER WORLD (WebGPU);
  - start → select → creator → close → select → ENTER WORLD (WebGL);
  - renderer, device and context counts at each step.
- Not checked:
  - real display frame pacing and GPU time (hidden pane);
  - a production build;
  - phones;
  - how the held backdrop looks to the eye (no screenshot: the pane was hidden);
  - multiplayer with other players present.
  Remote avatars use none of these files.

## Left (not done here)

1. **Whole-world rebuild when the character's body changes** (WebGPU, before: **6 s + 14 s + 14 s of frozen page
   right after Create character** for a new player). GameWorld3D's main effect (renderer, terrain, village,
   everything) re-runs on `[avatarConfig.model_url]`. A new character whose body differs from the backdrop avatar
   (the default avatar → Eve or Adam, Eve ↔ Adam) therefore tears down the whole world and builds it again, with a
   new GPU device and every shader compiled again. The fix is to swap the player model inside the running world.
   That touches the core of GameWorld3D, which the low-poly session is also editing, so it should be its own task.
2. **The world's first load blocks the main thread** behind the start screen on WebGPU: gaps of 13–23 s while it
   builds the scene and compiles about 400–500 pipelines. The precompile's shader build runs in one synchronous
   block, and the first shadow and ink frames compile synchronously. It could be split into slices (compile a batch
   of objects with the others hidden, then yield), and the shadow pass could be precompiled too.
3. Slider input still costs a few ms per change in React and the customization runtime (frame gaps up to 47–157
   ms on WebGPU). Not measured in detail.
4. A WebGPU world still leaves its GPU device to the garbage collector when it unmounts. Destroying it there would
   need care with the world's in-flight pipeline compiles.

## Follow-up 2026-11-23 (branch `claude/character-entry-freeze-20261123`)

- **The world is no longer rebuilt when the body changes on the character screens.** The world effect now depends
  on a build key (`game3dWorldBuildKey.mjs`), and a new body is swapped into the running world. The new code is
  `setupPlayerAvatar(fbx, swap)`, `releasePlayerAvatar` and `swapPlayerAvatar` in `GameWorld3D.jsx`. A body change
  during play still rebuilds the world, as before.
  - Live on WebGPU, creating Eve while the world showed Adam: no `gw3dSceneTeardown`, and the same renderer and scene.
  - The new body loaded in 0.52 s and was announced ready 5.9 s after Create character. Before, a rebuild froze the
    page for about 6 + 14 + 14 s.
  - One 4.7 s gap is left: the main-thread shader build for the new body's ~70 pipelines.
  - ENTER WORLD took 0.83 s, and the swapped Eve walks: 6.1 m in 1.5 s of W.
  - Not checked live on WebGL, or for a swap while mounted or holding a bow. Those paths go through
    `restoreMountedRider()` and the bow presentation, which rebuilds itself when `model` changes.
- **The world's teardown now destroys its WebGPU device too.** Before, only classic contexts were freed. Live: the
  dev double mount's device was lost with reason "destroyed", and there were no unhandled rejections or device-lost
  logs.
- Tests: `tests/game3d-avatar-swap-no-rebuild.test.mjs` (6 tests). The whole suite on 60b1b8aa ran 2430 tests with 107
  failing, the same failing names as main (108).
- Still open: the 13–23 s first-load block on WebGPU, which is mostly the precompile's synchronous shader build.
  Slicing it is the next step; check with the WebGPU session first, since it owns that code.

## Follow-up 2026-11-23: cold WebGPU load (branch `claude/webgpu-first-load-slices-20261123`)

**Measured** on main 96c0c70a: cold load of `/gameview`, dev build, hidden pane, with the world renderer instrumented.
- The world never held its frames. Its **first frame at renderer ready built 267 shaders in one 22.2 s
  `render()` call**.
- Later first-draw frames took 0.5–2.9 s.
- The avatar-ready precompile added 84 builds, in blocks of 6.5 s and 3.4 s.
- 489 node-shader builds took **36.9 s of main thread** (about 75 ms each; terrain, grass cards and the river cost
  150–256 ms each).

**Changed (`e05c5ec0`):**
- `precompileSceneObjects(…, { sliceMs, onProgress })` builds shaders in slices (`compileSceneInSlices`):
  - For each slice the camera sees only layer 31 (`PRECOMPILE_SLICE_LAYER`, unused by the game), and the batch and
    every light the camera sees are put on it, so the light set in each shader key is unchanged.
  - `compileAsync` then builds only that batch, the camera and every object get their layers back in the same task, and
    an ordinary task yields to the browser.
  - It uses layers rather than `visible`, because scenery `visible` setters run the area loader's callbacks, and keeping
    the same camera keeps the render objects shared with real frames.
  - A sliced run ends with `shadowMap.needsUpdate = true`. Its first slice drew the static sun shadow with only that
    batch's casters, so the next frame redraws it whole.
  - Both changes come from the WebGPU session's review (`032aa812`).
  - The batch size follows the running cost per object (1 to 16 objects), and at most 6 slices compile pipelines in the
    GPU process at once.
  - Frames stay held. Without `sliceMs` nothing changes, and calls on one renderer run one after another.
- GameWorld3D runs a sliced precompile of the constructed scene as soon as the WebGPU renderer is ready, before the
  first frame. The avatar-ready precompile is sliced too.
- Both report `game3dWorldCompileProgress`. GameView's two 30 s entry timers count 30 s without progress rather than
  30 s in total.

**Live:** one cold WebGPU load ran with the early precompile.
- It built 963 renderables (382 pipelines) in 25.8 s, and the world came up on WebGPU.
- The first frames after it peaked at 1.1–1.4 s, instead of 22 s.
- That run yielded with `scheduler.yield()`, which resumes ahead of queued tasks, so the page still showed as one
  25.6 s block. The ordinary-task yield and the in-flight cap that replaced it are **checked by tests only**:
  - After the next runs, the browser pane had **no GPU at all** (no WebGPU adapter, no WebGL2 context, on any
    origin). Chrome does that after GPU process crashes, and it lasts until the app restarts.
  - The run before that block used classic WebGL, which never reaches the sliced code. So it looks like the pane's GPU
    process giving out under many heavy reloads, but I can't rule out the sliced build's burst of about 380
    pipeline compiles in the first run. That is why at most 6 slices now compile at once.
- **Before merging:** reload a cold WebGPU load once the app has restarted, and check that the start screen answers
  clicks while the shaders build and that the world appears without errors.

**Tests:** `tests/webgpu-precompile-slices.test.mjs` (8 tests) uses three's own scene objects. Whole suite: main
96c0c70a ran 2499 tests with 109 failing; this branch ran 2507 tests with the same 109 failing names.

**Not checked live:** a body swap on WebGL, while mounted, or while holding a bow. The pane had no GPU.

### Live checks 2026-11-23, after the app restart (head before this section: `f5b5e851`)

**Cold WebGPU load on this branch** (dev build, hidden pane, 60 Hz frame pump):
- The sliced build ran 1,125 objects for about 43 s between the first and last slice; the early precompile reported 35 s and 106 pipelines.
- **Longest main-thread block during the build: 3.2 s.** 9 blocks were over 1 s and 23 over 0.5 s; the single slowest shader build was 1.8 s. Before: one 22.2 s block, then 6.5 s and 3.4 s.
- **The start screen answered a click** (ENTER SERVER) 1.5 s into the build, in 1.28 s.
- The world appeared and announced ready at 81 s from load, about the same total as before. No errors, no device loss, no failure flag.

**Body swap checks:**
- **WebGL:** swapping Adam to Eve kept the world (no teardown, same renderer and scene). The new body loaded in 0.89 s, the ready event came 2.1 s after Create character, ENTER WORLD took 0.70 s, and Eve walked 5.7 m in 1.5 s.
- **While mounted (bug found and fixed):** swapping while riding left the world's riding state set, and the new character could not walk in any direction, even after mounting and dismounting again.
  - `dismountForSwap` now dismounts the way F does before the new body takes the old one's place.
  - After the fix, swapping while riding on WebGL leaves the companion store not mounted, ENTER WORLD takes 0.72 s, and Adam walks 6.1 m.
- **Holding a bow:** a new character has its own loadout (a sword), so the old character's bow is rightly not carried over. Equipping the Training Bow on the swapped body puts it in that body's left hand. Before the swap, the bow was also put away while riding, as designed.

The test origin's stored renderer choice and failure flag were removed afterwards.
