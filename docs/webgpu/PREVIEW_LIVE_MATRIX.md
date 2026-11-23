# Preview and live WebGPU evidence matrix

This is a **post-capture evidence gate**, not a GPU migration, benchmark, or browser test. It extends the two-game checker to require independent passing native WebGPU counter reports from **both games on both preview and live**.

## Capture four sessions

Run the existing `scripts/webgpu-native-browser-qa.mjs` on the actual preview deployment for Fallen Sky (`/gameview`) and Duelist Adventure (`/duelist-next/play`), and repeat on the live deployment. Each session must be captured with the native browser probe on a physical Chrome/Edge system. Record OS, browser, graphics adapter, commit and visible screenshots separately.

Use distinct filenames and keep all private reports/screenshots out of source control. Example invocation after collecting the four JSON files:

```bash
node scripts/webgpu-deployment-matrix.mjs \
  qa/preview-fallen.json qa/preview-duelist.json \
  qa/live-fallen.json qa/live-duelist.json
node --test tests/webgpuDeploymentMatrix.test.mjs tests/webgpuDualGameEvidence.test.mjs
```

The four **positional labels are supplied by the operator**: this tool cannot establish which host is genuinely preview or production. It requires two valid native-counter reports from the same origin within each environment, and the two environments must use different origins. It rejects missing/duplicate scenes, WebGL fallback, invalid frame evidence, mismatched hosts and an attempt to reuse one deployment as both preview and live. The existing dual-game validator owns detailed per-session checks.

**A passing result does not prove visible world pixels, smooth frame rates, correct scene effects, fallback recovery, or device-loss recovery.** Inspect screenshots and test these behaviors manually in both games and environments. Never treat a JSON counter check as permission to merge or deploy. Re-run after meaningful renderer changes. If the browser report schema is hardened by an upstream PR, recapture reports to satisfy the newer gate.

The shared `docs/webgpu/AGENT_HANDOFF.md` is owned by the active diagnostics PR #252; coordinate changes there through PR comments rather than editing concurrently. Marcus Flow 1 migration is out of scope until both Emblem Blue games pass physical-device validation.
