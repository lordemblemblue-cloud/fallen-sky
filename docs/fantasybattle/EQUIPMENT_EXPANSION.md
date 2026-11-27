# Fantasy Battle equipment expansion — first pass

Scope: preserve existing armor/mantle slots and the six legacy gear IDs, stats and prices. Six new pieces are available from existing merchant catalog. Rarity, price and shared leader-level requirements are proposed prototype balancing, not approved final tuning. No changes to existing combat difficulty or XP rewards.

| Set | Piece | Level | Rarity | ATK | DEF | SPD | Buy |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| Pilgrim Watch | pilgrimCuirass | 2 | Rare | 1 | 4 | 0 | 75 |
| Pilgrim Watch | pilgrimCloak | 2 | Rare | 0 | 2 | 1 | 50 |
| Moonveil Rites | moonveilRaiment | 3 | Elite | 3 | 2 | 3 | 110 |
| Moonveil Rites | moonveilVeil | 3 | Elite | 2 | 1 | 2 | 75 |
| Astral Observatory | astralCarapace | 4 | Legendary | 2 | 7 | 1 | 155 |
| Astral Observatory | astralMantle | 4 | Legendary | 1 | 4 | 1 | 105 |

Two-piece bonuses per wearer: Pilgrim DEF +2; Moonveil ATK +2, SPD +1; Astral ATK +2, DEF +2. No cross-character set bonus. Unequipping either piece removes the bonus; comparison uses actual resulting stats. Purchase before meeting level is permitted, equip is not. Existing ownership, sale protection, save checks and portable backup preserve the new optional inventory keys. Artwork remains existing generic procedural gear visuals; no final Claude/Gemini assets claimed.

Next: expand weapon registry and enhancement persistence, plan accessory slots with renderer separation, then add explicitly allowlisted art references and fallbacks. Do not automatically copy Fallen Sky's separate balance/ascension rules to Fantasy Battle. Supply Claude/Gemini with stable item IDs, slot, theme, icon and optional equipped visual asset needs; asset delivery must never affect ownership, eligibility or statistics.

Chapter 6 passed Fantasy Battle and Base44 security checks. New equipment tests added, CI and actual browser/mobile validation still pending. No merge or publish requested.

## Second pass — weapon progression

Three new hero bows extend the existing catalog; the existing two bows retain their original stats, costs and eligibility.

| Weapon ID | Name | Level | Rarity | Base ATK | Buy | Sell |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| pilgrimBow | Pilgrim Recurve | 2 | Rare | 6 | 100 | 40 |
| moonveilBow | Moonveil Longbow | 3 | Elite | 9 | 155 | 62 |
| astralBow | Astral Starbow | 4 | Legendary | 12 | 220 | 88 |

Purchasing ahead of level is permitted; equipping and comparison enforce eligibility. All bows share existing deterministic +0 to +5 enhancement rules: +2 attack each, one ore and 15 + 10 × current enhancement gold per step. The existing save model treats enhancement as a permanent unlock per weapon type, not per owned copy; it survives weapon switching and selling/rebuying. No automatic conversion to instance-based gear or new failure rates. Old saves may omit the three new inventory and enhancement keys; import preserves only registered IDs. Unknown enhancement keys and invalid ranks are rejected. Blacksmith confirmation compares the current effective enhancement (zero if absent) before debiting. New bows use the existing Sapphire bow icon as a temporary placeholder and existing rig geometry; no new art files or independent weapon animations.

Balance is provisional. Companions retain their class weapons. Next: accessory slot(s) and stable graphical asset registration with fallback, separate from equipment stats. New weapon tests are added but not yet verified by CI; no merge/publish.

## Third pass — accessories and reviewed item artwork

Each recruited party member has one ring and one necklace slot in addition to armor and mantle. Existing equipment records need no migration. The six new items are available from existing merchants; their stats are provisional.

| ID | Required level | Rarity | ATK | DEF | SPD | Buy |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| groveRing | 1 | Common | 1 | 0 | 1 | 30 |
| pilgrimPendant | 2 | Rare | 0 | 3 | 0 | 55 |
| moonveilRing | 3 | Elite | 2 | 0 | 2 | 75 |
| moonveilPendant | 3 | Elite | 1 | 1 | 2 | 80 |
| astralRing | 4 | Legendary | 3 | 1 | 1 | 120 |
| astralPendant | 4 | Legendary | 2 | 3 | 1 | 125 |

Existing gear ownership, level restrictions, comparison, sale protection and save validation apply. Accessories do not count toward armor/mantle set bonuses and are not sent to the current armor mesh renderer. The original UI is preserved, with live ring and necklace socket controls and a combined mantle/jewelry filter. Generic vector icons are temporary fallbacks.

Claude/Gemini artwork contract: deliver a square transparent WebP icon, recommended 256 x 256 or 512 x 512, under public/fantasybattle/sapphire/items/<exactItemId>.webp. Use consistent light, camera angle, scale and transparent padding. No embedded text, labels, rarity frames or UI background. Register only reviewed files in ITEM_ARTWORK (core/itemArtwork.mjs) using the exact same-origin path /fantasybattle/sapphire/items/<exactItemId>.webp. The registry is deliberately empty until files are supplied. Shared ItemArt uses lazy loading, async decoding and vector fallback on image failure. Never accept URLs from saves, player input, or remote manifests; images cannot grant stats, items or equipment. Equipped accessory models and unique weapon geometry are separate future work.

Next: audit inventory/loot acquisition, economy and encounter rewards, and supply a complete item asset manifest. CI and device layout validation remain pending.
