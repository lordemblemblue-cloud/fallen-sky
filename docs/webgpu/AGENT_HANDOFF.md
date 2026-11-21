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

## Status refresh — 2026-11-20 (renderer teardown resilience)
- Verified in GitHub: PRs #107–#117, #119 and #120 are now **merged**, including #109 adapter probe, #110 frame metrics, and #111 shader inventory. The earlier draft statuses above are historical; do not treat those files as actively reserved solely by those closed PRs.
- This draft owns **only** `src/lib/rendererInitGuard.mjs`, `tests/rendererInitGuard.test.mjs`, and this handoff update. It prevents synchronous or asynchronous renderer `dispose()` failures from aborting cleanup/restarts or producing unhandled promise rejections after WebGPU device loss. No live game scene is switched to WebGPU by this PR.
- The actual WebGPU migration remains incomplete: renderer factory, scene selector, adapter preflight, lifecycle guard, canvas mounting, warp-state extraction, shader inventory and metrics are infrastructure, not proof that Fallen Sky or Duelist Adventure uses WebGPU. WebGL remains the default until each scene's shader/effect audit and runtime tests pass.
- **Next safe work:** audit the Duelist scene's live renderer/EffectComposer integration and identify which GLSL postprocessing prevents TSL/WebGPU. Prepare a separate draft PR after coordination; do not replace the active renderer until parity, resize, fallback and device-loss tests exist. Fallen Sky `GameWorld3D.jsx` needs its own shader/render-target audit.
- **Validation:** CI on this draft should run focused `node --test tests/rendererInitGuard.test.mjs`, lint and build. Record actual outcomes in its PR comments; full-suite failures must be reported separately. Do not merge or deploy without review.

## Status refresh — 2026-11-20 (Duelist warp readiness inventory)
- Dedicated draft branch `feature/webgpu-duelist-warp-readiness-20261120` owns only `scripts/duelist-warp-readiness.mjs`, `tests/duelistWarpReadiness.test.mjs`, and this handoff update. No live Duelist or Fallen Sky renderer files changed.
- Confirmed by source inspection: `src/components/duelist/client/warp.mjs` still imports legacy `EffectComposer`, `ShaderPass`, and `OutputPass` and contains raw GLSL/`texture2D` sampling. Do **not** mark the Duelist telekinesis scene WebGPU-ready on this basis.
- The inventory reports known blockers and preserves a parity checklist for outward/inward rings, held lenses, chromatic fringe and glow. A clean static inventory is **not** proof of GPU runtime compatibility.
- Next owner: implement and browser-validate a WebGPU-compatible postprocessing path (using APIs supported by the installed Three.js version), then compare WebGL visuals and fallback/device-loss behavior before scene gating. Fallen Sky `GameWorld3D.jsx` remains a separate audit.
- Validation to run: `node --test tests/duelistWarpReadiness.test.mjs`, `npm run lint`, `npm run build`; no tests or benchmarks claimed until a runner reports results. No merge/deploy without review.

## Status refresh — 2026-11-20 (fail-closed scene readiness policy)
- Branch `feature/webgpu-scene-readiness-policy-20261120` owns `src/lib/webgpuSceneReadiness.mjs`, `tests/webgpuSceneReadiness.test.mjs` and this handoff paragraph only.
- Both live game scene IDs are explicitly **not ready** for WebGPU. Unknown scene IDs fail closed, including inherited property names; no live renderer is switched by this inventory.
- The readiness helper is available for future integration with `selectRendererBackend` only after scene-level audits and browser validation. Do not flip either flag based on static tests alone.
- Validation requested: `node --test tests/webgpuSceneReadiness.test.mjs tests/rendererSelection.test.mjs`, `npm run lint`, `npm run build`; not executed by this GitHub-only agent.
- Next owners: Duelist postprocessing parity and Fallen Sky GameWorld3D audit, each on separate PRs. Marcus Flow 1 remains deferred.

## Status refresh — 2026-11-20 (Fallen Sky context inventory, draft #131)
- Draft #131 owns only `scripts/gameworld-webgpu-context-audit.mjs` and `tests/gameworldWebgpuContextAudit.test.mjs`; this handoff paragraph is coordination only. The script inventories line numbers for WebGL renderer creation, `getContext`, context-loss checks, render, resize and disposal.
- Source review anchors in `GameWorld3D.jsx`: WebGL renderer around 530–531; context diagnostics 532; loss guard 654; resize 5464; disposal 5648. Do not interpret a static inventory as WebGPU compatibility.
- Validation **not executed**: run focused Node test, audit CLI, lint, build and browser device/context-loss tests. WebGL stays default; do not merge/deploy without review. Coordinate any further edits to this handoff file with owners of #121/#125.

## Status refresh — 2026-11-20 (Fallen Sky ink postprocess blocker inventory)
- Branch `audit/webgpu-fallen-sky-ink-pass-20261120` owns **only** `scripts/webgpu-ink-pass-audit.mjs`, `tests/webgpuInkPassAudit.test.mjs`, and this handoff note. Do not edit `GameWorld3D.jsx`, `render/inkWashLook.js` or Duelist UI/effects while other agents own their work.
- The *active* Fallen Sky ink-wash pass (`src/components/game3d/render/inkWashLook.js`) includes GLSL vertex/fragment shader source, `texture2D`, `gl_FragColor`, and GLSL depth packing. The new static inventory records 1-based locations and explanations for these and render-target/depth-attachment dependencies. **No WebGPU shader parity, device-loss handling or browser rendering is established by this scan.**
- Porting sequence: preserve current WebGL ink visuals; prototype a separate WebGPU/TSL full-screen pass using the installed Three.js version; compare depth-edge silhouettes, tone mapping, fog, mist and paper at each quality level, then test resize, context/device loss, WebGL fallback and mobile. Do not enable `fallen-sky` readiness until verified.
- Run `node --test tests/webgpuInkPassAudit.test.mjs`, `node scripts/webgpu-ink-pass-audit.mjs`, `npm run lint`, and `npm run build`; record actual outcomes. No merge/deploy without review. Duelist telekinesis remains a separate blocker; Marcus Flow 1 deferred.

## Status refresh — 2026-11-20 (Claude Code: live conversion, stage 1 renderer core)
- The owner asked a Claude Code session to finish the conversion. Survey first: `docs/webgpu/CONVERSION_SURVEY_20261120.md` (every canvas, shader, pass and WebGL-only call, the baseline numbers and the stage plan). Stages go on stacked branches `claude/webgpu-1-renderer-core-20261120`, `-2-game3d-materials-`, `-3-postprocessing-`, `-4-other-pages-`; merge them in that order.
- Stage 1 adds `src/lib/rendererBackendChoice.mjs` (scene default from the readiness inventory, `?renderer=webgpu|webgl2|webgl` override, remembered until `?renderer=auto`), `src/lib/webgpuSceneRenderer.js` (WebGPURenderer with its WebGL2 fallback, deferred dispose, compatibility for capabilities / extensions / shadowMap.autoUpdate / info / ShaderMaterial twins / device loss), `src/lib/webgpuMaterialTwins.js`, `src/lib/webgpuThreeFixes.js` (r171 MorphNode zero-influence skip) and wires GameWorld3D to them. `webgpuSceneReadiness.mjs` gains `preview: true` (explicit opt-in only); both scenes stay `ready: false`, so the classic WebGLRenderer remains the default.
- Edits `GameWorld3D.jsx` (renderer creation block, compile promise) and `render/inkWashLook.js` (stays at level 0 on WebGPURenderer until its TSL pass lands): keep other work on those lines coordinated.
