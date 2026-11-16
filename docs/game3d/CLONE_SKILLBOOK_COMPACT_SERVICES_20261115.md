# Clone Game 3D — Skill Book Services/navigation and compact screenshot layout

**Source:** owner-approved Skill Book mockup ("Charged Shot Skill Book Interface.png") and subsequent compact-layout revisions on 2026-11-15/16. Apply to **clone only**. Preserve the actual registered ability list and real progression values; do not render the source image as a flat overlay.

## Owner-facing changes
- Keep **Services**, Blacksmith, Character, Skill Book, Quest Logbook, Companion and Spiritual navigation controls visible and clickable above an open Skill Book. The old CSS explicitly set `.jade-services-navigation` to `visibility:hidden !important`, and the Skill Book was above the Jade HUD in stacking order.
- Raise only the navigation's HUD parent over the panel, keep the other HUD pieces behind/hidden, and position the panel below the **measured navigation bottom** from `AXEServicesNavigation.jsx` (works with wrapped mobile rows).
- Original dark navy/gold, liquid-glass/native AXE look, compact header, no flattened mockup art.
- Left 17–18% shaded/blurred, unboxed Weapon Category; rename Sword → Damage and Bow → Range, retain Defense, Universal and Passive. Move **Character/Companion** inside it as a compact selector.
- Middle ~52–54%: wider list of compact inventory-style single-row skills, searchable and filterable in the library itself. Use minimal book-icon dropdown for Skills / Buffs / Advance, preserving real skill-point upgrades in Advance.
- Right ~28–30%: reduced skill information panel with real stats, description, mastery, equipment action and requirements.
- Bottom **Equipped Skills** pager with working left/right arrows shows five real slots at a time. The underlying 1–0 loadout indices, save and equip transactions remain unchanged.
- Browsing weapon categories never switches the real equipped weapon. Only the existing explicit Activate weapon bar control may do that.
- Re-subscribe to character weapon skill point investments so locked/unlocked cards and Locked filter update immediately.
- Keep the separate free passive, charge-damage investment and character-scoped progression system already merged by PR #92. No modifications to its point costs or currencies.

## Status / checks
- Programmatic source checks confirm navigation styling, measured clearance, real group callback, title/filter moves, full 1–0 pagination index mapping, no removal of the skill-point panel and subscription to point changes.
- Added `tests/game3d-clone-skillbook-services-compact.test.mjs` with regression assertions.
- **Not yet** compiled/runs of the Node UI test suite or authenticated Play screenshot verification from this environment.
- Review before merge. Screenshot-perfect fidelity and responsive navigation clicking must be checked on actual clone UI (desktop and mobile).
