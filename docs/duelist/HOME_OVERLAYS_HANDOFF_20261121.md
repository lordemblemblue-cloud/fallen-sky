# Duelist Adventure home overlays and character progression (2026-11-21)

Branch: `fix/duelist-home-overlays-progression-20261121`. Scope: UI menu components only.

- Home no longer displays Battle Pass or Plus in its footer. Settings remains an actionable footer control.
- Play opens as a large translucent panel to the right of a compact left menu rail, between the existing gold-accented header and footer; background stage is blurred with a CSS scrim and not re-rendered.
- Settings and Character use the same in-place overlay system. Direct existing `/duelist-next/settings` and `/duelist-next/fighter` links render the home stage with the corresponding panel initially open; Escape/close returns to home.
- Removed redundant Character and Settings links from the secondary page header; Home stays.
- Character uses real `classProgressOf`, `levelFromXp`, `xpForLevel` and `MILESTONES` for four class mastery levels, EXP and 5/10/15/20/25 recognition milestones. Fighter appearance choice remains independent. No paid pass, claimable store items or fake rewards are introduced.
- CSS is isolated in `duelistMenuOverlays.css`, imported after the existing unified theme, so concurrent gameplay, WebGPU and shaders are untouched.
- Store functionality is not implemented in this repository's Duelist menus; do not fabricate a checkout/store surface from this UI request.

Validation: run `node --test tests/duelistHomeOverlays.test.mjs tests/duelistUnifiedUi.test.mjs`, `node scripts/verify-duelist-ui.mjs`, and `npm run build`. Visually QA at 1920x1080, 1366x768, 768px and 390px. Check Play, Character, Settings, Escape, backdrop, keys rebinding, progress values, selected fighter persistence, and story/deep links. GitHub changes do not publish Base44 live.
