# Attacks and the bow as montages over locomotion, reverse-grip daggers, the bow while running (2026-11-19)

Branch `claude/weapon-montage-20261119`, from `main` ab603e4. Owner feedback after playing main, in short:
attacks are not animation montages and have no locomotion, they do not blend; daggers belong in a reverse
grip with the thumb on the hilt, in both hands; running with the bow puts it through the body (it should be
held down and a little away from the body); holding the aim should draw and hold, letting go should play the
shot, and every shot of a multi-shot should play its own shot.

## What changed

### Montages over locomotion (`player/locomotionUnderlay.js`, `player/LunaDashboardPlayerController.jsx`)

Weapon swings (every family's combo, the sword skills' tier clips) and the bow's draw, hold and shots still
play as the controller's states, but they are montages now:

- **Moving is allowed** through a swing or a shot (`isMovementOverridden` is false while a combo action plays).
  Dodges, hit reactions, jumps and the unarmed kick / punch keep their own lock.
- **The legs keep the gait.** After `mixer.update`, `playerAnim.lateUpdate(delta)` puts the hips and legs back
  on the walk / run the player is moving with, sampled at that cycle's own phase, and turns the first spine
  bone so the chest keeps the swing's facing (`CHEST_FOLLOWS_HIPS` = 0.25 of the hips' sway). Standing still,
  the swing keeps its own planted stance. Only bones the montage's clip animates are written, so the mixer
  rewrites all of them next frame.
- **Blending:** a swing blends in over 0.1 s from the walk / idle (0.06 s between hits of a chain) and hands
  back over 0.2 s; the legs take over / hand back the stance over 0.14 s when moving starts or stops; the walk
  that takes over after a swing continues the stride the legs kept under it (`MONTAGE_BLEND`).
- `syncFusedLocomotion` also times the gait under a montage (`getGait`), so the feet step at ground speed.

### The bow: hold to draw, let go to shoot (`weapons/weaponComboClips.js` `BOW_SHOTS`)

| Clip | Length | What | Timing |
|---|---|---|---|
| `bowDraw` | 0.45 s | ready -> nock -> full draw | arrow on the string at 0.16 s, full at 0.45 s |
| `bowHold` | 1.6 s loop | full draw, a slow breath | seamless loop |
| `bowRelease` | 0.5 s | looses from the hold, string hand flicks back, follow-through, lowers | arrow at 0 s, cancel 0.16 s |
| `bowQuick` | 0.42 s | draw and loose in one motion | nock 0.07, full 0.18, arrow 0.2, cancel 0.22 s |

- Holding the left button (or the right-button aim) with a bow draws and then holds at full draw for as long
  as it is held, over the walk / run when moving. A dismissed bow is summoned with the press.
- Letting go plays `bowRelease` from the hold. Let go before full draw, the shot is a `bowQuick` that carries
  on from the same point of its faster draw. Aim let go without a shot: the draw waits 0.22 s, then lowers.
- Every arrow plays its own shot: skill arrows queue one shot each (Double Shot's 0.2 s and Barrage's 0.3 s
  spacing keep pace: a chained quick shot starts from the nock and takes 0.15 s). With the aim still held
  after a shot, the next draw starts from the nock at the shot's cancel point (the bow stays up).
- While drawn, the runtime nocks an arrow and pulls the string to the drawing hand (`getBowDrawing`); the
  arrow in flight is still the clone's `bowVisuals` arrow, fired with the shot.
- Other players' avatars play `bowRelease` / `bowQuick` with the stand-in bow; the held draw shows as idle there.

### The bow while running and sprinting (`BOW_RUN_CARRY_ARM`, `bowRunCarry`)

Running and sprinting with a bow hold it like this: the arm hangs a little out from the hip, the bow pointing
forward and down away from the legs, gripped like a drawn bow (combat grip). Walking is unchanged. The baked
`bowRunCarry` pose says where: each frame the bow arm is solved with two-bone IK so the hand sits where that pose
puts it relative to the hips, the bow turned as in the pose, both in the body's frame
(`locomotionUnderlay.overlayArm`). However far the gait leans or twists the chest, the hand rides with the hips
(1-5 cm of drift) instead of swinging with the stride. Measured over the whole cycle against the body (torso
and leg capsules), both fused bodies:

