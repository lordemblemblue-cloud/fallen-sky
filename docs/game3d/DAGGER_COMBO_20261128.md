# Daggers: real clips for the dual-dagger combo (2026-11-28)

The owner asked for an original dual-dagger combo for Fallen Sky: "WHEN ITS DONE YOU CAN MAKE IT BUT YOU CAN ALSO USE
RGBMOCAP". These clips replace the code-made dagger poses in `src/components/game3d/weapons/weaponComboClips.js`
(`DAGGER_COMBO`, `DAGGER_CHARGE` and `IDLE_DAGGERS`) on both fused bodies. They keep the same moves and the same timing.

- **No new moves or mechanics.** The moves are the owner's own list from 2026-11-19, with a reverse grip in both hands.
- **Not from the videos.** The Skyrim mod videos the owner first named are another creator's animations for another
  game. They were not opened, captured or copied, and nothing in these clips comes from any other game.

## Change

New clips for the weapon clip pack (`public/models/animations/weapons/`, Adam's at the top level and Eve's in
`female/`). The game already plays a pack clip in place of the code pose of the same state (`weapons/weaponClipPack.mjs`).
No game code changes. All timings in seconds:

| State | Move and input | Length | Timing (owner, 2026-11-19: unchanged) |
| --- | --- | --- | --- |
| `idleDaggers` | the guard, breathing | 2.0 loop | hit 0, cancel 2.0 |
| `daggerLight1` | right hook slash (left click) | 0.333 | wind-up 0.04, hit 0.12, sweep 0.04–0.18, cancel 0.22 |
| `daggerLight2` | left hook slash (left click again) | 0.367 | wind-up 0.06, hit 0.15, sweep 0.06–0.22, cancel 0.26 |
| `daggerStab` | stab (right click) | 0.433 | wind-up 0.08, hit 0.18, sweep 0.1–0.27, cancel 0.32 |
| `daggerCharge` | charged double strike (a held swing) | 0.917 | coil 0.1 → 0.4, hit 0.47, sweep 0.41–0.56, cancel 0.66 |

- **The guard.** A bladed fighting stance: knees bent, both fists up in front of the chest, the lead (left) fist higher
  and further out.
- **The hooks.** The striking fist cocks out to the side, then the hips and shoulders drive it across the front, with
  the blade along the forearm cutting through. The other fist stays up, guarding.
- **The stab.** The right fist rises beside the head, then drives down and forward, with the weight going into it.
- **The charge.** Both fists go up beside the head, and the coil deepens while the charge builds: the back arches and
  the knees load. Then both blades hammer forward and down, the body dropping into the strike, with the arms long
  through the hit.
- **Shared guard.** Every move starts and ends on the guard the idle loops on, so the game's blends between them are
  seamless.
- **In place.** The feet stay planted, and the game's controller moves the body.

## How it was made

- **Keyframed in Blender 5.2.3, headless**, in the Atom X Eve Animation Studio (package `dagger-game`), outside this
  repo.
  - Every frame is solved with inverse kinematics on a copy of the weapon studio.
  - Each wrist keeps the turn from its forearm that the game's own dagger guard has. In a reverse grip the blade runs
    back along the forearm, so the arm aims the blade.
  - The fingers keep the game's own dagger grip.
- **Not captured.** RGB MoCap's GEM-X is now installed and passes its own readiness check
  (`RGBMoCapCLI.cmd check --model gemx`). There is no footage it may be used on yet. A captured version can replace
  these clips later through the same pack entries; the studio package lists what to film.
- **No Cascadeur.** Its script server was off. A pass in the Cascadeur Pro Trial would be for internal tests only,
  because its licence bans commercial use.
- **Licence trail:** Blender only.

## Evidence

### Studio QA

Measured in Blender on the keyed clips, with each body's skin deformed in every frame. All five clips pass on both
bodies.

