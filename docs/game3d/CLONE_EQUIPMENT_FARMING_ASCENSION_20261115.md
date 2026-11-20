# Game 3D clone — Rare / Elite / Legendary farming and feeding Ascension

> **Superseded (2026-11-18):** Blacksmith v2 replaced the feeding (1/2/3/4 donors per rank, level
> skips) with one donor per attempt and fixed odds, and removed the +4 virtual skill levels. See
> [BLACKSMITH_V2_20261118.md](BLACKSMITH_V2_20261118.md). The farming tiers and prestige names are unchanged.

## Owner's final rarity map

| Grade | World-enemy unlock | Actual generated item-level milestones |
|---|---:|---|
| Rare | 50 | 50 (Lv50–79), 80 (Lv80–119), 120 (Lv120+) |
| Elite | 110 | 110 (Lv110–119), 120 (Lv120–129), 130 (Lv130–139), 140 (Lv140+) |
| Legendary | 135 | 135 (Lv135+) |

The overlap is **intentional**: Lv110–119 monsters can drop Rare or Elite,
and Lv135+ monsters can drop Rare, Elite or Legendary. Monsters roll equipment
by their own level (existing fallback to player level for ancient kill events).
Normal monster gear has a small chance (3.5%) to drop; elite/boss monsters
have larger chances. Legendary is **farmable by killing monsters**, never
granted merely because the player reached Lv135. This branch removes the
old Lv45 Rare, Lv120 Elite and Lv150 Legendary eligibility thresholds.
Existing owned gear is not silently re-leveled or destroyed.

## Ascension feeding (new grade-specific path; actual Blacksmith Ascend tab)

- Target and donor must be separate **owned equipment instances**, of the
  exact **same equipment slot** (weapon→weapon, helm→helm) and **same rarity**.
- Locked, equipped and favorited donor instances cannot be consumed.
- Same-tier Rare/Elite: Ascension +1 takes 1 donor, +2 takes 2, +3 takes
  3, and +4 takes 4. Feed progress persists on the **target** between attempts.
- A higher-level Rare or Elite donor can jump more than one rank in a single
  transaction. Example Lv80 Rare donor → Lv50 Rare target grants up to +4.
  This is a deliberately generous acceleration mechanic; field testing and
  loot-economy review are necessary before production PvP.
- Legendary: **one same-rarity, same-slot donor for each rank**; no
  multi-item costs or extra rank leap, regardless of item level.
- Maximum for new equipment is four ranks. Ascension remains distinct from
  **Combine Stage +0..12**, enchant slots, over-enchant, reinforcement,
  refine and ultimate.
- The former material-only Ascension path remains for other legacy grades.
- Every real rank gained records the current reinforcement-based imprint.
  A partial feed does **not** award an unearned rank or stat bonus.
- The local service gateway validates donor ownership, locks the inventory
  transaction, commits ranks and consumes donor; if debit fails it restores
  the previous stage record. Donor confirmation is required in the UI.

### Previously implemented enhancement caps retained

- Rare reinforcement ceiling: 50% | Elite: 80% | Legendary: 120%
- Common: 40% | Unique: 45% | Chosen: 200%
- Enchantment: four separate slots, max +10 per slot; Over-Enchant +10.
- Combine Stage +12; separate from four Ascensions.
- These are **not** 112 or 120 enchant levels. Existing character items
  with legacy records above newly enforced rarity-specific caps are preserved.

## Sets and per-piece combat identities

The generator now emits matching rarity-specific procedural families:

| Rarity | Set profiles | Notes |
|---|---|---|
| Rare | Storm Striker, Iron Guardian, Moon Ranger | Damage/crit, defense/HP, ranged/crit |
| Elite | Dusk Conqueror, Eternal Bastion | Wider critical offense and defensive breadth |
| Legendary | Legacy of the Ascendant | Attack, defense, HP, Chi, critical stats, core attributes |

Two-piece and four-piece bonuses stack. As already supported by
AXESetAscensionRules, each real Ascension on every required equipped piece
adds 25% of the base threshold's value, up to 2× at +4. One +4 weapon
cannot double an entire set whose other members remain +0.

Each generated weapon also gains *individual PvE ability perks*: Rare weapons
boost Single, Three-Hit and Aerial skill damage; Elite/Legendary include AoE.
At stage +4, those perks grant an additional four **virtual** skill levels
(3% attack-skill damage each), not freely spendable character points.
Individual generated armor pieces receive a bounded extra contribution
to their own defense stat; Elite/Legendary's base item stat imprints are
slightly stronger. Normal stats and percentage rates are not multiplied
indiscriminately. A user's existing item base rolls remain untouched.

Moon Ranger's actual +15% ranged damage is situational and only applied to
eligible ranged PvE strikes via the same unified strike resolution; normal
melee does not get it.

### Appearance and naming

At the *earned* +4 stage, the Equipment UI and Blacksmith display:

- Rare → **Rare Elite**, blended purple / cyan name and glowing item art
- Elite → **Elite Legendary**, blended purple / amber name and glow
- Legendary → **Legendary Ascended**, amber / gold name and glow

The existing 3D ascended gear visual uses corresponding colors at +4 for
equipped weapons and armor. These are **prestige titles**, not a silent
upgrade to another rarity, so a Rare Elite remains Rare for slot, set
and donor compatibility. Previously rolled latent `evolutionPath` markers
do not pre-award earned prestige titles.

## Significant QA / security gates

This is a **clone-only draft integration**, NOT production PvP-approved.
Existing itemUpgrade server endpoint rolls reinforcement/over-enchant/refine/
ultimate; stage feeding is currently a local character inventory transaction
with the same client-side receipt/lock protections as other local services.
Those protections are not proof against arbitrary malicious clients.
Before enabling in competitive multiplayer, implement equivalent
**server-authoritative owned donor inventory + progression state** with an
atomic, idempotent sacrifice-and-rank transaction and appropriate audit trail.
Until then, treat these rules as gameplay development preview only.

Native `npm run build`, player-at-level boundary drops, selection/equip,
Forge donor ownership/rollback, save/relog, cross-character inventory, UI
art / aura, PvP two-client combat reconciliation and server economic fairness
are all mandatory checks before merging to the main clone branch.

Regression suites: `node --test tests/game3d-clone-equipment-farming-ascension.test.mjs`,
`tests/game3d-clone-level-gear-progression.test.mjs`,
`tests/game3d-clone-set-ascension-and-spiritual-aura.test.mjs`.
No tests should be marked native-passed from isolated JavaScript checks alone.

### Reserved future design

The owner proposed further custom skill-point bonuses, XP/Chi-cost farming
sets, defense-skill ranks and other bonuses. Some are represented by existing
virtual PvE skill-damage effects; true ability-level allocations and real XP/
Chi-cost changes require an authoritative end-to-end ability/XP pipeline.
Do not display them as earned effects until they actually modify gameplay.
