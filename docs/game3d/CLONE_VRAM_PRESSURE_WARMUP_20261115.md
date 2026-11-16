# Game 3D Clone — GPU selection and background VRAM pressure (2026-11-15)

**Scope:** Clone repository `marcusflow1-arch/gitsync-pro` only, isolated feature branch.
**Goal:** Reduce speculative GPU work when gameplay is already struggling, and request the high-performance adapter where the browser/driver allows it.

## Source changes

- `GameWorld3D.jsx`: create the main WebGL context with `powerPreference: 'high-performance'`. This is a **browser hint**, not a promise to select the discrete GPU and not an allocation of dedicated VRAM.
- `performance/SceneWarmup.mjs`: pause only **background** shader/texture warmup while a recent, sufficiently sampled Game 3D governor window has p95 >=32 ms or p99 >=140 ms. After pressure clears, or if the measurement becomes stale/unavailable, the queue resumes.
- Skip *speculative* uploads of oversized, uncompressed textures when their dimensions are known: Performance up to 1024², Balanced up to 2048², Auto up to 4096². Quality and Off retain uncapped warmup behavior. Compressed and unknown-size textures retain the previous behavior.
- The actual visible material/texture is **not downscaled, disposed, or blocked**. Three.js uploads any texture normally when rendering requires it. These limits only prevent eager background preparation from competing with gameplay.
- Existing adaptive DPR, owner graphics settings, scene priority, combat state, enemy positions, four-region streamer, asset service worker, GPU/FPS panel and world teardown remain unchanged.

## Limitations

WebGL does **not** expose actual dedicated VRAM size or utilization. `renderer.info.memory.textures` is a resource *count*, not VRAM megabytes. The memory limit in this change is intentionally an eager-upload pixel threshold, not a claim of hard memory enforcement. `high-performance` does not override Windows GPU preferences or browser sandboxing.

This branch does **not** solve synchronous FBX decoding, first-time visible texture uploads, AI/physics bottlenecks, shader compile costs in the main render pass, or the sustained load of many on-screen enemies. It is not proof that Kali/Demon stalls are fixed.

## Verification

```bash
node --test tests/game3d-scene-warmup.test.mjs tests/game3d-clone-adaptive-graphics.test.mjs tests/game3d-clone-gpu-vram-warmup.test.mjs
npm run build
```

Then in authenticated Clone Play, compare Auto/Off and Performance/Quality with the same graphics hardware and world region. Measure FPS/p95/p99, long tasks, first enemy attack, 5/15/30 enemy encounters, large-texture scenery traversal, portal round trip, shader warmup progress, and a 10-minute soak for GPU context loss. Test desktop integrated/discrete GPU and a lower-end mobile browser. Confirm asset quality and world collision remain unchanged.

**Release status:** proposed source-level optimization only; signed-in GPU/WebGL benchmarks and native build are not yet verified. Keep the PR draft until review and gameplay QA.
