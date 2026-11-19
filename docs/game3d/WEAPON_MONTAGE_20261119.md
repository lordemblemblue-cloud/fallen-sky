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

### The bow while running (`BOW_RUN_CARRY_ARM`, `bowRunCarry`)

Running (and sprinting, which plays the run clip on the fused bodies) with a bow lays a baked bow-arm pose over
the run: the arm hangs a little out from the hip, the bow pointing forward and down away from the legs, gripped
like a drawn bow (combat grip). Walking is unchanged. Measured over the whole run cycle against the body
(torso and leg capsules): before, the run's own arm swung the bow 8-9 cm into the torso on both bodies; now it
stays 5.0 cm clear on the female body (thigh) and 7.9 cm on the male (torso), live 7.9 cm too.

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

- `tests/game3d-weapon-montage.test.mjs` (15, both fused bodies): reverse grip in both hands and stances,
  thumb on the pommel, blades along the forearms in the guard; the draw reaches the string and holds at full
  draw, the hold / release / quick shot share the full-draw pose, the hold loops seamlessly; the bow clears the
  body over the whole run while carried (and goes into it with the plain run arm); the underlay's legs, phase
  and chest; the real controller on a real body: a swing over the walk (legs within 1 degree of the walk, no
  leg snapping in or out, movement allowed), a standing swing keeps its stance, the bow's draw / hold /
  release / redraw / early release / multi-shot queue, the running carry and the draw over a run.
- Updated: `game3d-weapon-feel` (daggers baked with the reverse grip: hooks, hammer stab, blades down in the
  guard; the bow family's bake list), `game3d-riding-weapons` (reverse-grip daggers).
- Whole suite (`node --test --test-reporter=tap tests/`): branch 1122 tests, 84 failing; `main` ab603e4 1107
  tests, 84 failing; the same 84 by name.
- Live on `/gameview` (my own tab, the game's sound muted): a sword click while walking (W held) plays
  `swordCombo1` while the character keeps walking (never blocked), the legs on the walk, blending in and back
  out; a dagger slash the same; the daggers' guard in the reverse grip (close-up render); the bow: holding the
  left button -> `bowDraw` (arrow nocked) -> `bowHold` for as long as it is held; letting go -> `bowRelease`
  (arrow gone) -> the bow stance; running with the bow -> the carry pose (combat grip), 7.9 cm clear of the
  body; drawing while running holds the draw over running legs at full speed.

## Limits

- Other players' avatars still play swings full-body (their legs do not keep walking under a swing); the
  network carries one animation name.
- The fused bodies have no strafe or back-walk clips here (the owner's uploaded aim-walk pack is not in this
  repository), so strafing while aiming walks forward with the legs, as before.
- Aiming does not slow the player (unchanged).
- The bow carry is posed for a bow in the left hand (all pack bows are).
- A test character "MontageCheck" was created in the browser pane for the dev origin 127.0.0.1:5310 only.
