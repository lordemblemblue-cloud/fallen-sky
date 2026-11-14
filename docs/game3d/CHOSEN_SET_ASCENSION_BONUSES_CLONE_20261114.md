# Chosen endgame full-set bonus — Game 3D clone (2026-11-14)

**Only the Chosen set gets the exceptional +100% / +200% stat multipliers.**
This is separate from the ordinary Rare/Elite/Legendary/Mythical set progression introduced in PR #34.

## Chosen set — implementation

- **Set ID:** `AXE_Set_Chosen`
- **Required rarity:** `chosen` (an explicit future forge conversion, not the `mythic_chosen` evolution marker)
- **Complete set:** six different equipped slots — helm, chest, gloves, legs, boots, cape. Uniqueness is checked by canonical instance ID and equipment slot.
- **Full Chosen bonus:** +100% (2×) on the final core stat sheet.
- **All six Chosen pieces successfully Ascension +4:** +200% (3×) on the final core stat sheet; this *replaces* +100%, it does **not** add another 200% on top.
- Until **all six** reach +4, the whole set remains at +100%; five at +4 and one at +3 is not enough for +200%.
- If a piece is unequipped or replaced by non-Chosen gear, the full set bonus immediately turns off.
- Core sheet stats (Attack/Damage, Defense, HP, Chi, Accuracy/Block and their primary attribute displays) multiply **once** at the end of the existing equipment/attribute/percent-pool/character Ascension calculation; their normal bonuses are not independently multiplied a second time.
- Chance and rate stats such as crit chance/damage/defense, evasion and attack speed remain under their established hard caps. Chosen cannot grant >100% hit/crit or invalidate PvP combat bounds.
- Existing character-scoped Blacksmith `stage.rank` from `AXEItemAdvancementStore` is authoritative for +4; spoofable item labels, item levels, or `ascensionRank` tags do not count.
- Appearance > Equipment displays 0–6 completed pieces, how many are already Ascension +4, and the unlocked Chosen bonus.

## What is intentionally *not* granted here

- No Chosen armor drops from normal mobs, Elite bosses or the procedural loot generator. No automatic conversion just because Halo maxed or a Mythical set exists. Prior endgame Chosen eligibility blueprint still requires maxed Halo, a Mythical set, final trials and additional confirmed criteria.
- No specific model assets, donor material, sacrificial equipment, or ascension token costs are created. The separate server-authoritative forge conversion still needs to be designed and approved.
- **Other rarity sets are not +100% / +200% sets.** They retain rarity/level-based small bonuses and combat-contextual effects. The suggested **sacrifice another equipment piece** ascension mechanism is a potential future transactional recipe, not implemented yet. A successful stage upgrade cannot consume someone else's gear silently.
- The proposed numeric Will bonuses for max-level Rare sets need confirmation before modifying player resources; that value is not coded in this change.

## Verification

Pure logic and source integration tests: `node --test tests/game3d-clone-chosen-set-bonus.test.mjs`.
V8 isolated run passed six regression checks: no Mythic/Rare premature activation, distinct six-piece requirement, six real +4 stages for enhanced bonus, exactly-once ×2/×3 stats, rate caps, and character-scoped Blacksmith/Appearance wiring.

Still unverified: full browser end-to-end UI, the future Chosen forge, any Chosen drop or item grant, and a complete deployed 3D set. The **clone** is the only target, not original Game 3D.
