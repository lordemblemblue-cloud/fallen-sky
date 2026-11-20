# WebGPU migration agent handoff

Project: `lordemblemblue-cloud/fallen-sky`. Prioritize Fallen Sky and Duelist Adventure. Defer Marcus Flow 1 until both are migrated and benchmarked.

## Read first
Read root `AGENTS.md` and `README.md`. The guest-only entry policy takes precedence over legacy authentication examples. Do not change login, character selection, server permissions, or deployment infrastructure.

## PR ownership and status (2026-11-20)
- #107 merged: opt-in asynchronous WebGPU renderer factory and WebGL fallback. **Not connected to live games.**
- #108 merged: conservative per-scene WebGPU readiness selector and tests. **Not connected to live games.**
- #109 draft: adapter probe; owns `src/lib/webgpuAdapterProbe.mjs` and `tests/webgpuAdapterProbe.test.mjs`.
- #110 draft: frame metrics; owns `src/lib/frameMetrics.mjs` and `tests/frameMetrics.test.mjs`.
- #111 draft: shader inventory; owns `scripts/webgpu-shader-audit.mjs`, `scripts/run-webgpu-shader-audit.mjs`, `tests/webgpuShaderAudit.test.mjs`.
- This PR: owns only `docs/webgpu/AGENT_HANDOFF.md`, `.github/workflows/webgpu-ci.yml`, and `tests/webgpuHandoff.test.mjs`.

## Parallel work queues
1. Duelist rendering owner: inspect renderer creation, frame loop, resize and dispose; implement scene-gated backend selection in an isolated PR only after shader compatibility.
2. Duelist effects owner: audit `src/components/duelist/client/warp.mjs` (EffectComposer, ShaderPass and GLSL); port telekinesis distortion using compatible WebGPU postprocessing, preserve push/pull/lens visuals.
3. Fallen Sky owner: inspect `src/components/game3d/GameWorld3D.jsx` WebGL context, GPU diagnostics, context-loss handling, render targets, materials, and disposal.
4. Shader inventory owner: run #111 scanner and triage findings into WebGPU-safe TSL conversions, coordinating with renderer owners.
5. QA owner: connect #110 metrics and compare identical hardware/scenes, warmup, FPS, 1% low, p95/p99 frame time, memory, visuals, device loss and mobile fallback.

## Collaboration rules
- Announce ownership in the draft PR conversation before editing shared files. Use one agent per file or coordinate explicit handoff.
- Work in feature branches and draft PRs. Never merge or deploy to main without review and passing validation.
- Avoid editing files owned by #109, #110 or #111 while those PRs are open.
- Use `three` version installed by the repository lockfile; verify TSL/postprocessing APIs rather than assuming newer docs apply.
- Keep WebGL default for scenes not verified WebGPU-ready.
- Report each commit SHA, changed paths, executed commands and outcomes, browser test evidence, blockers, and next owner. Never invent FPS gains or claim unexecuted tests passed.

## Validation
- `npm ci`
- `node --test tests/rendererSelection.test.mjs tests/webgpuHandoff.test.mjs`
- `npm run lint`
- `npm run build`
- When PR #109/#110/#111 are merged, CI should discover their tests via `node --test tests/*.test.mjs`.
- Test Chrome/Edge WebGPU, WebGL fallback, unsupported browser, mobile, resize, scene switch, device/context loss and visual parity.
- No active game rendering is migrated just by adding these checks.

## Automation boundaries
GitHub Actions validates pushes/PRs, not autonomous code writing. Scheduled coding runs are intermittent and depend on tool access; record the next task in PR comments.
