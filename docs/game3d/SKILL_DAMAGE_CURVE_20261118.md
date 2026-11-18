# Skill damage curve (optional balance setting)

**Off by default. With the setting off the game is unchanged: every skill hits for exactly the number it hits for today.**
Implements decision 9 of `BLACKSMITH_COMBAT_V2_AUDIT_20261118.md` (approved by the owner: "Yes, use them") and section 6 of the owner's Blacksmith + combat handoff.
Skill XP, mastery levels, unlocks, cooldowns, costs, the Skill Book and the duel server are not touched.

## The rule

With the setting on, the per-hit damage multiplier of a sword, bow or dagger skill at skill level `L` is

```
damage_pct(L) = min × M
t = clamp((L − 1) / (max_level − 1), 0, 1)
M = 1 + cap × (0.65 t + 0.35 t²)
```

`min` is the skill's level-1 value in the registry (`scaling.damage_pct.min`). At level 1, M = 1, so level 1 is unchanged; at the max level the skill hits for `min × (1 + cap)`.
The curve **replaces** the linear growth from `min` to `max` that `scaleStat` gives today; the registry's `max` is not used while it is on. It is never applied on top of it.

| Family | Skills (`weapon_type`) | Cap |
|---|---|---:|
| Sword | `sword` | +40% |
| Bow | `ranged` | +35% |
| Daggers | `guardian`, only while daggers are the held weapon | +30% |

- "Daggers" are the weapons whose mastery id is `dual_blades`, read from the weapon in hand (`getActiveWeaponId()`, which takes the inventory as its authority). Guardian skills can also be cast with other guardian-type weapons such as a shield; with those they keep the linear growth.
- A cast remembers the weapon it started with, so swapping weapons mid-cast does not change the hits already on their way.
- It covers every registered damage skill of those three families: the six original weapon skills (max level 10), the Blade, Ranged and Guardian Arts and the three Aerial Arts (max level 30). Buffs and passives have no `damage_pct` and are untouched.

## The setting

`SKILL_DAMAGE_CURVE_CONFIG` in `src/components/game3d/skills/skillDamageCurve.mjs`:

```js
{
  enabled: false,                                   // the balance setting
  familyCaps: { sword: 0.40, ranged: 0.35, guardian: 0.30 },
  guardianWeaponIds: ['dual_blades'],               // guardian skills curve only with these in hand
  skillCaps: {},                                    // per-skill cap, e.g. { sword_heavy_strike: 0.45 }
}
```

- **Per-skill cap:** `skillCaps: { sword_heavy_strike: 0.45 }` replaces the family cap for that skill. `null` keeps that one skill on the linear growth; a family cap of `null` does the same for the whole family. Anything that is not a number ≥ 0 counts as `null`. A cap of `0` is a real cap: the skill stays flat at its level-1 value. Guardian skills still need a listed weapon.
- The "Today's growth" column below is the cap that would keep each skill's present maximum.

To turn it on for a playtest, highest first:

1. On a developer machine (a dev build, or `localhost`): open the game with `?skillCurve=1` (back with `?skillCurve=0`). The choice is remembered in the browser (`axe_skill_damage_curve_v1`).
2. A build flag: `VITE_GAME3D_SKILL_DAMAGE_CURVE=true` (or `false`).
3. `enabled: true` in the config, once the balance review approves it.

A live site never reads the address or the browser storage for this. While the curve is on, the console prints one `[skill damage curve] ON …` line per page load.

Files: `skills/skillDamageCurve.mjs` (new: the rules, the config and the setting), `skills/skillRegistry.jsx` (adds `scaleSkillDamage`), `skills/skillExecutor.jsx` (`dispatchStrike` calls it; `castSkill` remembers the held weapon), `tests/game3d-skill-damage-curve.test.mjs`, `tools/game3d-skill-damage-curve/print-damage-table.mjs` and this doc.

## Where it is applied (one point)

`scaleSkillDamage(skill, level, heldWeapon)` in `skillRegistry.jsx` is the only place a skill's level turns into damage, and `dispatchStrike` in `skillExecutor.jsx` is its only caller. With the setting off it returns `scaleStat(skill, 'damage_pct', level)` itself, so the number is identical to before.

