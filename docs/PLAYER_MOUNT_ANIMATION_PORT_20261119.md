# Game 3D: dodges, sprint, skill and level-up moments, mount flight, Faction 3 re-rig (port, 2026-11-19)

Ported from the atom-x-eve-os branch `claude/wizardly-poincare-19eb27` by copying files and resolving by hand
(no shared history). Fallen-sky's own work stays authoritative and the port is layered on top of it:
the eight-way dodges and authored flips (#79), the winged mount (#72), the bear seat (b44605f) and the
on-foot Space chain (Air Jump, wing glide, Skywalk).

## 1. Dodges

Fallen-sky's eight-way framework is unchanged (`player/game3dEightWayDodge.mjs`, the authored dodge pack, its
travel rule and i-frames). `player/game3dDodgeProfiles.mjs` adds two variant moves in front of it, used only when
the body has their clips:

| Input | Plays | Notes |
| --- | --- | --- |
| Double-tap W (and the forward diagonals) | forward sidestep (`Dodge_Forward`, Longbow pack) | 0.62 s at 4.4 m/s |
| Double-tap A / D | fallen-sky's `Flip_Left` / `Flip_Right` | unchanged |
| Double-tap S | fallen-sky's `Back_Flip` | unchanged; back diagonals keep fallen-sky's angled rolls |
| Roll dodges on, double-tap W | fallen-sky's front roll | Pause, then Controls, then "Roll dodges" (off by default) |
| Roll dodges on, double-tap S | authored back roll (`Back_Roll`) | 0.9 s at 5 m/s |
| R alone | authored back roll | R with keys keeps fallen-sky's rolls |

- Detection (`createDoubleTapDetector`): two presses of the same key within 320 ms with a release in between.
  Auto-repeat never counts and another movement key cancels a half tap. Main used 280 ms with no release check.
- The combat lock is the duration of the move that actually plays.
- **Square-up.** Walking turns the body toward the keys at 12/s, so on main the first tap of a double-tap has
  already turned the body by the second tap and almost every double-tap played the forward move (verified on
  `/gameview`: the body turns about 110 degrees within 100 ms). With free camera only (no lock-on, no aiming,
  no held bow: the same condition under which walking turns the body), the body now squares up to the camera
  before the slot is picked. The dodge still travels where the keys point on screen, as in #79. Locked on or
  aiming, nothing changes. If the dodge is refused (stamina, busy), the facing is left as it was.

## 2. Sprint

The bad sprint is replaced on both fused bodies by the Longbow pack's "standing run forward", retargeted by
`tools/avatar-motion/mobility-clips.mjs` (Blender for the FBX, `src/lib/mocap/retarget.js`) and loaded through
`player/mobilityClipPack.mjs` (manifest `public/models/animations/mocap/manifest.json`). Sprint now goes
through the fused locomotion cadence sync like walk and run, clamped to 0.75 to 1.45.

## 3. Skill-cast and level-up moments

- A cast (`playerSkillCastStart` from `skills/skillExecutor.jsx`) adds a burst in the weapon family's colour
  and a short power-surge gesture layered over whatever strike plays (`vfx/playerMomentEffects.jsx`,
  `player/playerMomentGestures.mjs`). Fallen-sky's own cast beam still plays.
- A level gained (`playerLevelUp`, now sent from the enemy and quest XP paths) adds a light pillar, rings,
  sparks and a cheer gesture, and `LevelUpToastListener.jsx` shows the HUD toast.
- Both effects remove themselves when their time is up, because the world's effects list drops finished
  effects without calling `dispose()`.

## 4. Mount flight

- Space while riding takes off and Space again lands (`character/mountFlight.mjs`). The mount eases to 3.2 m
  above the ground, moves at 1.25 times its ground speed and pitches with climb. Dismounting in the air drops
  the flight. On foot, Space keeps fallen-sky's chain.
- All three faction mounts get a `fly` clip. The re-rigged tiger has its own; the others get the procedural
  wing beat with leg tuck from `factionPetAnimationRigs.proceduralMountFlightClip` (the bear has no wing bones,
  so its flight is the tuck and bob). A mount without one says "This mount cannot fly".