- **Blades.** Each blade sits where the game's own grip puts it, measured live in the game:
  - It is rigid in the hand's anatomical frame (the knuckles and the wrist).
  - The blade comes out of the little-finger side of the fist, about 32 cm long. This is a true reverse "ice-pick"
    grip, not along the forearm.
  - Against that line, the first version's right hook and stab trailed the right blade about 4.5 cm into the face. The
    right forearm now rolls 50° through those two moves (half of it during the wind-up), so the blade points down and
    forward.
  - No blade goes into the body, head or the other arm.
- **Fists.** No fist goes into the head, body or the other arm.
- **Joints.** All joints stay within their limits.
- **Motion.** No bone flips or twitches. The arms keep a little bend, so they never lock straight. The fastest
  limb moves at most about 37° a frame, about 2,200° a second. The only frames excused from the one-frame twitch
  check are the first 6–7 frames of each hook, the owner's 0.04–0.06 s wind-ups.
- **Feet and joins.** The feet stay planted (0 mm drift), and every move meets the guard within 0.15°.

### Tests

Node v26.13.0, run in this worktree.
- **The new test.** `node --test tests/game3d-dagger-clip-pack.test.mjs`: 3 pass.
  - Timing matches the code-made moves.
  - The clips bind to both bodies.
  - Every move starts and ends on the guard, and the idle loops.
  - Neither fist goes inside the head or torso at any frame. Worst: 5.5 cm outside the head and 14 cm outside the
    torso.
  - Neither blade goes inside the head or torso at any frame. The blade is placed by the measured hand-frame line.
    Worst: 12.7 cm outside the head in the right hook and the stab.
  - On the first version's hook and stab, the blade check fails: the stab's blade is 3.5 cm inside the head.
  - At each hit, the striking fist is 13–31 cm in front of where it waits in the guard.
- **The existing weapon tests** (`game3d-weapon-clip-pack`, `-weapon-combos`, `-weapon-feel`, `-remote-weapon-combos`,
  `-equipable-weapons` and `-weapon-exclusivity-gear-presets`): the same 5 tests fail on a clean checkout of main
  (c1bdba08) and on this branch. The rest pass.

### Live in the game, both bodies

Run on this branch's dev server with `/gameview?renderer=webgl` on the temporary platform. The players were the existing
guest Eve and Adam, each with the Whisper Dagger equipped (daggers in both hands).
- **Clips loaded.** On each body, all five dagger states in the controller were the pack's files.
- **Clips played.** A wrap on three.js's `AnimationAction.play` logged the clips in this order on both bodies:

  | Input | What played |
  | --- | --- |
  | Two left clicks | `daggerLight1`, then `daggerLight2`, then `idleDaggers` |
  | A right click | `daggerStab`, then `idleDaggers` |
  | A held left click, then let go | `daggerLight1`; after its wind-up `daggerCharge`, held at the coil (both fists by the head) while the button stayed down; the strike on release; then `idleDaggers` |

  Every clip in this log was the pack's.
- **Blades on the game's own daggers.** The game was frozen, then each clip was posed frame by frame on the player's
  own animation mixer. The game's dagger meshes in the hands were measured against the convex shapes of the head,
  torso and thighs.
  - Before the fix, Eve's stab put the right blade 4.6 cm inside the head, and the right hook 1.7 cm.
  - After it, on both bodies, every blade stayed at least 5.2 cm outside the head and torso at every frame.
- **Frames.** They come from the game's own renderer, from behind, the right and the front. They are in the studio at
  `AnimationAssets/Testing/dagger-game/live_*_20261128.jpg`.
  - The pane was hidden, so they were rendered off-screen without tone mapping, which makes them darker.

## Limits

- **Keyframed, not captured.**
- **The blade line is a measurement.** The studio and the test place the blade by a line measured from the game's grip
  on 2026-11-28. If the grip changes (`weapons/weaponGripMath.js`), measure it again.
- **Bare bodies only.** Armour and clothing were not checked.

## Undo

Remove the dagger entries from `public/models/animations/weapons/manifest.json`. The game then plays the code poses
again.