Everything after that point multiplies other things (mount echo scale, Ascension, the charged-cast multipliers, the skill-point charge bonus, the channel pulse), never the level again. The strike event goes through `CombatActionQueue` (which only caps it at 20) to `resolveAXEHeroStrike` / `computeAXESwing`, which take `skillMultiplier` as given. The tests check that no other file calls `scaleSkillDamage` and that the executor never reads `damage_pct` itself.

What it does not reach:

- **Duels.** The duel server prices every skill from its own table (`base44/shared/duelComboPolicy.mjs`, the level-1 values) and ignores the multiplier the client sends, so PvP damage is the same with the setting on or off. Nothing has to be deployed on the Base44 side.
- **The Skill Book and the other skill screens.** They call `scaleStat` themselves and were out of scope, so while the setting is on they keep showing today's linear numbers and will not match combat (by the Δ columns below). Making them follow is a small follow-up; the guardian skills would need the held weapon passed in.
- Weapon base stats, basic attacks, bow charge, headshots, crits, buffs and passives.
- Mount-soul echoes are not excluded: they scale the skill's base number like the skill's own hits, so they follow the curve.

## Before and after

Damage multiplier per hit, **before → after**, at skill levels 1, 5 and 10.

### Weapon skills (max level 10)

| Skill | Weapon | Hits | Cap | Today's growth | Level 1 | Level 5 | Level 10 | Δ level 5 | Δ level 10 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Heavy Strike (`sword_heavy_strike`) | Sword | 1 | +40% | +38.5% | 130.0% → 130.0% | 152.2% → 148.6% | 180.0% → 182.0% | −2.4% | +1.1% |
| Triple Slash (`sword_triple_slash`) | Sword | 3 | +40% | +33.3% | 90.0% → 90.0% | 103.3% → 102.9% | 120.0% → 126.0% | −0.4% | +5.0% |
| Double Shot (`ranged_double_shot`) | Bow | 2 | +35% | +36.4% | 110.0% → 110.0% | 127.8% → 123.8% | 150.0% → 148.5% | −3.1% | −1.0% |
| Barrage (`ranged_barrage`) | Bow | 5 | +35% | +37.5% | 80.0% → 80.0% | 93.3% → 90.0% | 110.0% → 108.0% | −3.5% | −1.8% |
| Crushing Blow (`guardian_crushing_blow`) | Daggers (guardian) | 1 | +30% | +41.7% | 120.0% → 120.0% | 142.2% → 132.9% | 170.0% → 156.0% | −6.6% | −8.2% |
| Twin Fang Combo (`guardian_twin_fang`) | Daggers (guardian) | 4 | +30% | +22.2% | 90.0% → 90.0% | 98.9% → 99.7% | 110.0% → 117.0% | +0.8% | +6.4% |

### Total multiplier of one cast (all hits added up)

| Skill | Hits | Cooldown | Level 1 | Level 5 | Level 10 |
|---|---:|---:|---:|---:|---:|
| Heavy Strike | 1 | 4s | 130.0% → 130.0% | 152.2% → 148.6% | 180.0% → 182.0% |
| Triple Slash | 3 | 8s | 270.0% → 270.0% | 310.0% → 308.7% | 360.0% → 378.0% |
| Double Shot | 2 | 4s | 220.0% → 220.0% | 255.6% → 247.6% | 300.0% → 297.0% |
| Barrage | 5 | 10s | 400.0% → 400.0% | 466.7% → 450.1% | 550.0% → 540.0% |
| Crushing Blow | 1 | 4s | 120.0% → 120.0% | 142.2% → 132.9% | 170.0% → 156.0% |
| Twin Fang Combo | 4 | 8s | 360.0% → 360.0% | 395.6% → 398.7% | 440.0% → 468.0% |

### Martial ladder and aerial skills (max level 30)