- Multiplayer: the position payload carries `flying`; a remote mount plays `fly` (or `run` without one).
- The Faction 3 secondary rig skips its wing clamp while the mount flies, locally and remotely.

## 5. Faction 3 tiger

`AXE_Faction_3` now loads `public/models/mounts/faction_tiger_rigged_v1.glb`: a clean quadruped skeleton,
weights rebuilt in headless Blender (`tools/game3d-mounts/rerig_faction_tiger.py`), and authored Idle / Walk /
Run / Fly clips played natively. The hosted #160 with its runtime profile (`winged_faction_3_160`) stays as the
fallback if the file fails to load (`previousModelUrl`, `previousAnimationSource`,
`previousAnimationRigProfile`).

Comparison in the harness: both take off, fly at 3.2 m and land. While ridden, the hosted #160 shows one wing
partly folded and the tail curled to the side; the re-rigged file keeps both wings spread and the tail behind.
To go back to the hosted file, point `modelUrl` back at it and restore its animation source and rig profile.

## 6. Preview harness

`tools/game3d-anim-preview` runs the real controller, clip library, dodge profiles, mount bank, flight and
effects on the real GLBs without a sign-in (only the Base44 client is stubbed):

```
node node_modules/vite/bin/vite.js --config tools/game3d-anim-preview/vite.config.mjs
```

Then open `http://localhost:5193/?body=male&mount=faction_tiger&demo=flight`. Demos are dodges, sprint,
moments and flight; `&fallback=1` loads the hosted #160. Screenshots land in the git-ignored `shots/` folder.

## Verified

On `/gameview` (vite dev, guest mode, Faction 3 character), with the keys sent as browser key events:

- Double-tap W, A, S and D played the forward sidestep, left flip, back flip and right flip, about 3 m each,
  in the pressed screen direction, from both a camera-facing and a camera-behind start.
- R played the back roll. Roll dodges (set in the pause menu) made W the front roll and S the back roll.
- Ctrl sprint played the new clip at the 1.45 cadence cap (12.6 to 13.5 m/s); walk measured about 4.2 m/s.
- F mounted the re-rigged tiger. Space took off on its own Fly clip to about 3.2 m and flew at 7.9 to 8.9 m/s
  against 6.3 to 6.5 m/s on the ground. Space landed, and F in the air dismounted to the ground.
- A double-tap while riding did not dodge. On foot, Space still jumps (the first press puts a drawn sword away).
- The skill burst and the level-up celebration, gesture and toast appeared and removed themselves.

In the harness: every dodge variant on both bodies, sprint on both bodies, the moments on the female body, and
flight for the re-rigged tiger, the armored wolf, the bear and the hosted #160 fallback.

## Tests

`node --test --test-reporter=tap tests/`, compared by failing test name with unmodified `origin/main` (ab603e4):

| | tests | pass | fail |
| --- | --- | --- | --- |
| origin/main | 1107 | 1023 | 84 |
| this branch | 1124 | 1040 | 84 |

The same 84 tests fail on both; the 17 extra tests are the new `tests/game3d-dodge-flight-moments.test.mjs`.
Pins in seven existing test files were updated where the wiring changed on purpose. One earlier run stalled in
`tests/duelist-server.test.mjs` while the game tab was running in the same machine; the rerun finished.
ESLint on the changed files reports the same 14 errors as main's versions of them, and none in the new files.

## Not verified

- The skill moment from the hotbar: a new guest has no slotted skill, so the cast-start event was sent directly.
- A level-up from real XP: the `playerLevelUp` event was sent directly. Its two dispatch sites are pinned by tests.
- Two clients (the remote `fly` animation), the bear and the wolf on `/gameview`, mobile, a signed-in account,
  owner-device frame rate.
- Two of about twenty scripted double-taps in early runs did not dodge and walked instead; a later run of eight
  with the gaps logged (187 to 226 ms) all landed. The cause of the two misses was not found.

## Known limits

- The sprint clip is cadence-capped, so feet slide at full sprint speed.
- The re-rigged tiger's gaits are procedural (sine leg swings, bound run, wing beats), not motion capture.
- Low flight still collides with buildings, since it uses the ground mover.
- Pre-existing: the world's effects list never disposes finished effects, so fallen-sky's own cast beam leaves
  a group and a light in the scene per cast. Not changed here.
