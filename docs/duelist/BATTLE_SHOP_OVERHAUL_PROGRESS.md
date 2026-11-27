# Consolidated Battle Shop overhaul — continuation ledger

Owner directive: one increment at a time, all item tiers and categories, actual authoritative gameplay effects and UI together. One consolidated PR, DO NOT MERGE until owner explicitly approves. Tier I Damage PR #378 was independently merged before this branch was created; it is the baseline. Do not open a new PR for each phase.

## Progress
- [x] Damage I — baseline #378 (already on main)
- [x] Damage II — implemented on this branch; combat and cooldown regression tests added, CI/playtest pending
- [ ] Damage III — next
- [ ] Defense I, II, III
- [ ] Ability I, II, III
- [ ] Health I, II, III
- [ ] Tenacity I, II, III
- [ ] Hybrid I, II, III
- [ ] Support I, II, III
- [ ] Counter I, II, III
- [ ] Relic I, II, III (including deliberate active item expansion)
- [ ] End-to-end online/practice/ranked and mobile verification, balance, security, lint/build, review

Tier II Damage: Ironfang 180g (+4% power, +3% crit chance, 3% HP-only lifesteal); War Banner 216g (+4.5% power, +3.5% crit defense, 7 shield on elimination); Eclipse Edge 252g (+5.5% power, +6% crit severity, 2.5% cooldown reduction); Blood Rite 300g (+6.5% power, 4.5% HP-only lifesteal); Starbreaker 372g (+8% power, 8 shield on elimination). Existing tier III effects unchanged. Existing 50 item IDs, 150 artworks, price/recipe system and slots preserved. These are provisional balance values.

## Rules for each next increment
Read AGENTS.md, current main and branch, check for overlapping changes. Continue this branch and PR; update this ledger. Add actual combat/simulation handlers for genuinely new effects, server-owned triggers/cooldowns and client reconciliation, never merely advertise an unsupported effect. Maintain accurate shop/HUD descriptions and mobile activation. Preserve six slots and existing gold authority, do not introduce service-role bypass or trust client stats. Test combat, blocked/evaded hits, damage/kill attribution, dead actors, caps, cooldowns, duplicate purchases, respawn, objective and map collision restrictions as relevant. Existing relics use one active slot; maintain counterplay and do not grant unrestricted teleportation or permanent invisibility. Use sources for historical design inspiration, not copied assets.

No automatic merge, deployment, or approval. Keep draft and report outstanding verification. If another process closes or merges the PR, stop further branch writes and report the conflict before continuing. All clients and servers must deploy compatible catalog/protocol versions together. 
