# R76E — New Game Plus enemy progression and double experience
27 November 2026 | Owner direction, design documentation only. Read R76B–D together.

## Owner-directed difficulty design
- Award twice the normal enemy experience in New Game Plus. This is an enemy XP multiplier of 2.0, not a confirmed doubling of gold, materials, quest XP or every other reward. No automatic exponential XP increase per additional cycle has been approved.
- Rebase early-game enemies in NG+ to a challenge comparable to original-campaign late-game regular enemies (near, but not necessarily equal to, the very strongest endgame enemies). Do not merely double the original low-level opening enemies' HP: they would still be trivial against carried gear.
- As players move toward the middle of NG+, regular enemies should feel like original endgame opponents. Continue the difficulty curve through the latter half, where encounters and bosses should feel exceptionally powerful, almost godlike, while remaining mechanically fair and beatable.
- The owner suggested 1.5x progression between major difficulty reference points and potentially 2x if playtesting shows that 1.5x is insufficient. Approximately double HP was also discussed. Treat these as initial tuning targets, not simultaneous mandatory multipliers applied to every attribute or a fixed final formula.
- Character level and gear growth should help players meet this increasing challenge. Subsequent NG+ cycles remain unlimited with increasing challenge (R76B). Keep the confirmed no-reset level display and proposed 310 cap (R76C/D).

## Proposed baseline and tuning contract
Create authored chapter/region difficulty anchors using existing enemy stat tables and representative reference loadouts. Reference original late-game non-boss enemies for the NG+ opening, original endgame non-boss enemies for its midpoint, and progressively stronger NG+ targets for late chapters. Maintain relative enemy roles (normal, elite, boss); never make every normal enemy a boss by copying boss stats. Interpolate monotonically between comparable anchors; avoid abrupt chapter-boundary spikes. Keep earlier areas stable within a cycle unless an authored story event changes them. Do not dynamically match every enemy to the player's exact live level: fixed per-cycle/region challenge preserves the player's sense of earned strength. This is a recommended interpretation of the requested level scaling; exact dynamic behavior is not explicitly approved.

For first balance passes, compare 1.5x and 2x increases against comparable rebased reference stats and test HP near the proposed doubled target where appropriate. Choose one calibrated stat curve rather than stacking the same difficulty factor through enemy level, rebasing and extra global multipliers. HP is not a measure of difficulty on its own: tune damage, attack windows, AI pressure, defenses and recovery independently; preserve telegraphs, counterplay, traversal and boss phase integrity. Use existing combat formulas, gear tiers and measured reference player damage/defense rather than inventing absolute levels or HP. Reward formula for a legitimate enemy defeat: 2.0 × corresponding normal-mode enemy XP award, with existing rounding and receipt rules; do not double again when the enemy's level or reward template has already been adjusted. Exact gold/material rewards and additional cycle XP scaling remain open.

For NG+2 and onward, use a monotonic, overflow-safe difficulty policy with diminishing numerical growth or other tested challenge mechanics rather than unbounded exponential HP growth. Retain optional unlimited replay, avoid impossible encounters at the player cap, and test representative high-cycle saves. Exact later-cycle increment, enemy damage/defense values, HP formula, stat ceilings and gear/XP pacing need approval after measurement. No new enemy IDs, mandatory attacks, dungeons or world copies are authorized.

## Claude/engineering handoff
Return a table of actual existing enemy IDs, region/mission, role, base HP/damage/defense/XP, selected reference anchor, proposed NG+ stats and reward, plus time-to-kill, incoming hits-to-defeat, completion and performance observations. Include starting character loadouts below and at 155, mid-progression and maxed 310 reference where supported, normal/elite/boss and both endings; use stable seeded encounters for comparisons. Keep difficulty data-driven and shared across existing supported renderers, not a rendering or terrain change. Avoid extra spawned actors merely to increase challenge. Server-authoritative reward checks and cycle-scoped defeat receipts must prevent duplicate XP; preserve guest entry and existing backend permissions.

## Acceptance tests (planned, not executed)
- A legitimate kill yields twice the corresponding normal-mode enemy XP; retries/reconnects do not award twice.
- An NG+ opening enemy at a representative late-game loadout is not routinely one-shot; weaker carried builds remain viable through appropriate equipment, skill and authored encounter tuning.
- Opening < midpoint < late challenge for comparable roles; late bosses provide a dramatic increase without unavoidable damage or unreasonable damage-sponge fights.
- Compare 1.5x versus 2x tuning candidates before choosing final curves; no accidental compounded multipliers.
- Higher cycle indices raise challenge while keeping rewards, stat arithmetic and saves valid at representative high cycles.
- Base campaign remains unchanged; gear, earned level and quest history carryover remain intact.

No gameplay code, enemy tables, terrain, runtime tests, merge or deployment performed. R77 remains the quest objective availability review; exact scaling and gold/material reward policy remain open.
