# Enemies subsystem: build note

Branch `claude/three-roads-enemies-20261121`. Code in `src/components/game3d/threeroads/enemies/`; tests in
`tests/game3d-three-roads-enemies-kinds.test.mjs` and `tests/game3d-three-roads-enemies-runtime.test.mjs`.

## Files

| File | What it does |
| --- | --- |
| `enemyKinds.mjs` | The kinds table. Adding a kind is one row plus its asset list (`loadAssets()` resolves to a model url and clip urls by role). |
| `enemyPlacement.mjs` | Where a group stands: seeded Fibonacci disc, ground must answer, no more than 1.5 m rise one metre away on any side, 2.2 m apart. |
| `enemyGroupWatcher.mjs` | Announces deaths without any hook in the kill paths. |
| `enemiesSubsystem.mjs` | Builds game-shaped entries, binds clips, keeps the limit, removes and disposes. |

## Kinds

| Kind | Model and clips | Look | AI profile | Height |
| --- | --- | --- | --- | --- |
| `ink_shade` | legacy creature rig and mutant clips (`creatureAssets.jsx`) | one wet-ink `MeshStandardMaterial` (0x06070a, roughness 0.24, metalness 0.2, no texture) per monster | standard | 1.95 m |
| `old_dead` | owner's zombie (`WolfveilZombieOwnerAssets.mjs`); Dying then Death | its own materials | aggressive | 1.75 m |
| `echo` | Admin C1 and its assigned clips (`WolfveilEnemyAssets.mjs`); walk = slowed run | its own materials | standard | 1.7 m |

The names shown over the health bars ("Ink Shade", "Old Dead", "Echo") are descriptive, not from `threeroads/script/`; the lead may replace them.

## Flags on each entry

- `wolfveilVisualSpawn: true`: the AI loop plays the entry's own `attackClip` (GameWorld3D.jsx:4587) and the main kill path its own `deathClip` (:5126); the kill path skips `broadcastEnemyKill` (:5137) and the whole reward block (:5139-5191: title kill, gold, score, XP, `reportEnemyKill`, `axeRuntimeEnemyDefeated`, `awardXP`); a peer's replayed kill ignores it (:1574).
- `dungeonTrainingSpawn: true`: a second lock on the same reward branch. `xpReward: 0`.
- Not `isQuestSpawn`: it would replace the kind's AI profile with the quest profile, and at the end of the fade GameWorld3D disposes the clone's geometry, which all clones of a kind share. Instead the subsystem sets `respawnAt = null` on its dying entries every frame (it runs before the enemy loop, so the 10 s the kill path sets never runs out) and removes the body itself when `deathFinalized`.
- Not `wolfveilZombieCampSpawn`: alone it grants experience, and attacks then ignore the tier.
- What still happens on a kill by the main path: the weapon kill counter (`reportWeaponKill`, :5083) and the kill-flow "COUNTER READY" notice (:5084). I did not check what `reportWeaponKill` grants.

## The other two kill paths

`legacyTargetedAbilities.jsx` `grantKill` (:43-65) and `companionAbilityHandler.jsx` `handleEnemyKill` (:29-61) read no flag. On one of our monsters they:

- grant `en.xpReward || 1` experience, so **1 XP even with `xpReward: 0`**, plus score, and call `reportEnemyKill(QUESTS, tier)` (credit on the older kill quests);
- play the creature's `cachedDeathClip` and leave `runAction` running: the watcher replaces that with the kind's own death clip the next frame;
- never set `respawnAt`, so no respawn.

Closing the 1 XP and the old-quest credit needs a guard in those two files (outside `threeroads/`): skip the reward lines when `en.wolfveilVisualSpawn || en.dungeonTrainingSpawn`.

## Events

- Bus: `enemies:defeated` `{ groupId, kind, id, tier }` and `enemies:groupCleared` `{ groupId, kind }`.
- Window: `axePledgeEvent` `{ type: 'enemy_killed', targetId: groupId, placeId, kind, tier, count: 1 }`, once per death, as `PLEDGE_ENGINE.md` sections 3 and 5 ask. Only pledges hear it; the older AXE and Echo kill quests do not. `placeId` is passed through exactly as the spawn request gave it (`P04`) and left out when the request had none.
- The live check below was run before this change, when the event still went out on `axeQuestEvent`; the channel is pinned by a node test.

## Passive groups

`enemies:spawnGroup` with `passive: true` (the opening's script uses it once, for the ink figure seen ahead of the player):

- never put in the game's enemy list, so the AI loop, combat, lock-on and health bars never see it: it does not notice or attack the player and cannot be hurt;
- stands where it is put (a group of one stands on the point itself when the ground there allows it), idles (the subsystem drives its animation), has no hostile ring;
- reports no deaths and is removed only by `enemies:despawnGroup` or `dispose()`; vanishing is not a death;
- counts against the limit of 12 animated bodies.

Not checked live; covered by node tests.

## Limits and cleanup

- At most 12 of ours alive or loading in a scene; a group that asks for more gets what fits.
- One shared skinned FBX spawner per kind (one download and parse, cloned skeletons, two clones per frame); clips parsed once per url.
- Removed and disposed on `enemies:despawnGroup`, after the death fade, and on `dispose()`: the entry leaves `enemies`, the model leaves the scene, the mixer is uncached, the per-monster materials and ring are disposed. The skinned geometry shared by the clones is not disposed (as the zombie runtime does).
- FBX rigs can arrive split into many draw groups: the legacy creature mesh has 101 groups over 2 materials, so every legacy creature in the game today costs about 101 draw calls. Ours do not: the ink look uses one non-array material (one draw), and multi-material kinds get one re-index per source geometry with one group per material (attributes shared, only the index is new).

## Live check, 2026-11-21

`/gameview?threeRoads=1`, a fresh guest (level 1), WebGL renderer (the pane was hidden; it did not pick WebGPU), player moved to (62, −120) world, groups of six at (70, −140) world, radius 9, level `'player'`, place `wagon_yard`, through `window.__gw3dThreeRoads.get('enemies').spawnGroup(...)`.

| Kind | Draw calls / triangles before → with the group | Came at the player, telegraphed, hit | Deaths | Quest events | XP / gold |
| --- | --- | --- | --- | --- | --- |
| `ink_shade` (first build) | 168 / 1,934,990 → 786 / 2,001,380 | yes (HP 199 → 161) | — | — | — |
| `ink_shade` (fixed) | 126 / 1,833,059 → 143 / 1,906,277 | yes | 6 with own clip, `respawnAt` null, removed after the fade, none back after 12 s | 6 (then on `axeQuestEvent`), `targetId` + `placeId` | 0 → 0 / 5000 → 5000 |
| `old_dead` | 158 / 1,841,978 → 181 / 1,931,606 | yes (HP 187 → 161) | 6; Dying then Death checked on the last | 6 | 0 → 0 / 5000 → 5000 |
| `echo` | 124 / 1,839,797 → 167 / 1,963,964 | yes (a lone echo: 4 strikes, HP 199 → 172) | 6 with own clip | 6 | 0 → 0 / 5000 → 5000 |

Each monster: ink shade 1 body draw + 1 ring, about 11,000 triangles; old dead 2 + 1; echo 4 meshes + 1 ring (about 7 draws). Monsters were killed with left-click swings from the test page (the F kick did not fire from a synthetic key). Despawn returned the scene to 166 draws with no events. With 8 of ours in the scene a request for 8 more placed 4 (12 in all); `dispose()` left none of ours in the enemy list or the scene.

The before/after rows are different camera views between runs (the player was moved), so compare each row with itself. Not measured on WebGPU.
