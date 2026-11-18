# What the sword skills look like

The sword's single-hit skills and three-hit skills each play their own cuts, a different set per level,
instead of the three basic combo clips. Presentation only: damage, cooldowns, hit timing and unlocks are
unchanged. Data: `src/components/game3d/weapons/swordSkillMoves.mjs`.

## Single hit

| Level | Game skill | Look |
| --- | --- | --- |
| 1 | Heavy Strike (`sword_heavy_strike`), Blade Art 2 | Straight cut: blade over the head, straight down the middle |
| 2 | Blade Art 4 (tree: Heavy Slash) | Level sweep from the left hip across the body |
| 3 | Blade Art 6 (tree: Execution Cut) | Stepping overhead cut that ends with the point at the ground |
| 4 | Blade Art 9 (divine single) | The end of a full turn into a last overhead cut |

## Three-hit multi

| Level | Game skill | Hits apart | Look |
| --- | --- | --- | --- |
| 1 | Triple Slash (`sword_triple_slash`) | 0.50 s | Dojo flow: diagonal cut, returning cut, overhead cut |
| 2 | Blade Art 5 (tree: Rising Flurry) | 0.17 s | Rising gate: up from the right hip, down the same line, straight up |
| 3 | Blade Art 10 (tree: Storm Flurry) | 0.22 s | Side to side: three level cuts at the waist |
| 4 | none yet | 0.50 s | Kneeling storm: turn down to one knee, cut from the knee, cut on the way up |

There is no fourth three-hit sword skill in the game, so the level 4 multi is built and baked but no skill
plays it. To give it to a skill, add that skill's id to `SWORD_SKILL_LOOKS`.

## Chains: a multi into a single hit

A single hit cast right after a multi starts when the multi's last cut lets go. How far the body is from the
single's first pose at that moment, measured on the real bodies:

| Chain | Joints apart | |
| --- | --- | --- |
| Level 1 multi into level 2 single | 4 to 8 cm | The sweep is the very next cut in the dojo capture |
| Level 2 multi into level 1 single | 9 cm | The blade is already overhead |
| Level 4 multi into level 3 single | about 0.5 m | Close, not seamless: the stepping cut's wind-up is trimmed |
| Level 1 multi into level 3 single | about 0.5 m | Close, not seamless |

Any other pair still plays; the body blends between the two poses.

## How it is wired

- A skill hit is shown the moment it is cast, so each clip starts close to its strike: long wind-ups are
  trimmed, and every cut lands within half a second.
- The three hits of a multi are three clips, one per hit, because the game sends each hit on its own. Each
  is free to be replaced when the next hit arrives.
- Long two-handed blades hold the hilt with both hands. Every other sword swings the same cuts with one
  hand, the other hand guarding.
- The player controller plays the skill's clip in place of the combo clip that hit would have used, and still
  reports that combo state outside (`getCurrent`, `getComboState`, combo events). So the weapon grip, the
  trails and what other players see are as before: other players see the three basic combo clips.
- The basic attack chain is unchanged.
