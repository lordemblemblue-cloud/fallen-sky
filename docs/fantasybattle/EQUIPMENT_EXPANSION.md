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

## Eleventh pass — Automatic passive skills

Three provisional leader passives are automatically derived from existing XP: Steady Aim (+1 ATK at level 2), Iron Resolve (+1 DEF at level 3), Windstep (+1 SPD at level 4). No Focus, actions, point expenditure or new mutable save fields. Existing companions retain their stats. The hero stat function feeds actual battle units, equipment comparisons and attribute previews; passive effects are additive rather than multipliers. First victories crossing thresholds report passive unlocks alongside ordinary active skills; repeat and practice victories still report none. Original Skillbook passive row and level-up/unlock screens display the actual learned state. Older saves derive passives immediately from their level. Prior enchant head 038df89 passed Fantasy Battle and Base44 security; Game 3D failed and WebGPU was in progress. Latest CI, lint, device layout and balance testing pending. Ultimate remains unavailable. No merge or publish.

## Twelfth pass — Moonfall ultimate

Moonfall is a provisional leader-only ultimate unlocked at party level 4, with hotkey 5, three Focus, one hit, power 58, 95% accuracy, 15% crit chance and priority -1. It is usable once per encounter, including practice, and only when executed (a defeated actor or lack of target does not consume the use). A new battle resets the use. Practice permits testing regardless of level without progression rewards. Companions and enemies cannot equip this action via class or custom kit. Existing damage, guard and initiative rules apply. Original Skillbook ultimate row, character learned list, level-up and battle HUD use the actual action catalog. The action currently reuses the existing chargedShot animation, with no claim that a new cinematic or GLB animation exists. Skill parameters and threshold are provisional. Previous passive head 4700f9c passed production build and Base44 security but two static UI regression assertions failed: character learned list now includes passive skills and an exploration HUD marker was missing in the reported check. Updated character marker and narrowed HUD test scope without removing the actual companion-health assertion. Shared Game 3D and WebGPU also failed. New CI and real-device playthrough pending. No merge or publish.

## Thirteenth pass — fixed campaign combat difficulty

All 14 registered encounters now have explicit base HP, ATK, DEF, SPD and advisory level in ENCOUNTER_BALANCE. Known encounter categories are canonical for formation building. Party size remains bounded 1–4 with +18% lead HP per extra member; supporting foes scale by encounter with lighter Gatekeeper supports because its three-phase kit is already dangerous. Normal encounters progress from 86 base HP in the grove to 280 in Astral Ruins; final Vanguard has 300. Gatekeeper has 250 base HP, 16 ATK and 15 DEF. These are fixed regional stats, not automatic matching to player level; advisory levels do not gate entry. Generic/practice formation fallback remains unchanged for valid party sizes. Reward XP/gold/ore and equipment costs remain unchanged.

Directly exercised the fetched combat rules and updated formation functions in a JS isolate, substituting a placeholder enemy visual ID only (not involved in damage). Seeds 1–64, maximum 45 rounds, full-health reference units: starter hero HP120/ATK12/DEF10/SPD11 with quick shot and guard; late-game hypothetical leader HP140/ATK28/DEF22/SPD13 with all actions and companions (Warden HP135/10/18/7, Grove Archer HP85/10/10/9, Scout HP75/13/10/16). Warden fronts the party; guard against boss's celestial lance, starfall and eclipse ray. Otherwise select strongest available attack by fixed order. Grove 62/64 victories (5.109 rounds average); Gatekeeper 52/64 (12.516); Astral Vanguard 55/64 (11.344). These are reference-policy simulations, not live player win rates, and do not establish gear attainability or healing/economy balance. Added the same three simulation scenarios as regression tests plus structural coverage for 14 encounters. Next audit actual campaign reward income, loadout attainability and sustain from one fight to the next. Latest full CI, device testing and shared renderer checks pending. No merge or publish.

## Fourteenth pass — campaign income and attainable combat progression

Fixed regional first-victory rewards now replace category-only income for the 14 registered encounters; generic encounter fallback is unchanged. Main route through Sanctuary Vanguard grants 300 XP, 280 gold, 12 ore before any spending, versus 200 XP, 195 gold, 8 ore previously. Moonfall and level-four equipment become available before Gatekeeper without optional encounters. Main-route total is 600 XP, reaching level 7 after the final fight. Reward previews use the same catalog; practice/repeats still pay nothing. An explicit firstVictory flag distinguishes first wins at the XP cap from repeats. Existing saves are not retroactively credited for already defeated encounters; no reset or repeat farming is introduced.

Re-executed the fetched adventure, equipment, enemy and battle modules in a JS isolate (deterministic UUID substitute for profile creation). Reference policy: skip all three optional fights and all treasures, recruit available allies, use Warden frontline, allocate strength, buy Sapphire Bow when affordable, equip available level-eligible drops, and enhance when affordable. Full party recovery is assumed between fights via existing free rest services, including possible backtracking; no map traversal or physical rest interaction was tested. At each encounter evaluate seeds 1–32, max 45 rounds, use first winning result to advance profile and actual reward/transaction functions. Guard frontline against the three dangerous Gatekeeper attacks. Baseline Gatekeeper: 8/32 wins, level 3; revised: 17/32, level 4. Revised reference path completed all 11 mandatory encounters, ending with valid profile at 600 XP, 290 gold, 18 ore after spending. These are conditional per-encounter simulation samples (not 32 continuous campaign runs or actual player win rates). Full-rest assumption and reference policy do not establish sustain without backtracking. Further balance tuning is needed if intended player difficulty differs. Regression tests cover level, budget, ownership, repeat/cap protection and backup. Latest full CI and real device validation remain pending; no publish.

