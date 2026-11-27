# R84 — Unified New Game Plus and postgame progression contract
27 November 2026 | Owner-directed consolidation of R76–R76E with R83 chronology. Design requirements and proposed implementation handoff, not code or final balance. R76A–E and R64A/R65 take precedence over older broad R75/R76 replay proposals.

## 1. Confirmed owner direction and open decisions
| Topic | Current contract | Status |
|---|---|---|
| Both endings | Keep all legitimately earned equipment; continue still-valid quests and further progression | Confirmed |
| Chapter-exclusive quests | Once a genuine opportunity closes, no magical return or free item; recover opportunity in another campaign cycle | Confirmed |
| NG+ cycles | Optional, repeat without a fixed cycle cap, each successive cycle harder | Confirmed |
| Character level | Base cap 155; first NG+ proposed cap 310; earned numerical level never resets | 155 and no reset confirmed; 310 target stated, permanent ceiling not explicitly finalized |
| Level display | Actual level in highlighted blue with plus suffix, e.g. 155+ | Confirmed; precise shade/layout and separate cycle display proposed |
| Enemy XP | Twice corresponding normal-mode enemy XP | Confirmed target; rounding and existing modifiers need implementation review |
| Enemy challenge | Rebase opening near original late game; midpoint near original endgame; climb toward extremely powerful late enemies/bosses | Confirmed direction |
| HP and difficulty | Compare roughly doubled HP and 1.5x–2x candidate increases from calibrated reference points | Tuning targets, not final formula |
| Other rewards | Gold, materials, quest XP, consumables/currency carryover, repeatable loot and gear caps | Open; do not automatically double or change |
| Alternative missed item acquisition | May be authored in future, without fake historical completion | Direction only; no route approved |

## 2. Character and cycle state
Recommended logical contract (map to existing save/database types, not a new schema migration): persistent character ID, actual level, XP, unlocked cap, learned permanent progression, unique gear ownership/instance IDs, enhancement/socket state and inventory location; separately campaign cycle ID/index, story chapter/phase, active ending, actual quest and encounter receipts, temporary quest props, active checkpoint and objective lane state. Archive prior-cycle ending and historical journal without importing its temporary world flags. Do not infer exact achievements, account cosmetics, currencies or consumed-item policy beyond approved ownership; sold/dismantled/consumed equipment cannot be recreated. Gear incompatibility is a recoverable ownership/usability concern, not deletion.

NG+ entry is an explicit optional action from a completed campaign after either ending. Recommended transaction: validate completion and current revision; preflight destination and character state; present choice and carryover summary; commit next cycle once with idempotency key and recovery record; reset only cycle-scoped story/quest/NPC/enemy state; preserve earned character level and equipment; load safe opening with correct difficulty profile; finalize only with recoverable checkpoint. Back/cancel must not start a cycle. Failure after commit must resume the same cycle, not create another, revert ending silently or duplicate rewards. No new public privileged reward endpoint; enforce existing backend access and guest-entry rules.

## 3. Level and UI
Use actual numeric level, not a prestige reset or visual fake. Example: base 155 → NG+ entry 155+ → earned 156+ ... 310+. If entry is allowed below 155, show actual attained level, not a free upgrade. Recommended 310 cap unlock on NG+1 and retain it across later cycles pending final permanent ceiling decision; no extra 155 levels each cycle without approval. Continue campaigns at cap without forced level reset. Blue suffix is display only, derived from authoritative NG+ state. Recommend one plus suffix independent of cycle, separate readable "New Game +5" in character info, contrast/accessible label across existing HUD and relevant player nameplates. Do not recolor item/enemy levels or add expensive effects.

## 4. Difficulty and reward contract
Keep base campaign unchanged. Use actual existing enemy stats and authored region/chapter roles to map comparable normal, elite and boss anchors. For NG+1, opening regular enemies should be near original late-game regulars, midpoint near original endgame, late chapters surpass original endgame and finale feels almost godlike but beatable. Compare 1.5x and 2x candidate growth and approximately doubled HP where appropriate; do not multiply weak base mobs blindly or stack level rebase, HP factor and difficulty factor unintentionally. Damage, defense, behavior, attack windows and recovery require independent calibration. Recommend stable per-cycle region curves rather than matching every enemy to current live player level, so earned upgrades matter; exact dynamic scaling unapproved. Further cycles increase challenge without hard replay cap; use tested, numerically safe growth and/or appropriate challenge mechanics, not uncontrolled exponential stats. Later-cycle curve and balance at max gear/level remain open.

Enemy XP = 2.0 × corresponding normal-mode enemy XP for a validated eligible defeat, once under existing encounter receipt rules. Audit normal XP, adjusted enemy templates and modifiers before applying; no double application, no automatic per-cycle exponent or blanket gold/material/quest XP doubling. Proposed QA: reference loadouts below 155, at 155, mid-NG+ and near 310; compare time-to-kill, damage received, survivability, progression pace, boss counterplay and performance on target devices. Gold/material tables, XP curve, gear progression beyond base and exact stat caps still require balance approval.

## 5. Quest and ending continuity
A completed timeline remains committed; no reset solely from ending choice. In both endings, valid persistent objectives remain playable; unresolved access is not proof of availability. R83 prevents deceased characters from appearing alive and blocks unapproved former-world travel. Chapter-exclusive objectives close only on verified phase predicates and can be genuinely attempted in NG+. Keep objective/receipt distinctions (paired observation, relic, required second vista; evidence vs actual assistance; mixed reality lanes). Prior unique items remain owned without repeat entitlement; repeatable normal XP/rewards follow approved per-cycle eligibility, not automatic grants. Existing authored records/retrospectives can satisfy their own objective only. A new cycle can offer another ending, but never overwrites previous cycle history. Alternate item acquisition remains future design.

## 6. Implementation sequencing and tests
1. Inventory existing persistence, quest/actor state, combat and reward services and schema; return compatibility/migration/security findings before altering code. Preserve guest flow and authoritative writes.
2. Prototype cycle entry transaction and safe checkpoint recovery, with existing assets and feature-gated testing. No new maps or paid generation.
3. Add validated progression-cap/display integration, then test low/high-level entry, legitimate XP, cap and repeated cycles.
4. Implement data-driven difficulty profile after reference stat survey; validate normal/elite/boss combat and reward pacing, both endings, representative later cycles and performance.
5. Bind objective-level availability with actual scene/actor/route predicates after R80–R82 verification. Exercise skipped/partial quests, actual event closure, legitimate replay, already-owned item and unclaimed item.
6. Test cancellation, duplicate requests, disconnected save, conflicting requests, invalid client XP/loot, existing item enhancements, consumed/sold item, old saves, safe scene load, mobile/desktop and renderer fallback. Do not publish until validated. Tests are specified, not executed.

## 7. Status
R84 consolidates approved requirements and explicitly distinguishes proposed engineering and tuning. No final permanent ceiling, gold/material reward policy, gear cap or exact enemy curve decided. R83 chronology blockers remain; verified PR #402 has only R77–R79 classification files before this work (60/105 provisional), R80 reported but not verified, R81/R82 outstanding. No game code, Word manuscript change, terrain, merge or deployment.
