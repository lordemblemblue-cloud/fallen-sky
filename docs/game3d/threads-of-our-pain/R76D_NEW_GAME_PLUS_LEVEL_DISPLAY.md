# R76D — New Game Plus level display and retained progression
27 November 2026 | Owner-confirmed presentation and level continuity; documentation only. Read with R76B/R76C.

## Owner direction
When a player enters New Game Plus, their earned character level does not reset. Display their actual character level in a distinctive highlighted blue color, with a plus sign beside the number, to communicate that the character is in New Game Plus. For example, a level 155 player becomes visually **155+**, not level 1. The plus sign is a visual indicator of NG+ status, not an arithmetic operation, added level, or replacement for the actual level. Keep earned equipment, XP and progression as already established. Base campaign level cap is 155; the proposed NG+ level ceiling is 310 per R76C. The exact long-term ceiling and scaling remain as stated in R76C, not newly resolved here.

## Presentation specification (recommended details)
- Base campaign: existing level styling, no NG+ suffix.
- NG+1 and later: actual level number plus a single suffix, e.g. 155+, 156+, 200+, 310+; use the same highlighted blue treatment regardless of cycle. Do not show 1+ for an existing level 155 player or use repeated plus signs to represent the cycle.
- Store actual campaign cycle index separately; recommend showing "New Game +2" etc. in the character panel or tooltip rather than overcrowding the level number. The exact UI location, blue shade and highlight styling are design defaults awaiting visual review.
- Apply consistently wherever the character level is rendered (HUD, character panel, relevant nameplates and menus), using existing components and a shared style token. Do not change item level, quest level or enemy level presentation by accident.
- Ensure contrast against light and dark environments; the plus sign and an accessible text label such as "Level 155, New Game Plus" communicate meaning without color alone. Avoid expensive animated glows or extra 3D effects.
- Derive the display from authoritative saved level and active NG+ state; no mutation of level or XP when formatting it. Save and reload must preserve actual level, NG+ status and cycle number.

## Planned checks
- Base level 155 shows 155 with original styling; first NG+ shows blue 155+ while numerical level, XP and gear are unchanged.
- Legitimate leveling updates the displayed number (156+, 157+, etc.) without changing suffix semantics.
- An NG+ character starting below 155 displays their actual level, not an invented value.
- Later cycles retain the same suffix and separately show accurate cycle information where supported; no character reset.
- Confirm contrast, HUD readability, mobile and desktop rendering, save reload and progression validation. No runtime tests or visual assets produced here.

R76D supersedes the unresolved level-reset interpretation in R76C. No game code, terrain, merge or deployment.
