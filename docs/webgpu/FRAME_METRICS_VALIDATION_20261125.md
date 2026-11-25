# Frame metrics validation handoff — 2026-11-25

Ownership: this branch reserves only `src/lib/frameMetrics.mjs`, `tests/frameMetrics.test.mjs` and this note. Main handoff is reserved by #252; this companion note avoids overlapping it. #110 is merged. No renderer or deployment changes. Reject sparse retained samples, nonfinite accumulated durations and FPS, and overflowing timestamp differences. Warmup exclusion remains unchanged. Physical GPU QA remains outstanding for both games. Marcus Flow 1 deferred.
