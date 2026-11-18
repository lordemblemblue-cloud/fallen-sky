# Katana techniques and combos

Sword techniques for long two-handed blades (the odachi, and any weapon whose class or id says greatsword,
odachi, katana or tachi). Every other sword keeps the game's own one-handed three hits.

## Where the moves come from

| Source | What it gave | Where it lives |
| --- | --- | --- |
| "9 Basic Katana Strikes" video | Nine numbered strikes, each keyed by hand to cut the way the video's arrow points | `KATANA_STRIKES` in `src/components/game3d/weapons/katanaTechniques.mjs` |
| Rokoko capture of "Katana swords training samurai" | Nine moves with the swordsman's own footwork, hips and timing | `src/components/game3d/weapons/katanaCapturedMoves.mjs` (generated) |
| Rokoko capture of "3 Katana Tricks" | Nothing yet: it is mostly close-ups (guessed legs), a sword toss and a cartwheel | - |
| "Katana combo training" video | Nothing yet: there is no capture of it | - |

## Captured moves

| Move | Capture seconds | What it is |
| --- | --- | --- |
| `dojoDiagonal` | 1.27 - 1.80 | Diagonal cut from the high guard |
| `dojoReturn` | 1.80 - 2.27 | Returning cut across |
| `dojoOverhead` | 2.27 - 3.13 | Up over the head and down |
| `dojoSweep` | 3.13 - 3.60 | Level sweep |
| `dojoSpinToKnee` | 3.60 - 4.70 | A full turn that drops to one knee |
| `dojoKneelingCut` | 4.70 - 5.33 | Cut from one knee |
| `dojoRisingCut` | 5.33 - 5.90 | Cut on the way back up |
| `dojoLeapingCut` | 5.90 - 6.87 | Stepping overhead cut |
| `dojoSpinningFinish` | 6.87 - 8.17 | A full turn into a last overhead cut |

## Combos

Each is three hits and plays through the controller's existing three-hit sword chain
(`swordCombo1` .. `swordCombo3`). `KATANA_DEFAULT_COMBO` says which one a long blade swings.

| Combo | Hits | Built from |
| --- | --- | --- |
| `dojoFlow` (default) | diagonal, returning cut, overhead | capture |
| `kneelingStorm` | spin to one knee, kneeling cut, rising cut | capture |
| `leapingFinish` | returning cut, stepping overhead, spinning finish | capture |
| `kesaFlow` | strikes 3, 9, 1 | nine strikes |
| `crossingCuts` | strikes 2, 8, 3 | nine strikes |
| `risingGate` | strikes 7, 2, 8 | nine strikes |
| `sideToSide` | strikes 4, 5, 4 | nine strikes |

## How a capture becomes a move

The game does not play a capture bone for bone. The combo baker (`weaponComboClips.js`) poses each body from
keys in body space and solves the hands onto the held weapon's grip. `tools/game3d-mocap` measures the
capture in those terms, and the baker fits the result to each body with both hands on the hilt. See
`tools/game3d-mocap/README.md` for the steps.

What the baker learned for this: moves can be passed in; a second hand on the hilt; hips that travel over
planted feet; each foot and knee placed by the key; where the head looks; closely spaced keys played as
they are. The game's own sword and bow combos bake exactly as before.

## Known limits

- The blade's line is read from the two wrists, which a video capture tracks to a couple of centimetres.
  It is the least certain part of a captured move.
- A captured combo travels up to about half a metre from the character's spot while it plays, then the
  body returns to its spot when the combo ends.
- Flips and cartwheels are not covered: the baker keeps the feet on the ground.
- Not yet seen in the game. Checked by baking every move on the real female and male bodies with the odachi
  (`tests/game3d-katana-captured-moves-real-three.test.mjs`).
