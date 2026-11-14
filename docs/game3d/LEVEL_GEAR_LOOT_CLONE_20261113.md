# Game 3D clone — model-independent level equipment drops (2026-11-13)

**Clone target:** `marcusflow1-arch/gitsync-pro`. This first pass adds real equipment item instances and set effects to the existing kill → world drop → pickup → character-scoped AXE inventory → equip → combat stats path. **No item needs a GLB to have stats.** The source of truth for upgrades remains the Blacksmith/advancement stores, not the loot generator.

## Level/rarity schedule (balance provisional)

| Mob level | Common | Unique* | Rare | Elite | Legendary | Mythic |
| --- | --- | --- | --- | --- | --- | --- |
| 1–10 | 100% | — | — | — | — | — |
| 11–20 | 72 | 24 | 4 | — | — | — |
| 21–30 | 48 | 42 | 10 | — | — | — |
| 31–40 | 30 | 48 | 22 | — | — | — |
| 41–50 | 15 | 25 | 60 | — | — | — |
| 51–119 | — | 10 | 90 | — | — | — |
| 120–129 | — | — | 35 | 65 | — | — |
| 130–139 | — | — | 25 | 75 | — | — |
| 140–149 | — | — | 15 | 85 | — | — |
| 150–179 | — | — | — | 28 | 72 | — |
| 180+ | — | — | — | 20 | 80 | boss/elite-only tiny chance |

Weights are **relative**, not guaranteed drop odds. The existing kill-based *equipment drop chance* remains unchanged (normal mob 3.5%, elite 12%, etc.); these weights apply only **after a gear drop succeeds**. Boss/elite modifiers favor already-eligible higher grades without releasing grades early. Named armor pack drops retain their separate chance and pool but now honor the same minimum-level rarity gates.

*Unique is displayed as Unique but stored as the pre-existing engine rarity `uncommon` for compatibility with inventory, loot visuals and reinforcement rules. Rarity variants are additional fields, not new hard-coded combat rarities.*

The drop level uses `enemyLevel` / `level` from the killed mob when the death message provides it. Existing death messages without a mob level retain their previous player-level fallback; they require follow-up instrumentation for perfect mob-level accuracy in all scenes.

## Generation

- Every **10-level** band changes level scaling, with explicit Rare-farming (51) and Elite (120) edges. Existing normal item-level scaling is preserved: `1 + (monsterLevel - 1) × 0.06`.
- The actual selected source slot has real stat keys supported by combat: Attack, Defense, Max HP, Max Chi, Agility/Evasion, Crit Chance/Defense, Strength, Vitality, Focus. Random affixes are additive **rolledStats**, never UI-only cosmetics.
- Number of extra affixes: Common 0, Unique 1, Rare 1, Elite 2, Legendary 3, Mythic 3. Chance and stat magnitudes are bounded; percentage effects do **not** grow with the level stat multiplier.
- Quality (0–20%) remains independent of rarity. No fake model is attached; `appearance: null`, `modelUrl: null`, and `visualPending: true`. A later asset assignment can be keyed to template ID, family, slot and rarity without rerolling owned items.
- Source item template catalog excludes the **clone-only Crescent Moon preview grant** and Training Bow testing item from being copied into ordinary random equipment.
- Game 3D Appearance → Equipment now shows item level, rolled/base/enhancement stats, active set effects, a future evolution marker, and a model-pending explanation.

## Evolution paths (metadata, NOT unlocked crafting yet)

- From level **45**, some Rare drops are tagged **Rare Elite** (`rare_elite`): future Rare → Elite pathway.
- From level **120**, some Elite drops are tagged **Elite Legendary** (`elite_legendary`): future Elite → Legendary pathway.
- From level **150**, some Legendary drops are tagged **Legendary Mythic** (`legendary_mythic`): future Legendary → Mythic pathway.
- Mythic is eligible for a **Mythic → Chosen** prestige path, but Chosen is **never rolled from mobs**.
- Tagged items stay their **real current rarity** and its enhancement ceilings. A later Blacksmith recipe must define material costs, requirements, server authority and transactional save; this implementation does **not** silently mutate rarity or grant free power.

## Rare set families

At monster level 45+, eligible Rare/Elite/Legendary/Mythic generic armor can roll one of three shared set families. Set pieces are matched by `setId` AND **actual rarity**, so mismatched grades do not accidentally complete a set. Two equipped pieces activate one signature effect; four pieces also grant +2 ordinary Defense.

| Set | Two-piece bonus | Where applied |
| --- | --- | --- |
| Skyrend | +20% aerial strike damage | PvE combat resolver **when caller identifies an aerial attack**; the main GameWorld3D caller still needs to pass `isAerialAttack` from grounded/animation state |
| Wildhunt | +15% damage to ordinary mobs | PvE, tiers normal/elite/champion; no boss/PvP boost |
| Arcanist | +3 virtual ability-damage points = +9% skill damage | PvE skill strike (3% per point); does **not** grant three spendable skill-tree points |

The new combat resolver reads equipped canonical items and applies the conditional damage modifier inside its existing temporary-bonus cap. It does not permanently multiply the player's sheet damage or grant effects in PvP. Actual 3D effect models and VFX can be added later.

## Chosen (locked blueprint)

Eligibility helper requires **level 150+**, **Halo 200** (current max), **at least five matching Mythic set pieces**, explicit **final-trial completion**, and explicit **confirmation of the remaining endgame criteria**. No automatic Chosen unlock, item grant, costume, or irreversible progression is implemented. The additional endgame requirements and transaction authority must be specified before launching Chosen as a player-visible service.

## Validation / follow-up

- Isolated V8 contract checks exercised key level boundaries, Rare Elite evolution, set thresholds, PvP/boss isolation, regular gear drops, named armor pack drops and new 3-affix Legendary rolls. Additive stat values were confirmed as real `equipmentItem.rolledStats`.
- Run from repo root: `node --test tests/game3d-clone-level-gear-progression.test.mjs`, then `npm run build`.
- **Still needs browser QA**: mob-level event payload coverage, real world pickup/persistence, item fitting once GLBs are available, true Blacksmith evolution recipes, skill-tree treatment of virtual ability points, Skyrend grounded/airborne event wiring and server-authoritative anti-tamper before competitive multiplayer.
- Clone-first; do not copy to main Game 3D until balance and the equipped/set impact are approved.
