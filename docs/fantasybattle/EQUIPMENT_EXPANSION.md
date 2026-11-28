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

## Seventh pass — Blacksmith Combine

Combine is an alternate deterministic way to increase the equipped non-starter bow's existing enhancement rank by one (+2 ATK). Consume one spare copy of the same bow plus 5 + 5 × current rank gold. Retain the equipped copy; no ore is consumed, no separate rank, no random failure and no new save field. Enhancement and Combine share the existing +5 cap and per-type persistence. These costs and rules are provisional Fantasy Battle tuning, not Fallen Sky's distinct +12 combination stage. The original Blacksmith UI shows actual spare count, price and result; confirmation rechecks live service, weapon, rank, ownership and cost. Ascend, Socket and Enchant remain disabled until their rules are implemented and tested.

PR #448 merged with a failed companion gift test that compared the entire legacy Grove Archer party container rather than its individual fields. Corrected assertion checks each unaffected member's recruited/active/HP/bond and unchanged frontline, not nested unrelated members. Production build and Base44 security passed at the previous head; shared Game 3D and WebGPU failed. New tests, lint and device acceptance pending. No publish.

## Eighth pass — Set Ascension

Ascension is independent of weapon enhancement and combination. Equip both pieces of a matching armor/mantle set on the selected recruited wearer. Each rank multiplies the original set bonus by 1 + rank × 0.25, up to rank 4 (double the original set bonus). Individual item stats do not change. Fractional bonuses remain precise in derived stats; existing damage resolution rounds final damage. Ranks persist per wearer and set even when unequipped, but bonuses only activate with the complete set. No cross-wearer stacking. Costs are provisional: rank 0→1 costs 30 gold/2 ore, 1→2 costs 50/3, 2→3 costs 70/4, 3→4 costs 90/5. The optional ascensions save field is validated and preserved through backup import/export; older saves default to zero. The original Blacksmith plate displays current/next bonuses, selected wearer, price and eligibility. Confirmation checks the active set, rank, material costs and live service. New regression coverage added; current head CI and device acceptance pending. Previous Combine head bf2a720 passed Fantasy Battle and Base44 security; shared Game 3D failed and WebGPU was in progress. Socket and Enchant remain unavailable. No merge or publish.

## Ninth pass — Equipment Socketing

One socket per wearer and equipment type (non-starter bows for the leader, armor/mantles/rings/necklaces for all recruited wearers). Gems are formed directly from existing Sapphire Ore; they are not new inventory items or mesh assets. Crimson Ruby grants ATK, Azure Sapphire DEF, Verdant Emerald SPD; rank 1–3 grants +1/+2/+3 of the chosen attribute. Rank 0→1 costs 20 gold/2 ore, 1→2 40/3, 2→3 60/4. Selecting a different gem destroys the installed gem and resets to rank 1 at the initial cost after explicit confirmation. Socket records persist per wearer/type when unequipped or sold, but grant bonuses only while equipped. No interaction with ascension or enhancement caps. The optional sockets field validates known wearer/type/gem/rank and survives portable backups. Legacy profiles default to no sockets. Original Blacksmith UI shows the current and next effect and validates the live service, equipment and quote on confirmation. These socket limits, gem types, costs and replacement policy are provisional design decisions, not previously approved tuning. Tests cover rank, replacement, material consumption, inactive effects, independent wearers and invalid backup records. Prior ascension head c9307c8 passed Fantasy Battle and Base44 security; shared Game 3D failed and WebGPU was in progress. Current CI, lint and device layout verification pending. Enchant remains disabled.

## Tenth pass — Equipment Enchanting

The last previously disabled Blacksmith operation is now wired to the existing original artwork. Enchantment adds 10% of the item's original ATK, DEF and SPD per rank (maximum +3, 30%); the added value is not compounded and does not scale sockets, enhancements, set bonuses or ascension. Fractional derived stats are retained; combat damage uses existing final rounding. Eligible equipped non-starter bows and gear share the socket eligibility rules. Enchantment persists per wearer/type while unequipped or sold and applies only when the type is equipped. Rank 0→1 costs 40 gold/3 ore, 1→2 costs 65/4, 2→3 costs 90/5. Deterministic, no random failure. This is provisional Fantasy Battle tuning, not the separate Fallen Sky enchant system. The optional enchants field is validated and preserved through portable backups; old saves retain zero ranks. The existing single-use confirmation rechecks wearer, equipped item, rank, costs and service proximity. No new artwork or inventory IDs. Tests cover independent progression, material costs, rank cap, valid legacy saves, and invalid records. Prior socket head 8ddadff passed Fantasy Battle and Base44 security; shared Game 3D and WebGPU failed. Latest CI, lint, browser layout, and combat balancing pending. All six Blacksmith operations are wired in code; no merge or publish. Next: passive skills and ultimate abilities.
