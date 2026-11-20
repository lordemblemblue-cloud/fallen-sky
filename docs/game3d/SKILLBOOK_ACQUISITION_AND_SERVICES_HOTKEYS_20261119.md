# Game 3D: acquired Skill Book sync and Services hotkey close

Date: 2026-11-19
Scope: `lordemblemblue-cloud/fallen-sky`, Game 3D (main and clone Skill Book presentations).

## Acquired skills

- A new **Acquired Skills & Abilities** strip appears under the Skill Book header in both the native/cloned three-lane book and the classic redesign; Companion's separate skill book is unchanged.
- This strip reads the character-scoped learned-skill store, skill-scroll loot bag and overflow storage vault. Both pickup and quest-award events immediately notify its subscriptions.
- A collected scroll is labeled **Scroll collected** until the player actually learns it. A successfully committed learned skill/quest ability is labeled **Learned**. Neither state bypasses weapon-skill point progression, equipped slots, or combat eligibility.
- The quest reward claim flow now persists recognized ability/skill unlock IDs into the same character-scoped learned store, rather than only inserting legacy special abilities into Q/E/R/F slots.
- Published Base44 hosts no longer count as development environments for mass skill seeding. Only local development hosts do that, avoiding fictitious acquisitions for live players.
- No new quest rewards, skill drop rates, mastery point allocations, or entitlement services were created.

## Services navigation

- The single `AXEServiceModeController.close()` now resets `expanded=false`, returning the HUD to its single **Services** button. This applies to shortcut closes, the page's close button, Escape, station teardown, and other normal closes.
- `toggle()` closes the active service if one is open; otherwise it toggles only the navigation.
- Key routing remains centralized in `game3dMenuHotkeys.mjs`. C/I (Character/Appearance alias), K (Skill Book), L (Quest Logbook), P (Companion), J (Spiritual), and = (Blacksmith) now use uniform toggle logic. M toggles its separate map portal.
- Pressing the same shortcut twice closes the page **and** hides its service subpage buttons. Pressing a different shortcut switches to its page; no extra row remains after exit.
- The existing modifier, editable-field and key repeat guards remain intact. No change to Shift+C or combat actions.
- Pending async workstations are still invalidated on close, so late responses cannot reopen the menu.

## Validation

- Added Node regression tests at `tests/game3d-skillbook-acquired-and-service-shortcuts-20261119.test.mjs` for every hotkey, menu collapse, async stale station response, quest + loot acquisition projection, both book layouts, and published-host anti-autogrant behavior.
- Static branch check and manual browser QA still required before deployment:
  1. In the world, open each service via its hotkey and press it again. Confirm only the **Services** button remains, including when closing from a Character subtab.
  2. Open another service while one is active, switch to it, then close it. Confirm no orphaned icons.
  3. Earn a skill scroll via enemy loot; confirm **Scroll collected**, no automatic combat entitlement. Learn it; confirm **Learned** without reload.
  4. Claim a quest granting Shadow Teleport, Lightning Strike or Frost Tornado; verify the learned entry appears immediately, persists across reload and stays scoped to its character.
  5. Verify the published website starts without fabricated learned skills.
- No live deployment or actual browser confirmation is implied by this code change.
