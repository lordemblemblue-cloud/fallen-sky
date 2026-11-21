# Duelist Adventure: gameplay HUD templates

Transparent frames for the match HUD (the owner's spec of 2026-11-20). They hold no portraits, names, skills, keys,
numbers or text: the game draws every changing value over them as live UI (`src/components/duelist/client/DuelistHud.jsx`).

- `templates/*.png` (and the same as `.svg`): full 1920 x 1080 RGBA sheets, one per template, each frame where it
  sits on a 16:9 screen:
  - `universal-hud`: portrait and level badge, class symbol, HP and EXP bars (bottom left); special emblem and charge
    meter (bottom centre); four skill slots, three status bars and the weapon plate (bottom right); kill count and
    five kill-feed rows (top right). The same in every mode.
  - `scoreboard-capture-the-flag`, `scoreboard-three-point-control`, `scoreboard-single-control-point`,
    `scoreboard-team-deathmatch`, `scoreboard-duel`: the top-centre scoreboard of each mode.
  - `notification-objective`, `notification-event`: the banners that appear under the scoreboard.
- `parts/*.svg`: each frame on its own, in reference pixels (a 1920 x 1080 screen). These are what the game draws,
  anchored to the screen's corners and scaled with it, so the HUD holds its place on any screen shape.

To change the look, edit `tools/duelist/hud-templates.mjs` and run `node tools/duelist/hud-templates.mjs`, or replace
any file in `parts/` with your own art of the same pixel size (SVG, or a PNG renamed in
`src/components/duelist/client/duelistHud.css`). One frame can be replaced without touching the others.
