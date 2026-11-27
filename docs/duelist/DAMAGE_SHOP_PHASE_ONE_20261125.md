# Duelist Adventure — Damage shop phase 1 (2026-11-25)

Owner request: study historical League of Legends, SMITE and SMITE 2 item designs; improve one tier at a time. This increment is limited to the five primary Damage item families. It preserves the 50 existing IDs, art, price schedule, hybrid recipes, six slots, spawn purchase restrictions, and existing completed-tier effects.

## Research anchors (not exhaustive historical catalog)
- League of Legends component and active item taxonomy: https://wiki.leagueoflegends.com/en-us/Item
- Long Sword historical recipes: https://wiki.leagueoflegends.com/en-us/Long_Sword
- Historical item patch index: https://patchdelta.gg/lol/items
- SMITE tier trees: https://smite.fandom.com/wiki/Items
- SMITE pre-2016 actives: https://smite.fandom.com/wiki/Active_items
- SMITE 2 active equipment, components and inventory: https://wiki.smite2.com/w/Items

## Tier I balance targets
| Item | Gold | Stats | Early passive |
|---|---:|---|---|
| Ironfang Blade | 75 | +2% power, +2% crit chance | none |
| War Banner | 90 | +2% power, +2.5% crit defense | Rally: +3 shield on elimination |
| Eclipse Edge | 105 | +2.5% power, +4% crit severity | Echo: 1% shorter class ability cooldowns |
| Blood Rite | 125 | +3% power | Blood Tribute: heal 2% of actual HP damage dealt |
| Starbreaker | 155 | +4.5% power | none |

The three early passives use already implemented authoritative combat hooks. They remain unchanged at Tier II to avoid losing a purchased benefit; Tier III replaces them with the existing full passive rather than stacking both. Tier II stat and cost design, Tier III stats/effects, and all other item categories are unchanged. The shared tier helpers drive both simulation and UI.

## Future phases (design ideas only, not implemented)
- Tier II: counterplay around armor/shields, conditional follow-up hits, healing reduction, sustained combat and cooldown timing; do not remove existing recipes or introduce untested stat names.
- Tier III: original damage actives such as short visible phase step with collision and objective restrictions; a brief ambush cloak ending on attacks or damage; timed strike amplification with clear counterplay. Preserve class identities and one active relic slot. Existing Phase Mirror anchor recall and Stasis Mirror invulnerability remain unchanged.
- Revisit all active items as their own scoped phase. Validate line of sight, walkable destinations, spawn protection, objective carriers, dead/stunned actors, cooldowns, server authority and mobile input.

## Verification and rollout
New tests cover profiles, prices, actual aggregation, UI projection, no double passive, non-regression of other families and active relic gate. The branch was authored using GitHub's contents API, not a full checkout; full npm lint/build, automated match tests and real desktop/mobile playtesting are pending. Client and authoritative hosts calculate bonuses from owned item IDs, so deploy the same catalog revision to both hosts and client together; don't mix old and new catalogs in competitive play. No deployment or merge in this phase.