## Fifteenth pass — field recovery and sustainability

Recovery Tonics still restore up to 40 HP each, but the player may now choose the leader or any recruited active/reserve companion. One tonic is consumed only when the selected recipient has missing health. Existing free full-party rest remains unchanged. Original recovery panel displays the selected recipient and actual current/next health, inventory count and cost; live transaction rechecks all values and refuses use during combat. No new map geometry, save fields or item types.

Six first-victory milestones award limited supplies: Ruined Arch Warden 2, Waterfall Mist Spirit 2, Sapphire Canopy Guard 2, Sanctuary Vanguard 3, Celestial Gatekeeper 2, Astral Wraith 2. Total 13 additional tonics (up to 520 HP), separate from the starting tonic and five existing treasure caches. Practice and repeats grant none; inventory cap and portable backups preserved. These quantities and targeted recovery policy are provisional. Existing characters do not receive retroactive supplies. Regression coverage checks recipient isolation, reserve eligibility, full-health rejection, finite loot and save roundtrip. No continuous traversal or no-backtracking playthrough has been validated; three existing free rest points remain. Latest full CI and visual verification pending. No merge or publish.

## Sixteenth pass — continuous campaign sustain

Run 64 continuous no-retry main-route attempts, carrying actual profile HP, inventory, XP, and equipped drops between fights (no optional encounters or treasures). Seeds are run × 101 + encounter index; 45-round limit. Recruit all available companions, Warden frontline, allocate strength, select Focus attacks by fixed priority and guard frontline against three dangerous Gatekeeper attacks. At the two forward service locations before Sanctuary Vanguard and Moonveil Spirit, use existing full rest and purchase/enhance Sapphire Bow if affordable. Else use owned tonics on most injured active members when at least 25 HP would be restored. No extra items or mid-route backtracking. Service access and movement are assumed, not physically simulated.

Baseline: 0/64 completed; 62 stopped at Ruined Arch Warden, one each at Pilgrimage Sentinel and Heights. Tested 25%, 40%, 50%, 65% maximum-HP field recovery following first wins; selected 40% to preserve attrition and tonic value. Actual committed rules restore up to floor(0.4 × max HP) for the leader and participating recruited active companions, capped at max HP. No recovery for reserve members, repeat/practice/generic encounters; no new save field. Existing final battle HP is displayed separately from recovery gained on the victory screen; notification reports aggregate recovery. No retroactive credit.

Re-executed the new continuous regression against fetched committed source in an isolated JS environment: 21/64 full completions; 26 failures at Gatekeeper, 6 at Ruined Arch Warden, 5 at Heights Canopy Guard, 5 at Astral Vanguard, 1 at Sanctuary Vanguard. One completed route consumed all 14 available tonics, used two rests, finished with 290 gold and 18 ore. This establishes a feasible no-retry route, not a satisfactory general win rate. The continuous regression passed its provisional minimum of 16 completions. The separate recovery regression reached its backup serialization assertion but the isolated runner lacked TextEncoder; full Node CI is still required. Next tune Gatekeeper and early sustain using the continuous test, then verify real-device interactions. No merge or publish.

## Seventeenth pass — Gatekeeper and route difficulty refinement

Compared four candidate encounter-stat adjustments using the original 64 continuous-run seeds. Selected configuration B and evaluated a separate 64-seed batch (65–128) without additional tuning. Fixed solo stats changed: Ruined Arch Warden HP 140→130, ATK 12→11; Sapphire Canopy Guard HP 200→190, ATK 16→15; Celestial Gatekeeper HP 250→220, ATK 16→15, DEF 15→14, advisory level 3→4; Astral Vanguard HP 300→290, advisory level 5→6. No changes to boss phase thresholds, Focus, attack kits, party scaling, recovery, loot or upgrade rules. Grove remains unchanged. Values are provisional.

Continuous completion: original batch 21/64→39/64, independent batch 9/64→26/64; combined 30/128→65/128 (23.44%→50.78%). Gatekeeper failures 60→12, Arch Warden failures 11→1. Remaining tuned failures: Astral Vanguard 22, Astral Wraith 15, Gatekeeper 12, Sanctuary Vanguard 7, Canopy Guard 6, Arch Warden 1. Late-game failure counts partly reflect more parties reaching that region; do not interpret absolute counts as per-encounter loss rates. Fully rested earlier reference tests also evaluated: Grove 62/64, Gatekeeper 62/64, Astral Vanguard 59/64; those use hypothetical prepared party and are not continuous outcomes.

Expanded continuous regression to 128 seeds with minimum 48 total completions, 20 per batch and no more than 20 Gatekeeper failures. Executed the updated test against fetched committed modules in a JS isolate: passed all assertions (65 completions, 39/26 per batch, 12 Gatekeeper failures). No full Node CI or browser validation claimed. Next focus on Astral endurance and realistic healing allocation/gear optimization; no more broad difficulty reductions without evaluating conditional failure rates. No merge or publish.
