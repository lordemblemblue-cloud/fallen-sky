# R76A — Missed chapter opportunities and New Game Plus
27 November 2026 | Owner direction; design documentation only. Read with R76, R65 and R66. This clarification supersedes the blanket R76 assumption that every missed objective must be recoverable within the same completed campaign.

## Owner-approved distinction
Ordinary unfinished quests and discoveries that remain consistent with the active world may be revisited after either ending. However, a quest that belongs exclusively to a particular main-story chapter may be permanently missed in that playthrough when its legitimate opportunity closes. Do not magically return the player to a past chapter, resurrect an unavailable actor, create a time-travel portal, or grant its reward just because it was missed. Revisits are legitimate where the story already allows them. Exact chapter gates must follow authored evidence; do not invent deadlines. Keep all legitimately earned equipment as directed in R76.

The owner proposed an Elden Ring-style New Game Plus (NG+) route: start another campaign cycle at increased difficulty and experience the story and its missed opportunities again. Treat this as the preferred recovery design, not a new in-world power. Another possible future design is an authored alternate means to acquire selected missed items, distinct from completing the missed quest. No specific alternate acquisition route is approved.

## Proposed implementation (not final balance or runtime code)
- Classify each of D01–D50 and S01–S55 at objective level: persistent; chapter/phase-exclusive; conditionally revisitable through existing story mechanics; unresolved pending evidence. A paired discovery may have different availability per objective. Never classify all entries as persistent or all as missable.
- Show actual opportunity state in the journal: available, in progress, completed, waiting for valid conditions, or missed for this cycle. Provide a non-spoiler warning before a known irreversible closing phase where feasible. Do not imply a missed quest can be resumed in the current world.
- Offer an explicit NG+ option after campaign completion, with confirmation and a recoverable prior-cycle record. Recommend carrying owned equipment, enhancements and permanent character progression into the new cycle, resetting chapter-dependent quest and NPC state, and increasing challenge across authored encounters. Preserve the selected ending in the previous cycle's history; NG+ is a separate campaign cycle, not a literal reversal of that ending. Exact level/XP and resource carryover, eligible repeat rewards, difficulty scaling, cycle cap, storage and save behavior require separate design approval.
- Use cycle-scoped quest receipts and persistent item ownership rules. A legitimately missed item can be earned when the player performs its real quest in a new cycle. An already-owned unique relic must not duplicate due to an alignment, repeated claim or cycle restart. Repeatable ordinary reward rules remain to be balanced; no automatic grants from a missed journal entry. An alternate acquisition path may award an eligible item only if separately authored, earned and validated; it never fabricates the original quest completion.
- Claude: use R65 ending geography and R67/R68 actor phases. Keep permanent closure in active postgame; use original chapter terrain and actors only in their valid campaign cycle or already-authorized context. Return a per-objective classification, source evidence, opening/closing condition, reward entitlement and NG+ eligibility. Do not create new quest IDs, portals, alternate vendors or terrain as part of this document.

## Acceptance tests (planned)
| Scenario | Expected result |
| --- | --- |
| Ordinary quest not finished before ending | Remains available if its authored world conditions still hold |
| Chapter-only rescue missed | Closed in current cycle; no resurrection, automatic completion or magical rewind |
| Chapter-only unique item missed | No free item; may earn through genuine quest in NG+ or future separately approved acquisition route |
| Start NG+ | New cycle with harder encounters; previous ending recorded; earned equipment retained under proposed carryover policy |
| Already-owned unique relic encountered again | No duplicate entitlement, even if narrative scene can be experienced again |
| Uncertain closing phase | Remains explicitly unresolved for source audit; no invented deadline |

R77 should perform the per-objective classification against the existing 105 source-reviewed entries, not claim classifications are already finished. No gameplay, terrain, merge or deployment changes in R76A.