| Skill | Weapon | Hits | Cap | Today's growth | Level 1 | Level 5 | Level 10 | Level 30 | Δ level 10 | Δ level 30 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Blade Art 1 (`axe_offensive_skill_1`) | Sword | 2 | +40% | +35.7% | 70.0% → 70.0% | 73.4% → 72.7% | 77.8% → 76.6% | 95.0% → 98.0% | −1.5% | +3.2% |
| Blade Art 2 (`axe_offensive_skill_2`) | Sword | 1 | +40% | +33.3% | 120.0% → 120.0% | 125.5% → 124.6% | 132.4% → 131.3% | 160.0% → 168.0% | −0.8% | +5.0% |
| Blade Art 3 (`axe_offensive_skill_3`) | Sword | 1 | +40% | +36.8% | 95.0% → 95.0% | 99.8% → 98.7% | 105.9% → 103.9% | 130.0% → 133.0% | −1.8% | +2.3% |
| Blade Art 4 (`axe_offensive_skill_4`) | Sword | 1 | +40% | +34.5% | 145.0% → 145.0% | 151.9% → 150.6% | 160.5% → 158.7% | 195.0% → 203.0% | −1.2% | +4.1% |
| Blade Art 5 (`axe_offensive_skill_5`) | Sword | 3 | +40% | +41.7% | 72.0% → 72.0% | 76.1% → 74.8% | 81.3% → 78.8% | 102.0% → 100.8% | −3.1% | −1.2% |
| Blade Art 6 (`axe_offensive_skill_6`) | Sword | 1 | +40% | +32.4% | 170.0% → 170.0% | 177.6% → 176.5% | 187.1% → 186.0% | 225.0% → 238.0% | −0.6% | +5.8% |
| Blade Art 7 (`axe_offensive_skill_7`) | Sword | 4 | +40% | +47.1% | 68.0% → 68.0% | 72.4% → 70.6% | 77.9% → 74.4% | 100.0% → 95.2% | −4.5% | −4.8% |
| Blade Art 8 (`axe_offensive_skill_8`) | Sword | 1 | +40% | +36.4% | 165.0% → 165.0% | 173.3% → 171.4% | 183.6% → 180.5% | 225.0% → 231.0% | −1.7% | +2.7% |
| Blade Art 9 (`axe_offensive_skill_9`) | Sword | 1 | +40% | +39.5% | 215.0% → 215.0% | 226.7% → 223.3% | 241.4% → 235.2% | 300.0% → 301.0% | −2.5% | +0.3% |
| Blade Art 10 (`axe_offensive_skill_10`) | Sword | 3 | +40% | +47.6% | 105.0% → 105.0% | 111.9% → 109.0% | 120.5% → 114.9% | 155.0% → 147.0% | −4.7% | −5.2% |
| Offensive Aerial Art (`axe_offensive_a_skill`) | Sword | 1 | +40% | +48.5% | 165.0% → 165.0% | 176.0% → 171.4% | 189.8% → 180.5% | 245.0% → 231.0% | −4.9% | −5.7% |
| Ranged Art 1 (`axe_ranged_skill_1`) | Bow | 2 | +35% | +35.7% | 70.0% → 70.0% | 73.4% → 72.4% | 77.8% → 75.8% | 95.0% → 94.5% | −2.6% | −0.5% |
| Ranged Art 2 (`axe_ranged_skill_2`) | Bow | 1 | +35% | +33.3% | 120.0% → 120.0% | 125.5% → 124.0% | 132.4% → 129.9% | 160.0% → 162.0% | −1.9% | +1.2% |
| Ranged Art 3 (`axe_ranged_skill_3`) | Bow | 1 | +35% | +36.8% | 95.0% → 95.0% | 99.8% → 98.2% | 105.9% → 102.8% | 130.0% → 128.3% | −2.9% | −1.3% |
| Ranged Art 4 (`axe_ranged_skill_4`) | Bow | 1 | +35% | +34.5% | 145.0% → 145.0% | 151.9% → 149.9% | 160.5% → 156.9% | 195.0% → 195.8% | −2.2% | +0.4% |
| Ranged Art 5 (`axe_ranged_skill_5`) | Bow | 3 | +35% | +41.7% | 72.0% → 72.0% | 76.1% → 74.4% | 81.3% → 77.9% | 102.0% → 97.2% | −4.2% | −4.7% |
| Ranged Art 6 (`axe_ranged_skill_6`) | Bow | 1 | +35% | +32.4% | 170.0% → 170.0% | 177.6% → 175.7% | 187.1% → 184.0% | 225.0% → 229.5% | −1.6% | +2.0% |
| Ranged Art 7 (`axe_ranged_skill_7`) | Bow | 4 | +35% | +47.1% | 68.0% → 68.0% | 72.4% → 70.3% | 77.9% → 73.6% | 100.0% → 91.8% | −5.6% | −8.2% |
| Ranged Art 8 (`axe_ranged_skill_8`) | Bow | 1 | +35% | +36.4% | 165.0% → 165.0% | 173.3% → 170.6% | 183.6% → 178.6% | 225.0% → 222.8% | −2.7% | −1.0% |
| Ranged Art 9 (`axe_ranged_skill_9`) | Bow | 1 | +35% | +39.5% | 215.0% → 215.0% | 226.7% → 222.2% | 241.4% → 232.7% | 300.0% → 290.3% | −3.6% | −3.3% |
| Ranged Art 10 (`axe_ranged_skill_10`) | Bow | 3 | +35% | +47.6% | 105.0% → 105.0% | 111.9% → 108.5% | 120.5% → 113.7% | 155.0% → 141.8% | −5.7% | −8.5% |
| Ranged Aerial Art (`axe_ranged_a_skill`) | Bow | 1 | +35% | +48.5% | 165.0% → 165.0% | 176.0% → 170.6% | 189.8% → 178.6% | 245.0% → 222.8% | −5.9% | −9.1% |
| Guardian Art 1 (`axe_defensive_skill_1`) | Daggers (guardian) | 2 | +30% | +35.7% | 70.0% → 70.0% | 73.4% → 72.0% | 77.8% → 74.9% | 95.0% → 91.0% | −3.6% | −4.2% |
| Guardian Art 2 (`axe_defensive_skill_2`) | Daggers (guardian) | 1 | +30% | +33.3% | 120.0% → 120.0% | 125.5% → 123.5% | 132.4% → 128.5% | 160.0% → 156.0% | −3.0% | −2.5% |
| Guardian Art 3 (`axe_defensive_skill_3`) | Daggers (guardian) | 1 | +30% | +36.8% | 95.0% → 95.0% | 99.8% → 97.7% | 105.9% → 101.7% | 130.0% → 123.5% | −3.9% | −5.0% |
| Guardian Art 4 (`axe_defensive_skill_4`) | Daggers (guardian) | 1 | +30% | +34.5% | 145.0% → 145.0% | 151.9% → 149.2% | 160.5% → 155.2% | 195.0% → 188.5% | −3.3% | −3.3% |
| Guardian Art 5 (`axe_defensive_skill_5`) | Daggers (guardian) | 3 | +30% | +41.7% | 72.0% → 72.0% | 76.1% → 74.1% | 81.3% → 77.1% | 102.0% → 93.6% | −5.2% | −8.2% |
| Guardian Art 6 (`axe_defensive_skill_6`) | Daggers (guardian) | 1 | +30% | +32.4% | 170.0% → 170.0% | 177.6% → 174.9% | 187.1% → 182.0% | 225.0% → 221.0% | −2.7% | −1.8% |
| Guardian Art 7 (`axe_defensive_skill_7`) | Daggers (guardian) | 4 | +30% | +47.1% | 68.0% → 68.0% | 72.4% → 70.0% | 77.9% → 72.8% | 100.0% → 88.4% | −6.6% | −11.6% |
| Guardian Art 8 (`axe_defensive_skill_8`) | Daggers (guardian) | 1 | +30% | +36.4% | 165.0% → 165.0% | 173.3% → 169.8% | 183.6% → 176.7% | 225.0% → 214.5% | −3.8% | −4.7% |
| Guardian Art 9 (`axe_defensive_skill_9`) | Daggers (guardian) | 1 | +30% | +39.5% | 215.0% → 215.0% | 226.7% → 221.2% | 241.4% → 230.2% | 300.0% → 279.5% | −4.6% | −6.8% |
| Guardian Art 10 (`axe_defensive_skill_10`) | Daggers (guardian) | 3 | +30% | +47.6% | 105.0% → 105.0% | 111.9% → 108.0% | 120.5% → 112.4% | 155.0% → 136.5% | −6.7% | −11.9% |
| Defensive Aerial Art (`axe_defensive_a_skill`) | Daggers (guardian) | 1 | +30% | +48.5% | 165.0% → 165.0% | 176.0% → 169.8% | 189.8% → 176.7% | 245.0% → 214.5% | −6.9% | −12.4% |


