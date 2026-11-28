# Clone-only cave terrain-square candidate coverage — 2026-11-16

**Target:** `lordemblemblue-cloud/fallen-sky`, not the historical `marcusflow1-arch/Fallen-sky-` or original `marcusflow1-arch/atom-x-eve-os`. This is a **review-only draft**, not a terrain release, merge certification, or claim on ownership.

## Current clone inventory
- New clone `main@d16711e1a6636d7e0275e421f3ec783737847271` already includes cave access trail geometry and test, plus merged new-repository PR #1 (front stairs/roof seals) and PR #2 (spread entrance mouths and underground interconnections). Older cross-repository PR #106 must **not** be replayed or assumed historically compatible.
- Existing source: `WolfveilCaveAccessPlan.mjs`, `WolfveilCaveAccessGeometry.mjs`, `WolfveilCaveLayout.mjs`, `WolfveilCaveSystem.js`. It contains four cave approaches, with new entrance locations on the southwest, northwest, north and eastern borders.
- Historical WS15 town contact PRs #10/#16 in the old repository are **unported source candidates** only. They conflict with one another in imported-town handling; do not copy them over current town purges, water, collision, or gameplay.
- GitHub access to original main-repository coordination issue #1266 and lane issues #1276 and #1281 returned 404, so exact issue ownership/claims and review acceptance could not be freshly read.

## What the new audit supplies
Run `node scripts/audit-wolfveil-cave-squares.mjs > cave-square-candidates.json` to enumerate every **candidate** 5-metre Play terrain cell touched by a cave approach (path strips, bend landings, entrance forecourts). Read results from current clone geometry, not from unrelated SHAs. The 100-metre block labels are provisional review groupings, **not** authenticated LAND workstream ownership. Coordinates follow the established `Xcol-Zrow` convention over the Wolfveil -550..550m local valley and the +70m Z Play translation. Example: Play (17.5,-2.5) is `X113-Z95`.

- Output is deliberately marked `UNVERIFIED` with `owner: null` and `ownerAcceptance: false` for all four caves. It lists overlapping cells separately for inspection.
- This audit computes **conservative candidates**, not a substitute for exact visual material/physics review; fine mesh corners/neighboring seam cells may need adding after in-game inspection.
- No live world meshes, player movement, network authority, terrain coordinates or ownership records are edited by this PR.

## Review/acceptance gate — remains open
1. Recover coordination hub #1266 and all LAND-WS01–WS15 exact claim/scope records. Check route coverage against legitimate owners before assigning any square to WS10 or WS15.
2. Compare source and conflicts against the *current* clone main SHA for every eligible square. Keep alternate owner branches separate; do not copy old commits across repositories.
3. Run native `node --test tests/game3d-clone-cave-square-coverage-audit.test.mjs`, existing cave tests, `npm run lint`, and `npm run build`. These have **not** been executed by this connected GitHub review; no green status is asserted. Hosted no-step Actions failures alone are not release blockers.
4. Verify signed-in **clone** Game 3D Play for all four outdoor approaches and arches: correct materials, grounded footsteps/ramps, traversable seams, roof/waterfall protection, E entry/exit, collisions/knockback, mounts, FPS/LOD, relog/checkpoints and two-client/server parity. Record screenshots and actual test observations per exact 5m cell/100m workstream.
5. Obtain independent **100% owner approval of each exact square**. Do not merge square-changing code on percentages, source-only tests, or absent acceptance.

**No merge authorized:** Draft, review-only. Main Game 3D code and original repository remain untouched.
