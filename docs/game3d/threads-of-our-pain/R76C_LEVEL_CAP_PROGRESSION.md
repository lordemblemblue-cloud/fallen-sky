# R76C — Level 155 base campaign and level 310 New Game Plus progression
27 November 2026 | Owner direction and interpretation for confirmation; design documentation only.

> **R76D — owner-confirmed NG+ level display:** [Retained level and highlighted blue plus indicator](R76D_NEW_GAME_PLUS_LEVEL_DISPLAY.md). Earned level never resets; show actual level with a blue plus suffix, e.g. 155+. Proposed 310 ceiling remains per R76C.

## Level limits
The owner stated that the base game level cap is 155, and proposed another 155 levels through New Game Plus, giving a level cap of 310. Record base cap 155 and proposed NG+ cap 310. Unlimited campaign cycles remain independent from the character level cap (R76B). Do not assume every successive cycle adds another 155 levels.

## Confirmed level retention and proposed ceiling
When the player starts NG+1 after either completed ending, raise the allowable character level from 155 to 310 while retaining earned levels, experience, equipment and upgrades. A character at 155 can earn levels 156 through 310 through genuine gameplay; one below 155 keeps their actual attained level, with no free levels or XP. Subsequent cycles permit continued leveling up to 310 if not already reached, and remain playable after reaching 310. Enemy challenge increases with successive cycles, independently of the character cap. This interpretation reconciles the user's earlier carryover direction with resetting the level *cap*, not resetting earned character levels. R76D confirms retained actual levels and blue plus presentation, not a level-one prestige reset. Do not increase the cap further without explicit approval. Do not erase or renumber existing progression.

## Implementation and balancing
Keep cap unlock separate from current level, XP, campaign cycle index and item ownership. Persist the unlocked cap through subsequent cycles; a new cycle must not downgrade or grant levels. Reuse existing progression and equipment requirements; no automatic new item tier, stat formula, XP curve, upgrade cap, or level-310 equipment requirement is authorized here. Validate XP awards and level transitions using existing authoritative progression systems; prevent repeated transition from granting unearned XP. Difficulty and rewards, stat points, gear progression beyond 155, XP pacing and UI presentation need balancing. Allow maxed characters to continue NG+ without needing an increased cap.

## Planned acceptance checks
- Base campaign cannot exceed 155 under the base cap.
- Starting NG+ raises the cap to 310 under the recommended interpretation without changing current level or owned equipment.
- Players can legitimately gain 155 additional levels from level 155 to 310 across NG+ cycles.
- NG+2 and later remain available at level 310, with escalating enemy challenge and no automatic further cap increase under the proposed global-cap interpretation.
- Cancellation, failed save transition, repeated requests and reconnect do not reset, duplicate or grant progression.
- Verify existing actual level cap and gear dependencies before implementing; no runtime validation yet.

R76C records the owner's stated cap values; level retention and display are confirmed in R76D; whether 310 is the permanent ceiling remains to be confirmed. No game code, merge or deployment.
