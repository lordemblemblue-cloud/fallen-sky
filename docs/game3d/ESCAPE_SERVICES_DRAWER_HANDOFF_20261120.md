# Game 3D Escape drawer: Services, Scoreboard and shortcut handoff
Date: 2026-11-20
Repository: `lordemblemblue-cloud/fallen-sky` (Emblem Blue / Fallen Sky). Changes are on a dedicated review branch.

## Player interaction contract
- **Escape (no service open):** opens a right-side slide-out game menu. The world remains active behind the overlay. The drawer offers a Services category, Scoreboard category and a gear icon leading to existing Graphics settings. Existing Audio, Controls, UI, HUD & Community, and Session settings remain usable.
- **Services:** lists Blacksmith, Skill Book, Quest Logbook, Companion and Spirituality directly in the Escape drawer. Selecting a service closes the drawer first and opens its existing functional workspace. Character is deliberately excluded from the drawer service list: use **C** to open Character directly.
- **Scoreboard:** only displays connection status and live player occupancy from the existing `game3dWorldPresence` event. There is currently no authoritative per-match scoreboard stream in this world, so the UI states that match results are unavailable; it does NOT invent kills, scores or rankings.
- **C:** opens Character directly, without Escape or floating Services. If Character is showing Equipment, Vanity or Aura, the first C returns to the Character subtab; the next C closes Character completely. From any other service (including Skill Book), C switches to Character.
- **K:** opens Skill Book directly. Another K closes it; from Character, K switches to Skill Book.
- **Escape with any service workspace open:** closes it immediately and collapses its service navigation; it does not open Escape behind the service. Escape when the Escape drawer is open closes the drawer in a single press, except an active destructive Session confirmation, which is cancelled first.
- Existing other service hotkeys (I/L/P/J/=) remain direct shortcuts; M remains a separate map portal. No change to modifier shortcuts or combat bindings.

## Implementation notes
- `game3dPauseMenuModel.mjs`: two new categories.
- `PauseMenu.jsx` + `PauseMenu.css`: context-scoped right-side drawer, selectable services, real-session Scoreboard and gear launcher. Entry/title settings keep their existing layout and do not list in-world Services or Scoreboard.
- `JadeSoulHUD.jsx`: floating Services navigation is opt-in and hidden by default; Game 3D explicitly disables it.
- `game3dMenuHotkeys.mjs` + `GameView.jsx`: shared toggle decision tracks the actual Character subtab, reuses `focusCharacterRequest`, clears any stale expanded menu on Escape, and opens a single service when selected from the drawer.
- No new fake leaderboard, different service transaction system, or replacement Skill Book was introduced.
- `tests/game3d-escape-services-drawer-20261120.test.mjs` adds regression coverage.

## Manual browser QA before merge / Base44 publish
1. Enter Game 3D; Escape opens a **right drawer**, no left HUD Services icons; clicking Services lists Blacksmith / Skill Book / Quest Logbook / Companion / Spirituality.
2. Click Skill Book inside Escape. Escape drawer disappears, Skill Book opens. K closes it; repeat K to reopen and Escape to close. No Services or settings remain on screen after closing.
3. Press C to open Character. Choose Equipment; press C once: Character tab; press C again: workspace closes. Press K, then C: Character opens. Press Escape: all workspaces close.
4. In Escape, inspect Scoreboard: occupancy is live, match results absent rather than fabricated. Gear icon opens existing Graphics settings; Audio/Controls/Session continue working.
5. Test both mobile layout and desktop, as well as text fields, Shift+C, M map, L quests, P companion, J spiritual, = blacksmith, character creation screen and death/combat restrictions.
6. Review GitHub tests/checks. This PR does NOT assert live Base44 deployment or fully verified browser gameplay.
