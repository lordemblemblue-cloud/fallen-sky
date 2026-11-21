# Duelist Adventure — consistent game-menu and match-entry UI handoff (2026-11-21)

Branch: `feature/duelist-unified-game-ui-20261121`, PR #217 (draft).

## Owner direction
Use the supplied Star Wars: Hunters game-mode screenshots and https://koby.games/star-wars as **inspiration**, not reusable assets. The owner wants one consistent, clean UI across all Duelist pages and a helpful match loading/entry screen. Preserve earlier requests for an open, subdued, liquid-glass look with gold outlining rather than thick neon blue effects or heavy rounded panels.

The linked YouTube page could not be inspected through the available browser tool; do not claim frame-by-frame video parity.

## Implemented on this branch
- `src/components/duelist/menu/duelistUnifiedVisual.css`: shared design tokens for gold, muted ink, subtle glass, compact angular borders; common header styling for home, secondary menus and match page.
- `src/components/duelist/menu/MenuPages.jsx`: four top categories (Casual; Ranked planned; Training routes to actual practice; Custom planned/disabled); mode cards with selection state, detail panel and legitimate practice/online actions. Transport remains planned.
- `src/pages/DuelistNext.jsx`: game header and menu/back link now use the same header style.
- `src/components/duelist/client/MatchLoadingScreen.jsx`: original accessible match briefing with mode-specific objective, four *guide labels* for the match path, actual status text and indeterminate decorative rail.
- `src/components/duelist/client/DuelistGame.jsx`: uses that screen during offline asset initialization, online joining, server errors, reconnecting and fighter-load errors. No simulated loading progress, invented queue times, server availability claims or changes to renderer state.
- `tests/duelistUnifiedUi.test.mjs`, `scripts/verify-duelist-ui.mjs` and `.github/workflows/duelist-hub-preview-checks.yml`: basic regressions, parsing, lint, build coverage.

## Common visual rules for later agents
1. Use **graphite / deep navy transparent surfaces**, a **hairline warm-gold outline**, squared or slightly clipped corners (2–3px), and small light-blue/red functional indicators only.
2. Keep the current live 3D character/hangar stage behind menus, not a raster copy of another game's screen.
3. Use one clear hierarchy: shared brand header; compact category/navigation rail; large selectable mode tiles; right-hand focused details/actions; restrained footer.
4. Different mode pages, settings, story, character and match loading must not introduce unrelated typography, radii, colors or thick glowing boxes. Reuse `duelistUnifiedVisual.css` for shared components.
5. Ranked/Custom/Transport must say *planned* until real gameplay exists; online must remain disabled if the server is unavailable. Do not pretend the match is loading with percentage values that are not real engine data.
6. Do not edit gameplay simulation, WebGPU rendering, match network or the combat HUD merely for menu consistency. Other agents own those areas; coordinate shared CSS changes.

## Verification still required
- GitHub CI after PR creation: dedicated hub workflow, UI parsing, new tests and Vite build.
- Visual QA at desktop 1920×1080 and 1366×768, compact 900×700, tablet 768px, phone 390px. Check no mode tile is clipped, the player can reach all buttons without nested scrolling, and gallery does not collide with the home right-side navigation.
- Verify Casual practice, actual online server enabled/disabled, Ranked planned, Training route, Custom planned, active card changes, Escape, story, character, settings, ready, joining/reconnecting/error and browser back.
- Validate accessibility (focus ring, readable contrast, reduced motion, pointer/keyboard interactions) and performance (CSS-only effects; no new WebGL draw pass).
- GitHub commits are **not Base44 live publishing**. The previous handoff recorded an inaccessible editor app; confirm the correct app is connected and visually review/publish deliberately.

Do not merge this branch as a substitute for real visual QA, nor claim the user's live version has changed.
