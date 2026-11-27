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
