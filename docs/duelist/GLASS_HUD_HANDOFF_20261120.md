# Duelist Adventure liquid-glass match HUD — agent handoff (Nov 20, 2026)

Branch: `feature/duelist-liquid-glass-hud-templates-20261120`. **Draft review only. Do not merge or deploy without owner review.**

## Visual direction and source reference

The owner provided in-game screenshots from Star Wars Hunters and Overwatch and a short Overwatch victory video as **visual references only**. Use an original angled, gold/ice-blue liquid-glass style, not extracted or copied game art, typography, logos, characters, or textures.

Video observation: a gold circular burst and horizontal light sweep precede a centered, readable victory word over the still-visible 3D world. A small reward toast appears under it. The implemented version uses an original transparent SVG frame and CSS-only timing; the result board is delayed 2.3 seconds. Respect reduced-motion.

## Implemented on this branch

- Original transparent SVG ornament templates in `public/ui/duelist/`: portrait, health, special, three circular ability buttons, three-point control, kill tally, single rotating point, escort, event feed, and victory banner. No scores or ability names are baked into the images.
- `src/components/duelist/client/GlassHud.jsx` is mounted by `DuelistGame.jsx`. Live HP and power cooldowns come from combat state, and the 6 existing powers appear in two pages of 3 buttons instead of removing 3 from the game. Class-special charge shows unavailable until the game provides an authoritative value.
- `src/components/duelist/client/MatchHud.jsx` selects objective presentations according to match mode. Three-point ownership, scores, team kills, flags, timer, and result stats are live data.
- Mode-specific single rotating control and escort bars are **presentation slots only** until their server-authoritative game modes provide `singlePoint` or `escort`. Do not fabricate countdowns or percentages.
- Victory result uses `glass-victory.svg`, `glassVictory.css`, and `resultPresentation.mjs`: a decorative burst/sweep and result title first, then an accessible scoreboard 2.3s later. Underlying gameplay remains visible during the initial announcement. On match restart, reset via the phase transition.
- `tests/duelist-glass-hud.test.mjs` and `tests/duelist-glass-victory.test.mjs` cover presentation helpers and SVG existence. They were added, **not locally run or benchmarked** at the time of this handoff.

## Coordination / test blockers

This branch touches only Duelist HUD and its assets; do not combine it with the WebGPU migration, combat rules, net protocol, or `src/components/game3d`. Coordinate with the WebGPU agents through their separate PRs.

Next reviewers: verify `node --test tests/duelist-glass-hud.test.mjs tests/duelist-glass-victory.test.mjs` in a checkout; run the repository build; inspect desktop and mobile real match screenshots for input capture, overlap, text legibility, state transitions, scoreboard accuracy, and low-power CSS performance. The connected GitHub file API cannot run a browser and cannot publish the app. GitHub's merge/sync process and Base44 preview have **not** been verified for this change.

Additional gameplay features requested by the owner—four character classes, special resource generation, animation hookups, a timed rotating objective, and escort payload movement—need separate engine/network work and should not be claimed complete based on the HUD presentation.
