# What the sword skills look like at each mastery tier

Heavy Strike (single hit) and Triple Slash (three hits) each have four visual tiers, chosen from the skill's
mastery level: levels 1 to 3, 4 to 6, 7 to 9, and 10 (`swordSkillComboKind` in `weaponComboClips.js`). Each
tier plays a different set of cuts, taken from the katana techniques (the nine strikes and the moves captured
from the dojo video). Presentation only: damage, cooldowns, hit timing and unlocks are unchanged.
Data: `src/components/game3d/weapons/swordSkillMoves.mjs`.

## Heavy Strike (single hit)

| Tier | Mastery | Look |
| --- | --- | --- |
| 1 | 1 to 3 | Level sweep from the left hip across the body |
| 2 | 4 to 6 | Straight cut: blade over the head, straight down the middle |
| 3 | 7 to 9 | Stepping overhead cut that ends with the point at the ground |
| 4 | 10 | The end of a full turn into a last overhead cut |

## Triple Slash (three hits, half a second apart)

| Tier | Mastery | Look |
| --- | --- | --- |
| 1 | 1 to 3 | Dojo flow: diagonal cut, returning cut, overhead cut |
| 2 | 4 to 6 | Rising gate: up from the right hip, down the same line, straight up |
| 3 | 7 to 9 | Side to side: three level cuts at the waist |
| 4 | 10 | Kneeling storm: turn down to one knee, cut from the knee, cut on the way up |

## Chains: Triple Slash into Heavy Strike

Heavy Strike cast while the third hit plays starts when that cut lets go. Any pair of tiers chains; the body
blends between the two poses. How far apart the joints are at that moment, measured on the real bodies
(rows: Triple Slash tier, columns: Heavy Strike tier, metres):

| | Single 1 | Single 2 | Single 3 | Single 4 |
| --- | --- | --- | --- | --- |
| **Triple 1** | **0.04 to 0.08** | 0.86 | 0.49 | 0.66 |
| **Triple 2** | 0.87 | **0.09** | 0.6 | 0.6 |
| **Triple 3** | 0.47 | 0.63 | 0.6 | 0.6 |
| **Triple 4** | **0.18 to 0.25** | 0.86 | 0.48 | 0.65 |

The three pairs in bold join almost seamlessly:

- Tier 1 into tier 1: the sweep is the very next cut after the overhead cut in the dojo capture. A new
  player has both skills at tier 1, so their first chain is this one.
- Tier 2 into tier 2: the last rising cut ends with the blade overhead, where the straight cut begins.
- Tier 4 into tier 1: the rising cut ends turned to the left with the blade low, where the sweep winds up.

## How it is wired

- The game already chose the tier from mastery and gave each tier its own clip names; the tiers used to be
  small variations of the three basic swings. This supplies real cuts for those clip names.
- The binder bakes them for the weapon in hand. Long two-handed blades hold the hilt with both hands; every
  other sword swings the same cuts with one hand, the other hand guarding.
- A skill hit is shown the moment it is cast, so each clip starts close to its strike: long wind-ups are
  trimmed, and every cut lands within half a second.
- Nothing changed in the player controller or in `GameWorld3D.jsx`.
- The basic attack chain is unchanged (the katana combo on long blades, the game's three hits otherwise).
- The Blade Arts keep the basic combo clips, as before.
