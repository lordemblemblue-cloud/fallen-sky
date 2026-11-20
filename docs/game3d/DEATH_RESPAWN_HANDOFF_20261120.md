# Fallen Sky death, ash and checkpoint respawn handoff — 2026-11-20

Branch: `feature/game3d-player-death-ash-respawn-20261120`. Review-only draft. No main merge or deployment.

## User flow
1. HP reaches zero. The live avatar plays its uploaded forward/backward death animation or a rig-local forward-fall fallback. The controller clears combat and movement.
2. After 1.35 seconds, the body disperses into 125 lightweight ash motes and its owned temporary materials fade; the source model and materials return upon revive. The weapon uses its existing melt dismissal.
3. At 3 seconds, show the responsive respawn map directly (without the old fullscreen opaque tips interruption).
4. Offer a temporary nearby spot only after ground/ledge/collision/hostile checks, the always-available town, and checkpoints this character activated by approaching their shrines. Previously saved single checkpoints remain unlocked.
5. The world accepts only known permanent checkpoint IDs, revalidates local landing coordinates, and sends an acknowledgement before UI restores HP or clears death phase. For a different Wolfveil streaming area or a dungeon-to-town death, use the existing scene-remount portal path; destination world entry must ground the actor.

## Compatibility / ownership
- The live game stays on the existing WebGL renderer. This change does **not** mark Fallen Sky or Duelist Adventure WebGPU-ready or touch WebGPU migration infrastructure.
- PR #73 also edits `src/components/game3d/GameWorld3D.jsx` for weapon summoning. An ownership note was posted there: keep death/respawn edits separate from weapon implementations, resolve any conflict before review.
- `src/pages/GameView.jsx` changes only the `source: 'death-respawn'` world-return path. Guest character selection, inventory, server authority and regular portals remain outside scope.
- Map checkpoints are client-side character-scoped storage and presentation. Multiplayer/dedicated server authority must still validate positions separately; no server claims are made.

## Suggested tests and QA
- `node --test tests/game3d-death-sequence.test.mjs tests/game3d-checkpoint-selection.test.mjs tests/game3d-nearby-respawn.test.mjs tests/game3d-map-spawn-points.test.mjs`
- Run changed-files ESLint and `npm run build`. The full repo `npm run lint` was attempted on draft PR #126 and failed with 1,834 repository-wide errors, predominantly missing global definitions in unrelated scripts/tests. Fix the lint baseline separately; do not conflate it with this feature's targeted lint.
- Browser: die on foot with and without uploaded death FBX, verify fall -> ash -> responsive map; repeat death twice to catch invisible armor/material leaks; die while riding; respawn within 2–12 m without cliff/river/enemy overlap.
- Visit multiple shrines and reload the same character; verify activation persists and different characters have isolated availability. Return to Town Plaza across a streaming boundary and from an active cave/dungeon; check cave checkpoint remains a separate resume choice.
- Verify weapon returns to hand after revival, WebGL context loss doesn't crash the ash effect, mobile landscape and portrait layouts, full HP and post-respawn invulnerability.
- The live 3D browser path, WebGPU parity and multiplayer-authoritative spawn have NOT been verified by this branch. Keep draft until checks and visual QA pass.
