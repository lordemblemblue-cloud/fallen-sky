# Game 3D draw-cost baseline (WebGPU and classic WebGL): INTERIM

Status 2026-11-21: **the measuring tool is built and works; the full baseline is NOT recorded yet.** The session hit
the shared usage limit while debugging the WebGPU run. Everything below is labelled measured, counted or estimated.

## The tool

- `src/components/game3d/performance/Game3DPerfViewpoints.mjs`: the 14 fixed points (38 views: each area's first point
  in four compass directions, other points as briefed). Local metres, world z = local z + 70, eye 1.7 m above ground.
- `src/components/game3d/performance/Game3DPerfProbe.mjs`: dev-only probe on `window.__gw3dPerfProbe`. Loaded by
  `Game3DPerformanceBootstrap.jsx` only when `import.meta.env.DEV` and `?perfProbe=1` (a production build drops it);
  `GameWorld3D.jsx` is not touched. Per view it reaches the area through the game's own `game3dPortalTravel` event
  (a remount, as a gate does) or moves the player inside the area, waits until counts stop changing, pauses the game's
  drawing (not its simulation), hides the player, switches the resolution governor to profile `off` (restored after),
  and draws N frames back to back from a camera copy. Frame time = draw start to GPU finished (WebGPU
  `onSubmittedWorkDone`, WebGL one-pixel read), so it does not depend on rAF throttling. GPU time = timestamp queries
  injected into every WebGPU render pass, or `EXT_disjoint_timer_query_webgl2` on classic WebGL. Also records backend,
  adapter, canvas size, pixel ratio, graphics settings, ink level, pipeline/program counts, a counted inventory by group,
  and `toggleSweep()` switches groups off one at a time (far meadow, far grass, near grass, trees, rocks/plants, water,
  roads, terrain, town, characters, shadows, shadow refresh, ink post) and restores them.
- `scripts/game3d-perf-receiver.mjs`: local receiver (127.0.0.1:5395) writing one JSON per run to `perf-runs/`.
- `scripts/game3d-perf-compare.mjs`: one run -> every view, worst per area against `Game3DAreaBudget.mjs`, toggle
  tables; two runs -> before/after by view id (`--md` for Markdown).

Rerun (three commands, then one console line in the game tab):

```
npx vite dev --port 5194 --host 127.0.0.1 --strictPort
node scripts/game3d-perf-receiver.mjs --port 5395
node scripts/game3d-perf-compare.mjs docs/game3d/three-empires/research/perf-runs/<before>.json <after>.json
```

Open `http://127.0.0.1:5194/gameview?renderer=webgpu&perfProbe=1&perfPump=1&perfPost=http://127.0.0.1:5395/`, enter
the world, then in the console: `__gw3dPerfProbe.run({label:'before', toggles:true})`. Afterwards open once with
`?renderer=auto` (the renderer choice is remembered in localStorage).

## Findings so far

1. **The live world does not run WebGPU by default.** `render/liveRendererRecovery.mjs` (commit e59ddcab, after the
   all-black-world report) forces classic WebGL for Game 3D unless the URL itself says `?renderer=webgpu`/`webgl2`.
   Seen live: `__gw3dRendererChoice = {kind:'webgl', reason:'fallen-sky-black-scene-safety'}`. What players get today
   is classic WebGL; WebGPU numbers describe an opt-in preview.
2. **Open blocker for the WebGPU run (hidden pane).** On `?renderer=webgpu` the game's `animate` loop is called about
   118 times a second through the rAF pump but issues **0 renders** (measured over 2 s), and the area loader stays at
   `batches: {split:0, settling:69}`: the town scene then draws the whole valley's far grass (252 tiles, source copies,
   none split per area). Not yet known whether this is the hidden pane, the pump installed after the loop started, or
   a real WebGPU stall (it may relate to the black-world report). Next step: rerun with the pane visible, and check why
   `animate` skips its render (renderPacer, entry/hold state) before trusting any WebGPU number.
3. Machine (reported by the browser): AMD RDNA 3 adapter (`vendor amd, architecture rdna-3`), Chromium 156.0.8078.100,
   16 cores, 32 GB; `timestamp-query` available on WebGPU; `EXT_disjoint_timer_query_webgl2` available on WebGL.
4. A fresh guest on this origin got graphics quality `low`, shadows off, art style `original` (ink level 0), fps cap
   60; canvas 960x720 at pixel ratio 0.9375 in a 1024x768 pane.

### Single-view measurements (shakedown, not the baseline)

| View | Backend | Calls | Triangles | Frame median / p95 | CPU submit median | GPU median | Note |
|---|---|---:|---:|---:|---:|---:|---|
| town.plaza.N | classic WebGL | 642 (measured) | 1.49 M (measured) | 21.0 / 25.2 ms | 17.7 ms | 10.9 ms | 30 frames, settled |
| town.plaza.N | WebGPU | 970 (measured) | 3.25 M (measured) | 55.1 ms | - | 19.5 ms | loader not split (finding 2): not representative |

Classic WebGL toggle sweep at town.plaza.N (20 frames each, measured; Δ against 645 calls / 1.50 M / 20.4 ms / 10.7 ms GPU):

| Group off | Δ calls | Δ triangles | Δ frame ms | Δ GPU ms |
|---|---:|---:|---:|---:|
| characters (companion 218 meshes, NPC at local (−32, −122) with 393 meshes, archers, birds) | **−434** | −0.22 M | −3.9 | −1.5 |
| town | −76 | −0.03 M | −2.7 | −1.0 |
| water | −38 | 0 | −3.0 | −1.8 |
| roads | −7 | −0.04 M | −1.3 | −0.2 |
| rocks/plants | −25 | −0.19 M | −1.4 | −0.2 |
| trees | −11 | **−0.51 M** | −2.9 | −1.8 |
| far grass | −18 | −0.26 M | −1.4 | −0.6 |
| far meadow | −2 | −0.18 M | −1.4 | −0.5 |
| terrain | −3 | −0.03 M | −3.2 | −2.4 |
| near grass | −16 | −0.03 M | −0.3 | +0.2 |
| shadows / ink post | 0 | 0 | - | - (both already off in these settings) |

Reading (estimated, one view): at the plaza the frame is CPU-bound on classic WebGL (17.7 ms of 21 ms is submitting
draws); characters are two thirds of the draw calls; trees are a third of the triangles. Single 20-frame samples:
treat sub-millisecond deltas as noise.

## Not done

Full 38-view WebGPU run, the classic WebGL comparison at the worst view, the `?wholeWorld=1` plaza run, toggle sweeps
at each area's worst view, worst view per area with headroom, and the per-place rule of thumb.
