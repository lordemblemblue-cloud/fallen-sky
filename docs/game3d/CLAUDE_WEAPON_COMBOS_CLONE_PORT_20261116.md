# Game 3D Clone — Claude weapon-combo port (2026-11-16)

## Source provenance
- Source: private `marcusflow1-arch/atom-x-eve-os` branch `claude/weapon-combo-remote-swings`, commit `f16c034993c745e9f61e60a2cbaaee91a8047859` (2026-11-16 15:17 UTC).
- Sword and bow three-hit attacks: `56c58d967add60e42b2f3c638606bc4e31df0e4e`; raised long-blade ground clearance: `1725d4b835f1f3edcc8e43a2eab22988478099ca`.
- Oil-metal weapon summon and pack tooling: upstream Nov 14 commits `377914f59`, `cc3f18ef4`, `57892fa88`, `ef2dc9da6`.
- This is a selective **clone-first** integration, NOT a merge of the old source branch. Source branch was behind the source repository's current main, so reusing the whole tree would discard unrelated fixes.

## Integrated on clone feature branch
- Copies the authored procedural/rig-fitted swordCombo1/2/3 (forehand, rising backhand, overhead) and bowCombo1/2/3 (quick, sidestep, overdraw) clip baker, grip solver, 3-hit binder, and player's animation-controller chain/buffer/cancel logic.
- `GameWorld3D` binds combo clips to the actually loaded player rig, selects sword combos for the Damage/melee path and bow combos for ranged, retains its existing charge, hit/miss, server/duel resolution, weapon slots and bow projectile handling, and emits one real sword swing trail cue per cutting window. It does not produce a second projectile or additional damage.
- Carries Claude's `RemotePlayersManager` support for remote sword/bow animation names, stale packet rejection, and 3-hit motion baked onto the remote avatar's rest pose.
- Remote stand-in weapons are **disabled by default** until the full original GLB pack is in the clone. Remote skeletal combo animations still play, and the existing remote avatar remains visible.
- Copies upstream weapon pack runtime/summon/construct modules, manifest, grip data, Blender optimizer, combo preview tools, and upstream tests into the clone branch. These assets/tools are staged for completing the source-parity port, but the new summon effect is **not yet wired to clone Play**.
- `public/game3d/weapons/violet_bow.glb` was transferred with SHA verification.

## Blocker: five large original private GLBs unavailable to copy using this GitHub connection
The following original binary assets are in the private source repository but **not** in the clone yet:
1. `public/game3d/weapons/energy_sword.glb`
2. `public/game3d/weapons/fantasy_bow.glb`
3. `public/game3d/weapons/fantasy_sword.glb`
4. `public/game3d/weapons/odachi.glb`
5. `public/game3d/weapons/ornate_bow.glb`

Each is >1 MB. GitHub Contents returns blank content for these large files and Git blob decoding is binary-incompatible through this connection. We **must not** create empty or invented substitute GLBs or hotlink private source URLs. Restore the exact assets using an authenticated binary-capable git fetch/copy (e.g. local git remote), then run the pack manifest/rig checks and enable full summon visuals.

## Required acceptance before merging to clone main
- Native `node --test tests/game3d-clone-claude-combo-bridge.test.mjs`; run source-focused combo and remote tests that do not rely on missing pack assets; inspect pack tests separately once original GLBs are restored.
- Build and run signed-in Game 3D Play with a real player skeleton; verify both three-hit chains, click buffering, movement/dodge interrupt only after release, and ranged charge/miss/hit registration.
- Two signed-in clients: repeated/out-of-order animation packets, remote sword and bow motions, no duplicate or false-hit animations, idle and run transitions.
- Verify mobile and desktop, character/faction switching, proper camera and weapon slots, no added network protocol or damage multiplier, no errors when the pack isn't available.
- Restore and verify the five missing originals; then integrate source summon/stand-in weapon visuals and test matching grip/arrow/tip clearance before declaring **complete source parity**.
- Review the clone's independent rendering/performance changes; do not overwrite them with the source branch's older world scene.

Only Game 3D clone files are changed. Nothing in the main game's terrain workstreams or other games is touched.
