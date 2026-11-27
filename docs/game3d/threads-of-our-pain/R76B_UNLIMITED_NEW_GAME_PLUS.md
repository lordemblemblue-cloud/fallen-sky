# R76B — Unlimited New Game Plus and long-term progression
27 November 2026 | Owner direction, design documentation only. Read with R76/R76A; this revision resolves the earlier open cycle-cap question.

> **R76E — NG+ enemy scaling and XP:** [Late-game opening baseline, escalating encounters and double enemy experience](R76E_NEW_GAME_PLUS_ENEMY_SCALING.md). Opening enemies approach original late-game strength, midpoint approaches original endgame, and late encounters escalate further. Enemy XP 2x; compare 1.5x–2x tuning candidates without compounding blindly. Exact stat curves and gold/material rewards remain open.

> **R76C — character level caps:** [Base 155 / proposed NG+ 310](R76C_LEVEL_CAP_PROGRESSION.md). Base cap 155 confirmed; proposed additional 155 levels in NG+. Recommended carryover without resetting earned levels; permanent ceiling and reset semantics pending confirmation.

## Owner-confirmed requirements
- New Game Plus is repeatable without a fixed campaign-cycle cap: NG, NG+1, NG+2 and onward. Players may keep replaying the campaign as many times as they choose.
- Each successive cycle increases enemy challenge. The player retains earned equipment and can continue gaining character levels and improving gear through legitimate gameplay across cycles until the applicable progression limits are reached.
- NG+ is optional, not required to end the base campaign. Missed chapter-exclusive encounters can be legitimately attempted in a new cycle; do not magically reopen an expired chapter in the old one.
- Reset story-dependent quest, enemy and NPC state for the new cycle without resetting earned equipment or character progression. Record previous ending and completion history separately. The new cycle must be a real playthrough, not a gallery or an isolated replay that cannot advance the character.

## Proposed engineering and balance rules (not final numbers)
Use a persistent character progression/ownership record and cycle-scoped campaign state and quest receipts. On starting NG+, atomically create the next cycle with validated progression, equipped/stored gear, upgrades and unlocks; do not sum inventories or duplicate unique relics. Repeatable experience, materials and eligible rewards must be earned from gameplay in the new cycle. Exact currency/consumable carryover, repeat reward tables and quest-item reset rules remain subject to design.

Increase enemy challenge with a tunable cycle-indexed curve, including bosses. Recommend health, damage and appropriate encounter/AI tuning instead of simply multiplying every stat without limit. Avoid numerical overflow, impossible fights, reward inflation and performance degradation. Unlimited cycles does not imply an unlimited player level or equipment upgrade cap; use existing approved progression limits until explicitly revised. At max level and max gear, continued campaigns remain playable and challenging. R76C establishes base cap 155 and proposed NG+ cap 310; permanent ceiling remains open; R76D confirms level retention. R76E specifies double enemy XP and the rebased difficulty progression; exact stat curves, other rewards and maxed-character balance remain open.

Claude should preserve the authored world, phase-dependent characters and quest windows within each cycle. Reuse existing terrain and assets; do not accumulate active world copies per cycle. Engineering should keep cycle metadata and historical records lightweight, with durable recovery and authoritative reward validation.

## Acceptance criteria (planned, not executed)
- NG+1 and NG+2 both allow legitimate XP gain below the unlocked cap, eligible gear enhancements and unclaimed quest rewards; a high-cycle test confirms no fixed replay limit.
- A character reaching a progression cap can still start and finish another cycle; apply the proposed R76C first NG+ cap unlock, without further automatic increases or resets unless approved.
- Enemy challenge increases between successive cycles, with validated combat balance and no overflow or impossible encounters.
- Starting a new cycle keeps all legitimate owned gear and character progression, opens that cycle's chapter opportunities, preserves earlier completion history and does not duplicate unique relic entitlements.
- Interrupted/repeated start requests do not lose equipment, create unintended cycles or grant duplicate rewards.
- Either ending can lead to optional NG+ after completion; players may instead continue ordinary postgame quests consistent with their current world.

R77 remains the objective-level classification of the 105 discovery/adventure entries. No code, terrain, merge, deployment or runtime tests performed.