Δ is `after ÷ before − 1`. The "Daggers (guardian)" rows are with daggers in hand; with any other weapon those skills show their "before" number. Regenerate the tables from the real registry and curve code after any retuning: `node tools/game3d-skill-damage-curve/print-damage-table.mjs`.

### Reading the numbers

- **Level 1 is identical** for every skill.
- **The curve is back-loaded.** It sits below the straight line between level 1 and the max level, so most skills do a little less than today in the middle of their levels and only reach their cap at the top. At level 5 the six original skills move from −0.4% (Triple Slash) to −6.6% (Crushing Blow), except Twin Fang Combo (+0.8%). Across all 1,050 skill levels of the three families the curve is above today in only 93.
- **Maximum level.** The six original skills end between −8.2% (Crushing Blow) and +6.4% (Twin Fang Combo). The largest increase anywhere, at any level of any skill, is +6.4% (Twin Fang Combo, level 10), so at any skill level a gear stack gets at most 6.4% more from the skill multiplier than it does today. The largest decrease is −12.4% (Defensive Aerial Art, level 30).
- **The caps are below what many skills grow today.** Crushing Blow grows +41.7% today against a +30% dagger cap, and the ladder and Aerial Arts grow up to +48.5%, so daggers lose the most. Ladder skills at level 30: sword −5.7% … +5.8%, bow −9.1% … +2.0%, daggers −12.4% … −1.8%; 10 of the 33 are stronger. `skillCaps` can restore any one of them: use its "Today's growth" value as that skill's cap.

