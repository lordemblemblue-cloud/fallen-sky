# Game 3D clone — Bow hit registration, visible MISS/HIT, and latency audit

Date: 2026-11-14
Scope: Game 3D **clone** only, based on main after prior straight-tracer PR #42 was merged. No modifications to the main Atom X Eve OS repo.

## Defects confirmed in source
1. The boss/rogue bridge applied damage and dispatched its "verified bow hit" callback **before** GameWorld3D created the arrow tracer. That could leave a confirmed hit green on an old tracer (or invisible) rather than its own shot.
2. Ordinary AI misses were only shown as a floating MISS over the foe, and empty-space arrow misses displayed no status at the centre reticle. Boss/rogue misses did not dispatch outcome feedback.
3. A bow click during the normal basic-attack cooldown was discarded without player feedback; it could appear to be an unregistered shot, even though no arrow actually fired.
4. The old target selector performed animated Box3.setFromObject() traversal of every candidate enemy on every arrow, and a world-mesh raycast **before** knowing whether any enemy was plausibly on the shot line.
5. Every tracer/animated bird allocated new geometries and materials and disposed them during rapid shots, causing avoidable GPU resource churn.

## Changes
- Fire trace before doing the **single shared** bow hitbox calculation through the rogue/boss damage bridge; normal enemy/Boss/Rogue damage only turns the shot green when positive confirmed damage is applied.
- Visible reticle status HIT [damage] in green; MISS or DODGED in red. A trace that misses becomes red. An empty reticle shot is a MISS, not a phantom auto-hit. Existing normal enemy floating damage feedback remains.
- Show COOLDOWN or NO STAMINA (yellow) for button presses that do not produce an arrow. This is not recorded as a missed shot and does not change damage or attack-speed balance.
- Bound animated target-box hierarchy traversal to once per 750ms per relevant actor through a WeakMap; new cheap world-space broadphase skips far/off-axis AI first, particularly helpful for 30-enemy fights. Defer and cap terrain/building raycasts until plausible target boxes are found, and still test camera and muzzle occlusion. Preserves 40m PvE and 12m PvP/duel enforcement; does **not** change combat RNG dodge, defense, crits, XP, authority or other weapons.
- Reuse at most six spirit-bird/tracer draw-object groups, GPU line buffers, unit-cylinder geometries and shader materials across shots. Update world-space straight endpoints in place. Dispose all pooled resources on unmount. No added per-shot timers or React rerenders.
- Read-only local console QA call: window.__axe3dBowShotStats?.() returns fired, hits, misses, pending, lastResolutionMs (time from **tracer creation** to feedback), lastAimMs and maxAimMs (time spent on **AI selection/occlusion**, not end-to-end click-to-display). No network telemetry, uploads or hardware data collection.
- Added/updated tests and explicit no-dependency CI contracts.

## Verification already available
- Executed seven GitHub source-contract tests in an isolated JavaScript assertion harness: 7 passed / 0 failed (not a native Node/npm build).
- Executed exact source of the updated VFX module in a synthetic Three.js object model: straight-line error ~1.1e-16, MISS red 0xff5d65, HIT green 0x81f6b1, new shots reset to gold, expired object group/vertex buffer reused, 6-active-object cap, cleanup valid. This is NOT a live WebGL rendering or performance measurement.
- Full build, browser/real Three.js tests, scene geometry, signed-in game, actual target HP, 5/15/30 AI benchmark, compatibility with other open PRs, console latency samples and production preview are not yet verified. This work is a **QA draft** until verified.

## Required QA
1. Native tests: node --test tests/game3d-bow-centre-mouse-aim.test.mjs tests/game3d-bow-feedback-contract.test.mjs ; npm ci --ignore-scripts && node --test tests/game3d-bow-camera-aim-spirit-bird.test.mjs ; npm run build.
2. In signed-in clone Play, shoot stationary and moving AI at 5, 15, 25, 38m. Verify gold trace appears at each valid arrow firing; HIT green with actual HP decrease, MISS red when aim fails, DODGED where underlying rules intentionally dodge, COOLDOWN yellow only for rejected inputs.
3. Shoot rocks, houses, cave ceilings, bridges, and overlapping enemies; no hit through geometry. Check bosses and rogues: same specific shot turns green after positive damage, without independent retargeting. PvP remains server-owned.
4. Test first arrow after world loading, 30-enemy Kali/Demon battles, repeated rapid fire and long sessions. Record frame p50/p95/p99, long tasks, local lastAimMs and lastResolutionMs, hit/miss counts, mesh/texture count, first-hit time. An unverified optimization is not a guarantee of 0ms latency or 60 FPS.
5. Scope excludes direct Base44 editor publication: GitHub PR merge does not automatically update the live Base44 preview. Do not merge/publish until review and QA are complete.

Safe rollback: revert this PR. Other feature branches and Game 3D main remain unchanged.

## Latest CI and QA note

Pull request #44 triggered the standard Game 3D avatar/world-entry workflow and the bow-aim workflow; **both GitHub Actions runs reported failure**. Their individual jobs also report failure, but GitHub's log-fetch endpoint returns BlobNotFound (404) instead of test output. The reason for either failure is therefore **unknown**, and they must not be reported as passing. As of this note, no actual browser FPS, HP-delta, or end-to-end shot latency claim can be made.

The seven dependency-free contract test bodies were re-executed after the final code changes against their exact latest GitHub branch files using an isolated JS harness: **7 passed, 0 failed**. The two modified standalone JavaScript modules parsed successfully in V8. These are limited source checks, **not** a substitute for native Node/npm tests, a Three.js/WebGL render or signed-in gameplay. The draft remains unmerged for safe regression review.
