# Duelist Adventure liquid-glass match HUD — agent handoff (Nov 20, 2026)

Branch: `feature/duelist-liquid-glass-hud-templates-20261120`. **Draft review only. Do not merge or deploy without owner review.**

## Visual direction and source reference

The owner provided in-game screenshots from Star Wars Hunters and Overwatch and a short Overwatch victory video as **visual references only**. Use an original angled, gold/ice-blue liquid-glass style, not extracted or copied game art, typography, logos, characters, or textures.

Video observation: a gold circular burst and horizontal light sweep precede a centered, readable victory word over the still-visible 3D world. A small reward toast appears under it. The implemented version uses an original transparent SVG frame and CSS-only timing; the result board is delayed 2.3 seconds. Respect reduced-motion.

## Implemented on this branch

- Original transparent SVG ornament templates in `public/ui/duelist/`: portrait, health, special, three circular ability buttons, three-point control, kill tally, single rotating point, escort, event feed, and victory banner. No scores or ability names are baked into the images.
- `src/components/duelist/client/GlassHud.jsx` is mounted by `DuelistGame.jsx`. Live HP and power cooldowns come from combat state, and the 6 existing powers appear in two pages of 3 buttons instead of removing 3 from the game. Buttons are disabled on known cooldown or death; paging away during active grip enqueues a release. Class-special charge shows unavailable until the game provides an authoritative value.
- `src/components/duelist/client/MatchHud.jsx` selects objective presentations according to match mode. Three-point ownership, scores, team kills, flags, timer, and result stats are live data.
- Mode-specific single rotating control and escort bars are **presentation slots only** until their server-authoritative game modes provide `singlePoint` or `escort`. Do not fabricate countdowns or percentages.
- Victory result uses `glass-victory.svg`, `glassVictory.css`, and `resultPresentation.mjs`: a decorative burst/sweep and result title first, then an accessible scoreboard 2.3s later. Underlying gameplay remains visible during the initial announcement. On match restart, reset via the phase transition.
- `tests/duelist-glass-hud.test.mjs` and `tests/duelist-glass-victory.test.mjs` cover presentation helpers and SVG existence. The focused GitHub Actions workflow now runs these tests automatically on the draft PR. Both test and UI parsing/lint jobs **passed** in run [44816330795](https://github.com/lordemblemblue-cloud/fallen-sky/actions/runs/44816330795), commit `457cfe153f36d7fd5f4664e299cd2fb81a03afca`. No browser gameplay test, full app build, or GPU benchmarking has been verified.

## Coordination / test blockers

This branch touches only Duelist HUD and its assets; do not combine it with the WebGPU migration, combat rules, net protocol, or `src/components/game3d`. Coordinate with the WebGPU agents through their separate PRs.

Next reviewers: review passing focused Actions run `44816330795`, rerun checks after any code changes, and run the repository build; inspect desktop and mobile real match screenshots for input capture, overlap, text legibility, state transitions, scoreboard accuracy, and low-power CSS performance. The connected GitHub file API cannot run a browser and cannot publish the app. GitHub's merge/sync process and Base44 preview have **not** been verified for this change.

Additional gameplay features requested by the owner—four character classes, special resource generation, animation hookups, a timed rotating objective, and escort payload movement—need separate engine/network work and should not be claimed complete based on the HUD presentation.

## Validation update

- The focused workflow `.github/workflows/duelist-liquid-glass-hud.yml` validates the template and result tests, the existing Duelist UI parser, and targeted ESLint. On commit `457cfe1`, both jobs completed successfully (GitHub run `44816330795`).
- The much broader WebGPU and Game3D workflows also trigger on PRs but contain unrelated modules; review their failures independently instead of assuming a HUD regression.
- The host environment could not clone GitHub directly, so no local browser test or full project build was performed in this session.

## Full app build confirmation (code commit `ae09ccd`)

The focused [GitHub Actions run 44816566811](https://github.com/lordemblemblue-cloud/fallen-sky/actions/runs/44816566811) passed all three jobs: `template-and-rules`, `ui-parse`, and `build-app` (runs `npm run build` with installed locked dependencies). This is the latest **code** commit validation. The subsequent handoff text update is documentation only. Still requires runtime desktop/mobile screenshot inspection, live controller testing and deployment/preview verification. Do not merge/deploy automatically.