| Gait | The gait's own arm (before) | Carried |
|---|---|---|
| Run (the body's own, Shift) | 8-9 cm into the torso | 10.3-14.5 cm clear |
| Sprint (the port's longbow-pack run, Ctrl) | 8.5-12 cm into the hips | 12.0-12.5 cm clear |

## Merged with the player/mount animation port

`claude/port-player-mount-animation-20261119` (1b766da: dodges, sprint and the mobility clip pack, skill-cast and
level-up moments, Roll dodges setting, re-rigged Faction 3 tiger, animation preview harness) is merged into this
branch (owner: "Yes, fold it in"), so the open PRs merge in any order. The one conflict was the controller's
imports (both kept). With the port's clips:

- a swing or the held draw over the new Sprint: the legs keep the sprint cycle (`getGait` = `sprint`, timed by
  `syncFusedLocomotion`, which now covers `sprint`);
- the bow carry while sprinting: the chest-relative carry swung the bow 6-10 cm into the body over the Sprint,
  hence the hips-relative IK above;
- dodges cut a swing as on `main`: not during the strike (the swing is busy), from its recovery when moving;
- the port does not touch the weapons, grips or dagger poses; its skill-cast / level-up gesture layer runs late
  in the frame, after the legs pass, and gives its bones back before the mixer.

### Daggers in a reverse grip (`weapons/weaponGripMath.js`, `weapons/playerWeaponRuntime.js`)

- New grip class `dagger` (`reverse`): the blade leaves the fist on the little-finger side and runs back along
  the forearm (tilt 55 degrees combat, 58 carry), edge away from the forearm, in both hands
  (`equipDaggers`, the binder's default bake and the riding test).
- `solveThumbCap` lays each thumb on the pommel's end (live: 1.3-1.4 cm from it).
- The dagger moves are re-authored for the grip: a guard with both fists up and the blades along the forearms
  (a key's `forearm` option lays the blade along the forearm as placed on each body; 9 degrees off it, wrist
  bent ~26 degrees), hook slashes left and right, and a hammer stab (a reverse grip cannot lead with the
  point, so the fist drives down and forward, point down). Timing unchanged (0.33 / 0.37 / 0.43 s, contact
  0.12 / 0.15 / 0.18 s).
- Riding: the free dagger points back down along the forearm, down for a strike (`RIDING_WEAPON_AIMS`).

## Checks

- `tests/game3d-weapon-montage.test.mjs` (17, both fused bodies): reverse grip in both hands and stances,
  thumb on the pommel, blades along the forearms in the guard; the draw reaches the string and holds at full
  draw, the hold / release / quick shot share the full-draw pose, the hold loops seamlessly; the bow clears the
  body over the whole Run and Sprint while carried (and goes into it with the gaits' own arms), the hand riding
  with the hips; the underlay's legs, phase and chest; the real controller on a real body with the game's clip
  binding (its gaits, the pack's sprint, the generated dodges): a swing over the walk (legs within 1 degree of
  the walk, no leg snapping in or out, movement allowed) and over the sprint, a standing swing keeps its
  stance, a dodge cuts a swing as on main, the bow's draw / hold / release / redraw / early release /
  multi-shot queue, the running and sprinting carry and the draw over a sprint.
- Updated: `game3d-weapon-feel` (daggers baked with the reverse grip: hooks, hammer stab, blades down in the
  guard; the bow family's bake list), `game3d-riding-weapons` (reverse-grip daggers).
- Whole suite (`node --test --test-reporter=tap tests/`), compared by test name: this branch with the port
  merged 1141 tests, 84 failing; `main` ab603e4 1107 / 84; the port branch alone 1124 / 84; this branch before
  the merge 1122 / 84. The same 84 fail on all four.
- Live on `/gameview` (my own tab, the game's sound muted): a sword click while walking (W held) plays
  `swordCombo1` while the character keeps walking (never blocked), the legs on the walk, blending in and back
  out; a dagger slash the same; the daggers' guard in the reverse grip (close-up render); the bow: holding the
  left button -> `bowDraw` (arrow nocked) -> `bowHold` for as long as it is held; letting go -> `bowRelease`
  (arrow gone) -> the bow stance; running with the bow -> the carry pose (combat grip); drawing while running
  holds the draw over running legs at full speed.
- Live after the merge: a sword swing while sprinting (Ctrl+W) plays over the Sprint's legs at sprint speed and
  the sprint carries on; a double-tap A during the strike does not dodge (the swing finishes), once free it
  plays `dodgeStepLeft`; sprinting with the bow carries it 12.5 cm clear of the body; drawing while sprinting
  holds the draw over sprinting legs, letting go shoots.

## Limits

- Other players' avatars still play swings full-body (their legs do not keep walking under a swing); the
  network carries one animation name.
- The fused bodies have no strafe or back-walk clips here (the owner's uploaded aim-walk pack is not in this
  repository), so strafing while aiming walks forward with the legs, as before.
- Aiming does not slow the player (unchanged).
- The bow carry is posed for a bow in the left hand (all pack bows are).
- A test character "MontageCheck" was created in the browser pane for the dev origin 127.0.0.1:5310 only.
