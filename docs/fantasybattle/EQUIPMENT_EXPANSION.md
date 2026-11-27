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

## Fourth pass — first-victory loot

All 14 existing world encounters grant one deterministic equipment item alongside existing XP, gold and ore on their first recorded victory. See ENCOUNTER_GEAR_REWARDS in adventureState.mjs for stable item and encounter IDs. Existing equipment level gates, art fallbacks, merchant prices and combat balance are unchanged. Practice battles and repeated victories grant nothing. Older saves do not retroactively grant equipment for previously completed encounters; no migration or new save fields are required. Inventory grants and victory currencies are capped to existing save limits, with actual awarded amounts returned to the existing result UI. Discoveries retain their existing one-time tonic and ore rewards; new physical treasure placements await approved map anchors. This is provisional reward tuning, not a repeatable farming or server-authoritative economy. Regression tests added; CI and device validation required before merge. Next: merchant and crafting progression, treasure anchor registry and economy balance.

## Fifth pass — merchant and crafting economy

Merchant and crafting quantities are integers from 1 through 99. The same quote functions drive the UI and the transaction. Confirmations recheck the character, service marker, combat state and current resources; a single confirmation is consumed once. Buying and selling use existing catalog prices, protect equipped copies and enforce existing inventory/gold caps. All existing merchants retain their catalogs until regional stock is authored; no artificial stock or new currency.

| Recipe ID | Party level | Sapphire Ore | Gold |
| --- | ---: | ---: | ---: |
| recoveryTonic | 1 | 2 | 0 |
| groveVest | 1 | 3 | 22 |
| sapphireBow | 1 | 4 | 50 |
| pilgrimPendant | 2 | 4 | 30 |
| moonveilRing | 3 | 5 | 45 |
| astralPendant | 4 | 7 | 65 |

Amounts are per output and provisional; the old tonic recipe is unchanged. Selling crafted items cannot produce more gold than selling the ingredients plus the crafting fee. No equipment is auto-equipped. Existing profile and backup schemas remain unchanged. Original merchant/crafting pictures remain the underlying UI templates; the existing potion illustration is decorative even for other recipes. Actual item art uses the existing registry and fallback. CI, lint and browser layout verification are still required. No new server endpoints, world/character artwork or publish action. Next: registered physical treasure anchors and location-specific discoveries, coordinating with the map team.

## Sixth pass — hidden treasure and exploration

The five existing world discovery markers use the registered TREASURES catalog. No map mesh, position, collision or passage geometry changed. Each awards a tonic, ore (2 early / 3 late) and a distinct equipment piece: pilgrimage Groveweave Vest, cave Sanctuary Mantle, overlook Sapphire Plate, Moonveil Astral Star Ring, Astral Archive Astral Signal Pendant. Loot choices are provisional. Existing level requirements still apply; no automatic equip. Unknown markers do not grant loot. The current world checks proximity in X/Z and vertical clearance before collection, ignores already found markers and locks interaction while reporting the result. The host uses canonical labels and the original treasure reveal, item acquisition and discovery UI. Existing rewardedDiscoveries records prevent re-collection across saves; no retroactive rewards or new schema. Capacity limits may truncate loot and collection is still recorded.

Map handoff: preserve disc_pilgrimage, disc_cave, disc_overlook, disc_moonveil, disc_astral and their existing marker positions until new map assets are reviewed. Claude/Gemini can design chests, secret passage geometry and distinct treasure artwork for these IDs; physical chest animations and new anchors are not implemented. Existing glowing discovery markers are used now. Add future markers only via reviewed catalog + world registration and test reachability, clear collision and touch interaction. Existing economy production build and security gate passed, but two original template assertions failed after quote refactor; updated to verify shared quote and live confirmation guards. New head CI/lint and actual device reachability still pending.
