# Game 3D clone: browser hardware-aware rendering experiment — 2026-11-14

**Scope:** clone repository `marcusflow1-arch/gitsync-pro` only, branch `game3d/clone-adaptive-gpu-20261114`. Main Atom X Eve game is unchanged. Cross-reference issue #39 and main tracking issue #1480.

## Why this is not static recompilation

Game 3D is already JavaScript/Three.js/WebGL, not a console binary that needs decompilation or ahead-of-time recompilation. Browser WebGL already schedules GPU commands. Moving the existing game wholesale into WebAssembly would require rewriting and retesting game subsystems without evidence that that fixes the observed Demon/Kali freezes. First isolate main-thread, shader, mesh, GPU and memory costs.

## Changes in this branch

- New pure `performance/AdaptiveGraphics.mjs` samples requestAnimationFrame deltas in a bounded three-second window; computes FPS, frame p50/p95/p99, max. It is local-only; no GPU ID or memory extraction, server telemetry or API calls.
- New `performance/CloneHardwarePanel.jsx`: player can open a small `GPU / FPS` diagnostics box **inside Game 3D Play** and choose Auto, Performance, Balanced, Quality, or Off (original render pixel ratio). It shows WebGL render call/triangle/texture/geometry counts, actual drawing-buffer ratio and browser maximum texture dimension, and explicitly labels GPU memory as unavailable.
- `Game3DPerformanceBootstrap.jsx` attaches governor alongside the existing scene shader/texture warmup. Both detach when the world renderer is replaced or GameView unmounts. The monitor does not traverse the scene or poll renderer data when closed.
- One-line `GameView.jsx` integration shows the box only in world phase. No protected Wolfveil geometry/terrain, model assets, shader effect, character, combat, server authority, saves or other game files changed.
- The default profile is Auto. It starts at existing pixel ratio capped by the user's existing Graphics quality and device DPR. After **two separate >25ms p95 windows**, it reduces DPR by at most 0.125 once per nine seconds (floor 0.7). Recovery requires three stable windows with p95 <19ms and p99 <24ms, also at most one small change per nine seconds. Hidden tabs, lost WebGL contexts, single stalls and renderer absence are excluded. Manual modes are bounded by device DPR and 1.5. Existing Sumi-e render targets are resized with the renderer.
- GPU adaptation is **not a CPU-freeze fix**. A huge synchronous script, FBX decode, excessive AI/pathfinding, asset upload or GC may still freeze the page. The profile can be set Off immediately for A/B testing.

## Existing merged foundations — do not duplicate

- Clone PR #21: idle shader and texture warmup, public static game asset cache.
- Clone PR #23: shared enemy FBX source and staggered spawns.
- Existing avatar draw call optimization and developer `?renderStats=1` overlay still apply.

## What still needs real validation

Run `node --test tests/game3d-clone-adaptive-graphics.test.mjs` and the complete clone build/lint on an actual checkout. Compare Auto/Off under the **same camera, account, graphics and enemy load** for Kali/Demon quests with 5, 15, 30 enemies, first-hit/multiple attacks, town, bridges, cave, portal, other GUI panels and multiplayer. Capture FPS, frame p50/p95/p99, number/length of >100ms stalls, GPU/CPU render time when supported, renderer calls/triangles and browser heap trends. Repeat cold/warm cache and 10+ minute memory soak. Do not claim 30/60 FPS, no-freeze success, accurate VRAM, native executable performance, or a deployed browser fix without signed-in results.

## Verification evidence at branch creation

- Seven focused source-logic tests executed against the exact committed module in an isolated V8 check: **7 passed / 0 failed** (with URLSearchParams stub matching browser behavior). This is NOT a native Node/npm build, production WebGL render, signed-in Play, or FPS benchmark.
- New JSX wiring and source references were reviewed against clone `main`; new component is mounted by the existing GameView and warmup lifecycle. **Build, GitHub CI, signed-in gameplay, GPU FPS improvement and publishing are not yet verified.**
- Safe fallback: select **Off (original rendering)** in the GPU/FPS box; browser cache and warmup remain unchanged. If the integration itself fails, revert/close this draft without touching the main or other feature branches.

This is a focused **first optimization experiment**, not a claim that every asset or engine path was automatically recompiled.
