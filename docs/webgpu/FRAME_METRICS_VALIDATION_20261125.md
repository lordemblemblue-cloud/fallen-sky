# Frame metrics validation handoff — 2026-11-25

Ownership: this branch reserves only `src/lib/frameMetrics.mjs`, `tests/frameMetrics.test.mjs` and this note. Main handoff is reserved by #252; this companion note avoids overlapping it. #110 is merged. No renderer or deployment changes. Reject sparse retained samples, nonfinite accumulated durations and FPS, and overflowing timestamp differences. Warmup exclusion remains unchanged. Physical GPU QA remains outstanding for both games. Marcus Flow 1 deferred.

## Verified follow-up — 2026-11-25
Exact candidate source and test blobs from `2e90fab9` were copied into an isolated temporary directory and checked with `git hash-object`. `node --test tests/frameMetrics.test.mjs`: 9 passed, 0 failed. GitHub Actions WebGPU run 45564729002 failed in the broad unit-test step (combat and UI assertions among failures); lint and build were skipped. World-entry run 45564729099 failed at clone-town terrain verification. Security gate passed. Do not infer that these failures are newly introduced or baseline-confirmed without a comparison. No physical GPU benchmarks or live verification. Keep draft pending review and broader validation.
