# Locomotion batch 1: jump take-off, airborne, landing and fall (2026-11-28)

This is Phase 1, batch 1 of the animation roadmap (`docs/project-record/ANIMATION_ROADMAP_20261128.md` on branch
`claude/animation-audit-20261128`). Four real clips per fused body replace code-made placeholders on slots the
controller already has. Nothing else in the game changes.

| Clip (mobility pack) | Controller slot | Replaces | Length |
| --- | --- | --- | --- |
| `Jump_Start` | `jumpStart` | `game3d_jump_start` (playerMovementFallbackClips.js) | 0.233 s (window 0.24 s) |
| `Jump_Loop` | `jumpLoop` | `game3d_jump_loop` | 0.6 s loop |
| `Jump_Land` | `jumpLand` | `game3d_jump_land` | 0.217 s (window 0.22 s) |
| `Fall_Loop` | `fallLoop` | nothing: falls played the jump loop | 0.8 s loop |

## Changes in this branch

- **Clips.** `public/models/animations/mocap/` has the four clips for Adam, and `mocap/female/` has Eve's. Each is a
  skeleton-only GLB with one animation named like the file, in the pack's format. Each carries the pack's extras:
  `inPlace`, `loop`, `duration`, `airborne` and `kind`.
- **Manifest.** `public/models/animations/mocap/manifest.json` lists the four clips for both bodies.
- **Slots.** `player/playerAnimationLibrary.jsx` adds four entries to `MOBILITY_PACK_SLOTS`. The placeholders stay in
  the code as the last resort if the pack cannot load. An admin upload for a slot still wins, as before.
- **Tests.** `tests/game3d-locomotion-jump-pack.test.mjs` is new. `tests/game3d-dodge-flight-moments.test.mjs`'s
  pinned pack list grows by these four clips.

## Design, kept inside the game's rules

- **Timing is unchanged.** On a key press the controller lifts the body at once (`JUMP_SPEED` 5.4 m/s, `GRAVITY` 18,
  so 0.6 s in the air with a 0.81 m apex). That is why the take-off has no crouch. It starts mid-extension, legs
  drive to pointed toes in 0.1 s, and the arms swing forward and up on an arc from the shoulder.
- **The landing fits its window.** It absorbs and comes back up within the game's 0.22 s. The fall-landing path
  (`playMontage`) keeps the player busy for the clip's length, so the clip is never longer than the old placeholder.
  Input is never held longer than before.
- **Clips stay in place.** The controller moves the body; the clips never do.

## How they were made

- **Keyframed in Blender 5.2.3, headless**, in the Atom X Eve Animation Studio, outside this repo. Every frame is
  solved with inverse kinematics on a copy of the weapon studio:
  - feet planted for the landing, lifted and pointed in the air;
  - hands turned from their forearms as in the game's own idles.
- **Not captured.** RGB MoCap's commercially licensed GEM-X is not set up yet.
- **Licence trail:** Blender only. The studio's per-clip manifests record it.

## Evidence

- **Studio QA** (measured in Blender on the keyed clips):
  - `Jump_Loop`, `Jump_Land` and `Fall_Loop` pass on both bodies: joint limits, closed loops, planted feet (0.0 mm
    slide), toes above the ground at the game's jump height, hips in place, and hands clear of the head.
  - `Jump_Start` ends exactly on the loop's first pose (0.04°).
  - `Jump_Start` keeps a few QA flags for fast single frames, marked needs-review. On Adam the forearms turn quickly on
    frames 4 and 10. On Eve the legs accelerate fast at frame 7, the start of the tuck.
- **Tests** (Node v26.13.0, run in this worktree):
  - `node --test tests/game3d-locomotion-jump-pack.test.mjs`: 4/4 pass.
  - `node --test tests/game3d-dodge-flight-moments.test.mjs tests/game3d-glide.test.mjs tests/game3d-swimming.test.mjs`:
    40/40 pass.
- **Live in the game** (dev server on this branch, `/gameview?renderer=webgl`, the temporary platform, a new guest
  character on each body). A wrap on three.js's `AnimationAction.play` logged what the player's mixer played after
  Space:

  | Body | Clips played, in order | Tracks | Highest point |
  | --- | --- | --- | --- |
  | Adam (fused-male-v1) | `jumpStart` (0.233 s) at 0 ms, `jumpLoop` at +233 ms, `jumpLand` (0.217 s) at +601 ms, `Stand` at +825 ms | 55 | 0.809 m |
  | Eve (fused-female-v1) | `jumpStart`, `jumpLoop`, `jumpLand`, then `Stand` | 94 | 0.809 m |

  - Every clip carried the studio's `kind` (`jump-start`, `jump-loop`, `jump-land`). The first Space press puts a
    summoned sword away; that is the game's own rule, so the jump is the second press.
  - Frames rendered with the game's renderer during a jump (standing, take-off, airborne, landing, standing again)
    are in the studio at `AnimationAssets/Testing/locomotion/live_jump_male_20261128.png`.

## Limits

- **`Fall_Loop` was not seen live.** The temporary platform is flat, with no edge to fall from. It is checked by the
  tests and the studio previews only.
- **No crouch.** The game's instant take-off leaves no time for one; the arm swing and leg drive carry the read
  instead.
- **Keyframed, not captured.** A GEM-X capture can replace these later through the same slots.
- **Not wired yet:** a landing clip for running (`landRun`) and a separate fall landing (`landIdle`). They are left for
  a later batch, because their length would change how long input is held.

## Undo

Remove the four names from `public/models/animations/mocap/manifest.json`. The game then plays the placeholders again.
