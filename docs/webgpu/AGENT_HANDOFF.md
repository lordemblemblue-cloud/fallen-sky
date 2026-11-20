# WebGPU migration — multi-agent handoff

Repository: `lordemblemblue-cloud/fallen-sky`
Workstream: Fallen Sky Game 3D + Duelist Adventure
Current PR: #108 (phase 2); previous scaffold PR #107 merged.
Owner priority: Emblem Blue first, Marcus Flow 1 later.

## Ground rules
- Read root `AGENTS.md` before changes; it contains project-wide rules.
- Never directly change `main`; create topic branches and draft PRs.
- Do not merge or deploy without review and passing checks.
- Coordinate via GitHub PR comments and this handoff file. One agent owns a file at a time; announce ownership in a PR comment to avoid overlapping edits.
- Preserve game mechanics, input, existing UI work, graphics presets and mobile fallback.
- Do not claim an FPS increase without matched WebGL/WebGPU benchmarks.

## State
- PR #107 introduced opt-in async WebGPU bootstrap and WebGL fallback; **not wired to live scenes**.
- PR #108 adds per-scene backend selection policy and Node tests; **not wired to live scenes**.
- Existing Duelist `src/components/duelist/client/warp.mjs` uses WebGL EffectComposer, ShaderPass and GLSL.
- Existing Fallen Sky `src/components/game3d/GameWorld3D.jsx` creates a WebGL context directly, uses WebGL-specific GPU diagnostics and context-loss recovery.
- The package currently declares `three: ^0.171.0`; verify the exact installed API before changing renderer imports or postprocessing.

## Parallel tasks for collaborating agents
1. **Duelist renderer owner:** audit `src/components/duelist/client/DuelistGame.jsx` and renderer lifecycle, identify init/render/dispose changes. Submit an independent PR.
2. **Duelist effects owner:** migrate `warp.mjs` to a compatible WebGPU post-processing implementation (TSL/node-based as supported by installed Three.js), preserve ring/pull/lens behavior. Submit independent PR.
3. **Fallen Sky renderer owner:** audit `GameWorld3D.jsx`, GPU settings, explicit WebGL context, WebGL-only calls, diagnostics, context loss, lifecycle and cleanup. Submit independent PR.
4. **Shaders owner:** inventory ShaderMaterial, RawShaderMaterial, onBeforeCompile and post-processing effects; migrate one tested group at a time.
5. **QA owner:** establish baseline WebGL and WebGPU benchmarks: average FPS, 1% lows, frame-time p95, memory, device compatibility, and visual screenshots in same scenes.

## Validation gates
- Run `npm ci`, `npm run lint`, `npm run build`, `node --test tests/rendererSelection.test.mjs`.
- Test Chrome/Edge WebGPU, unsupported-browser WebGL fallback, mobile, context/device loss, resizing and unmount.
- Test Duelist telekinesis and combat VFX; test Fallen Sky terrain, NPCs, UI overlays, inventory viewers, caves and portals.
- WebGPU must remain opt-in per scene until shader compatibility is confirmed.

## Handoff protocol
Each agent posts to its PR: scope, files touched, assumptions, tests executed (or not executed), screenshots/metrics if available, remaining blockers, and next owner. Do not claim a task completed without a commit and test evidence.

## Automation boundaries
GitHub Actions CI checks pushes/PRs but does not independently author game code. A scheduled ChatGPT task may review and propose incremental changes subject to connector availability; it cannot promise uninterrupted 24/7 coding.
