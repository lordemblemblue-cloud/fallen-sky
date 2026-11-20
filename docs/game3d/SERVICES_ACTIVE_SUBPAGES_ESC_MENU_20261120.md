# Services visibility and Escape subpage routing (2026-11-20)

Repository: `lordemblemblue-cloud/fallen-sky` (Emblem Blue), Game 3D.

## Clarified behavior
- When the player is **in gameplay**, the original floating Services bar and its subpage links are completely absent.
- Opening a service via its hotkey or via the Escape drawer restores the original **Services category/subpage navigation while that workspace is open**. Its internal operation tabs remain available, including Companion and Character's integrated own tabs.
- **C** opens Character directly; another **C** closes the Character workspace and all Services navigation immediately, including when Equipment, Vanity or Aura is selected.
- **K** opens Skill Book directly; another **K** closes Skill Book plus the Services navigation.
- **Esc** closes the active workspace and navigation entirely (no secondary pause drawer behind it). Pressing Esc from normal gameplay opens the compact, right-side square-tile menu.
- Clicking a different category in the active Services strip switches service rather than making overlapping windows. No separate service button remains in normal gameplay.
- The right-side Escape drawer still has the six original square service tiles, Scoreboard, Map, and the bottom-right Settings gear. Beneath the tiles is a scrollable **Service subpages** section. Every real group is listed, with expandable buttons drawn from its actual `AXE_SERVICE_GROUPS.visibleServiceIds` (or `serviceIds`) and `getAXEService` labels. This includes Spirituality (Halo, Wings, Titles, Ascension, Buddha Essence), Character (including Cape, Vanity, Costume and Aura), Skill Book Character/Companion, Questbook, Companion and Blacksmith options.
- Choosing a subpage uses the existing service controller and `serviceId` to open that exact registered operation. Cape shortcuts target the real Cape tab under Character's Vanity content.
- The full Settings page is accessed through the gear; existing settings and scoreboard functionality remain unchanged.

## Regression validation
- Targeted menu tests exercise C/K/Esc, full close/reset, active-only HUD service navigation and the full subpage list.
- GitHub Actions `game3d-escape-services-drawer.yml` runs menu tests and the Vite production build.
- Live/Base44 browser UX verification remains necessary after publishing; code changes do not assert that deployment happened.
