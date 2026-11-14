# Game 3D clone — straight bow, AI hitbox and visible tracer (2026-11-14)

**Scope:** clone source only, Game 3D. Based on current clone main (previously merged bow aim work #37), not main Atom X Eve OS. Do not merge automatically; coordinate shared GameWorld3D.jsx with still-open clone PRs #15, #10 and #16.

## Player request

When the centre bow reticle is on an enemy, an arrow travels in a straight line to the point the combat resolver tested. The shot must register against a bounded enemy AI body hitbox even when the visual mesh has gaps or is not yet decoded. Show a visible shot trace for verification.

## Changed behavior

- Camera-centre ray intersects a bounded body hitbox for living AI. It uses capped model bounding boxes and a small fallback for an enemy whose geometry has not loaded. No giant auto-aim cone and no decorative VFX-as-hitbox.
- Camera-to-target and **muzzle-to-target** straight rays check existing world collision meshes. There is one world obstruction query per shot rather than one for every AI candidate. Not polled every frame.
- PvE bow reaches **40m** (BOW_PVE_RANGE) for outdoor archery. The original RANGED_ATTACK_RANGE=12 is retained for PvP/duel authority. No changes to PvP/server range enforcement, other weapons or damage formulas.
- One target decision per attack: GameWorld3D passes the resolved hitbox target to dispatchRogueAttack so boss, rogue and normal enemy paths cannot pick independent targets. Damage/loot still use existing combat systems; a visual hitbox does not grant its own damage.
- Original spirit bird now flies **straight**, from a shoulder-height muzzle to the same world hit/impact point. A luminous gold Three.js line and thin glowing cylinder reveal the shot. Verified hit confirmation colors the latest trace green. No Bezier arc, separate projectile authority or XP rewards; geometry is disposed after the effect.
- Existing clone OTS screen-centre reticle is preserved. No second dot, camera rewrite or new canvas.

## Modified paths

- src/components/game3d/combat/BowCameraAim.mjs
- src/components/game3d/vfx/Game3DBowSpiritBird.mjs
- src/components/game3d/GameWorld3D.jsx
- src/components/game3d/rogueAttackBridge.jsx
- tests/game3d-bow-camera-aim-spirit-bird.test.mjs

## Required tests

1. Native: node --test tests/game3d-bow-camera-aim-spirit-bird.test.mjs tests/game3d-bow-centre-mouse-aim.test.mjs
2. Full: npm run build
3. Signed-in clone Game 3D: shots from 5, 15, 25 and 38m on stationary/moving AI. Check straight gold line, green verified hit, actual enemy HP change. At 45m expect no hit.
4. Overlapping AI must receive only one hit at the nearest body. Check bosses, rogues, normal and delayed-load models, dead and dying AI.
5. Rock, forest trunks, houses, bridges, cave walls must obstruct camera or muzzle shots; a wall shot never damages through cover.
6. Camera shoulder swaps, pointer lock and menu blocking must not desynchronize reticle. PvP duels stay 12m/authoritative; melee and ranged AoE behavior are preserved.
7. Kali/Demon 5/15/30 enemies; record frame p95/p99, collision and draw-call cost, and test VFX cleanup.

**Truthful status:** code committed in isolated clone branch, regression test source committed, but native Node tests, complete build, signed-in WebGL Play, server parity, actual FPS and owner acceptance are not verified. A GitHub merge does not independently publish Base44.

Rollback by closing/reverting this draft PR; clone main and other ongoing branches remain unchanged.

## Actual source-only checks completed

- Both modified pure JavaScript modules were parsed successfully as ordinary JS after stripping their module headers in an isolated V8 check. This does not prove the JSX/full app builds.
- Exact committed spirit-bird/tracer source was executed with minimal synthetic Three.js math/scene objects. Observed start (0, 1.45, 5), end (0, 1.2, -22), straight-flight cross-product error about 4.44e-16, green confirmed-hit color 0x81f6b1, and effect cleanup. This is NOT a genuine Three.js browser render.
- Exact AI hitbox/selection source was exercised with synthetic world-box math: nearest target, off-axis rejection, camera wall occlusion, 27m target and beyond-range rejection, and no-geometry fallback behaved as intended in these cases. Muzzle-obstruction still needs an actual Three.js/scene test.
- GitHub Actions runs for this PR reported failure. Their job-step details are not returned, and downloaded logs fail with BlobNotFound (404); **the cause is unknown**, and none of those runs counts as a passing build or passing native test.
- A draft PR is deliberately held for independent native Node and signed-in clone browser QA before it can be considered working or safe to deploy.