## Verification

- `node --test tests/game3d-skill-damage-curve.test.mjs`: **17 of 17** pass. They cover:
  - the pure rules: the formula and its clamps, the caps, the dagger rule, per-skill overrides, junk values, and the order in which the setting is read;
  - the real registry: OFF returns exactly `scaleStat` for every skill at every level (including 0, NaN and past the max) with every held weapon; ON keeps level 1, reaches `min × (1 + cap)` at the max level, never loses damage by levelling up and stays within its cap; guardian skills curve only with daggers;
  - a real `castSkill` through the real executor and weapon inventory (bundled with esbuild and run with fake timers): OFF hands combat today's linear multiplier on every hit of the six original skills, ON hands it `min × M` exactly once per hit, a dagger is read from the weapon in hand and a shield is not, and a weapon swap mid-cast does not change the hits;
  - one application point: a source scan.
- Mutation check, each breakage made on a copy and then reverted: double scaling in the registry, a second scaling after the point in the executor, default `enabled: true`, no dagger rule, no cast-time weapon capture, wrong curve coefficients. Every one fails at least one test.
- Full suite, `node --test --test-reporter=tap tests/`: this branch **973 tests, 882 pass, 91 fail**; `origin/main` (`67f1d36`) **956 tests, 865 pass, 91 fail**. The 91 failing test names are identical on both: no new failure, none fixed. The 17 new tests are the difference.
- ESLint on the changed files: no errors (one existing `no-unused-vars` warning in `skillExecutor.jsx`, also on `main`).
- **Not done:** a browser playtest with the setting on, and `vite build` (the changed modules are bundled with esbuild in the tests).

## Open balance questions for the review

1. **Back-loaded shape.** A player part-way through a skill's levels does slightly less damage with the curve than today. Is that wanted?
2. **Dagger cap.** +30% is below what most guardian skills grow today (Crushing Blow +41.7%, Guardian Art 10 +47.6%). Keep it, or give the biggest ones a `skillCaps` entry?
3. **Scope of the first playtest.** All 39 damage skills follow their family cap. To curve only the six original skills first, set the 33 ladder and Aerial Art ids to `null` in `skillCaps`.
4. **Skill Book.** Should it show the curved numbers while the setting is on? That needs the held weapon for the guardian skills.
5. **Gear-level review.** The handoff also asks for DPS, burst, AoE, headshot, crit, armor/dodge, PvP and enemy-level checks with Rare, Elite and Legendary gear at combine 0/+12, enchant 0/200 and Ascension 0/+4. That is not done here. This change only reshapes the per-skill multiplier by the percentages above, and replaces the linear growth instead of stacking on it, but a hit-level comparison with real gear still needs a playtest pass.
